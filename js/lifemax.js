/* ============================================================
   PRIME LIFE MAXING — lifemax.js
   The challenge (26 Oct – 31 Dec 2026 by default, editable), the
   dashboard on "Dzisiaj" and the weekly review.

   Everything shown is derived from the user's own entries. Nothing is
   invented: with no data an area shows "—" / an empty state. The
   weekly "what to change" hints only point at the lowest completion
   of the user's OWN targets and never claim a cause.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  /* ---------------- challenge ---------------- */

  function challenge(today) {
    const c = Prime.state.challenge;
    const total = D.diffDays(c.start, c.end) + 1;
    let status = 'active', daysLeft = D.diffDays(today, c.end), elapsed = 0;
    if (today < c.start) { status = 'upcoming'; daysLeft = D.diffDays(today, c.start); }
    else if (today > c.end) { status = 'ended'; daysLeft = 0; elapsed = total; }
    else elapsed = D.diffDays(c.start, today) + 1;
    return { name: c.name, start: c.start, end: c.end, goal: c.goal, total, status, daysLeft, elapsed, pct: total > 0 ? Math.round((elapsed / total) * 100) : 0 };
  }

  /* ---------------- metrics ---------------- */

  /** Habit completion over any number of days, scaled from weekly targets (null if no habits apply). */
  function habitsPct(dates) {
    const Hb = Prime.mods.habits;
    const vals = [];
    Prime.state.habits.forEach(hb => {
      if (hb.archived) return;
      const eligible = dates.filter(ds => ds >= hb.createdAt);
      if (!eligible.length) return;
      const expected = Hb.weeklyTarget(hb) * eligible.length / 7;
      const done = eligible.filter(ds => Hb.isDone(hb, ds)).length;
      vals.push(Math.min(1, done / Math.max(expected, 0.0001)));
    });
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : null;
  }

  function metrics(dates) {
    const st = Prime.state, s = st.settings;
    const W = Prime.mods.workouts, N = Prime.mods.nutrition, Hb = Prime.mods.habits, G = Prime.mods.growth, F = Prime.mods.finance;
    let tasksDone = 0, tasksTotal = 0, scoreSum = 0, scoreDays = 0, sleepSum = 0, sleepNights = 0, sleepOnGoal = 0, careDays = 0, passDays = 0, restDays = 0;
    dates.forEach(ds => {
      const d = st.days[ds];
      if (!d) return;
      const sc = Prime.computeScore(d);
      tasksDone += sc.done; tasksTotal += sc.total;
      if (sc.pct !== null) { scoreSum += sc.pct; scoreDays++; }
      if (d.sleep !== null) { sleepSum += d.sleep; sleepNights++; if (d.sleep >= s.sleepGoal) sleepOnGoal++; }
      const cs = Hb.careStatus(ds); if (cs.total > 0 && cs.done === cs.total) careDays++;
      if (Prime.dayPasses(ds)) passDays++;
      if (d.rest) restDays++;
    });
    const diet = N.summary(dates);
    const gs = G.weekStats(dates);
    const fin = F.rangeSummary(dates);
    const sessions = W.countedSessions().filter(x => dates.indexOf(x.date) !== -1);
    return {
      dates, tasksDone, tasksTotal, avgScore: scoreDays ? Math.round(scoreSum / scoreDays) : null, passDays, restDays,
      trainingDays: W.weekCount(dates), sessions: sessions.length, sets: sessions.reduce((a, x) => a + W.sessionCompleteSets(x), 0),
      diet, sleepAvg: sleepNights ? Prime.roundTo(sleepSum / sleepNights, 1) : null, sleepNights, sleepOnGoal,
      habits: habitsPct(dates), careDays, growth: gs, finance: fin,
    };
  }

  /* ---------------- hero (Today) ---------------- */

  function greeting() {
    const hr = new Date().getHours();
    const name = Prime.state.settings.name;
    const base = hr < 5 ? 'Dobrej nocy' : hr < 11 ? 'Dzień dobry' : hr < 18 ? 'Cześć' : 'Dobry wieczór';
    return name ? `${base}, ${name}` : base;
  }

  function chip(icon, text, tone) {
    return h('span.stat-chip' + (tone ? '.' + tone : ''), null, ui.icon(icon), text);
  }

  function renderHero(ds) {
    const c = challenge(Prime.today());
    const day = Prime.day(ds), s = Prime.state.settings;
    document.getElementById('heroGreeting').textContent = greeting();
    document.getElementById('heroSub').textContent = ds === Prime.today() ? `${D.formatWeekday(ds)}, ${D.formatFullDate(ds)}` : `Podgląd dnia: ${D.formatWeekday(ds)}, ${D.formatFullDate(ds)}`;

    const days = document.getElementById('heroDays');
    ui.clear(days);
    if (c.status === 'active') days.appendChild(h('div', null, h('div.hero-num', { text: String(c.daysLeft) }), h('div.hero-num-label', { text: Prime.plural(c.daysLeft, 'dzień do końca', 'dni do końca', 'dni do końca') })));
    else if (c.status === 'upcoming') days.appendChild(h('div', null, h('div.hero-num', { text: String(c.daysLeft) }), h('div.hero-num-label', { text: 'dni do startu' })));
    else days.appendChild(h('div', null, h('div.hero-num.done', null, ui.icon('flag')), h('div.hero-num-label', { text: 'wyzwanie zakończone' })));

    const ch = document.getElementById('heroChallenge');
    ui.clear(ch);
    ch.appendChild(h('div.hero-challenge-row', null, h('span', { text: c.name }), h('span.li-sub', { text: `${D.dayMonthShort(c.start)} – ${D.dayMonthShort(c.end)} ${c.end.slice(0, 4)}` })));
    ch.appendChild(ui.progress(c.pct, true));
    if (c.status === 'ended') ch.appendChild(h('button.btn.small.primary', { type: 'button', text: 'Zobacz podsumowanie wyzwania', onClick: openSummary }));

    const chips = document.getElementById('heroChips');
    ui.clear(chips);
    const W = Prime.mods.workouts, Hb = Prime.mods.habits;
    if (Prime.modEnabled('training')) { const w = W.dayStatus(ds); chips.appendChild(chip('dumbbell', 'Trening: ' + w.label, w.kind === 'done' ? 'good' : w.kind === 'active' ? 'accent' : w.kind === 'planned' ? 'warn' : '')); }
    if (Prime.modEnabled('habits')) { const hs = Hb.dayStatus(ds); if (hs.total > 0) chips.appendChild(chip('repeat', `Nawyki: ${hs.done}/${hs.total}`, hs.done === hs.total ? 'good' : '')); }
    if (Prime.modEnabled('care')) { const cs = Hb.careStatus(ds); if (cs.total > 0) chips.appendChild(chip('sparkle', `Pielęgnacja: ${cs.done}/${cs.total}`, cs.done === cs.total ? 'good' : '')); }
    const wp = s.waterGoal > 0 ? Math.round((day.water / 1000 / s.waterGoal) * 100) : 0;
    chips.appendChild(chip('drop', `Woda: ${wp}%`, wp >= 100 ? 'good' : ''));
    if (Prime.modEnabled('nutrition') && s.proteinGoal > 0) chips.appendChild(chip('bolt', `Białko: ${Prime.formatNum(Prime.roundTo(day.protein, 1))}/${s.proteinGoal} g`, day.protein >= s.proteinGoal ? 'good' : ''));
    chips.appendChild(chip('moon', day.sleep !== null ? `Sen: ${day.sleep} h` : 'Sen: —', day.sleep !== null && day.sleep >= s.sleepGoal ? 'good' : ''));
  }

  /* ---------------- weekly review ---------------- */

  function goalsDueSoon() {
    const out = [];
    const today = Prime.today();
    (Prime.state.goals || []).forEach(g => {
      if (!g.deadline) return;
      const left = D.diffDays(today, g.deadline);
      if (left <= 30) out.push({ goal: g, left, pct: Prime.mods.goals.progressPct(g) });
    });
    return out.sort((a, b) => a.left - b.left);
  }

  function fmtDelta(cur, prev, unit, higherBetter) {
    if (cur === null || cur === undefined || prev === null || prev === undefined) return { text: '—', tone: '' };
    const d = Prime.roundTo(cur - prev, 1);
    if (d === 0) return { text: 'bez zmian', tone: '' };
    const better = higherBetter === null ? null : (higherBetter ? d > 0 : d < 0);
    return { text: `${d > 0 ? '+' : ''}${d}${unit}`, tone: better === null ? '' : better ? 'good' : 'bad' };
  }

  function weeklyRows(cur, prev) {
    const f = Prime.formatNum;
    const rows = [
      { label: 'Zadania', cur: `${cur.tasksDone}/${cur.tasksTotal}`, prev: `${prev.tasksDone}/${prev.tasksTotal}`, d: fmtDelta(cur.tasksDone, prev.tasksDone, '', true) },
      { label: 'Śr. Daily Score', cur: cur.avgScore === null ? '—' : cur.avgScore + '%', prev: prev.avgScore === null ? '—' : prev.avgScore + '%', d: fmtDelta(cur.avgScore, prev.avgScore, ' pp', true) },
    ];
    if (Prime.modEnabled('training')) rows.push({ label: 'Dni treningowe', cur: String(cur.trainingDays), prev: String(prev.trainingDays), d: fmtDelta(cur.trainingDays, prev.trainingDays, '', true) });
    if (Prime.modEnabled('habits')) rows.push({ label: 'Nawyki', cur: cur.habits === null ? '—' : cur.habits + '%', prev: prev.habits === null ? '—' : prev.habits + '%', d: fmtDelta(cur.habits, prev.habits, ' pp', true) });
    if (Prime.modEnabled('nutrition')) {
      rows.push({ label: 'Śr. białko', cur: cur.diet.avgProtein === null ? '—' : cur.diet.avgProtein + ' g', prev: prev.diet.avgProtein === null ? '—' : prev.diet.avgProtein + ' g', d: fmtDelta(cur.diet.avgProtein, prev.diet.avgProtein, ' g', true) });
      rows.push({ label: 'Śr. kalorie', cur: cur.diet.avgKcal === null ? '—' : cur.diet.avgKcal + ' kcal', prev: prev.diet.avgKcal === null ? '—' : prev.diet.avgKcal + ' kcal', d: fmtDelta(cur.diet.avgKcal, prev.diet.avgKcal, ' kcal', null) });
    }
    rows.push({ label: 'Śr. sen', cur: cur.sleepAvg === null ? '—' : cur.sleepAvg + ' h', prev: prev.sleepAvg === null ? '—' : prev.sleepAvg + ' h', d: fmtDelta(cur.sleepAvg, prev.sleepAvg, ' h', true) });
    if (Prime.modEnabled('growth')) rows.push({ label: 'Sesje rozwoju', cur: `${cur.growth.sessions}/${cur.growth.goal}`, prev: `${prev.growth.sessions}`, d: fmtDelta(cur.growth.sessions, prev.growth.sessions, '', true) });
    if (Prime.modEnabled('finance') && Prime.mods.finance.hasData()) {
      rows.push({ label: 'Wydatki', cur: Prime.mods.finance.money(cur.finance.out), prev: Prime.mods.finance.money(prev.finance.out), d: fmtDelta(cur.finance.out, prev.finance.out, ' zł', null) });
      rows.push({ label: 'Odłożone', cur: Prime.mods.finance.money(cur.finance.save), prev: Prime.mods.finance.money(prev.finance.save), d: fmtDelta(cur.finance.save, prev.finance.save, ' zł', true) });
    }
    void f;
    return rows;
  }

  /** Completion of the user's OWN weekly targets, lowest first. */
  function attention(cur) {
    const s = Prime.state.settings, out = [];
    if (Prime.modEnabled('training') && s.weeklyWorkouts > 0) out.push({ area: 'Trening', pct: Math.round(Math.min(1, cur.trainingDays / s.weeklyWorkouts) * 100), note: `${cur.trainingDays} z ${s.weeklyWorkouts} zaplanowanych dni treningowych` });
    if (Prime.modEnabled('habits') && cur.habits !== null) out.push({ area: 'Nawyki', pct: cur.habits, note: `realizacja nawyków ${cur.habits}%` });
    if (Prime.modEnabled('nutrition') && s.proteinGoal > 0 && cur.diet.protDays > 0) out.push({ area: 'Białko', pct: Math.round((cur.diet.proteinGoalDays / cur.diet.protDays) * 100), note: `cel białka osiągnięty w ${cur.diet.proteinGoalDays} z ${cur.diet.protDays} zapisanych dni` });
    if (cur.sleepNights > 0) out.push({ area: 'Sen', pct: Math.round((cur.sleepOnGoal / cur.sleepNights) * 100), note: `${cur.sleepOnGoal} z ${cur.sleepNights} nocy na poziomie celu snu` });
    if (Prime.modEnabled('growth') && cur.growth.goal > 0) out.push({ area: 'Rozwój', pct: Math.round(Math.min(1, cur.growth.sessions / cur.growth.goal) * 100), note: `${cur.growth.sessions} z ${cur.growth.goal} sesji` });
    if (cur.avgScore !== null) out.push({ area: 'Zadania', pct: cur.avgScore, note: `średni Daily Score ${cur.avgScore}%` });
    return out.sort((a, b) => a.pct - b.pct);
  }

  function renderWeekly(container) {
    ui.clear(container);
    const today = Prime.today();
    const wk = D.weekDates(today), prevWk = D.weekDates(D.addDays(wk[0], -1));
    const cur = metrics(wk), prev = metrics(prevWk);
    const hasAny = cur.tasksTotal > 0 || cur.trainingDays > 0 || cur.diet.kcalDays > 0 || cur.sleepNights > 0 || cur.growth.sessions > 0 || cur.finance.count > 0 || cur.habits !== null;
    container.appendChild(h('div.period-line', { text: `Bieżący tydzień: ${D.rangeLabel(wk[0], wk[6])} (jeszcze trwa) · porównanie z ${D.rangeLabel(prevWk[0], prevWk[6])}` }));
    if (!hasAny) { container.appendChild(ui.emptyState('Za mało danych na podsumowanie tygodnia.', 'Dodaj zadania, treningi lub wpisy żywieniowe — podsumowanie zbuduje się samo.')); return; }

    const tbl = h('div.card.wk-table', { role: 'table', 'aria-label': 'Porównanie tygodni' });
    tbl.appendChild(h('div.wk-row.head', { role: 'row' }, h('span', { text: 'Obszar' }), h('span', { text: 'Ten tydz.' }), h('span', { text: 'Poprz.' }), h('span', { text: 'Zmiana' })));
    weeklyRows(cur, prev).forEach(r => tbl.appendChild(h('div.wk-row', { role: 'row' }, h('span', { text: r.label }), h('span', { text: r.cur }), h('span.muted', { text: r.prev }), h('span.delta.' + (r.d.tone || 'flat'), { text: r.d.text }))));
    container.appendChild(tbl);

    const due = goalsDueSoon();
    if (due.length) {
      const gc = h('div.card', null, h('div.sub-title', { text: 'Cele z terminem w ciągu 30 dni' }));
      due.slice(0, 4).forEach(d => gc.appendChild(h('div.bar-row', null, h('span.bar-name', { text: d.goal.name }), ui.progress(d.pct, true), h('span.bar-val', { text: d.left >= 0 ? `${Math.round(d.pct)}% · ${d.left} dni` : 'po terminie' }))));
      container.appendChild(gc);
    }

    const better = weeklyRows(cur, prev).filter(r => r.d.tone === 'good').map(r => `${r.label}: ${r.d.text}`);
    const worse = weeklyRows(cur, prev).filter(r => r.d.tone === 'bad').map(r => `${r.label}: ${r.d.text}`);
    const att = attention(cur);
    const sum = h('div.card', null,
      h('div.sub-title', { text: 'Co poprawiło się vs poprzedni tydzień' }),
      better.length ? h('ul.plain', null, better.map(t => h('li', { text: t }))) : h('p.hint', { text: prev.tasksTotal || prev.trainingDays || prev.diet.kcalDays ? 'Brak wskaźników z poprawą względem poprzedniego tygodnia.' : 'Brak danych z poprzedniego tygodnia do porównania.' }),
      worse.length ? h('div', null, h('div.sub-title.pad', { text: 'Spadki (bez oceniania przyczyn)' }), h('ul.plain', null, worse.map(t => h('li', { text: t })))) : null,
      h('div.sub-title.pad', { text: 'Na co zwrócić uwagę w następnym tygodniu' }),
      att.length ? h('p', { text: `Najniższa realizacja Twoich własnych celów: ${att[0].area} (${att[0].note}). Dobrym pomysłem może być jedna mała zmiana właśnie tam.` }) : h('p.hint', { text: 'Brak wystarczających danych, by wskazać obszar.' }),
      att.length > 1 ? h('p.hint', { text: `Następny w kolejności: ${att[1].area} (${att[1].note}).` }) : null,
      h('p.hint', { text: 'To obserwacje z Twoich wpisów, nie diagnoza i nie dowód związku przyczynowego.' }));
    container.appendChild(sum);
  }

  /* ---------------- challenge summary ---------------- */

  function openSummary() {
    const c = challenge(Prime.today());
    const endDay = c.status === 'ended' ? c.end : Prime.today();
    const dates = [];
    for (let ds = c.start; ds <= endDay; ds = D.addDays(ds, 1)) dates.push(ds);
    const m = metrics(dates);
    const weights = dates.map(ds => ({ ds, w: Prime.state.days[ds] ? Prime.state.days[ds].weight : null })).filter(x => x.w !== null);
    const body = h('div.summary-grid');
    const box = (v, l) => body.appendChild(ui.statBox(v, l));
    box(`${m.passDays}`, 'Zaliczone dni');
    box(`${m.tasksDone}`, 'Wykonane zadania');
    box(`${m.trainingDays}`, 'Dni treningowe');
    box(m.habits === null ? '—' : m.habits + '%', 'Realizacja nawyków');
    box(m.sleepAvg === null ? '—' : m.sleepAvg + ' h', 'Średni sen');
    box(m.diet.avgProtein === null ? '—' : m.diet.avgProtein + ' g', 'Średnie białko');
    if (weights.length >= 2) box(`${weights[0].w} → ${weights[weights.length - 1].w} kg`, 'Masa: pierwszy → ostatni pomiar');
    if (Prime.modEnabled('growth')) box(`${m.growth.sessions} (${m.growth.minutes} min)`, 'Sesje rozwoju');
    if (Prime.modEnabled('finance') && Prime.mods.finance.hasData()) box(Prime.mods.finance.money(m.finance.save), 'Odłożone w okresie');
    if (Prime.modEnabled('xp')) { const x = Prime.mods.xp.compute(); box(`Poz. ${x.level} · ${x.total} XP`, 'Poziom (od startu systemu)'); }
    ui.sheet({
      title: c.name, sub: `${D.rangeLabel(c.start, c.end)}${c.status === 'ended' ? ' · zakończone' : ' · w trakcie'}${c.goal ? ' · cel: ' + c.goal : ''}`,
      body: h('div', null, body, h('p.hint', { text: 'Podsumowanie liczone z Twoich wpisów w całym okresie wyzwania. Aplikacja działa dalej — nowe wyzwanie ustawisz w Ustawieniach.' })),
      actions: [{ label: 'Zamknij', kind: 'primary' }], focus: false,
    });
  }

  Prime.mods.lifemax = { challenge, metrics, habitsPct, renderHero, renderWeekly, openSummary, attention, weeklyRows };
})();
