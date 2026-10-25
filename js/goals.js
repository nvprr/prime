/* ============================================================
   PRIME LIFE MAXING — goals.js
   "Cele": categories, filter/sort, deadline highlight and an optional
   link to tracker data (weight / savings / workouts). A linked goal
   READS its value from the tracker; the stored `current` is never
   overwritten, so unlinking restores the manual value.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);

  const CATS = [
    { id: 'sylwetka', label: 'Sylwetka' }, { id: 'trening', label: 'Trening' }, { id: 'dieta', label: 'Dieta' },
    { id: 'rutyna', label: 'Rutyna' }, { id: 'finanse', label: 'Finanse' }, { id: 'rozwoj', label: 'Rozwój' }, { id: 'relacje', label: 'Relacje' },
  ];
  const LINKS = [
    { id: '', label: 'Ręcznie' },
    { id: 'weight', label: 'Waga (ostatni pomiar)' },
    { id: 'savings', label: 'Oszczędności (Finanse)' },
    { id: 'workouts', label: 'Liczba treningów w wyzwaniu' },
  ];
  const catLabel = (id) => (CATS.find(c => c.id === id) || {}).label || null;

  let filter = 'all', editingId = null;

  /** Current value of a goal: from the linked source if there is data, else the stored manual value. */
  function valueOf(g) {
    if (g.link === 'weight') {
      const keys = Prime.dayKeys().filter(k => Prime.state.days[k].weight !== null && k <= Prime.today());
      if (keys.length) return Prime.state.days[keys[keys.length - 1]].weight;
    } else if (g.link === 'savings' && Prime.modEnabled('finance')) {
      return Prime.mods.finance.savedTotal();
    } else if (g.link === 'workouts' && Prime.modEnabled('training')) {
      const c = Prime.state.challenge;
      return Prime.mods.workouts.countedSessions().filter(s => s.date >= c.start && s.date <= c.end).length;
    }
    return g.current;
  }

  /** 0..100. Weight goals aimed downwards use the starting value (startValue) if known. */
  function progressPct(g) {
    const cur = valueOf(g), t = g.target;
    if (g.link === 'weight' && typeof g.startValue === 'number' && g.startValue !== t) {
      return Prime.clamp(Math.round(((g.startValue - cur) / (g.startValue - t)) * 100), 0, 100);
    }
    if (!t) return 0;
    return Prime.clamp(Math.round((cur / t) * 100), 0, 100);
  }

  function deadlineInfo(g) {
    if (!g.deadline) return null;
    const left = D.diffDays(Prime.today(), g.deadline);
    if (progressPct(g) >= 100) return { text: `Termin: ${D.shortLabel(g.deadline)}`, cls: '' };
    if (left < 0) return { text: `Po terminie (${-left} dni)`, cls: 'overdue' };
    if (left === 0) return { text: 'Termin: dziś', cls: 'soon' };
    if (left <= 14) return { text: `Za ${left} ${Prime.plural(left, 'dzień', 'dni', 'dni')}`, cls: 'soon' };
    return { text: `Termin: ${D.shortLabel(g.deadline)} (${left} dni)`, cls: '' };
  }

  function sorted(list) {
    const mode = $('goalSort').value;
    const idx = new Map(Prime.state.goals.map((g, i) => [g.id, i]));
    const arr = list.slice();
    if (mode === 'deadline') arr.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || idx.get(a.id) - idx.get(b.id));
    else if (mode === 'progress') arr.sort((a, b) => progressPct(a) - progressPct(b));
    else if (mode === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    return arr;
  }

  function renderFilter() {
    const box = $('goalFilter'); ui.clear(box);
    const used = new Set(Prime.state.goals.map(g => g.category).filter(Boolean));
    const opts = [{ id: 'all', label: 'Wszystkie' }].concat(CATS.filter(c => used.has(c.id)));
    if (!opts.some(o => o.id === filter)) filter = 'all';
    opts.forEach(o => box.appendChild(h('button.chip' + (filter === o.id ? '.active' : ''), { type: 'button', 'aria-pressed': String(filter === o.id), text: o.label, onClick: () => { filter = o.id; render(); } })));
    box.hidden = used.size === 0;
  }

  function render() {
    renderFilter();
    const all = Prime.state.goals;
    const list = $('goalList'); ui.clear(list);
    $('goalsEmpty').hidden = all.length > 0;
    sorted(all.filter(g => filter === 'all' || g.category === filter)).forEach(g => {
      const pct = progressPct(g), dl = deadlineInfo(g), cur = valueOf(g);
      const linked = LINKS.find(l => l.id && l.id === g.link);
      list.appendChild(h('li.goal-item' + (pct >= 100 ? '.done' : '') + (dl && dl.cls ? '.' + dl.cls : ''), { dataset: { id: g.id }, tabindex: '0', role: 'button', 'aria-label': 'Edytuj cel: ' + g.name, onClick: () => openModal(g), onKeydown: (e) => { if (e.key === 'Enter') openModal(g); } },
        h('div.goal-top', null,
          h('div.goal-name', { text: g.name }),
          h('div.goal-pct', { text: pct + '%' })),
        g.desc ? h('div.goal-desc', { text: g.desc }) : null,
        ui.progress(pct, true),
        h('div.goal-meta', null,
          h('span', { text: `${Prime.formatNum(Prime.roundTo(cur, 2))} / ${Prime.formatNum(Prime.roundTo(g.target, 2))} ${g.unit}`.trim() }),
          catLabel(g.category) ? h('span.pill', { text: catLabel(g.category) }) : null,
          linked ? h('span.pill', { text: 'auto' }) : null,
          dl ? h('span.goal-deadline' + (dl.cls ? '.' + dl.cls : ''), { text: dl.text }) : null)));
    });
  }

  /* ---------------- modal ---------------- */

  function fillSelects() {
    const cat = $('goalCategory'); ui.clear(cat);
    cat.appendChild(h('option', { value: '', text: 'Bez kategorii' }));
    CATS.forEach(c => cat.appendChild(h('option', { value: c.id, text: c.label })));
    const link = $('goalLink'); ui.clear(link);
    LINKS.forEach(l => link.appendChild(h('option', { value: l.id, text: l.label })));
  }

  function updateLinkHint() {
    const hint = $('goalLinkHint'), l = $('goalLink').value;
    const msgs = { weight: 'Wartość aktualna będzie brana z ostatniej zapisanej wagi. Wpisana ręcznie wartość zostaje zachowana na wypadek odpięcia.',
      savings: 'Wartość aktualna = suma odłożona w module Finanse (w zł).', workouts: 'Liczone są zapisane treningi w okresie wyzwania.' };
    hint.hidden = !l; hint.textContent = msgs[l] || '';
    $('goalCurrent').disabled = !!l;
  }

  function openModal(g) {
    editingId = g ? g.id : null;
    fillSelects();
    $('goalModalTitle').textContent = g ? 'Edytuj cel' : 'Nowy cel';
    $('goalName').value = g ? g.name : '';
    $('goalDesc').value = g ? g.desc : '';
    $('goalCurrent').value = g ? g.current : '';
    $('goalTarget').value = g ? g.target : '';
    $('goalUnit').value = g ? g.unit : '';
    $('goalDeadline').value = g && g.deadline ? g.deadline : '';
    $('goalCategory').value = g && g.category ? g.category : '';
    $('goalLink').value = g && g.link ? g.link : '';
    $('goalDeleteBtn').hidden = !g;
    updateLinkHint();
    ui.openModal($('goalModal'));
    setTimeout(() => $('goalName').focus({ preventScroll: true }), 60);
  }

  function save() {
    const name = $('goalName').value.trim();
    if (!name) { ui.toast('Podaj nazwę celu'); return; }
    const target = Number($('goalTarget').value);
    if ($('goalTarget').value === '' || isNaN(target)) { ui.toast('Podaj wartość docelową'); return; }
    const link = $('goalLink').value || null;
    const cv = $('goalCurrent').value;
    let g = editingId ? Prime.state.goals.find(x => x.id === editingId) : null;
    if (!g) { g = { id: Prime.uid(), current: 0 }; Prime.state.goals.push(g); }
    g.name = name; g.desc = $('goalDesc').value.trim(); g.target = target; g.unit = $('goalUnit').value.trim();
    g.deadline = $('goalDeadline').value || null;
    g.category = $('goalCategory').value || null;
    if (!link || cv !== '') { const n = Number(cv); if (cv !== '' && !isNaN(n)) g.current = n; }
    if (link === 'weight' && g.link !== 'weight') { const v = valueOf(Object.assign({}, g, { link: 'weight' })); if (typeof v === 'number' && v > 0) g.startValue = v; }
    g.link = link;
    Prime.save(); ui.closeModals(); render(); Prime.refresh();
  }

  async function remove() {
    const g = Prime.state.goals.find(x => x.id === editingId);
    if (!g) return;
    const ok = await ui.confirm({ title: 'Usunąć cel?', text: `„${g.name}” zostanie usunięty.`, okLabel: 'Usuń' });
    if (!ok) return;
    Prime.state.goals = Prime.state.goals.filter(x => x.id !== editingId);
    Prime.save(); ui.closeModals(); render(); Prime.refresh();
  }

  function bind() {
    $('addGoalBtn').addEventListener('click', () => openModal(null));
    $('goalSort').addEventListener('change', render);
    $('goalLink').addEventListener('change', updateLinkHint);
    $('goalSaveBtn').addEventListener('click', save);
    $('goalCancelBtn').addEventListener('click', ui.closeModals);
    $('goalDeleteBtn').addEventListener('click', remove);
  }

  Prime.mods.goals = { render, bind, progressPct, valueOf, openModal, CATS };
})();
