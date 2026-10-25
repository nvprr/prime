/* ============================================================
   PRIME LIFE MAXING — workouts.js
   Exercise library, plans, live session logging, history, records.

   - Every change is written immediately (inputs: debounced + flushed on
     page hide), so closing the app mid-workout loses nothing; the active
     session is simply restored on the next start.
   - Records/volume are derived ONLY from sets that are marked done AND
     have the values that exercise type needs. Incomplete sets are shown
     but never counted.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  const MUSCLES = ['Klatka', 'Plecy', 'Nogi', 'Barki', 'Biceps', 'Triceps', 'Brzuch', 'Całe ciało', 'Cardio'];
  const TYPES = [
    { value: 'weights', label: 'Ciężary (kg × powtórzenia)' },
    { value: 'bodyweight', label: 'Masa ciała (powtórzenia)' },
    { value: 'time', label: 'Czas (sekundy)' },
    { value: 'cardio', label: 'Cardio (czas + dystans)' },
  ];

  const BUILTIN = [
    ['Wyciskanie sztangi leżąc', 'Klatka', 'weights'], ['Wyciskanie hantli skos dodatni', 'Klatka', 'weights'], ['Rozpiętki', 'Klatka', 'weights'], ['Pompki', 'Klatka', 'bodyweight'],
    ['Martwy ciąg', 'Plecy', 'weights'], ['Wiosłowanie sztangą', 'Plecy', 'weights'], ['Podciąganie', 'Plecy', 'bodyweight'], ['Ściąganie drążka do klatki', 'Plecy', 'weights'], ['Wiosłowanie hantlem', 'Plecy', 'weights'],
    ['Przysiad ze sztangą', 'Nogi', 'weights'], ['Wykroki', 'Nogi', 'weights'], ['Przysiad bułgarski', 'Nogi', 'weights'], ['Hip thrust', 'Nogi', 'weights'], ['Prostowanie nóg', 'Nogi', 'weights'], ['Uginanie nóg', 'Nogi', 'weights'], ['Wspięcia na palce', 'Nogi', 'weights'],
    ['Wyciskanie nad głowę', 'Barki', 'weights'], ['Unoszenie hantli bokiem', 'Barki', 'weights'], ['Face pull', 'Barki', 'weights'],
    ['Uginanie ze sztangą', 'Biceps', 'weights'], ['Uginanie młotkowe', 'Biceps', 'weights'],
    ['Wyciskanie francuskie', 'Triceps', 'weights'], ['Prostowanie ramion na wyciągu', 'Triceps', 'weights'], ['Dipy', 'Triceps', 'bodyweight'],
    ['Plank', 'Brzuch', 'time'], ['Spięcia brzucha', 'Brzuch', 'bodyweight'], ['Unoszenie nóg w zwisie', 'Brzuch', 'bodyweight'],
    ['Bieganie', 'Cardio', 'cardio'], ['Rower', 'Cardio', 'cardio'], ['Marsz', 'Cardio', 'cardio'], ['Skakanka', 'Cardio', 'time'],
  ].map((e, i) => ({ id: 'std_' + i, name: e[0], muscle: e[1], type: e[2], builtin: true }));

  /* ---------------- lookups ---------------- */

  const custom = () => Prime.state.workouts.exercises;
  const allExercises = () => BUILTIN.concat(custom());
  function exerciseById(id, snapshot) {
    return custom().find(e => e.id === id) || BUILTIN.find(e => e.id === id)
      || { id, name: (snapshot && snapshot.name) || '(usunięte ćwiczenie)', muscle: '', type: (snapshot && snapshot.type) || 'weights', missing: true };
  }
  const entryExercise = (entry) => exerciseById(entry.exerciseId, entry);
  const plans = () => Prime.state.workouts.plans;
  const sessions = () => Prime.state.workouts.sessions;
  const activeSession = () => sessions().find(s => s.status === 'active') || null;

  /* ---------------- set maths (only complete, done sets count) ---------------- */

  function setComplete(type, s) {
    if (!s.done) return false;
    switch (type) {
      case 'weights': return s.weight > 0 && s.reps > 0;
      case 'bodyweight': return s.reps > 0;
      case 'time': return s.time > 0;
      case 'cardio': return s.time > 0 || s.distance > 0;
      default: return false;
    }
  }

  const completeSets = (entry) => entry.sets.filter(s => setComplete(entryExercise(entry).type, s));
  const sessionCompleteSets = (sess) => sess.entries.reduce((a, e) => a + completeSets(e).length, 0);
  const isCounted = (sess) => sess.status === 'done' && sessionCompleteSets(sess) > 0;
  const countedSessions = () => sessions().filter(isCounted);

  function volumeOf(sess) {
    let v = 0;
    sess.entries.forEach(e => {
      if (entryExercise(e).type !== 'weights') return;
      completeSets(e).forEach(s => { v += s.weight * s.reps; });
    });
    return Math.round(v);
  }

  /** Best set of an entry by its exercise type: {label, score, set}. */
  function topSet(entry) {
    const type = entryExercise(entry).type;
    const sets = completeSets(entry);
    if (!sets.length) return null;
    let best = sets[0];
    const score = (s) => type === 'weights' ? s.weight * 1000 + s.reps : type === 'bodyweight' ? s.reps : type === 'time' ? s.time : (s.distance || 0) * 100000 + (s.time || 0);
    sets.forEach(s => { if (score(s) > score(best)) best = s; });
    return { set: best, score: score(best) };
  }

  function fmtSet(type, s) {
    const n = (x) => Prime.formatNum(Prime.roundTo(x, 2));
    switch (type) {
      case 'weights': return `${n(s.weight)} kg × ${s.reps}`;
      case 'bodyweight': return `${s.reps} powt.`;
      case 'time': return `${s.time} s`;
      default: return [s.time ? `${n(s.time / 60)} min` : null, s.distance ? `${n(s.distance)} km` : null].filter(Boolean).join(' · ');
    }
  }

  function fmtEntrySummary(entry) {
    const ex = entryExercise(entry);
    const sets = completeSets(entry);
    if (!sets.length) return 'brak ukończonych serii';
    const top = topSet(entry);
    return `${sets.length} ${Prime.plural(sets.length, 'seria', 'serie', 'serii')} · najlepsza: ${fmtSet(ex.type, top.set)}`;
  }

  /** Latest FINISHED session (other than `exceptId`, not later than date) that has complete sets of this exercise. */
  function previousEntry(exerciseId, beforeDate, exceptId) {
    const list = sessions().filter(s => s.status === 'done' && s.id !== exceptId && s.date <= beforeDate)
      .sort((a, b) => (a.date + (a.startedAt || '')).localeCompare(b.date + (b.startedAt || '')));
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i].entries.find(x => x.exerciseId === exerciseId && completeSets(x).length);
      if (e) return { session: list[i], entry: e };
    }
    return null;
  }

  /** Records per exercise across finished sessions. */
  function recordsFor(exerciseId) {
    const ex = exerciseById(exerciseId);
    const rec = { exercise: ex, sessions: 0, sets: 0, best: null, bestDate: null, volume: 0 };
    countedSessions().forEach(sess => {
      sess.entries.filter(e => e.exerciseId === exerciseId).forEach(e => {
        const sets = completeSets(e);
        if (!sets.length) return;
        rec.sessions++; rec.sets += sets.length;
        const t = topSet(e);
        if (!rec.best || t.score > rec.best.score) { rec.best = t; rec.bestDate = sess.date; }
        if (ex.type === 'weights') sets.forEach(s => { rec.volume += s.weight * s.reps; });
      });
    });
    return rec;
  }

  /** [{date, value, label}] chronological top-set value per session (for the progress chart). */
  function progressSeries(exerciseId) {
    const ex = exerciseById(exerciseId);
    const out = [];
    countedSessions().sort((a, b) => a.date.localeCompare(b.date)).forEach(sess => {
      const e = sess.entries.filter(x => x.exerciseId === exerciseId).map(x => ({ x, t: topSet(x) })).filter(o => o.t).sort((a, b) => b.t.score - a.t.score)[0];
      if (!e) return;
      const s = e.t.set;
      const value = ex.type === 'weights' ? s.weight : ex.type === 'bodyweight' ? s.reps : ex.type === 'time' ? s.time : (s.distance || (s.time || 0) / 60);
      out.push({ date: sess.date, value, label: fmtSet(ex.type, s) });
    });
    return out;
  }

  function unitOf(type) { return type === 'weights' ? 'kg' : type === 'bodyweight' ? 'powt.' : type === 'time' ? 's' : 'km/min'; }

  /* ---------------- day-level selectors used by other modules ---------------- */

  const sessionsOn = (ds) => sessions().filter(s => s.date === ds);
  const countedOn = (ds) => sessions().filter(s => s.date === ds && isCounted(s));
  const legacyTrainingTask = (ds) => (Prime.state.days[ds] ? Prime.state.days[ds].tasks.some(t => t.category === 'trening' && t.done) : false);
  /** A training day = a finished logged workout OR a done task in the category "Trening" (v1 behaviour kept). */
  const trainedOn = (ds) => countedOn(ds).length > 0 || legacyTrainingTask(ds);
  const weekCount = (dates) => dates.filter(trainedOn).length;

  function dayStatus(ds) {
    const act = activeSession();
    if (act && act.date === ds) return { kind: 'active', label: 'w toku' };
    const c = countedOn(ds);
    if (c.length) return { kind: 'done', label: 'wykonany' };
    if (legacyTrainingTask(ds)) return { kind: 'done', label: 'wykonany' };
    const planned = Prime.state.days[ds] && Prime.state.days[ds].tasks.some(t => t.category === 'trening' && !t.done);
    if (planned) return { kind: 'planned', label: 'zaplanowany' };
    return { kind: 'none', label: 'brak' };
  }

  /* ---------------- session lifecycle ---------------- */

  function newEntry(exId) {
    const ex = exerciseById(exId);
    return { id: Prime.uid(), exerciseId: exId, name: ex.name, type: ex.type, note: '', sets: [] };
  }

  function startSession(date, plan) {
    if (activeSession()) return activeSession();
    const sess = {
      id: Prime.uid(), date, planId: plan ? plan.id : null, name: plan ? plan.name : 'Trening',
      startedAt: new Date().toISOString(), endedAt: null, status: 'active', note: '',
      entries: plan ? plan.exercises.map(newEntry) : [],
    };
    sess.entries.forEach(e => addSet(sess, e, true));
    sessions().push(sess);
    Prime.save();
    return sess;
  }

  /** New set pre-filled from the previous set / last session so the usual case is one tap. */
  function addSet(sess, entry, silent) {
    const ex = entryExercise(entry);
    const last = entry.sets[entry.sets.length - 1];
    let src = last;
    if (!src) { const prev = previousEntry(entry.exerciseId, sess.date, sess.id); if (prev) src = completeSets(prev.entry)[0]; }
    const s = { id: Prime.uid(), reps: null, weight: null, time: null, distance: null, done: false };
    if (src) {
      if (ex.type === 'weights') { s.weight = src.weight; s.reps = src.reps; }
      else if (ex.type === 'bodyweight') s.reps = src.reps;
      else if (ex.type === 'time') s.time = src.time;
      else { s.time = src.time; s.distance = src.distance; }
    }
    entry.sets.push(s);
    if (!silent) Prime.save();
    return s;
  }

  function hasValues(type, s) {
    return type === 'weights' ? (s.weight || s.reps) : type === 'bodyweight' ? s.reps : type === 'time' ? s.time : (s.time || s.distance);
  }

  function linkTaskOnFinish(sess) {
    const mode = Prime.state.settings.workoutTaskMode;
    if (mode === 'off') return;
    const day = Prime.ensureDay(sess.date);
    if (day.tasks.some(t => t.sessionId === sess.id)) return; // never duplicate
    const open = day.tasks.find(t => t.category === 'trening' && !t.done);
    if (open) { open.done = true; open.sessionId = sess.id; open.markedBySession = true; return; }
    if (mode === 'create') day.tasks.push({ id: Prime.uid(), name: sess.name || 'Trening', time: null, category: 'trening', done: true, priority: false, sessionId: sess.id, autoCreated: true });
  }

  function unlinkTask(sess) {
    const day = Prime.state.days[sess.date];
    if (!day) return;
    day.tasks = day.tasks.filter(t => !(t.sessionId === sess.id && t.autoCreated));
    day.tasks.forEach(t => { if (t.sessionId === sess.id && t.markedBySession) { t.done = false; delete t.sessionId; delete t.markedBySession; } });
  }

  async function finishSession(sess) {
    sess.entries.forEach(e => { const type = entryExercise(e).type; e.sets = e.sets.filter(s => s.done || hasValues(type, s)); });
    sess.entries = sess.entries.filter(e => e.sets.length > 0);
    if (sessionCompleteSets(sess) === 0) {
      const ok = await ui.confirm({ title: 'Brak ukończonych serii', text: 'Trening bez ukończonych serii zostanie zapisany, ale nie wejdzie do statystyk i rekordów. Zapisać mimo to?', okLabel: 'Zapisz', danger: false });
      if (!ok) return false;
    }
    sess.status = 'done';
    sess.endedAt = new Date().toISOString();
    if (sessionCompleteSets(sess) > 0) linkTaskOnFinish(sess);
    Prime.save();
    Prime.refresh();
    ui.toast('Trening zapisany');
    return true;
  }

  async function discardSession(sess) {
    const ok = await ui.confirm({ title: 'Usunąć ten trening?', text: 'Wszystkie serie z tej sesji zostaną usunięte.', okLabel: 'Usuń' });
    if (!ok) return false;
    unlinkTask(sess);
    Prime.state.workouts.sessions = sessions().filter(s => s.id !== sess.id);
    Prime.save(); Prime.refresh();
    return true;
  }

  /* ---------------- exercise picker + custom exercise ---------------- */

  function openExerciseForm(ex, onDone) {
    const name = ui.input({ value: ex ? ex.name : '', placeholder: 'np. Wyciskanie żołnierskie', maxlength: '80' });
    const muscle = ui.select(MUSCLES.map(m => ({ value: m, label: m })), ex ? ex.muscle || 'Całe ciało' : 'Całe ciało');
    const type = ui.select(TYPES, ex ? ex.type : 'weights');
    const desc = ui.input({ value: ex ? ex.desc || '' : '', placeholder: 'opcjonalny opis', maxlength: '300' });
    const actions = [];
    if (ex) actions.push({ label: 'Usuń', kind: 'ghost', keepOpen: true, onClick: async () => {
      ui.closeModals();
      const used = sessions().some(s => s.entries.some(e => e.exerciseId === ex.id));
      const ok = await ui.confirm({ title: 'Usunąć ćwiczenie?', text: used ? 'Ćwiczenie jest użyte w zapisanych treningach — one zostaną, ale ćwiczenie zniknie z listy i planów.' : 'Ćwiczenie zniknie z listy i planów.', okLabel: 'Usuń' });
      if (!ok) return;
      Prime.state.workouts.exercises = custom().filter(x => x.id !== ex.id);
      plans().forEach(p => { p.exercises = p.exercises.filter(id => id !== ex.id); });
      Prime.save(); ui.rerenderPanel();
    } });
    actions.push({ label: 'Anuluj', kind: 'ghost' });
    actions.push({ label: 'Zapisz', kind: 'primary', onClick: () => {
      const nm = name.value.trim();
      if (!nm) { ui.toast('Podaj nazwę ćwiczenia'); return false; }
      let saved = ex;
      if (ex) { Object.assign(ex, { name: nm, muscle: muscle.value, type: type.value, desc: desc.value.trim() }); }
      else { saved = { id: Prime.uid(), name: nm, muscle: muscle.value, type: type.value, desc: desc.value.trim() }; custom().push(saved); }
      Prime.save();
      if (onDone) onDone(saved); else ui.rerenderPanel();
    } });
    ui.sheet({ title: ex ? 'Edytuj ćwiczenie' : 'Własne ćwiczenie', body: h('div', null, ui.field('Nazwa', name), h('div.modal-row-2', null, ui.field('Grupa mięśniowa', muscle), ui.field('Typ wyniku', type)), ui.field('Opis (opcjonalnie)', desc)), actions });
  }

  function pickExercise(onPick) {
    let filter = 'all', q = '';
    const list = h('div.pick-list');
    const chips = h('div.chip-row.scroll-x');
    const search = ui.input({ placeholder: 'Szukaj ćwiczenia…', 'aria-label': 'Szukaj ćwiczenia' });
    const draw = () => {
      ui.clear(chips);
      ['all'].concat(MUSCLES).forEach(m => chips.appendChild(h('button.chip' + (filter === m ? '.active' : ''), { type: 'button', 'aria-pressed': String(filter === m), text: m === 'all' ? 'Wszystkie' : m, onClick: () => { filter = m; draw(); } })));
      ui.clear(list);
      const items = allExercises().filter(e => (filter === 'all' || e.muscle === filter) && (!q || e.name.toLowerCase().includes(q)));
      if (!items.length) list.appendChild(ui.emptyState('Brak wyników.', 'Dodaj własne ćwiczenie.', true));
      items.forEach(e => list.appendChild(h('button.pick-item', { type: 'button', onClick: () => { ui.closeModals(); onPick(e); } },
        h('span.li-title', { text: e.name }), h('span.li-sub', { text: `${e.muscle || '—'} · ${TYPES.find(t => t.value === e.type).label.split(' (')[0]}${e.builtin ? '' : ' · własne'}` }))));
    };
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    draw();
    ui.sheet({
      title: 'Wybierz ćwiczenie', body: h('div', null, search, chips, list), focus: false,
      actions: [{ label: 'Zamknij', kind: 'ghost' }, { label: '+ Własne', kind: 'primary', keepOpen: true, onClick: () => openExerciseForm(null, (ex) => onPick(ex)) }],
    });
  }

  /* ---------------- UI: session editor ---------------- */

  const FIELDS = {
    weights: [{ key: 'weight', ph: 'kg', mode: 'decimal', step: '0.5', max: 5000 }, { key: 'reps', ph: 'powt.', mode: 'numeric', step: '1', max: 10000 }],
    bodyweight: [{ key: 'reps', ph: 'powt.', mode: 'numeric', step: '1', max: 10000 }],
    time: [{ key: 'time', ph: 'sek', mode: 'numeric', step: '1', max: 172800 }],
    cardio: [{ key: 'time', ph: 'min', mode: 'decimal', step: '0.5', scale: 60, max: 2880 }, { key: 'distance', ph: 'km', mode: 'decimal', step: '0.1', max: 100000 }],
  };

  function renderSetRow(sess, entry, ex, set, idx, prevBest, rerender) {
    const inputs = FIELDS[ex.type].map(f => {
      const cur = set[f.key];
      const inp = h('input.set-input', {
        type: 'number', inputmode: f.mode, step: f.step, min: '0', placeholder: f.ph,
        value: cur === null || cur === undefined ? '' : String(Prime.roundTo(f.scale ? cur / f.scale : cur, 2)),
        'aria-label': `${f.ph}, seria ${idx + 1}, ${ex.name}`,
      });
      inp.addEventListener('input', () => {
        const raw = inp.value.trim().replace(',', '.');
        if (raw === '') set[f.key] = null;
        else { const n = Number(raw); set[f.key] = isFinite(n) ? Math.min(f.max, Math.max(0, n * (f.scale || 1))) : null; }
        Prime.saveSoon();
      });
      return inp;
    });
    const check = h('button.set-check' + (set.done ? '.on' : ''), {
      type: 'button', role: 'checkbox', 'aria-checked': String(set.done), 'aria-label': `Seria ${idx + 1} wykonana`,
      onClick: () => {
        if (!set.done) {
          const probe = Object.assign({}, set, { done: true });
          if (!setComplete(ex.type, probe)) { ui.toast('Uzupełnij dane serii, zanim ją odhaczysz'); return; }
        }
        set.done = !set.done; Prime.save(); rerender();
      },
    }, ui.icon('check'));
    let pr = null;
    if (set.done && setComplete(ex.type, set) && prevBest !== null) {
      const t = topSet({ exerciseId: entry.exerciseId, name: entry.name, type: entry.type, sets: [set] });
      if (t && t.score > prevBest) pr = h('span.pill.pr', { text: 'rekord' });
    }
    const del = h('button.icon-btn.small', { type: 'button', 'aria-label': `Usuń serię ${idx + 1}`, onClick: () => { entry.sets = entry.sets.filter(s => s.id !== set.id); Prime.save(); rerender(); } }, ui.icon('x'));
    return h('div.set-row' + (set.done ? '.done' : ''), null, h('span.set-idx', { text: String(idx + 1) }), h('div.set-inputs', null, inputs), pr, check, del);
  }

  function renderEntry(sess, entry, rerender) {
    const ex = entryExercise(entry);
    const prev = previousEntry(entry.exerciseId, sess.date, sess.id);
    let prevBest = null;
    if (prev) { prevBest = topSet(prev.entry).score; }
    // best ever excluding this session, for the "record" pill
    const rec = (function () {
      let best = null;
      countedSessions().forEach(s => { if (s.id === sess.id) return; s.entries.filter(e => e.exerciseId === entry.exerciseId).forEach(e => { const t = topSet(e); if (t && (best === null || t.score > best)) best = t.score; }); });
      return best;
    })();
    const head = h('div.entry-head', null,
      h('div', null, h('div.li-title', { text: ex.name }), h('div.li-sub', { text: ex.muscle || ' ' })),
      h('button.icon-btn.small', { type: 'button', 'aria-label': 'Usuń ćwiczenie z treningu', onClick: async () => {
        if (entry.sets.some(s => s.done)) { const ok = await ui.confirm({ title: 'Usunąć ćwiczenie?', text: 'Ukończone serie tego ćwiczenia zostaną usunięte z treningu.', okLabel: 'Usuń' }); if (!ok) return; }
        sess.entries = sess.entries.filter(e => e.id !== entry.id); Prime.save(); rerender();
      } }, ui.icon('trash')));
    const card = h('div.card.entry-card', null, head);
    if (prev) {
      const pt = topSet(prev.entry);
      card.appendChild(h('div.prev-line', { text: `Poprzednio (${D.shortLabel(prev.session.date)}): ${fmtEntrySummary(prev.entry)}` }));
      void pt;
    } else if (!ex.missing) {
      card.appendChild(h('div.prev-line', { text: 'Pierwszy zapis tego ćwiczenia — brak porównania.' }));
    }
    const rows = h('div.sets');
    entry.sets.forEach((s, i) => rows.appendChild(renderSetRow(sess, entry, ex, s, i, rec, rerender)));
    card.appendChild(rows);
    card.appendChild(h('button.add-btn.small', { type: 'button', onClick: () => { addSet(sess, entry); rerender(); } }, ui.icon('plus'), 'Dodaj serię'));
    const cur = topSet(entry);
    if (cur && prev) {
      const pt = topSet(prev.entry);
      const diff = cur.score - pt.score;
      if (ex.type === 'weights') {
        const dw = cur.set.weight - pt.set.weight;
        card.appendChild(h('div.cmp-line' + (diff > 0 ? '.up' : diff < 0 ? '.down' : ''), { text: `Najlepsza seria: ${fmtSet(ex.type, cur.set)} (${dw === 0 ? 'ten sam ciężar' : (dw > 0 ? '+' : '') + Prime.formatNum(Prime.roundTo(dw, 2)) + ' kg'} vs poprzednio)` }));
      } else {
        card.appendChild(h('div.cmp-line' + (diff > 0 ? '.up' : diff < 0 ? '.down' : ''), { text: `Najlepsza seria: ${fmtSet(ex.type, cur.set)} (poprzednio ${fmtSet(ex.type, pt.set)})` }));
      }
    }
    return card;
  }

  function elapsedLabel(sess) {
    if (!sess.startedAt) return '';
    const start = new Date(sess.startedAt), end = sess.endedAt ? new Date(sess.endedAt) : new Date();
    const mins = Math.max(0, Math.round((end - start) / 60000));
    const t = `${D.pad2(start.getHours())}:${D.pad2(start.getMinutes())}`;
    return `${sess.endedAt ? 'Trwał' : 'W toku'} ${mins} min · start ${t}`;
  }

  function renderSessionEditor(body, sess, api, opts) {
    const rerender = () => api.rerender();
    const finished = sess.status === 'done';
    const nameInput = ui.input({ value: sess.name, maxlength: '80', 'aria-label': 'Nazwa treningu' });
    nameInput.addEventListener('input', () => { sess.name = nameInput.value.slice(0, 80); Prime.saveSoon(); });
    body.appendChild(h('div.card', null,
      h('div.sess-top', null, nameInput),
      h('div.li-sub', { text: `${D.formatWeekday(sess.date)}, ${D.formatFullDate(sess.date)} · ${elapsedLabel(sess)}` }),
      !finished ? h('p.hint', { text: 'Każda zmiana zapisuje się od razu — możesz bezpiecznie zamknąć aplikację w trakcie.' }) : null));
    sess.entries.forEach(e => body.appendChild(renderEntry(sess, e, rerender)));
    body.appendChild(h('button.add-btn', { type: 'button', onClick: () => pickExercise((ex) => {
      const e = newEntry(ex.id); addSet(sess, e, true); sess.entries.push(e); Prime.save(); rerender();
    }) }, ui.icon('plus'), 'Dodaj ćwiczenie'));
    const note = h('textarea.modal-input', { rows: '2', maxlength: '1000', placeholder: 'Notatka do treningu (opcjonalnie)', 'aria-label': 'Notatka do treningu', value: sess.note || '' });
    note.addEventListener('input', () => { sess.note = note.value; Prime.saveSoon(); });
    body.appendChild(note);
    const done = sessionCompleteSets(sess);
    const vol = volumeOf(sess);
    body.appendChild(h('div.summary-line', { text: `Ukończone serie: ${done}${vol ? ` · objętość: ${vol} kg (tylko serie z ciężarem i powtórzeniami)` : ''}` }));
    if (!finished) {
      body.appendChild(h('div.row-actions.stack', null,
        h('button.btn.primary.block', { type: 'button', onClick: async () => { if (await finishSession(sess)) { opts.onFinish(); } } }, 'Zakończ trening'),
        h('button.btn.ghost.block', { type: 'button', onClick: async () => { if (await discardSession(sess)) opts.onDiscard(); } }, 'Usuń ten trening')));
    } else {
      body.appendChild(h('div.row-actions.stack', null,
        h('button.btn.primary.block', { type: 'button', onClick: () => { Prime.save(); Prime.refresh(); opts.onFinish(); } }, 'Gotowe'),
        h('button.btn.ghost.block', { type: 'button', onClick: async () => { if (await discardSession(sess)) opts.onDiscard(); } }, 'Usuń trening z historii')));
    }
  }

  /* ---------------- UI: plans ---------------- */

  function renderPlanEditor(body, plan, api, onBack) {
    const name = ui.input({ value: plan.name, maxlength: '80', 'aria-label': 'Nazwa planu' });
    name.addEventListener('input', () => { plan.name = name.value.slice(0, 80); Prime.saveSoon(); });
    body.appendChild(h('div.card', null, ui.field('Nazwa planu', name)));
    const card = h('div.card');
    card.appendChild(h('div.sub-title', { text: 'Ćwiczenia w planie' }));
    if (!plan.exercises.length) card.appendChild(ui.emptyState('Plan jest pusty.', 'Dodaj ćwiczenia z biblioteki lub własne.', true));
    plan.exercises.forEach((id, i) => {
      const ex = exerciseById(id);
      card.appendChild(h('div.edit-row', null,
        h('span', { text: `${i + 1}. ${ex.name}` }),
        h('div.row-actions', null,
          h('button.icon-btn.small', { type: 'button', disabled: i === 0, 'aria-label': 'Przesuń w górę', onClick: () => { plan.exercises.splice(i - 1, 0, plan.exercises.splice(i, 1)[0]); Prime.save(); api.rerender(); } }, ui.icon('arrow-up')),
          h('button.icon-btn.small', { type: 'button', disabled: i === plan.exercises.length - 1, 'aria-label': 'Przesuń w dół', onClick: () => { plan.exercises.splice(i + 1, 0, plan.exercises.splice(i, 1)[0]); Prime.save(); api.rerender(); } }, ui.icon('arrow-down')),
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Usuń z planu', onClick: () => { plan.exercises.splice(i, 1); Prime.save(); api.rerender(); } }, ui.icon('x')))));
    });
    card.appendChild(h('button.add-btn.small', { type: 'button', onClick: () => pickExercise((ex) => { plan.exercises.push(ex.id); Prime.save(); api.rerender(); }) }, ui.icon('plus'), 'Dodaj ćwiczenie'));
    body.appendChild(card);
    body.appendChild(h('button.btn.primary.block', { type: 'button', text: 'Gotowe', onClick: () => { Prime.save(); onBack(); } }));
  }

  /* ---------------- UI: main panel ---------------- */

  function openPanel(startTab) {
    const st = { tab: startTab || (activeSession() ? 'session' : 'session'), planEdit: null, sessionEdit: null, exMuscle: 'all', histMonth: null };

    function tabsBar(api) {
      const items = [['session', 'Trening'], ['plans', 'Plany'], ['exercises', 'Ćwiczenia'], ['history', 'Historia']];
      return h('div.seg.wide', { role: 'tablist' }, items.map(([k, label]) => h('button.seg-btn', { type: 'button', role: 'tab', 'aria-selected': String(st.tab === k), 'aria-pressed': String(st.tab === k), text: label, onClick: () => {
        st.tab = k; st.planEdit = null; st.sessionEdit = null; api.rerender();
      } })));
    }

    ui.openPanel({
      id: 'workouts', title: 'Dziennik treningowy',
      render(body, api) {
        if (st.planEdit) { const p = plans().find(x => x.id === st.planEdit); if (p) { renderPlanEditor(body, p, api, () => { st.planEdit = null; api.rerender(); }); return; } st.planEdit = null; }
        if (st.sessionEdit) {
          const s = sessions().find(x => x.id === st.sessionEdit);
          if (s) { renderSessionEditor(body, s, api, { onFinish: () => { st.sessionEdit = null; st.tab = 'history'; api.rerender(); }, onDiscard: () => { st.sessionEdit = null; api.rerender(); } }); return; }
          st.sessionEdit = null;
        }
        body.appendChild(tabsBar(api));
        if (st.tab === 'session') tabSession(body, api, st);
        else if (st.tab === 'plans') tabPlans(body, api, st);
        else if (st.tab === 'exercises') tabExercises(body, api, st);
        else tabHistory(body, api, st);
      },
    });
  }

  function tabSession(body, api, st) {
    const act = activeSession();
    if (act) {
      renderSessionEditor(body, act, api, { onFinish: () => { st.tab = 'history'; api.rerender(); }, onDiscard: () => api.rerender() });
      return;
    }
    const defaultDate = Prime.date <= Prime.today() ? Prime.date : Prime.today();
    const dateInput = ui.input({ type: 'date', value: defaultDate, max: Prime.today(), 'aria-label': 'Data treningu' });
    const start = (plan) => {
      const ds = D.isDateStr(dateInput.value) ? dateInput.value : Prime.today();
      startSession(ds, plan); Prime.refresh(); api.rerender();
    };
    const card = h('div.card', null,
      h('div.sub-title', { text: 'Rozpocznij trening' }),
      ui.field('Data', dateInput));
    const active = plans().filter(p => !p.archived);
    if (active.length) {
      card.appendChild(h('div.sub-title.pad', { text: 'Z planu' }));
      active.forEach(p => card.appendChild(h('button.list-item.clickable.btn-like', { type: 'button', onClick: () => start(p) },
        h('div.li-main', null, h('div.li-title', { text: p.name }), h('div.li-sub', { text: `${p.exercises.length} ${Prime.plural(p.exercises.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}` })),
        h('span.li-value', null, ui.icon('play')))));
    } else {
      card.appendChild(h('p.hint', { text: 'Nie masz jeszcze planów. Możesz zacząć od pustego treningu albo utworzyć plan w zakładce „Plany”.' }));
    }
    card.appendChild(h('button.btn.primary.block', { type: 'button', text: 'Pusty trening', onClick: () => start(null) }));
    body.appendChild(card);

    const last = countedSessions().sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last) {
      body.appendChild(ui.sectionHead('Ostatni trening'));
      body.appendChild(sessionCard(last, api, st));
    }
  }

  function sessionCard(sess, api, st) {
    const sets = sessionCompleteSets(sess), vol = volumeOf(sess);
    const names = sess.entries.filter(e => completeSets(e).length).map(e => entryExercise(e).name);
    return h('button.list-item.clickable.btn-like', { type: 'button', onClick: () => { st.sessionEdit = sess.id; api.rerender(); } },
      h('div.li-main', null,
        h('div.li-title', { text: `${sess.name || 'Trening'} · ${D.shortLabel(sess.date)}` }),
        h('div.li-sub', { text: `${sets} ${Prime.plural(sets, 'seria', 'serie', 'serii')}${vol ? ` · ${vol} kg objętości` : ''}${names.length ? ' · ' + names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '') : ''}` })),
      h('span.li-value', null, ui.icon('chevron-right')));
  }

  function tabPlans(body, api, st) {
    let archived = false;
    const draw = () => {
      ui.clear(wrap);
      const list = plans().filter(p => !!p.archived === archived);
      if (!list.length) wrap.appendChild(ui.emptyState(archived ? 'Brak zarchiwizowanych planów.' : 'Brak planów.', archived ? '' : 'Utwórz plan, np. „Push”, „Pull”, „Nogi”.'));
      list.forEach(p => wrap.appendChild(h('div.card', null,
        h('div.habit-card-top', null,
          h('div', null, h('div.li-title', { text: p.name }), h('div.li-sub', { text: p.exercises.map(id => exerciseById(id).name).slice(0, 4).join(', ') + (p.exercises.length > 4 ? '…' : '') || 'pusty plan' })),
          h('div.row-actions', null,
            h('button.icon-btn.small', { type: 'button', 'aria-label': 'Edytuj plan', onClick: () => { st.planEdit = p.id; api.rerender(); } }, ui.icon('edit')),
            h('button.icon-btn.small', { type: 'button', 'aria-label': 'Kopiuj plan', onClick: () => {
              plans().push({ id: Prime.uid(), name: p.name + ' (kopia)', exercises: p.exercises.slice(), archived: false, createdAt: Prime.today() }); Prime.save(); api.rerender();
            } }, ui.icon('copy')),
            h('button.icon-btn.small', { type: 'button', 'aria-label': p.archived ? 'Przywróć plan' : 'Archiwizuj plan', onClick: () => { p.archived = !p.archived; Prime.save(); api.rerender(); } }, ui.icon('archive')))))));
    };
    const wrap = h('div');
    body.appendChild(h('div.section-head', null, h('h2', { text: 'Plany treningowe' }),
      h('button.chip-btn', { type: 'button', onClick: () => {
        const p = { id: Prime.uid(), name: 'Nowy plan', exercises: [], archived: false, createdAt: Prime.today() };
        plans().push(p); Prime.save(); st.planEdit = p.id; api.rerender();
      } }, ui.icon('plus'), 'Nowy plan')));
    body.appendChild(wrap);
    body.appendChild(h('div.row-actions.center', null, h('button.text-btn', { type: 'button', text: 'Pokaż zarchiwizowane / aktywne', onClick: () => { archived = !archived; draw(); } })));
    draw();
  }

  function tabExercises(body, api, st) {
    body.appendChild(h('div.section-head', null, h('h2', { text: 'Biblioteka ćwiczeń' }),
      h('button.chip-btn', { type: 'button', onClick: () => openExerciseForm(null) }, ui.icon('plus'), 'Własne')));
    const chips = h('div.chip-row.scroll-x');
    ['all'].concat(MUSCLES).forEach(m => chips.appendChild(h('button.chip' + (st.exMuscle === m ? '.active' : ''), { type: 'button', 'aria-pressed': String(st.exMuscle === m), text: m === 'all' ? 'Wszystkie' : m, onClick: () => { st.exMuscle = m; api.rerender(); } })));
    body.appendChild(chips);
    const items = allExercises().filter(e => st.exMuscle === 'all' || e.muscle === st.exMuscle);
    const list = h('ul.list');
    items.forEach(e => {
      const r = recordsFor(e.id);
      const sub = r.sessions ? `${r.sessions} ${Prime.plural(r.sessions, 'trening', 'treningi', 'treningów')} · rekord: ${fmtSet(e.type, r.best.set)}` : (e.muscle || '—') + (e.builtin ? '' : ' · własne');
      list.appendChild(h('li.list-item.clickable', { role: 'button', tabindex: '0', onClick: () => openExerciseDetail(e), onKeydown: (ev) => { if (ev.key === 'Enter') openExerciseDetail(e); } },
        h('div.li-main', null, h('div.li-title', { text: e.name }), h('div.li-sub', { text: sub })),
        h('span.li-value', null, ui.icon('chevron-right'))));
    });
    body.appendChild(list);
  }

  function openExerciseDetail(ex) {
    const r = recordsFor(ex.id);
    const series = progressSeries(ex.id);
    const body = h('div');
    if (!r.sessions) body.appendChild(ui.emptyState('Brak zapisanych serii tego ćwiczenia.', 'Rekordy i wykres pojawią się po pierwszym ukończonym treningu.', true));
    else {
      body.appendChild(h('div.summary-grid', null,
        ui.statBox(fmtSet(ex.type, r.best.set), `Rekord (${D.shortLabel(r.bestDate)})`),
        ui.statBox(String(r.sessions), 'Treningi z tym ćwiczeniem'),
        ui.statBox(String(r.sets), 'Ukończone serie'),
        ex.type === 'weights' ? ui.statBox(Math.round(r.volume) + ' kg', 'Objętość łącznie') : ui.statBox(unitOf(ex.type), 'Jednostka')));
      if (series.length >= 2) {
        const holder = h('div.chart-holder');
        body.appendChild(h('div.chart-title', { text: 'Najlepsza seria w kolejnych treningach' }));
        body.appendChild(holder);
        setTimeout(() => Prime.charts.mount(holder, 'line', series.map(p => ({ y: p.value })), { labels: [D.shortLabel(series[0].date), D.shortLabel(series[series.length - 1].date)], height: 110, label: 'Postęp ćwiczenia ' + ex.name }), 0);
      } else body.appendChild(h('p.hint', { text: 'Wykres pojawi się po co najmniej dwóch treningach z tym ćwiczeniem.' }));
    }
    const actions = [{ label: 'Zamknij', kind: 'ghost' }];
    if (!ex.builtin) actions.unshift({ label: 'Edytuj', kind: 'primary', keepOpen: true, onClick: () => openExerciseForm(ex) });
    ui.sheet({ title: ex.name, sub: `${ex.muscle || '—'} · ${TYPES.find(t => t.value === ex.type).label}`, body, actions, focus: false });
  }

  function tabHistory(body, api, st) {
    const done = sessions().filter(s => s.status === 'done').sort((a, b) => (b.date + (b.startedAt || '')).localeCompare(a.date + (a.startedAt || '')));
    const today = Prime.today();
    const wk = D.weekDates(today);
    const counted = countedSessions();
    const thisWeek = weekCount(wk);
    body.appendChild(h('div.summary-grid', null,
      ui.statBox(String(thisWeek), `Dni z treningiem (${D.rangeLabel(wk[0], wk[6])})`),
      ui.statBox(String(counted.length), 'Zapisane treningi łącznie'),
      ui.statBox(String(counted.reduce((a, s) => a + sessionCompleteSets(s), 0)), 'Ukończone serie łącznie'),
      ui.statBox(counted.reduce((a, s) => a + volumeOf(s), 0).toLocaleString('pl-PL') + ' kg', 'Objętość (serie z ciężarem)')));
    if (!done.length) { body.appendChild(ui.emptyState('Brak zapisanych treningów.', 'Zakończ pierwszy trening, a pojawi się tutaj.')); return; }
    body.appendChild(ui.sectionHead('Historia'));
    done.slice(0, 60).forEach(s => body.appendChild(sessionCard(s, api, st)));
    if (done.length > 60) body.appendChild(h('p.hint', { text: `Pokazano 60 najnowszych z ${done.length}.` }));
  }

  /* ---------------- Today section ---------------- */

  function renderToday(container, ds) {
    ui.clear(container);
    const act = activeSession();
    const status = dayStatus(ds);
    const card = h('div.card.workout-card');
    if (act) {
      card.appendChild(h('div.wk-top', null, h('div', null, h('div.li-title', { text: 'Trening w toku' }), h('div.li-sub', { text: `${act.name} · ${D.shortLabel(act.date)} · ${sessionCompleteSets(act)} ukończonych serii` })),
        h('span.pill.accent', { text: 'zapisuje się na bieżąco' })));
      card.appendChild(h('button.btn.primary.block', { type: 'button', text: 'Wróć do treningu', onClick: () => openPanel('session') }));
    } else {
      const todays = countedOn(ds);
      const line = todays.length
        ? todays.map(s => `${s.name || 'Trening'} — ${sessionCompleteSets(s)} ${Prime.plural(sessionCompleteSets(s), 'seria', 'serie', 'serii')}`).join(' · ')
        : (status.kind === 'done' ? 'Zaliczony przez zadanie z kategorią „Trening”.' : status.kind === 'planned' ? 'Masz zaplanowane zadanie treningowe.' : 'Brak treningu tego dnia.');
      card.appendChild(h('div.wk-top', null, h('div', null, h('div.li-title', { text: 'Trening' }), h('div.li-sub', { text: line })),
        h('span.pill' + (status.kind === 'done' ? '.good' : status.kind === 'planned' ? '.warn' : ''), { text: status.label })));
      card.appendChild(h('div.row-actions', null,
        h('button.btn.small.primary', { type: 'button', onClick: () => { Prime.date = ds; openPanel('session'); } }, ui.icon('play'), 'Rozpocznij trening'),
        h('button.btn.small.ghost', { type: 'button', onClick: () => openPanel('history') }, 'Dziennik')));
    }
    container.appendChild(card);
  }

  Prime.mods.workouts = {
    BUILTIN, MUSCLES, TYPES, allExercises, exerciseById, activeSession, sessions, countedSessions, isCounted,
    completeSets, sessionCompleteSets, volumeOf, topSet, fmtSet, recordsFor, progressSeries, previousEntry,
    sessionsOn, countedOn, trainedOn, weekCount, dayStatus, setComplete, entryExercise,
    openPanel, renderToday, startSession, unitOf,
  };
})();
