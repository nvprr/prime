/* ============================================================
   PRIME LIFE MAXING — settings.js
   Daily goals, modules, challenge, routines, XP/training prefs,
   templates, repeating tasks and — most importantly — the data safety
   tools: export, import (validate → preview → backup → confirm),
   browser backups and reset (export offer + typed confirmation).
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);
  const S = () => Prime.state.settings;

  const MODULES = [
    ['training', 'Dziennik treningowy', 'plany, ćwiczenia, serie, rekordy'],
    ['nutrition', 'Jedzenie i makro', 'posiłki, ulubione, tłuszcze i węglowodany'],
    ['habits', 'Nawyki', 'dowolna częstotliwość, tygodniowy %'],
    ['care', 'Pielęgnacja', 'rutyna poranna, wieczorna i okresowa'],
    ['growth', 'Rozwój osobisty', 'projekty i sesje nauki'],
    ['finance', 'Finanse (lokalnie)', 'wydatki, oszczędności — tylko na tym urządzeniu'],
    ['social', 'Relacje', 'kontakty, przypomnienia, wydarzenia'],
    ['photos', 'Zdjęcia sylwetki', 'opcjonalne, zapisywane tylko w tej przeglądarce'],
    ['xp', 'Poziomy i odznaki', 'punkty z Twoich wpisów, bez kar'],
  ];

  const fail = (msg) => ui.toast(msg);
  const saveAndRefresh = () => { if (Prime.save()) Prime.refresh(); };

  /* ---------------- numeric goals ---------------- */

  function bindNumber(id, key, min, max, dec) {
    const el = $(id);
    el.addEventListener('change', () => {
      const v = Number(el.value);
      if (el.value === '' || isNaN(v)) { el.value = S()[key]; return; }
      S()[key] = Prime.roundTo(Prime.clamp(v, min, max), dec || 0);
      el.value = S()[key];
      saveAndRefresh();
    });
  }

  /* ---------------- sections ---------------- */

  function renderChallenge() {
    const root = $('settingsChallenge'); ui.clear(root);
    const c = Prime.state.challenge;
    const name = ui.input({ value: S().name, maxlength: '40', placeholder: 'Jak się do Ciebie zwracać?', 'aria-label': 'Imię' });
    name.addEventListener('change', () => { S().name = name.value.trim(); saveAndRefresh(); });
    const cname = ui.input({ value: c.name, maxlength: '80', 'aria-label': 'Nazwa wyzwania' });
    const start = ui.input({ type: 'date', value: c.start, 'aria-label': 'Start wyzwania' });
    const end = ui.input({ type: 'date', value: c.end, 'aria-label': 'Koniec wyzwania' });
    const goal = ui.input({ value: c.goal, maxlength: '300', placeholder: 'Główny cel wyzwania (opcjonalnie)', 'aria-label': 'Cel wyzwania' });
    const commit = () => {
      if (!D.isDateStr(start.value) || !D.isDateStr(end.value) || end.value < start.value) { fail('Koniec musi być po starcie'); start.value = c.start; end.value = c.end; return; }
      c.name = cname.value.trim() || c.name; c.start = start.value; c.end = end.value; c.goal = goal.value.trim();
      saveAndRefresh();
    };
    [cname, start, end, goal].forEach(el => el.addEventListener('change', commit));
    root.appendChild(ui.field('Twoje imię', name));
    root.appendChild(ui.field('Nazwa wyzwania', cname));
    root.appendChild(h('div.modal-row-2', null, ui.field('Start', start), ui.field('Koniec', end)));
    root.appendChild(ui.field('Cel wyzwania', goal));
  }

  function renderModules() {
    const root = $('settingsModules'); ui.clear(root);
    MODULES.forEach(([id, label, sub]) => {
      const cb = h('input', { type: 'checkbox', checked: !!S().modules[id], 'aria-label': label });
      cb.addEventListener('change', () => {
        S().modules[id] = cb.checked;
        if (id === 'xp' && cb.checked && !Prime.state.xp.startDate) Prime.state.xp.startDate = Prime.today();
        saveAndRefresh(); renderAll();
      });
      root.appendChild(h('label.settings-row.toggle', null, h('span.settings-row-text', null, h('span', { text: label }), h('small', { text: sub })), cb));
    });
    const fc = h('input', { type: 'checkbox', checked: !!S().ui.focus, 'aria-label': 'Tryb skupienia' });
    fc.addEventListener('change', () => { S().ui.focus = fc.checked; saveAndRefresh(); });
    root.appendChild(h('label.settings-row.toggle', null, h('span.settings-row-text', null, h('span', { text: 'Tryb skupienia' }), h('small', { text: 'Dzisiaj tylko: Big 3, plan i wynik. Reszta pod „+” i w Życiu.' })), fc));
    root.appendChild(h('p.hint', { text: 'Wyłączenie modułu tylko go ukrywa — dane zostają nietknięte i wrócą po ponownym włączeniu.' }));
  }

  function renderRoutines() {
    const root = $('settingsRoutines'); ui.clear(root);
    const M = Prime.mods;
    if (Prime.modEnabled('habits')) root.appendChild(h('button.settings-action', { type: 'button', onClick: () => M.habits.openManager() }, `Nawyki (${Prime.state.habits.filter(x => !x.archived).length} aktywnych)`));
    if (Prime.modEnabled('care')) root.appendChild(h('button.settings-action', { type: 'button', onClick: () => M.habits.openCareEditor() }, 'Rutyna pielęgnacyjna'));
    if (!root.children.length) root.appendChild(h('p.hint', { text: 'Włącz moduł Nawyki lub Pielęgnacja, aby je tu edytować.' }));
  }

  function renderTrainingXp() {
    const root = $('settingsTrainingXp'); ui.clear(root);
    const wk = ui.input({ type: 'number', value: String(S().weeklyWorkouts), min: '0', max: '14', 'aria-label': 'Treningi w tygodniu' });
    wk.addEventListener('change', () => { const v = Number(wk.value); if (!isNaN(v)) { S().weeklyWorkouts = Prime.clamp(Math.round(v), 0, 14); wk.value = S().weeklyWorkouts; saveAndRefresh(); } });
    root.appendChild(h('label.settings-row', null, h('span', { text: 'Planowane treningi / tydz.' }), wk));
    const mode = ui.select([
      { value: 'off', label: 'Nie dotykaj zadań' },
      { value: 'mark', label: 'Odhacz istniejące zadanie „trening”' },
      { value: 'create', label: 'Utwórz i odhacz zadanie' },
    ], S().workoutTaskMode);
    mode.addEventListener('change', () => { S().workoutTaskMode = mode.value; saveAndRefresh(); });
    root.appendChild(h('label.settings-row.stack', null, h('span', { text: 'Po zapisaniu treningu' }), mode));
    if (Prime.modEnabled('xp')) {
      root.appendChild(h('p.hint', { text: `Punkty XP liczone są od ${D.formatFullDate(Prime.state.xp.startDate)} (dzień uruchomienia nowej wersji). Dni wolne i choroba nie odejmują punktów.` }));
      root.appendChild(h('button.settings-action', { type: 'button', onClick: () => Prime.mods.xp.openPanel() }, 'Poziom i odznaki'));
    }
  }

  function renderTemplates() {
    const list = $('templateSettingsList'); ui.clear(list);
    if (!Prime.state.templates.length) list.appendChild(h('li.hint', { text: 'Brak szablonów.' }));
    Prime.state.templates.forEach(tpl => list.appendChild(h('li.template-item', null,
      h('div', null, h('div.template-name', { text: tpl.name }), h('div.template-count', { text: `${tpl.tasks.length} zadań` })),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Usuń szablon ' + tpl.name, onClick: async () => {
        if (!await ui.confirm({ title: 'Usunąć szablon?', text: `„${tpl.name}” zostanie usunięty (zadania w dniach zostają).`, okLabel: 'Usuń' })) return;
        Prime.state.templates = Prime.state.templates.filter(t => t.id !== tpl.id); saveAndRefresh(); renderTemplates();
      } }, ui.icon('trash')))));
    // repeating tasks
    const mount = $('recurringMount'); ui.clear(mount);
    if (Prime.state.recurring.length) {
      mount.appendChild(ui.sectionHead('Zadania powtarzalne'));
      const FREQ = { daily: 'codziennie', weekdays: 'dni robocze', weekly: 'co tydzień' };
      const ul = h('ul.template-list');
      Prime.state.recurring.forEach(r => ul.appendChild(h('li.template-item', null,
        h('div', null, h('div.template-name', { text: r.name }), h('div.template-count', { text: `${FREQ[r.freq] || r.freq}${r.time ? ' · ' + r.time : ''} · od ${D.shortLabel(r.startDate)}` })),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Zatrzymaj powtarzanie ' + r.name, onClick: async () => {
          if (!await ui.confirm({ title: 'Zatrzymać powtarzanie?', text: `„${r.name}” nie będzie już dodawane na nowe dni. Zadania, które już powstały, zostają.`, okLabel: 'Zatrzymaj' })) return;
          Prime.state.recurring = Prime.state.recurring.filter(x => x.id !== r.id); saveAndRefresh(); renderTemplates();
        } }, ui.icon('trash')))));
      mount.appendChild(ul);
    }
  }

  function bindTemplates() {
    $('addTemplateBtn').addEventListener('click', () => {
      const day = Prime.day(Prime.date);
      if (!day.tasks.length) { fail('Najpierw dodaj zadania do wybranego dnia — z nich powstanie szablon'); return; }
      $('newTemplateName').value = '';
      ui.openModal($('newTemplateModal'));
    });
    $('newTemplateCancelBtn').addEventListener('click', ui.closeModals);
    $('newTemplateSaveBtn').addEventListener('click', () => {
      const name = $('newTemplateName').value.trim();
      if (!name) { fail('Podaj nazwę szablonu'); return; }
      const day = Prime.day(Prime.date);
      Prime.state.templates.push({ id: Prime.uid(), name, tasks: day.tasks.map(t => ({ name: t.name, category: t.category || null })) });
      Prime.save(); ui.closeModals(); renderTemplates();
    });
  }

  /* ---------------- data safety: export / import / backups / reset ---------------- */

  function exportData() {
    try {
      const text = Prime.ST.exportText(Prime.state);
      ui.download(`prime-life-maxing-${Prime.today()}.json`, text, 'application/json');
      Prime.state.settings.ui.lastExport = Prime.today(); Prime.save();
      ui.toast('Wyeksportowano dane');
      return true;
    } catch (e) { fail('Eksport nie powiódł się'); return false; }
  }

  function countsTable(a, b) {
    const rows = [['days', 'Dni z wpisami'], ['tasks', 'Zadania'], ['goals', 'Cele'], ['templates', 'Szablony'], ['workouts', 'Treningi'], ['habits', 'Nawyki'], ['transactions', 'Transakcje']];
    const box = h('div.card.wk-table');
    box.appendChild(h('div.wk-row.head', null, h('span', { text: '' }), h('span', { text: 'Teraz' }), h('span', { text: 'Po zaimportowaniu' }), h('span', { text: '' })));
    rows.forEach(([k, label]) => box.appendChild(h('div.wk-row', null, h('span', { text: label }), h('span.muted', { text: String(a[k]) }), h('span', { text: String(b[k]) }), h('span'))));
    return box;
  }

  /** Shared by file import and backup restore. `source` is only used in the wording. */
  function previewImport(text, source) {
    const res = Prime.ST.parseImport(text);
    if (!res.ok) { ui.sheet({ title: 'Nie można zaimportować', sub: res.error, body: h('p.hint', { text: 'Twoje obecne dane nie zostały zmienione.' }), actions: [{ label: 'Zamknij', kind: 'primary' }], focus: false }); return; }
    const cur = Prime.ST.countThings(Prime.state);
    const body = h('div', null,
      h('p', { text: `Import zastąpi wszystkie bieżące dane danymi z: ${source}. Przed zapisem aplikacja zrobi kopię obecnych danych w tej przeglądarce — jeśli się nie uda, import zostanie przerwany.` }),
      countsTable(cur, res.summary),
      res.fromVersion < 2 ? h('p.hint', { text: 'To plik ze starszej wersji (v1) — zostanie bezpiecznie przekonwertowany.' }) : null,
      res.unknownKeys.length ? h('p.hint', { text: `Nieznane pola (${res.unknownKeys.join(', ')}) zostaną zachowane.` }) : null,
      res.report && res.report.dropped && res.report.dropped.length ? h('p.hint', { text: 'Część nieprawidłowych wpisów została pominięta przy walidacji.' }) : null,
      Prime.locked ? h('p.hint', { text: 'Aplikacja jest w trybie tylko do odczytu — import jest niedostępny.' }) : null);
    ui.sheet({
      title: 'Importować dane?', body,
      actions: [
        { label: 'Anuluj', kind: 'ghost' },
        Prime.locked ? null : { label: 'Zastąp moje dane', kind: 'danger', onClick: () => { applyImport(res.state); } },
      ].filter(Boolean),
      focus: false,
    });
  }

  function applyImport(state) {
    const r = Prime.ST.applyImport(Prime.ls, null, state);
    if (!r.ok) {
      ui.sheet({ title: 'Import przerwany', sub: r.error === 'backup' ? 'Nie udało się zrobić kopii obecnych danych (brak miejsca w przeglądarce?).' : 'Nie udało się zapisać danych.', body: h('p.hint', { text: 'Twoje dane zostały bez zmian. Wyeksportuj je do pliku i zwolnij miejsce, potem spróbuj ponownie.' }), actions: [{ label: 'Eksportuj teraz', kind: 'primary', onClick: () => { exportData(); return false; } }, { label: 'Zamknij', kind: 'ghost' }], focus: false });
      return;
    }
    Prime.initState();
    Prime.date = Prime.today();
    renderAll(); Prime.refresh();
    ui.toast('Zaimportowano dane. Poprzednia wersja jest w kopiach bezpieczeństwa.');
  }

  function bindImport() {
    $('importBtn').addEventListener('click', () => { $('importFile').value = ''; $('importFile').click(); });
    $('importFile').addEventListener('change', () => {
      const f = $('importFile').files && $('importFile').files[0];
      if (!f) return;
      if (f.size > Prime.ST.MAX_IMPORT_CHARS) { ui.sheet({ title: 'Nie można zaimportować', sub: 'Plik jest za duży (limit 8 MB).', body: h('p.hint', { text: 'Twoje obecne dane nie zostały zmienione.' }), actions: [{ label: 'Zamknij', kind: 'primary' }], focus: false }); return; }
      const rd = new FileReader();
      rd.onload = () => previewImport(String(rd.result || ''), f.name);
      rd.onerror = () => fail('Nie udało się odczytać pliku');
      rd.readAsText(f);
    });
  }

  function openBackups() {
    const list = Prime.ST.listBackups(Prime.ls).slice().reverse();
    const REASON = { premigration: 'przed migracją', import: 'przed importem', reset: 'przed resetem', corrupt: 'uszkodzone dane', recovery: 'odzyskiwanie' };
    const body = h('div');
    if (!list.length) body.appendChild(ui.emptyState('Brak kopii.', 'Kopie powstają automatycznie przed migracją, importem i resetem.', true));
    list.forEach(b => {
      const when = b.ts ? new Date(b.ts).toLocaleString('pl-PL') : '';
      body.appendChild(h('div.card.backup-item', null,
        h('div.li-title', { text: REASON[b.reason] || b.reason }),
        h('div.li-sub', { text: `${when} · ${Math.round((b.chars || 0) / 1024)} KB` }),
        h('div.row-actions', null,
          h('button.btn.small', { type: 'button', text: 'Pobierz', onClick: () => { const raw = Prime.ST.readBackup(Prime.ls, b.key); if (raw) ui.download(`prime-kopia-${b.reason}-${(b.ts || '').slice(0, 10)}.json`, raw, 'application/json'); else fail('Kopia jest niedostępna'); } }),
          h('button.btn.small', { type: 'button', text: 'Przywróć…', onClick: () => { const raw = Prime.ST.readBackup(Prime.ls, b.key); if (!raw) { fail('Kopia jest niedostępna'); return; } previewImport(raw, `kopii (${REASON[b.reason] || b.reason}, ${when})`); } }),
          h('button.btn.small.ghost', { type: 'button', text: 'Usuń', onClick: async () => { if (await ui.confirm({ title: 'Usunąć kopię?', text: 'Tej operacji nie można cofnąć.', okLabel: 'Usuń' })) { Prime.ST.deleteBackup(Prime.ls, b.key); openBackups(); } } }))));
    });
    ui.sheet({ title: 'Kopie bezpieczeństwa', sub: 'Surowe kopie danych zapisane w tej przeglądarce. Nie zastępują eksportu do pliku.', body, actions: [{ label: 'Zamknij', kind: 'primary' }], focus: false });
  }

  function openReset() {
    const input = ui.input({ placeholder: 'Wpisz RESETUJ', 'aria-label': 'Potwierdzenie resetu', autocapitalize: 'characters' });
    const body = h('div', null,
      h('p', { text: 'Wszystkie dane (dni, zadania, cele, treningi, finanse…) zostaną usunięte z tej przeglądarki. Przed resetem powstanie kopia bezpieczeństwa, ale najpewniej najpierw wyeksportuj dane do pliku.' }),
      h('button.btn.block', { type: 'button', text: 'Eksportuj dane do pliku', onClick: exportData }),
      h('label.modal-label', null, 'Aby potwierdzić, wpisz RESETUJ', input));
    ui.sheet({
      title: 'Zresetować wszystkie dane?', body,
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Resetuj', kind: 'danger', onClick: () => {
        if (input.value.trim().toUpperCase() !== 'RESETUJ') { fail('Wpisz RESETUJ, aby potwierdzić'); return false; }
        const r = Prime.ST.resetAll(Prime.ls);
        if (!r.ok) { fail(r.error === 'backup' ? 'Reset przerwany — nie udało się zrobić kopii' : 'Reset nie powiódł się'); return false; }
        Prime.initState(); Prime.date = Prime.today(); renderAll(); Prime.refresh();
        ui.toast('Dane zresetowane. Kopia jest w Kopiach bezpieczeństwa.');
      } }],
    });
  }

  async function renderStorageLine() {
    const chars = Prime.ST.usage(Prime.ls);
    const c = Prime.ST.countThings(Prime.state);
    let txt = `${c.days} dni z wpisami · ${c.tasks} zadań · zajęte ok. ${Math.round(chars / 1024)} KB z ~5 MB w przeglądarce`;
    if (Prime.volatile) txt += ' · UWAGA: pamięć przeglądarki jest zablokowana, dane giną po zamknięciu karty';
    $('storageLine').textContent = txt;
  }

  async function renderPhotosButton() {
    const btn = $('photosManageBtn');
    btn.hidden = !Prime.modEnabled('photos');
    if (!btn.hidden) {
      try { const n = await Prime.mods.photos.count(); btn.textContent = n === null ? 'Zarządzaj zdjęciami' : `Zarządzaj zdjęciami (${n})`; } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- render / bind ---------------- */

  function renderAll() {
    const s = S();
    $('setWaterGoal').value = s.waterGoal; $('setCalGoal').value = s.calGoal; $('setProteinGoal').value = s.proteinGoal;
    $('setFatGoal').value = s.fatGoal; $('setCarbGoal').value = s.carbGoal; $('setSleepGoal').value = s.sleepGoal;
    $('setStreakThreshold').value = s.streakThreshold; $('setUnits').value = s.units; $('setAccent').value = s.accent;
    renderChallenge(); renderModules(); renderRoutines(); renderTrainingXp(); renderTemplates();
    renderStorageLine(); renderPhotosButton();
  }

  function bind() {
    bindNumber('setWaterGoal', 'waterGoal', 0.5, 15, 2);
    bindNumber('setCalGoal', 'calGoal', 0, 15000);
    bindNumber('setProteinGoal', 'proteinGoal', 0, 1000);
    bindNumber('setFatGoal', 'fatGoal', 0, 1000);
    bindNumber('setCarbGoal', 'carbGoal', 0, 2000);
    bindNumber('setSleepGoal', 'sleepGoal', 3, 14, 1);
    bindNumber('setStreakThreshold', 'streakThreshold', 1, 100);
    $('setUnits').addEventListener('change', (e) => { S().units = e.target.value; Prime.save(); });
    $('setAccent').addEventListener('change', (e) => { S().accent = e.target.value; Prime.save(); document.documentElement.dataset.accent = S().accent; Prime.refresh(); });
    bindTemplates(); bindImport();
    $('exportBtn').addEventListener('click', exportData);
    $('backupsBtn').addEventListener('click', openBackups);
    $('resetBtn').addEventListener('click', openReset);
    $('photosManageBtn').addEventListener('click', () => Prime.mods.photos.openPanel());
    $('checkUpdateBtn').addEventListener('click', () => { if (Prime.checkUpdate) Prime.checkUpdate(true); else ui.toast('Aktualizacje są niedostępne w tym trybie'); });
  }

  Prime.mods.settings = { render: renderAll, bind, exportData, previewImport, openBackups };
})();
