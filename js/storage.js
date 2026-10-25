/* ============================================================
   PRIME LIFE MAXING — storage.js
   The ONLY place that touches localStorage for app data.

   Key facts
   - Main key stays `prime_data_v1` (changing it would orphan existing data).
     The schema version lives INSIDE the JSON (`version`).
   - Reading never writes (except the one-off v1→v2 upgrade, which is preceded
     by a verified raw backup; if the backup cannot be saved, the upgrade is
     NOT performed and the app runs in locked/read-only mode).
   - A corrupt value is never overwritten: the raw text is kept, the app runs
     locked and offers download / explicit recovery.
   - A "mirror" copy of the last good v2 state is kept so that if an OLD build
     (which drops unknown keys) ever saves over the data, the new modules can
     be merged back on the next start.
   ============================================================ */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./dates.js') : root.PrimeDates;
  const S = isNode ? require('./schema.js') : root.PrimeSchema;
  const api = factory(D, S);
  if (isNode) module.exports = api; else root.PrimeStorage = api;
})(typeof self !== 'undefined' ? self : this, function (D, S) {
  'use strict';

  const KEY = 'prime_data_v1';
  const MIRROR_KEY = 'prime_data_v2_mirror';
  const BACKUP_INDEX_KEY = 'prime_backup_index';
  const BACKUP_PREFIX = 'prime_bk_';
  const MAX_IMPORT_CHARS = 8 * 1024 * 1024;
  const MIRROR_MAX_CHARS = 2 * 1024 * 1024;
  const KEEP_PER_REASON = { premigration: 3, import: 2, reset: 2, corrupt: 3, recovery: 2 };

  /* ---------------- backups (raw text copies in localStorage) ---------------- */

  function readIndex(ls) {
    try {
      const v = JSON.parse(ls.getItem(BACKUP_INDEX_KEY) || '[]');
      return Array.isArray(v) ? v.filter(e => e && typeof e.key === 'string') : [];
    } catch (e) { return []; }
  }

  function writeIndex(ls, idx) {
    try { ls.setItem(BACKUP_INDEX_KEY, JSON.stringify(idx)); return true; } catch (e) { return false; }
  }

  /**
   * Store `raw` verbatim under a new key and verify it reads back identical.
   * Returns { ok, key?, error? }. Old copies of the same reason beyond the cap
   * are pruned only AFTER the new one was written successfully.
   */
  function createBackup(ls, reason, raw) {
    if (typeof raw !== 'string') return { ok: false, error: 'no-data' };
    const ts = new Date().toISOString();
    const key = `${BACKUP_PREFIX}${reason}_${ts.replace(/[^0-9]/g, '')}_${Math.random().toString(36).slice(2, 5)}`;
    try {
      ls.setItem(key, raw);
      if (ls.getItem(key) !== raw) { try { ls.removeItem(key); } catch (e) { /* ignore */ } return { ok: false, error: 'verify' }; }
    } catch (e) {
      return { ok: false, error: 'quota' };
    }
    let idx = readIndex(ls);
    idx.push({ key, reason, ts, chars: raw.length });
    const sameReason = idx.filter(e => e.reason === reason);
    const cap = KEEP_PER_REASON[reason] || 2;
    if (sameReason.length > cap) {
      const drop = sameReason.slice(0, sameReason.length - cap);
      for (const d of drop) { try { ls.removeItem(d.key); } catch (e) { /* ignore */ } }
      idx = idx.filter(e => drop.indexOf(e) === -1);
    }
    writeIndex(ls, idx);
    return { ok: true, key };
  }

  function listBackups(ls) {
    return readIndex(ls).filter(e => { try { return ls.getItem(e.key) !== null; } catch (x) { return false; } });
  }

  function readBackup(ls, key) {
    try { return ls.getItem(key); } catch (e) { return null; }
  }

  function deleteBackup(ls, key) {
    try { ls.removeItem(key); } catch (e) { /* ignore */ }
    writeIndex(ls, readIndex(ls).filter(e => e.key !== key));
  }

  /* ---------------- merging (rollback recovery) ---------------- */

  /**
   * `main` was last saved by an OLD build (v1), `mirror` is the last v2 state.
   * Result = main's data (it is newer for the fields v1 understands) plus
   * everything only the mirror knows (new modules, new per-day fields).
   */
  function recoverFromMirror(main, mirror) {
    const out = Object.assign({}, mirror, main);
    for (const k of Object.keys(mirror)) {
      if (!(k in main) || main[k] === undefined) out[k] = mirror[k];
    }
    // settings: main wins on shared keys, mirror supplies the rest
    out.settings = Object.assign({}, mirror.settings || {}, main.settings || {});
    out.settings.modules = Object.assign({}, (mirror.settings || {}).modules || {}, (main.settings || {}).modules || {});
    // days: union; for the same date keep main's v1 fields + mirror's extras
    const days = {};
    const mDays = (mirror.days && typeof mirror.days === 'object') ? mirror.days : {};
    const aDays = (main.days && typeof main.days === 'object') ? main.days : {};
    for (const k of new Set([...Object.keys(mDays), ...Object.keys(aDays)])) {
      days[k] = Object.assign({}, mDays[k] || {}, aDays[k] || {});
    }
    out.days = days;
    // lists the old build can edit: union by id, main's version wins
    for (const listKey of ['templates', 'goals']) {
      const a = Array.isArray(main[listKey]) ? main[listKey] : [];
      const m = Array.isArray(mirror[listKey]) ? mirror[listKey] : [];
      const byId = new Map();
      for (const it of m) if (it && it.id) byId.set(it.id, it);
      for (const it of a) if (it && it.id) byId.set(it.id, Object.assign({}, byId.get(it.id) || {}, it));
      out[listKey] = Array.from(byId.values());
    }
    return out;
  }

  /* ---------------- loading ---------------- */

  /**
   * status:
   *  'empty'     nothing stored yet (nothing is written until the first change)
   *  'ok'        v2 loaded
   *  'migrated'  v1 upgraded to v2 (raw backup verified first)
   *  'recovered' v1-looking data merged with the v2 mirror
   *  'corrupt'   unparsable JSON — raw kept, app locked
   *  'locked'    data is intact but cannot be safely modified (no room for
   *              backup, newer version, storage unreadable) — app read-only
   */
  function load(ls, now) {
    const result = (o) => Object.assign({ state: null, status: 'ok', locked: false, raw: null, info: {} }, o);

    let raw;
    try { raw = ls.getItem(KEY); } catch (e) {
      return result({ state: S.defaultState(now), status: 'locked', locked: true, info: { reason: 'storage-unavailable' } });
    }
    if (raw === null || raw === '') return result({ state: S.defaultState(now), status: 'empty' });

    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      createBackup(ls, 'corrupt', raw); // best effort: raw also stays in the main key, untouched
      return result({ state: S.defaultState(now), status: 'corrupt', locked: true, raw, info: { reason: 'parse-error' } });
    }
    if (!S.isObj(parsed)) {
      return result({ state: S.defaultState(now), status: 'corrupt', locked: true, raw, info: { reason: 'not-an-object' } });
    }

    const ver = typeof parsed.version === 'number' ? parsed.version : 1;

    if (ver > S.CURRENT_VERSION) {
      const n = S.normalizeState(parsed, now);
      return result({ state: n.state, status: 'locked', locked: true, raw, info: { reason: 'newer-version', version: ver } });
    }

    if (ver === S.CURRENT_VERSION) {
      const n = S.normalizeState(parsed, now);
      return result({ state: n.state, status: 'ok', raw, info: { dropped: n.report.dropped } });
    }

    // ---- v1 → v2 (or rollback recovery) ----
    let mirrorState = null;
    try {
      const mr = ls.getItem(MIRROR_KEY);
      if (mr) { const mp = JSON.parse(mr); if (S.isObj(mp) && mp.version === S.CURRENT_VERSION) mirrorState = mp; }
    } catch (e) { mirrorState = null; }

    const bk = createBackup(ls, 'premigration', raw);
    if (!bk.ok) {
      const n = S.migrate(parsed, now);
      return result({ state: n.state, status: 'locked', locked: true, raw, info: { reason: 'backup-failed', error: bk.error } });
    }

    const source = mirrorState ? recoverFromMirror(parsed, mirrorState) : parsed;
    const m = S.migrate(source, now);
    if (mirrorState) {
      // the mirror was the "real" v2 history; do not restart XP from today
      m.state.xp.startDate = (mirrorState.xp && D.isDateStr(mirrorState.xp.startDate)) ? mirrorState.xp.startDate : m.state.xp.startDate;
    }
    const saved = save(ls, m.state, { locked: false });
    if (!saved.ok) {
      return result({ state: m.state, status: 'locked', locked: true, raw, info: { reason: 'save-failed', error: saved.error, backupKey: bk.key } });
    }
    // verify what we wrote parses and keeps the day count
    try {
      const check = JSON.parse(ls.getItem(KEY));
      if (check.version !== S.CURRENT_VERSION || Object.keys(check.days || {}).length !== Object.keys(m.state.days).length) throw new Error('verify');
    } catch (e) {
      try { ls.setItem(KEY, raw); } catch (x) { /* ignore */ }
      return result({ state: m.state, status: 'locked', locked: true, raw, info: { reason: 'verify-failed', backupKey: bk.key } });
    }
    return result({
      state: m.state, status: mirrorState ? 'recovered' : 'migrated', raw,
      info: { backupKey: bk.key, fromVersion: m.fromVersion, dropped: m.report.dropped },
    });
  }

  /* ---------------- saving ---------------- */

  /**
   * Serialise, round-trip check, write main key, refresh mirror.
   * Never throws. { ok, error? , mirrorOk? }
   */
  function save(ls, state, opts) {
    if (opts && opts.locked) return { ok: false, error: 'locked' };
    let text;
    try {
      text = JSON.stringify(state);
      if (typeof text !== 'string') throw new Error('not serialisable');
      JSON.parse(text); // round-trip: refuse to store something we could not read back
    } catch (e) {
      return { ok: false, error: 'serialize' };
    }
    try {
      ls.setItem(KEY, text);
    } catch (e) {
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      return { ok: false, error: quota ? 'quota' : 'write' };
    }
    let mirrorOk = false;
    if (text.length <= MIRROR_MAX_CHARS) {
      try { ls.setItem(MIRROR_KEY, text); mirrorOk = true; } catch (e) { mirrorOk = false; }
    } else {
      try { ls.removeItem(MIRROR_KEY); } catch (e) { /* ignore */ }
    }
    return { ok: true, mirrorOk };
  }

  /* ---------------- export ---------------- */

  function exportText(state) {
    const payload = Object.assign({}, state);
    payload._meta = Object.assign({}, state._meta, { exportedAt: new Date().toISOString(), app: 'prime-life-maxing' });
    return JSON.stringify(payload, null, 2);
  }

  /* ---------------- import (validate → summarise → caller confirms → apply) ---------------- */

  function countThings(state) {
    const days = Object.keys(state.days || {});
    let tasks = 0;
    for (const k of days) tasks += (state.days[k].tasks || []).length;
    return {
      days: days.length,
      tasks,
      goals: (state.goals || []).length,
      templates: (state.templates || []).length,
      workouts: ((state.workouts || {}).sessions || []).length,
      habits: (state.habits || []).length,
      transactions: ((state.finance || {}).transactions || []).length,
    };
  }

  /**
   * Validate text from an import file. Never touches storage.
   * { ok:false, error } or { ok:true, state, summary, report, fromVersion, unknownKeys }
   */
  function parseImport(text, now) {
    if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'Plik jest pusty.' };
    if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: 'Plik jest za duży (limit 8 MB).' };
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'To nie jest poprawny plik JSON.' }; }
    if (!S.isObj(parsed)) return { ok: false, error: 'Nieprawidłowa struktura pliku (oczekiwano obiektu).' };

    const hasKnown = ['days', 'settings', 'goals', 'templates'].some(k => k in parsed);
    if (!hasKnown) return { ok: false, error: 'Plik nie wygląda na eksport Prime (brak dni, ustawień i celów).' };
    if ('days' in parsed && !S.isObj(parsed.days)) return { ok: false, error: '„days” musi być obiektem.' };
    for (const k of ['templates', 'goals', 'habits']) {
      if (k in parsed && !Array.isArray(parsed[k])) return { ok: false, error: `„${k}” musi być listą.` };
    }
    if ('settings' in parsed && !S.isObj(parsed.settings)) return { ok: false, error: '„settings” musi być obiektem.' };
    const ver = typeof parsed.version === 'number' ? parsed.version : 1;
    if (ver > S.CURRENT_VERSION) return { ok: false, error: `Plik pochodzi z nowszej wersji aplikacji (v${ver}).` };

    const m = S.migrate(parsed, now);
    const known = new Set(Object.keys(S.defaultState(now)));
    const unknownKeys = Object.keys(m.state).filter(k => !known.has(k));
    return { ok: true, state: m.state, summary: countThings(m.state), report: m.report, fromVersion: m.fromVersion, unknownKeys };
  }

  /**
   * Replace current data with an already-validated imported state.
   * Takes a verified raw backup of the CURRENT data first; aborts if it fails.
   */
  function applyImport(ls, currentRawOrNull, importedState) {
    const raw = currentRawOrNull !== null && currentRawOrNull !== undefined ? currentRawOrNull : (function () { try { return ls.getItem(KEY); } catch (e) { return null; } })();
    if (raw) {
      const bk = createBackup(ls, 'import', raw);
      if (!bk.ok) return { ok: false, error: 'backup', detail: bk.error };
    }
    const r = save(ls, importedState, { locked: false });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  /** Reset = new empty state, preceded by a verified backup of the old one. */
  function resetAll(ls, now) {
    let raw = null;
    try { raw = ls.getItem(KEY); } catch (e) { /* ignore */ }
    if (raw) {
      const bk = createBackup(ls, 'reset', raw);
      if (!bk.ok) return { ok: false, error: 'backup', detail: bk.error };
    }
    const fresh = S.defaultState(now);
    const r = save(ls, fresh, { locked: false });
    return r.ok ? { ok: true, state: fresh } : { ok: false, error: r.error };
  }

  /** User chose to start over from a corrupt value: corrupt raw is saved first (or we refuse). */
  function startFreshAfterCorrupt(ls, raw, now) {
    if (raw) {
      const bk = createBackup(ls, 'corrupt', raw);
      if (!bk.ok) return { ok: false, error: 'backup', detail: bk.error };
    }
    const fresh = S.defaultState(now);
    const r = save(ls, fresh, { locked: false });
    return r.ok ? { ok: true, state: fresh } : { ok: false, error: r.error };
  }

  function usage(ls) {
    let chars = 0;
    try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); chars += k.length + (ls.getItem(k) || '').length; } } catch (e) { /* ignore */ }
    return chars;
  }

  return {
    KEY, MIRROR_KEY, MAX_IMPORT_CHARS,
    load, save, exportText, parseImport, applyImport, resetAll, startFreshAfterCorrupt,
    createBackup, listBackups, readBackup, deleteBackup, recoverFromMirror, countThings, usage,
  };
});
