/* ============================================================
   PRIME LIFE MAXING — app.js
   Start-up, navigation, global refresh, data-safety banners,
   midnight rollover and the service-worker update flow.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);

  /* ---------------- storage banner (recovery / read-only / save problems) ---------------- */

  function btn(label, fn, kind) { return h('button.btn.small' + (kind ? '.' + kind : ''), { type: 'button', text: label, onClick: fn }); }

  function retryLoad() {
    Prime.initState();
    Prime.date = Prime.today();
    boot2();
    ui.updateBanner();
    Prime.refresh();
    if (!Prime.locked) ui.toast('Dane wczytane');
  }

  async function startFresh() {
    const ok = await ui.confirm({
      title: 'Zacząć od pustej aplikacji?',
      text: 'Uszkodzone dane zostaną najpierw zapisane jako osobna kopia w tej przeglądarce (możesz też pobrać je do pliku). Jeśli kopia się nie uda, nic nie zostanie zmienione.',
      okLabel: 'Zacznij od nowa',
    });
    if (!ok) return;
    const r = Prime.ST.startFreshAfterCorrupt(Prime.ls, Prime.startup.raw);
    if (!r.ok) { ui.toast('Nie udało się zrobić kopii — nic nie zmieniono'); return; }
    retryLoad();
  }

  function updateStorageBanner() {
    const el = $('storageBanner'); ui.clear(el);
    const st = Prime.startup, info = st.info || {};
    const parts = [];
    const dl = () => ui.download('prime-surowe-dane.json', st.raw || '', 'text/plain');
    if (st.status === 'corrupt') {
      parts.push(h('strong', { text: 'Dane są nieczytelne — aplikacja działa tylko do odczytu.' }));
      parts.push(h('span', { text: ' Nic nie zostało nadpisane. Pobierz surową kopię i dopiero potem zdecyduj, co dalej.' }));
      parts.push(h('div.banner-actions', null, btn('Pobierz surowe dane', dl, 'primary'), btn('Spróbuj ponownie', retryLoad), btn('Zacznij od nowa…', startFresh, 'danger')));
    } else if (Prime.locked) {
      const why = info.reason === 'newer-version' ? `Dane pochodzą z nowszej wersji aplikacji (v${info.version}).`
        : info.reason === 'backup-failed' ? 'Nie udało się zapisać kopii bezpieczeństwa przed aktualizacją danych (brak miejsca?).'
        : info.reason === 'save-failed' ? 'Nie udało się zapisać zaktualizowanych danych.'
        : info.reason === 'verify-failed' ? 'Weryfikacja zaktualizowanych danych nie przeszła.'
        : info.reason === 'storage-unavailable' ? 'Pamięć przeglądarki jest niedostępna.'
        : 'Aplikacja jest w trybie tylko do odczytu.';
      parts.push(h('strong', { text: 'Tryb tylko do odczytu. ' }));
      parts.push(h('span', { text: why + ' Twoje oryginalne dane nie zostały zmienione.' }));
      const acts = [];
      if (st.raw) acts.push(btn('Pobierz kopię danych', dl, 'primary'));
      acts.push(btn('Spróbuj ponownie', retryLoad));
      parts.push(h('div.banner-actions', null, acts));
    } else if (Prime.storageIssue === 'quota' || Prime.storageIssue === 'write') {
      parts.push(h('strong', { text: Prime.storageIssue === 'quota' ? 'Brak miejsca w pamięci przeglądarki — zmiany mogą się nie zapisywać.' : 'Nie udało się zapisać danych.' }));
      parts.push(h('div.banner-actions', null, btn('Wyeksportuj dane', () => Prime.mods.settings.exportData(), 'primary'), btn('Spróbuj zapisać', () => { if (Prime.save()) ui.toast('Zapisano'); })));
    } else if (Prime.volatile) {
      parts.push(h('strong', { text: 'Pamięć przeglądarki jest zablokowana.' }));
      parts.push(h('span', { text: ' Dane zostaną utracone po zamknięciu karty. Wyeksportuj je przed wyjściem.' }));
      parts.push(h('div.banner-actions', null, btn('Wyeksportuj dane', () => Prime.mods.settings.exportData(), 'primary')));
    }
    el.hidden = parts.length === 0;
    parts.forEach(p => el.appendChild(p));
  }
  ui.updateBanner = updateStorageBanner;

  /* ---------------- navigation / refresh ---------------- */

  const RENDER = {
    today: () => Prime.mods.today.render(),
    goals: () => Prime.mods.goals.render(),
    life: () => Prime.mods.life.render(),
    stats: () => Prime.mods.stats.render(),
    settings: () => Prime.mods.settings.render(),
  };

  function renderCurrent() {
    try { RENDER[Prime.view](); } catch (e) { console.error(e); ui.toast('Błąd wyświetlania: ' + (e.message || e)); }
    if (ui.panelOpen()) { try { ui.rerenderPanel(); } catch (e) { console.error(e); } }
  }

  Prime.refresh = renderCurrent;

  Prime.showView = function (name) {
    if (!RENDER[name]) return;
    ui.closePanel(); ui.closeModals();
    Prime.view = name;
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll('.nav-btn').forEach(b => {
      const on = b.dataset.target === name;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const sc = document.querySelector(`#view-${name} .scroll-area`);
    if (sc) sc.scrollTop = 0;
    renderCurrent();
  };

  /* ---------------- appearance ---------------- */

  function applyAppearance() {
    document.documentElement.dataset.accent = Prime.state.settings.accent || 'lime';
  }

  /* ---------------- midnight rollover ---------------- */

  let lastToday = Prime.today();
  function isEditing() {
    const a = document.activeElement;
    return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }
  function checkDayChange() {
    const t = Prime.today();
    if (t === lastToday) return;
    if (isEditing()) return; // retried on the next tick; never re-render while typing
    const followed = Prime.date === lastToday;
    lastToday = t;
    if (followed) Prime.date = t;
    renderCurrent();
  }

  /* ---------------- service worker ---------------- */

  let swReg = null, userRequestedUpdate = false;

  function showUpdateBanner(worker) {
    const el = $('updateBanner'); ui.clear(el);
    el.appendChild(h('span', { text: 'Dostępna jest nowa wersja aplikacji.' }));
    el.appendChild(h('div.banner-actions', null,
      btn('Aktualizuj', () => {
        Prime.flush();
        if (isEditing() && !confirmLeave()) return;
        userRequestedUpdate = true;
        if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
      }, 'primary'),
      btn('Później', () => { el.hidden = true; })));
    el.hidden = false;
  }
  function confirmLeave() { return true; } // data is saved on every change/blur; Prime.flush() above saves pending edits

  function setupSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
        });
      });
    }).catch((e) => { console.warn('SW registration failed', e); });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Only reload when the user asked for the update — never while they are typing unprompted.
      if (userRequestedUpdate) { userRequestedUpdate = false; window.location.reload(); }
    });
  }

  Prime.checkUpdate = function (manual) {
    if (!swReg) { if (manual) ui.toast('Aktualizacje są niedostępne (brak service workera)'); return; }
    swReg.update().then(() => {
      if (swReg.waiting) showUpdateBanner(swReg.waiting);
      else if (manual) ui.toast('Masz najnowszą wersję (sprawdzone na serwerze)');
    }).catch(() => { if (manual) ui.toast('Nie udało się sprawdzić — brak połączenia?'); });
  };

  /* ---------------- start ---------------- */

  function hideBoot() {
    const b = $('boot');
    b.classList.add('done'); b.hidden = true;
  }

  function boot2() {
    applyAppearance();
    lastToday = Prime.today();
  }

  function start() {
    Prime.initState();
    boot2();
    ['today', 'goals', 'stats', 'settings'].forEach(k => Prime.mods[k].bind());
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => Prime.showView(b.dataset.target)));
    updateStorageBanner();
    Prime.showView('today');
    hideBoot();

    const st = Prime.startup;
    if (st.status === 'migrated') ui.toast('Dane zaktualizowane do nowej wersji. Kopia sprzed zmian zapisana w tej przeglądarce.', 6000);
    else if (st.status === 'recovered') ui.toast('Dane połączono po powrocie ze starszej wersji. Kopia zapisana.', 6000);

    setInterval(checkDayChange, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDayChange(); });
    window.addEventListener('focus', checkDayChange);
    window.addEventListener('resize', () => { if (Prime.view === 'stats' && !isEditing()) Prime.mods.stats.render(); });

    setupSW();
  }

  try { start(); } catch (e) {
    console.error(e);
    window.__primeBootFailed = true;
    const msg = $('bootMsg');
    if (msg) msg.textContent = 'Nie udało się uruchomić aplikacji: ' + (e.message || e) + '. Twoje dane nie zostały zmienione.';
    const sp = document.querySelector('#boot .boot-spinner'); if (sp) sp.style.display = 'none';
  }
})();
