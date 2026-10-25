/* ============================================================
   PRIME LIFE MAXING — social.js
   Optional, private: plan contact with someone close, note events,
   set small social challenges, write a short reflection afterwards.
   No contacts access, no scoring of people, no rankings. Everything
   is deletable (per item or the whole module).
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  const TYPES = [{ value: 'contact', label: 'Kontakt' }, { value: 'event', label: 'Wydarzenie' }, { value: 'challenge', label: 'Wyzwanie' }];
  const IDEAS = ['Zadzwoń do kogoś bliskiego', 'Napisz do znajomego, z którym dawno nie rozmawiałeś', 'Zaproponuj wspólne wyjście', 'Przywitaj się z nową osobą', 'Powiedz komuś szczery komplement'];
  const items = () => Prime.state.social.items;

  function typeLabel(t) { return TYPES.find(x => x.value === t).label; }

  function openItemSheet(item, preType) {
    const d = item ? { type: item.type, title: item.title, date: item.date, note: item.note, reflection: item.reflection, done: item.done } : { type: preType || 'contact', title: '', date: Prime.today(), note: '', reflection: '', done: false };
    const type = ui.select(TYPES, d.type);
    const title = ui.input({ value: d.title, placeholder: 'np. Rozmowa z bratem', maxlength: '120' });
    const date = ui.input({ type: 'date', value: d.date || '' });
    const note = ui.input({ value: d.note, placeholder: 'Notatka (opcjonalnie)', maxlength: '500' });
    const refl = h('textarea.modal-input', { rows: '3', maxlength: '1000', placeholder: 'Refleksja po wydarzeniu (opcjonalnie)', value: d.reflection });
    const done = h('input', { type: 'checkbox', checked: d.done });
    const ideas = h('div.chip-row.wrap', null, IDEAS.map(t => h('button.chip', { type: 'button', text: t, onClick: () => { title.value = t; type.value = 'challenge'; } })));
    const body = h('div', null, ui.field('Rodzaj', type), ui.field('Tytuł', title), ui.field('Data', date), ui.field('Notatka', note),
      h('label.check-row', null, done, h('span', { text: 'Zrobione' })), ui.field('Refleksja', refl), item ? null : h('div', null, h('div.hint', { text: 'Pomysły na małe wyzwania:' }), ideas));
    const actions = [];
    if (item) actions.push({ label: 'Usuń', kind: 'ghost', keepOpen: true, onClick: async () => {
      ui.closeModals();
      const ok = await ui.confirm({ title: 'Usunąć wpis?', text: 'Wpis zostanie trwale usunięty.', okLabel: 'Usuń' });
      if (!ok) return;
      Prime.state.social.items = items().filter(x => x.id !== item.id); Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    actions.push({ label: 'Anuluj', kind: 'ghost' });
    actions.push({ label: 'Zapisz', kind: 'primary', onClick: () => {
      const t = title.value.trim(); if (!t) { ui.toast('Podaj tytuł'); return false; }
      const vals = { type: type.value, title: t, date: D.isDateStr(date.value) ? date.value : null, note: note.value.trim(), reflection: refl.value.trim(), done: done.checked };
      if (item) Object.assign(item, vals); else items().push(Object.assign({ id: Prime.uid(), createdAt: Prime.today() }, vals));
      Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    ui.sheet({ title: item ? 'Edytuj wpis' : 'Nowy wpis', body, actions });
  }

  /** Items due today or overdue and not done — shown as a gentle hint. */
  function dueOn(ds) { return items().filter(i => !i.done && i.date && i.date <= ds && i.date >= D.addDays(ds, -7)); }
  function plannedOn(ds) { return items().filter(i => i.date === ds); }
  function doneCount(dates) { const s = new Set(dates); return items().filter(i => i.done && i.date && s.has(i.date)).length; }

  function openPanel() {
    let filter = 'all';
    ui.openPanel({
      id: 'social', title: 'Relacje i pewność siebie',
      actions: [h('button.icon-btn.accent', { type: 'button', 'aria-label': 'Nowy wpis', onClick: () => openItemSheet(null) }, ui.icon('plus'))],
      render(body, api) {
        body.appendChild(h('p.hint', { text: 'Prywatne i opcjonalne. Dane zostają na tym urządzeniu. Bez ocen i rankingów — tylko małe kroki.' }));
        body.appendChild(ui.seg([{ value: 'all', label: 'Wszystko' }].concat(TYPES), filter, (v) => { filter = v; api.rerender(); }));
        const list = items().filter(i => filter === 'all' || i.type === filter)
          .sort((a, b) => (a.done - b.done) || String(a.date || '9999').localeCompare(String(b.date || '9999')));
        if (!list.length) body.appendChild(ui.emptyState('Brak wpisów.', 'Zaplanuj kontakt, zapisz wydarzenie albo ustaw małe wyzwanie.'));
        list.forEach(i => body.appendChild(ui.checkRow(i.done, i.title, `${typeLabel(i.type)}${i.date ? ' · ' + D.shortLabel(i.date) : ''}${i.reflection ? ' · jest refleksja' : ''}`, () => { i.done = !i.done; Prime.save(); Prime.refresh(); api.rerender(); },
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Edytuj wpis', onClick: () => openItemSheet(i) }, ui.icon('edit')))));
        if (items().length) body.appendChild(h('button.btn.ghost.block', { type: 'button', text: 'Usuń wszystkie dane tego modułu', onClick: async () => {
          const ok = await ui.confirm({ title: 'Usunąć dane modułu?', text: `Zostanie usuniętych ${items().length} wpisów (kontakty, wydarzenia, wyzwania, refleksje). Nie można tego cofnąć.`, okLabel: 'Usuń wszystko' });
          if (!ok) return;
          Prime.state.social.items = []; Prime.save(); Prime.refresh(); api.rerender();
        } }));
      },
    });
  }

  Prime.mods.social = { openPanel, openItemSheet, dueOn, plannedOn, doneCount };
})();
