/* ============================================================
   TaskFlow Pro — app logic
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'taskflow.pro.v1';
  const DAY = 86400000;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const PRIORITIES = {
    1: { label: 'P1', name: 'Urgent', color: '#e5484d' },
    2: { label: 'P2', name: 'High', color: '#e8890c' },
    3: { label: 'P3', name: 'Medium', color: '#2f7bdc' },
    4: { label: 'P4', name: 'Low', color: '#8b8494' }
  };
  const PROJECT_COLORS = ['#6155f5', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#f97316', '#ec4899', '#a855f7', '#64748b'];
  const safeColor = (value) => (/^#[0-9a-f]{6}$/i.test(String(value)) ? value : PROJECT_COLORS[0]);
  const SORT_LABELS = { manual: 'Manual', due: 'Due date', priority: 'Priority', name: 'Name' };
  const VIEWS = ['inbox', 'today', 'upcoming', 'completed'];
  const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  /* ----------------------------------------------------------
     Dates
     ---------------------------------------------------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoOf(new Date());
  const parseISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const isoNum = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const dayDiff = (a, b) => Math.round((isoNum(a) - isoNum(b)) / DAY);
  const addDaysISO = (s, n) => {
    const [y, m, d] = s.split('-').map(Number);
    return isoOf(new Date(y, m - 1, d + n));
  };

  function fmtDue(iso) {
    const diff = dayDiff(iso, todayISO());
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    const d = parseISO(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtLongDate(iso) {
    return parseISO(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function fmtStamp(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function parseDateToken(raw) {
    const t = String(raw || '').toLowerCase().replace(/^@/, '');
    const today = todayISO();
    if (!t) return null;
    if (t === 'today' || t === 'tonight' || t === 'td') return today;
    if (t === 'tomorrow' || t === 'tmr' || t === 'tmrw') return addDaysISO(today, 1);
    if (t === 'yesterday') return addDaysISO(today, -1);
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
      const [y, m, d] = t.split('-').map(Number);
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) {
        return `${y}-${pad(m)}-${pad(d)}`;
      }
      return null;
    }
    let m = t.match(/^(?:in|\+)?(\d{1,3})\s*d(?:ays?)?$/);
    if (m) return addDaysISO(today, Number(m[1]));
    m = t.match(/^(?:in|\+)?(\d{1,2})\s*w(?:eeks?)?$/);
    if (m) return addDaysISO(today, Number(m[1]) * 7);
    const isNext = /^next-?/.test(t);
    const name = t.replace(/^next-?/, '').slice(0, 3);
    if (name in WEEKDAYS) {
      const target = WEEKDAYS[name];
      const current = parseISO(today).getDay();
      let delta = (target - current + 7) % 7;
      if (isNext) delta = delta === 0 ? 7 : delta;
      return addDaysISO(today, delta);
    }
    return null;
  }

  /* ----------------------------------------------------------
     Seed + persistence
     ---------------------------------------------------------- */

  function seedState() {
    const today = todayISO();
    const now = Date.now();
    const work = { id: 'p_work', name: 'Work', color: '#3b82f6' };
    const personal = { id: 'p_personal', name: 'Personal', color: '#6155f5' };
    const health = { id: 'p_health', name: 'Health', color: '#22c55e' };

    const task = (over) => Object.assign({
      id: uid(),
      title: '',
      notes: '',
      due: null,
      priority: null,
      projectId: null,
      tags: [],
      subtasks: [],
      done: false,
      completedAt: null,
      createdAt: now
    }, over);

    return {
      version: 1,
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      view: 'inbox',
      sort: 'manual',
      projects: [work, personal, health],
      tasks: [
        task({
          title: 'Review the Q4 launch plan',
          due: today,
          priority: 1,
          projectId: work.id,
          tags: ['launch'],
          notes: 'Focus on positioning and the rollout timeline.',
          subtasks: [
            { id: uid(), text: 'Read the brief', done: true },
            { id: uid(), text: 'Add feedback in the doc', done: false }
          ]
        }),
        task({ title: 'Send weekly status update', due: today, priority: 3, projectId: work.id }),
        task({
          title: 'Prepare 1:1 notes',
          due: addDaysISO(today, 1),
          priority: 2,
          projectId: work.id,
          subtasks: [
            { id: uid(), text: 'Wins from this week', done: false },
            { id: uid(), text: 'Blockers to raise', done: false }
          ]
        }),
        task({ title: 'Book dentist appointment', due: today, priority: 2, projectId: personal.id }),
        task({ title: 'Plan the weekend hike', due: addDaysISO(today, 2), projectId: personal.id, tags: ['weekend'], notes: 'Check the weather before Saturday.' }),
        task({ title: 'Read 20 pages', priority: 4, projectId: personal.id, tags: ['habit'] }),
        task({ title: 'Morning run — 5 km', due: today, priority: 3, projectId: health.id }),
        task({ title: 'Meditate for 10 minutes', projectId: health.id, done: true, completedAt: now - 3600000 }),
        task({ title: 'Meal prep for the week', due: addDaysISO(today, 3), priority: 4, projectId: health.id })
      ]
    };
  }

  function normalizeTask(t) {
    return {
      id: String(t.id),
      title: typeof t.title === 'string' ? t.title : 'Untitled task',
      notes: typeof t.notes === 'string' ? t.notes : '',
      due: typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
      priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : null,
      projectId: typeof t.projectId === 'string' ? t.projectId : null,
      tags: Array.isArray(t.tags) ? t.tags.filter((x) => typeof x === 'string').slice(0, 12) : [],
      subtasks: Array.isArray(t.subtasks) ? t.subtasks
        .filter((s) => s && typeof s.text === 'string')
        .map((s) => ({ id: String(s.id || uid()), text: s.text, done: !!s.done })) : [],
      done: !!t.done,
      completedAt: typeof t.completedAt === 'number' ? t.completedAt : (t.done ? Date.now() : null),
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now()
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.projects)) return seedState();
      return {
        version: 1,
        theme: parsed.theme === 'dark' ? 'dark' : 'light',
        view: typeof parsed.view === 'string' ? parsed.view : 'inbox',
        sort: Object.keys(SORT_LABELS).includes(parsed.sort) ? parsed.sort : 'manual',
        projects: parsed.projects
          .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
          .map((p) => ({ id: p.id, name: p.name, color: safeColor(p.color) })),
        tasks: parsed.tasks.filter((t) => t && typeof t.id === 'string').map(normalizeTask)
      };
    } catch (err) {
      return seedState();
    }
  }

  let state = loadState();
  const ui = {
    view: state.view,
    sort: state.sort,
    search: '',
    selectedId: null
  };
  let searchTimer = null;
  if (ui.view.startsWith('project:')) {
    const id = ui.view.slice(8);
    if (!state.projects.some((p) => p.id === id)) ui.view = 'inbox';
  } else if (!VIEWS.includes(ui.view)) {
    ui.view = 'inbox';
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      state.view = ui.view;
      state.sort = ui.sort;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* storage can be unavailable — the app still works in-memory */
    }
  }
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 220);
  }
  save();

  /* ----------------------------------------------------------
     Selectors
     ---------------------------------------------------------- */

  const currentTask = () => state.tasks.find((t) => t.id === ui.selectedId) || null;
  const activeTasks = () => state.tasks.filter((t) => !t.done);
  const activeForProject = (id) => state.tasks.filter((t) => !t.done && t.projectId === id).length;
  const projectById = (id) => state.projects.find((p) => p.id === id) || null;

  function sortTasks(list) {
    const copy = list.slice();
    if (ui.sort === 'due') {
      return copy.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      });
    }
    if (ui.sort === 'priority') {
      return copy.sort((a, b) => (a.priority || 9) - (b.priority || 9));
    }
    if (ui.sort === 'name') {
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }
    return copy;
  }

  function viewTasks() {
    const today = todayISO();
    const q = ui.search.trim().toLowerCase();
    let list;

    if (q) {
      list = state.tasks.slice();
    } else if (ui.view === 'today') {
      list = state.tasks.filter((t) => !t.done && t.due && t.due <= today);
    } else if (ui.view === 'upcoming') {
      list = state.tasks.filter((t) => !t.done && t.due && t.due > today);
    } else if (ui.view === 'completed') {
      list = state.tasks.filter((t) => t.done)
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    } else if (ui.view.startsWith('project:')) {
      const id = ui.view.slice(8);
      list = state.tasks.filter((t) => !t.done && t.projectId === id);
    } else {
      list = state.tasks.filter((t) => !t.done);
    }

    if (q) {
      list = list.filter((t) => {
        const project = projectById(t.projectId);
        const haystack = [t.title, t.notes, project ? project.name : '', ...t.tags, ...t.subtasks.map((s) => s.text)]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return ui.view === 'completed' && !q ? list : sortTasks(list);
  }

  function groupedTasks(list) {
    if (ui.search.trim()) return [{ label: null, tasks: list }];
    const today = todayISO();
    if (ui.view === 'today') {
      const overdue = list.filter((t) => t.due < today);
      const current = list.filter((t) => t.due === today);
      const groups = [];
      if (overdue.length) groups.push({ label: 'Overdue', tasks: overdue, danger: true });
      if (current.length) groups.push({ label: 'Today', tasks: current });
      return groups;
    }
    if (ui.view === 'upcoming') {
      const map = new Map();
      list.forEach((t) => {
        if (!map.has(t.due)) map.set(t.due, []);
        map.get(t.due).push(t);
      });
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([due, tasks]) => ({
          label: fmtDue(due),
          sub: parseISO(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          tasks
        }));
    }
    return [{ label: null, tasks: list }];
  }

  /* ----------------------------------------------------------
     Renderers
     ---------------------------------------------------------- */

  const taskListEl = $('#taskList');

  function priorityPill(priority) {
    const p = PRIORITIES[priority];
    if (!p) return '';
    return `<span class="prio" style="--pc:${p.color}" title="${p.name} priority">${ic('flag')}${p.label}</span>`;
  }

  function canDrag() {
    return ui.sort === 'manual' && !ui.search.trim() && ui.view !== 'completed';
  }

  function taskHTML(t) {
    const project = projectById(t.projectId);
    const subs = t.subtasks || [];
    const subsDone = subs.filter((s) => s.done).length;
    const overdue = !t.done && t.due && dayDiff(t.due, todayISO()) < 0;
    const dueToday = !t.done && t.due && dayDiff(t.due, todayISO()) === 0;
    const tags = t.tags || [];

    return `
      <article class="task${t.done ? ' is-done' : ''}${ui.selectedId === t.id ? ' is-selected' : ''}"
        data-id="${esc(t.id)}" draggable="${canDrag() ? 'true' : 'false'}">
        <button class="drag-handle" type="button" tabindex="-1" aria-hidden="true">${ic('grip')}</button>
        <button class="check" type="button" data-act="toggle" role="checkbox"
          aria-checked="${t.done}" aria-label="${t.done ? 'Mark incomplete' : 'Mark complete'}">${ic('check')}</button>
        <div class="task-body" data-act="open" role="button" tabindex="0" aria-label="Open ${esc(t.title)}">
          <div class="task-line">
            <span class="task-title">${esc(t.title)}</span>
            ${t.priority ? priorityPill(t.priority) : ''}
          </div>
          <div class="task-meta">
            ${t.due ? `<span class="chip due ${overdue ? 'overdue' : dueToday ? 'today' : ''}">${ic('calendar')}${esc(fmtDue(t.due))}</span>` : ''}
            ${project ? `<span class="chip project"><i class="dot" style="background:${esc(project.color)}"></i>${esc(project.name)}</span>` : ''}
            ${subs.length ? `<span class="chip subs">${ic('check-circle')}${subsDone}/${subs.length}</span>` : ''}
            ${tags.slice(0, 2).map((tag) => `<span class="chip tag">#${esc(tag)}</span>`).join('')}
            ${tags.length > 2 ? `<span class="chip">+${tags.length - 2}</span>` : ''}
            ${t.done && t.completedAt ? `<span class="chip">Completed ${esc(fmtStamp(t.completedAt))}</span>` : ''}
          </div>
        </div>
        <div class="task-end">
          <button class="icon-btn row-delete" type="button" data-act="delete" aria-label="Delete task" title="Delete">${ic('trash')}</button>
        </div>
      </article>`;
  }

  const EMPTY_ART = `
    <div class="empty-art" aria-hidden="true">
      <svg viewBox="0 0 132 132" fill="none">
        <circle cx="66" cy="66" r="50" fill="var(--accent-soft)" opacity=".75"/>
        <circle cx="66" cy="66" r="31" fill="var(--panel)" stroke="var(--line)"/>
        <path d="M52 66.5 61 75.5 80.5 55" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M66 2v9M66 121v9M2 66h9M121 66h9" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" opacity=".3"/>
        <circle cx="108" cy="26" r="3.4" fill="var(--accent)" opacity=".38"/>
        <circle cx="22" cy="104" r="2.6" fill="var(--accent)" opacity=".3"/>
        <circle cx="112" cy="106" r="2" fill="var(--accent)" opacity=".22"/>
      </svg>
    </div>`;

  function emptyStateHTML() {
    if (ui.search.trim()) {
      return `<div class="empty">
        ${EMPTY_ART}
        <h3>No matches for “${esc(ui.search.trim())}”</h3>
        <p>Try a different keyword, or clear the search to see everything again.</p>
        <button class="btn subtle" type="button" data-act="clear-search">Clear search</button>
      </div>`;
    }
    let title = 'Inbox zero, achieved.';
    let text = 'Nothing on your plate. Add a task, or enjoy the quiet.';
    let action = true;
    if (ui.view === 'today') {
      title = 'You’re all clear for today.';
      text = 'No tasks due today. Plan ahead, or take the win.';
    } else if (ui.view === 'upcoming') {
      title = 'Nothing on the horizon.';
      text = 'Schedule something and it will show up right here.';
    } else if (ui.view === 'completed') {
      title = 'No completed tasks yet.';
      text = 'Check something off and it will land here.';
      action = false;
    } else if (ui.view.startsWith('project:')) {
      const project = projectById(ui.view.slice(8));
      title = project ? `${project.name} is all clear.` : 'This project is empty.';
      text = 'Add the first task and get this project moving.';
    }
    return `<div class="empty">
      ${EMPTY_ART}
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${action ? `<button class="btn primary" type="button" data-act="new-task">${ic('plus')}Add a task</button>` : ''}
    </div>`;
  }

  function renderToolbar(list) {
    const count = list.length;
    const label = $('#taskCountLabel');
    if (count) {
      label.textContent = ui.search.trim()
        ? `${count} result${count === 1 ? '' : 's'}`
        : `${count} task${count === 1 ? '' : 's'}`;
    } else {
      label.textContent = '';
    }
    $('#sortLabel').textContent = SORT_LABELS[ui.sort];
    $$('#sortMenu [data-sort]').forEach((btn) => {
      btn.classList.toggle('checked', btn.dataset.sort === ui.sort);
    });
    const sortWrap = $('#sortBtn').closest('.popover-wrap');
    if (sortWrap) sortWrap.hidden = count === 0;
    const clearBtn = $('#clearCompletedBtn');
    clearBtn.hidden = !(ui.view === 'completed' && state.tasks.some((t) => t.done));
  }

  function renderList() {
    const list = viewTasks();
    renderToolbar(list);
    if (!list.length) {
      taskListEl.innerHTML = emptyStateHTML();
      return;
    }
    const groups = groupedTasks(list);
    taskListEl.innerHTML = groups.map((group) => `
      <section class="group">
        ${group.label ? `<header class="group-head${group.danger ? ' danger' : ''}">
          <h2>${esc(group.label)}</h2>
          ${group.sub ? `<span class="muted small">${esc(group.sub)}</span>` : ''}
          <span class="group-count">${group.tasks.length}</span>
        </header>` : ''}
        <div class="rows">${group.tasks.map(taskHTML).join('')}</div>
      </section>`).join('');
  }

  function renderSidebar() {
    const today = todayISO();
    const active = activeTasks();
    $('#count-inbox').textContent = active.length;
    $('#count-today').textContent = active.filter((t) => t.due && t.due <= today).length;
    $('#count-upcoming').textContent = active.filter((t) => t.due && t.due > today).length;
    $('#count-completed').textContent = state.tasks.filter((t) => t.done).length;

    $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === ui.view));

    const projects = state.projects;
    $('#projectList').innerHTML = projects.length
      ? projects.map((p) => {
        const openCount = activeForProject(p.id);
        const activeRow = ui.view === `project:${p.id}`;
        return `<div class="proj-row${activeRow ? ' active' : ''}">
          <button class="proj-btn" type="button" data-view="project:${esc(p.id)}">
            <i class="dot" style="background:${esc(p.color)}"></i>
            <span class="proj-name">${esc(p.name)}</span>
            <span class="count">${openCount || ''}</span>
          </button>
          <button class="icon-btn proj-edit" type="button" data-edit-project="${esc(p.id)}"
            aria-label="Edit ${esc(p.name)}" title="Edit project">${ic('more')}</button>
        </div>`;
      }).join('')
      : '<p class="proj-empty">No projects yet</p>';

    const todayTasks = state.tasks.filter((t) => t.due === today);
    const doneToday = todayTasks.filter((t) => t.done).length;
    const ratio = todayTasks.length ? doneToday / todayTasks.length : 0;
    const circumference = 2 * Math.PI * 18;
    const ring = $('#ringFg');
    ring.style.strokeDasharray = String(circumference);
    ring.style.strokeDashoffset = String(circumference * (1 - ratio));
    ring.style.opacity = ratio > 0 ? '1' : '0';
    $('#todayProgressText').textContent = todayTasks.length
      ? `${doneToday} of ${todayTasks.length} done`
      : 'Nothing due today';
  }

  function renderHeader() {
    const today = todayISO();
    const active = activeTasks();
    let title = 'Inbox';
    let subtitle = '';

    if (ui.view === 'inbox') {
      const dueToday = active.filter((t) => t.due === today).length;
      subtitle = active.length
        ? `${active.length} open task${active.length === 1 ? '' : 's'}${dueToday ? ` · ${dueToday} due today` : ''}`
        : 'A clean slate. Add something to get started.';
    } else if (ui.view === 'today') {
      title = 'Today';
      const todays = state.tasks.filter((t) => t.due === today);
      const done = todays.filter((t) => t.done).length;
      subtitle = `${fmtLongDate(today)}${todays.length ? ` · ${done} of ${todays.length} done` : ''}`;
    } else if (ui.view === 'upcoming') {
      title = 'Upcoming';
      const count = active.filter((t) => t.due && t.due > today).length;
      subtitle = count ? `${count} scheduled task${count === 1 ? '' : 's'} ahead` : 'Everything on the horizon, in one place.';
    } else if (ui.view === 'completed') {
      title = 'Completed';
      const done = state.tasks.filter((t) => t.done).length;
      subtitle = done ? `${done} task${done === 1 ? '' : 's'} finished. Nice work.` : 'Finished tasks collect here.';
    } else if (ui.view.startsWith('project:')) {
      const project = projectById(ui.view.slice(8));
      title = project ? project.name : 'Project';
      if (project) {
        const open = activeForProject(project.id);
        const done = state.tasks.filter((t) => t.projectId === project.id && t.done).length;
        subtitle = `${open} open · ${done} done`;
      }
    }

    if (ui.search.trim()) subtitle = `Searching for “${ui.search.trim()}”`;

    $('#viewTitle').textContent = title;
    $('#viewSubtitle').textContent = subtitle;
    document.title = `${title} · TaskFlow Pro`;
  }

  function refresh() {
    renderSidebar();
    renderHeader();
    renderList();
  }

  /* ----------------------------------------------------------
     Theme, toast, confetti
     ---------------------------------------------------------- */

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#101014' : '#f4f3f0');
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
  }

  function toast(message, options = {}) {
    const { action = '', onAction = null, tone = 'default', duration = 4800 } = options;
    const layer = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    const icon = tone === 'danger' ? 'trash' : tone === 'success' ? 'check-circle' : 'sparkles';
    el.innerHTML = `
      <span class="toast-icon">${ic(icon)}</span>
      <span class="toast-msg">${esc(message)}</span>
      ${action ? `<button class="toast-action" type="button">${esc(action)}</button>` : ''}`;
    const remove = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    };
    let timer = setTimeout(remove, duration);
    if (action && onAction) {
      el.querySelector('.toast-action').addEventListener('click', () => {
        clearTimeout(timer);
        remove();
        onAction();
      });
    }
    layer.appendChild(el);
    while (layer.children.length > 3) layer.firstElementChild.remove();
  }

  function confettiBurst(x, y) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = $('#confetti');
    const colors = ['#6155f5', '#8b7dff', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6'];
    for (let i = 0; i < 16; i++) {
      const bit = document.createElement('i');
      bit.className = 'confetti-bit';
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const distance = 26 + Math.random() * 46;
      bit.style.left = `${x}px`;
      bit.style.top = `${y}px`;
      bit.style.background = colors[i % colors.length];
      bit.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      bit.style.setProperty('--y', `${Math.sin(angle) * distance - 12}px`);
      bit.style.setProperty('--r', `${Math.random() * 420 - 210}deg`);
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), 800);
    }
  }

  /* ----------------------------------------------------------
     Task actions
     ---------------------------------------------------------- */

  function createTask(data) {
    const task = {
      id: uid(),
      title: (data.title || '').trim().slice(0, 200) || 'Untitled task',
      notes: (data.notes || '').trim(),
      due: data.due || null,
      priority: data.priority || null,
      projectId: data.projectId || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
      done: false,
      completedAt: null,
      createdAt: Date.now()
    };
    state.tasks.unshift(task);
    if (ui.view === 'completed') ui.view = 'inbox';
    if (ui.search.trim()) {
      clearTimeout(searchTimer);
      searchTimer = null;
      ui.search = '';
      $('#searchInput').value = '';
      syncSearchClear();
    }
    save();
    refresh();
    return task;
  }

  function taskVisibleInView(task) {
    const today = todayISO();
    if (ui.view === 'completed') return !!task.done;
    if (task.done) return false;
    if (ui.view === 'today') return !!(task.due && task.due <= today);
    if (ui.view === 'upcoming') return !!(task.due && task.due > today);
    if (ui.view.startsWith('project:')) return task.projectId === ui.view.slice(8);
    return true;
  }

  function announceAdded(task) {
    if (taskVisibleInView(task)) {
      toast('Task added', { tone: 'success' });
      return;
    }
    const today = todayISO();
    const target = task.due
      ? (task.due <= today ? 'today' : 'upcoming')
      : (task.projectId && projectById(task.projectId) ? `project:${task.projectId}` : 'inbox');
    const label = target === 'today'
      ? 'Today'
      : target === 'upcoming'
        ? 'Upcoming'
        : target.startsWith('project:')
          ? (projectById(task.projectId)?.name || 'project')
          : 'Inbox';
    toast(`Added to ${label}`, {
      tone: 'success',
      action: 'View',
      onAction: () => setView(target)
    });
  }

  function toggleTask(id, sourceEl) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    const wasDone = task.done;
    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : null;

    if (task.done && sourceEl) {
      const rect = sourceEl.getBoundingClientRect();
      confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    save();
    refresh();
    if (ui.selectedId === id) {
      const btn = $('#drawerCheck');
      if (btn) btn.setAttribute('aria-checked', String(!!task.done));
      $('#drawerTitle').classList.toggle('is-done', !!task.done);
      updateDrawerMeta(task);
    }

    if (!wasDone) {
      toast('Task completed', {
        tone: 'success',
        action: 'Undo',
        onAction: () => {
          task.done = false;
          task.completedAt = null;
          save();
          refresh();
          if (ui.selectedId === id) {
            const btn = $('#drawerCheck');
            if (btn) btn.setAttribute('aria-checked', 'false');
            $('#drawerTitle').classList.remove('is-done');
          }
        }
      });
    } else {
      toast('Task reopened', {
        action: 'Undo',
        onAction: () => {
          task.done = true;
          task.completedAt = Date.now();
          save();
          refresh();
        }
      });
    }
  }

  function deleteTask(id) {
    const index = state.tasks.findIndex((t) => t.id === id);
    if (index < 0) return;
    const snapshot = clone(state.tasks[index]);
    state.tasks.splice(index, 1);
    if (ui.selectedId === id) closeDrawer();
    save();
    refresh();
    toast('Task deleted', {
      tone: 'danger',
      action: 'Undo',
      onAction: () => {
        state.tasks.splice(Math.min(index, state.tasks.length), 0, snapshot);
        save();
        refresh();
      }
    });
  }

  function reorderTask(dragId, targetId, after) {
    const from = state.tasks.findIndex((t) => t.id === dragId);
    if (from < 0) return;
    const [item] = state.tasks.splice(from, 1);
    if (!targetId) {
      state.tasks.push(item);
    } else {
      let to = state.tasks.findIndex((t) => t.id === targetId);
      if (to < 0) {
        state.tasks.push(item);
      } else {
        if (after) to += 1;
        state.tasks.splice(to, 0, item);
      }
    }
    save();
    renderList();
  }

  function clearDropIndicators() {
    $$('#taskList .task').forEach((row) => row.classList.remove('drop-before', 'drop-after', 'is-dragging'));
  }

  /* ----------------------------------------------------------
     Quick add
     ---------------------------------------------------------- */

  function normalizeName(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function quickDefaults() {
    const defaults = { due: null, projectId: null };
    if (ui.view === 'today') defaults.due = todayISO();
    if (ui.view === 'upcoming') defaults.due = addDaysISO(todayISO(), 1);
    if (ui.view.startsWith('project:')) defaults.projectId = ui.view.slice(8);
    return defaults;
  }

  function parseQuick(raw) {
    const words = String(raw).trim().split(/\s+/).filter(Boolean);
    const kept = [];
    let priority = null;
    let due = null;
    let projectId = null;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (/^!p?[1-4]$/i.test(word)) {
        priority = Number(word.slice(-1));
        continue;
      }
      if (/^@/.test(word) && word.length > 1) {
        let token = word.slice(1);
        // support "@in 3 days" and "@in 2 weeks"
        if (/^(in|\+)$/i.test(token) && words[i + 1] && /^\d+$/.test(words[i + 1])) {
          const unit = words[i + 2] || 'days';
          if (/^(d|day|days)$/i.test(unit)) {
            due = addDaysISO(todayISO(), Number(words[i + 1]));
            i += 2;
            continue;
          }
          if (/^(w|week|weeks)$/i.test(unit)) {
            due = addDaysISO(todayISO(), Number(words[i + 1]) * 7);
            i += 2;
            continue;
          }
        }
        const parsed = parseDateToken(token);
        if (parsed) {
          due = parsed;
          continue;
        }
      }
      if (/^#/.test(word) && word.length > 1) {
        const name = normalizeName(word.slice(1));
        const project = state.projects.find((p) => normalizeName(p.name) === name);
        if (project) {
          projectId = project.id;
          continue;
        }
      }
      kept.push(word);
    }

    return { title: kept.join(' ').trim(), priority, due, projectId };
  }

  function updateQuickPreview() {
    const preview = $('#qaPreview');
    const input = $('#quickInput');
    const raw = input.value;
    if (!raw.trim()) {
      preview.innerHTML = '<span class="qa-hint">Try <code>@tomorrow</code> · <code>!1</code> · <code>#Project</code></span>';
      return;
    }
    const parsed = parseQuick(raw);
    const defaults = quickDefaults();
    const due = parsed.due || defaults.due;
    const projectId = parsed.projectId || defaults.projectId;
    const project = projectById(projectId);
    const chips = [];
    if (due) chips.push(`<span class="chip due">${ic('calendar')}${esc(fmtDue(due))}</span>`);
    if (parsed.priority) chips.push(priorityPill(parsed.priority));
    if (project) chips.push(`<span class="chip project"><i class="dot" style="background:${esc(project.color)}"></i>${esc(project.name)}</span>`);
    preview.innerHTML = chips.length
      ? chips.join('')
      : '<span class="qa-hint">Press Enter to add</span>';
  }

  /* ----------------------------------------------------------
     Drawer
     ---------------------------------------------------------- */

  function projectOptions(selectedId) {
    return `<option value="">No project</option>` + state.projects.map((p) =>
      `<option value="${esc(p.id)}"${p.id === selectedId ? ' selected' : ''}>${esc(p.name)}</option>`
    ).join('');
  }

  function renderDrawerSubs() {
    const task = currentTask();
    if (!task) return;
    const subs = task.subtasks || [];
    $('#subtaskCount').textContent = subs.length ? `${subs.filter((s) => s.done).length}/${subs.length}` : '';
    $('#drawerSubtasks').innerHTML = subs.map((sub) => `
      <li class="subtask${sub.done ? ' done' : ''}" data-sid="${esc(sub.id)}">
        <button class="check small" type="button" role="checkbox" aria-checked="${sub.done}"
          data-sub-toggle aria-label="${sub.done ? 'Mark incomplete' : 'Mark complete'}">${ic('check')}</button>
        <input class="subtask-input" type="text" value="${esc(sub.text)}" data-sub-input maxlength="160" aria-label="Subtask">
        <button class="icon-btn sub-delete" type="button" data-sub-delete aria-label="Delete subtask">${ic('x')}</button>
      </li>`).join('');
  }

  function renderDrawerTags() {
    const task = currentTask();
    if (!task) return;
    $('#drawerTags').innerHTML = task.tags.map((tag) => `
      <span class="tag-chip">#${esc(tag)}
        <button type="button" data-remove-tag="${esc(tag)}" aria-label="Remove ${esc(tag)}">${ic('x')}</button>
      </span>`).join('') +
      '<input id="tagInput" class="tag-input" type="text" placeholder="Add tag…" maxlength="24" aria-label="Add tag">';
  }

  function updateDrawerMeta(task) {
    const bits = [`Created ${fmtStamp(task.createdAt)}`];
    if (task.done && task.completedAt) bits.push(`Completed ${fmtStamp(task.completedAt)}`);
    if (task.subtasks.length) bits.push(`${task.subtasks.filter((s) => s.done).length} of ${task.subtasks.length} subtasks`);
    $('#drawerMeta').textContent = bits.join('  ·  ');
  }

  function syncDrawer() {
    const task = currentTask();
    if (!task) return;
    $('#drawerTitle').value = task.title;
    $('#drawerTitle').classList.toggle('is-done', !!task.done);
    $('#drawerNotes').value = task.notes || '';
    $('#drawerDue').value = task.due || '';
    $('#drawerProject').innerHTML = projectOptions(task.projectId);
    const check = $('#drawerCheck');
    check.setAttribute('aria-checked', String(!!task.done));
    $$('#drawerPriority [data-prio]').forEach((btn) => {
      btn.classList.toggle('active', String(task.priority || 0) === btn.dataset.prio);
    });
    const today = todayISO();
    $$('#quickDates [data-quick-due]').forEach((btn) => {
      const key = btn.dataset.quickDue;
      const active = key === 'none'
        ? !task.due
        : key === 'today'
          ? task.due === today
          : key === 'tomorrow'
            ? task.due === addDaysISO(today, 1)
            : task.due === addDaysISO(today, 7);
      btn.classList.toggle('active', active);
    });
    renderDrawerSubs();
    renderDrawerTags();
    updateDrawerMeta(task);
  }

  function openDrawer(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    ui.selectedId = id;
    syncDrawer();
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerScrim').classList.add('show');
    document.body.classList.add('drawer-open');
    const body = $('.drawer-body');
    if (body) body.scrollTop = 0;
    renderList();
  }

  function closeDrawer() {
    ui.selectedId = null;
    if ($('#drawer').contains(document.activeElement)) document.activeElement.blur();
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#drawerScrim').classList.remove('show');
    document.body.classList.remove('drawer-open');
    save();
    renderList();
  }

  function setDrawerDue(value) {
    const task = currentTask();
    if (!task) return;
    const today = todayISO();
    if (value === 'none') task.due = null;
    else if (value === 'today') task.due = today;
    else if (value === 'tomorrow') task.due = addDaysISO(today, 1);
    else if (value === 'week') task.due = addDaysISO(today, 7);
    save();
    syncDrawer();
    refresh();
  }

  function addTagFromInput() {
    const task = currentTask();
    const input = $('#tagInput');
    if (!task || !input) return;
    const value = input.value.trim().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 24);
    if (!value) return;
    if (!task.tags.includes(value)) task.tags.push(value);
    input.value = '';
    save();
    renderDrawerTags();
    renderList();
    const next = $('#tagInput');
    if (next) next.focus();
  }

  /* ----------------------------------------------------------
     Navigation + search + sorting
     ---------------------------------------------------------- */

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#scrim').classList.add('show');
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#scrim').classList.remove('show');
  }

  function setView(view) {
    if (view === ui.view) {
      if (ui.search.trim()) clearSearch();
      return;
    }
    ui.view = view;
    ui.search = '';
    clearTimeout(searchTimer);
    searchTimer = null;
    $('#searchInput').value = '';
    syncSearchClear();
    save();
    refresh();
    updateQuickPreview();
    if (window.innerWidth <= 900) closeSidebar();
    const content = $('#content');
    if (content) content.scrollTop = 0;
  }

  function clearSearch() {
    clearTimeout(searchTimer);
    searchTimer = null;
    ui.search = '';
    $('#searchInput').value = '';
    syncSearchClear();
    refresh();
  }

  function syncSearchClear() {
    const button = $('#searchClear');
    if (button) button.hidden = !$('#searchInput').value;
  }

  /* ----------------------------------------------------------
     Menus + modals
     ---------------------------------------------------------- */

  function closeMenus() {
    $$('.menu').forEach((menu) => { menu.hidden = true; });
  }

  function openModal(id) {
    const wrap = document.getElementById(id);
    if (!wrap) return;
    closeMenus();
    $$('.modal-wrap.open').forEach((other) => {
      if (other.id !== id) {
        other.classList.remove('open');
        other.hidden = true;
      }
    });
    wrap.hidden = false;
    requestAnimationFrame(() => wrap.classList.add('open'));
  }

  function closeModal(id) {
    const wrap = document.getElementById(id);
    if (!wrap || wrap.hidden) return;
    if (wrap.contains(document.activeElement)) document.activeElement.blur();
    wrap.classList.remove('open');
    setTimeout(() => {
      if (!wrap.classList.contains('open')) wrap.hidden = true;
    }, 190);
  }

  let confirmResolver = null;
  function resolveConfirm(value) {
    if (confirmResolver) {
      const resolver = confirmResolver;
      confirmResolver = null;
      resolver(value);
    }
  }
  function closeConfirm(value) {
    closeModal('confirmModalWrap');
    resolveConfirm(value);
  }
  function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = true }) {
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    const ok = $('#confirmOk');
    ok.textContent = confirmLabel;
    ok.className = `btn ${danger ? 'danger' : 'primary'}`;
    openModal('confirmModalWrap');
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  function trapFocus(event) {
    const wrap = $('.modal-wrap.open');
    if (!wrap) return;
    const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', wrap)
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ----------------------------------------------------------
     New task + projects
     ---------------------------------------------------------- */

  let newTaskPriority = 0;
  let projectDraft = { id: null, color: PROJECT_COLORS[0] };

  function openTaskModal() {
    const form = $('#taskForm');
    form.reset();
    newTaskPriority = 0;
    $$('#ntPriority [data-prio]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.prio === '0');
    });
    const today = todayISO();
    let due = '';
    if (ui.view === 'today') due = today;
    if (ui.view === 'upcoming') due = addDaysISO(today, 1);
    $('#ntDue').value = due;
    const projectId = ui.view.startsWith('project:') ? ui.view.slice(8) : '';
    $('#ntProject').innerHTML = projectOptions(projectId);
    openModal('taskModalWrap');
    setTimeout(() => $('#ntTitle').focus(), 80);
  }

  function openProjectModal(id) {
    const project = id ? projectById(id) : null;
    projectDraft = {
      id: project ? project.id : null,
      color: project ? project.color : PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length]
    };
    $('#projectModalTitle').textContent = project ? 'Edit project' : 'New project';
    $('#pmName').value = project ? project.name : '';
    $('#pmDelete').hidden = !project;
    renderSwatches();
    openModal('projectModalWrap');
    setTimeout(() => $('#pmName').focus(), 80);
  }

  function renderSwatches() {
    $('#pmColors').innerHTML = PROJECT_COLORS.map((color) =>
      `<button type="button" class="swatch${color === projectDraft.color ? ' active' : ''}"
        data-color="${color}" style="--sw:${color}" aria-label="Choose color ${color}"></button>`
    ).join('');
  }

  /* ----------------------------------------------------------
     Data actions
     ---------------------------------------------------------- */

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taskflow-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast('Backup downloaded', { tone: 'success' });
  }

  async function clearCompleted() {
    const done = state.tasks.filter((t) => t.done);
    if (!done.length) {
      toast('No completed tasks to clear');
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear completed tasks?',
      message: `This removes ${done.length} finished task${done.length === 1 ? '' : 's'} from your workspace. You can undo right after.`,
      confirmLabel: 'Clear tasks'
    });
    if (!ok) return;
    const snapshot = clone(state.tasks);
    state.tasks = state.tasks.filter((t) => !t.done);
    save();
    refresh();
    toast(`${done.length} task${done.length === 1 ? '' : 's'} cleared`, {
      action: 'Undo',
      onAction: () => {
        state.tasks = snapshot;
        save();
        refresh();
      }
    });
  }

  async function resetAll() {
    const ok = await confirmDialog({
      title: 'Reset all data?',
      message: 'Every task and project will be permanently removed from this device. Export a backup first if you might want them back.',
      confirmLabel: 'Reset everything'
    });
    if (!ok) return;
    state.tasks = [];
    state.projects = [];
    ui.view = 'inbox';
    ui.search = '';
    ui.sort = 'manual';
    clearTimeout(searchTimer);
    searchTimer = null;
    $('#searchInput').value = '';
    syncSearchClear();
    closeDrawer();
    save();
    refresh();
    updateQuickPreview();
    toast('All data cleared');
  }

  /* ----------------------------------------------------------
     Wiring
     ---------------------------------------------------------- */

  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#newTaskBtn').addEventListener('click', openTaskModal);
  $('#addProjectBtn').addEventListener('click', () => openProjectModal(null));
  $('#helpBtn').addEventListener('click', () => openModal('helpModalWrap'));

  $('#menuBtn').addEventListener('click', openSidebar);
  $('#sidebarClose').addEventListener('click', closeSidebar);
  $('#scrim').addEventListener('click', closeSidebar);

  /* Quick add */
  $('#quickInput').addEventListener('input', updateQuickPreview);
  $('#quickForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#quickInput');
    const parsed = parseQuick(input.value);
    const defaults = quickDefaults();
    const title = parsed.title.trim();
    if (!title) {
      input.focus();
      return;
    }
    const added = createTask({
      title,
      due: parsed.due || defaults.due,
      priority: parsed.priority,
      projectId: parsed.projectId || defaults.projectId
    });
    if (!taskVisibleInView(added)) announceAdded(added);
    input.value = '';
    updateQuickPreview();
    input.focus();
  });

  /* View switching + project edit (delegated) */
  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      setView(viewButton.dataset.view);
      return;
    }
    const editButton = event.target.closest('[data-edit-project]');
    if (editButton) openProjectModal(editButton.dataset.editProject);
  });

  /* Task list */
  taskListEl.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-act]');
    const row = event.target.closest('.task');
    if (actionEl) {
      const action = actionEl.dataset.act;
      if (action === 'new-task') { openTaskModal(); return; }
      if (action === 'clear-search') { clearSearch(); return; }
      if (!row) return;
      if (action === 'toggle') { toggleTask(row.dataset.id, actionEl); return; }
      if (action === 'delete') { deleteTask(row.dataset.id); return; }
      if (action === 'open') { openDrawer(row.dataset.id); return; }
    }
    if (!row) return;
    if (event.target.closest('.drag-handle')) return;
    openDrawer(row.dataset.id);
  });

  taskListEl.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const body = event.target.closest('.task-body');
    if (body && event.target === body) {
      event.preventDefault();
      openDrawer(body.closest('.task').dataset.id);
    }
  });

  /* Drag & drop */
  let dragId = null;

  taskListEl.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.task');
    if (!row || !canDrag()) {
      event.preventDefault();
      return;
    }
    dragId = row.dataset.id;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', dragId); } catch (err) { /* ignore */ }
  });

  taskListEl.addEventListener('dragover', (event) => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const row = event.target.closest('.task');
    $$('#taskList .task').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    if (row && row.dataset.id !== dragId) {
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY > rect.top + rect.height / 2 ? 'drop-after' : 'drop-before');
    }
  });

  taskListEl.addEventListener('drop', (event) => {
    if (!dragId) return;
    event.preventDefault();
    const row = event.target.closest('.task');
    const dragged = dragId;
    dragId = null;
    clearDropIndicators();
    if (row && row.dataset.id !== dragged) {
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      reorderTask(dragged, row.dataset.id, after);
    } else if (!row) {
      reorderTask(dragged, null, true);
    }
  });

  taskListEl.addEventListener('dragend', () => {
    clearDropIndicators();
    dragId = null;
  });

  /* Drawer */
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBack').addEventListener('click', closeDrawer);
  $('#drawerDoneBtn').addEventListener('click', closeDrawer);
  $('#drawerScrim').addEventListener('click', closeDrawer);

  $('#drawerCheck').addEventListener('click', () => {
    const task = currentTask();
    if (task) toggleTask(task.id, $('#drawerCheck'));
  });

  $('#deleteTaskBtn').addEventListener('click', () => {
    const task = currentTask();
    if (task) deleteTask(task.id);
  });

  $('#drawerTitle').addEventListener('input', (event) => {
    const task = currentTask();
    if (!task) return;
    task.title = event.target.value;
    queueSave();
    const row = taskListEl.querySelector(`.task[data-id="${task.id}"] .task-title`);
    if (row) row.textContent = task.title || 'Untitled task';
  });

  $('#drawerTitle').addEventListener('blur', (event) => {
    const task = currentTask();
    if (!task) return;
    if (!event.target.value.trim()) {
      task.title = 'Untitled task';
      event.target.value = task.title;
    }
    save();
    refresh();
  });

  $('#drawerNotes').addEventListener('input', (event) => {
    const task = currentTask();
    if (!task) return;
    task.notes = event.target.value;
    queueSave();
  });

  $('#drawerDue').addEventListener('change', (event) => {
    const task = currentTask();
    if (!task) return;
    task.due = event.target.value || null;
    save();
    syncDrawer();
    refresh();
  });

  $('#drawerProject').addEventListener('change', (event) => {
    const task = currentTask();
    if (!task) return;
    task.projectId = event.target.value || null;
    save();
    refresh();
  });

  $('#drawerPriority').addEventListener('click', (event) => {
    const button = event.target.closest('[data-prio]');
    const task = currentTask();
    if (!button || !task) return;
    task.priority = Number(button.dataset.prio) || null;
    save();
    $$('#drawerPriority [data-prio]').forEach((btn) => {
      btn.classList.toggle('active', String(task.priority || 0) === btn.dataset.prio);
    });
    renderList();
  });

  $('#quickDates').addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick-due]');
    if (button) setDrawerDue(button.dataset.quickDue);
  });

  /* Subtasks + tags */
  $('#subtaskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const task = currentTask();
    const input = $('#subtaskInput');
    if (!task) return;
    const text = input.value.trim();
    if (!text) return;
    task.subtasks.push({ id: uid(), text, done: false });
    input.value = '';
    save();
    renderDrawerSubs();
    updateDrawerMeta(task);
    renderList();
  });

  $('#drawerSubtasks').addEventListener('click', (event) => {
    const task = currentTask();
    if (!task) return;
    const row = event.target.closest('.subtask');
    if (!row) return;
    const sub = task.subtasks.find((s) => s.id === row.dataset.sid);
    if (!sub) return;
    if (event.target.closest('[data-sub-toggle]')) {
      sub.done = !sub.done;
      save();
      renderDrawerSubs();
      updateDrawerMeta(task);
      renderList();
    } else if (event.target.closest('[data-sub-delete]')) {
      task.subtasks = task.subtasks.filter((s) => s.id !== sub.id);
      save();
      renderDrawerSubs();
      updateDrawerMeta(task);
      renderList();
    }
  });

  $('#drawerSubtasks').addEventListener('change', (event) => {
    const input = event.target.closest('[data-sub-input]');
    const task = currentTask();
    if (!input || !task) return;
    const row = input.closest('.subtask');
    const sub = task.subtasks.find((s) => s.id === row.dataset.sid);
    if (!sub) return;
    sub.text = input.value.trim() || 'Untitled subtask';
    input.value = sub.text;
    save();
  });

  $('#drawerSubtasks').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.closest('[data-sub-input]')) {
      event.preventDefault();
      event.target.blur();
    }
  });

  $('#drawerTags').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-tag]');
    const task = currentTask();
    if (!button || !task) return;
    task.tags = task.tags.filter((tag) => tag !== button.dataset.removeTag);
    save();
    renderDrawerTags();
    renderList();
  });

  $('#drawerTags').addEventListener('keydown', (event) => {
    if (event.target.id !== 'tagInput') return;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTagFromInput();
    } else if (event.key === 'Backspace' && !event.target.value) {
      const task = currentTask();
      if (task && task.tags.length) {
        task.tags.pop();
        save();
        renderDrawerTags();
        renderList();
        const next = $('#tagInput');
        if (next) next.focus();
      }
    }
  });

  $('#drawerTags').addEventListener('blur', (event) => {
    if (event.target.id === 'tagInput' && event.target.value.trim()) addTagFromInput();
  }, true);

  /* Search */
  $('#searchInput').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    const value = event.target.value;
    syncSearchClear();
    searchTimer = setTimeout(() => {
      ui.search = value;
      renderHeader();
      renderList();
    }, 110);
  });

  $('#searchClear').addEventListener('click', (event) => {
    event.preventDefault();
    clearSearch();
    $('#searchInput').focus();
  });

  /* Menus */
  $('#sortBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = $('#sortMenu');
    const willOpen = menu.hidden;
    closeMenus();
    menu.hidden = !willOpen;
  });

  $('#dataBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = $('#dataMenu');
    const willOpen = menu.hidden;
    closeMenus();
    menu.hidden = !willOpen;
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu') && !event.target.closest('[data-menu-trigger]')) closeMenus();
  });

  $('#sortMenu').addEventListener('click', (event) => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    ui.sort = button.dataset.sort;
    state.sort = ui.sort;
    save();
    closeMenus();
    refresh();
  });

  $('#dataMenu').addEventListener('click', (event) => {
    const item = event.target.closest('[data-action]');
    if (!item) return;
    closeMenus();
    const action = item.dataset.action;
    if (action === 'export') exportData();
    else if (action === 'import') $('#importFile').click();
    else if (action === 'clear-completed') clearCompleted();
    else if (action === 'reset') resetAll();
  });

  $('#clearCompletedBtn').addEventListener('click', clearCompleted);

  /* Modals */
  $$('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.closeModal));
  });

  $$('.modal-wrap').forEach((wrap) => {
    wrap.addEventListener('click', (event) => {
      if (event.target !== wrap) return;
      if (wrap.id === 'confirmModalWrap') closeConfirm(false);
      else closeModal(wrap.id);
    });
  });

  $('#ntPriority').addEventListener('click', (event) => {
    const button = event.target.closest('[data-prio]');
    if (!button) return;
    newTaskPriority = Number(button.dataset.prio) || 0;
    $$('#ntPriority [data-prio]').forEach((btn) => btn.classList.toggle('active', btn === button));
  });

  $('#taskForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#ntTitle').value.trim();
    if (!title) {
      $('#ntTitle').focus();
      return;
    }
    const added = createTask({
      title,
      notes: $('#ntNotes').value,
      due: $('#ntDue').value || null,
      priority: newTaskPriority || null,
      projectId: $('#ntProject').value || null
    });
    closeModal('taskModalWrap');
    announceAdded(added);
  });

  $('#pmColors').addEventListener('click', (event) => {
    const button = event.target.closest('[data-color]');
    if (!button) return;
    projectDraft.color = button.dataset.color;
    renderSwatches();
  });

  $('#projectForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#pmName').value.trim();
    if (!name) {
      $('#pmName').focus();
      return;
    }
    let createdId = null;
    if (projectDraft.id) {
      const project = projectById(projectDraft.id);
      if (project) {
        project.name = name;
        project.color = projectDraft.color;
      }
    } else {
      const project = { id: 'p' + uid(), name, color: projectDraft.color };
      state.projects.push(project);
      createdId = project.id;
    }
    closeModal('projectModalWrap');
    save();
    if (createdId) {
      setView('project:' + createdId);
      toast('Project created', { tone: 'success' });
    } else {
      refresh();
      toast('Project updated', { tone: 'success' });
    }
  });

  $('#pmDelete').addEventListener('click', async () => {
    const id = projectDraft.id;
    if (!id) return;
    const project = projectById(id);
    if (!project) return;
    const count = state.tasks.filter((t) => t.projectId === id).length;
    const ok = await confirmDialog({
      title: `Delete “${project.name}”?`,
      message: count
        ? `The project will be removed and ${count} task${count === 1 ? '' : 's'} will move to Inbox. The tasks themselves are kept.`
        : 'This project is empty. Deleting it cannot be undone.',
      confirmLabel: 'Delete project'
    });
    if (!ok) {
      openProjectModal(id);
      return;
    }
    state.projects = state.projects.filter((p) => p.id !== id);
    state.tasks.forEach((t) => { if (t.projectId === id) t.projectId = null; });
    if (ui.view === `project:${id}`) ui.view = 'inbox';
    closeModal('projectModalWrap');
    save();
    refresh();
    toast('Project deleted');
  });

  $('#confirmOk').addEventListener('click', () => closeConfirm(true));
  $('#confirmCancel').addEventListener('click', () => closeConfirm(false));

  /* Import */
  $('#importFile').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.projects)) throw new Error('Invalid backup');
      const ok = await confirmDialog({
        title: 'Import this backup?',
        message: `Your current workspace will be replaced with ${data.tasks.length} tasks and ${data.projects.length} projects from this file.`,
        confirmLabel: 'Import backup',
        danger: false
      });
      if (!ok) return;
      state.tasks = data.tasks.filter((t) => t && typeof t.id === 'string').map(normalizeTask);
      state.projects = data.projects
        .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
        .map((p) => ({ id: p.id, name: p.name, color: safeColor(p.color) }));
      state.theme = data.theme === 'dark' ? 'dark' : 'light';
      applyTheme();
      ui.view = 'inbox';
      ui.sort = 'manual';
      ui.search = '';
      clearTimeout(searchTimer);
      searchTimer = null;
      $('#searchInput').value = '';
      syncSearchClear();
      closeDrawer();
      save();
      refresh();
      updateQuickPreview();
      toast('Backup imported', { tone: 'success' });
    } catch (err) {
      toast('Could not read that file', { tone: 'danger' });
    }
  });

  /* Keyboard */
  let gPending = false;
  let gTimer = null;

  function escapeAction() {
    if ($('.menu:not([hidden])')) { closeMenus(); return; }
    if ($('#confirmModalWrap').classList.contains('open')) { closeConfirm(false); return; }
    const openModalEl = $('.modal-wrap.open');
    if (openModalEl) { closeModal(openModalEl.id); return; }
    if ($('#drawer').classList.contains('open')) { closeDrawer(); return; }
    if ($('#sidebar').classList.contains('open')) { closeSidebar(); return; }
    if (ui.search.trim()) {
      clearSearch();
      $('#searchInput').blur();
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      escapeAction();
      return;
    }
    if (event.key === 'Tab') {
      trapFocus(event);
      return;
    }

    const active = document.activeElement;
    const typing = active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
    if (typing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      openTaskModal();
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      $('#searchInput').focus();
      $('#searchInput').select();
      return;
    }
    if (event.key === '?') {
      event.preventDefault();
      openModal('helpModalWrap');
      return;
    }
    if (event.key === 'g' || event.key === 'G') {
      gPending = true;
      clearTimeout(gTimer);
      gTimer = setTimeout(() => { gPending = false; }, 900);
      return;
    }
    if (gPending) {
      gPending = false;
      clearTimeout(gTimer);
      if (event.key === 't' || event.key === 'T') setView('today');
      else if (event.key === 'c' || event.key === 'C') setView('completed');
      else if (event.key === 'i' || event.key === 'I') setView('inbox');
    }
  });

  /* ----------------------------------------------------------
     Init
     ---------------------------------------------------------- */

  applyTheme();
  $('#ntProject').innerHTML = projectOptions(null);
  refresh();
  updateQuickPreview();
  syncSearchClear();
})();
