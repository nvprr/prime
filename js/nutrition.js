/* ============================================================
   PRIME LIFE MAXING — nutrition.js  (Fuel)
   Meals + macros on top of the existing calories/protein trackers.

   Single source of truth: day.calories / day.protein stay the day's
   totals. When a day has meal entries, those totals are DERIVED from
   the meals (never added on top), so nothing is counted twice. The
   first meal added to a day that already has hand-typed totals turns
   those totals into a "Wpis ręczny" meal, so no calories are lost.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, S = Prime.S, D = Prime.D;

  const hasMeals = (day) => !!(day.meals && day.meals.length > 0);

  function nowTime() {
    const d = new Date();
    return `${D.pad2(d.getHours())}:${D.pad2(d.getMinutes())}`;
  }

  function addMeal(ds, meal) {
    const day = Prime.ensureDay(ds);
    if (!hasMeals(day) && (day.calories > 0 || day.protein > 0 || day.fat > 0 || day.carbs > 0)) {
      day.meals.push({ id: Prime.uid(), name: 'Wpis ręczny (dotychczasowy)', time: null, kcal: day.calories, protein: day.protein, fat: day.fat, carbs: day.carbs, manual: true });
    }
    day.meals.push(meal);
    S.syncNutritionTotals(day);
    return Prime.save();
  }

  function updateMeal(ds, id, patch) {
    const day = Prime.ensureDay(ds);
    const m = day.meals.find(x => x.id === id);
    if (!m) return;
    Object.assign(m, patch);
    S.syncNutritionTotals(day);
    Prime.save();
  }

  function deleteMeal(ds, id) {
    const day = Prime.ensureDay(ds);
    day.meals = day.meals.filter(m => m.id !== id);
    if (day.meals.length === 0) { day.calories = 0; day.protein = 0; day.fat = 0; day.carbs = 0; }
    else S.syncNutritionTotals(day);
    Prime.save();
  }

  function num(el) {
    const v = String(el.value).trim().replace(',', '.');
    if (v === '') return 0;
    const n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  /** Add/edit sheet. `preset` seeds a new meal (favorite / quick entry). */
  function openMealSheet(ds, meal, preset) {
    const m = meal || Object.assign({ name: '', time: ds === Prime.today() ? nowTime() : null, kcal: 0, protein: 0, fat: 0, carbs: 0 }, preset || {});
    const name = ui.input({ value: m.name, placeholder: 'np. Kurczak z ryżem', maxlength: '100' });
    const time = ui.input({ type: 'time', value: m.time || '' });
    const kcal = ui.input({ type: 'number', value: m.kcal || '', inputmode: 'numeric', min: '0', step: 'any', placeholder: '0' });
    const protein = ui.input({ type: 'number', value: m.protein || '', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
    const fat = ui.input({ type: 'number', value: m.fat || '', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
    const carbs = ui.input({ type: 'number', value: m.carbs || '', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0' });
    const fav = h('input', { type: 'checkbox' });
    const body = h('div', null,
      ui.field('Nazwa', name),
      h('div.modal-row-2', null, ui.field('Godzina', time), ui.field('Kalorie (kcal)', kcal)),
      h('div.modal-row-3', null, ui.field('Białko (g)', protein), ui.field('Tłuszcz (g)', fat), ui.field('Węgle (g)', carbs)),
      meal ? null : h('label.check-row', null, fav, h('span', { text: 'Zapisz jako ulubiony posiłek' })));
    const actions = [];
    if (meal) actions.push({ label: 'Usuń', kind: 'ghost', onClick: async () => { deleteMeal(ds, meal.id); Prime.refresh(); ui.rerenderPanel(); } });
    actions.push({ label: 'Anuluj', kind: 'ghost' });
    actions.push({ label: 'Zapisz', kind: 'primary', onClick: () => {
      const vals = { name: name.value.trim() || 'Posiłek', time: time.value || null, kcal: Math.round(num(kcal)), protein: num(protein), fat: num(fat), carbs: num(carbs) };
      if (vals.kcal + vals.protein + vals.fat + vals.carbs <= 0) { ui.toast('Podaj kalorie lub makro'); return false; }
      if (meal) updateMeal(ds, meal.id, vals);
      else {
        addMeal(ds, Object.assign({ id: Prime.uid() }, vals));
        if (fav.checked) {
          Prime.state.favoriteMeals.push({ id: Prime.uid(), name: vals.name, kcal: vals.kcal, protein: vals.protein, fat: vals.fat, carbs: vals.carbs });
          Prime.save();
        }
      }
      Prime.refresh();
    } });
    ui.sheet({ title: meal ? 'Edytuj posiłek' : 'Nowy posiłek', body, actions });
  }

  function openQuickMacro(ds) {
    openMealSheet(ds, null, { name: 'Szybki wpis' });
  }

  function openFavorites(ds) {
    const list = h('ul.template-pick-list');
    const draw = () => {
      ui.clear(list);
      const favs = Prime.state.favoriteMeals;
      if (!favs.length) { list.appendChild(h('li', null, ui.emptyState('Brak ulubionych posiłków.', 'Zaznacz „Zapisz jako ulubiony” przy dodawaniu posiłku.', true))); return; }
      favs.forEach(f => list.appendChild(h('li.template-pick-item', null,
        h('div', null, h('div.template-pick-name', { text: f.name }),
          h('div.template-pick-count', { text: `${f.kcal} kcal · B ${Prime.formatNum(f.protein)} · T ${Prime.formatNum(f.fat)} · W ${Prime.formatNum(f.carbs)}` })),
        h('div.row-actions', null,
          h('button.btn.small.primary', { type: 'button', text: 'Dodaj', onClick: () => {
            addMeal(ds, { id: Prime.uid(), name: f.name, time: ds === Prime.today() ? nowTime() : null, kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs });
            ui.closeModals(); Prime.refresh(); ui.toast('Dodano: ' + f.name);
          } }),
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Usuń ulubiony', onClick: () => {
            Prime.state.favoriteMeals = Prime.state.favoriteMeals.filter(x => x.id !== f.id); Prime.save(); draw();
          } }, ui.icon('trash'))))));
    };
    draw();
    ui.sheet({ title: 'Ulubione posiłki', body: list, actions: [{ label: 'Zamknij', kind: 'ghost' }], focus: false });
  }

  /** Meals block for the Dieta section on Today. */
  function renderDay(container, ds) {
    ui.clear(container);
    const day = Prime.day(ds);
    const st = Prime.state.settings;
    const t = S.sumMeals(day);
    const head = h('div.sub-head', null,
      h('span.sub-title', { text: 'Posiłki' }),
      h('div.sub-actions', null,
        h('button.chip-btn', { type: 'button', onClick: () => openMealSheet(ds) }, ui.icon('plus'), 'Posiłek'),
        h('button.chip-btn', { type: 'button', onClick: () => openQuickMacro(ds) }, 'Szybki wpis'),
        h('button.chip-btn', { type: 'button', onClick: () => openFavorites(ds) }, ui.icon('heart'), 'Ulubione')));
    container.appendChild(head);

    if (!hasMeals(day)) {
      container.appendChild(h('p.hint', { text: 'Sumy możesz wpisać ręcznie powyżej albo dodać posiłki — wtedy sumy liczą się z posiłków.' }));
      return;
    }
    const sorted = day.meals.slice().sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    const list = h('ul.list');
    sorted.forEach(m => list.appendChild(h('li.list-item.clickable', { role: 'button', tabindex: '0', onClick: () => openMealSheet(ds, m), onKeydown: (e) => { if (e.key === 'Enter') openMealSheet(ds, m); } },
      h('div.li-main', null,
        h('div.li-title', { text: m.name }),
        h('div.li-sub', { text: `${m.time ? m.time + ' · ' : ''}B ${Prime.formatNum(m.protein)} g · T ${Prime.formatNum(m.fat)} g · W ${Prime.formatNum(m.carbs)} g` })),
      h('div.li-value', { text: `${Math.round(m.kcal)} kcal` }))));
    container.appendChild(list);
    const parts = [`Razem: ${Math.round(t.kcal)} kcal`, `B ${Prime.formatNum(Prime.roundTo(t.protein, 1))} g`];
    parts.push(st.fatGoal > 0 ? `T ${Prime.formatNum(Prime.roundTo(t.fat, 1))}/${st.fatGoal} g` : `T ${Prime.formatNum(Prime.roundTo(t.fat, 1))} g`);
    parts.push(st.carbGoal > 0 ? `W ${Prime.formatNum(Prime.roundTo(t.carbs, 1))}/${st.carbGoal} g` : `W ${Prime.formatNum(Prime.roundTo(t.carbs, 1))} g`);
    container.appendChild(h('p.hint', { text: parts.join(' · ') + ' — sumy liczone z posiłków.' }));
  }

  /** Aggregates over a list of dates for stats / weekly review. */
  function summary(dates) {
    const st = Prime.state.settings;
    let kcalDays = 0, kcalSum = 0, protSum = 0, protDays = 0, fatSum = 0, carbSum = 0, macroDays = 0;
    let proteinGoalDays = 0, kcalOnTarget = 0, mealDays = 0;
    for (const ds of dates) {
      const d = Prime.state.days[ds];
      if (!d) continue;
      if (d.calories > 0) {
        kcalDays++; kcalSum += d.calories;
        if (st.calGoal > 0 && Math.abs(d.calories - st.calGoal) <= st.calGoal * 0.1) kcalOnTarget++;
      }
      if (d.protein > 0) { protDays++; protSum += d.protein; if (st.proteinGoal > 0 && d.protein >= st.proteinGoal) proteinGoalDays++; }
      if (hasMeals(d)) { mealDays++; }
      if (d.fat > 0 || d.carbs > 0) { macroDays++; fatSum += d.fat; carbSum += d.carbs; }
    }
    return {
      kcalDays, avgKcal: kcalDays ? Math.round(kcalSum / kcalDays) : null,
      protDays, avgProtein: protDays ? Math.round(protSum / protDays) : null,
      avgFat: macroDays ? Math.round(fatSum / macroDays) : null, avgCarbs: macroDays ? Math.round(carbSum / macroDays) : null,
      proteinGoalDays, kcalOnTarget, mealDays, total: dates.length,
    };
  }

  Prime.mods.nutrition = { hasMeals, addMeal, updateMeal, deleteMeal, openMealSheet, openQuickMacro, openFavorites, renderDay, summary };
})();
