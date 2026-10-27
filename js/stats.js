/* ============================================================
   PRIME LIFE MAXING — stats.js
   "Statystyki": 7/30/90 day range. EVERY number states its period.
   Sections: Przegląd, Ciało, Jedzenie, Nawyki, Pieniądze.
   Charts have a fixed height (no growth on tab switches); the
   workouts chart is bucketed backwards from "today" into whole weeks.
   Nothing is estimated: days without an entry are gaps, not zeros.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);

  let historyLimit = 15;

  const periodDates = () => D.lastNDays(Prime.range, Prime.today());
  const prevDates = () => D.lastNDays(Prime.range, D.addDays(periodDates()[0], -1));
  const periodText = () => `${Prime.range} dni`;

  const avgOf = (vals) => { const v = vals.filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const dayVal = (ds, f) => { const d = Prime.state.days[ds]; return d ? f(d) : null; };
  function delta(cur, prev, unit, digits) {
    if (cur === null || prev === null) return '';
    const d = Prime.roundTo(cur - prev, digits === undefined ? 1 : digits);
    if (d === 0) return 'bez zmian vs poprz. okres';
    return `${d > 0 ? '+' : ''}${d}${unit} vs poprz. okres`;
  }
  const lbl = (dates) => (dates.length > 1 ? [D.shortLabel(dates[0]), D.shortLabel(dates[dates.length - 1])] : []);

  /* ---------------- sections nav ---------------- */

  function sections() {
    const s = [{ id: 'overview', label: 'Przegląd' }, { id: 'body', label: 'Ciało' }];
    if (Prime.modEnabled('nutrition')) s.push({ id: 'fuel', label: 'Jedzenie' });
    if (Prime.modEnabled('habits') || Prime.modEnabled('care')) s.push({ id: 'habits', label: 'Nawyki' });
    if (Prime.modEnabled('finance')) s.push({ id: 'money', label: 'Pieniądze' });
    return s;
  }
  const paneId = (id) => 'stats' + id.charAt(0).toUpperCase() + id.slice(1);

  function renderNav() {
    const list = sections();
    let cur = Prime.state.settings.ui.statsSection;
    if (!list.some(x => x.id === cur)) cur = 'overview';
    const nav = $('statsNav'); ui.clear(nav);
    list.forEach(x => nav.appendChild(h('button.chip' + (x.id === cur ? '.active' : ''), { type: 'button', role: 'tab', 'aria-selected': String(x.id === cur), text: x.label, onClick: () => {
      Prime.state.settings.ui.statsSection = x.id; Prime.save(); render();
    } })));
    ['overview', 'body', 'fuel', 'habits', 'money'].forEach(id => { $(paneId(id)).hidden = id !== cur; });
    return cur;
  }

  /* ---------------- overview ---------------- */

  function overview() {
    const dates = periodDates(), prev = prevDates(), P = periodText();
    const scoreOf = (ds) => dayVal(ds, d => Prime.computeScore(d).pct);
    const sc = avgOf(dates.map(scoreOf)), scPrev = avgOf(prev.map(scoreOf));
    const pass = dates.filter(ds => !Prime.isRest(ds) && Prime.dayPasses(ds)).length;
    const passPrev = prev.filter(ds => !Prime.isRest(ds) && Prime.dayPasses(ds)).length;
    const water = avgOf(dates.map(ds => dayVal(ds, d => d.water > 0 ? d.water / 1000 : null)));
    const waterPrev = avgOf(prev.map(ds => dayVal(ds, d => d.water > 0 ? d.water / 1000 : null)));
    const sleep = avgOf(dates.map(ds => dayVal(ds, d => d.sleep)));
    const sleepPrev = avgOf(prev.map(ds => dayVal(ds, d => d.sleep)));
    const W = Prime.mods.workouts;
    const tr = Prime.modEnabled('training') ? W.weekCount(dates) : null;
    const trPrev = Prime.modEnabled('training') ? W.weekCount(prev) : null;
    const grid = $('statSummaryGrid'); ui.clear(grid);
    const f1 = (v, u) => (v === null ? '—' : Prime.roundTo(v, 1) + u);
    grid.appendChild(ui.statBox(sc === null ? '—' : Math.round(sc) + '%', `Śr. Daily Score · ${P}`, delta(sc, scPrev, ' pp', 0), () => metricModal('score')));
    grid.appendChild(ui.statBox(`${pass}/${dates.length}`, `Zaliczone dni · ${P}`, delta(pass, passPrev, '', 0)));
    grid.appendChild(ui.statBox(Prime.computeStreak() + ' dni', 'Obecny streak (do dziś)', Prime.computeBestStreakEver() ? `rekord: ${Prime.computeBestStreakEver()}` : ''));
    grid.appendChild(ui.statBox(f1(water, ' L'), `Śr. woda (dni z wpisem) · ${P}`, delta(water, waterPrev, ' L', 1), () => metricModal('water')));
    grid.appendChild(ui.statBox(f1(sleep, ' h'), `Śr. sen (noce z wpisem) · ${P}`, delta(sleep, sleepPrev, ' h', 1)));
    grid.appendChild(ui.statBox(tr === null ? '—' : `${tr}`, `Dni treningowe · ${P}`, tr === null ? '' : delta(tr, trPrev, '', 0), tr === null ? null : () => metricModal('workouts')));

    // records (all time)
    const rec = $('recordsGrid'); ui.clear(rec);
    const keys = Prime.dayKeys().filter(k => k <= Prime.today());
    let bestScore = null, bestWater = null, bestSteps = null, bestTasks = null;
    keys.forEach(k => {
      const d = Prime.state.days[k], s = Prime.computeScore(d);
      if (s.pct !== null && s.total >= 3 && (!bestScore || s.pct > bestScore.v)) bestScore = { v: s.pct, k };
      if (d.water > 0 && (!bestWater || d.water > bestWater.v)) bestWater = { v: d.water, k };
      if (d.steps !== null && d.steps > 0 && (!bestSteps || d.steps > bestSteps.v)) bestSteps = { v: d.steps, k };
      if (s.done > 0 && (!bestTasks || s.done > bestTasks.v)) bestTasks = { v: s.done, k };
    });
    const best = Prime.computeBestStreakEver();
    rec.appendChild(ui.statBox(best ? best + ' dni' : '—', 'Najdłuższy streak · cały czas'));
    rec.appendChild(ui.statBox(bestScore ? bestScore.v + '%' : '—', 'Najlepszy Daily Score · cały czas', bestScore ? D.shortLabel(bestScore.k) : 'min. 3 zadania w dniu'));
    rec.appendChild(ui.statBox(bestTasks ? String(bestTasks.v) : '—', 'Najwięcej zadań w dniu · cały czas', bestTasks ? D.shortLabel(bestTasks.k) : ''));
    rec.appendChild(ui.statBox(bestWater ? Prime.roundTo(bestWater.v / 1000, 2) + ' L' : '—', 'Najwięcej wody · cały czas', bestWater ? D.shortLabel(bestWater.k) : ''));
    rec.appendChild(ui.statBox(bestSteps ? bestSteps.v : '—', 'Najwięcej kroków · cały czas', bestSteps ? D.shortLabel(bestSteps.k) : ''));

    heatmap();
    charts(dates);
    Prime.mods.lifemax.renderWeekly($('weeklyMount'));
    renderHistory(dates);
  }

  /* ---------------- heatmap (13 weeks, Daily Score per day) ---------------- */

  function heatmap() {
    const root = $('heatmapMount'); ui.clear(root);
    const today = Prime.today(), first = D.addDays(D.weekStart(today), -12 * 7);
    const grid = h('div.heat-grid', { role: 'group', 'aria-label': 'Daily Score z ostatnich 13 tygodni' });
    let any = false;
    for (let i = 0; i < 13 * 7; i++) {
      const ds = D.addDays(first, i);
      if (ds > today) { grid.appendChild(h('span.heat-cell.future')); continue; }
      const d = Prime.state.days[ds], sc = d ? Prime.computeScore(d).pct : null, rest = !!(d && d.rest);
      const lvl = rest ? 'rest' : sc === null ? 'none' : sc >= 80 ? 'l4' : sc >= 60 ? 'l3' : sc >= 40 ? 'l2' : 'l1';
      if (sc !== null) any = true;
      grid.appendChild(h('button.heat-cell.' + lvl + (ds === today ? '.today' : ''), { type: 'button', 'aria-label': `${D.shortLabel(ds)}: ${rest ? 'dzień wolny' : sc === null ? 'brak zadań' : sc + '%'}`, title: `${D.shortLabel(ds)} · ${rest ? 'wolny' : sc === null ? '—' : sc + '%'}`, onClick: () => openDay(ds) }));
    }
    root.appendChild(grid);
    root.appendChild(h('div.heat-legend', null, h('span', { text: 'mniej' }), ['l1', 'l2', 'l3', 'l4'].map(l => h('span.heat-cell.' + l)), h('span', { text: 'więcej' }), h('span.heat-note', { text: 'wiersze: Pn–Nd · kolumny: tygodnie' })));
    if (!any) root.appendChild(h('p.hint', { text: 'Pojawi się, gdy zaczniesz odhaczać zadania.' }));
  }

  /* ---------------- charts ---------------- */

  function workoutBuckets() {
    const W = Prime.mods.workouts, today = Prime.today();
    if (Prime.range === 7) {
      const dates = D.lastNDays(7, today);
      return { points: dates.map(ds => ({ y: W.trainedOn(ds) ? 1 : 0 })), labels: lbl(dates), title: 'Trening — dni (7 dni)' };
    }
    const weeks = Math.floor(Prime.range / 7);
    const pts = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const end = D.addDays(today, -i * 7);
      pts.push({ y: W.weekCount(D.lastNDays(7, end)) });
    }
    const first = D.addDays(today, -(weeks * 7 - 1));
    return { points: pts, labels: [D.shortLabel(first), D.shortLabel(today)], title: `Dni treningowe / 7 dni (${weeks} ${Prime.plural(weeks, 'blok', 'bloki', 'bloków')})` };
  }

  function charts(dates) {
    const C = Prime.charts, P = periodText();
    const labels = lbl(dates);
    $('view-stats').querySelector('[data-metric="score"] .chart-title').textContent = `Daily Score · ${P}`;
    $('view-stats').querySelector('[data-metric="water"] .chart-title').textContent = `Nawodnienie (L) · ${P}`;
    $('view-stats').querySelector('[data-metric="weight"] .chart-title').textContent = `Masa ciała (kg) · ${P}`;
    C.drawLine($('chartScore'), $('chartScoreEmpty'), dates.map(ds => ({ y: dayVal(ds, d => Prime.computeScore(d).pct) })), { min: 0, max: 100, refLine: Prime.state.settings.streakThreshold, labels });
    C.drawLine($('chartWater'), $('chartWaterEmpty'), dates.map(ds => ({ y: dayVal(ds, d => (d.water > 0 ? Prime.roundTo(d.water / 1000, 2) : null)) })), { min: 0, refLine: Prime.state.settings.waterGoal, labels });
    C.drawLine($('chartWeight'), $('chartWeightEmpty'), dates.map(ds => ({ y: dayVal(ds, d => d.weight) })), { labels });
    const wb = workoutBuckets();
    $('view-stats').querySelector('[data-metric="workouts"] .chart-title').textContent = wb.title;
    $('view-stats').querySelector('[data-metric="workouts"]').hidden = !Prime.modEnabled('training');
    if (Prime.modEnabled('training')) C.drawBars($('chartWorkouts'), $('chartWorkoutsEmpty'), wb.points, { labels: wb.labels });
  }

  /* ---------------- metric detail modal ---------------- */

  const METRICS = {
    score: { title: 'Daily Score', get: (ds) => dayVal(ds, d => Prime.computeScore(d).pct), fmt: (v) => v + '%', unit: '%' },
    water: { title: 'Nawodnienie', get: (ds) => dayVal(ds, d => (d.water > 0 ? Prime.roundTo(d.water / 1000, 2) : null)), fmt: (v) => v + ' L', unit: ' L' },
    weight: { title: 'Masa ciała', get: (ds) => dayVal(ds, d => d.weight), fmt: (v) => v + ' kg', unit: ' kg' },
    workouts: { title: 'Trening', get: (ds) => (Prime.mods.workouts.trainedOn(ds) ? 1 : null), fmt: () => 'tak', unit: '' },
  };

  function metricModal(key) {
    const m = METRICS[key]; if (!m) return;
    const dates = periodDates();
    const rows = dates.map(ds => ({ ds, v: m.get(ds) })).filter(r => r.v !== null);
    $('metricModalTitle').textContent = m.title;
    $('metricModalPeriod').textContent = `Okres: ${periodText()} (${D.rangeLabel(dates[0], dates[dates.length - 1])})`;
    const grid = $('metricSummaryGrid'); ui.clear(grid);
    const list = $('metricDetailList'); ui.clear(list);
    $('metricDetailEmpty').hidden = rows.length > 0;
    if (rows.length) {
      const vals = rows.map(r => r.v);
      if (key === 'workouts') {
        grid.appendChild(ui.statBox(rows.length, 'Dni treningowe'));
        grid.appendChild(ui.statBox(Prime.roundTo(rows.length / (dates.length / 7), 1), 'Średnio / tydz.'));
      } else {
        grid.appendChild(ui.statBox(Prime.roundTo(avgOf(vals), 1) + m.unit, 'Średnia'));
        grid.appendChild(ui.statBox(Math.max(...vals) + m.unit, 'Maks.'));
        grid.appendChild(ui.statBox(Math.min(...vals) + m.unit, 'Min.'));
        grid.appendChild(ui.statBox(`${rows.length}/${dates.length}`, 'Dni z wpisem'));
        if (key === 'weight') grid.appendChild(ui.statBox((vals[vals.length - 1] - vals[0] > 0 ? '+' : '') + Prime.roundTo(vals[vals.length - 1] - vals[0], 1) + ' kg', 'Zmiana: pierwszy → ostatni'));
      }
      rows.slice().reverse().forEach(r => list.appendChild(h('li.metric-detail-item', null, h('span', { text: `${D.formatWeekday(r.ds).slice(0, 3)}, ${D.shortLabel(r.ds)}` }), h('strong', { text: m.fmt(r.v) }))));
    }
    ui.openModal($('metricModal'));
  }

  /* ---------------- history ---------------- */

  function renderHistory(dates) {
    const list = $('historyList'); ui.clear(list);
    const rows = dates.slice().reverse().filter(ds => Prime.hasDay(ds) && Prime.state.days[ds] && hasContent(Prime.state.days[ds]));
    $('historyEmpty').hidden = rows.length > 0;
    rows.slice(0, historyLimit).forEach(ds => {
      const d = Prime.state.days[ds], s = Prime.computeScore(d);
      const bits = [];
      if (d.water > 0) bits.push(Prime.roundTo(d.water / 1000, 1) + ' L');
      if (d.calories > 0) bits.push(d.calories + ' kcal');
      if (d.sleep !== null) bits.push(d.sleep + ' h snu');
      if (d.weight !== null) bits.push(d.weight + ' kg');
      if (Prime.modEnabled('training') && Prime.mods.workouts.trainedOn(ds)) bits.push('trening');
      list.appendChild(h('li.history-item', { tabindex: '0', role: 'button', 'aria-label': 'Otwórz dzień ' + ds, onClick: () => openDay(ds), onKeydown: (e) => { if (e.key === 'Enter') openDay(ds); } },
        h('div.history-main', null, h('div.history-date', { text: `${D.formatWeekday(ds)}, ${D.shortLabel(ds)}` }), h('div.history-sub', { text: bits.join(' · ') || 'bez trackerów' })),
        h('div.history-score' + (d.rest ? '.rest' : ''), { text: d.rest ? 'wolny' : (s.pct === null ? '—' : s.pct + '%') })));
    });
    $('historyMoreBtn').hidden = rows.length <= historyLimit;
  }

  function hasContent(d) {
    return d.tasks.length > 0 || d.water > 0 || d.calories > 0 || d.protein > 0 || d.sleep !== null || d.weight !== null || d.steps !== null || d.rest || !!d.note;
  }

  function openDay(ds) { Prime.date = ds; if (Prime.showView) Prime.showView('today'); else Prime.refresh(); }

  /* ---------------- body ---------------- */

  function body() {
    const root = $('statsBody'); ui.clear(root);
    const dates = periodDates(), P = periodText();
    root.appendChild(h('p.period-line', { text: `Okres: ${P} (${D.rangeLabel(dates[0], dates[dates.length - 1])})` }));
    const grid = h('div.stat-summary-grid');
    const ws = dates.map(ds => ({ ds, v: dayVal(ds, d => d.weight) })).filter(x => x.v !== null);
    grid.appendChild(ui.statBox(ws.length ? ws[ws.length - 1].v + ' kg' : '—', `Ostatni pomiar wagi · ${P}`, ws.length >= 2 ? `${ws[ws.length - 1].v - ws[0].v > 0 ? '+' : ''}${Prime.roundTo(ws[ws.length - 1].v - ws[0].v, 1)} kg od pierwszego w okresie` : (ws.length ? 'tylko 1 pomiar' : '')));
    const steps = avgOf(dates.map(ds => dayVal(ds, d => (d.steps ? d.steps : null))));
    grid.appendChild(ui.statBox(steps === null ? '—' : Math.round(steps), `Śr. kroki (dni z wpisem) · ${P}`));
    const ss = Prime.mods.trackers.sleepStats(dates);
    grid.appendChild(ui.statBox(ss.avg === null ? '—' : ss.avg + ' h', `Śr. sen · ${P}`, ss.nights ? `${ss.onGoal}/${ss.nights} nocy ≥ cel` : ''));
    grid.appendChild(ui.statBox(ss.regularity === null ? '—' : '±' + ss.regularity + ' min', `Regularność zasypiania · ${P}`, ss.bedNights ? `${ss.bedNights} nocy z godzinami` : 'wpisz godziny snu'));
    root.appendChild(grid);

    const sleepCard = h('div.card.chart-card', null, h('div.chart-title', { text: `Sen (h) · ${P}` }));
    root.appendChild(sleepCard);
    Prime.charts.mount(sleepCard, 'line', dates.map(ds => ({ y: dayVal(ds, d => d.sleep) })), { min: 0, refLine: Prime.state.settings.sleepGoal, labels: lbl(dates), label: 'Wykres snu' });
    const stepsCard = h('div.card.chart-card', null, h('div.chart-title', { text: `Kroki · ${P}` }));
    root.appendChild(stepsCard);
    Prime.charts.mount(stepsCard, 'bar', dates.map(ds => ({ y: dayVal(ds, d => d.steps) || 0 })), { labels: lbl(dates), label: 'Wykres kroków' });

    if (Prime.modEnabled('training')) {
      const W = Prime.mods.workouts;
      const sess = W.countedSessions().filter(s => dates.indexOf(s.date) !== -1);
      root.appendChild(ui.sectionHead('Trening'));
      const g2 = h('div.stat-summary-grid');
      g2.appendChild(ui.statBox(String(sess.length), `Zapisane treningi · ${P}`));
      g2.appendChild(ui.statBox(String(sess.reduce((a, s) => a + W.sessionCompleteSets(s), 0)), `Ukończone serie · ${P}`));
      g2.appendChild(ui.statBox(W.weekCount(dates) + '/' + dates.length, `Dni treningowe · ${P}`));
      root.appendChild(g2);
      // personal records by exercise (all time)
      const used = new Map();
      W.countedSessions().forEach(s => s.entries.forEach(e => { used.set(e.exerciseId, (used.get(e.exerciseId) || 0) + 1); }));
      const top = Array.from(used.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (top.length) {
        const card = h('div.card', null, h('div.sub-title', { text: 'Rekordy ćwiczeń · cały czas' }));
        top.forEach(([id]) => {
          const r = W.recordsFor(id);
          if (!r.best) return;
          card.appendChild(h('div.edit-row', null, h('span', { text: r.exercise.name }), h('strong', { text: `${W.fmtSet(r.exercise.type, r.best.set)} · ${D.shortLabel(r.bestDate)}` })));
        });
        root.appendChild(card);
      } else root.appendChild(ui.emptyState('Brak zapisanych treningów.', 'Rekordy pojawią się po pierwszym treningu z ukończonymi seriami.', true));
    }
    if (Prime.modEnabled('photos') && Prime.mods.photos.count) {
      Promise.resolve(Prime.mods.photos.count()).then(n => {
        if (n > 0 && root.isConnected) root.appendChild(h('button.btn.block', { type: 'button', text: `Zdjęcia sylwetki (${n})`, onClick: () => Prime.mods.photos.openPanel() }));
      }).catch(() => {});
    }
  }

  /* ---------------- fuel ---------------- */

  function fuel() {
    const root = $('statsFuel'); ui.clear(root);
    const dates = periodDates(), P = periodText(), st = Prime.state.settings;
    const s = Prime.mods.nutrition.summary(dates), sp = Prime.mods.nutrition.summary(prevDates());
    root.appendChild(h('p.period-line', { text: `Okres: ${P} (${D.rangeLabel(dates[0], dates[dates.length - 1])}) · średnie liczone tylko z dni z wpisem` }));
    const grid = h('div.stat-summary-grid');
    grid.appendChild(ui.statBox(s.avgKcal === null ? '—' : s.avgKcal + ' kcal', `Śr. kalorie · ${P}`, delta(s.avgKcal, sp.avgKcal, ' kcal', 0) || (s.kcalDays ? `${s.kcalDays} dni z wpisem` : '')));
    grid.appendChild(ui.statBox(s.avgProtein === null ? '—' : s.avgProtein + ' g', `Śr. białko · ${P}`, delta(s.avgProtein, sp.avgProtein, ' g', 0)));
    grid.appendChild(ui.statBox(`${s.proteinGoalDays}/${s.protDays}`, `Cel białka (${st.proteinGoal} g) · dni z wpisem · ${P}`));
    grid.appendChild(ui.statBox(`${s.kcalOnTarget}/${s.kcalDays}`, `Kalorie ±10% celu (${st.calGoal}) · ${P}`));
    if (s.avgFat !== null) grid.appendChild(ui.statBox(s.avgFat + ' g', `Śr. tłuszcz · ${P}`));
    if (s.avgCarbs !== null) grid.appendChild(ui.statBox(s.avgCarbs + ' g', `Śr. węglowodany · ${P}`));
    grid.appendChild(ui.statBox(`${s.mealDays}`, `Dni z rozpisanymi posiłkami · ${P}`));
    const waterDays = dates.filter(ds => dayVal(ds, d => d.water / 1000 >= st.waterGoal && st.waterGoal > 0)).length;
    grid.appendChild(ui.statBox(`${waterDays}/${dates.length}`, `Cel wody (${st.waterGoal} L) · ${P}`));
    root.appendChild(grid);
    const c1 = h('div.card.chart-card', null, h('div.chart-title', { text: `Kalorie · ${P}` })); root.appendChild(c1);
    Prime.charts.mount(c1, 'line', dates.map(ds => ({ y: dayVal(ds, d => (d.calories > 0 ? d.calories : null)) })), { refLine: st.calGoal, labels: lbl(dates), label: 'Wykres kalorii' });
    const c2 = h('div.card.chart-card', null, h('div.chart-title', { text: `Białko (g) · ${P}` })); root.appendChild(c2);
    Prime.charts.mount(c2, 'line', dates.map(ds => ({ y: dayVal(ds, d => (d.protein > 0 ? Prime.roundTo(d.protein, 1) : null)) })), { min: 0, refLine: st.proteinGoal, labels: lbl(dates), label: 'Wykres białka' });
  }

  /* ---------------- habits ---------------- */

  function habitsPane() {
    const root = $('statsHabits'); ui.clear(root);
    const dates = periodDates(), P = periodText(), Hb = Prime.mods.habits;
    root.appendChild(h('p.period-line', { text: `Okres: ${P} (${D.rangeLabel(dates[0], dates[dates.length - 1])})` }));
    if (Prime.modEnabled('habits')) {
      const active = Prime.state.habits.filter(x => !x.archived);
      const pct = Prime.mods.lifemax.habitsPct(dates), prev = Prime.mods.lifemax.habitsPct(prevDates());
      const grid = h('div.stat-summary-grid');
      grid.appendChild(ui.statBox(pct === null ? '—' : pct + '%', `Realizacja nawyków · ${P}`, delta(pct, prev, ' pp', 0)));
      root.appendChild(grid);
      if (!active.length) root.appendChild(ui.emptyState('Brak nawyków.', 'Dodaj je w Ustawieniach → Nawyki i pielęgnacja.', true));
      const card = h('div.card');
      active.forEach(hb => {
        const elig = dates.filter(ds => ds >= hb.createdAt);
        const done = elig.filter(ds => Hb.isDone(hb, ds)).length;
        const exp = Hb.weeklyTarget(hb) * elig.length / 7;
        const p = elig.length ? Math.round(Math.min(1, done / Math.max(exp, 0.0001)) * 100) : null;
        card.appendChild(h('div.bar-row', null, h('span.bar-name', { text: hb.name }), ui.progress(p || 0, true), h('span.bar-val', { text: p === null ? 'nowy' : `${p}% · ${done}×` })));
      });
      if (active.length) { card.insertBefore(h('div.sub-title', { text: `Każdy nawyk vs jego własna częstotliwość · ${P}` }), card.firstChild); root.appendChild(card); }
    }
    if (Prime.modEnabled('care')) {
      const full = dates.filter(ds => { const c = Hb.careStatus(ds); return c.total > 0 && c.done === c.total; }).length;
      root.appendChild(h('div.stat-summary-grid', null, ui.statBox(`${full}/${dates.length}`, `Dni z pełną rutyną pielęgnacyjną · ${P}`)));
    }
  }

  /* ---------------- money ---------------- */

  function money() {
    const root = $('statsMoney'); ui.clear(root);
    const F = Prime.mods.finance;
    if (!F.hasData()) { root.appendChild(ui.emptyState('Brak danych finansowych.', 'Dodaj pierwszą transakcję w module Finanse.', true)); root.appendChild(h('button.btn.block', { type: 'button', text: 'Otwórz Finanse', onClick: () => F.openPanel() })); return; }
    const dates = periodDates(), P = periodText();
    const r = F.rangeSummary(dates), rp = F.rangeSummary(prevDates());
    root.appendChild(h('p.period-line', { text: `Okres: ${P} (${D.rangeLabel(dates[0], dates[dates.length - 1])}) · przelewy na oszczędności nie są wydatkami ani przychodem` }));
    const grid = h('div.stat-summary-grid');
    grid.appendChild(ui.statBox(F.money(r.out), `Wydatki · ${P}`, delta(r.out, rp.out, ' zł', 2)));
    grid.appendChild(ui.statBox(F.money(r.in), `Wpływy · ${P}`));
    grid.appendChild(ui.statBox(F.money(r.save), `Odłożone · ${P}`));
    grid.appendChild(ui.statBox(F.money(F.balance()), 'Dostępne środki (stan na dziś)'));
    grid.appendChild(ui.statBox(F.money(F.savedTotal()), 'Odłożone łącznie · cały czas'));
    root.appendChild(grid);
    const months = F.monthSeries(6);
    const card = h('div.card.chart-card', null, h('div.chart-title', { text: 'Wydatki / odłożone · ostatnie 6 miesięcy' })); root.appendChild(card);
    Prime.charts.mount(card, 'bar', months.map(m => ({ ys: [m.out, m.save] })), { labels: [D.monthLabel(months[0].key), D.monthLabel(months[months.length - 1].key)], label: 'Wykres miesięczny' });
    const key = D.monthKey(Prime.today()), cats = F.categoryBreakdown(key);
    if (cats.length) {
      const cc = h('div.card', null, h('div.sub-title', { text: `Wydatki wg kategorii · ${D.monthLabel(key)}` }));
      const mx = cats[0].amount || 1;
      cats.slice(0, 8).forEach(c => cc.appendChild(h('div.bar-row', null, h('span.bar-name', { text: c.name }), ui.progress((c.amount / mx) * 100, true), h('span.bar-val', { text: F.money(c.amount) }))));
      root.appendChild(cc);
    }
    root.appendChild(h('button.btn.block', { type: 'button', text: 'Otwórz Finanse', onClick: () => F.openPanel() }));
  }

  /* ---------------- render / bind ---------------- */

  function render() {
    document.querySelectorAll('#rangeSwitch .range-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.range) === Prime.range));
    const dates = periodDates();
    $('statsPeriod').textContent = `Okres: ${periodText()} · ${D.rangeLabel(dates[0], dates[dates.length - 1])} (włącznie z dziś)`;
    const cur = renderNav();
    if (cur === 'overview') overview();
    else if (cur === 'body') body();
    else if (cur === 'fuel') fuel();
    else if (cur === 'habits') habitsPane();
    else if (cur === 'money') money();
  }

  function bind() {
    $('rangeSwitch').addEventListener('click', (e) => {
      const b = e.target.closest('.range-btn'); if (!b) return;
      Prime.range = Number(b.dataset.range) || 7; historyLimit = 15; render();
    });
    document.querySelectorAll('#view-stats .chart-card[data-metric]').forEach(card => {
      const open = () => metricModal(card.dataset.metric);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
    $('historyMoreBtn').addEventListener('click', () => { historyLimit += 20; render(); });
    $('metricModalCloseBtn').addEventListener('click', ui.closeModals);
  }

  Prime.mods.stats = { render, bind, metricModal };
})();
