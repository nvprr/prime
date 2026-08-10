'use strict';

/* ============================================================
   PRIME — app.js
   Single source of truth: STATE, persisted to localStorage.
   ============================================================ */

const STORAGE_KEY = 'prime_data_v1';
const DATA_VERSION = 1;

const CATEGORIES = [
  { id: 'trening',  emoji: '💪', label: 'Trening' },
  { id: 'praca',    emoji: '💼', label: 'Praca' },
  { id: 'rozwoj',   emoji: '🧠', label: 'Rozwój' },
  { id: 'zdrowie',  emoji: '🥗', label: 'Zdrowie' },
  { id: 'dom',      emoji: '🏠', label: 'Dom' },
  { id: 'osobiste', emoji: '👤', label: 'Osobiste' },
  { id: 'inne',     emoji: '📌', label: 'Inne' },
];

const WEEKDAYS_PL = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
const MONTHS_PL = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];

function defaultSettings() {
  return {
    waterGoal: 3.0,
    calGoal: 2200,
    proteinGoal: 150,
    streakThreshold: 60,
    units: 'metric',
    accent: 'blue',
  };
}

function defaultState() {
  return {
    version: DATA_VERSION,
    settings: defaultSettings(),
    days: {},
    templates: [],
    goals: [],
  };
}

function defaultDay() {
  return {
    tasks: [],
    water: 0,
    protein: 0,
    calories: 0,
    sleep: null,
    weight: null,
    steps: null,
  };
}

/* ---------------- utilities ---------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
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

function todayStr() {
  return toDateStr(new Date());
}

function formatFullDate(dateStr) {
  const d = parseDateStr(dateStr);
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

function formatWeekday(dateStr) {
  const d = parseDateStr(dateStr);
  return WEEKDAYS_PL[d.getDay()];
}

function catInfo(id) {
  return CATEGORIES.find(c => c.id === id) || null;
}

function roundTo(n, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/* ============================================================
   PERSISTENCE
   ============================================================ */

let STATE = null;

function deepMerge(defaults, loaded) {
  if (typeof defaults !== 'object' || defaults === null) return loaded !== undefined ? loaded : defaults;
  const out = Array.isArray(defaults) ? [] : {};
  for (const key of Object.keys(defaults)) {
    if (loaded && Object.prototype.hasOwnProperty.call(loaded, key)) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        out[key] = deepMerge(defaults[key], loaded[key]);
      } else {
        out[key] = loaded[key];
      }
    } else {
      out[key] = defaults[key];
    }
  }
  return out;
}

function mergeLoadedState(parsed) {
  const merged = deepMerge(defaultState(), parsed);
  // 'days' is a dynamic dictionary keyed by date (not a fixed-shape object), so the generic
  // deepMerge above — which only preserves keys present in the defaults template — would
  // silently discard every saved day. Rebuild it explicitly here instead, backfilling any
  // fields a day might be missing (e.g. from an older data version) without dropping entries.
  merged.days = {};
  if (parsed && parsed.days && typeof parsed.days === 'object') {
    for (const [dateKey, dayVal] of Object.entries(parsed.days)) {
      merged.days[dateKey] = Object.assign(defaultDay(), dayVal);
    }
  }
  merged.templates = Array.isArray(parsed && parsed.templates) ? parsed.templates : [];
  merged.goals = Array.isArray(parsed && parsed.goals) ? parsed.goals : [];
  return merged;
}

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.error('Prime: localStorage unavailable', e);
    return defaultState();
  }
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    // migration point: bump DATA_VERSION and add migration steps here in future updates
    // without ever deleting existing user data.
    return mergeLoadedState(parsed);
  } catch (e) {
    console.error('Prime: corrupt data, falling back to defaults', e);
    return defaultState();
  }
}

let saveTimer = null;
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  } catch (e) {
    console.error('Prime: failed to save', e);
    toast('Nie udało się zapisać danych');
  }
}

function ensureDay(dateStr) {
  if (!STATE.days[dateStr]) {
    STATE.days[dateStr] = defaultDay();
  }
  // backfill any missing fields for days created by older versions
  STATE.days[dateStr] = Object.assign(defaultDay(), STATE.days[dateStr]);
  return STATE.days[dateStr];
}

function getDayReadonly(dateStr) {
  return STATE.days[dateStr] || null;
}

/* ============================================================
   SCORE / STREAK
   ============================================================ */

function computeScore(day) {
  if (!day || !day.tasks || day.tasks.length === 0) return { done: 0, total: 0, pct: null };
  const total = day.tasks.length;
  const done = day.tasks.filter(t => t.done).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

function computeStreak() {
  const threshold = STATE.settings.streakThreshold;
  let streak = 0;
  let cursor = todayStr();

  const todayDay = getDayReadonly(cursor);
  const todayScore = computeScore(todayDay);
  if (todayScore.pct !== null && todayScore.pct >= threshold) {
    streak += 1;
  }
  cursor = addDays(cursor, -1);

  // walk backward through completed days
  for (let i = 0; i < 3650; i++) {
    const d = getDayReadonly(cursor);
    const s = computeScore(d);
    if (s.pct !== null && s.pct >= threshold) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

/* ============================================================
   VIEW ROUTING
   ============================================================ */

let currentView = 'today';
let currentDate = todayStr();
let currentRange = 7;

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(el => {
    el.hidden = el.dataset.view !== view;
  });
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === view);
  });
  if (view === 'today') renderToday();
  if (view === 'goals') renderGoals();
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
}

/* ============================================================
   TOAST
   ============================================================ */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */

const modalBackdrop = document.getElementById('modalBackdrop');

function openModal(modalEl) {
  document.querySelectorAll('.modal').forEach(m => { m.hidden = true; });
  modalEl.hidden = false;
  modalBackdrop.hidden = false;
}

function closeModals() {
  modalBackdrop.hidden = true;
  document.querySelectorAll('.modal').forEach(m => { m.hidden = true; });
}

modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModals();
});

/* ============================================================
   RENDER: TODAY
   ============================================================ */

function renderToday() {
  document.getElementById('dateWeekday').textContent = formatWeekday(currentDate);
  document.getElementById('dateFull').textContent = formatFullDate(currentDate);
  document.getElementById('datePicker').value = currentDate;

  document.getElementById('nextDay').disabled = false;

  const day = ensureDay(currentDate);
  const score = computeScore(day);

  document.getElementById('scoreCount').textContent = `${score.done} / ${score.total}`;
  document.getElementById('scorePercent').textContent = score.pct === null ? '—' : `${score.pct}%`;
  document.getElementById('scoreBar').style.width = `${score.pct || 0}%`;

  const streak = computeStreak();
  document.getElementById('streakText').textContent = `${streak} ${streak === 1 ? 'dzień' : 'dni'}`;

  // task list
  const list = document.getElementById('taskList');
  const empty = document.getElementById('tasksEmpty');
  list.innerHTML = '';
  const sorted = [...day.tasks].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return 0;
  });
  if (sorted.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    for (const task of sorted) {
      list.appendChild(renderTaskItem(task));
    }
  }

  // trackers
  const waterGoal = STATE.settings.waterGoal;
  document.getElementById('waterVal').textContent = roundTo(day.water / 1000, 2);
  document.getElementById('waterGoalDisp').textContent = roundTo(waterGoal, 2);
  document.getElementById('waterBar').style.width = `${clamp((day.water / 1000 / waterGoal) * 100, 0, 100)}%`;

  document.getElementById('proteinVal').textContent = day.protein || 0;
  document.getElementById('proteinGoalDisp').textContent = STATE.settings.proteinGoal;
  document.getElementById('proteinBar').style.width = `${clamp((day.protein / STATE.settings.proteinGoal) * 100, 0, 100)}%`;
  document.getElementById('proteinInput').value = '';

  document.getElementById('calVal').textContent = day.calories || 0;
  document.getElementById('calGoalDisp').textContent = STATE.settings.calGoal;
  document.getElementById('calBar').style.width = `${clamp((day.calories / STATE.settings.calGoal) * 100, 0, 100)}%`;
  document.getElementById('calInput').value = day.calories || '';

  document.getElementById('sleepVal').textContent = day.sleep !== null ? day.sleep : '—';
  document.getElementById('sleepInput').value = day.sleep !== null ? day.sleep : '';

  document.getElementById('weightVal').textContent = day.weight !== null ? day.weight : '—';
  document.getElementById('weightInput').value = day.weight !== null ? day.weight : '';

  document.getElementById('stepsVal').textContent = day.steps !== null ? day.steps : '—';
  document.getElementById('stepsInput').value = day.steps !== null ? day.steps : '';
}

function renderTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.done ? ' done' : '');
  li.dataset.id = task.id;

  const cat = catInfo(task.category);

  li.innerHTML = `
    <button class="task-check ${task.done ? 'checked' : ''}" data-action="toggle" aria-label="Odhacz zadanie">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </button>
    <div class="task-body" data-action="edit">
      <span class="task-name">${escapeHtml(task.name)}</span>
      <span class="task-meta">
        ${task.time ? `<span>${task.time}</span>` : ''}
        ${cat ? `<span class="task-cat-icon">${cat.emoji} ${cat.label}</span>` : ''}
      </span>
    </div>
    <button class="task-edit-btn" data-action="edit" aria-label="Edytuj">⋯</button>
  `;
  return li;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('taskList').addEventListener('click', (e) => {
  const item = e.target.closest('.task-item');
  if (!item) return;
  const id = item.dataset.id;
  const day = ensureDay(currentDate);
  const task = day.tasks.find(t => t.id === id);
  if (!task) return;

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle') {
    task.done = !task.done;
    saveState();
    renderToday();
  } else if (action === 'edit') {
    openTaskModal(task);
  }
});

/* -------- date navigation -------- */

document.getElementById('prevDay').addEventListener('click', () => {
  currentDate = addDays(currentDate, -1);
  renderToday();
});
document.getElementById('nextDay').addEventListener('click', () => {
  currentDate = addDays(currentDate, 1);
  renderToday();
});
document.getElementById('dateDisplay').addEventListener('click', () => {
  document.getElementById('datePicker').focus();
  document.getElementById('datePicker').click();
  if (typeof document.getElementById('datePicker').showPicker === 'function') {
    try { document.getElementById('datePicker').showPicker(); } catch (e) { /* ignore */ }
  }
});
document.getElementById('datePicker').addEventListener('change', (e) => {
  if (e.target.value) {
    currentDate = e.target.value;
    renderToday();
  }
});

/* -------- task modal -------- */

let editingTaskId = null;
let selectedCategory = null;

function buildCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-chip' + (selectedCategory === cat.id ? ' selected' : '');
    btn.dataset.cat = cat.id;
    btn.innerHTML = `<span class="cat-emoji">${cat.emoji}</span><span>${cat.label}</span>`;
    btn.addEventListener('click', () => {
      selectedCategory = selectedCategory === cat.id ? null : cat.id;
      buildCategoryGrid();
    });
    grid.appendChild(btn);
  }
}

function openTaskModal(task) {
  editingTaskId = task ? task.id : null;
  selectedCategory = task ? task.category : null;
  document.getElementById('taskModalTitle').textContent = task ? 'Edytuj zadanie' : 'Nowe zadanie';
  document.getElementById('taskName').value = task ? task.name : '';
  document.getElementById('taskTime').value = task ? (task.time || '') : '';
  document.getElementById('taskDeleteBtn').hidden = !task;
  buildCategoryGrid();
  openModal(document.getElementById('taskModal'));
  setTimeout(() => document.getElementById('taskName').focus(), 50);
}

document.getElementById('addTaskBtn').addEventListener('click', () => openTaskModal(null));
document.getElementById('taskCancelBtn').addEventListener('click', closeModals);

document.getElementById('taskSaveBtn').addEventListener('click', () => {
  const name = document.getElementById('taskName').value.trim();
  if (!name) { toast('Podaj nazwę zadania'); return; }
  const time = document.getElementById('taskTime').value || null;
  const day = ensureDay(currentDate);

  if (editingTaskId) {
    const task = day.tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.name = name;
      task.time = time;
      task.category = selectedCategory;
    }
  } else {
    day.tasks.push({ id: uid(), name, time, category: selectedCategory, done: false });
  }
  saveState();
  closeModals();
  renderToday();
});

document.getElementById('taskDeleteBtn').addEventListener('click', () => {
  const day = ensureDay(currentDate);
  day.tasks = day.tasks.filter(t => t.id !== editingTaskId);
  saveState();
  closeModals();
  renderToday();
});

/* -------- trackers -------- */

document.querySelectorAll('[data-water]').forEach(btn => {
  btn.addEventListener('click', () => {
    const delta = Number(btn.dataset.water);
    const day = ensureDay(currentDate);
    day.water = clamp((day.water || 0) + delta, 0, 20000);
    saveState();
    renderToday();
  });
});

document.querySelectorAll('[data-protein]').forEach(btn => {
  btn.addEventListener('click', () => {
    const delta = Number(btn.dataset.protein);
    const day = ensureDay(currentDate);
    day.protein = clamp((day.protein || 0) + delta, 0, 2000);
    saveState();
    renderToday();
  });
});

document.getElementById('proteinInput').addEventListener('change', (e) => {
  const val = Number(e.target.value);
  if (!isNaN(val) && e.target.value !== '') {
    const day = ensureDay(currentDate);
    day.protein = clamp(val, 0, 2000);
    saveState();
    renderToday();
  }
});

document.getElementById('calInput').addEventListener('change', (e) => {
  const val = Number(e.target.value);
  const day = ensureDay(currentDate);
  day.calories = e.target.value === '' ? 0 : clamp(val, 0, 15000);
  saveState();
  renderToday();
});

document.getElementById('sleepInput').addEventListener('change', (e) => {
  const day = ensureDay(currentDate);
  day.sleep = e.target.value === '' ? null : clamp(Number(e.target.value), 0, 24);
  saveState();
  renderToday();
});

document.getElementById('weightInput').addEventListener('change', (e) => {
  const day = ensureDay(currentDate);
  day.weight = e.target.value === '' ? null : clamp(Number(e.target.value), 0, 500);
  saveState();
  renderToday();
});

document.getElementById('stepsInput').addEventListener('change', (e) => {
  const day = ensureDay(currentDate);
  day.steps = e.target.value === '' ? null : clamp(Math.round(Number(e.target.value)), 0, 200000);
  saveState();
  renderToday();
});

/* -------- templates: apply -------- */

document.getElementById('useTemplateBtn').addEventListener('click', () => {
  const list = document.getElementById('templatePickList');
  const empty = document.getElementById('templatePickEmpty');
  list.innerHTML = '';
  if (STATE.templates.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    for (const tpl of STATE.templates) {
      const li = document.createElement('li');
      li.className = 'template-pick-item';
      li.innerHTML = `
        <div>
          <div class="template-pick-name">${escapeHtml(tpl.name)}</div>
          <div class="template-pick-count">${tpl.tasks.length} zadań</div>
        </div>
        <button class="template-pick-apply" data-id="${tpl.id}">Zastosuj</button>
      `;
      list.appendChild(li);
    }
  }
  openModal(document.getElementById('templateModal'));
});

document.getElementById('templatePickList').addEventListener('click', (e) => {
  const btn = e.target.closest('.template-pick-apply');
  if (!btn) return;
  const tpl = STATE.templates.find(t => t.id === btn.dataset.id);
  if (!tpl) return;
  const day = ensureDay(currentDate);
  for (const t of tpl.tasks) {
    day.tasks.push({ id: uid(), name: t.name, time: null, category: t.category || null, done: false });
  }
  saveState();
  closeModals();
  renderToday();
  toast('Szablon zastosowany');
});

document.getElementById('templateCancelBtn').addEventListener('click', closeModals);

/* -------- day summary -------- */

document.getElementById('openSummaryBtn').addEventListener('click', () => {
  const day = ensureDay(currentDate);
  const score = computeScore(day);
  const workoutTask = day.tasks.find(t => t.category === 'trening' && t.done);

  const grid = document.getElementById('summaryGrid');
  grid.innerHTML = `
    ${box('Daily Score', score.pct === null ? '—' : `${score.pct}%`)}
    ${box('Zadania', `${score.done} / ${score.total}`)}
    ${box('Woda', `${roundTo(day.water / 1000, 2)} L`)}
    ${box('Białko', `${day.protein || 0} g`)}
    ${box('Trening', workoutTask ? workoutTask.name : '—')}
    ${box('Sen', day.sleep !== null ? `${day.sleep} h` : '—')}
  `;
  const status = document.getElementById('summaryStatus');
  const threshold = STATE.settings.streakThreshold;
  if (score.pct !== null && score.pct >= threshold) {
    status.textContent = '🔥 Dzień zaliczony';
    status.className = 'summary-status';
  } else {
    status.textContent = 'Dzień niezaliczony';
    status.className = 'summary-status miss';
  }
  openModal(document.getElementById('summaryModal'));
});

function box(label, value) {
  return `<div class="summary-box"><div class="summary-box-label">${label}</div><div class="summary-box-value">${value}</div></div>`;
}

document.getElementById('summaryCloseBtn').addEventListener('click', closeModals);

/* ============================================================
   RENDER: GOALS
   ============================================================ */

function renderGoals() {
  const list = document.getElementById('goalList');
  const empty = document.getElementById('goalsEmpty');
  list.innerHTML = '';
  if (STATE.goals.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const goal of STATE.goals) {
    const pct = goal.target !== 0 ? clamp((goal.current / goal.target) * 100, 0, 100) : 0;
    const li = document.createElement('li');
    li.className = 'goal-item';
    li.dataset.id = goal.id;
    li.innerHTML = `
      <div class="goal-top">
        <div>
          <div class="goal-name">${escapeHtml(goal.name)}</div>
          ${goal.desc ? `<div class="goal-desc">${escapeHtml(goal.desc)}</div>` : ''}
        </div>
        <button class="goal-edit-btn" data-action="edit">⋯</button>
      </div>
      <div class="goal-values">
        <span class="goal-current">${formatNum(goal.current)}</span>
        <span class="goal-sep">/</span>
        <span class="goal-target">${formatNum(goal.target)} ${escapeHtml(goal.unit || '')}</span>
      </div>
      <div class="progress-track thin"><div class="progress-fill" style="width:${pct}%"></div></div>
      ${goal.deadline ? `<div class="goal-deadline">Termin: ${formatFullDate(goal.deadline)}</div>` : ''}
    `;
    list.appendChild(li);
  }
}

function formatNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return Number.isInteger(n) ? n : roundTo(n, 2);
}

document.getElementById('goalList').addEventListener('click', (e) => {
  const item = e.target.closest('.goal-item');
  if (!item) return;
  const goal = STATE.goals.find(g => g.id === item.dataset.id);
  if (goal) openGoalModal(goal);
});

let editingGoalId = null;

function openGoalModal(goal) {
  editingGoalId = goal ? goal.id : null;
  document.getElementById('goalModalTitle').textContent = goal ? 'Edytuj cel' : 'Nowy cel';
  document.getElementById('goalName').value = goal ? goal.name : '';
  document.getElementById('goalDesc').value = goal ? (goal.desc || '') : '';
  document.getElementById('goalCurrent').value = goal ? goal.current : '';
  document.getElementById('goalTarget').value = goal ? goal.target : '';
  document.getElementById('goalUnit').value = goal ? (goal.unit || '') : '';
  document.getElementById('goalDeadline').value = goal ? (goal.deadline || '') : '';
  document.getElementById('goalDeleteBtn').hidden = !goal;
  openModal(document.getElementById('goalModal'));
}

document.getElementById('addGoalBtn').addEventListener('click', () => openGoalModal(null));
document.getElementById('goalCancelBtn').addEventListener('click', closeModals);

document.getElementById('goalSaveBtn').addEventListener('click', () => {
  const name = document.getElementById('goalName').value.trim();
  if (!name) { toast('Podaj nazwę celu'); return; }
  const current = Number(document.getElementById('goalCurrent').value) || 0;
  const target = Number(document.getElementById('goalTarget').value) || 0;
  const unit = document.getElementById('goalUnit').value.trim();
  const desc = document.getElementById('goalDesc').value.trim();
  const deadline = document.getElementById('goalDeadline').value || null;

  if (editingGoalId) {
    const goal = STATE.goals.find(g => g.id === editingGoalId);
    if (goal) Object.assign(goal, { name, current, target, unit, desc, deadline });
  } else {
    STATE.goals.push({ id: uid(), name, current, target, unit, desc, deadline });
  }
  saveState();
  closeModals();
  renderGoals();
});

document.getElementById('goalDeleteBtn').addEventListener('click', () => {
  STATE.goals = STATE.goals.filter(g => g.id !== editingGoalId);
  saveState();
  closeModals();
  renderGoals();
});

/* ============================================================
   RENDER: STATS
   ============================================================ */

document.getElementById('rangeSwitch').addEventListener('click', (e) => {
  const btn = e.target.closest('.range-btn');
  if (!btn) return;
  currentRange = Number(btn.dataset.range);
  document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderStats();
});

function lastNDays(n, endDateStr) {
  const out = [];
  let cursor = endDateStr;
  for (let i = 0; i < n; i++) {
    out.unshift(cursor);
    cursor = addDays(cursor, -1);
  }
  return out;
}

function renderStats() {
  const today = todayStr();
  const week = lastNDays(7, today);
  const range = lastNDays(currentRange, today);

  // ---- top summary (trailing 7 days) ----
  let tasksDoneSum = 0, scoreSum = 0, scoreCountDays = 0, workoutCount = 0, waterSum = 0, waterDays = 0, sleepSum = 0, sleepDays = 0, proteinSum = 0, proteinDays = 0;
  for (const ds of week) {
    const day = getDayReadonly(ds);
    if (!day) continue;
    const s = computeScore(day);
    tasksDoneSum += s.done;
    if (s.pct !== null) { scoreSum += s.pct; scoreCountDays++; }
    if (day.tasks.some(t => t.category === 'trening' && t.done)) workoutCount++;
    if (day.water > 0) { waterSum += day.water; waterDays++; }
    if (day.sleep !== null) { sleepSum += day.sleep; sleepDays++; }
    if (day.protein > 0) { proteinSum += day.protein; proteinDays++; }
  }

  const summaryGrid = document.getElementById('statSummaryGrid');
  summaryGrid.innerHTML = `
    ${statBox(tasksDoneSum, 'Wykonane zadania (7 dni)')}
    ${statBox(scoreCountDays ? `${Math.round(scoreSum / scoreCountDays)}%` : '—', 'Średni Daily Score')}
    ${statBox(workoutCount, 'Treningi')}
    ${statBox(waterDays ? `${roundTo(waterSum / waterDays / 1000, 1)} L` : '—', 'Śr. nawodnienie')}
    ${statBox(sleepDays ? `${roundTo(sleepSum / sleepDays, 1)} h` : '—', 'Śr. sen')}
    ${statBox(proteinDays ? `${Math.round(proteinSum / proteinDays)} g` : '—', 'Śr. białko')}
  `;

  // ---- charts ----
  drawScoreChart(range);
  drawWaterChart(range);
  drawWeightChart(range);
  drawWorkoutsChart(range);

  // ---- history ----
  renderHistory(range);
}

function statBox(value, label) {
  return `<div class="stat-box"><div class="stat-box-value">${value}</div><div class="stat-box-label">${label}</div></div>`;
}

function renderHistory(range) {
  const list = document.getElementById('historyList');
  const empty = document.getElementById('historyEmpty');
  list.innerHTML = '';
  const reversed = [...range].reverse();
  const withData = reversed.filter(ds => getDayReadonly(ds) && getDayReadonly(ds).tasks.length > 0);

  if (withData.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const ds of withData.slice(0, 30)) {
    const day = getDayReadonly(ds);
    const s = computeScore(day);
    const d = parseDateStr(ds);
    const li = document.createElement('li');
    li.className = 'history-item';
    li.innerHTML = `
      <span class="history-date">${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}</span>
      <span class="history-bar-track"><span class="history-bar-fill" style="width:${s.pct}%"></span></span>
      <span class="history-pct">${s.pct}%</span>
    `;
    li.addEventListener('click', () => {
      currentDate = ds;
      switchView('today');
    });
    list.appendChild(li);
  }
}

/* ============================================================
   CANVAS CHARTS (dependency-free)
   ============================================================ */

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth - 0;
  const cssHeight = canvas.height ? parseInt(canvas.getAttribute('height'), 10) : 140;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssWidth, h: cssHeight };
}

function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b8def';
}

function drawLineChart(canvasId, emptyId, points, opts = {}) {
  const canvas = document.getElementById(canvasId);
  const emptyEl = document.getElementById(emptyId);
  const valid = points.filter(p => p.y !== null && p.y !== undefined);
  if (valid.length === 0) {
    canvas.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  canvas.hidden = false;
  emptyEl.hidden = true;

  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const padTop = 14, padBottom = 20, padX = 6;
  const values = valid.map(p => p.y);
  let min = opts.min !== undefined ? opts.min : Math.min(...values);
  let max = opts.max !== undefined ? opts.max : Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const rangeY = max - min;

  const plotW = w - padX * 2;
  const plotH = h - padTop - padBottom;
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  // gridlines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const y = padTop + (plotH / 2) * i;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
  }

  // build path over valid points only, connecting across gaps
  const coords = points.map((p, i) => {
    if (p.y === null || p.y === undefined) return null;
    const x = padX + stepX * i;
    const y = padTop + plotH - ((p.y - min) / rangeY) * plotH;
    return { x, y };
  });

  const accent = getAccentColor();

  // area fill
  ctx.beginPath();
  let started = false;
  coords.forEach((c) => {
    if (!c) return;
    if (!started) { ctx.moveTo(c.x, c.y); started = true; }
    else ctx.lineTo(c.x, c.y);
  });
  const lastValid = [...coords].reverse().find(c => c);
  const firstValid = coords.find(c => c);
  if (firstValid && lastValid) {
    ctx.lineTo(lastValid.x, padTop + plotH);
    ctx.lineTo(firstValid.x, padTop + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    grad.addColorStop(0, hexToRgba(accent, 0.25));
    grad.addColorStop(1, hexToRgba(accent, 0));
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // line
  ctx.beginPath();
  started = false;
  coords.forEach((c) => {
    if (!c) { started = false; return; }
    if (!started) { ctx.moveTo(c.x, c.y); started = true; }
    else ctx.lineTo(c.x, c.y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // last point dot
  if (lastValid) {
    ctx.beginPath();
    ctx.arc(lastValid.x, lastValid.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }

  // x labels (first / last)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  if (opts.labels && opts.labels.length) {
    ctx.textAlign = 'left';
    ctx.fillText(opts.labels[0], padX, h - padBottom + 6);
    ctx.textAlign = 'right';
    ctx.fillText(opts.labels[opts.labels.length - 1], w - padX, h - padBottom + 6);
  }
}

function drawBarChart(canvasId, emptyId, points, opts = {}) {
  const canvas = document.getElementById(canvasId);
  const emptyEl = document.getElementById(emptyId);
  const hasData = points.some(p => p.y);
  if (!hasData) {
    canvas.hidden = true;
    emptyEl.hidden = false;
    return;
  }
  canvas.hidden = false;
  emptyEl.hidden = true;

  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const padTop = 14, padBottom = 20, padX = 8;
  const max = Math.max(1, ...points.map(p => p.y || 0));
  const plotW = w - padX * 2;
  const plotH = h - padTop - padBottom;
  const barGap = 6;
  const barW = Math.max(4, (plotW / points.length) - barGap);
  const accent = getAccentColor();

  points.forEach((p, i) => {
    const val = p.y || 0;
    const barH = (val / max) * plotH;
    const x = padX + i * (plotW / points.length) + ((plotW / points.length) - barW) / 2;
    const y = padTop + plotH - barH;
    ctx.fillStyle = val > 0 ? accent : 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, y, barW, Math.max(barH, 2), 4);
    ctx.fill();
  });

  if (opts.labels && opts.labels.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(opts.labels[0], padX, h - padBottom + 6);
    ctx.textAlign = 'right';
    ctx.fillText(opts.labels[opts.labels.length - 1], w - padX, h - padBottom + 6);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function shortLabel(ds) {
  const d = parseDateStr(ds);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function drawScoreChart(range) {
  const points = range.map(ds => {
    const day = getDayReadonly(ds);
    const s = computeScore(day);
    return { y: s.pct };
  });
  drawLineChart('chartScore', 'chartScoreEmpty', points, { min: 0, max: 100, labels: [shortLabel(range[0]), shortLabel(range[range.length - 1])] });
}

function drawWaterChart(range) {
  const points = range.map(ds => {
    const day = getDayReadonly(ds);
    return { y: day && day.water > 0 ? roundTo(day.water / 1000, 2) : null };
  });
  drawLineChart('chartWater', 'chartWaterEmpty', points, { min: 0, labels: [shortLabel(range[0]), shortLabel(range[range.length - 1])] });
}

function drawWeightChart(range) {
  const points = range.map(ds => {
    const day = getDayReadonly(ds);
    return { y: day && day.weight !== null ? day.weight : null };
  });
  drawLineChart('chartWeight', 'chartWeightEmpty', points, { labels: [shortLabel(range[0]), shortLabel(range[range.length - 1])] });
}

function drawWorkoutsChart(range) {
  // group by week (chunks of 7, aligned to the range end)
  const weeks = [];
  for (let i = 0; i < range.length; i += 7) {
    weeks.push(range.slice(i, i + 7));
  }
  const points = weeks.map(week => {
    let count = 0;
    for (const ds of week) {
      const day = getDayReadonly(ds);
      if (day && day.tasks.some(t => t.category === 'trening' && t.done)) count++;
    }
    return { y: count };
  });
  drawBarChart('chartWorkouts', 'chartWorkoutsEmpty', points, { labels: weeks.length > 1 ? [shortLabel(weeks[0][0]), shortLabel(weeks[weeks.length - 1][weeks[weeks.length - 1].length - 1])] : [] });
}

/* ============================================================
   RENDER: SETTINGS
   ============================================================ */

function renderSettings() {
  const s = STATE.settings;
  document.getElementById('setWaterGoal').value = s.waterGoal;
  document.getElementById('setCalGoal').value = s.calGoal;
  document.getElementById('setProteinGoal').value = s.proteinGoal;
  document.getElementById('setStreakThreshold').value = s.streakThreshold;
  document.getElementById('setUnits').value = s.units;
  document.getElementById('setAccent').value = s.accent;

  renderTemplateSettingsList();
}

function renderTemplateSettingsList() {
  const list = document.getElementById('templateSettingsList');
  list.innerHTML = '';
  for (const tpl of STATE.templates) {
    const row = document.createElement('li');
    row.className = 'template-row';
    row.innerHTML = `
      <div>
        <div class="template-row-name">${escapeHtml(tpl.name)}</div>
        <div class="template-row-count">${tpl.tasks.length} zadań</div>
      </div>
      <button class="template-row-del" data-id="${tpl.id}" aria-label="Usuń szablon">✕</button>
    `;
    list.appendChild(row);
  }
}

document.getElementById('templateSettingsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.template-row-del');
  if (!btn) return;
  STATE.templates = STATE.templates.filter(t => t.id !== btn.dataset.id);
  saveState();
  renderTemplateSettingsList();
  toast('Szablon usunięty');
});

function bindSetting(id, key, transform) {
  document.getElementById(id).addEventListener('change', (e) => {
    let val = e.target.value;
    if (transform) val = transform(val);
    STATE.settings[key] = val;
    saveState();
    if (key === 'accent') applyAccent();
    renderToday();
  });
}

bindSetting('setWaterGoal', 'waterGoal', v => clamp(Number(v) || 0.1, 0.1, 20));
bindSetting('setCalGoal', 'calGoal', v => clamp(Math.round(Number(v)) || 0, 0, 15000));
bindSetting('setProteinGoal', 'proteinGoal', v => clamp(Math.round(Number(v)) || 0, 0, 1000));
bindSetting('setStreakThreshold', 'streakThreshold', v => clamp(Math.round(Number(v)) || 60, 1, 100));
bindSetting('setUnits', 'units');
bindSetting('setAccent', 'accent');

function applyAccent() {
  document.documentElement.setAttribute('data-accent', STATE.settings.accent);
}

/* -------- new template -------- */

document.getElementById('addTemplateBtn').addEventListener('click', () => {
  document.getElementById('newTemplateName').value = '';
  openModal(document.getElementById('newTemplateModal'));
});
document.getElementById('newTemplateCancelBtn').addEventListener('click', closeModals);

document.getElementById('newTemplateSaveBtn').addEventListener('click', () => {
  const name = document.getElementById('newTemplateName').value.trim();
  if (!name) { toast('Podaj nazwę szablonu'); return; }
  const day = ensureDay(currentDate);
  if (day.tasks.length === 0) { toast('Bieżący dzień nie ma zadań'); return; }
  const tasks = day.tasks.map(t => ({ name: t.name, category: t.category || null }));
  STATE.templates.push({ id: uid(), name, tasks });
  saveState();
  closeModals();
  renderTemplateSettingsList();
  toast('Szablon zapisany');
});

/* -------- export / import / reset -------- */

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prime-export-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Dane wyeksportowane');
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== 'object' || !parsed.days) {
        throw new Error('invalid structure');
      }
      STATE = mergeLoadedState(parsed);
      saveState();
      applyAccent();
      switchView(currentView);
      toast('Dane zaimportowane');
    } catch (err) {
      console.error(err);
      toast('Nieprawidłowy plik danych');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

let confirmCallback = null;
function openConfirm(title, text, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  confirmCallback = onConfirm;
  openModal(document.getElementById('confirmModal'));
}
document.getElementById('confirmCancelBtn').addEventListener('click', closeModals);
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  closeModals();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  openConfirm(
    'Zresetować wszystkie dane?',
    'Ta operacja usunie wszystkie zadania, cele, szablony i historię z tego urządzenia. Nie można jej cofnąć.',
    () => {
      STATE = defaultState();
      saveState();
      applyAccent();
      currentDate = todayStr();
      switchView('today');
      toast('Dane zresetowane');
    }
  );
});

/* ============================================================
   BOTTOM NAV
   ============================================================ */

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.target));
});

/* ============================================================
   INIT
   ============================================================ */

function init() {
  STATE = loadState();
  applyAccent();
  currentDate = todayStr();
  switchView('today');

  window.addEventListener('resize', () => {
    if (currentView === 'stats') renderStats();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline install not available on this origin */ });
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
