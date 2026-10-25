/* ============================================================
   PRIME LIFE MAXING — growth.js
   Personal development: a few projects, one "main" project for the
   period, weekly session goal (e.g. 3 × 30 min). Deliberately small —
   it supports consistency, it is not a project manager.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  const PRIORITY = [{ value: 'high', label: 'Wysoki' }, { value: 'normal', label: 'Normalny' }, { value: 'low', label: 'Niski' }];
  const STATUS = [{ value: 'active', label: 'Aktywny' }, { value: 'paused', label: 'Wstrzymany' }, { value: 'done', label: 'Ukończony' }];
  const G = () => Prime.state.growth;

  const mainProject = () => G().projects.find(p => p.main && p.status === 'active') || null;
  const projectById = (id) => G().projects.find(p => p.id === id) || null;
  const progressOf = (p) => (p.tasks.length ? Math.round((p.tasks.filter(t => t.done).length / p.tasks.length) * 100) : 0);

  function weekStats(dates) {
    const set = new Set(dates);
    const ss = G().sessions.filter(s => set.has(s.date) && s.minutes > 0);
    const minutes = ss.reduce((a, s) => a + s.minutes, 0);
    let tasksDone = 0;
    G().projects.forEach(p => p.tasks.forEach(t => { if (t.done && t.doneAt && set.has(t.doneAt)) tasksDone++; }));
    return { sessions: ss.length, minutes, tasksDone, goal: G().weeklySessions, goalMinutes: G().sessionMinutes };
  }

  function sessionsOn(ds) { return G().sessions.filter(s => s.date === ds && s.minutes > 0); }

  function setMain(p) {
    G().projects.forEach(x => { x.main = x.id === p.id; });
    Prime.save();
  }

  function toggleTask(p, t) {
    t.done = !t.done;
    t.doneAt = t.done ? Prime.today() : null;
    Prime.save(); Prime.refresh();
  }

  function openSessionSheet(ds, preProject) {
    const projects = G().projects.filter(p => p.status !== 'done');
    const main = mainProject();
    const sel = ui.select([{ value: '', label: 'Bez projektu' }].concat(projects.map(p => ({ value: p.id, label: p.name }))), (preProject && preProject.id) || (main ? main.id : ''));
    const mins = ui.input({ type: 'number', value: String(G().sessionMinutes), min: '1', max: '1440', inputmode: 'numeric' });
    const note = ui.input({ placeholder: 'Co zrobione? (opcjonalnie)', maxlength: '300' });
    ui.sheet({
      title: 'Sesja rozwoju', sub: D.formatFullDate(ds),
      body: h('div', null, ui.field('Projekt', sel), ui.field('Czas (min)', mins), ui.field('Notatka', note)),
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Zapisz sesję', kind: 'primary', onClick: () => {
        const m = Math.round(Number(mins.value));
        if (!(m > 0)) { ui.toast('Podaj czas w minutach'); return false; }
        G().sessions.push({ id: Prime.uid(), date: ds, projectId: sel.value || null, minutes: Math.min(1440, m), note: note.value.trim() });
        Prime.save(); Prime.refresh(); ui.rerenderPanel(); ui.toast('Sesja zapisana');
      } }],
    });
  }

  /* ---------------- Today section ---------------- */

  function renderToday(container, ds) {
    ui.clear(container);
    const wk = D.weekDates(ds);
    const ws = weekStats(wk);
    const p = mainProject();
    if (!G().projects.length) {
      container.appendChild(ui.emptyState('Brak projektów rozwoju.', 'Wybierz jedną umiejętność lub projekt na ten okres.', true));
      container.appendChild(h('div.row-actions.center', null, h('button.btn.small.primary', { type: 'button', onClick: () => openPanel(true) }, ui.icon('plus'), 'Dodaj projekt')));
      return;
    }
    if (p) {
      const card = h('div.card.inner');
      card.appendChild(h('div.wk-top', null, h('div', null, h('div.li-title', { text: p.name }), h('div.li-sub', { text: 'Projekt główny' + (p.deadline ? ' · termin ' + D.shortLabel(p.deadline) : '') })), h('span.pill.accent', { text: progressOf(p) + '%' })));
      p.tasks.filter(t => !t.done).slice(0, 3).forEach(t => card.appendChild(ui.checkRow(false, t.name, null, () => toggleTask(p, t))));
      if (!p.tasks.length) card.appendChild(h('p.hint', { text: 'Dodaj zadania w projekcie, by widzieć kolejne kroki.' }));
      container.appendChild(card);
    }
    const pct = ws.goal > 0 ? Math.min(100, Math.round((ws.sessions / ws.goal) * 100)) : 0;
    container.appendChild(h('div.week-goal', null,
      h('div.li-sub', { text: `Sesje w tym tygodniu: ${ws.sessions}/${ws.goal} · ${ws.minutes} min (${D.rangeLabel(wk[0], wk[6])})` }),
      ui.progress(pct, true)));
    container.appendChild(h('div.row-actions', null,
      h('button.btn.small.primary', { type: 'button', onClick: () => openSessionSheet(ds, p) }, ui.icon('plus'), 'Zapisz sesję'),
      h('button.btn.small.ghost', { type: 'button', onClick: () => openPanel() }, 'Projekty')));
  }

  /* ---------------- Panel ---------------- */

  function openPanel(startNew) {
    const st = { open: null };
    ui.openPanel({
      id: 'growth', title: 'Rozwój osobisty',
      actions: [h('button.icon-btn.accent', { type: 'button', 'aria-label': 'Nowy projekt', onClick: () => newProject() }, ui.icon('plus'))],
      render(body, api) {
        if (st.open) { const p = projectById(st.open); if (p) { renderDetail(body, p, api, st); return; } st.open = null; }
        const wk = D.weekDates(Prime.today());
        const ws = weekStats(wk);
        body.appendChild(h('div.card', null,
          h('div.sub-title', { text: 'Cele tygodniowe' }),
          h('div.li-sub', { text: `Ten tydzień (${D.rangeLabel(wk[0], wk[6])}): ${ws.sessions}/${G().weeklySessions} sesji · ${ws.minutes} min · ${ws.tasksDone} zadań` }),
          ui.progress(G().weeklySessions ? Math.min(100, (ws.sessions / G().weeklySessions) * 100) : 0, true),
          h('div.modal-row-2.pad', null,
            ui.field('Sesji tygodniowo', (function () { const i = ui.input({ type: 'number', value: String(G().weeklySessions), min: '0', max: '21', inputmode: 'numeric' }); i.addEventListener('change', () => { G().weeklySessions = Prime.clamp(Math.round(Number(i.value)) || 0, 0, 21); Prime.save(); api.rerender(); }); return i; })()),
            ui.field('Domyślnie minut', (function () { const i = ui.input({ type: 'number', value: String(G().sessionMinutes), min: '5', max: '600', inputmode: 'numeric' }); i.addEventListener('change', () => { G().sessionMinutes = Prime.clamp(Math.round(Number(i.value)) || 30, 5, 600); Prime.save(); }); return i; })())),
          h('button.btn.small.primary', { type: 'button', onClick: () => openSessionSheet(Prime.today(), mainProject()) }, ui.icon('plus'), 'Zapisz sesję')));
        const list = G().projects.slice().sort((a, b) => (b.main - a.main) || (a.status === 'done') - (b.status === 'done'));
        if (!list.length) body.appendChild(ui.emptyState('Brak projektów.', 'Dodaj projekt lub umiejętność, nad którą chcesz pracować.'));
        list.forEach(p => body.appendChild(h('button.card.project-card.btn-like', { type: 'button', onClick: () => { st.open = p.id; api.rerender(); } },
          h('div.wk-top', null, h('div', null, h('div.li-title', { text: p.name }), h('div.li-sub', { text: `${STATUS.find(s => s.value === p.status).label} · priorytet ${PRIORITY.find(x => x.value === p.priority).label.toLowerCase()}${p.deadline ? ' · termin ' + D.shortLabel(p.deadline) : ''}` })),
            p.main ? h('span.pill.accent', { text: 'główny' }) : null),
          ui.progress(progressOf(p), true),
          h('div.li-sub', { text: `${p.tasks.filter(t => t.done).length}/${p.tasks.length} zadań` }))));
        if (startNew && !G().projects.length) setTimeout(newProject, 50);
      },
    });
    function newProject() {
      const name = ui.input({ placeholder: 'np. Kurs programowania', maxlength: '80' });
      ui.sheet({ title: 'Nowy projekt', body: ui.field('Nazwa', name), actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Utwórz', kind: 'primary', onClick: () => {
        const nm = name.value.trim(); if (!nm) { ui.toast('Podaj nazwę'); return false; }
        const p = { id: Prime.uid(), name: nm, desc: '', goal: '', priority: 'normal', deadline: null, status: 'active', main: !G().projects.some(x => x.main && x.status === 'active'), notes: '', createdAt: Prime.today(), tasks: [] };
        G().projects.push(p); Prime.save(); st.open = p.id; Prime.refresh(); ui.rerenderPanel();
      } }] });
    }
  }

  function renderDetail(body, p, api, st) {
    const back = h('button.text-btn', { type: 'button', onClick: () => { st.open = null; api.rerender(); } }, ui.icon('chevron-left'), 'Wszystkie projekty');
    body.appendChild(back);
    const name = ui.input({ value: p.name, maxlength: '80' }); name.addEventListener('input', () => { p.name = name.value.slice(0, 80); Prime.saveSoon(); });
    const desc = ui.input({ value: p.desc, maxlength: '300', placeholder: 'Krótki opis' }); desc.addEventListener('input', () => { p.desc = desc.value; Prime.saveSoon(); });
    const goal = ui.input({ value: p.goal, maxlength: '300', placeholder: 'Cel, np. „skończyć moduł 3”' }); goal.addEventListener('input', () => { p.goal = goal.value; Prime.saveSoon(); });
    const prio = ui.select(PRIORITY, p.priority); prio.addEventListener('change', () => { p.priority = prio.value; Prime.save(); });
    const status = ui.select(STATUS, p.status); status.addEventListener('change', () => { p.status = status.value; if (p.status !== 'active') p.main = false; Prime.save(); Prime.refresh(); api.rerender(); });
    const dl = ui.input({ type: 'date', value: p.deadline || '' }); dl.addEventListener('change', () => { p.deadline = D.isDateStr(dl.value) ? dl.value : null; Prime.save(); });
    body.appendChild(h('div.card', null, ui.field('Nazwa', name), ui.field('Opis', desc), ui.field('Cel', goal),
      h('div.modal-row-3', null, ui.field('Priorytet', prio), ui.field('Status', status), ui.field('Termin', dl)),
      p.status === 'active' ? (p.main ? h('span.pill.accent', { text: 'Projekt główny na ten okres' }) : h('button.btn.small.primary', { type: 'button', text: 'Ustaw jako główny', onClick: () => { setMain(p); Prime.refresh(); api.rerender(); } })) : null));

    const tasksCard = h('div.card', null, h('div.sub-title', { text: 'Zadania' }));
    p.tasks.filter(t => !t.done).concat(p.tasks.filter(t => t.done)).forEach(t => tasksCard.appendChild(ui.checkRow(t.done, t.name, t.done && t.doneAt ? 'ukończono ' + D.shortLabel(t.doneAt) : null, () => { toggleTask(p, t); api.rerender(); },
      h('button.icon-btn.small', { type: 'button', 'aria-label': 'Usuń zadanie', onClick: () => { p.tasks = p.tasks.filter(x => x.id !== t.id); Prime.save(); api.rerender(); } }, ui.icon('x')))));
    const newTask = ui.input({ placeholder: 'Nowe zadanie', maxlength: '150', 'aria-label': 'Nowe zadanie projektu' });
    const addT = () => { const v = newTask.value.trim(); if (!v) return; p.tasks.push({ id: Prime.uid(), name: v, done: false, doneAt: null }); Prime.save(); api.rerender(); };
    newTask.addEventListener('keydown', (e) => { if (e.key === 'Enter') addT(); });
    tasksCard.appendChild(h('div.add-row', null, newTask, h('button.btn.small.primary', { type: 'button', text: 'Dodaj', onClick: addT })));
    body.appendChild(tasksCard);

    const notes = h('textarea.modal-input', { rows: '4', maxlength: '5000', placeholder: 'Notatki do projektu', 'aria-label': 'Notatki projektu', value: p.notes || '' });
    notes.addEventListener('input', () => { p.notes = notes.value; Prime.saveSoon(); });
    body.appendChild(h('div.card', null, h('div.sub-title', { text: 'Notatki' }), notes));

    const hist = [];
    p.tasks.filter(t => t.done && t.doneAt).forEach(t => hist.push({ date: t.doneAt, text: 'Zadanie: ' + t.name }));
    G().sessions.filter(s => s.projectId === p.id).forEach(s => hist.push({ date: s.date, text: `Sesja ${s.minutes} min${s.note ? ' — ' + s.note : ''}` }));
    hist.sort((a, b) => b.date.localeCompare(a.date));
    const hc = h('div.card', null, h('div.sub-title', { text: 'Historia' }));
    if (!hist.length) hc.appendChild(h('p.hint', { text: 'Pojawi się po pierwszej sesji lub ukończonym zadaniu.' }));
    hist.slice(0, 30).forEach(e => hc.appendChild(h('div.hist-row', null, h('span.hist-date', { text: D.shortLabel(e.date) }), h('span', { text: e.text }))));
    body.appendChild(hc);

    body.appendChild(h('button.btn.ghost.block', { type: 'button', text: 'Usuń projekt', onClick: async () => {
      const ok = await ui.confirm({ title: 'Usunąć projekt?', text: 'Projekt, jego zadania i notatki zostaną usunięte. Zapisane sesje pozostaną w historii bez projektu.', okLabel: 'Usuń' });
      if (!ok) return;
      G().projects = G().projects.filter(x => x.id !== p.id);
      G().sessions.forEach(s => { if (s.projectId === p.id) s.projectId = null; });
      Prime.save(); Prime.refresh(); st.open = null; api.rerender();
    } }));
  }

  Prime.mods.growth = { mainProject, weekStats, sessionsOn, renderToday, openPanel, openSessionSheet, progressOf };
})();
