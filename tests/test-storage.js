'use strict';
const assert = require('assert');
const D = require('../js/dates.js');
const S = require('../js/schema.js');
const ST = require('../js/storage.js');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ', name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL', name, '\n       ', e.message.split('\n')[0]); }
}

/* fake localStorage with optional quota */
function makeLS(opts = {}) {
  const m = new Map();
  const ls = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (opts.failAll) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      if (opts.failKeyPrefix && k.startsWith(opts.failKeyPrefix)) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      if (opts.quotaChars !== undefined) {
        let total = 0; for (const [kk, vv] of m) if (kk !== k) total += kk.length + vv.length;
        if (total + k.length + String(v).length > opts.quotaChars) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }
      }
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    _map: m,
  };
  return ls;
}

/* a realistic v1 dataset, built like the v1 app wrote it */
function makeV1(nDays = 60) {
  const days = {};
  const base = '2026-08-01';
  for (let i = 0; i < nDays; i++) {
    const ds = D.addDays(base, i);
    const tasks = [];
    for (let t = 0; t < 4; t++) {
      tasks.push({ id: `t${i}_${t}`, name: `Zadanie ${t} <b>x</b>`, time: t === 0 ? '07:30' : null, category: ['trening', 'praca', null, 'rozwoj'][t], done: (i + t) % 2 === 0, priority: t === 0 });
    }
    days[ds] = { tasks, water: 250 * (i % 12), protein: 20 * (i % 9), calories: 1500 + i * 5, sleep: i % 5 === 0 ? null : 6 + (i % 4) * 0.5, weight: i % 3 === 0 ? 80 - i * 0.05 : null, steps: i % 4 === 0 ? 8000 + i : null, note: i % 7 === 0 ? 'notatka ąęść' : '' };
  }
  return {
    version: 1,
    settings: { waterGoal: 3.5, calGoal: 2400, proteinGoal: 160, streakThreshold: 70, units: 'metric', accent: 'blue' },
    days,
    templates: [{ id: 'tp1', name: 'Dzień siłowni', tasks: [{ name: 'Trening', category: 'trening' }, { name: 'Białko', category: null }] }],
    goals: [{ id: 'g1', name: 'Forma', desc: 'kg', current: 80, target: 75, unit: 'kg', deadline: '2026-12-31' }, { id: 'g2', name: 'Oszczędności', desc: '', current: 1200, target: 5000, unit: 'zł', deadline: null }],
  };
}

const V1_DAY_FIELDS = ['tasks', 'water', 'protein', 'calories', 'sleep', 'weight', 'steps', 'note'];
function assertV1PreservedIn(v1, v2) {
  for (const k of Object.keys(v1.settings)) assert.deepStrictEqual(v2.settings[k], v1.settings[k], `settings.${k}`);
  assert.deepStrictEqual(Object.keys(v2.days).sort(), Object.keys(v1.days).sort(), 'day keys');
  for (const ds of Object.keys(v1.days)) {
    for (const f of V1_DAY_FIELDS) assert.deepStrictEqual(v2.days[ds][f], v1.days[ds][f], `days[${ds}].${f}`);
  }
  assert.strictEqual(v2.templates.length, v1.templates.length);
  v1.templates.forEach((t, i) => { assert.strictEqual(v2.templates[i].id, t.id); assert.strictEqual(v2.templates[i].name, t.name); assert.deepStrictEqual(v2.templates[i].tasks, t.tasks); });
  assert.strictEqual(v2.goals.length, v1.goals.length);
  v1.goals.forEach((g, i) => { for (const f of Object.keys(g)) assert.deepStrictEqual(v2.goals[i][f], g[f], `goal.${f}`); });
}

console.log('\n== Migracja v1 -> v2 ==');

test('pusty storage: domyślny stan, status empty, NIC nie zapisane', () => {
  const ls = makeLS();
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'empty');
  assert.strictEqual(r.locked, false);
  assert.strictEqual(r.state.version, 2);
  assert.strictEqual(ls._map.size, 0, 'odczyt nie może nic zapisywać');
});

test('prawidłowe stare dane (60 dni): wszystkie pola v1 identyczne po migracji', () => {
  const v1 = makeV1(60);
  const raw = JSON.stringify(v1);
  const ls = makeLS(); ls.setItem(ST.KEY, raw);
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'migrated');
  assert.strictEqual(r.state.version, 2);
  assertV1PreservedIn(v1, r.state);
  // persisted copy equals in-memory state
  const stored = JSON.parse(ls.getItem(ST.KEY));
  assert.strictEqual(stored.version, 2);
  assertV1PreservedIn(v1, stored);
});

test('kopia surowego JSON sprzed migracji jest bajt w bajt identyczna', () => {
  const raw = JSON.stringify(makeV1(10));
  const ls = makeLS(); ls.setItem(ST.KEY, raw);
  const r = ST.load(ls);
  const bks = ST.listBackups(ls);
  assert.strictEqual(bks.length, 1);
  assert.strictEqual(bks[0].reason, 'premigration');
  assert.strictEqual(ST.readBackup(ls, bks[0].key), raw);
  assert.strictEqual(r.info.backupKey, bks[0].key);
});

test('migracja jest idempotentna: drugi load = status ok, bez nowych kopii, te same dane', () => {
  const v1 = makeV1(20);
  const ls = makeLS(); ls.setItem(ST.KEY, JSON.stringify(v1));
  const a = ST.load(ls);
  const textAfterFirst = ls.getItem(ST.KEY);
  const b = ST.load(ls);
  assert.strictEqual(b.status, 'ok');
  assert.strictEqual(ST.listBackups(ls).length, 1);
  assert.strictEqual(ls.getItem(ST.KEY), textAfterFirst, 'odczyt v2 nie zmienia zapisu');
  assertV1PreservedIn(v1, b.state);
});

test('brakujące pola opcjonalne (stare dni bez note/priority) -> uzupełnione, reszta nietknięta', () => {
  const v1 = { version: 1, settings: {}, days: { '2026-09-01': { tasks: [{ id: 'a', name: 'X', done: true }], water: 500 } }, templates: [], goals: [] };
  const ls = makeLS(); ls.setItem(ST.KEY, JSON.stringify(v1));
  const r = ST.load(ls);
  const d = r.state.days['2026-09-01'];
  assert.strictEqual(d.note, ''); assert.strictEqual(d.sleep, null); assert.strictEqual(d.water, 500);
  assert.strictEqual(d.tasks[0].done, true); assert.strictEqual(d.tasks[0].priority, false); assert.strictEqual(d.tasks[0].time, null);
  assert.strictEqual(r.state.settings.waterGoal, 3.0);
});

test('stare ustawienia: zachowane wartości użytkownika (np. accent=blue nie jest nadpisany)', () => {
  const v1 = makeV1(3);
  const ls = makeLS(); ls.setItem(ST.KEY, JSON.stringify(v1));
  const r = ST.load(ls);
  assert.strictEqual(r.state.settings.accent, 'blue');
  assert.strictEqual(r.state.settings.streakThreshold, 70);
});

test('nieznane klucze (top-level, w ustawieniach, w dniu, w zadaniu, w celu) są zachowane', () => {
  const v1 = makeV1(3);
  v1.futureModule = { a: [1, 2, 3] };
  v1.settings.mojaOpcja = 'x';
  const first = Object.keys(v1.days)[0];
  v1.days[first].customDayField = 42;
  v1.days[first].tasks[0].customTaskField = 'z';
  v1.goals[0].customGoalField = true;
  const ls = makeLS(); ls.setItem(ST.KEY, JSON.stringify(v1));
  const r = ST.load(ls);
  assert.deepStrictEqual(r.state.futureModule, { a: [1, 2, 3] });
  assert.strictEqual(r.state.settings.mojaOpcja, 'x');
  assert.strictEqual(r.state.days[first].customDayField, 42);
  assert.strictEqual(r.state.days[first].tasks[0].customTaskField, 'z');
  assert.strictEqual(r.state.goals[0].customGoalField, true);
  // and a v2 -> save -> load round trip keeps them as well
  ST.save(ls, r.state, {});
  const r2 = ST.load(ls);
  assert.deepStrictEqual(r2.state.futureModule, { a: [1, 2, 3] });
});

test('uszkodzony JSON: stan zablokowany, surowy tekst NIENARUSZONY w storage, brak zapisu', () => {
  const bad = '{"version":1,"days":{"2026-09-01":{"tasks":[';
  const ls = makeLS(); ls.setItem(ST.KEY, bad);
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'corrupt');
  assert.strictEqual(r.locked, true);
  assert.strictEqual(r.raw, bad);
  assert.strictEqual(ls.getItem(ST.KEY), bad, 'klucz główny nie może być nadpisany');
  assert.deepStrictEqual(ST.save(ls, r.state, { locked: r.locked }), { ok: false, error: 'locked' });
  assert.strictEqual(ls.getItem(ST.KEY), bad);
});

test('uszkodzony JSON: świadomy start od zera najpierw zapisuje kopię uszkodzonych danych', () => {
  const bad = '{oops';
  const ls = makeLS(); ls.setItem(ST.KEY, bad);
  const r = ST.load(ls);
  const f = ST.startFreshAfterCorrupt(ls, r.raw);
  assert.strictEqual(f.ok, true);
  const bk = ST.listBackups(ls).filter(b => b.reason === 'corrupt');
  assert.ok(bk.length >= 1);
  assert.strictEqual(ST.readBackup(ls, bk[bk.length - 1].key), bad);
});

test('JSON poprawny, ale nie obiekt (np. tablica): traktowany jak uszkodzony, nie kasowany', () => {
  const ls = makeLS(); ls.setItem(ST.KEY, '[1,2,3]');
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'corrupt'); assert.strictEqual(ls.getItem(ST.KEY), '[1,2,3]');
});

test('brak miejsca na kopię: migracja NIE jest wykonywana, dane v1 nietknięte, tryb locked', () => {
  const raw = JSON.stringify(makeV1(30));
  const ls = makeLS({ failKeyPrefix: 'prime_bk_' }); ls.setItem(ST.KEY, raw);
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'locked');
  assert.strictEqual(r.info.reason, 'backup-failed');
  assert.strictEqual(ls.getItem(ST.KEY), raw, 'dane v1 muszą zostać bez zmian');
});

test('brak miejsca na zapis zmigrowanych danych: status locked, oryginał zachowany (kopia + klucz)', () => {
  const v1 = makeV1(30); const raw = JSON.stringify(v1);
  // quota big enough for raw + backup, too small for the (larger) v2 + mirror
  const ls = makeLS({ quotaChars: raw.length * 2 + 400 });
  ls.setItem(ST.KEY, raw);
  const r = ST.load(ls);
  if (r.status === 'locked') {
    assert.ok(['save-failed', 'verify-failed'].includes(r.info.reason));
    const k = ls.getItem(ST.KEY);
    assert.ok(k === raw || JSON.parse(k).version === 2, 'albo oryginał, albo poprawne v2 – nigdy uszkodzone');
  } else {
    assert.ok(['migrated'].includes(r.status)); // quota happened to suffice
  }
  const bks = ST.listBackups(ls);
  assert.ok(bks.some(b => b.reason === 'premigration'));
});

test('nowsza wersja danych (v3): locked, nic nie jest zapisywane ani obcinane', () => {
  const raw = JSON.stringify({ version: 3, days: {}, x: 1 });
  const ls = makeLS(); ls.setItem(ST.KEY, raw);
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'locked'); assert.strictEqual(r.info.reason, 'newer-version');
  assert.strictEqual(ls.getItem(ST.KEY), raw);
});

console.log('\n== Zapis ==');

test('save: błąd quota zwraca ok:false/quota i nie rzuca wyjątku', () => {
  const ls = makeLS({ failAll: true });
  const res = ST.save(ls, S.defaultState(), {});
  assert.deepStrictEqual([res.ok, res.error], [false, 'quota']);
});

test('save: stan, którego nie da się zserializować (cykl), jest odrzucony bez zapisu', () => {
  const ls = makeLS(); const st = S.defaultState(); st.self = st;
  const res = ST.save(ls, st, {});
  assert.deepStrictEqual([res.ok, res.error], [false, 'serialize']);
  assert.strictEqual(ls._map.size, 0);
});

test('save + load: pełny round trip modułów v2', () => {
  const ls = makeLS(); const st = S.defaultState();
  st.habits.push({ id: 'h1', name: 'Czytanie', freq: 'weekly', target: 4 });
  st.workouts.sessions.push({ id: 's1', date: '2026-10-27', name: 'Push', status: 'done', entries: [{ id: 'e1', exerciseId: 'x', sets: [{ id: 'a', reps: 8, weight: 60, done: true }] }] });
  st.finance.transactions.push({ id: 't1', date: '2026-10-27', amount: 12.345, type: 'out' });
  ST.save(ls, st, {});
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.state.habits[0].name, 'Czytanie');
  assert.strictEqual(r.state.workouts.sessions[0].entries[0].sets[0].weight, 60);
  assert.strictEqual(r.state.finance.transactions[0].amount, 12.35);
});

console.log('\n== Wycofanie wersji (rollback) ==');

test('stary kod zapisał v1 nad v2: nowe moduły wracają z lustra, dane v1 (nowsze) wygrywają', () => {
  // v2 session
  const ls = makeLS();
  const v1 = makeV1(10);
  ls.setItem(ST.KEY, JSON.stringify(v1));
  const first = ST.load(ls).state;
  first.habits.push({ id: 'h1', name: 'Pielęgnacja', freq: 'daily' });
  const d0 = Object.keys(first.days)[0];
  first.days[d0].meals = [{ id: 'm1', name: 'Obiad', kcal: 700, protein: 40 }];
  first.xp.startDate = '2026-10-26';
  ST.save(ls, first, {});
  // OLD build loads, drops unknown keys, edits and saves back as version 1
  const old = JSON.parse(ls.getItem(ST.KEY));
  const oldV1 = { version: 1, settings: { waterGoal: 4, calGoal: old.settings.calGoal, proteinGoal: old.settings.proteinGoal, streakThreshold: old.settings.streakThreshold, units: 'metric', accent: 'blue' }, days: {}, templates: old.templates, goals: old.goals };
  for (const [k, v] of Object.entries(old.days)) oldV1.days[k] = Object.assign({}, v); // old code keeps unknown day keys, too
  delete oldV1.days[d0].meals; // pessimistic: even per-day extras lost
  oldV1.days[d0].water = 9999; // edit done in the old build
  ls.setItem(ST.KEY, JSON.stringify(oldV1));
  const r = ST.load(ls);
  assert.strictEqual(r.status, 'recovered');
  assert.strictEqual(r.state.habits[0].name, 'Pielęgnacja', 'moduł z lustra odzyskany');
  assert.strictEqual(r.state.days[d0].meals[0].name, 'Obiad', 'pole dnia z lustra odzyskane');
  assert.strictEqual(r.state.days[d0].water, 9999, 'edycja ze starego kodu wygrywa');
  assert.strictEqual(r.state.settings.waterGoal, 4);
  assert.strictEqual(r.state.xp.startDate, '2026-10-26', 'XP nie startuje od nowa');
  assert.ok(ST.listBackups(ls).some(b => b.reason === 'premigration'), 'kopia stanu sprzed odzysku istnieje');
});

console.log('\n== Import ==');

test('import: poprawny eksport v2 -> podsumowanie i stan', () => {
  const st = S.defaultState(); st.goals.push({ id: 'g', name: 'A', current: 1, target: 2 });
  const text = ST.exportText(st);
  const res = ST.parseImport(text);
  assert.strictEqual(res.ok, true); assert.strictEqual(res.summary.goals, 1);
});

test('import: stary eksport v1 jest przyjęty i zmigrowany', () => {
  const v1 = makeV1(15);
  const res = ST.parseImport(JSON.stringify(v1, null, 2));
  assert.strictEqual(res.ok, true); assert.strictEqual(res.fromVersion, 1); assert.strictEqual(res.state.version, 2);
  assertV1PreservedIn(v1, res.state);
});

test('import: odrzuca nie-JSON, tablicę, pusty plik, zbyt duży plik, nowszą wersję, brak znanych struktur', () => {
  for (const bad of ['', '   ', 'abc', '[1,2]', '"x"', 'null', '{}', '{"foo":1}', '{"days":[]}', '{"days":{},"goals":"x"}', '{"version":9,"days":{}}', '{"days":{},"settings":[]}']) {
    assert.strictEqual(ST.parseImport(bad).ok, false, `powinno odrzucić: ${bad}`);
  }
  assert.strictEqual(ST.parseImport('x'.repeat(ST.MAX_IMPORT_CHARS + 1)).ok, false);
});

test('import: złośliwe/uszkodzone elementy są odfiltrowane, aplikacja dostaje bezpieczne dane', () => {
  const evil = {
    version: 1,
    days: {
      '2026-09-01': { tasks: [null, 5, 'x', { id: '"><img src=x onerror=alert(1)>', name: '<script>alert(1)</script>', time: '"><b>', category: 3, done: 'yes' }], water: 'abc', protein: -5, calories: 1e99, sleep: 'x', weight: 99999 },
      'nie-data': { tasks: [] },
      '2026-13-45': {},
    },
    templates: [null, { name: 'bez zadań' }, 5],
    goals: [{ name: 'g', current: 'zzz', target: null, deadline: 'jutro' }, 7],
    settings: { waterGoal: 'dużo', accent: 123, units: 'banana' },
  };
  const res = ST.parseImport(JSON.stringify(evil));
  assert.strictEqual(res.ok, true);
  const s = res.state;
  assert.deepStrictEqual(Object.keys(s.days), ['2026-09-01']);
  const d = s.days['2026-09-01'];
  assert.strictEqual(d.tasks.length, 1);
  assert.strictEqual(d.tasks[0].time, null);
  assert.strictEqual(d.tasks[0].done, true);
  assert.strictEqual(typeof d.tasks[0].id, 'string');
  assert.strictEqual(d.water, 0); assert.strictEqual(d.protein, 0);
  assert.ok(d.calories <= 100000); assert.strictEqual(d.sleep, null);
  assert.ok(d.weight <= 1000);
  assert.strictEqual(s.templates.length, 1); assert.deepStrictEqual(s.templates[0].tasks, []);
  assert.strictEqual(s.goals.length, 1); assert.strictEqual(s.goals[0].current, 0); assert.strictEqual(s.goals[0].deadline, null);
  assert.strictEqual(s.settings.waterGoal, 3); assert.strictEqual(s.settings.units, 'metric');
  assert.ok(res.report.dropped.badDayKeys >= 2);
});

test('import: applyImport najpierw robi kopię bieżących danych; brak miejsca = przerwanie bez zmian', () => {
  const cur = JSON.stringify(makeV1(5));
  const ls = makeLS(); ls.setItem(ST.KEY, cur);
  const imp = ST.parseImport(JSON.stringify(makeV1(2))).state;
  const r = ST.applyImport(ls, cur, imp);
  assert.strictEqual(r.ok, true);
  const bk = ST.listBackups(ls).filter(b => b.reason === 'import');
  assert.strictEqual(ST.readBackup(ls, bk[0].key), cur);
  assert.strictEqual(Object.keys(JSON.parse(ls.getItem(ST.KEY)).days).length, 2);

  const ls2 = makeLS({ failKeyPrefix: 'prime_bk_' }); ls2.setItem(ST.KEY, cur);
  const r2 = ST.applyImport(ls2, cur, imp);
  assert.strictEqual(r2.ok, false); assert.strictEqual(ls2.getItem(ST.KEY), cur);
});

test('export -> reset -> import: dane identyczne (round trip)', () => {
  const v1 = makeV1(25);
  const ls = makeLS(); ls.setItem(ST.KEY, JSON.stringify(v1));
  const st = ST.load(ls).state;
  const exported = ST.exportText(st);
  const rr = ST.resetAll(ls);
  assert.strictEqual(rr.ok, true);
  assert.strictEqual(Object.keys(JSON.parse(ls.getItem(ST.KEY)).days).length, 0);
  const imp = ST.parseImport(exported);
  assert.strictEqual(imp.ok, true);
  ST.applyImport(ls, null, imp.state);
  const back = ST.load(ls).state;
  assertV1PreservedIn(v1, back);
});

test('reset: tworzy kopię stanu sprzed resetu', () => {
  const raw = JSON.stringify(makeV1(4));
  const ls = makeLS(); ls.setItem(ST.KEY, raw);
  ST.resetAll(ls);
  const bk = ST.listBackups(ls).filter(b => b.reason === 'reset');
  assert.strictEqual(ST.readBackup(ls, bk[0].key), raw);
});

console.log('\n== Daty / sen ==');

test('sleepHours: przez północ, nieprawidłowe dane -> null', () => {
  assert.strictEqual(D.sleepHours('23:30', '07:00'), 7.5);
  assert.strictEqual(D.sleepHours('01:00', '08:30'), 7.5);
  assert.strictEqual(D.sleepHours('', '07:00'), null);
  assert.strictEqual(D.sleepHours('25:00', '07:00'), null);
  assert.strictEqual(D.sleepHours('07:00', '07:10'), null); // 10 min -> implausible
});

test('daty: weekStart (poniedziałek), diffDays odporne na zmianę czasu, isDateStr', () => {
  assert.strictEqual(D.weekStart('2026-10-25'), '2026-10-19'); // niedziela -> poprzedni poniedziałek
  assert.strictEqual(D.weekStart('2026-10-26'), '2026-10-26');
  assert.strictEqual(D.diffDays('2026-10-25', '2026-12-31'), 67);
  assert.strictEqual(D.diffDays('2026-03-28', '2026-03-30'), 2);
  assert.ok(D.isDateStr('2026-02-28')); assert.ok(!D.isDateStr('2026-02-30')); assert.ok(!D.isDateStr('2026-2-3'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:', failures.join(' | ')); process.exit(1); }
