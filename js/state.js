/* ============================================================
   PRIME LIFE MAXING — state.js
   Shared application state + core selectors (score, streak).
   Creates the global `Prime` namespace that every module hangs off.
   ============================================================ */
(function () {
  'use strict';

  const D = window.PrimeDates, S = window.PrimeSchema, ST = window.PrimeStorage;

  /* localStorage can throw on access (blocked storage). Fall back to memory
     so the app still opens, and tell the user nothing will be kept. */
  let ls = null, volatile = false;
  try { ls = window.localStorage; ls.getItem('__probe'); } catch (e) { ls = null; }
  if (!ls) {
    volatile = true;
    const mem = new Map();
    ls = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      key: (i) => Array.from(mem.keys())[i] || null,
      get length() { return mem.size; },
    };
  }

  const Prime = {
    D, S, ST, ls,
    state: null,
    locked: false,
    volatile,
    startup: { status: 'empty', info: {}, raw: null },
    storageIssue: null, // short text shown in the banner when saving fails
    view: 'today',
    date: D.todayStr(),
    range: 7,
    mods: {},           // feature modules register here
    refresh: function () {}, // set by app.js: re-render current view
  };
  window.Prime = Prime;

  /* ---------------- init / persistence ---------------- */

  Prime.initState = function () {
    const r = ST.load(ls);
    Prime.state = r.state;
    Prime.locked = r.locked;
    Prime.startup = { status: r.status, info: r.info || {}, raw: r.raw };
    if (r.locked) Prime.storageIssue = 'locked';
    return r;
  };

  let saveTimer = null, dirty = false;

  Prime.save = function () {
    clearTimeout(saveTimer); saveTimer = null; dirty = false;
    if (Prime.locked) {
      if (Prime.ui) Prime.ui.toast('Tryb tylko do odczytu — zmiany nie są zapisywane');
      return false;
    }
    const r = ST.save(ls, Prime.state, { locked: false });
    if (!r.ok) {
      Prime.storageIssue = r.error === 'quota' ? 'quota' : 'write';
      if (Prime.ui) { Prime.ui.toast('Nie udało się zapisać danych'); Prime.ui.updateBanner(); }
      return false;
    }
    if (Prime.storageIssue === 'quota' || Prime.storageIssue === 'write') { Prime.storageIssue = null; if (Prime.ui) Prime.ui.updateBanner(); }
    return true;
  };

  /** Debounced save for typing; flushed when the page is hidden/closed. */
  Prime.saveSoon = function () {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(Prime.save, 300);
  };

  Prime.flush = function () { if (dirty) Prime.save(); };
  window.addEventListener('pagehide', Prime.flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Prime.flush(); });

  /* ---------------- accessors ---------------- */

  Prime.uid = S.uid;
  Prime.today = () => D.todayStr();

  /** Read a day WITHOUT creating it (viewing must not write). */
  Prime.day = function (ds) {
    return Prime.state.days[ds] || S.defaultDay();
  };

  Prime.hasDay = (ds) => !!Prime.state.days[ds];

  /** Get-or-create a day for mutation. */
  Prime.ensureDay = function (ds) {
    let d = Prime.state.days[ds];
    if (!d) { d = S.defaultDay(); Prime.state.days[ds] = d; }
    return d;
  };

  Prime.modEnabled = function (name) {
    const m = Prime.state.settings.modules;
    return !m || m[name] !== false;
  };

  /* ---------------- score / streak ---------------- */

  Prime.computeScore = function (day) {
    if (!day || !day.tasks || day.tasks.length === 0) return { done: 0, total: 0, pct: null };
    const total = day.tasks.length;
    const done = day.tasks.filter(t => t.done).length;
    return { done, total, pct: Math.round((done / total) * 100) };
  };

  /** A day passes when its score reaches the user's threshold. Rest days are neutral. */
  Prime.dayPasses = function (ds) {
    const d = Prime.state.days[ds];
    const s = Prime.computeScore(d);
    return s.pct !== null && s.pct >= Prime.state.settings.streakThreshold;
  };

  Prime.isRest = (ds) => !!(Prime.state.days[ds] && Prime.state.days[ds].rest);

  Prime.computeStreak = function () {
    let streak = 0;
    let cursor = Prime.today();
    if (!Prime.isRest(cursor) && Prime.dayPasses(cursor)) streak += 1;
    cursor = D.addDays(cursor, -1);
    for (let i = 0; i < 3650; i++) {
      if (Prime.isRest(cursor)) { cursor = D.addDays(cursor, -1); continue; }
      if (Prime.dayPasses(cursor)) { streak += 1; cursor = D.addDays(cursor, -1); } else break;
    }
    return streak;
  };

  Prime.computeBestStreakEver = function () {
    const keys = Object.keys(Prime.state.days).filter(k => D.isDateStr(k)).sort();
    if (keys.length === 0) return 0;
    let cursor = keys[0];
    const end = Prime.today();
    let best = 0, current = 0;
    while (cursor <= end) {
      if (Prime.isRest(cursor)) { /* neutral */ }
      else if (Prime.dayPasses(cursor)) { current += 1; if (current > best) best = current; }
      else current = 0;
      cursor = D.addDays(cursor, 1);
    }
    return best;
  };

  Prime.dayKeys = () => Object.keys(Prime.state.days).filter(k => D.isDateStr(k)).sort();

  /* ---------------- small shared helpers ---------------- */

  Prime.clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  Prime.roundTo = function (n, dec) { const f = Math.pow(10, dec); return Math.round((n + Number.EPSILON) * f) / f; };
  Prime.formatNum = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number.isInteger(n) ? String(n) : String(Prime.roundTo(n, 2));
  };
  Prime.plural = function (n, one, few, many) {
    const a = Math.abs(n);
    if (a === 1) return one;
    const m10 = a % 10, m100 = a % 100;
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few;
    return many;
  };
  Prime.avg = function (arr) {
    const v = arr.filter(x => x !== null && x !== undefined && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  Prime.CATEGORIES = [
    { id: 'trening', icon: 'dumbbell', label: 'Trening' },
    { id: 'praca', icon: 'briefcase', label: 'Praca' },
    { id: 'rozwoj', icon: 'bulb', label: 'Rozwój' },
    { id: 'zdrowie', icon: 'leaf', label: 'Zdrowie' },
    { id: 'dom', icon: 'home', label: 'Dom' },
    { id: 'osobiste', icon: 'user', label: 'Osobiste' },
    { id: 'inne', icon: 'pin', label: 'Inne' },
  ];
  Prime.catInfo = (id) => Prime.CATEGORIES.find(c => c.id === id) || null;
})();
