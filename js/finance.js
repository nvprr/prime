/* ============================================================
   PRIME LIFE MAXING — finance.js
   Local-only money tracker. No bank connection, no network.

   Transaction types
     in   income        — raises income
     out  expense       — raises expenses
     save transfer to savings/investments — moves money to "own pot":
          NOT income, NOT an expense, so it can never inflate either.
   Balance (available) = initial + income − expenses − saved.
   All sums are done in integer grosze to avoid float drift.
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;

  const BUILTIN_CATS = [
    { id: 'c_salary', name: 'Wynagrodzenie', kind: 'in' },
    { id: 'c_other_in', name: 'Inne wpływy', kind: 'in' },
    { id: 'c_food', name: 'Jedzenie', kind: 'out' },
    { id: 'c_transport', name: 'Transport', kind: 'out' },
    { id: 'c_fun', name: 'Rozrywka', kind: 'out' },
    { id: 'c_shop', name: 'Zakupy', kind: 'out' },
    { id: 'c_bills', name: 'Rachunki', kind: 'out' },
    { id: 'c_other_out', name: 'Inne wydatki', kind: 'out' },
    { id: 'c_save', name: 'Oszczędności', kind: 'save' },
    { id: 'c_invest', name: 'Inwestycje', kind: 'save' },
  ];
  const TYPE_OPTS = [{ value: 'out', label: 'Wydatek' }, { value: 'in', label: 'Wpływ' }, { value: 'save', label: 'Odłożone' }];
  const F = () => Prime.state.finance;

  const cents = (x) => Math.round((Number(x) || 0) * 100);
  function money(x) { return (Math.round(x * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'; }
  const allCats = () => BUILTIN_CATS.concat(F().categories.map(c => ({ id: c.id, name: c.name, kind: c.kind, custom: true })));
  const catsFor = (type) => allCats().filter(c => c.kind === type);
  const catName = (id) => { const c = allCats().find(x => x.id === id); return c ? c.name : 'Bez kategorii'; };

  /* ---------------- sums ---------------- */

  function sumTx(filter) {
    const t = { in: 0, out: 0, save: 0, count: 0 };
    F().transactions.forEach(x => { if (filter(x)) { t[x.type] += cents(x.amount); t.count++; } });
    return { in: t.in / 100, out: t.out / 100, save: t.save / 100, count: t.count };
  }
  /** Available balance up to and including `upTo` (default: everything dated ≤ today). */
  function balance(upTo) {
    const lim = upTo || Prime.today();
    const t = sumTx(x => x.date <= lim);
    return Math.round((cents(F().initialBalance) + t.in * 100 - t.out * 100 - t.save * 100)) / 100;
  }
  const savedTotal = () => sumTx(x => x.date <= Prime.today()).save;
  const goalSaved = (id) => sumTx(x => x.type === 'save' && x.goalId === id && x.date <= Prime.today()).save;
  const monthSummary = (key) => sumTx(x => x.date.slice(0, 7) === key);
  const rangeSummary = (dates) => { const s = new Set(dates); return sumTx(x => s.has(x.date)); };
  const hasData = () => F().transactions.length > 0 || F().savingsGoals.length > 0 || cents(F().initialBalance) !== 0;

  function monthSeries(count) {
    const out = [];
    let key = D.monthKey(Prime.today());
    for (let i = 0; i < count; i++) { out.unshift(key); key = D.addMonths(key, -1); }
    return out.map(k => Object.assign({ key: k }, monthSummary(k)));
  }

  function categoryBreakdown(key) {
    const m = new Map();
    F().transactions.filter(x => x.type === 'out' && x.date.slice(0, 7) === key).forEach(x => m.set(x.categoryId || '', (m.get(x.categoryId || '') || 0) + cents(x.amount)));
    return Array.from(m.entries()).map(([id, c]) => ({ id, name: id ? catName(id) : 'Bez kategorii', amount: c / 100 })).sort((a, b) => b.amount - a.amount);
  }

  /* ---------------- sheets ---------------- */

  function openTxSheet(tx, preset) {
    const base = tx || Object.assign({ type: 'out', amount: '', date: Prime.date <= Prime.today() ? Prime.date : Prime.today(), categoryId: null, goalId: null, note: '' }, preset || {});
    let type = base.type, cat = base.categoryId;
    const amount = ui.input({ type: 'number', value: base.amount === '' ? '' : String(base.amount), step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0,00', 'aria-label': 'Kwota w złotych' });
    const date = ui.input({ type: 'date', value: base.date });
    const note = ui.input({ value: base.note, placeholder: 'Notatka (opcjonalnie)', maxlength: '200' });
    const catHolder = h('div'), goalHolder = h('div');
    const goalSel = ui.select([{ value: '', label: 'Oszczędności ogólne (bez celu)' }].concat(F().savingsGoals.map(g => ({ value: g.id, label: g.name }))), base.goalId || '');
    const drawCats = () => {
      ui.clear(catHolder);
      if (!catsFor(type).some(c => c.id === cat)) cat = null;
      const chips = ui.chipsSingle(catsFor(type).map(c => ({ value: c.id, label: c.name })), cat, (v) => { cat = v; }, true);
      catHolder.appendChild(h('div.modal-label', null, 'Kategoria', chips.el));
      goalHolder.hidden = type !== 'save';
    };
    goalHolder.appendChild(ui.field('Cel oszczędnościowy', goalSel));
    const seg = ui.seg(TYPE_OPTS, type, (v) => { type = v; drawCats(); });
    drawCats();
    const actions = [];
    if (tx) actions.push({ label: 'Usuń', kind: 'ghost', keepOpen: true, onClick: async () => {
      ui.closeModals();
      const ok = await ui.confirm({ title: 'Usunąć transakcję?', text: `${money(tx.amount)} z dnia ${D.shortLabel(tx.date)}.`, okLabel: 'Usuń' });
      if (!ok) return;
      F().transactions = F().transactions.filter(x => x.id !== tx.id); Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    actions.push({ label: 'Anuluj', kind: 'ghost' });
    actions.push({ label: 'Zapisz', kind: 'primary', onClick: () => {
      const a = Math.round(Number(String(amount.value).replace(',', '.')) * 100) / 100;
      if (!(a > 0)) { ui.toast('Podaj kwotę większą od zera'); return false; }
      if (a > 1e9) { ui.toast('Kwota jest zbyt duża'); return false; }
      if (!D.isDateStr(date.value)) { ui.toast('Podaj datę'); return false; }
      const vals = { type, amount: a, date: date.value, categoryId: cat, goalId: type === 'save' && goalSel.value ? goalSel.value : null, note: note.value.trim() };
      if (tx) Object.assign(tx, vals); else F().transactions.push(Object.assign({ id: Prime.uid() }, vals));
      Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    ui.sheet({ title: tx ? 'Edytuj transakcję' : 'Nowa transakcja', body: h('div', null, seg, ui.field('Kwota (zł)', amount), ui.field('Data', date), catHolder, goalHolder, ui.field('Notatka', note)), actions });
  }

  function openGoalSheet(goal) {
    const name = ui.input({ value: goal ? goal.name : '', placeholder: 'np. Poduszka finansowa', maxlength: '80' });
    const target = ui.input({ type: 'number', value: goal ? String(goal.target) : '', step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0,00' });
    const dl = ui.input({ type: 'date', value: goal && goal.deadline ? goal.deadline : '' });
    const actions = [];
    if (goal) actions.push({ label: 'Usuń', kind: 'ghost', keepOpen: true, onClick: async () => {
      ui.closeModals();
      const ok = await ui.confirm({ title: 'Usunąć cel oszczędnościowy?', text: 'Wpłaty na ten cel zostaną jako „oszczędności ogólne” — kwoty nie znikną.', okLabel: 'Usuń' });
      if (!ok) return;
      F().savingsGoals = F().savingsGoals.filter(g => g.id !== goal.id);
      F().transactions.forEach(t => { if (t.goalId === goal.id) t.goalId = null; });
      Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    actions.push({ label: 'Anuluj', kind: 'ghost' });
    actions.push({ label: 'Zapisz', kind: 'primary', onClick: () => {
      const nm = name.value.trim(); const t = Number(String(target.value).replace(',', '.'));
      if (!nm) { ui.toast('Podaj nazwę'); return false; }
      if (!(t > 0)) { ui.toast('Podaj kwotę docelową'); return false; }
      const vals = { name: nm, target: Math.round(t * 100) / 100, deadline: D.isDateStr(dl.value) ? dl.value : null };
      if (goal) Object.assign(goal, vals); else F().savingsGoals.push(Object.assign({ id: Prime.uid() }, vals));
      Prime.save(); Prime.refresh(); ui.rerenderPanel();
    } });
    ui.sheet({ title: goal ? 'Edytuj cel oszczędnościowy' : 'Nowy cel oszczędnościowy', body: h('div', null, ui.field('Nazwa', name), ui.field('Kwota docelowa (zł)', target), ui.field('Termin (opcjonalnie)', dl)), actions });
  }

  /* ---------------- panel ---------------- */

  function openPanel(startTab) {
    const st = { tab: startTab || 'month', month: D.monthKey(Prime.today()) };
    ui.openPanel({
      id: 'finance', title: 'Finanse',
      actions: [h('button.icon-btn.accent', { type: 'button', 'aria-label': 'Nowa transakcja', onClick: () => openTxSheet(null) }, ui.icon('plus'))],
      render(body, api) {
        body.appendChild(ui.seg([{ value: 'month', label: 'Miesiąc' }, { value: 'savings', label: 'Oszczędności' }, { value: 'cats', label: 'Kategorie' }], st.tab, (v) => { st.tab = v; api.rerender(); }));
        if (st.tab === 'month') tabMonth(body, api, st);
        else if (st.tab === 'savings') tabSavings(body, api);
        else tabCats(body, api);
      },
    });
  }

  function tabMonth(body, api, st) {
    const cur = monthSummary(st.month);
    body.appendChild(h('div.month-nav', null,
      h('button.icon-btn', { type: 'button', 'aria-label': 'Poprzedni miesiąc', onClick: () => { st.month = D.addMonths(st.month, -1); api.rerender(); } }, ui.icon('chevron-left')),
      h('strong', { text: D.monthLabel(st.month) }),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Następny miesiąc', onClick: () => { st.month = D.addMonths(st.month, 1); api.rerender(); } }, ui.icon('chevron-right'))));
    body.appendChild(h('div.summary-grid', null,
      ui.statBox(money(cur.in), 'Wpływy'), ui.statBox(money(cur.out), 'Wydatki'),
      ui.statBox((cur.in - cur.out >= 0 ? '+' : '') + money(cur.in - cur.out), 'Bilans miesiąca (bez odłożonych)'), ui.statBox(money(cur.save), 'Odłożone w tym miesiącu')));
    body.appendChild(h('div.card.balance-card', null,
      h('div.li-sub', { text: 'Saldo dostępne (stan na dziś)' }), h('div.big-num', { text: money(balance()) }),
      h('div.li-sub', { text: `Saldo początkowe + wpływy − wydatki − odłożone. Odłożone razem: ${money(savedTotal())}` }),
      (function () {
        const inp = ui.input({ type: 'number', value: String(F().initialBalance), step: '0.01', inputmode: 'decimal', 'aria-label': 'Saldo początkowe' });
        inp.addEventListener('change', () => { const v = Number(String(inp.value).replace(',', '.')); F().initialBalance = isFinite(v) ? Math.round(v * 100) / 100 : 0; Prime.save(); api.rerender(); });
        return ui.field('Saldo początkowe (zł)', inp);
      })()));
    const series = monthSeries(6);
    if (series.some(s => s.in || s.out)) {
      body.appendChild(h('div.card', null, h('div.chart-title', { text: 'Wpływy i wydatki — ostatnie 6 miesięcy' }), (function () {
        const holder = h('div'); setTimeout(() => Prime.charts.mount(holder, 'bar', series.map(s => ({ ys: [s.in, s.out] })), { labels: [D.monthLabel(series[0].key).slice(0, 3), D.monthLabel(series[series.length - 1].key).slice(0, 3)], height: 110, colors: [Prime.charts ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c6f432' : '#c6f432', getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim() || '#888'], label: 'Wpływy (kolor akcentu) i wydatki (szary) po miesiącach' }), 0);
        return holder;
      })(), h('div.legend', null, h('span.dot.acc'), ' wpływy ', h('span.dot.gray'), ' wydatki')));
    }
    const br = categoryBreakdown(st.month);
    if (br.length) {
      const card = h('div.card', null, h('div.sub-title', { text: 'Wydatki wg kategorii' }));
      const top = br[0].amount || 1;
      br.forEach(b => card.appendChild(h('div.bar-row', null, h('span.bar-name', { text: b.name }), ui.progress((b.amount / top) * 100, true), h('span.bar-val', { text: money(b.amount) }))));
      body.appendChild(card);
    }
    const txs = F().transactions.filter(x => x.date.slice(0, 7) === st.month).sort((a, b) => b.date.localeCompare(a.date));
    body.appendChild(ui.sectionHead('Transakcje'));
    if (!txs.length) { body.appendChild(ui.emptyState('Brak transakcji w tym miesiącu.', 'Dodaj wydatek lub wpływ przyciskiem +.')); return; }
    const list = h('ul.list');
    txs.forEach(x => list.appendChild(h('li.list-item.clickable', { role: 'button', tabindex: '0', onClick: () => openTxSheet(x), onKeydown: (e) => { if (e.key === 'Enter') openTxSheet(x); } },
      h('div.li-main', null, h('div.li-title', { text: x.note || catName(x.categoryId) }), h('div.li-sub', { text: `${D.shortLabel(x.date)} · ${x.type === 'save' ? 'odłożone' : catName(x.categoryId)}${x.goalId ? ' · ' + ((F().savingsGoals.find(g => g.id === x.goalId) || {}).name || '') : ''}` })),
      h('div.li-value.' + (x.type === 'in' ? 'plus' : x.type === 'out' ? 'minus' : 'neutral'), { text: (x.type === 'in' ? '+' : x.type === 'out' ? '−' : '→ ') + money(x.amount) }))));
    body.appendChild(list);
  }

  function tabSavings(body, api) {
    body.appendChild(h('div.section-head', null, h('h2', { text: 'Cele oszczędnościowe' }), h('button.chip-btn', { type: 'button', onClick: () => openGoalSheet(null) }, ui.icon('plus'), 'Nowy cel')));
    const gs = F().savingsGoals;
    const general = sumTx(x => x.type === 'save' && !x.goalId && x.date <= Prime.today()).save;
    if (!gs.length && !general) body.appendChild(ui.emptyState('Brak celów oszczędnościowych.', 'Dodaj cel i odkładaj na niego przez transakcję typu „Odłożone”.'));
    gs.forEach(g => {
      const saved = goalSaved(g.id), pct = g.target > 0 ? Math.min(100, (saved / g.target) * 100) : 0;
      const left = g.deadline ? D.diffDays(Prime.today(), g.deadline) : null;
      body.appendChild(h('div.card', null,
        h('div.wk-top', null, h('div', null, h('div.li-title', { text: g.name }), h('div.li-sub', { text: `${money(saved)} z ${money(g.target)}${left !== null ? (left >= 0 ? ` · ${left} dni do terminu` : ' · po terminie') : ''}` })),
          h('button.icon-btn.small', { type: 'button', 'aria-label': 'Edytuj cel', onClick: () => openGoalSheet(g) }, ui.icon('edit'))),
        ui.progress(pct, false), h('div.row-actions', null, h('button.btn.small.primary', { type: 'button', onClick: () => openTxSheet(null, { type: 'save', goalId: g.id }) }, ui.icon('plus'), 'Odłóż'), h('span.li-sub', { text: Math.round(pct) + '%' }))));
    });
    if (general) body.appendChild(h('div.card', null, h('div.li-title', { text: 'Oszczędności ogólne (bez celu)' }), h('div.big-num', { text: money(general) })));
    body.appendChild(h('div.summary-line', { text: `Odłożone łącznie: ${money(savedTotal())}. Transfery na oszczędności nie są liczone jako wydatek ani dochód.` }));
  }

  function tabCats(body, api) {
    body.appendChild(h('p.hint', { text: 'Kategorie wbudowane są stałe. Możesz dodać własne dla wpływów i wydatków.' }));
    ['in', 'out'].forEach(kind => {
      const card = h('div.card', null, h('div.sub-title', { text: kind === 'in' ? 'Wpływy' : 'Wydatki' }));
      catsFor(kind).forEach(c => card.appendChild(h('div.edit-row', null, h('span', { text: c.name + (c.custom ? '' : ' · wbudowana') }),
        c.custom ? h('button.icon-btn.small', { type: 'button', 'aria-label': 'Usuń kategorię ' + c.name, onClick: async () => {
          const used = F().transactions.some(t => t.categoryId === c.id);
          const ok = await ui.confirm({ title: 'Usunąć kategorię?', text: used ? 'Transakcje z tą kategorią zostaną jako „Bez kategorii”.' : 'Kategoria zostanie usunięta.', okLabel: 'Usuń' });
          if (!ok) return;
          F().categories = F().categories.filter(x => x.id !== c.id); F().transactions.forEach(t => { if (t.categoryId === c.id) t.categoryId = null; });
          Prime.save(); api.rerender();
        } }, ui.icon('trash')) : null)));
      const inp = ui.input({ placeholder: 'Nowa kategoria', maxlength: '40', 'aria-label': 'Nowa kategoria: ' + kind });
      const add = () => { const v = inp.value.trim(); if (!v) return; F().categories.push({ id: Prime.uid(), name: v, kind }); Prime.save(); api.rerender(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      card.appendChild(h('div.add-row', null, inp, h('button.btn.small.primary', { type: 'button', text: 'Dodaj', onClick: add })));
      body.appendChild(card);
    });
  }

  Prime.mods.finance = { money, balance, savedTotal, goalSaved, monthSummary, rangeSummary, monthSeries, categoryBreakdown, hasData, openPanel, openTxSheet, BUILTIN_CATS, cents };
})();
