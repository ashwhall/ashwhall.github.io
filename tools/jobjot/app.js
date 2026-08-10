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
// Counts jobs whose pre-per-vehicle global times were migrated onto their
// first vehicle during the most recent sanitize pass (load or import). Used to
// surface a one-time explanatory dialog. Reset before each batch.
let migratedJobCount = 0;
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
    crewMembers: [],
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

function blankTimes() {
  return { enroute: '', onScene: '', jobClear: '', inStation: '' };
}

function sanitizeTimes(t) {
  const base = blankTimes();
  if (!t || typeof t !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (typeof t[k] === 'string') base[k] = t[k];
  }
  return base;
}

function sanitizeJob(j) {
  if (!j || typeof j !== 'object') return null;
  // Legacy (pre per-vehicle) jobs carried a single job-level `times`. If the
  // first vehicle has no times of its own, that global set is migrated onto it
  // (see sanitizeVehicles) and we flag it so the user can be told.
  const legacy = j.times && typeof j.times === 'object' ? j.times : null;
  const legacyHasValue =
    legacy &&
    (legacy.enroute || legacy.onScene || legacy.jobClear || legacy.inStation);
  const firstVehHasOwnTimes =
    Array.isArray(j.vehicles) && j.vehicles[0] && j.vehicles[0].times;
  if (legacyHasValue && !firstVehHasOwnTimes) migratedJobCount++;
  return {
    id: typeof j.id === 'string' ? j.id : genId(),
    createdAt: typeof j.createdAt === 'number' ? j.createdAt : Date.now(),
    updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : Date.now(),
    jobNumber: typeof j.jobNumber === 'string' ? j.jobNumber : '',
    description: typeof j.description === 'string' ? j.description : '',
    jobPaged: typeof j.jobPaged === 'string' ? j.jobPaged : '',
    vehicles: sanitizeVehicles(j, legacyHasValue ? legacy : null),
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

// `legacyTimes` (when supplied) is the old job-level times block. It is applied
// to the FIRST vehicle only, and only when that vehicle has no times of its own
// — the best-effort migration path. Other vehicles start blank.
function sanitizeVehicles(j, legacyTimes) {
  if (!Array.isArray(j.vehicles)) return [];
  return j.vehicles
    .filter((v) => v && typeof v === 'object')
    .map((v, i) => ({
      vehicle: typeof v.vehicle === 'string' ? v.vehicle : '',
      crew: Array.isArray(v.crew)
        ? v.crew
            .filter((c) => c && typeof c === 'object')
            .map((c) => ({
              name: typeof c.name === 'string' ? c.name : '',
              role: typeof c.role === 'string' ? c.role : '',
            }))
        : [],
      times: sanitizeTimes(v.times || (i === 0 ? legacyTimes : null)),
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
  migratedJobCount = 0;
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    jobs = Array.isArray(arr) ? arr.map(sanitizeJob).filter(Boolean) : [];
  } catch (_) {
    jobs = [];
  }
  pruneEmptyRowsInPlace();
  saveJobs();
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
    jobPaged: '',
    vehicles: [],
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

// ─── System back button ─────────────────────────────────────────────────
// Views are toggled with `hidden` in one document, so nothing here ever added
// a history entry. Android's back button had no app-level step to take and
// walked off the end of the stack, leaving a blank window.
//
// Each level of depth — the edit view, the config view, a modal — owns one
// history entry, and every close routes through history.back(). popstate is
// then the single place anything actually closes, so the system button and the
// on-screen controls cannot drift apart.
//
// popstate can't be cancelled: by the time it fires the entry is already gone.
// A level that refuses to close (the missing-job-number confirm) pushes a
// replacement entry to stay where it is.

const levels = [];

// Set when we call history.back() ourselves, so the popstate it causes isn't
// mistaken for the user pressing back again.
let selfPops = 0;

function openLevel(name, close) {
  levels.push({ name, close, closing: false });
  history.pushState({ jj: name }, '');
}

function closeTopLevel() {
  if (levels.length) history.back();
}

window.addEventListener('popstate', () => {
  if (selfPops > 0) {
    selfPops--;
    return;
  }

  const level = levels[levels.length - 1];

  // Nothing of ours is open — let the browser leave the app.
  if (!level) return;

  // The browser has already consumed an entry by the time we get here. Put one
  // back straight away so the stack is never shallower than the UI is deep:
  // otherwise a second press while a close is still resolving falls off the
  // end of the stack and drops the user out of the app. The entry is consumed
  // again below, once the level has actually agreed to close.
  history.pushState({ jj: level.name }, '');

  // Already asking this level to close — its confirm is on screen. The push
  // above is all that was needed.
  if (level.closing) return;

  level.closing = true;
  Promise.resolve(level.close())
    .catch(() => true) // a closer that blew up shouldn't strand the stack
    .then((closed) => {
      level.closing = false;
      if (closed === false) return; // refused: the restored entry stands
      const i = levels.lastIndexOf(level);
      if (i !== -1) levels.splice(i, 1);
      selfPops++;
      history.back();
    });
});

history.replaceState({ jj: 'list' }, '');

// Returning from the edit view, whether by the on-screen arrow or the system
// back button. Returns false to stay put.
async function leaveEdit() {
  // If the job was never persisted (user opened New job and did nothing),
  // discard silently with a toast rather than warning about missing fields.
  if (pendingJob) {
    pendingJob = null;
    editingJobId = null;
    showView('list');
    renderList();
    showToast('Empty job discarded');
    return true;
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
    if (!ok) return false;
  }
  editingJobId = null;
  showView('list');
  renderList();
  return true;
}

function leaveConfig() {
  showView(editingJobId ? 'edit' : 'list');
  if (!editingJobId) renderList();
  return true;
}

document.getElementById('config-toggle').addEventListener('click', () => {
  const configOpen = !document.getElementById('config-view').hidden;
  if (configOpen) {
    closeTopLevel();
  } else {
    renderConfigView();
    showView('config');
    openLevel('config', leaveConfig);
  }
});

document.getElementById('config-back-btn').addEventListener('click', () => {
  closeTopLevel();
});

document.getElementById('back-btn').addEventListener('click', () => {
  closeTopLevel();
});

document.getElementById('new-job-btn').addEventListener('click', () => {
  pendingJob = blankJob();
  editingJobId = pendingJob.id;
  renderEditView();
  showView('edit');
  openLevel('edit', leaveEdit);
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
  // Unwind the edit level rather than switching view directly, so its history
  // entry goes with it. leaveEdit finds no job now, so it won't re-prompt.
  closeTopLevel();
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

    // Buttons and Escape record their answer then unwind the history stack;
    // `teardown` below is what actually removes the modal, so a dismissal by
    // the system back button takes exactly the same path.
    let answer;
    const finish = (value) => {
      answer = value;
      closeTopLevel();
    };

    const teardown = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(answer === undefined ? null : answer);
      return true;
    };

    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `small-btn ${a.className || 'secondary outline'}`;
      btn.textContent = a.label;
      btn.onclick = () =>
        finish(typeof a.value === 'function' ? a.value() : a.value);
      actionsWrap.appendChild(btn);
      if (a.primary) btn.dataset.primary = '1';
    }
    modal.appendChild(actionsWrap);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });

    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
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
    openLevel('dialog', teardown);
    if (onMount) onMount(modal, finish);
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
function showToast(msg, { variant = '', duration = 1800 } = {}) {
  const el = document.getElementById('toast');
  el.className = 'toast';
  el.textContent = '';
  if (variant === 'success') {
    el.classList.add('success');
    el.insertAdjacentHTML('beforeend', SVG_CHECK);
  }
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
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
  const baseMs = baseDayMs(job);
  const MIN_MS = 60_000;

  // Span across the whole turnout: earliest start, latest finish.
  const start = firstAcross(job, 'enroute') || firstAcross(job, 'onScene');
  const end = lastAcross(job, 'inStation') || lastAcross(job, 'jobClear');

  if (!start && !end) {
    return { text: fmtDate(job.createdAt), ts: job.createdAt };
  }
  if (start && end) {
    const a = baseMs + start.mins * MIN_MS;
    const b = baseMs + end.mins * MIN_MS;
    const dur = fmtDurationHr(Math.round((b - a) / MIN_MS));
    return {
      text: `${fmtDateOnly(a)}, ${fmtClock24(a)} – ${fmtClock24(b)} (${dur})`,
      ts: a,
    };
  }
  if (start && !end) {
    const a = baseMs + start.mins * MIN_MS;
    const dur = fmtDurationHr(Math.round((Date.now() - a) / MIN_MS));
    return {
      text: `${fmtDateOnly(a)}, ${fmtClock24(a)} – now (${dur})`,
      ts: a,
      live: true,
    };
  }
  const b = baseMs + end.mins * MIN_MS;
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
  if (!j.jobPaged) return false;
  if (j.vehicles.length === 0) return false;
  for (const v of j.vehicles) {
    if (!v.vehicle || v.crew.length === 0) return false;
    if (
      !v.times.enroute ||
      !v.times.onScene ||
      !v.times.jobClear ||
      !v.times.inStation
    )
      return false;
  }
  return true;
}

function listDateFor(job) {
  // Sort key matches the visible start time in listLineFor: earliest enroute,
  // falling back to earliest on-scene, then to creation.
  const pick = firstAcross(job, 'enroute') || firstAcross(job, 'onScene');
  if (pick) return baseDayMs(job) + pick.mins * 60_000;
  return job.createdAt;
}

function applyListFilter(list) {
  switch (config.listFilter) {
    case 'in-progress':
      // Started but not closed out: a vehicle is enroute/on scene, and not
      // every vehicle is back in station yet.
      return list.filter(
        (j) =>
          (anyVehicleTime(j, 'enroute') || anyVehicleTime(j, 'onScene')) &&
          !allVehiclesHave(j, 'inStation'),
      );
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
      openLevel('edit', leaveEdit);
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
      job.vehicles.some(
        (v) =>
          !v.vehicle ||
          v.crew.length === 0 ||
          !v.times.enroute ||
          !v.times.onScene ||
          !v.times.jobClear ||
          !v.times.inStation,
      ),
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

  // Times: global paged anchor + figures derived across vehicles.
  renderGlobalTimes(job);

  // Vehicles (each contains nested crew and its own timeline)
  renderVehicles(job);

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

const SVG_CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

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

// Job paged is the shared anchor; each vehicle then owns its own four times.
// A vehicle's effective timeline is { jobPaged, ...vehicle.times } walked in
// this sequence so day-rollover is measured from when the job was paged.
const PAGED_FIELD = { key: 'jobPaged', label: 'Job paged' };
const VEHICLE_TIME_FIELDS = [
  { key: 'enroute', label: 'Enroute' },
  { key: 'onScene', label: 'On scene' },
  { key: 'jobClear', label: 'Job clear' },
  { key: 'inStation', label: 'In station' },
];
const SEQUENCE_FIELDS = [PAGED_FIELD, ...VEHICLE_TIME_FIELDS];

function currentTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Combined timeline (paged anchor + a vehicle's own times) used for day-offset
// and duration maths. jobPaged is shared across all vehicles in the job.
function vehicleTimeline(job, vehicle) {
  return { jobPaged: job.jobPaged, ...vehicle.times };
}

// Walk `fields` in order over a plain times object; each time that wraps below
// the previous bumps the day. Returns offsets keyed by field key.
function computeDayOffsets(times, fields = SEQUENCE_FIELDS) {
  const offsets = {};
  let dayOffset = 0;
  let prevMins = null;
  for (const f of fields) {
    const v = times[f.key];
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

function totalMinutes(times, key, offsets) {
  const v = times[key];
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  return offsets[key] * 1440 + h * 60 + m;
}

// Earliest / latest value of `key` across all vehicles, measured in minutes
// from the job's paged-day baseline. Returns { mins, time, vehicle } or null.
function pickAcrossVehicles(job, key, want) {
  let best = null;
  for (const v of job.vehicles) {
    if (!v.times[key]) continue;
    const tl = vehicleTimeline(job, v);
    const mins = totalMinutes(tl, key, computeDayOffsets(tl));
    if (
      best === null ||
      (want === 'first' ? mins < best.mins : mins > best.mins)
    ) {
      best = { mins, time: v.times[key], vehicle: v.vehicle };
    }
  }
  return best;
}

const firstAcross = (job, key) => pickAcrossVehicles(job, key, 'first');
const lastAcross = (job, key) => pickAcrossVehicles(job, key, 'last');

function anyVehicleTime(job, key) {
  return job.vehicles.some((v) => v.times[key]);
}

function allVehiclesHave(job, key) {
  return job.vehicles.length > 0 && job.vehicles.every((v) => v.times[key]);
}

// Midnight of the job's creation day — the baseline for list timestamps, which
// add a value's offset-aware minutes onto it.
function baseDayMs(job) {
  const d = new Date(job.createdAt);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDuration(mins) {
  if (mins < 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Persist a time edit and refresh the whole edit view. A vehicle's time change
// can move the job-level "first enroute / on scene" figures, so a targeted
// re-render isn't enough — renderEditView() rebuilds both and restores scroll.
function commitTimeChange() {
  const job = getJob(editingJobId);
  if (job) job.updatedAt = Date.now();
  saveJobs();
  renderEditView();
}

// Editable-time button/input handlers for a single field. `setVal` writes the
// new value into the model; the caller owns where that lives.
function timeFieldHandlers(setVal, label) {
  return {
    onInput: (val) => {
      setVal(val);
      commitTimeChange();
    },
    onNow: () => {
      setVal(currentTimeHHMM());
      commitTimeChange();
    },
    onClear: async () => {
      const ok = await showConfirm(`Clear the "${label}" time?`, {
        title: 'Clear time',
        confirmLabel: 'Clear',
        danger: true,
      });
      if (!ok) return;
      setVal('');
      commitTimeChange();
    },
  };
}

// One timeline row. Editable rows get a time input + Now/Clear button; read-only
// rows (the global derived figures, and each vehicle's mirrored paged time) show
// a static value. `suffix` annotates which vehicle a derived value came from.
function timeRow({
  id,
  label,
  suffix,
  value,
  readOnly,
  missing,
  dayOffset,
  onInput,
  onNow,
  onClear,
}) {
  const row = document.createElement('div');
  row.className = 'time-row';

  const lab = document.createElement('label');
  lab.className = 'time-label';
  if (id && !readOnly) lab.htmlFor = id;
  lab.textContent = label;
  if (missing) setWarnIcon(lab, true);
  if (value && dayOffset > 0) {
    const tag = document.createElement('span');
    tag.className = 'day-tag';
    tag.textContent = `+${dayOffset}d`;
    lab.appendChild(tag);
  }
  row.appendChild(lab);

  if (readOnly) {
    // No value yet: a placeholder field pointing the user to where the value
    // actually comes from, rather than a bare disabled "--:--".
    if (!value) {
      const ph = document.createElement('div');
      ph.className = 'time-readonly-empty';
      ph.textContent = 'Set on a vehicle';
      row.appendChild(ph);
      return row;
    }
    // Same time field as the editable rows, but disabled — looks identical to
    // Job paged, just not interactive (no value, no Now/Clear button). The
    // source vehicle sits as a pill in the action column, where the Now/Clear
    // button would be on an editable row.
    const input = document.createElement('input');
    input.type = 'time';
    if (id) input.id = id;
    input.value = value;
    input.disabled = true;
    input.className = 'time-readonly-input';
    row.appendChild(input);
    if (suffix) {
      const badge = document.createElement('span');
      badge.className = 'time-veh-badge';
      badge.textContent = suffix;
      row.appendChild(badge);
    }
    return row;
  }

  const input = document.createElement('input');
  input.type = 'time';
  if (id) input.id = id;
  input.value = value || '';
  input.onchange = () => onInput(input.value);
  row.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'time-action-btn';
  if (value) {
    btn.classList.add('clear');
    btn.setAttribute('aria-label', `Clear ${label}`);
    btn.innerHTML = SVG_X_SMALL;
    btn.onclick = onClear;
  } else {
    btn.classList.add('now');
    btn.textContent = 'Now';
    btn.setAttribute('aria-label', `Set ${label} to now`);
    btn.onclick = onNow;
  }
  row.appendChild(btn);
  return row;
}

// Duration shown between two timeline rows. Hidden when not computable. A
// `label` (e.g. "Turn out") marks a named gap rather than a bare figure.
function durationRow(mins, label) {
  const div = document.createElement('div');
  div.className = 'time-duration';
  if (mins === null || mins < 0) {
    div.classList.add('empty');
    return div;
  }
  if (label) {
    const l = document.createElement('span');
    l.className = 'dur-label';
    l.textContent = label;
    div.appendChild(l);
    div.appendChild(document.createTextNode(` ${fmtDuration(mins)}`));
  } else {
    div.textContent = fmtDuration(mins);
  }
  return div;
}

// Global Times section: the paged anchor (editable) plus read-only figures
// derived across vehicles. Job clear / in station are intentionally omitted
// here — they belong to individual vehicles.
function renderGlobalTimes(job) {
  const wrap = document.getElementById('times-container');
  wrap.innerHTML = '';

  wrap.appendChild(
    timeRow({
      id: 'f-time-jobPaged',
      label: PAGED_FIELD.label,
      value: job.jobPaged,
      missing: !job.jobPaged,
      ...timeFieldHandlers((val) => {
        job.jobPaged = val;
      }, PAGED_FIELD.label),
    }),
  );

  const firstEnroute = firstAcross(job, 'enroute');
  const firstScene = firstAcross(job, 'onScene');

  // Turn out: paged → first enroute.
  const pagedMins = job.jobPaged
    ? totalMinutes({ jobPaged: job.jobPaged }, 'jobPaged', { jobPaged: 0 })
    : null;
  wrap.appendChild(
    durationRow(
      pagedMins !== null && firstEnroute ? firstEnroute.mins - pagedMins : null,
      'Turn out',
    ),
  );

  wrap.appendChild(
    timeRow({
      label: 'First enroute',
      suffix: firstEnroute?.vehicle || '',
      value: firstEnroute?.time || '',
      readOnly: true,
      dayOffset: firstEnroute ? Math.floor(firstEnroute.mins / 1440) : 0,
    }),
  );

  wrap.appendChild(
    durationRow(
      firstEnroute && firstScene ? firstScene.mins - firstEnroute.mins : null,
    ),
  );

  wrap.appendChild(
    timeRow({
      label: 'First on scene',
      suffix: firstScene?.vehicle || '',
      value: firstScene?.time || '',
      readOnly: true,
      dayOffset: firstScene ? Math.floor(firstScene.mins / 1440) : 0,
    }),
  );
}

// Per-vehicle timeline, rendered inside the vehicle's card: a read-only mirror
// of the job's paged time, the vehicle's turn out, then its own four times.
function renderVehicleTimes(job, vIdx) {
  const v = job.vehicles[vIdx];
  const wrap = document.createElement('div');
  wrap.className = 'vehicle-times';

  const tl = vehicleTimeline(job, v);
  const offsets = computeDayOffsets(tl);

  wrap.appendChild(
    timeRow({
      label: PAGED_FIELD.label,
      value: job.jobPaged,
      readOnly: true,
      dayOffset: offsets.jobPaged,
    }),
  );

  const pagedMins = totalMinutes(tl, 'jobPaged', offsets);
  const enrouteMins = totalMinutes(tl, 'enroute', offsets);
  wrap.appendChild(
    durationRow(
      pagedMins !== null && enrouteMins !== null
        ? enrouteMins - pagedMins
        : null,
      'Turn out',
    ),
  );

  VEHICLE_TIME_FIELDS.forEach((f, idx) => {
    wrap.appendChild(
      timeRow({
        id: `f-time-${vIdx}-${f.key}`,
        label: f.label,
        value: v.times[f.key],
        missing: !v.times[f.key],
        dayOffset: offsets[f.key],
        ...timeFieldHandlers((val) => {
          v.times[f.key] = val;
        }, f.label),
      }),
    );
    const next = VEHICLE_TIME_FIELDS[idx + 1];
    if (next) {
      const a = totalMinutes(tl, f.key, offsets);
      const b = totalMinutes(tl, next.key, offsets);
      wrap.appendChild(durationRow(a !== null && b !== null ? b - a : null));
    }
  });

  return wrap;
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

    // Timeline only once the vehicle is named — an unfilled row would just
    // show four "required" warnings before there's a vehicle to attribute
    // them to.
    if (v.vehicle) {
      block.appendChild(renderVehicleTimes(job, vIdx));
    }

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
  openLevel('copy-modal', () => {
    closeCopyModal();
    return true;
  });
}

function closeCopyModal() {
  document.getElementById('copy-modal').hidden = true;
}

document
  .getElementById('copy-next-btn')
  .addEventListener('click', openCopyModal);
document
  .getElementById('copy-modal-cancel')
  .addEventListener('click', closeTopLevel);
document.getElementById('copy-modal').addEventListener('click', (e) => {
  if (e.target.id === 'copy-modal') closeTopLevel();
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
      times: blankTimes(),
    }));
    const next = blankJob();
    next.vehicles = cloned;
    jobs.unshift(next);
    saveJobs();
    // Unwind the modal level only — we stay at edit depth, now on the new job.
    closeTopLevel();
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
  job.vehicles.push({ vehicle: '', crew: [], times: blankTimes() });
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
    migratedJobCount = 0;
    const imported = payload.map(sanitizeJob).filter(Boolean);
    const migratedHere = migratedJobCount;
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
    if (migratedHere > 0) await showMigrationNotice(migratedHere);
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

// About-section collapse state. Default open on first visit; user's choice
// persists across sessions.
(() => {
  const el = document.getElementById('config-about');
  if (!el) return;
  el.open = config.aboutCollapsed !== true;
  el.addEventListener('toggle', () => {
    config.aboutCollapsed = !el.open;
    saveConfig();
  });
})();

// Surface build date in config (Jekyll renders build.json at deploy time;
// local dev falls back to "dev (local)" because the template literal stays).
(async () => {
  const el = document.getElementById('build-date-value');
  if (!el) return;
  el.textContent = 'dev (local)';
  try {
    const res = await fetch('build.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const text = await res.text();
    if (text.includes('{{')) return; // unprocessed template
    const data = JSON.parse(text);
    const d = new Date(data.build);
    if (isNaN(d.getTime())) return;
    el.textContent = d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch (_) {}
})();

renderList();
showView('list');

// One-time notice when legacy job-level times were migrated onto first
// vehicles. We can't know they belong there, and any per-vehicle times the
// user kept in notes must now be re-entered by hand — so spell that out.
function showMigrationNotice(count) {
  const n = `${count} existing job${count === 1 ? '' : 's'}`;
  return showAlert(
    `JobJot now records call times for each vehicle separately, rather than one set of times per job.\n\n` +
      `For ${n}, the old times have been moved onto the first vehicle. We can't be sure those times belong to that vehicle, so please open each job and check them.\n\n` +
      `If you recorded other vehicles' times elsewhere (for example in the job's notes), you'll need to enter them on each vehicle by hand now.`,
    { title: 'Times moved to first vehicle' },
  );
}

// Fire after initial paint so the user sees the app before any modal.
setTimeout(async () => {
  if (migratedJobCount > 0) await showMigrationNotice(migratedJobCount);
  maybeRequestPersistence();
}, 600);

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
// When a new SW takes control (build bumped CACHE_VERSION), surface a toast
// and reload so the user picks up the fresh app shell.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const trackInstall = (worker) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // Only an update if a controller already existed at page load.
          if (worker.state === 'installed' && hadController) {
            showToast('Update installed — reloading to the latest version…', {
              variant: 'success',
              duration: 3000,
            });
          }
        });
      };
      trackInstall(reg.installing);
      reg.addEventListener('updatefound', () => trackInstall(reg.installing));

      // Nudge the browser to recheck sw.js on load and when the tab regains focus.
      reg.update().catch(() => {});
      window.addEventListener('focus', () => reg.update().catch(() => {}));
    }).catch(() => {});
  });

  let reloadedForSW = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadedForSW) return;
    reloadedForSW = true;
    // Tiny delay so the toast is visible before reload.
    setTimeout(() => location.reload(), 600);
  });
}
