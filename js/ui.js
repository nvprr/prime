/* ============================================================
   PRIME LIFE MAXING — ui.js
   Shared UI building blocks: safe DOM builder, icons, toast, modals,
   confirm dialog, full-screen panels, small form/layout helpers.
   Nothing here interpolates user text into HTML — everything goes
   through textContent / setAttribute.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime;
  const NS = 'http://www.w3.org/2000/svg';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** h('div.card.big', {text, dataset:{id}, onClick}, child, [children], 'text') */
  function h(tagSpec, props, ...kids) {
    const parts = String(tagSpec).split('.');
    const el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.length > 2 && k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'required') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else if (k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  function icon(name, cls) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---------------- toast ---------------- */

  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2000);
  }

  /* ---------------- modals ---------------- */

  const backdrop = $('#modalBackdrop');
  let lastFocus = null;
  let onCloseHook = null;

  function openModal(modalEl) {
    $$('.modal', backdrop).forEach(m => { m.hidden = true; });
    if (backdrop.hidden) lastFocus = document.activeElement;
    modalEl.hidden = false;
    backdrop.hidden = false;
    modalEl.scrollTop = 0;
  }

  function closeModals() {
    const hook = onCloseHook; onCloseHook = null;
    backdrop.hidden = true;
    $$('.modal', backdrop).forEach(m => { m.hidden = true; });
    if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    lastFocus = null;
    if (hook) hook();
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModals(); });

  /**
   * Dynamic bottom sheet. opts: { title, sub, body: Node|Node[], actions:[{label, kind, onClick, keepOpen}], onClose }
   * Returns { el, close, body }.
   */
  function sheet(opts) {
    const el = $('#dynModal');
    clear(el);
    const body = h('div.sheet-body');
    append(body, [opts.body]);
    append(el, [
      h('div.modal-handle'),
      h('h3.modal-title', { text: opts.title || '' }),
      opts.sub ? h('p.modal-sub', { text: opts.sub }) : null,
      body,
      opts.actions && opts.actions.length ? h('div.modal-actions', null, opts.actions.map(a => h('button.btn' + (a.kind ? '.' + a.kind : '.ghost'), {
        type: 'button', text: a.label,
        onClick: (ev) => { const r = a.onClick ? a.onClick(ev) : undefined; if (!a.keepOpen && r !== false) closeModals(); },
      }))) : null,
    ]);
    onCloseHook = opts.onClose || null;
    openModal(el);
    const first = $('input:not([type=hidden]):not([type=checkbox]), textarea, select', el);
    if (first && opts.focus !== false) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
    return { el, close: closeModals, body };
  }

  /* ---------------- confirm (stacked above everything) ---------------- */

  const confirmBackdrop = $('#confirmBackdrop');
  let confirmResolve = null;

  function settleConfirm(val) {
    confirmBackdrop.hidden = true;
    const r = confirmResolve; confirmResolve = null;
    if (r) r(val);
  }

  /** Promise<boolean>. */
  function confirmDialog(opts) {
    if (confirmResolve) settleConfirm(false);
    $('#confirmTitle').textContent = opts.title || 'Na pewno?';
    $('#confirmText').textContent = opts.text || '';
    const okBtn = $('#confirmOkBtn');
    okBtn.textContent = opts.okLabel || 'Potwierdź';
    okBtn.className = 'btn ' + (opts.danger === false ? 'primary' : 'danger');
    $('#confirmCancelBtn').textContent = opts.cancelLabel || 'Anuluj';
    const extra = $('#confirmExtra');
    clear(extra);
    if (opts.extra) append(extra, [opts.extra]);
    confirmBackdrop.hidden = false;
    setTimeout(() => { try { $('#confirmCancelBtn').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    return new Promise((resolve) => { confirmResolve = resolve; });
  }

  $('#confirmOkBtn').addEventListener('click', () => settleConfirm(true));
  $('#confirmCancelBtn').addEventListener('click', () => settleConfirm(false));
  confirmBackdrop.addEventListener('click', (e) => { if (e.target === confirmBackdrop) settleConfirm(false); });

  /** Small text prompt built on sheet(). Promise<string|null>. */
  function promptText(opts) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const input = h('input.modal-input', { type: 'text', value: opts.value || '', placeholder: opts.placeholder || '', maxlength: opts.maxlength || 80 });
      sheet({
        title: opts.title, sub: opts.sub,
        body: h('label.modal-label', null, opts.label || '', input),
        actions: [
          { label: 'Anuluj', kind: 'ghost', onClick: () => { done(null); } },
          { label: opts.okLabel || 'Zapisz', kind: 'primary', onClick: () => { const v = input.value.trim(); if (!v) { toast('Wpisz wartość'); return false; } done(v); } },
        ],
        onClose: () => done(null),
      });
    });
  }

  /* ---------------- full-screen panels ---------------- */

  const panelLayer = $('#panelLayer');
  let currentPanel = null;

  function closePanel() {
    if (!currentPanel) return;
    const p = currentPanel; currentPanel = null;
    clear(panelLayer);
    panelLayer.hidden = true;
    document.body.classList.remove('panel-open');
    if (p.onClose) p.onClose();
    Prime.refresh();
  }

  /** opts: { title, render(body, api), actions?: Node[] , onClose? } → api {rerender, setTitle, close, body} */
  function openPanel(opts) {
    if (currentPanel) { const old = currentPanel; currentPanel = null; clear(panelLayer); if (old.onClose) old.onClose(); }
    const body = h('div.panel-body.scroll-area');
    const titleEl = h('h1.panel-title', { text: opts.title });
    const head = h('header.panel-head', null,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Wróć', onClick: closePanel }, icon('chevron-left')),
      titleEl,
      h('div.panel-actions', null, opts.actions || []));
    const el = h('section.panel', { role: 'dialog', 'aria-label': opts.title }, head, body);
    clear(panelLayer); panelLayer.appendChild(el); panelLayer.hidden = false;
    document.body.classList.add('panel-open');
    const api = {
      body, el,
      setTitle: (t) => { titleEl.textContent = t; },
      close: closePanel,
      rerender() {
        const top = body.scrollTop;
        clear(body);
        opts.render(body, api);
        body.scrollTop = top;
      },
    };
    currentPanel = { api, onClose: opts.onClose, id: opts.id };
    opts.render(body, api);
    return api;
  }

  function rerenderPanel() { if (currentPanel) currentPanel.api.rerender(); }
  function panelOpen() { return !!currentPanel; }
  function currentPanelId() { return currentPanel ? currentPanel.id : null; }

  /* ---------------- keyboard + keys ---------------- */

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!confirmBackdrop.hidden) { settleConfirm(false); return; }
    if (!backdrop.hidden) { closeModals(); return; }
    if (currentPanel) closePanel();
  });

  // keep sheets above the on-screen keyboard (iOS keeps the layout viewport fixed)
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const upd = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', kb + 'px');
    };
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
  }
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.closest('.modal, .panel')) {
      setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ignore */ } }, 320);
    }
  });

  /* ---------------- form / layout helpers ---------------- */

  function field(label, input, hint) {
    return h('label.modal-label', null, label, input, hint ? h('span.field-hint', { text: hint }) : null);
  }

  function input(opts) {
    const o = Object.assign({ type: 'text', class: 'modal-input' }, opts);
    if (o.onInput) { o.onInput = o.onInput; }
    return h('input', o);
  }

  function select(options, value, props) {
    const el = h('select.modal-input', props || null,
      options.map(o => h('option', { value: o.value, text: o.label, selected: o.value === value })));
    el.value = value;
    return el;
  }

  /** Segmented control. options: [{value,label}] */
  function seg(options, value, onChange) {
    const wrap = h('div.seg', { role: 'group' });
    const btns = options.map(o => {
      const b = h('button.seg-btn', { type: 'button', text: o.label, 'aria-pressed': String(o.value === value), onClick: () => {
        btns.forEach(x => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onChange(o.value);
      } });
      return b;
    });
    append(wrap, btns);
    return wrap;
  }

  /** Single-choice chips; returns {el, get, set}. */
  function chipsSingle(options, value, onChange, allowNone) {
    let cur = value;
    const wrap = h('div.chip-row');
    const draw = () => {
      clear(wrap);
      options.forEach(o => wrap.appendChild(h('button.chip' + (o.value === cur ? '.active' : ''), {
        type: 'button', 'aria-pressed': String(o.value === cur),
        onClick: () => { cur = (allowNone && cur === o.value) ? null : o.value; draw(); if (onChange) onChange(cur); },
      }, o.icon ? icon(o.icon) : null, o.label)));
    };
    draw();
    return { el: wrap, get: () => cur, set: (v) => { cur = v; draw(); } };
  }

  function progress(pct, thin, tone) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return h('div.progress-track' + (thin ? '.thin' : ''), { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p)) },
      h('div.progress-fill' + (tone ? '.' + tone : ''), { style: { width: p + '%' } }));
  }

  function emptyState(text, sub, small) {
    return h('div.empty-state' + (small ? '.small' : ''), null, h('p', { text }), sub ? h('p.empty-sub', { text: sub }) : null);
  }

  function statBox(value, label, delta, onClick) {
    return h('div.stat-box' + (onClick ? '.clickable' : ''), onClick ? { role: 'button', tabindex: '0', onClick } : null,
      h('div.stat-box-value', { text: String(value) }),
      h('div.stat-box-label', { text: label }),
      delta ? h('div.stat-box-delta', { text: delta }) : null);
  }

  /** Tappable checkbox row (habits, care routine, project tasks …). */
  function checkRow(done, label, sub, onToggle, extra) {
    const btn = h('button.check-row-btn' + (done ? '.done' : ''), { type: 'button', role: 'checkbox', 'aria-checked': String(!!done), onClick: onToggle },
      h('span.check-box', null, icon('check')),
      h('span.check-text', null, h('span.check-label', { text: label }), sub ? h('span.check-sub', { text: sub }) : null));
    return h('div.check-line', null, btn, extra || null);
  }

  function sectionHead(title, ...right) {
    return h('div.section-head', null, h('h2', { text: title }), right.length ? h('div.section-right', null, right) : null);
  }

  /** Download a text/Blob as a file. */
  function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  Prime.ui = {
    $, $$, h, append, clear, icon, toast, openModal, closeModals, sheet, confirm: confirmDialog, promptText,
    openPanel, closePanel, rerenderPanel, panelOpen, currentPanelId,
    field, input, select, seg, chipsSingle, progress, emptyState, statBox, sectionHead, checkRow, download,
    updateBanner: function () {}, // replaced by app.js
  };
})();
