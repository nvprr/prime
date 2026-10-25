/* ============================================================
   PRIME LIFE MAXING — trackers.js
   Daily trackers: water, protein, calories, sleep, weight, steps.
   Existing element ids and v1 behaviour are kept. When a day has
   meal entries, protein/calories become read-only (derived totals).
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);

  /* ---------------- sleep maths ---------------- */

  /** Bedtime as minutes on a continuous axis (00:30 counts as 24:30) so midnight does not break averages. */
  function bedAxis(bed) {
    const m = D.parseTime(bed);
    if (m === null) return null;
    return m < 12 * 60 ? m + 24 * 60 : m;
  }

  function sleepStats(dates) {
    let sum = 0, n = 0, onGoal = 0;
    const beds = [];
    dates.forEach(ds => {
      const d = Prime.state.days[ds];
      if (!d) return;
      if (d.sleep !== null) { sum += d.sleep; n++; if (d.sleep >= Prime.state.settings.sleepGoal) onGoal++; }
      if (d.sleepInfo) { const b = bedAxis(d.sleepInfo.bed); if (b !== null) beds.push(b); }
    });
    let regularity = null;
    if (beds.length >= 3) {
      const mean = beds.reduce((a, b) => a + b, 0) / beds.length;
      regularity = Math.round(Math.sqrt(beds.reduce((a, b) => a + (b - mean) * (b - mean), 0) / beds.length));
    }
    return { nights: n, avg: n ? Prime.roundTo(sum / n, 1) : null, onGoal, regularity, bedNights: beds.length };
  }

  /* ---------------- render ---------------- */

  function renderSleep(ds) {
    const mount = $('sleepMount');
    ui.clear(mount);
    const day = Prime.day(ds);
    const info = day.sleepInfo || { bed: null, wake: null, quality: null, note: '' };
    const write = (patch) => {
      const d = Prime.ensureDay(ds);
      d.sleepInfo = Object.assign({ bed: null, wake: null, quality: null, note: '' }, d.sleepInfo || {}, patch);
      const hrs = D.sleepHours(d.sleepInfo.bed, d.sleepInfo.wake);
      if (hrs !== null) d.sleep = hrs;
      Prime.save(); Prime.refresh();
    };
    const bed = ui.input({ type: 'time', value: info.bed || '', 'aria-label': 'Godzina zaśnięcia' });
    const wake = ui.input({ type: 'time', value: info.wake || '', 'aria-label': 'Godzina pobudki' });
    bed.addEventListener('change', () => write({ bed: D.parseTime(bed.value) !== null ? bed.value : null }));
    wake.addEventListener('change', () => write({ wake: D.parseTime(wake.value) !== null ? wake.value : null }));
    mount.appendChild(h('div.modal-row-2', null, ui.field('Zaśnięcie', bed), ui.field('Pobudka', wake)));
    const auto = D.sleepHours(info.bed, info.wake);
    if (auto !== null) mount.appendChild(h('p.hint', { text: `Czas snu liczony z godzin: ${auto} h (także przez północ).` }));
    else if (info.bed && info.wake) mount.appendChild(h('p.hint', { text: 'Nie da się policzyć czasu snu z tych godzin — wpisz godziny ręcznie.' }));
    const q = ui.chipsSingle([1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), info.quality, (v) => write({ quality: v }), true);
    mount.appendChild(h('div.modal-label', null, 'Jakość snu (1–5, subiektywnie)', q.el));
    const note = ui.input({ value: info.note || '', placeholder: 'Notatka o śnie (opcjonalnie)', maxlength: '300', 'aria-label': 'Notatka o śnie' });
    note.addEventListener('change', () => write({ note: note.value.trim() }));
    mount.appendChild(note);
    const wk = D.lastNDays(7, ds);
    const ss = sleepStats(wk);
    const bits = [];
    if (ss.avg !== null) bits.push(`śr. ${ss.avg} h (${ss.nights} ${Prime.plural(ss.nights, 'noc', 'noce', 'nocy')}, 7 dni do ${D.shortLabel(ds)})`);
    if (ss.regularity !== null) bits.push(`regularność zasypiania ±${ss.regularity} min`);
    mount.appendChild(h('p.hint', { text: bits.length ? bits.join(' · ') : 'Średnia i regularność pojawią się po kilku zapisanych nocach. To narzędzie organizacyjne, nie medyczne.' }));
  }

  function render(ds) {
    const day = Prime.day(ds), st = Prime.state.settings;
    const meals = Prime.mods.nutrition.hasMeals(day);
    $('waterVal').textContent = Prime.roundTo(day.water / 1000, 2);
    $('waterGoalDisp').textContent = Prime.roundTo(st.waterGoal, 2);
    $('waterBar').style.width = `${Prime.clamp(st.waterGoal > 0 ? (day.water / 1000 / st.waterGoal) * 100 : 0, 0, 100)}%`;

    $('proteinVal').textContent = Prime.formatNum(Prime.roundTo(day.protein || 0, 1));
    $('proteinGoalDisp').textContent = st.proteinGoal;
    $('proteinBar').style.width = `${Prime.clamp(st.proteinGoal > 0 ? (day.protein / st.proteinGoal) * 100 : 0, 0, 100)}%`;
    $('proteinInput').value = '';

    $('calVal').textContent = day.calories || 0;
    $('calGoalDisp').textContent = st.calGoal;
    $('calBar').style.width = `${Prime.clamp(st.calGoal > 0 ? (day.calories / st.calGoal) * 100 : 0, 0, 100)}%`;
    $('calInput').value = day.calories || '';

    $('proteinInput').disabled = meals; $('calInput').disabled = meals;
    document.querySelectorAll('[data-protein]').forEach(b => { b.disabled = meals; });
    $('proteinInput').placeholder = meals ? 'z posiłków' : 'ustaw…';
    $('calInput').placeholder = meals ? 'z posiłków' : 'ustaw…';

    const hasBW = day.sleepInfo && D.sleepHours(day.sleepInfo.bed, day.sleepInfo.wake) !== null;
    $('sleepVal').textContent = day.sleep !== null ? day.sleep : '—';
    $('sleepInput').value = day.sleep !== null ? day.sleep : '';
    $('sleepInput').disabled = !!hasBW;
    $('weightVal').textContent = day.weight !== null ? day.weight : '—';
    $('weightInput').value = day.weight !== null ? day.weight : '';
    $('stepsVal').textContent = day.steps !== null ? day.steps : '—';
    $('stepsInput').value = day.steps !== null ? day.steps : '';

    renderSleep(ds);

    // collapsed-section summaries
    const W = Prime.mods.workouts, Hb = Prime.mods.habits, G = Prime.mods.growth;
    const bodyBits = [];
    if (Prime.modEnabled('training')) bodyBits.push('Trening: ' + W.dayStatus(ds).label);
    if (day.weight !== null) bodyBits.push(day.weight + ' kg');
    $('sumBody').textContent = bodyBits.join(' · ');
    $('sumDiet').textContent = `${day.calories || 0} kcal · B ${Prime.formatNum(Prime.roundTo(day.protein || 0, 0))}/${st.proteinGoal} g · ${Prime.roundTo(day.water / 1000, 1)} L`;
    $('sumSleep').textContent = day.sleep !== null ? `${day.sleep} h` : '—';
    const cs = Hb.careStatus(ds);
    $('sumCare').textContent = cs.total ? `${cs.done}/${cs.total}` : 'opcjonalnie';
    const hs = Hb.dayStatus(ds);
    $('sumHabits').textContent = hs.total ? `${hs.done}/${hs.total} dziś` : (Prime.state.habits.length ? 'nic na dziś' : 'dodaj nawyk');
    const gws = G.weekStats(D.weekDates(ds));
    $('sumGrowth').textContent = Prime.state.growth.projects.length ? `sesje ${gws.sessions}/${gws.goal}` : 'dodaj projekt';
  }

  /* ---------------- input handlers (bound once) ---------------- */

  function mutate(fn) {
    const day = Prime.ensureDay(Prime.date);
    fn(day);
    Prime.save();
    Prime.refresh();
  }

  function bind() {
    document.querySelectorAll('[data-water]').forEach(btn => btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.water);
      mutate(d => { d.water = Prime.clamp((d.water || 0) + delta, 0, 20000); });
    }));
    document.querySelectorAll('[data-protein]').forEach(btn => btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.protein);
      if (Prime.mods.nutrition.hasMeals(Prime.day(Prime.date))) return;
      mutate(d => { d.protein = Prime.clamp((d.protein || 0) + delta, 0, 2000); });
    }));
    $('proteinInput').addEventListener('change', (e) => {
      const val = Number(e.target.value);
      if (Prime.mods.nutrition.hasMeals(Prime.day(Prime.date))) return;
      if (!isNaN(val) && e.target.value !== '') mutate(d => { d.protein = Prime.clamp(val, 0, 2000); });
    });
    $('calInput').addEventListener('change', (e) => {
      if (Prime.mods.nutrition.hasMeals(Prime.day(Prime.date))) return;
      const val = Number(e.target.value);
      mutate(d => { d.calories = e.target.value === '' ? 0 : Prime.clamp(isNaN(val) ? 0 : val, 0, 15000); });
    });
    $('sleepInput').addEventListener('change', (e) => {
      const v = e.target.value === '' ? null : Prime.clamp(Number(e.target.value), 0, 24);
      mutate(d => { d.sleep = isNaN(v) ? null : v; });
    });
    $('weightInput').addEventListener('change', (e) => {
      const v = e.target.value === '' ? null : Prime.clamp(Number(e.target.value), 0, 500);
      mutate(d => { d.weight = isNaN(v) ? null : v; });
    });
    $('stepsInput').addEventListener('change', (e) => {
      const v = e.target.value === '' ? null : Prime.clamp(Math.round(Number(e.target.value)), 0, 200000);
      mutate(d => { d.steps = isNaN(v) ? null : v; });
    });
  }

  Prime.mods.trackers = { render, bind, sleepStats, renderSleep };
})();
