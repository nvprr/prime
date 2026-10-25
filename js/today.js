/* ============================================================
   PRIME LIFE MAXING — today.js
   The "Dzisiaj" screen: date navigation, hero/dashboard, Daily Score
   and streak, Big 3, task list, templates, repeating tasks, the
   collapsible Life Maxing sections, quick add and the evening summary.
   Viewing a day never writes (days are only created on a real change).
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const $ = (id) => document.getElementById(id);

  /* ---------------- repeating tasks ---------------- */

  /** Create tasks from repeat rules for `ds` (once per rule per day; deleted tasks are not resurrected). */
  function applyRecurring(ds) {
    const rules = Prime.state.recurring;
    if (!rules.length || Prime.locked) return;
    if (ds > D.addDays(Prime.today(), 7)) return;
    const dow = D.weekdayMon0(ds);
    let changed = false;
    rules.forEach(r => {
      if (ds < r.startDate || (r.endDate && ds > r.endDate)) return;
      if (r.freq === 'weekdays' && dow > 4) return;
      if (r.freq === 'weekly' && dow !== r.dow) return;
      const day = Prime.state.days[ds];
      if (day && day.appliedRecurring.includes(r.id)) return;
      const d = Prime.ensureDay(ds);
      d.tasks.push({ id: Prime.uid(), name: r.name, time: r.time || null, category: r.category || null, duration: r.duration || null, done: false, priority: false, recurId: r.id });
      d.appliedRecurring.push(r.id);
      changed = true;
    });
    if (changed) Prime.save();
  }

  /* ---------------- task rendering ---------------- */

  function renderTaskItem(task) {
    const cat = Prime.catInfo(task.category);
    const meta = [];
    if (task.time) meta.push(h('span', { text: task.time }));
    if (task.duration) meta.push(h('span', { text: task.duration + ' min' }));
    if (cat) meta.push(h('span.task-cat-icon', null, ui.icon(cat.icon), cat.label));
    if (task.recurId) meta.push(h('span.task-cat-icon', { title: 'Zadanie powtarzalne' }, ui.icon('repeat')));
    return h('li.task-item' + (task.done ? '.done' : '') + (task.priority ? '.priority' : ''), { dataset: { id: task.id } },
      h('button.task-check' + (task.done ? '.checked' : ''), { type: 'button', role: 'checkbox', 'aria-checked': String(!!task.done), 'aria-label': 'Odhacz zadanie: ' + task.name, dataset: { action: 'toggle' } }, ui.icon('check')),
      h('div.task-body', { dataset: { action: 'edit' }, role: 'button', tabindex: '0' }, h('span.task-name', { text: task.name }), meta.length ? h('span.task-meta', null, meta) : null),
      h('button.task-star-btn' + (task.priority ? '.active' : ''), { type: 'button', 'aria-pressed': String(!!task.priority), 'aria-label': task.priority ? 'Usuń z Big 3' : 'Dodaj do Big 3', dataset: { action: 'star' } }, ui.icon(task.priority ? 'star-fill' : 'star')),
      h('button.task-edit-btn', { type: 'button', 'aria-label': 'Edytuj zadanie', dataset: { action: 'edit' } }, ui.icon('more')));
  }

  function sortTasks(list) {
    return list.slice().sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  }

  function onTaskClick(e) {
    const item = e.target.closest('.task-item');
    if (!item) return;
    const day = Prime.day(Prime.date);
    const task = day.tasks.find(t => t.id === item.dataset.id);
    if (!task) return;
    const action = e.target.closest('[data-action]') && e.target.closest('[data-action]').dataset.action;
    if (action === 'toggle') {
      const d = Prime.ensureDay(Prime.date); const t = d.tasks.find(x => x.id === task.id); t.done = !t.done;
      Prime.save(); Prime.refresh();
    } else if (action === 'edit') openTaskModal(task);
    else if (action === 'star') {
      const d = Prime.ensureDay(Prime.date); const t = d.tasks.find(x => x.id === task.id);
      if (!t.priority && d.tasks.filter(x => x.priority).length >= 3) { ui.toast('Big 3 — możesz oznaczyć max 3 zadania'); return; }
      t.priority = !t.priority; Prime.save(); Prime.refresh();
    }
  }

  /* ---------------- main render ---------------- */

  function render() {
    const ds = Prime.date;
    applyRecurring(ds);
    $('dateWeekday').textContent = D.formatWeekday(ds);
    $('dateFull').textContent = D.formatFullDate(ds);
    $('datePicker').value = ds;

    const day = Prime.day(ds);
    const score = Prime.computeScore(day);
    $('scoreCount').textContent = `${score.done} / ${score.total}`;
    $('scorePercent').textContent = score.pct === null ? '—' : `${score.pct}%`;
    $('scoreBar').style.width = `${score.pct || 0}%`;
    const streak = Prime.computeStreak();
    $('streakText').textContent = `${streak} ${streak === 1 ? 'dzień' : 'dni'}`;
    $('restBadge').hidden = !day.rest;
    const xp = $('xpMini');
    xp.textContent = Prime.modEnabled('xp') ? Prime.mods.xp.miniText() : '';
    xp.hidden = !Prime.modEnabled('xp');

    Prime.mods.lifemax.renderHero(ds);

    // Big 3 + plan
    const big = sortTasks(day.tasks.filter(t => t.priority));
    const rest = sortTasks(day.tasks.filter(t => !t.priority));
    const big3 = $('big3List'); ui.clear(big3);
    big.forEach(t => big3.appendChild(renderTaskItem(t)));
    $('big3Empty').hidden = big.length > 0;
    $('big3Hint').textContent = `${big.filter(t => t.done).length}/${big.length} z 3`;
    const list = $('taskList'); ui.clear(list);
    rest.forEach(t => list.appendChild(renderTaskItem(t)));
    $('tasksEmpty').hidden = day.tasks.length > 0;

    // sections
    Prime.mods.trackers.render(ds);
    document.querySelectorAll('.collapsible[data-mod]').forEach(sec => { sec.hidden = !Prime.modEnabled(sec.dataset.mod); });
    if (Prime.modEnabled('nutrition')) Prime.mods.nutrition.renderDay($('mealsMount'), ds); else ui.clear($('mealsMount'));
    if (Prime.modEnabled('training')) Prime.mods.workouts.renderToday($('workoutMount'), ds); else ui.clear($('workoutMount'));
    if (Prime.modEnabled('care')) Prime.mods.habits.renderCare($('careMount'), ds); else ui.clear($('careMount'));
    if (Prime.modEnabled('habits')) Prime.mods.habits.renderToday($('habitsMount'), ds);
    if (Prime.modEnabled('growth')) Prime.mods.growth.renderToday($('growthMount'), ds);
    syncCollapsibles();
    renderModuleLinks();
  }

  function renderModuleLinks() {
    const box = $('moduleLinks'); ui.clear(box);
    const M = Prime.mods;
    const links = [
      ['training', 'dumbbell', 'Dziennik treningowy', () => M.workouts.openPanel()],
      ['habits', 'repeat', 'Nawyki', () => M.habits.openManager()],
      ['finance', 'wallet', 'Finanse', () => M.finance.openPanel()],
      ['growth', 'bulb', 'Projekty', () => M.growth.openPanel()],
      ['social', 'users', 'Relacje', () => M.social.openPanel()],
      ['photos', 'camera', 'Zdjęcia', () => M.photos.openPanel()],
      ['xp', 'trophy', 'Poziom i odznaki', () => M.xp.openPanel()],
    ];
    links.forEach(([mod, icon, label, fn]) => {
      if (!Prime.modEnabled(mod)) return;
      box.appendChild(h('button.module-link', { type: 'button', onClick: fn }, ui.icon(icon), h('span', { text: label })));
    });
    const due = Prime.modEnabled('social') ? M.social.dueOn(Prime.date) : [];
    if (due.length) box.appendChild(h('p.hint.full', { text: `Relacje: ${due.length} ${Prime.plural(due.length, 'wpis czeka', 'wpisy czekają', 'wpisów czeka')} na odhaczenie.` }));
  }

  /* ---------------- collapsible sections ---------------- */

  function setOpen(sec, open, persist) {
    const head = sec.querySelector('.collapsible-head'), body = sec.querySelector('.collapsible-body');
    head.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    sec.classList.toggle('open', open);
    if (persist) {
      const m = Prime.state.settings.ui.open;
      if (open) m[sec.dataset.sec] = true; else delete m[sec.dataset.sec];
      Prime.save();
    }
  }

  function syncCollapsibles() {
    const m = Prime.state.settings.ui.open;
    document.querySelectorAll('.collapsible').forEach(sec => setOpen(sec, !!m[sec.dataset.sec], false));
  }

  function bindCollapsibles() {
    document.querySelectorAll('.collapsible-head').forEach(head => head.addEventListener('click', () => {
      const sec = head.closest('.collapsible');
      setOpen(sec, head.getAttribute('aria-expanded') !== 'true', true);
    }));
  }

  /* ---------------- task modal ---------------- */

  let editingTaskId = null, selectedCategory = null;

  function buildCategoryGrid() {
    const grid = $('categoryGrid'); ui.clear(grid);
    Prime.CATEGORIES.forEach(cat => {
      grid.appendChild(h('button.category-chip' + (selectedCategory === cat.id ? '.selected' : ''), { type: 'button', 'aria-pressed': String(selectedCategory === cat.id), dataset: { cat: cat.id }, onClick: () => {
        selectedCategory = selectedCategory === cat.id ? null : cat.id; buildCategoryGrid();
      } }, ui.icon(cat.icon, 'cat-emoji'), h('span', { text: cat.label })));
    });
  }

  function openTaskModal(task) {
    editingTaskId = task ? task.id : null;
    selectedCategory = task ? task.category : null;
    $('taskModalTitle').textContent = task ? 'Edytuj zadanie' : 'Nowe zadanie';
    $('taskName').value = task ? task.name : '';
    $('taskTime').value = task ? (task.time || '') : '';
    $('taskDuration').value = task && task.duration ? task.duration : '';
    $('taskRepeat').value = 'none';
    $('taskRepeatWrap').hidden = !!task;
    $('taskDeleteBtn').hidden = !task;
    buildCategoryGrid();
    ui.openModal($('taskModal'));
    setTimeout(() => $('taskName').focus({ preventScroll: true }), 60);
  }

  function saveTask() {
    const name = $('taskName').value.trim();
    if (!name) { ui.toast('Podaj nazwę zadania'); return; }
    const time = $('taskTime').value || null;
    const dur = $('taskDuration').value === '' ? null : Math.max(1, Math.min(1440, Math.round(Number($('taskDuration').value)) || 0)) || null;
    const day = Prime.ensureDay(Prime.date);
    if (editingTaskId) {
      const task = day.tasks.find(t => t.id === editingTaskId);
      if (task) { task.name = name; task.time = time; task.category = selectedCategory; task.duration = dur; }
    } else {
      const task = { id: Prime.uid(), name, time, category: selectedCategory, duration: dur, done: false, priority: false };
      const repeat = $('taskRepeat').value;
      if (repeat !== 'none') {
        const rule = { id: Prime.uid(), name, category: selectedCategory, time, duration: dur, freq: repeat, dow: D.weekdayMon0(Prime.date), startDate: Prime.date, endDate: null };
        Prime.state.recurring.push(rule);
        task.recurId = rule.id; day.appliedRecurring.push(rule.id);
      }
      day.tasks.push(task);
    }
    Prime.save();
    ui.closeModals();
    Prime.refresh();
  }

  function deleteTask() {
    const day = Prime.ensureDay(Prime.date);
    day.tasks = day.tasks.filter(t => t.id !== editingTaskId);
    Prime.save(); ui.closeModals(); Prime.refresh();
  }

  /* ---------------- templates ---------------- */

  function openTemplatePicker() {
    const list = $('templatePickList'); ui.clear(list);
    const empty = $('templatePickEmpty');
    const tpls = Prime.state.templates;
    empty.hidden = tpls.length > 0;
    tpls.forEach(tpl => list.appendChild(h('li.template-pick-item', null,
      h('div', null, h('div.template-pick-name', { text: tpl.name }), h('div.template-pick-count', { text: `${tpl.tasks.length} zadań` })),
      h('button.template-pick-apply', { type: 'button', text: 'Zastosuj', dataset: { id: tpl.id } }))));
    ui.openModal($('templateModal'));
  }

  function applyTemplate(id) {
    const tpl = Prime.state.templates.find(t => t.id === id);
    if (!tpl) return;
    const day = Prime.ensureDay(Prime.date);
    tpl.tasks.forEach(t => day.tasks.push({ id: Prime.uid(), name: t.name, time: null, category: t.category || null, done: false, priority: false }));
    Prime.save(); ui.closeModals(); Prime.refresh(); ui.toast('Szablon zastosowany');
  }

  /* ---------------- quick add ---------------- */

  function openQuickAdd() {
    const ds = Prime.date, M = Prime.mods;
    const items = [
      ['plus', 'Zadanie', () => openTaskModal(null), true],
      ['drop', 'Woda +250 ml', () => { const d = Prime.ensureDay(ds); d.water = Prime.clamp((d.water || 0) + 250, 0, 20000); Prime.save(); ui.closeModals(); Prime.refresh(); ui.toast('+250 ml wody'); }, true],
      ['utensils', 'Posiłek', () => M.nutrition.openMealSheet(ds), Prime.modEnabled('nutrition')],
      ['bolt', 'Szybki wpis makro', () => M.nutrition.openQuickMacro(ds), Prime.modEnabled('nutrition')],
      ['dumbbell', 'Trening', () => { ui.closeModals(); Prime.date = ds; M.workouts.openPanel('session'); }, Prime.modEnabled('training')],
      ['wallet', 'Wydatek', () => M.finance.openTxSheet(null, { date: ds <= Prime.today() ? ds : Prime.today() }), Prime.modEnabled('finance')],
      ['bulb', 'Sesja rozwoju', () => M.growth.openSessionSheet(ds, M.growth.mainProject()), Prime.modEnabled('growth')],
      ['note', 'Notatka dnia', () => openSummary(), true],
    ].filter(x => x[3]);
    const grid = h('div.quick-grid', null, items.map(([icon, label, fn]) => h('button.quick-item', { type: 'button', onClick: fn }, ui.icon(icon), h('span', { text: label }))));
    ui.sheet({ title: 'Szybkie dodawanie', sub: D.formatFullDate(ds), body: grid, actions: [{ label: 'Zamknij', kind: 'ghost' }], focus: false });
  }

  /* ---------------- evening summary ---------------- */

  let summaryNoteDate = null;

  function openSummary() {
    const ds = Prime.date;
    const day = Prime.day(ds);
    const score = Prime.computeScore(day);
    const W = Prime.mods.workouts, Hb = Prime.mods.habits;
    const box = (label, value) => h('div.summary-box', null, h('div.summary-box-label', { text: label }), h('div.summary-box-value', { text: value }));
    const grid = $('summaryGrid'); ui.clear(grid);
    const workoutTask = day.tasks.find(t => t.category === 'trening' && t.done);
    const tr = W.dayStatus(ds);
    grid.appendChild(box('Daily Score', score.pct === null ? '—' : `${score.pct}%`));
    grid.appendChild(box('Zadania', `${score.done} / ${score.total}`));
    grid.appendChild(box('Woda', `${Prime.roundTo(day.water / 1000, 2)} L`));
    grid.appendChild(box('Białko', `${Prime.formatNum(Prime.roundTo(day.protein || 0, 1))} g`));
    grid.appendChild(box('Kalorie', `${day.calories || 0} kcal`));
    grid.appendChild(box('Trening', W.countedOn(ds).length ? W.countedOn(ds).map(s => s.name || 'Trening').join(', ') : (workoutTask ? workoutTask.name : (tr.kind === 'none' ? '—' : tr.label))));
    grid.appendChild(box('Sen', day.sleep !== null ? `${day.sleep} h` : '—'));
    const hs = Hb.dayStatus(ds), cs = Hb.careStatus(ds);
    if (hs.total) grid.appendChild(box('Nawyki', `${hs.done} / ${hs.total}`));
    if (cs.total) grid.appendChild(box('Pielęgnacja', `${cs.done} / ${cs.total}`));
    const status = $('summaryStatus');
    if (day.rest) { status.textContent = 'Dzień wolny — nie przerywa streaka'; status.className = 'summary-status'; }
    else if (score.pct !== null && score.pct >= Prime.state.settings.streakThreshold) { status.textContent = 'Dzień zaliczony'; status.className = 'summary-status'; }
    else { status.textContent = 'Dzień niezaliczony'; status.className = 'summary-status miss'; }
    const extra = $('summaryExtra'); ui.clear(extra);
    const undone = day.tasks.filter(t => !t.done);
    if (undone.length) extra.appendChild(h('p.hint', { text: `Nieukończone (${undone.length}): ${undone.slice(0, 4).map(t => t.name).join(', ')}${undone.length > 4 ? '…' : ''}` }));
    $('summaryRest').checked = !!day.rest;
    $('summaryNote').value = day.note || '';
    summaryNoteDate = ds;
    ui.openModal($('summaryModal'));
  }

  function saveSummaryNote() {
    if (!summaryNoteDate) return;
    const val = $('summaryNote').value;
    const existing = Prime.state.days[summaryNoteDate];
    if ((existing ? existing.note : '') !== val) { Prime.ensureDay(summaryNoteDate).note = val; Prime.save(); }
  }

  /* ---------------- bind ---------------- */

  function bind() {
    $('taskList').addEventListener('click', onTaskClick);
    $('big3List').addEventListener('click', onTaskClick);
    [$('taskList'), $('big3List')].forEach(l => l.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.task-body')) { e.preventDefault(); onTaskClick(e); }
    }));

    $('prevDay').addEventListener('click', () => { Prime.date = D.addDays(Prime.date, -1); Prime.refresh(); });
    $('nextDay').addEventListener('click', () => { Prime.date = D.addDays(Prime.date, 1); Prime.refresh(); });
    $('dateDisplay').addEventListener('click', () => {
      const p = $('datePicker');
      if (typeof p.showPicker === 'function') { try { p.showPicker(); return; } catch (e) { /* fall through */ } }
      p.focus(); p.click();
    });
    $('datePicker').addEventListener('change', (e) => { if (D.isDateStr(e.target.value)) { Prime.date = e.target.value; Prime.refresh(); } });

    $('addTaskBtn').addEventListener('click', () => openTaskModal(null));
    $('taskCancelBtn').addEventListener('click', ui.closeModals);
    $('taskSaveBtn').addEventListener('click', saveTask);
    $('taskDeleteBtn').addEventListener('click', deleteTask);
    $('taskName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveTask(); });

    $('useTemplateBtn').addEventListener('click', openTemplatePicker);
    $('templatePickList').addEventListener('click', (e) => { const b = e.target.closest('.template-pick-apply'); if (b) applyTemplate(b.dataset.id); });
    $('templateCancelBtn').addEventListener('click', ui.closeModals);

    $('quickAddBtn').addEventListener('click', openQuickAdd);
    $('openSummaryBtn').addEventListener('click', openSummary);
    $('summaryNote').addEventListener('blur', saveSummaryNote);
    $('summaryRest').addEventListener('change', (e) => { Prime.ensureDay(summaryNoteDate || Prime.date).rest = e.target.checked; Prime.save(); Prime.refresh(); openSummaryStatus(); });
    $('summaryCloseBtn').addEventListener('click', () => { saveSummaryNote(); ui.closeModals(); });

    const xp = $('xpMini');
    xp.setAttribute('role', 'button'); xp.setAttribute('tabindex', '0');
    xp.addEventListener('click', () => { if (Prime.modEnabled('xp')) Prime.mods.xp.openPanel(); });
    xp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && Prime.modEnabled('xp')) Prime.mods.xp.openPanel(); });

    bindCollapsibles();
    Prime.mods.trackers.bind();
  }

  function openSummaryStatus() {
    const day = Prime.day(summaryNoteDate || Prime.date);
    const score = Prime.computeScore(day), status = $('summaryStatus');
    if (day.rest) { status.textContent = 'Dzień wolny — nie przerywa streaka'; status.className = 'summary-status'; }
    else if (score.pct !== null && score.pct >= Prime.state.settings.streakThreshold) { status.textContent = 'Dzień zaliczony'; status.className = 'summary-status'; }
    else { status.textContent = 'Dzień niezaliczony'; status.className = 'summary-status miss'; }
  }

  Prime.mods.today = { render, bind, openTaskModal, openSummary, applyRecurring, saveSummaryNote };
})();
