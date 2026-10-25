/* ============================================================
   PRIME LIFE MAXING — schema.js
   Data shapes (v2), validation/normalisation and v1 → v2 migration.

   Rules this file follows:
   - ADDITIVE: every v1 field keeps its name, type and meaning.
   - UNKNOWN KEYS ARE PRESERVED (top level, settings, days, items) so a
     newer/older build never silently drops data it does not understand.
   - Pure functions only: no localStorage, no DOM (testable in Node).
   ============================================================ */
(function (root, factory) {
  const D = (typeof module === 'object' && module.exports) ? require('./dates.js') : root.PrimeDates;
  const api = factory(D);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PrimeSchema = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const CURRENT_VERSION = 2;

  const LIMITS = {
    maxDays: 20000,
    maxTasksPerDay: 500,
    maxItems: 20000,
    maxText: 5000,
  };

  const ACCENTS = ['lime', 'green', 'blue', 'amber', 'violet'];
  const EXERCISE_TYPES = ['weights', 'bodyweight', 'time', 'cardio'];

  /* ---------------- tiny helpers ---------------- */

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function str(x, max, def) {
    if (typeof x === 'string') return x.slice(0, max);
    if (typeof x === 'number' && isFinite(x)) return String(x).slice(0, max);
    return def === undefined ? '' : def;
  }

  function num(x, min, max, def) {
    let n = NaN;
    if (typeof x === 'number') n = x;
    else if (typeof x === 'string' && x.trim() !== '') n = Number(x);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }

  function numOrNull(x, min, max) {
    if (x === null || x === undefined || x === '') return null;
    const n = num(x, min, max, NaN);
    return isFinite(n) ? n : null;
  }

  function dateOrNull(x) { return D.isDateStr(x) ? x : null; }

  function timeOrNull(x) { return D.parseTime(x) !== null ? x : null; }

  function oneOf(x, list, def) { return list.indexOf(x) !== -1 ? x : def; }

  /** Map array through fn, dropping null results; report how many were dropped. */
  function mapArr(arr, fn, cap, report, label) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length && out.length < cap; i++) {
      const v = fn(arr[i]);
      if (v) out.push(v); else if (report) report.dropped[label] = (report.dropped[label] || 0) + 1;
    }
    return out;
  }

  /** Keep extras of `raw`, then overwrite known fields with validated values. */
  function withExtras(raw, known) { return Object.assign({}, raw, known); }

  /* ---------------- defaults ---------------- */

  function defaultSettings() {
    return {
      waterGoal: 3.0,
      calGoal: 2200,
      proteinGoal: 150,
      streakThreshold: 60,
      units: 'metric',
      accent: 'lime',
      // v2
      name: '',
      fatGoal: 0,
      carbGoal: 0,
      sleepGoal: 7.5,
      weeklyWorkouts: 3,
      workoutTaskMode: 'mark', // 'off' | 'mark' | 'create'
      modules: {
        training: true, nutrition: true, habits: true, care: true,
        photos: false, finance: true, growth: true, social: false, xp: true,
      },
      ui: { open: {}, statsSection: 'overview' },
    };
  }

  function defaultChallenge() {
    return {
      id: 'lm-2026',
      name: 'Prime Life Maxing',
      start: '2026-10-26',
      end: '2026-12-31',
      goal: '',
    };
  }

  function defaultDay() {
    return {
      // v1
      tasks: [], water: 0, protein: 0, calories: 0, sleep: null, weight: null, steps: null, note: '',
      // v2 (optional, additive)
      fat: 0, carbs: 0, meals: [], sleepInfo: null, habits: {}, care: {}, appliedRecurring: [], rest: false,
    };
  }

  function defaultState(now) {
    return {
      version: CURRENT_VERSION,
      settings: defaultSettings(),
      days: {},
      templates: [],
      goals: [],
      challenge: defaultChallenge(),
      habits: [],
      care: { morning: [], evening: [], periodic: [] },
      recurring: [],
      workouts: { exercises: [], plans: [], sessions: [] },
      favoriteMeals: [],
      finance: { initialBalance: 0, categories: [], transactions: [], savingsGoals: [] },
      growth: { projects: [], sessions: [], weeklySessions: 3, sessionMinutes: 30 },
      social: { items: [] },
      xp: { startDate: D.todayStr(now) },
      _meta: { schema: CURRENT_VERSION, createdAt: (now || new Date()).toISOString() },
    };
  }

  /* ---------------- normalisers (each tolerant of garbage) ---------------- */

  function normalizeTask(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 200),
      time: timeOrNull(raw.time),
      category: raw.category ? str(raw.category, 30) : null,
      done: !!raw.done,
      priority: !!raw.priority,
    });
  }

  function normalizeMeal(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 100),
      time: timeOrNull(raw.time),
      kcal: num(raw.kcal, 0, 20000, 0),
      protein: num(raw.protein, 0, 2000, 0),
      fat: num(raw.fat, 0, 2000, 0),
      carbs: num(raw.carbs, 0, 3000, 0),
    });
  }

  function normalizeSleepInfo(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      bed: timeOrNull(raw.bed),
      wake: timeOrNull(raw.wake),
      quality: numOrNull(raw.quality, 1, 5),
      note: str(raw.note, 300),
    });
  }

  function boolMap(raw) {
    const out = {};
    if (!isObj(raw)) return out;
    for (const k of Object.keys(raw)) if (raw[k]) out[k] = true;
    return out;
  }

  function normalizeDay(raw, report) {
    const r = isObj(raw) ? raw : {};
    const d = Object.assign(defaultDay(), r);
    d.tasks = mapArr(r.tasks, normalizeTask, LIMITS.maxTasksPerDay, report, 'tasks');
    d.water = num(r.water, 0, 100000, 0);
    d.protein = num(r.protein, 0, 20000, 0);
    d.calories = num(r.calories, 0, 100000, 0);
    d.sleep = numOrNull(r.sleep, 0, 24);
    d.weight = numOrNull(r.weight, 0, 1000);
    d.steps = numOrNull(r.steps, 0, 1000000);
    d.note = str(r.note, LIMITS.maxText);
    d.fat = num(r.fat, 0, 20000, 0);
    d.carbs = num(r.carbs, 0, 30000, 0);
    d.meals = mapArr(r.meals, normalizeMeal, 200, report, 'meals');
    d.sleepInfo = normalizeSleepInfo(r.sleepInfo);
    d.habits = boolMap(r.habits);
    d.care = boolMap(r.care);
    d.rest = !!r.rest;
    d.appliedRecurring = Array.isArray(r.appliedRecurring) ? r.appliedRecurring.filter(x => typeof x === 'string').slice(0, 200) : [];
    return d;
  }

  function normalizeDays(raw, report) {
    const out = {};
    if (!isObj(raw)) return out;
    let count = 0;
    for (const key of Object.keys(raw)) {
      if (!D.isDateStr(key)) { report.dropped.badDayKeys = (report.dropped.badDayKeys || 0) + 1; continue; }
      if (++count > LIMITS.maxDays) { report.dropped.tooManyDays = (report.dropped.tooManyDays || 0) + 1; continue; }
      out[key] = normalizeDay(raw[key], report);
    }
    return out;
  }

  function normalizeSettings(raw) {
    const base = defaultSettings();
    const r = isObj(raw) ? raw : {};
    const s = Object.assign(defaultSettings(), r); // separate copy: `base` must stay pristine for fallbacks
    s.waterGoal = num(r.waterGoal, 0.1, 20, base.waterGoal);
    s.calGoal = num(r.calGoal, 0, 20000, base.calGoal);
    s.proteinGoal = num(r.proteinGoal, 0, 2000, base.proteinGoal);
    s.streakThreshold = num(r.streakThreshold, 1, 100, base.streakThreshold);
    s.units = oneOf(r.units, ['metric', 'imperial'], 'metric');
    s.accent = typeof r.accent === 'string' && r.accent ? r.accent.slice(0, 20) : base.accent;
    s.name = str(r.name, 40);
    s.fatGoal = num(r.fatGoal, 0, 2000, 0);
    s.carbGoal = num(r.carbGoal, 0, 3000, 0);
    s.sleepGoal = num(r.sleepGoal, 1, 16, 7.5);
    s.weeklyWorkouts = Math.round(num(r.weeklyWorkouts, 0, 7, 3));
    s.workoutTaskMode = oneOf(r.workoutTaskMode, ['off', 'mark', 'create'], 'mark');
    const mods = defaultSettings().modules;
    const rm = isObj(r.modules) ? r.modules : {};
    s.modules = Object.assign({}, rm);
    for (const k of Object.keys(mods)) s.modules[k] = typeof rm[k] === 'boolean' ? rm[k] : mods[k];
    const ru = isObj(r.ui) ? r.ui : {};
    s.ui = Object.assign({}, ru, {
      open: boolMap(ru.open),
      statsSection: str(ru.statsSection, 20) || 'overview',
    });
    return s;
  }

  function normalizeTemplate(raw) {
    if (!isObj(raw)) return null;
    const tasks = Array.isArray(raw.tasks)
      ? raw.tasks.filter(isObj).map(t => withExtras(t, { name: str(t.name, 200), category: t.category ? str(t.category, 30) : null }))
      : [];
    return withExtras(raw, { id: str(raw.id, 64) || uid(), name: str(raw.name, 100), tasks });
  }

  function normalizeGoal(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 100),
      desc: str(raw.desc, 300),
      current: num(raw.current, -1e12, 1e12, 0),
      target: num(raw.target, -1e12, 1e12, 0),
      unit: str(raw.unit, 20),
      deadline: dateOrNull(raw.deadline),
      // v2 (optional)
      category: raw.category ? str(raw.category, 30) : null,
      link: raw.link ? str(raw.link, 40) : null,
    });
  }

  function normalizeChallenge(raw) {
    const def = defaultChallenge();
    const r = isObj(raw) ? raw : {};
    const c = Object.assign(defaultChallenge(), r); // `def` stays pristine for fallbacks
    c.id = str(r.id, 64) || def.id;
    c.name = str(r.name, 80) || def.name;
    c.start = dateOrNull(r.start) || def.start;
    c.end = dateOrNull(r.end) || def.end;
    if (c.end < c.start) { c.start = def.start; c.end = def.end; }
    c.goal = str(r.goal, 300);
    return c;
  }

  function normalizeHabit(raw) {
    if (!isObj(raw)) return null;
    const freq = oneOf(raw.freq, ['daily', 'days', 'weekly'], 'daily');
    const days = Array.isArray(raw.days) ? Array.from(new Set(raw.days.map(Number).filter(n => n >= 0 && n <= 6 && Number.isInteger(n)))).sort() : [];
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 80),
      freq,
      days,
      target: Math.round(num(raw.target, 1, 7, 3)),
      archived: !!raw.archived,
      createdAt: dateOrNull(raw.createdAt) || D.todayStr(),
    });
  }

  function normalizeCareItem(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, { id: str(raw.id, 64) || uid(), name: str(raw.name, 80) });
  }

  function normalizeCare(raw) {
    const r = isObj(raw) ? raw : {};
    return Object.assign({}, r, {
      morning: mapArr(r.morning, normalizeCareItem, 50),
      evening: mapArr(r.evening, normalizeCareItem, 50),
      periodic: mapArr(r.periodic, (x) => {
        const it = normalizeCareItem(x);
        if (!it) return null;
        it.everyDays = Math.round(num(x.everyDays, 1, 365, 14));
        return it;
      }, 50),
    });
  }

  function normalizeRecurring(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 200),
      category: raw.category ? str(raw.category, 30) : null,
      time: timeOrNull(raw.time),
      duration: numOrNull(raw.duration, 1, 1440),
      freq: oneOf(raw.freq, ['daily', 'weekdays', 'weekly'], 'daily'),
      dow: Math.round(num(raw.dow, 0, 6, 0)), // for weekly: 0 = Monday
      startDate: dateOrNull(raw.startDate) || D.todayStr(),
      endDate: dateOrNull(raw.endDate),
    });
  }

  function normalizeExercise(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 80),
      muscle: str(raw.muscle, 30),
      type: oneOf(raw.type, EXERCISE_TYPES, 'weights'),
      desc: str(raw.desc, 300),
    });
  }

  function normalizePlan(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      name: str(raw.name, 80),
      exercises: Array.isArray(raw.exercises) ? raw.exercises.filter(x => typeof x === 'string').slice(0, 60) : [],
      archived: !!raw.archived,
      createdAt: dateOrNull(raw.createdAt) || D.todayStr(),
    });
  }

  function normalizeSet(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      reps: numOrNull(raw.reps, 0, 10000),
      weight: numOrNull(raw.weight, 0, 5000),
      time: numOrNull(raw.time, 0, 86400 * 2),
      distance: numOrNull(raw.distance, 0, 100000),
      done: !!raw.done,
    });
  }

  function normalizeSession(raw) {
    if (!isObj(raw)) return null;
    const date = dateOrNull(raw.date);
    if (!date) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(),
      date,
      planId: raw.planId ? str(raw.planId, 64) : null,
      name: str(raw.name, 80),
      startedAt: str(raw.startedAt, 40) || null,
      endedAt: raw.endedAt ? str(raw.endedAt, 40) : null,
      status: oneOf(raw.status, ['active', 'done'], 'done'),
      note: str(raw.note, 1000),
      entries: mapArr(raw.entries, (e) => {
        if (!isObj(e)) return null;
        return withExtras(e, {
          id: str(e.id, 64) || uid(),
          exerciseId: str(e.exerciseId, 64),
          note: str(e.note, 300),
          sets: mapArr(e.sets, normalizeSet, 100),
        });
      }, 60),
    });
  }

  function normalizeWorkouts(raw) {
    const r = isObj(raw) ? raw : {};
    return Object.assign({}, r, {
      exercises: mapArr(r.exercises, normalizeExercise, 500),
      plans: mapArr(r.plans, normalizePlan, 200),
      sessions: mapArr(r.sessions, normalizeSession, LIMITS.maxItems),
    });
  }

  function normalizeFavMeal(raw) {
    if (!isObj(raw)) return null;
    return withExtras(raw, {
      id: str(raw.id, 64) || uid(), name: str(raw.name, 100),
      kcal: num(raw.kcal, 0, 20000, 0), protein: num(raw.protein, 0, 2000, 0),
      fat: num(raw.fat, 0, 2000, 0), carbs: num(raw.carbs, 0, 3000, 0),
    });
  }

  function normalizeFinance(raw) {
    const r = isObj(raw) ? raw : {};
    return Object.assign({}, r, {
      initialBalance: num(r.initialBalance, -1e9, 1e9, 0),
      categories: mapArr(r.categories, (c) => {
        if (!isObj(c)) return null;
        return withExtras(c, { id: str(c.id, 64) || uid(), name: str(c.name, 40), kind: oneOf(c.kind, ['in', 'out'], 'out') });
      }, 200),
      transactions: mapArr(r.transactions, (t) => {
        if (!isObj(t)) return null;
        const date = dateOrNull(t.date);
        const amount = num(t.amount, 0, 1e9, NaN);
        if (!date || !isFinite(amount)) return null;
        return withExtras(t, {
          id: str(t.id, 64) || uid(), date, amount: Math.round(amount * 100) / 100,
          type: oneOf(t.type, ['in', 'out', 'save'], 'out'),
          categoryId: t.categoryId ? str(t.categoryId, 64) : null,
          goalId: t.goalId ? str(t.goalId, 64) : null,
          note: str(t.note, 200),
        });
      }, LIMITS.maxItems),
      savingsGoals: mapArr(r.savingsGoals, (g) => {
        if (!isObj(g)) return null;
        return withExtras(g, {
          id: str(g.id, 64) || uid(), name: str(g.name, 80),
          target: num(g.target, 0, 1e9, 0), deadline: dateOrNull(g.deadline),
        });
      }, 100),
    });
  }

  function normalizeGrowth(raw) {
    const r = isObj(raw) ? raw : {};
    return Object.assign({}, r, {
      projects: mapArr(r.projects, (p) => {
        if (!isObj(p)) return null;
        return withExtras(p, {
          id: str(p.id, 64) || uid(), name: str(p.name, 80), desc: str(p.desc, 300), goal: str(p.goal, 300),
          priority: oneOf(p.priority, ['low', 'normal', 'high'], 'normal'),
          deadline: dateOrNull(p.deadline),
          status: oneOf(p.status, ['active', 'paused', 'done'], 'active'),
          main: !!p.main,
          notes: str(p.notes, LIMITS.maxText),
          createdAt: dateOrNull(p.createdAt) || D.todayStr(),
          tasks: mapArr(p.tasks, (t) => {
            if (!isObj(t)) return null;
            return withExtras(t, { id: str(t.id, 64) || uid(), name: str(t.name, 150), done: !!t.done, doneAt: dateOrNull(t.doneAt) });
          }, 300),
        });
      }, 100),
      sessions: mapArr(r.sessions, (s) => {
        if (!isObj(s)) return null;
        const date = dateOrNull(s.date);
        if (!date) return null;
        return withExtras(s, { id: str(s.id, 64) || uid(), date, projectId: s.projectId ? str(s.projectId, 64) : null, minutes: Math.round(num(s.minutes, 0, 1440, 0)), note: str(s.note, 300) });
      }, LIMITS.maxItems),
      weeklySessions: Math.round(num(r.weeklySessions, 0, 21, 3)),
      sessionMinutes: Math.round(num(r.sessionMinutes, 5, 600, 30)),
    });
  }

  function normalizeSocial(raw) {
    const r = isObj(raw) ? raw : {};
    return Object.assign({}, r, {
      items: mapArr(r.items, (i) => {
        if (!isObj(i)) return null;
        return withExtras(i, {
          id: str(i.id, 64) || uid(),
          type: oneOf(i.type, ['contact', 'event', 'challenge'], 'event'),
          title: str(i.title, 120),
          date: dateOrNull(i.date),
          note: str(i.note, 500),
          reflection: str(i.reflection, 1000),
          done: !!i.done,
          createdAt: dateOrNull(i.createdAt) || D.todayStr(),
        });
      }, 2000),
    });
  }

  /**
   * Bring any parsed object up to the v2 shape WITHOUT discarding anything:
   * unknown top-level keys survive, known structures are type-checked.
   * Returns { state, report }.
   */
  function normalizeState(parsed, now) {
    const report = { dropped: {} };
    const p = isObj(parsed) ? parsed : {};
    const base = defaultState(now);
    const s = Object.assign({}, p); // <- keeps unknown top-level keys
    s.version = CURRENT_VERSION;
    s.settings = normalizeSettings(p.settings);
    s.days = normalizeDays(p.days, report);
    s.templates = mapArr(p.templates, normalizeTemplate, 500, report, 'templates');
    s.goals = mapArr(p.goals, normalizeGoal, 1000, report, 'goals');
    s.challenge = normalizeChallenge(p.challenge);
    s.habits = mapArr(p.habits, normalizeHabit, 200, report, 'habits');
    s.care = normalizeCare(p.care);
    s.recurring = mapArr(p.recurring, normalizeRecurring, 200, report, 'recurring');
    s.workouts = normalizeWorkouts(p.workouts);
    s.favoriteMeals = mapArr(p.favoriteMeals, normalizeFavMeal, 200, report, 'favoriteMeals');
    s.finance = normalizeFinance(p.finance);
    s.growth = normalizeGrowth(p.growth);
    s.social = normalizeSocial(p.social);
    const rx = isObj(p.xp) ? p.xp : {};
    s.xp = Object.assign({}, rx, { startDate: dateOrNull(rx.startDate) || base.xp.startDate });
    const rm = isObj(p._meta) ? p._meta : {};
    s._meta = Object.assign({}, rm, { schema: CURRENT_VERSION, createdAt: str(rm.createdAt, 40) || base._meta.createdAt });
    return { state: s, report };
  }

  /**
   * v1 → v2. Pure: does not touch storage. The caller must have made a raw
   * backup first. A v1 object is anything with version 1 / missing version.
   */
  function migrate(parsed, now) {
    const fromVersion = isObj(parsed) && typeof parsed.version === 'number' ? parsed.version : 1;
    const { state, report } = normalizeState(parsed, now);
    if (fromVersion < CURRENT_VERSION) {
      state._meta = Object.assign({}, state._meta, {
        migratedFrom: fromVersion,
        migratedAt: (now || new Date()).toISOString(),
      });
      // XP/badges start from the moment of upgrade: no invented back-dated rewards.
      state.xp.startDate = D.todayStr(now);
    }
    return { state, report, fromVersion };
  }

  /* -------- derived (never stored) numbers shared by many modules -------- */

  function sumMeals(day) {
    const t = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    for (const m of day.meals || []) {
      t.kcal += m.kcal || 0; t.protein += m.protein || 0; t.fat += m.fat || 0; t.carbs += m.carbs || 0;
    }
    return t;
  }

  /** Keep day.calories/protein/fat/carbs equal to meal totals when meals exist (single source of truth). */
  function syncNutritionTotals(day) {
    if (!day.meals || day.meals.length === 0) return;
    const t = sumMeals(day);
    day.calories = Math.round(t.kcal);
    day.protein = Math.round(t.protein * 10) / 10;
    day.fat = Math.round(t.fat * 10) / 10;
    day.carbs = Math.round(t.carbs * 10) / 10;
  }

  return {
    CURRENT_VERSION, LIMITS, ACCENTS, EXERCISE_TYPES,
    isObj, uid, str, num, numOrNull,
    defaultSettings, defaultDay, defaultState, defaultChallenge,
    normalizeState, normalizeDay, normalizeSettings, normalizeGoal, normalizeTask, normalizeSession,
    migrate, sumMeals, syncNutritionTotals,
  };
});
