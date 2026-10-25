/* ============================================================
   PRIME LIFE MAXING — habits.js
   Habits (daily / chosen weekdays / N times per week) and the optional
   grooming routine (morning, evening, periodic). History is derived
   from day.habits / day.care flags; nothing is stored twice.
   A single bad day never "breaks" a habit: progress is a weekly %.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  const HABIT_EXAMPLES = [
    { name: 'Czytanie 20 min', freq: 'daily' },
    { name: 'Przygotowanie posiłków', freq: 'weekly', target: 2 },
    { name: 'Nauka lub praca nad projektem', freq: 'weekly', target: 3 },
    { name: 'Kontakt z bliską osobą', freq: 'weekly', target: 2 },
    { name: 'Cotygodniowy przegląd finansów', freq: 'weekly', target: 1 },
    { name: 'Spacer / ruch poza treningiem', freq: 'days', days: [0, 1, 2, 3, 4] },
  ];

  const CARE_EXAMPLES = {
    morning: ['Oczyszczanie twarzy', 'Krem nawilżający', 'SPF', 'Higiena jamy ustnej'],
    evening: ['Oczyszczanie twarzy', 'Krem nawilżający', 'Higiena jamy ustnej', 'Przygotowanie ubrań na jutro'],
    periodic: [['Strzyżenie / pielęgnacja zarostu', 14], ['Obcięcie paznokci', 7], ['Wymiana ręczników', 7]],
  };

  /* ---------------- habit maths ---------------- */

  const isDone = (habit, ds) => !!(Prime.state.days[ds] && Prime.state.days[ds].habits && Prime.state.days[ds].habits[habit.id]);

  function weeklyTarget(habit) {
    if (habit.freq === 'daily') return 7;
    if (habit.freq === 'days') return Math.max(1, (habit.days || []).length);
    return Math.max(1, habit.target || 1);
  }

  function activeHabits(ds) {
    return Prime.state.habits.filter(x => !x.archived && (!ds || x.createdAt <= ds));
  }

  function weekDone(habit, dates) { return dates.filter(ds => isDone(habit, ds)).length; }
  function weekPct(habit, dates) { return Math.min(1, weekDone(habit, dates) / weeklyTarget(habit)); }

  /** Which habits are "on the list" for a given day, and how many are done. */
  function dayStatus(ds) {
    const dow = D.weekdayMon0(ds);
    const wk = D.weekDates(ds);
    const rel = activeHabits(ds).filter(x => {
      if (x.freq === 'daily') return true;
      if (x.freq === 'days') return (x.days || []).includes(dow);
      return isDone(x, ds) || weekDone(x, wk) < weeklyTarget(x); // flexible: relevant until the weekly target is reached
    });
    if (rel.length === 0) return { done: 0, total: 0, list: [] };
    return { done: rel.filter(x => isDone(x, ds)).length, total: rel.length, list: rel };
  }

  /** Mean weekly completion across active habits (null if none). */
  function weekAverage(dates) {
    const end = dates[dates.length - 1];
    const hs = Prime.state.habits.filter(x => !x.archived && x.createdAt <= end);
    if (!hs.length) return null;
    return Math.round((hs.reduce((a, x) => a + weekPct(x, dates), 0) / hs.length) * 100);
  }

  function toggle(habit, ds) {
    const day = Prime.ensureDay(ds);
    if (day.habits[habit.id]) delete day.habits[habit.id]; else day.habits[habit.id] = true;
    Prime.save();
    Prime.refresh();
  }

  function freqLabel(habit) {
    if (habit.freq === 'daily') return 'codziennie';
    if (habit.freq === 'days') return (habit.days || []).map(i => D.WEEKDAYS_SHORT_PL[(i + 1) % 7]).join(', ') || 'wybrane dni';
    return `${habit.target}× w tygodniu`;
  }

  /* ---------------- Today UI: habits ---------------- */

  function renderToday(container, ds) {
    ui.clear(container);
    const habits = activeHabits(ds);
    if (!habits.length) {
      container.appendChild(ui.emptyState('Brak nawyków.', 'Nie każdy nawyk musi być codzienny — ustaw własną częstotliwość.', true));
      container.appendChild(h('div.row-actions.center', null,
        h('button.btn.small.primary', { type: 'button', onClick: () => openHabitSheet(null) }, ui.icon('plus'), 'Dodaj nawyk'),
        h('button.btn.small.ghost', { type: 'button', onClick: () => openExamples() }, 'Przykłady')));
      return;
    }
    const wk = D.weekDates(ds);
    const st = dayStatus(ds);
    habits.forEach(habit => {
      const dow = D.weekdayMon0(ds);
      const scheduled = habit.freq === 'daily' || (habit.freq === 'days' && (habit.days || []).includes(dow)) || habit.freq === 'weekly';
      const wd = weekDone(habit, wk), wt = weeklyTarget(habit);
      const sub = `${wd}/${wt} w tym tygodniu · ${freqLabel(habit)}${scheduled ? '' : ' · poza planem dziś'}`;
      container.appendChild(ui.checkRow(isDone(habit, ds), habit.name, sub, () => toggle(habit, ds)));
    });
    const avg = weekAverage(wk);
    container.appendChild(h('div.sub-head', null,
      h('span.hint', { text: avg === null ? '' : `Realizacja tygodnia: ${avg}% (${D.rangeLabel(wk[0], wk[6])})` }),
      h('div.sub-actions', null, h('button.chip-btn', { type: 'button', onClick: () => openManager() }, 'Zarządzaj'))));
  }

  /* ---------------- sheets & manager ---------------- */

  function openExamples() {
    const picked = new Set();
    const list = h('div.chip-row.wrap');
    HABIT_EXAMPLES.forEach((ex, i) => {
      const exists = Prime.state.habits.some(x => x.name === ex.name && !x.archived);
      const b = h('button.chip' + (exists ? '.active' : ''), { type: 'button', disabled: exists, 'aria-pressed': String(exists), text: ex.name, onClick: () => {
        if (picked.has(i)) { picked.delete(i); b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); }
        else { picked.add(i); b.classList.add('active'); b.setAttribute('aria-pressed', 'true'); }
      } });
      list.appendChild(b);
    });
    ui.sheet({
      title: 'Przykładowe nawyki', sub: 'Wybierz, które chcesz dodać. Później możesz je dowolnie zmienić.', body: list,
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Dodaj wybrane', kind: 'primary', onClick: () => {
        picked.forEach(i => { const ex = HABIT_EXAMPLES[i]; Prime.state.habits.push({ id: Prime.uid(), name: ex.name, freq: ex.freq, days: ex.days || [], target: ex.target || 3, archived: false, createdAt: Prime.today() }); });
        if (picked.size) { Prime.save(); Prime.refresh(); ui.rerenderPanel(); }
      } }],
      focus: false,
    });
  }

  function openHabitSheet(habit) {
    const draft = habit ? { name: habit.name, freq: habit.freq, days: (habit.days || []).slice(), target: habit.target || 3 }
      : { name: '', freq: 'daily', days: [0, 1, 2, 3, 4], target: 3 };
    const name = ui.input({ value: draft.name, placeholder: 'np. Czytanie 20 min', maxlength: '80' });
    const dayRow = h('div.chip-row'), tgtRow = h('div.stepper');
    const drawDays = () => {
      ui.clear(dayRow);
      [0, 1, 2, 3, 4, 5, 6].forEach(i => {
        const on = draft.days.includes(i);
        dayRow.appendChild(h('button.chip' + (on ? '.active' : ''), { type: 'button', 'aria-pressed': String(on), text: D.WEEKDAYS_SHORT_PL[(i + 1) % 7], onClick: () => {
          draft.days = on ? draft.days.filter(x => x !== i) : draft.days.concat(i); drawDays();
        } }));
      });
    };
    const drawTarget = () => {
      ui.clear(tgtRow);
      tgtRow.appendChild(h('button.icon-btn', { type: 'button', 'aria-label': 'Mniej', onClick: () => { draft.target = Math.max(1, draft.target - 1); drawTarget(); } }, ui.icon('minus')));
      tgtRow.appendChild(h('span.stepper-val', { text: `${draft.target}× w tygodniu` }));
      tgtRow.appendChild(h('button.icon-btn', { type: 'button', 'aria-label': 'Więcej', onClick: () => { draft.target = Math.min(7, draft.target + 1); drawTarget(); } }, ui.icon('plus')));
    };
    const vis = () => { dayRow.hidden = draft.freq !== 'days'; tgtRow.hidden = draft.freq !== 'weekly'; };
    drawDays(); drawTarget();
    const freq = ui.seg([{ value: 'daily', label: 'Codziennie' }, { value: 'days', label: 'Wybrane dni' }, { value: 'weekly', label: 'N× / tydz.' }], draft.freq, (v) => { draft.freq = v; vis(); });
    vis();
    const body = h('div', null, ui.field('Nazwa nawyku', name), h('div.modal-label', null, 'Częstotliwość', freq), dayRow, tgtRow);
    const actions = [];
    if (habit) {
      actions.push({ label: habit.archived ? 'Przywróć' : 'Archiwizuj', kind: 'ghost', onClick: () => { habit.archived = !habit.archived; Prime.save(); Prime.refresh(); ui.rerenderPanel(); } });
      actions.push({ label: 'Usuń', kind: 'ghost', onClick: async () => {
        ui.closeModals();
        const ok = await ui.confirm({ title: 'Usunąć nawyk?', text: 'Zniknie też jego historia wykonania. Jeśli chcesz ją zachować, wybierz „Archiwizuj”.', okLabel: 'Usuń' });
        if (!ok) return;
        Prime.state.habits = Prime.state.habits.filter(x => x.id !== habit.id);
        Object.values(Prime.state.days).forEach(d => { if (d.habits) delete d.habits[habit.id]; });
        Prime.save(); Prime.refresh(); ui.rerenderPanel();
      }, keepOpen: true });
    }
    actions.push({ label: 'Anuluj', kind: 'ghost' });
    actions.push({ label: 'Zapisz', kind: 'primary', onClick: () => {
      const nm = name.value.trim();
      if (!nm) { ui.toast('Podaj nazwę nawyku'); return false; }
      if (draft.freq === 'days' && draft.days.length === 0) { ui.toast('Wybierz przynajmniej jeden dzień'); return false; }
      if (habit) Object.assign(habit, { name: nm, freq: draft.freq, days: draft.days.slice().sort(), target: draft.target });
      else Prime.state.habits.push({ id: Prime.uid(), name: nm, freq: draft.freq, days: draft.days.slice().sort(), target: draft.target, archived: false, createdAt: Prime.today() });
      Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    ui.sheet({ title: habit ? 'Edytuj nawyk' : 'Nowy nawyk', body, actions });
  }

  function openManager() {
    let showArchived = false;
    ui.openPanel({
      id: 'habits', title: 'Nawyki',
      actions: [h('button.icon-btn.accent', { type: 'button', 'aria-label': 'Dodaj nawyk', onClick: () => openHabitSheet(null) }, ui.icon('plus'))],
      render(body) {
        const today = Prime.today();
        const weeks = [0, 1, 2, 3].map(i => D.weekDates(D.addDays(today, -7 * i)));
        const list = Prime.state.habits.filter(x => showArchived ? x.archived : !x.archived);
        if (!list.length) {
          body.appendChild(ui.emptyState(showArchived ? 'Brak zarchiwizowanych nawyków.' : 'Brak nawyków.', showArchived ? '' : 'Dodaj własny albo wybierz przykładowe.'));
          if (!showArchived) body.appendChild(h('div.row-actions.center', null, h('button.btn.primary', { type: 'button', onClick: () => openHabitSheet(null) }, 'Dodaj nawyk'), h('button.btn.ghost', { type: 'button', onClick: openExamples }, 'Przykłady')));
        }
        list.forEach(habit => {
          const strip = h('div.habit-strip', { role: 'img', 'aria-label': 'Ostatnie 4 tygodnie' });
          weeks.slice().reverse().forEach(wk => {
            const col = h('div.habit-week');
            wk.forEach(ds => col.appendChild(h('span.habit-cell' + (isDone(habit, ds) ? '.on' : '') + (ds > today ? '.future' : ''), { title: ds })));
            strip.appendChild(col);
          });
          const pcts = weeks.slice().reverse().map(wk => Math.round(weekPct(habit, wk) * 100));
          body.appendChild(h('div.card.habit-card', null,
            h('div.habit-card-top', null,
              h('div', null, h('div.li-title', { text: habit.name }), h('div.li-sub', { text: `${freqLabel(habit)} · od ${D.shortLabel(habit.createdAt)}` })),
              h('button.icon-btn', { type: 'button', 'aria-label': 'Edytuj nawyk', onClick: () => openHabitSheet(habit) }, ui.icon('edit'))),
            strip,
            h('div.habit-pcts', { text: 'Tygodnie (od najstarszego): ' + pcts.map(p => p + '%').join(' · ') })));
        });
        body.appendChild(h('div.row-actions.center', null,
          h('button.text-btn', { type: 'button', text: showArchived ? 'Pokaż aktywne' : 'Pokaż zarchiwizowane', onClick: () => { showArchived = !showArchived; ui.rerenderPanel(); } })));
      },
    });
  }

  /* ---------------- grooming routine ---------------- */

  const careDone = (id, ds) => !!(Prime.state.days[ds] && Prime.state.days[ds].care && Prime.state.days[ds].care[id]);

  function lastCareDone(id, upTo) {
    const keys = Prime.dayKeys();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i] > upTo) continue;
      if (careDone(id, keys[i])) return keys[i];
    }
    return null;
  }

  function careStatus(ds) {
    const c = Prime.state.care;
    const items = c.morning.concat(c.evening);
    return { done: items.filter(i => careDone(i.id, ds)).length, total: items.length };
  }

  function blockComplete(block, ds) {
    const items = Prime.state.care[block];
    return items.length > 0 && items.every(i => careDone(i.id, ds));
  }

  function toggleCare(id, ds) {
    const day = Prime.ensureDay(ds);
    if (day.care[id]) delete day.care[id]; else day.care[id] = true;
    Prime.save(); Prime.refresh();
  }

  function renderCare(container, ds) {
    ui.clear(container);
    const c = Prime.state.care;
    if (!c.morning.length && !c.evening.length && !c.periodic.length) {
      container.appendChild(ui.emptyState('Rutyna pielęgnacyjna jest opcjonalna.', 'Ustaw własne czynności — bez narzucania produktów.', true));
      container.appendChild(h('div.row-actions.center', null, h('button.btn.small.primary', { type: 'button', onClick: openCareEditor }, 'Skonfiguruj rutynę')));
      return;
    }
    const group = (title, items) => {
      if (!items.length) return;
      container.appendChild(h('div.sub-title.pad', { text: title }));
      items.forEach(it => container.appendChild(ui.checkRow(careDone(it.id, ds), it.name, null, () => toggleCare(it.id, ds))));
    };
    group('Rano', c.morning);
    group('Wieczorem', c.evening);
    if (c.periodic.length) {
      container.appendChild(h('div.sub-title.pad', { text: 'Okresowe' }));
      c.periodic.forEach(it => {
        const last = lastCareDone(it.id, ds);
        const ago = last ? D.diffDays(last, ds) : null;
        const due = ago === null || ago >= it.everyDays;
        const sub = `co ${it.everyDays} ${Prime.plural(it.everyDays, 'dzień', 'dni', 'dni')} · ` + (last ? (ago === 0 ? 'zrobione dziś' : `ostatnio ${ago} ${Prime.plural(ago, 'dzień', 'dni', 'dni')} temu`) : 'jeszcze nie odhaczone');
        container.appendChild(ui.checkRow(careDone(it.id, ds), it.name, sub, () => toggleCare(it.id, ds), due && !careDone(it.id, ds) ? h('span.pill.warn', { text: 'czas' }) : null));
      });
    }
    container.appendChild(h('div.sub-head', null, h('span'), h('div.sub-actions', null, h('button.chip-btn', { type: 'button', onClick: openCareEditor }, 'Edytuj rutynę'))));
  }

  function openCareEditor() {
    ui.openPanel({
      id: 'care', title: 'Rutyna pielęgnacyjna',
      render(body) {
        const c = Prime.state.care;
        body.appendChild(h('p.hint', { text: 'Wszystko opcjonalne. To narzędzie do konsekwencji, nie do oceniania wyglądu.' }));
        const block = (key, title, withEvery) => {
          const card = h('div.card');
          card.appendChild(h('div.sub-title', { text: title }));
          c[key].forEach(it => card.appendChild(h('div.edit-row', null,
            h('span', { text: it.name + (withEvery ? ` · co ${it.everyDays} dni` : '') }),
            h('button.icon-btn.small', { type: 'button', 'aria-label': 'Usuń ' + it.name, onClick: async () => {
              const ok = await ui.confirm({ title: 'Usunąć czynność?', text: `„${it.name}” zniknie z rutyny (historia odhaczeń pozostaje w dniach).`, okLabel: 'Usuń' });
              if (!ok) return;
              c[key] = c[key].filter(x => x.id !== it.id); Prime.save(); ui.rerenderPanel();
            } }, ui.icon('trash')))));
          const inp = ui.input({ placeholder: 'Nowa czynność', maxlength: '80', 'aria-label': 'Nowa czynność: ' + title });
          const every = withEvery ? ui.input({ type: 'number', value: '14', min: '1', max: '365', inputmode: 'numeric', 'aria-label': 'Co ile dni' }) : null;
          const add = () => {
            const nm = inp.value.trim(); if (!nm) { ui.toast('Wpisz nazwę'); return; }
            const item = { id: Prime.uid(), name: nm };
            if (withEvery) item.everyDays = Math.max(1, Math.min(365, Math.round(Number(every.value) || 14)));
            c[key].push(item); Prime.save(); ui.rerenderPanel();
          };
          card.appendChild(h('div.add-row', null, inp, every ? h('div.mini-field', null, 'co', every, 'dni') : null, h('button.btn.small.primary', { type: 'button', text: 'Dodaj', onClick: add })));
          const ex = CARE_EXAMPLES[key].filter(e => !c[key].some(x => x.name === (Array.isArray(e) ? e[0] : e)));
          if (ex.length) {
            card.appendChild(h('div.hint', { text: 'Pomysły (dotknij, by dodać):' }));
            card.appendChild(h('div.chip-row.wrap', null, ex.map(e => h('button.chip', { type: 'button', text: Array.isArray(e) ? e[0] : e, onClick: () => {
              const item = { id: Prime.uid(), name: Array.isArray(e) ? e[0] : e }; if (Array.isArray(e)) item.everyDays = e[1];
              c[key].push(item); Prime.save(); ui.rerenderPanel();
            } }))));
          }
          body.appendChild(card);
        };
        block('morning', 'Rano', false);
        block('evening', 'Wieczorem', false);
        block('periodic', 'Dodatkowe zadania okresowe', true);
      },
    });
  }

  Prime.mods.habits = {
    isDone, weeklyTarget, activeHabits, weekDone, weekPct, dayStatus, weekAverage, toggle, freqLabel,
    renderToday, openManager, openHabitSheet,
    careDone, careStatus, blockComplete, renderCare, openCareEditor, lastCareDone,
  };
})();
