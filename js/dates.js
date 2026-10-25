/* ============================================================
   PRIME LIFE MAXING — dates.js
   Date helpers. All dates are local-time "YYYY-MM-DD" strings.
   Works in the browser (window.PrimeDates) and in Node (tests).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PrimeDates = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WEEKDAYS_PL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const WEEKDAYS_SHORT_PL = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  const MONTHS_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const MONTHS_SHORT_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const MONTHS_NOM_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toDateStr(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  /** True only for a real calendar date in strict YYYY-MM-DD form. */
  function isDateStr(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function parseDateStr(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(dateStr, delta) {
    const d = parseDateStr(dateStr);
    d.setDate(d.getDate() + delta);
    return toDateStr(d);
  }

  function todayStr(now) {
    return toDateStr(now || new Date());
  }

  /** Whole days from a to b (b - a), DST-safe. */
  function diffDays(a, b) {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  }

  function lastNDays(n, endDateStr) {
    const out = [];
    let cursor = endDateStr;
    for (let i = 0; i < n; i++) {
      out.unshift(cursor);
      cursor = addDays(cursor, -1);
    }
    return out;
  }

  /** 0 = Monday … 6 = Sunday */
  function weekdayMon0(dateStr) {
    return (parseDateStr(dateStr).getDay() + 6) % 7;
  }

  /** Monday of the week containing dateStr. */
  function weekStart(dateStr) {
    return addDays(dateStr, -weekdayMon0(dateStr));
  }

  /** The 7 dates (Mon..Sun) of the week containing dateStr. */
  function weekDates(dateStr) {
    const start = weekStart(dateStr);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function formatFullDate(dateStr) {
    const d = parseDateStr(dateStr);
    return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatWeekday(dateStr) {
    return WEEKDAYS_PL[parseDateStr(dateStr).getDay()];
  }

  function shortLabel(ds) {
    const d = parseDateStr(ds);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  }

  /** "19 paź" */
  function dayMonthShort(ds) {
    const d = parseDateStr(ds);
    return `${d.getDate()} ${MONTHS_SHORT_PL[d.getMonth()]}`;
  }

  /** "19 paź – 25 paź 2026" — always states the period a statistic covers. */
  function rangeLabel(startStr, endStr) {
    const s = parseDateStr(startStr), e = parseDateStr(endStr);
    const left = s.getFullYear() === e.getFullYear() ? dayMonthShort(startStr) : `${dayMonthShort(startStr)} ${s.getFullYear()}`;
    return `${left} – ${dayMonthShort(endStr)} ${e.getFullYear()}`;
  }

  function monthKey(ds) { return ds.slice(0, 7); }

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return `${MONTHS_NOM_PL[m - 1]} ${y}`;
  }

  function addMonths(key, delta) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  /** "HH:MM" → minutes since midnight, or null if invalid. */
  function parseTime(str) {
    if (typeof str !== 'string') return null;
    const m = /^(\d{2}):(\d{2})$/.exec(str);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /**
   * Sleep duration in hours between bedtime and wake time (both "HH:MM").
   * Handles crossing midnight. Returns null unless both are valid and the
   * result is plausible (0.5 h – 20 h) — never guesses from bad input.
   */
  function sleepHours(bed, wake) {
    const b = parseTime(bed), w = parseTime(wake);
    if (b === null || w === null) return null;
    let diff = w - b;
    if (diff <= 0) diff += 24 * 60;
    const hours = diff / 60;
    if (hours < 0.5 || hours > 20) return null;
    return Math.round(hours * 10) / 10;
  }

  return {
    WEEKDAYS_PL, WEEKDAYS_SHORT_PL, MONTHS_PL, MONTHS_SHORT_PL, MONTHS_NOM_PL,
    pad2, toDateStr, isDateStr, parseDateStr, addDays, todayStr, diffDays, lastNDays,
    weekdayMon0, weekStart, weekDates, formatFullDate, formatWeekday, shortLabel,
    dayMonthShort, rangeLabel, monthKey, monthLabel, addMonths, parseTime, sleepHours,
  };
});
