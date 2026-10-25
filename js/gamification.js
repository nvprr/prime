/* ============================================================
   PRIME LIFE MAXING — gamification.js
   XP, levels and badges — DERIVED, never stored as events.

   Why derived: every point is recomputed from real entries (done tasks,
   finished workouts, ticked habits …) dated on/after `xp.startDate`
   (the day the upgrade happened). That makes it impossible to
   - award XP twice for clicking the same task again,
   - double-award after saving/re-opening or after an import,
   and the whole history can be reproduced exactly from the data.
   Nothing is ever deducted for rest days, illness or missing workouts;
   points only change if a real entry is changed or removed.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  const R = { task: 10, taskCap: 10, big3: 5, habit: 5, careBlock: 10, water: 5, protein: 5, workout: 50, workoutCap: 2, growth: 15, growthCap: 2, habitWeek: 20, consistentWeek: 40 };

  const floorFor = (L) => 50 * L * (L - 1);
  function levelFor(xp) { let L = 1; while (floorFor(L + 1) <= xp) L++; return L; }

  const BADGES = [
    { id: 'first-workout', name: 'Pierwszy trening', desc: 'Zakończ i zapisz pierwszy trening z ukończonymi seriami.', test: (c) => c.workouts >= 1 },
    { id: 'workouts-10', name: '10 treningów', desc: 'Zapisz 10 treningów.', test: (c) => c.workouts >= 10 },
    { id: 'tasks-100', name: '100 zadań', desc: 'Wykonaj 100 zadań od startu.', test: (c) => c.tasksDone >= 100 },
    { id: 'streak-7', name: '7 dni z rzędu', desc: 'Zalicz 7 dni pod rząd (dni wolne nie przerywają).', test: (c) => c.bestStreak >= 7 },
    { id: 'habit-week', name: 'Tydzień nawyków', desc: 'Zrealizuj ≥ 80% nawyków w pełnym tygodniu.', test: (c) => c.habitWeek80 },
    { id: 'fuel-7', name: '7 dni białka', desc: 'Osiągnij cel białka w 7 dniach.', test: (c) => c.proteinDays >= 7 },
    { id: 'sleep-7', name: '7 dobrych nocy', desc: 'Zapisz sen na poziomie celu w 7 nocach.', test: (c) => c.sleepDays >= 7 },
    { id: 'growth-5', name: '5 sesji rozwoju', desc: 'Zapisz 5 sesji rozwoju.', test: (c) => c.growthSessions >= 5 },
    { id: 'saver', name: 'Pierwsza oszczędność', desc: 'Odłóż pierwszą kwotę na oszczędności.', test: (c) => c.saved },
    { id: 'level-5', name: 'Poziom 5', desc: 'Osiągnij 5. poziom.', test: (c, xp) => levelFor(xp) >= 5 },
  ];

  function compute() {
    const st = Prime.state, today = Prime.today(), start = st.xp.startDate;
    const W = Prime.mods.workouts, G = Prime.state.growth, Hb = Prime.mods.habits;
    const parts = { tasks: 0, big3: 0, habits: 0, care: 0, fuel: 0, training: 0, growth: 0, weekly: 0 };
    const habitIds = new Set(st.habits.map(x => x.id));
    const counted = W.countedSessions();
    const wByDate = {}; counted.forEach(s => { wByDate[s.date] = (wByDate[s.date] || 0) + 1; });
    const gByDate = {}; G.sessions.filter(s => s.minutes > 0).forEach(s => { gByDate[s.date] = (gByDate[s.date] || 0) + 1; });
    const dateSet = new Set(Prime.dayKeys());
    Object.keys(wByDate).concat(Object.keys(gByDate)).forEach(d => dateSet.add(d));
    const dates = Array.from(dateSet).filter(ds => ds >= start && ds <= today).sort();

    const ctx = { tasksDone: 0, workouts: 0, bestStreak: 0, habitWeek80: false, proteinDays: 0, sleepDays: 0, growthSessions: 0, saved: false };
    const s = st.settings;
    dates.forEach(ds => {
      const d = st.days[ds];
      if (d) {
        const done = d.tasks.filter(t => t.done);
        parts.tasks += Math.min(done.length, R.taskCap) * R.task;
        ctx.tasksDone += done.length;
        parts.big3 += Math.min(3, done.filter(t => t.priority).length) * R.big3;
        parts.habits += Object.keys(d.habits || {}).filter(id => habitIds.has(id)).length * R.habit;
        if (Hb.blockComplete('morning', ds)) parts.care += R.careBlock;
        if (Hb.blockComplete('evening', ds)) parts.care += R.careBlock;
        if (s.waterGoal > 0 && d.water / 1000 >= s.waterGoal) parts.fuel += R.water;
        if (s.proteinGoal > 0 && d.protein >= s.proteinGoal) { parts.fuel += R.protein; ctx.proteinDays++; }
        if (d.sleep !== null && d.sleep >= s.sleepGoal) ctx.sleepDays++;
      }
      if (wByDate[ds]) { parts.training += Math.min(R.workoutCap, wByDate[ds]) * R.workout; ctx.workouts += wByDate[ds]; }
      if (gByDate[ds]) { parts.growth += Math.min(R.growthCap, gByDate[ds]) * R.growth; ctx.growthSessions += gByDate[ds]; }
    });

    // best streak in range (rest days neutral)
    let cur = 0;
    for (let ds = start; ds <= today; ds = D.addDays(ds, 1)) {
      if (Prime.isRest(ds)) continue;
      if (Prime.dayPasses(ds)) { cur++; if (cur > ctx.bestStreak) ctx.bestStreak = cur; } else cur = 0;
    }

    // weekly bonuses: only for COMPLETE weeks that began on/after the start date
    for (let ws = D.weekStart(start) < start ? D.addDays(D.weekStart(start), 7) : D.weekStart(start); D.addDays(ws, 6) < today; ws = D.addDays(ws, 7)) {
      const wk = D.weekDates(ws);
      st.habits.forEach(hb => {
        if (hb.archived || hb.createdAt > ws) return;
        if (Hb.weekDone(hb, wk) >= Hb.weeklyTarget(hb)) parts.weekly += R.habitWeek;
      });
      const avg = Hb.weekAverage(wk);
      if (avg !== null && avg >= 80) ctx.habitWeek80 = true;
      if (wk.filter(ds => !Prime.isRest(ds) && Prime.dayPasses(ds)).length >= 5) parts.weekly += R.consistentWeek;
    }

    ctx.saved = Prime.state.finance.transactions.some(t => t.type === 'save' && t.date >= start);
    const total = Object.keys(parts).reduce((a, k) => a + parts[k], 0);
    const level = levelFor(total);
    const floor = floorFor(level), next = floorFor(level + 1);
    return {
      total, level, floor, next, pct: Math.round(((total - floor) / (next - floor)) * 100), parts, ctx, start,
      badges: BADGES.map(b => ({ id: b.id, name: b.name, desc: b.desc, earned: !!b.test(ctx, total) })),
    };
  }

  const PART_LABELS = { tasks: 'Wykonane zadania', big3: 'Big 3', habits: 'Nawyki', care: 'Rutyna pielęgnacyjna', fuel: 'Woda i białko (cele)', training: 'Treningi', growth: 'Sesje rozwoju', weekly: 'Bonusy tygodniowe' };

  function miniText() {
    if (!Prime.modEnabled('xp')) return '';
    const x = compute();
    return `Poz. ${x.level} · ${x.total} XP`;
  }

  function openPanel() {
    ui.openPanel({
      id: 'xp', title: 'Poziom i odznaki',
      render(body) {
        const x = compute();
        body.appendChild(h('div.card.xp-card', null,
          h('div.wk-top', null, h('div', null, h('div.li-sub', { text: 'Poziom' }), h('div.big-num', { text: String(x.level) })), h('div.right', null, h('div.li-sub', { text: 'Razem' }), h('div.big-num.small', { text: x.total + ' XP' }))),
          ui.progress(x.pct, false), h('div.li-sub', { text: `${x.total - x.floor} / ${x.next - x.floor} XP do poziomu ${x.level + 1} · liczone od ${D.formatFullDate(x.start)}` })));
        const bd = h('div.card', null, h('div.sub-title', { text: 'Skąd punkty' }));
        Object.keys(x.parts).forEach(k => bd.appendChild(h('div.edit-row', null, h('span', { text: PART_LABELS[k] }), h('strong', { text: '+' + x.parts[k] }))));
        body.appendChild(bd);
        body.appendChild(ui.sectionHead('Odznaki'));
        const grid = h('div.badge-grid');
        x.badges.forEach(b => grid.appendChild(h('div.badge' + (b.earned ? '.earned' : ''), null, ui.icon(b.earned ? 'trophy' : 'lock'), h('div.badge-name', { text: b.name }), h('div.badge-desc', { text: b.desc }))));
        body.appendChild(grid);
        body.appendChild(h('p.hint', { text: 'Punkty wynikają wyłącznie z Twoich wpisów: ponowne kliknięcie zadania ani import danych nie przyznają ich drugi raz, a dzień odpoczynku, choroba czy brak treningu nie odejmują punktów. Odznaczenie zadania cofa jedynie jego własne punkty. Zaliczane są wpisy od dnia startu systemu — bez nagród wstecz.' }));
      },
    });
  }

  Prime.mods.xp = { compute, miniText, openPanel, levelFor, RULES: R, BADGES };
})();
