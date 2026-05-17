// JobJot — SES job entry app
// Storage: config and jobs kept in separate localStorage keys so config can
// be shared across devices without affecting job data.

const CONFIG_KEY = 'jobjot.config.v1';
const JOBS_KEY = 'jobjot.jobs.v1';

// Versioned export envelope. Bump SCHEMA_VERSION when the on-disk shape
// changes; future imports can branch on `__version`. Old unwrapped exports
// (plain object / plain array) are still accepted as version 0.
const EXPORT_TYPE_CONFIG = 'jobjot.config';
const EXPORT_TYPE_JOBS = 'jobjot.jobs';
const SCHEMA_VERSION = 1;

const DROPDOWN_FIELDS = [
  { key: 'vehicles', label: 'Vehicles', singular: 'vehicle' },
  { key: 'crewMembers', label: 'Crew members', singular: 'crew member' },
  { key: 'roles', label: 'Roles', singular: 'role' },
  { key: 'jobTypes', label: 'Job types', singular: 'job type' },
  { key: 'equipment', label: 'Equipment', singular: 'equipment item' },
];

const ADD_NEW_SENTINEL = '__add_new__';

let config;
let jobs;
let editingJobId = null;
// Job created via "New job" but not yet persisted. Lives only in memory until
// the user touches a field; saveJobs() promotes it into the `jobs` array.
let pendingJob = null;

// ─── State ──────────────────────────────────────────────────────────────

function defaultConfig() {
  return {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
    listSort: 'date-desc',
    listFilter: 'all',
    vehicles: [],
    crewMembers: [''],
    roles: ['Driver'],
    jobTypes: ['Rescue'],
    equipment: [],
  };
}

function sanitizeConfig(c) {
  const base = defaultConfig();
  if (!c || typeof c !== 'object') return base;
  const out = { ...base, ...c };
  for (const f of DROPDOWN_FIELDS) {
    out[f.key] = Array.isArray(c[f.key])
      ? c[f.key]
          .filter((v) => typeof v === 'string' && v.trim())
          .map((v) => v.trim())
      : base[f.key];
  }
  if (out.theme !== 'dark' && out.theme !== 'light') out.theme = base.theme;
  return out;
}

function sanitizeJob(j) {
  if (!j || typeof j !== 'object') return null;
  return {
    id: typeof j.id === 'string' ? j.id : genId(),
    createdAt: typeof j.createdAt === 'number' ? j.createdAt : Date.now(),
    updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : Date.now(),
    jobNumber: typeof j.jobNumber === 'string' ? j.jobNumber : '',
    description: typeof j.description === 'string' ? j.description : '',
    vehicles: sanitizeVehicles(j),
    times: {
      enroute: j.times?.enroute || '',
      onScene: j.times?.onScene || '',
      jobClear: j.times?.jobClear || '',
      inStation: j.times?.inStation || '',
    },
    jobType: typeof j.jobType === 'string' ? j.jobType : '',
    notes: typeof j.notes === 'string' ? j.notes : '',
    equipment: Array.isArray(j.equipment)
      ? j.equipment
          .filter((e) => e && typeof e === 'object')
          .map((e) => ({
            equipment: typeof e.equipment === 'string' ? e.equipment : '',
            notes: typeof e.notes === 'string' ? e.notes : '',
          }))
      : [],
    entered: !!j.entered,
  };
}

function sanitizeVehicles(j) {
  if (!Array.isArray(j.vehicles)) return [];
  return j.vehicles
    .filter((v) => v && typeof v === 'object')
    .map((v) => ({
      vehicle: typeof v.vehicle === 'string' ? v.vehicle : '',
      crew: Array.isArray(v.crew)
        ? v.crew
            .filter((c) => c && typeof c === 'object')
            .map((c) => ({
              name: typeof c.name === 'string' ? c.name : '',
              role: typeof c.role === 'string' ? c.role : '',
            }))
        : [],
    }));
}

function genId() {
  return `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    config = raw ? sanitizeConfig(JSON.parse(raw)) : defaultConfig();
  } catch (_) {
    config = defaultConfig();
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function loadJobs() {
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    jobs = Array.isArray(arr) ? arr.map(sanitizeJob).filter(Boolean) : [];
  } catch (_) {
    jobs = [];
  }
  pruneEmptyRows();
}

// Remove unfinished rows (no primary value) from every job, so a half-added
// row doesn't survive a page reload. Empty crew rows inside otherwise valid
// vehicles are also dropped.
function pruneEmptyRows() {
  let changed = false;
  for (const j of jobs) {
    const beforeV = j.vehicles.length;
    j.vehicles = j.vehicles.filter((v) => v.vehicle);
    for (const v of j.vehicles) {
      const beforeC = v.crew.length;
      v.crew = v.crew.filter((c) => c.name);
      if (v.crew.length !== beforeC) changed = true;
    }
    if (j.vehicles.length !== beforeV) changed = true;

    const beforeE = j.equipment.length;
    j.equipment = j.equipment.filter((e) => e.equipment);
    if (j.equipment.length !== beforeE) changed = true;
  }
  if (changed) saveJobs();
}

function saveJobs() {
  // Promote a pending job on first persisted change.
  if (pendingJob) {
    jobs.unshift(pendingJob);
    pendingJob = null;
  }
  pruneEmptyRowsInPlace();
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

// Mutating prune without recursing into saveJobs. Used both at load and on
// every save so unfinished rows never persist.
function pruneEmptyRowsInPlace() {
  for (const j of jobs) {
    j.vehicles = j.vehicles.filter((v) => v.vehicle);
    for (const v of j.vehicles) {
      v.crew = v.crew.filter((c) => c.name);
    }
    j.equipment = j.equipment.filter((e) => e.equipment);
  }
}

function getJob(id) {
  if (pendingJob && pendingJob.id === id) return pendingJob;
  return jobs.find((j) => j.id === id);
}

function blankJob() {
  const now = Date.now();
  return {
    id: genId(),
    createdAt: now,
    updatedAt: now,
    jobNumber: '',
    description: '',
    vehicles: [],
    times: { enroute: '', onScene: '', jobClear: '', inStation: '' },
    jobType: '',
    notes: '',
    equipment: [],
    entered: false,
  };
}

// ─── Config option helpers ──────────────────────────────────────────────

function addConfigOption(fieldKey, value) {
  const v = (value || '').trim();
  if (!v) return null;
  const list = config[fieldKey];
  const existing = list.find((x) => x.toLowerCase() === v.toLowerCase());
  if (existing) return existing;
  list.push(v);
  list.sort((a, b) => a.localeCompare(b));
  saveConfig();
  return v;
}

function removeConfigOption(fieldKey, value) {
  config[fieldKey] = config[fieldKey].filter((x) => x !== value);
  saveConfig();
}

// Show a select that contains current options + "Add new…" sentinel.
// On change to sentinel, prompt for a new value, add it to config, select it.
function fillSelect(
  selectEl,
  fieldKey,
  currentValue,
  placeholder,
  excludeValues,
) {
  selectEl.innerHTML = '';
  const exclude = new Set(excludeValues || []);

  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholder || '— select —';
  selectEl.appendChild(placeholderOpt);

  for (const v of config[fieldKey]) {
    if (exclude.has(v) && v !== currentValue) continue;
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    if (v === currentValue) opt.selected = true;
    selectEl.appendChild(opt);
  }

  // If currentValue is not in list (e.g. imported config), keep it visible.
  if (currentValue && !config[fieldKey].includes(currentValue)) {
    const opt = document.createElement('option');
    opt.value = currentValue;
    opt.textContent = currentValue;
    opt.selected = true;
    selectEl.appendChild(opt);
  }

  const addOpt = document.createElement('option');
  addOpt.value = ADD_NEW_SENTINEL;
  addOpt.textContent = '+ Add new…';
  selectEl.appendChild(addOpt);
}

// Collect values used elsewhere in the job, excluding the current row.
function usedVehicleNames(job, exceptIdx) {
  return job.vehicles
    .map((v, i) => (i === exceptIdx ? null : v.vehicle))
    .filter(Boolean);
}

function usedCrewNames(job, exceptVehIdx, exceptCrewIdx) {
  const names = [];
  job.vehicles.forEach((v, vi) => {
    v.crew.forEach((c, ci) => {
      if (vi === exceptVehIdx && ci === exceptCrewIdx) return;
      if (c.name) names.push(c.name);
    });
  });
  return names;
}

function usedEquipmentNames(job, exceptIdx) {
  return job.equipment
    .map((e, i) => (i === exceptIdx ? null : e.equipment))
    .filter(Boolean);
}

// ─── Theme ──────────────────────────────────────────────────────────────

function applyTheme() {
  document.documentElement.setAttribute('data-theme', config.theme);
  const dark = config.theme === 'dark';
  document.getElementById('icon-sun').style.display = dark ? '' : 'none';
  document.getElementById('icon-moon').style.display = dark ? 'none' : '';
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  config.theme = config.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveConfig();
});

// ─── Views ──────────────────────────────────────────────────────────────

function showView(name) {
  document.getElementById('list-view').hidden = name !== 'list';
  document.getElementById('edit-view').hidden = name !== 'edit';
  document.getElementById('config-view').hidden = name !== 'config';
}

document.getElementById('config-toggle').addEventListener('click', () => {
  const configOpen = !document.getElementById('config-view').hidden;
  if (configOpen) {
    showView(editingJobId ? 'edit' : 'list');
    if (!editingJobId) renderList();
  } else {
    renderConfigView();
    showView('config');
  }
});

document.getElementById('config-back-btn').addEventListener('click', () => {
  showView('list');
  renderList();
});

document.getElementById('back-btn').addEventListener('click', async () => {
  // If the job was never persisted (user opened New job and did nothing),
  // discard silently with a toast rather than warning about missing fields.
  if (pendingJob) {
    pendingJob = null;
    editingJobId = null;
    showView('list');
    renderList();
    showToast('Empty job discarded');
    return;
  }

  const job = getJob(editingJobId);
  if (job && !job.jobNumber.trim()) {
    const ok = await showConfirm(
      'This job has no job number. Return to the list anyway?',
      {
        title: 'Missing job number',
        confirmLabel: 'Return',
      },
    );
    if (!ok) return;
  }
  editingJobId = null;
  showView('list');
  renderList();
});

document.getElementById('new-job-btn').addEventListener('click', () => {
  pendingJob = blankJob();
  editingJobId = pendingJob.id;
  renderEditView();
  showView('edit');
});

document.getElementById('delete-btn').addEventListener('click', async () => {
  if (!editingJobId) return;
  const ok = await showConfirm('Delete this job? This cannot be undone.', {
    title: 'Delete job',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  if (pendingJob && pendingJob.id === editingJobId) {
    pendingJob = null;
  } else {
    jobs = jobs.filter((j) => j.id !== editingJobId);
    saveJobs();
  }
  editingJobId = null;
  showView('list');
  renderList();
  showToast('Job deleted');
});

// ─── Modal helpers ──────────────────────────────────────────────────────
// Promise-based replacements for native alert/confirm/prompt, using the same
// visual modal pattern as the copy-vehicles dialog. Each call mounts its own
// DOM, focuses the primary input/button, and resolves on user interaction.

function buildModal({ title, body, actions, onMount }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    if (title) {
      const h = document.createElement('h3');
      h.textContent = title;
      modal.appendChild(h);
    }
    if (body) modal.appendChild(body);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'modal-actions';

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };

    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `small-btn ${a.className || 'secondary outline'}`;
      btn.textContent = a.label;
      btn.onclick = () =>
        close(typeof a.value === 'function' ? a.value() : a.value);
      actionsWrap.appendChild(btn);
      if (a.primary) btn.dataset.primary = '1';
    }
    modal.appendChild(actionsWrap);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') {
        const primary = modal.querySelector('button[data-primary="1"]');
        if (primary && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          primary.click();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(backdrop);
    if (onMount) onMount(modal, close);
  });
}

function showAlert(message, { title = '' } = {}) {
  const body = document.createElement('p');
  body.className = 'modal-sub';
  body.textContent = message;
  return buildModal({
    title,
    body,
    actions: [
      { label: 'OK', className: 'primary', primary: true, value: true },
    ],
    onMount: (m) => m.querySelector('button[data-primary="1"]')?.focus(),
  });
}

function showConfirm(
  message,
  { title = '', confirmLabel = 'OK', danger = false } = {},
) {
  const body = document.createElement('p');
  body.className = 'modal-sub';
  body.textContent = message;
  return buildModal({
    title,
    body,
    actions: [
      { label: 'Cancel', className: 'secondary outline', value: false },
      {
        label: confirmLabel,
        className: danger ? 'small-btn danger-btn' : 'primary',
        primary: true,
        value: true,
      },
    ],
    onMount: (m) => m.querySelector('button[data-primary="1"]')?.focus(),
  });
}

function showPrompt(
  message,
  { title = '', defaultValue = '', placeholder = '' } = {},
) {
  const body = document.createElement('div');
  if (message) {
    const p = document.createElement('p');
    p.className = 'modal-sub';
    p.textContent = message;
    body.appendChild(p);
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultValue;
  input.placeholder = placeholder;
  input.className = 'modal-input';
  body.appendChild(input);

  return buildModal({
    title,
    body,
    actions: [
      { label: 'Cancel', className: 'secondary outline', value: null },
      {
        label: 'OK',
        className: 'primary',
        primary: true,
        value: () => input.value,
      },
    ],
    onMount: () => {
      input.focus();
      input.select();
    },
  });
}

function showChoice(message, choices, { title = '' } = {}) {
  const body = document.createElement('p');
  body.className = 'modal-sub';
  body.textContent = message;
  const actions = choices.map((c) => ({
    label: c.label,
    className: c.danger
      ? 'small-btn danger-btn'
      : c.primary
        ? 'primary'
        : 'secondary outline',
    primary: !!c.primary,
    value: c.value,
  }));
  actions.unshift({
    label: 'Cancel',
    className: 'secondary outline',
    value: null,
  });
  return buildModal({
    title,
    body,
    actions,
    onMount: (m) => m.querySelector('button[data-primary="1"]')?.focus(),
  });
}

// ─── Toast ──────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ─── List rendering ─────────────────────────────────────────────────────

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtDateOnly(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtClock24(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDurationHr(mins) {
  if (mins < 0) mins = 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}hr ${m}m`;
  if (h) return `${h}hr`;
  return `${m}m`;
}

// Build the date/time line for a list card. Returns { text, ts, live }.
// `ts` is the canonical timestamp for sort + today badge. `live` = true when
// the line uses "now", so the list should refresh on a tick.
function listLineFor(job) {
  const offsets = computeDayOffsets(job);
  const baseDay = new Date(job.createdAt);
  baseDay.setHours(0, 0, 0, 0);
  const baseMs = baseDay.getTime();
  const MIN_MS = 60_000;

  const tsFor = (key) => {
    const v = job.times[key];
    if (!v) return null;
    const [h, m] = v.split(':').map(Number);
    return baseMs + (offsets[key] * 1440 + h * 60 + m) * MIN_MS;
  };

  const startKey = job.times.enroute
    ? 'enroute'
    : job.times.onScene
      ? 'onScene'
      : null;
  const endKey = job.times.inStation
    ? 'inStation'
    : job.times.jobClear
      ? 'jobClear'
      : null;

  if (!startKey && !endKey) {
    return { text: fmtDate(job.createdAt), ts: job.createdAt };
  }
  if (startKey && endKey) {
    const a = tsFor(startKey);
    const b = tsFor(endKey);
    const dur = fmtDurationHr(Math.round((b - a) / MIN_MS));
    return {
      text: `${fmtDateOnly(a)}, ${fmtClock24(a)} – ${fmtClock24(b)} (${dur})`,
      ts: a,
    };
  }
  if (startKey && !endKey) {
    const a = tsFor(startKey);
    const dur = fmtDurationHr(Math.round((Date.now() - a) / MIN_MS));
    return {
      text: `${fmtDateOnly(a)}, ${fmtClock24(a)} – now (${dur})`,
      ts: a,
      live: true,
    };
  }
  const b = tsFor(endKey);
  return { text: `${fmtDateOnly(b)}, ${fmtClock24(b)}`, ts: b };
}

// Pick best timestamp for list display.
// Priority: on-scene, enroute, creation. HH:MM picks combine with creation date.
function isToday(ts) {
  const d = new Date(ts);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function isJobComplete(j) {
  if (!j.jobNumber || !j.jobType) return false;
  if (j.vehicles.length === 0) return false;
  if (j.vehicles.some((v) => !v.vehicle || v.crew.length === 0)) return false;
  if (
    !j.times.enroute ||
    !j.times.onScene ||
    !j.times.jobClear ||
    !j.times.inStation
  )
    return false;
  return true;
}

function listDateFor(job) {
  // Sort key matches what listLineFor uses for the visible start time:
  // prefer enroute, fall back to onScene, then to creation.
  const pick = job.times.enroute || job.times.onScene;
  if (pick) {
    const [h, m] = pick.split(':').map(Number);
    const base = new Date(job.createdAt);
    base.setHours(h, m, 0, 0);
    return base.getTime();
  }
  return job.createdAt;
}

function applyListFilter(list) {
  switch (config.listFilter) {
    case 'incomplete':
      return list.filter((j) => !isJobComplete(j));
    case 'pending':
      return list.filter((j) => !j.entered);
    case 'entered':
      return list.filter((j) => j.entered);
    default:
      return list;
  }
}

function applyListSort(list) {
  const arr = [...list];
  switch (config.listSort) {
    case 'date-asc':
      return arr.sort((a, b) => listDateFor(a) - listDateFor(b));
    case 'number-asc':
      return arr.sort((a, b) =>
        (a.jobNumber || '').localeCompare(b.jobNumber || '', undefined, {
          numeric: true,
        }),
      );
    case 'number-desc':
      return arr.sort((a, b) =>
        (b.jobNumber || '').localeCompare(a.jobNumber || '', undefined, {
          numeric: true,
        }),
      );
    case 'date-desc':
    default:
      return arr.sort((a, b) => listDateFor(b) - listDateFor(a));
  }
}

let liveTickTimer = null;
let hasLiveCards = false;

function renderList() {
  const container = document.getElementById('jobs-container');
  container.innerHTML = '';
  hasLiveCards = false;

  const filtered = applyListFilter(jobs);
  const sorted = applyListSort(filtered);

  const emptyEl = document.getElementById('empty-msg');
  emptyEl.hidden = sorted.length > 0;
  if (sorted.length === 0) {
    emptyEl.textContent =
      jobs.length === 0
        ? 'No jobs yet. Tap "New job" to start.'
        : 'No jobs match this filter.';
  }

  for (const j of sorted) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('tabindex', '0');

    const body = document.createElement('div');
    body.className = 'job-card-body';

    const top = document.createElement('div');
    top.className = 'job-card-top';
    const num = document.createElement('span');
    num.className = 'job-card-number';
    num.textContent = j.jobNumber || '(no job number)';
    top.appendChild(num);

    const lineForBadges = listLineFor(j);
    if (isToday(lineForBadges.ts)) {
      const todayTag = document.createElement('span');
      todayTag.className = 'today-tag';
      todayTag.textContent = 'Today';
      top.appendChild(todayTag);
    }
    body.appendChild(top);

    if (j.jobType || j.description) {
      const sub = document.createElement('div');
      sub.className = 'job-card-sub';
      const parts = [];
      if (j.jobType) parts.push(j.jobType);
      if (j.description) parts.push(j.description);
      sub.textContent = parts.join(' · ');
      body.appendChild(sub);
    }

    if (j.notes) {
      const notes = document.createElement('div');
      notes.className = 'job-card-notes';
      notes.textContent = j.notes;
      body.appendChild(notes);
    }

    const date = document.createElement('div');
    date.className = 'job-card-date';
    const line = lineForBadges;
    if (line.live) hasLiveCards = true;
    const dateText = document.createElement('span');
    dateText.textContent = line.text;
    date.appendChild(dateText);
    body.appendChild(date);

    const pill = document.createElement('span');
    pill.className = `entered-pill${j.entered ? '' : ' not-entered'}`;
    pill.textContent = j.entered ? 'Entered' : 'Pending';

    card.appendChild(body);
    card.appendChild(pill);

    if (!isJobComplete(j)) {
      const incomplete = document.createElement('span');
      incomplete.className = 'incomplete-icon';
      incomplete.setAttribute('aria-label', 'Incomplete');
      incomplete.setAttribute('title', 'Incomplete');
      incomplete.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      card.appendChild(incomplete);
    }

    const open = () => {
      editingJobId = j.id;
      renderEditView();
      showView('edit');
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    container.appendChild(card);
  }

  // Refresh once a minute while any card shows a live "now" duration.
  if (liveTickTimer) {
    clearInterval(liveTickTimer);
    liveTickTimer = null;
  }
  if (hasLiveCards) {
    liveTickTimer = setInterval(() => {
      if (document.getElementById('list-view').hidden) return;
      renderList();
    }, 60_000);
  }
}

// ─── Edit view ──────────────────────────────────────────────────────────

function renderEditView() {
  const scroll = window.scrollY;
  const result = _renderEditViewInner();
  // Restore scroll on next paint so the user doesn't jump back to the top.
  requestAnimationFrame(() => window.scrollTo(0, scroll));
  return result;
}

function _renderEditViewInner() {
  const job = getJob(editingJobId);
  if (!job) {
    showView('list');
    return;
  }
  document.getElementById('incomplete-banner').hidden = isJobComplete(job);
  setWarnIcon(
    document.getElementById('label-jobNumber'),
    !job.jobNumber.trim(),
  );
  setWarnIcon(document.getElementById('label-jobType'), !job.jobType);
  setWarnIcon(
    document.getElementById('label-vehicles'),
    job.vehicles.length === 0 ||
      job.vehicles.some((v) => !v.vehicle || v.crew.length === 0),
  );

  document.getElementById('edit-title').textContent = job.jobNumber
    ? `Job ${job.jobNumber}`
    : 'New job';

  // Job number
  const numEl = document.getElementById('f-jobNumber');
  numEl.value = job.jobNumber;
  numEl.oninput = () => {
    job.jobNumber = numEl.value;
    job.updatedAt = Date.now();
    saveJobs();
    document.getElementById('edit-title').textContent = job.jobNumber
      ? `Job ${job.jobNumber}`
      : 'New job';
  };

  // Description
  const descEl = document.getElementById('f-description');
  descEl.value = job.description;
  descEl.oninput = () => {
    job.description = descEl.value;
    job.updatedAt = Date.now();
    saveJobs();
  };

  // Vehicles (each contains nested crew)
  renderVehicles(job);

  // Times (with now/clear button per field)
  renderTimes(job);

  // Job type
  const typeEl = document.getElementById('f-jobType');
  fillSelect(typeEl, 'jobTypes', job.jobType, '— select type —');
  typeEl.onchange = () =>
    handleSelectChange(typeEl, 'jobTypes', 'job type', (v) => {
      job.jobType = v;
      job.updatedAt = Date.now();
      saveJobs();
    });

  // Notes
  const notesEl = document.getElementById('f-notes');
  notesEl.value = job.notes;
  notesEl.oninput = () => {
    job.notes = notesEl.value;
    job.updatedAt = Date.now();
    saveJobs();
  };

  // Equipment rows (each row: dropdown + per-item notes)
  renderEquipmentRows(job);

  // Entered checkbox
  const enteredEl = document.getElementById('f-entered');
  enteredEl.checked = job.entered;
  enteredEl.onchange = () => {
    job.entered = enteredEl.checked;
    job.updatedAt = Date.now();
    saveJobs();
  };
}

// Handle the "+ Add new…" sentinel: prompt, add to config, re-render selects.
// `takenValues` (optional) blocks picking a value already used elsewhere in
// the job — defends against the "+ Add new" path being used to re-type a
// name that the exclusion list would otherwise hide.
async function handleSelectChange(
  selectEl,
  fieldKey,
  singularLabel,
  onPicked,
  takenValues,
) {
  const taken = new Set((takenValues || []).map((v) => v.toLowerCase()));

  if (selectEl.value === ADD_NEW_SENTINEL) {
    const input = await showPrompt(`Enter a new ${singularLabel}.`, {
      title: `New ${singularLabel}`,
      placeholder: singularLabel,
    });
    const trimmed = (input || '').trim();
    if (!trimmed) {
      renderEditView();
      return;
    }
    if (taken.has(trimmed.toLowerCase())) {
      await showAlert(`"${trimmed}" is already used in this job.`, {
        title: 'Duplicate',
      });
      renderEditView();
      return;
    }
    const added = addConfigOption(fieldKey, trimmed);
    if (added) onPicked(added);
    renderEditView();
    return;
  }

  if (selectEl.value && taken.has(selectEl.value.toLowerCase())) {
    await showAlert(`"${selectEl.value}" is already used in this job.`, {
      title: 'Duplicate',
    });
    renderEditView();
    return;
  }
  onPicked(selectEl.value);
}

const SVG_X_SMALL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const SVG_WARN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

// Toggle a warn icon on a label-bearing element. Pass the element that holds
// the label text (e.g. the span inside a <label>); the icon is appended after
// its text. Idempotent — removes any existing icon first.
function setWarnIcon(el, missing) {
  if (!el) return;
  const existing = el.querySelector(':scope > .warn-icon');
  if (existing) existing.remove();
  if (missing) {
    const span = document.createElement('span');
    span.className = 'warn-icon';
    span.setAttribute('aria-label', 'Required');
    span.setAttribute('title', 'Required');
    span.innerHTML = SVG_WARN;
    el.appendChild(span);
  }
}

const TIME_FIELDS = [
  { key: 'enroute', label: 'Enroute' },
  { key: 'onScene', label: 'On scene' },
  { key: 'jobClear', label: 'Job clear' },
  { key: 'inStation', label: 'In station' },
];

function currentTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function computeDayOffsets(job) {
  // Walk fields in order; each time that wraps below the previous bumps day.
  const offsets = {};
  let dayOffset = 0;
  let prevMins = null;
  for (const f of TIME_FIELDS) {
    const v = job.times[f.key];
    if (!v) {
      offsets[f.key] = dayOffset;
      continue;
    }
    const [h, m] = v.split(':').map(Number);
    const mins = h * 60 + m;
    if (prevMins !== null && mins < prevMins) dayOffset++;
    offsets[f.key] = dayOffset;
    prevMins = mins;
  }
  return offsets;
}

function totalMinutes(job, key, offsets) {
  const v = job.times[key];
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  return offsets[key] * 1440 + h * 60 + m;
}

function fmtDuration(mins) {
  if (mins < 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function renderTimes(job) {
  const wrap = document.getElementById('times-container');
  wrap.innerHTML = '';
  const offsets = computeDayOffsets(job);
  TIME_FIELDS.forEach((f, idx) => {
    const row = document.createElement('div');
    row.className = 'time-row';

    const label = document.createElement('label');
    label.className = 'time-label';
    label.htmlFor = `f-time-${f.key}`;
    label.textContent = f.label;
    if (!job.times[f.key]) {
      setWarnIcon(label, true);
    }
    const off = offsets[f.key];
    if (job.times[f.key] && off > 0) {
      const tag = document.createElement('span');
      tag.className = 'day-tag';
      tag.textContent = `+${off}d`;
      label.appendChild(tag);
    }

    const input = document.createElement('input');
    input.type = 'time';
    input.id = `f-time-${f.key}`;
    input.value = job.times[f.key] || '';
    input.onchange = () => {
      job.times[f.key] = input.value;
      job.updatedAt = Date.now();
      saveJobs();
      renderTimes(job);
    };

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'time-action-btn';
    const hasValue = !!job.times[f.key];
    if (hasValue) {
      btn.classList.add('clear');
      btn.setAttribute('aria-label', `Clear ${f.label}`);
      btn.innerHTML = SVG_X_SMALL;
      btn.onclick = async () => {
        const ok = await showConfirm(`Clear the "${f.label}" time?`, {
          title: 'Clear time',
          confirmLabel: 'Clear',
          danger: true,
        });
        if (!ok) return;
        job.times[f.key] = '';
        job.updatedAt = Date.now();
        saveJobs();
        renderTimes(job);
      };
    } else {
      btn.classList.add('now');
      btn.textContent = 'Now';
      btn.setAttribute('aria-label', `Set ${f.label} to now`);
      btn.onclick = () => {
        job.times[f.key] = currentTimeHHMM();
        job.updatedAt = Date.now();
        saveJobs();
        renderTimes(job);
      };
    }

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(btn);
    wrap.appendChild(row);

    // Duration between this row and the next, when both times are set.
    const next = TIME_FIELDS[idx + 1];
    if (next) {
      const a = totalMinutes(job, f.key, offsets);
      const b = totalMinutes(job, next.key, offsets);
      const duration = document.createElement('div');
      duration.className = 'time-duration';
      if (a !== null && b !== null && b >= a) {
        duration.textContent = fmtDuration(b - a);
      } else {
        duration.textContent = '';
        duration.classList.add('empty');
      }
      wrap.appendChild(duration);
    }
  });
}

function renderVehicles(job) {
  const wrap = document.getElementById('vehicles-container');
  wrap.innerHTML = '';

  if (job.vehicles.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'config-list-empty';
    empty.textContent = 'No vehicles yet. Tap "+ Add vehicle".';
    wrap.appendChild(empty);
    return;
  }

  job.vehicles.forEach((v, vIdx) => {
    const block = document.createElement('div');
    block.className = 'vehicle-block';

    // Header: vehicle dropdown + remove
    const header = document.createElement('div');
    header.className = 'vehicle-header';

    const vehSel = document.createElement('select');
    fillSelect(
      vehSel,
      'vehicles',
      v.vehicle,
      '— select vehicle —',
      usedVehicleNames(job, vIdx),
    );
    vehSel.onchange = () =>
      handleSelectChange(
        vehSel,
        'vehicles',
        'vehicle',
        (val) => {
          job.vehicles[vIdx].vehicle = val;
          job.updatedAt = Date.now();
          saveJobs();
        },
        usedVehicleNames(job, vIdx),
      );

    const rmVeh = document.createElement('button');
    rmVeh.className = 'secondary outline remove-btn';
    rmVeh.type = 'button';
    rmVeh.setAttribute('aria-label', 'Remove vehicle');
    rmVeh.innerHTML = SVG_X_SMALL;
    rmVeh.onclick = async () => {
      const isEmpty = !v.vehicle && v.crew.length === 0;
      if (!isEmpty) {
        const ok = await showConfirm('Remove this vehicle and its crew?', {
          title: 'Remove vehicle',
          confirmLabel: 'Remove',
          danger: true,
        });
        if (!ok) return;
      }
      job.vehicles.splice(vIdx, 1);
      job.updatedAt = Date.now();
      saveJobs();
      renderEditView();
    };

    header.appendChild(vehSel);
    header.appendChild(rmVeh);
    block.appendChild(header);

    // Crew rows
    const crewWrap = document.createElement('div');
    crewWrap.className = 'crew-wrap';

    v.crew.forEach((c, cIdx) => {
      const row = document.createElement('div');
      row.className = 'crew-row';

      const nameSel = document.createElement('select');
      fillSelect(
        nameSel,
        'crewMembers',
        c.name,
        '— name —',
        usedCrewNames(job, vIdx, cIdx),
      );
      nameSel.onchange = () =>
        handleSelectChange(
          nameSel,
          'crewMembers',
          'crew member',
          (val) => {
            job.vehicles[vIdx].crew[cIdx].name = val;
            job.updatedAt = Date.now();
            saveJobs();
          },
          usedCrewNames(job, vIdx, cIdx),
        );

      const roleSel = document.createElement('select');
      fillSelect(roleSel, 'roles', c.role, '— role —');
      roleSel.onchange = () =>
        handleSelectChange(roleSel, 'roles', 'role', (val) => {
          job.vehicles[vIdx].crew[cIdx].role = val;
          job.updatedAt = Date.now();
          saveJobs();
        });

      const rmCrew = document.createElement('button');
      rmCrew.className = 'secondary outline remove-btn';
      rmCrew.type = 'button';
      rmCrew.setAttribute('aria-label', 'Remove crew row');
      rmCrew.innerHTML = SVG_X_SMALL;
      rmCrew.onclick = async () => {
        const cur = job.vehicles[vIdx].crew[cIdx];
        const isEmpty = !cur.name && !cur.role;
        if (!isEmpty) {
          const who = cur.name || 'this crew member';
          const ok = await showConfirm(`Remove ${who} from the crew?`, {
            title: 'Remove crew member',
            confirmLabel: 'Remove',
            danger: true,
          });
          if (!ok) return;
        }
        job.vehicles[vIdx].crew.splice(cIdx, 1);
        job.updatedAt = Date.now();
        saveJobs();
        renderEditView();
      };

      row.appendChild(nameSel);
      row.appendChild(roleSel);
      row.appendChild(rmCrew);
      crewWrap.appendChild(row);
    });

    const addCrewBtn = document.createElement('button');
    addCrewBtn.className = 'secondary outline small-btn add-crew-inline';
    addCrewBtn.type = 'button';
    addCrewBtn.textContent = '+ Add crew member';
    addCrewBtn.onclick = () => {
      if (job.vehicles[vIdx].crew.some((c) => !c.name)) return; // unfinished row exists
      job.vehicles[vIdx].crew.push({ name: '', role: '' });
      renderEditView();
    };
    crewWrap.appendChild(addCrewBtn);

    block.appendChild(crewWrap);
    wrap.appendChild(block);
  });
}

// ─── Copy vehicles to next job ──────────────────────────────────────────

async function openCopyModal() {
  const job = getJob(editingJobId);
  if (!job) return;
  if (job.vehicles.length === 0) {
    await showAlert('This job has no vehicles to copy.', {
      title: 'Nothing to copy',
    });
    return;
  }
  const list = document.getElementById('copy-modal-list');
  list.innerHTML = '';
  job.vehicles.forEach((v, idx) => {
    const row = document.createElement('label');
    row.className = 'modal-check-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = String(idx);
    cb.checked = true;
    const name = document.createElement('span');
    name.textContent = v.vehicle || '(unnamed vehicle)';
    const hint = document.createElement('span');
    hint.className = 'modal-check-hint';
    const n = v.crew.length;
    hint.textContent = `(${n} crew)`;
    row.appendChild(cb);
    row.appendChild(name);
    row.appendChild(hint);
    list.appendChild(row);
  });
  document.getElementById('copy-modal').hidden = false;
}

function closeCopyModal() {
  document.getElementById('copy-modal').hidden = true;
}

document
  .getElementById('copy-next-btn')
  .addEventListener('click', openCopyModal);
document
  .getElementById('copy-modal-cancel')
  .addEventListener('click', closeCopyModal);
document.getElementById('copy-modal').addEventListener('click', (e) => {
  if (e.target.id === 'copy-modal') closeCopyModal();
});

document
  .getElementById('copy-modal-confirm')
  .addEventListener('click', async () => {
    const src = getJob(editingJobId);
    if (!src) return;
    const checks = document.querySelectorAll(
      '#copy-modal-list input[type=checkbox]:checked',
    );
    if (checks.length === 0) {
      await showAlert('Select at least one vehicle.', {
        title: 'Nothing selected',
      });
      return;
    }
    const indices = Array.from(checks).map((c) => Number(c.value));
    const cloned = indices.map((i) => ({
      vehicle: src.vehicles[i].vehicle,
      crew: src.vehicles[i].crew.map((c) => ({ ...c })),
    }));
    const next = blankJob();
    next.vehicles = cloned;
    jobs.unshift(next);
    saveJobs();
    closeCopyModal();
    editingJobId = next.id;
    renderEditView();
    showView('edit');
    showToast('Vehicles copied to new job');
  });

document.getElementById('add-vehicle-btn').addEventListener('click', () => {
  const job = getJob(editingJobId);
  if (!job) return;
  if (job.vehicles.some((v) => !v.vehicle)) return; // unfinished row exists
  // No saveJobs here: the row has no value yet, so pruneEmptyRowsInPlace
  // would wipe it. It persists once the user fills the dropdown.
  job.vehicles.push({ vehicle: '', crew: [] });
  renderEditView();
});

function renderEquipmentRows(job) {
  const wrap = document.getElementById('equipment-rows');
  wrap.innerHTML = '';
  job.equipment.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'equipment-row';

    const head = document.createElement('div');
    head.className = 'equipment-row-head';

    const sel = document.createElement('select');
    fillSelect(
      sel,
      'equipment',
      item.equipment,
      '— select equipment —',
      usedEquipmentNames(job, idx),
    );
    sel.onchange = () =>
      handleSelectChange(
        sel,
        'equipment',
        'equipment item',
        (v) => {
          job.equipment[idx].equipment = v;
          job.updatedAt = Date.now();
          saveJobs();
        },
        usedEquipmentNames(job, idx),
      );

    const rm = document.createElement('button');
    rm.className = 'secondary outline remove-btn';
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove equipment');
    rm.innerHTML = SVG_X_SMALL;
    rm.onclick = async () => {
      const cur = job.equipment[idx];
      const isEmpty = !cur.equipment && !cur.notes;
      if (!isEmpty) {
        const name = cur.equipment || 'this item';
        const ok = await showConfirm(`Remove ${name} from this job?`, {
          title: 'Remove equipment',
          confirmLabel: 'Remove',
          danger: true,
        });
        if (!ok) return;
      }
      job.equipment.splice(idx, 1);
      job.updatedAt = Date.now();
      saveJobs();
      renderEditView();
    };

    head.appendChild(sel);
    head.appendChild(rm);

    const noteLabel = document.createElement('label');
    noteLabel.className = 'equipment-note-label';
    noteLabel.textContent = 'Notes';

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'equipment-note';
    noteInput.placeholder = 'Optional';
    noteInput.value = item.notes;
    noteLabel.appendChild(noteInput);
    noteInput.oninput = () => {
      job.equipment[idx].notes = noteInput.value;
      job.updatedAt = Date.now();
      saveJobs();
    };

    row.appendChild(head);
    row.appendChild(noteLabel);
    wrap.appendChild(row);
  });
}

document.getElementById('add-equipment-btn').addEventListener('click', () => {
  const job = getJob(editingJobId);
  if (!job) return;
  if (job.equipment.some((e) => !e.equipment)) return; // unfinished row exists
  job.equipment.push({ equipment: '', notes: '' });
  renderEditView();
});

// ─── Config view ────────────────────────────────────────────────────────

function renderConfigView() {
  const container = document.getElementById('config-lists');
  container.innerHTML = '';
  for (const f of DROPDOWN_FIELDS) {
    const block = document.createElement('div');
    block.className = 'config-list';

    const header = document.createElement('div');
    header.className = 'config-list-header';
    const title = document.createElement('span');
    title.className = 'config-list-title';
    title.textContent = f.label;
    const addBtn = document.createElement('button');
    addBtn.className = 'secondary outline small-btn';
    addBtn.type = 'button';
    addBtn.textContent = '+ Add';
    addBtn.onclick = async () => {
      const v = await showPrompt(`Enter a new ${f.singular}.`, {
        title: `New ${f.singular}`,
        placeholder: f.singular,
      });
      if (v && addConfigOption(f.key, v)) renderConfigView();
    };
    header.appendChild(title);
    header.appendChild(addBtn);
    block.appendChild(header);

    const items = document.createElement('div');
    items.className = 'config-items';
    if (config[f.key].length === 0) {
      const empty = document.createElement('p');
      empty.className = 'config-list-empty';
      empty.textContent = 'No items yet.';
      block.appendChild(empty);
    } else {
      for (const v of config[f.key]) {
        const tag = document.createElement('span');
        tag.className = 'config-item';
        tag.textContent = v;
        const rm = document.createElement('button');
        rm.className = 'config-item-remove';
        rm.type = 'button';
        rm.setAttribute('aria-label', `Remove ${v}`);
        rm.textContent = '×';
        rm.onclick = async () => {
          const ok = await showConfirm(
            `Remove "${v}" from ${f.label.toLowerCase()}?`,
            {
              title: 'Remove option',
              confirmLabel: 'Remove',
              danger: true,
            },
          );
          if (!ok) return;
          removeConfigOption(f.key, v);
          renderConfigView();
        };
        tag.appendChild(rm);
        items.appendChild(tag);
      }
      block.appendChild(items);
    }

    container.appendChild(block);
  }
}

// ─── Import / Export ────────────────────────────────────────────────────

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Wrap a payload in a versioned envelope. Future imports branch on __version.
function wrapExport(type, data) {
  return {
    __type: type,
    __version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data,
  };
}

// Unwrap a versioned envelope OR fall back to legacy shape. Throws a
// user-facing Error on type mismatch or structural mismatch.
function unwrapImport(parsed, expectedType, legacyKind) {
  const isEnvelope =
    parsed !== null
    && typeof parsed === 'object'
    && !Array.isArray(parsed)
    && '__type' in parsed
    && 'data' in parsed;

  if (isEnvelope) {
    if (parsed.__type !== expectedType) {
      throw new Error(
        `This file is "${parsed.__type}", but a "${expectedType}" file was expected.`,
      );
    }
    return parsed.data;
  }

  // Legacy shape: sniff to catch obvious file-type mistakes.
  if (legacyKind === 'jobs' && !Array.isArray(parsed)) {
    throw new Error('Imported file is not a jobs list.');
  }
  if (
    legacyKind === 'config'
    && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
  ) {
    throw new Error('Imported file is not a configuration object.');
  }
  return parsed;
}

// HH-MM stamp so two exports the same day don't collide.
function exportStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

document.getElementById('export-config-btn').addEventListener('click', () => {
  downloadJson(`jobjot-config-${exportStamp()}.json`, wrapExport(EXPORT_TYPE_CONFIG, config));
  showToast('Config exported');
});

document.getElementById('import-config-btn').addEventListener('click', () => {
  document.getElementById('import-config-file').click();
});

document
  .getElementById('import-config-file')
  .addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    let payload;
    try {
      const parsed = await readJsonFile(file);
      payload = unwrapImport(parsed, EXPORT_TYPE_CONFIG, 'config');
    } catch (err) {
      await showAlert(err.message || 'Could not read JSON file.', {
        title: 'Import failed',
      });
      return;
    }

    const ok = await showConfirm(
      'Replace current configuration with imported file?',
      { title: 'Import config', confirmLabel: 'Replace' },
    );
    if (!ok) return;

    config = sanitizeConfig(payload);
    saveConfig();
    applyTheme();
    renderConfigView();

    const counts = DROPDOWN_FIELDS.map(
      (f) => `${config[f.key].length} ${f.label.toLowerCase()}`,
    ).join(', ');
    await showAlert(`Config imported. Loaded: ${counts}.`, {
      title: 'Import complete',
    });
  });

document.getElementById('export-jobs-btn').addEventListener('click', () => {
  downloadJson(`jobjot-jobs-${exportStamp()}.json`, wrapExport(EXPORT_TYPE_JOBS, jobs));
  showToast('Jobs exported');
});

document.getElementById('import-jobs-btn').addEventListener('click', () => {
  document.getElementById('import-jobs-file').click();
});

document
  .getElementById('import-jobs-file')
  .addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    let payload;
    try {
      const parsed = await readJsonFile(file);
      payload = unwrapImport(parsed, EXPORT_TYPE_JOBS, 'jobs');
    } catch (err) {
      await showAlert(err.message || 'Could not read JSON file.', {
        title: 'Import failed',
      });
      return;
    }

    if (!Array.isArray(payload)) {
      await showAlert('Imported file is not a jobs list.', {
        title: 'Import failed',
      });
      return;
    }

    const mode = await showChoice(
      'How should imported jobs be applied?',
      [
        { label: 'Merge', value: 'merge', primary: true },
        { label: 'Replace all', value: 'replace', danger: true },
      ],
      { title: 'Import jobs' },
    );
    if (!mode) return;

    const rawCount = payload.length;
    const imported = payload.map(sanitizeJob).filter(Boolean);
    const dropped = rawCount - imported.length;
    const missingNumber = imported.filter((j) => !j.jobNumber).length;

    if (mode === 'replace') {
      jobs = imported;
    } else {
      const existingIds = new Set(jobs.map((j) => j.id));
      for (const j of imported) {
        if (existingIds.has(j.id)) j.id = genId();
        jobs.push(j);
      }
    }
    saveJobs();
    renderList();

    const lines = [
      `${imported.length} job${imported.length === 1 ? '' : 's'} ${mode === 'replace' ? 'loaded' : 'added'}.`,
    ];
    if (dropped > 0) lines.push(`${dropped} skipped (unreadable).`);
    if (missingNumber > 0) lines.push(`${missingNumber} missing a job number.`);
    await showAlert(lines.join(' '), { title: 'Import complete' });
  });

document
  .getElementById('reset-install-hint-btn')
  .addEventListener('click', () => {
    config.installHintDismissed = false;
    saveConfig();
    if (isStandalone) {
      showToast('Already running as installed app');
      return;
    }
    if (isIOS) {
      showInstallBanner('Install JobJot for quicker access and offline use. Tap Share → Add to Home Screen.', false);
    } else if (deferredInstallPrompt) {
      showInstallBanner('Install JobJot for quicker access and offline use.', true);
    } else {
      showInstallBanner('Install: menu (⋮) → Install / Add to Home Screen.', false);
    }
  });

document
  .getElementById('clear-jobs-btn')
  .addEventListener('click', async () => {
    const ok = await showConfirm(
      'Delete ALL saved jobs? This cannot be undone.',
      {
        title: 'Clear all jobs',
        confirmLabel: 'Delete all',
        danger: true,
      },
    );
    if (!ok) return;
    jobs = [];
    saveJobs();
    showToast('All jobs cleared');
  });

// ─── Init ───────────────────────────────────────────────────────────────

loadConfig();
loadJobs();
applyTheme();

const sortEl = document.getElementById('list-sort');
const filterEl = document.getElementById('list-filter');
sortEl.value = config.listSort;
filterEl.value = config.listFilter;
sortEl.addEventListener('change', () => {
  config.listSort = sortEl.value;
  saveConfig();
  renderList();
});
filterEl.addEventListener('change', () => {
  config.listFilter = filterEl.value;
  saveConfig();
  renderList();
});

renderList();
showView('list');

// Fire after initial paint so the user sees the app before any modal.
setTimeout(() => { maybeRequestPersistence(); }, 600);

// ─── Install hint / persistent storage ──────────────────────────────────

// Ask the browser to keep our storage durably. Mostly relevant on Android,
// where calling persist() can surface a system permission prompt — so we
// pre-explain with our own modal, and only ask once.
async function maybeRequestPersistence() {
  if (!navigator.storage?.persist) return;
  if (config.persistAsked) return;
  let already = false;
  try { already = await navigator.storage.persisted(); } catch (_) {}
  if (already) {
    config.persistAsked = true;
    saveConfig();
    return;
  }
  const ok = await showConfirm(
    'JobJot stores your jobs on this device. Allowing persistent storage prevents the browser from clearing them when space is low. You may see a system prompt next.',
    { title: 'Keep your jobs safe', confirmLabel: 'Allow' },
  );
  config.persistAsked = true;
  saveConfig();
  if (!ok) return;
  try { await navigator.storage.persist(); } catch (_) {}
}

const banner = document.getElementById('install-banner');
const bannerText = document.getElementById('install-banner-text');
const bannerInstall = document.getElementById('install-banner-install');
const bannerDismiss = document.getElementById('install-banner-dismiss');

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

function showInstallBanner(text, withInstallBtn) {
  bannerText.textContent = text;
  bannerInstall.hidden = !withInstallBtn;
  banner.hidden = false;
}

bannerDismiss.addEventListener('click', () => {
  banner.hidden = true;
  config.installHintDismissed = true;
  saveConfig();
});

// Android / desktop Chromium: capture the prompt event for a custom button.
let deferredInstallPrompt = null;
let installPromptFired = false;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptFired = true;
  deferredInstallPrompt = e;
  if (isStandalone || config.installHintDismissed) return;
  showInstallBanner('Install JobJot for quicker access and offline use.', true);
});

// Fallback: if Chrome never fires beforeinstallprompt (engagement not met,
// or previously installed and uninstalled), show a manual-steps hint.
const isAndroid = /Android/.test(navigator.userAgent);
if (isAndroid && !isStandalone && !config.installHintDismissed) {
  setTimeout(() => {
    if (installPromptFired) return;
    if (!banner.hidden) return;
    showInstallBanner('Install JobJot for quicker access and offline use. Menu (⋮) → Install / Add to Home Screen.', false);
  }, 4000);
}

bannerInstall.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch (_) {}
  deferredInstallPrompt = null;
  banner.hidden = true;
});

window.addEventListener('appinstalled', () => {
  banner.hidden = true;
  deferredInstallPrompt = null;
});

// iOS Safari has no install prompt — show a one-liner with the manual steps,
// dismissible. Skip if already added to home screen, or previously dismissed.
if (isIOS && !isStandalone && !config.installHintDismissed) {
  showInstallBanner('Install JobJot for quicker access and offline use. Tap Share → Add to Home Screen.', false);
}

// Service worker registration — silent failure if unsupported / file://.
// When a new SW takes control (build bumped CACHE_VERSION), reload once so
// the user picks up the fresh app shell without a manual tap.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });

  // Skip the first controllerchange — that's the initial takeover at first
  // visit, not an update. Reload only on subsequent SW swaps.
  const hadController = !!navigator.serviceWorker.controller;
  let reloadedForSW = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadedForSW) return;
    reloadedForSW = true;
    location.reload();
  });
}
