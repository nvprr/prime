/* PRIME LIFE MAXING — life.js: "Życie" tab = clean list of modules with a one-line status. */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);

  function rows() {
    const M = Prime.mods, ds = Prime.today(), st = Prime.state, out = [];
    const add = (mod, icon, title, sub, fn) => { if (Prime.modEnabled(mod)) out.push({ icon, title, sub, fn }); };
    add('training', 'dumbbell', 'Trening', `Dziś: ${M.workouts.dayStatus(ds).label} · ${M.workouts.weekCount(D.weekDates(ds))}/${st.settings.weeklyWorkouts} w tym tygodniu`, () => M.workouts.openPanel());
    const hs = M.habits.dayStatus(ds);
    add('habits', 'repeat', 'Nawyki', hs.total ? `Dziś ${hs.done}/${hs.total}` : (st.habits.length ? 'Nic na dziś' : 'Dodaj pierwszy nawyk'), () => M.habits.openManager());
    add('care', 'sparkle', 'Pielęgnacja', (() => { const c = M.habits.careStatus(ds); return c.total ? `Dziś ${c.done}/${c.total}` : 'Skonfiguruj rutynę'; })(), () => M.habits.openCareEditor());
    add('growth', 'bulb', 'Rozwój', st.growth.projects.length ? `Sesje w tygodniu: ${M.growth.weekStats(D.weekDates(ds)).sessions}` : 'Dodaj projekt', () => M.growth.openPanel());
    add('finance', 'wallet', 'Finanse', M.finance.hasData() ? `Dostępne: ${M.finance.money(M.finance.balance())}` : 'Dodaj pierwszą transakcję', () => M.finance.openPanel());
    add('social', 'users', 'Relacje', (() => { const n = M.social.dueOn(ds).length; return n ? `${n} do odhaczenia` : 'Nic na dziś'; })(), () => M.social.openPanel());
    add('photos', 'camera', 'Zdjęcia', 'Tylko na tym urządzeniu', () => M.photos.openPanel());
    add('xp', 'trophy', 'Poziom i odznaki', M.xp.miniText(), () => M.xp.openPanel());
    return out;
  }

  function render() {
    const list = $('lifeList'); ui.clear(list);
    const r = rows();
    $('lifeEmpty').hidden = r.length > 0;
    r.forEach(x => list.appendChild(h('li', null, h('button.life-row', { type: 'button', onClick: x.fn },
      ui.icon(x.icon), h('span.life-text', null, h('span.life-title', { text: x.title }), h('span.life-sub', { text: x.sub })), ui.icon('chevron-right')))));
  }

  Prime.mods.life = { render };
})();
