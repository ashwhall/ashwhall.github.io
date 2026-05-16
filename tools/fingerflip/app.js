(function () {
  'use strict';

  const STORAGE_KEY = 'fingerflip.v1';
  const DATASET_URL = './data/tricks.json';

  const DEFAULTS = {
    freefallLow: 3,            // m/s² — |accel| below this = airborne (free fall)
    freefallFrames: 2,         // consecutive sub-threshold frames to confirm launch
    rotationLaunch: 400,       // °/s — launch trigger; also gates catch-by-drop
    catchOmegaDropFrac: 0.35,  // |ω| drops below peak × this = caught (hand grip kills spin)
    catchOmegaDropFrames: 2,   // consecutive drop frames to confirm catch
    minAirtimeMs: 100,         // reject jiggles shorter than this
    prerollFrames: 20,
    maxRecordMs: 2000,
    resampleFrames: 64,
    rotationWeight: 0.05,
    useRotationDistance: true,
    visualise: true,
    inferDifficulty: false,
    ambiguousMargin: 0.15,
    bailedTolerance: 30,       // deg, max(|Δbeta|,|Δgamma|) — bail detection on stored orientation
  };

  const State = { IDLE: 'IDLE', ARMED: 'ARMED', RECORDING: 'RECORDING', LABELLING: 'LABELLING', CLASSIFYING: 'CLASSIFYING' };

  const els = {
    learnToggle: document.getElementById('learn-toggle'),
    exportBtn: document.getElementById('export-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    freefallLowInput: document.getElementById('freefall-low-input'),
    freefallFramesInput: document.getElementById('freefall-frames-input'),
    rotationLaunchInput: document.getElementById('rotation-launch-input'),
    catchDropFracInput: document.getElementById('catch-drop-frac-input'),
    catchDropFramesInput: document.getElementById('catch-drop-frames-input'),
    minAirtimeInput: document.getElementById('min-airtime-input'),
    prerollInput: document.getElementById('preroll-input'),
    maxRecordInput: document.getElementById('max-record-input'),
    rotationWeightInput: document.getElementById('rotation-weight-input'),
    useRotationInput: document.getElementById('use-rotation-input'),
    ambiguousMarginInput: document.getElementById('ambiguous-margin-input'),
    bailedToleranceInput: document.getElementById('bailed-tolerance-input'),
    visualiseInput: document.getElementById('visualise-input'),
    inferDifficultyInput: document.getElementById('infer-difficulty-input'),
    vizSection: document.getElementById('viz-section'),
    vizCanvas: document.getElementById('viz-canvas'),
    vizLegend: document.getElementById('viz-legend'),
    sampleRateReadout: document.getElementById('sample-rate-readout'),
    clearUnsavedBtn: document.getElementById('clear-unsaved-btn'),
    resetLocalBtn: document.getElementById('reset-local-btn'),
    statusPill: document.getElementById('status-pill'),
    triggerFill: document.getElementById('trigger-fill'),
    primaryBtn: document.getElementById('primary-btn'),
    hint: document.getElementById('hint'),
    labelScreen: document.getElementById('label-screen'),
    labelBailedHint: document.getElementById('label-bailed-hint'),
    trickButtons: document.getElementById('trick-buttons'),
    newTrickForm: document.getElementById('new-trick-form'),
    newTrickName: document.getElementById('new-trick-name'),
    newTrickDifficulty: document.getElementById('new-trick-difficulty'),
    discardBtn: document.getElementById('discard-btn'),
    resultScreen: document.getElementById('result-screen'),
    resultTitle: document.getElementById('result-title'),
    resultSubtitle: document.getElementById('result-subtitle'),
    resultRows: document.getElementById('result-rows'),
    resultActionsTop: document.getElementById('result-actions-top'),
    resultDoneTopBtn: document.getElementById('result-done-top-btn'),
    statsTricks: document.getElementById('stats-tricks'),
    statsSamples: document.getElementById('stats-samples'),
    statsUnsaved: document.getElementById('stats-unsaved'),
  };

  const app = {
    state: State.IDLE,
    learnMode: false,
    settings: { ...DEFAULTS },
    committed: { version: 1, tricks: [], samples: [] },
    unsaved: [],
    capture: null,
    motionHandler: null,
    sampleRateHz: 0,
    lastFrameTs: 0,
    frameCount: 0,
    rateWindowStart: 0,
  };

  function loadLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (s.settings) app.settings = { ...DEFAULTS, ...s.settings };
      if (s.learnMode !== undefined) app.learnMode = !!s.learnMode;
      if (Array.isArray(s.unsaved)) app.unsaved = s.unsaved;
    } catch (_) {}
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings: app.settings,
        learnMode: app.learnMode,
        unsaved: app.unsaved,
      }));
    } catch (_) {}
  }

  async function loadCommittedDataset() {
    try {
      const res = await fetch(DATASET_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('not-ok');
      const data = await res.json();
      app.committed = {
        version: data.version || 1,
        tricks: Array.isArray(data.tricks) ? data.tricks : [],
        samples: Array.isArray(data.samples) ? data.samples : [],
      };
    } catch (_) {
      app.committed = { version: 1, tricks: [], samples: [] };
    }
  }

  function allSamples() {
    return app.committed.samples.concat(app.unsaved);
  }

  function allTricks() {
    const seen = new Map();
    for (const t of app.committed.tricks) seen.set(t.name, t.difficulty);
    for (const s of app.unsaved) {
      if (s.trick && !seen.has(s.trick)) seen.set(s.trick, s.difficulty || 3);
    }
    return Array.from(seen.entries()).map(([name, difficulty]) => ({ name, difficulty }));
  }

  function trickCounts() {
    const counts = new Map();
    for (const s of allSamples()) {
      counts.set(s.trick, (counts.get(s.trick) || 0) + 1);
    }
    return counts;
  }

  function setState(next) {
    app.state = next;
    // CLASSIFYING continues listening for the next flip — init capture buffer + cooldown.
    if (next === State.CLASSIFYING) {
      if (!app.capture) app.capture = { ring: [], frames: [], startedAt: 0, freefallCount: 0 };
      app.triggerCooldownUntil = performance.now() + 400;
    }
    render();
  }

  function finishClassifying() {
    app.pendingSample = null;
    app.viz = null;
    setState(State.ARMED);
  }

  function render() {
    els.statusPill.textContent = app.state;
    els.statusPill.className = 'status-pill ' + app.state.toLowerCase();

    els.learnToggle.checked = app.learnMode;

    const showLabel = app.state === State.LABELLING;
    const showResult = app.state === State.CLASSIFYING;
    els.labelScreen.hidden = !showLabel;
    els.resultScreen.hidden = !showResult;
    els.resultActionsTop.hidden = !showResult;

    const isIdle = app.state === State.IDLE;
    const isArmed = app.state === State.ARMED;
    const isRecording = app.state === State.RECORDING;

    els.primaryBtn.hidden = showLabel || showResult;
    els.hint.hidden = showLabel || showResult;

    if (isIdle) {
      if (app.isMobile === false) {
        els.primaryBtn.textContent = 'Mobile only';
        els.primaryBtn.disabled = true;
        els.hint.textContent = 'Open this page on your phone over HTTPS.';
      } else {
        els.primaryBtn.textContent = 'Start';
        els.primaryBtn.disabled = false;
        els.hint.textContent = 'Tap Start to arm. Toss the phone — free-fall starts the capture.';
      }
    } else if (isArmed) {
      els.primaryBtn.textContent = 'Stop';
      els.primaryBtn.disabled = false;
      els.hint.textContent = 'Armed. Toss the phone — capture starts the moment it goes airborne.';
    } else if (isRecording) {
      els.primaryBtn.textContent = 'Recording…';
      els.primaryBtn.disabled = true;
      els.hint.textContent = 'Catch the phone to end capture.';
    }

    if (showLabel) renderLabelScreen();

    els.freefallLowInput.value = app.settings.freefallLow;
    els.freefallFramesInput.value = app.settings.freefallFrames;
    els.rotationLaunchInput.value = app.settings.rotationLaunch;
    els.catchDropFracInput.value = app.settings.catchOmegaDropFrac;
    els.catchDropFramesInput.value = app.settings.catchOmegaDropFrames;
    els.minAirtimeInput.value = app.settings.minAirtimeMs;
    els.prerollInput.value = app.settings.prerollFrames;
    els.maxRecordInput.value = app.settings.maxRecordMs;
    els.rotationWeightInput.value = app.settings.rotationWeight;
    els.useRotationInput.checked = !!app.settings.useRotationDistance;
    els.ambiguousMarginInput.value = app.settings.ambiguousMargin;
    els.bailedToleranceInput.value = app.settings.bailedTolerance;
    els.visualiseInput.checked = !!app.settings.visualise;
    els.inferDifficultyInput.checked = !!app.settings.inferDifficulty;

    const showViz = app.settings.visualise && (showLabel || showResult);
    els.vizSection.hidden = !showViz;
    if (showViz && app.viz) {
      requestAnimationFrame(() => drawViz(app.viz.current, app.viz.match, app.viz.label));
    }
    els.sampleRateReadout.textContent = 'Sample rate: ' + (app.sampleRateHz ? app.sampleRateHz.toFixed(1) : '—') + ' Hz';

    const tricks = allTricks();
    const samples = allSamples();
    els.statsTricks.textContent = tricks.length + ' tricks';
    els.statsSamples.textContent = samples.length + ' samples';
    els.statsUnsaved.textContent = app.unsaved.length + ' unsaved';
  }

  function renderLabelScreen() {
    const s = app.pendingSample;
    if (s && s.bailed) {
      els.labelBailedHint.hidden = false;
      els.labelBailedHint.textContent = 'BAILED · Δβ ' + Math.round(s.bailedDelta.dBeta)
        + '° · Δγ ' + Math.round(s.bailedDelta.dGamma) + '°'
        + (s.finishReason ? ' · end: ' + s.finishReason : '');
    } else if (s && s.finishReason) {
      els.labelBailedHint.hidden = false;
      els.labelBailedHint.style.background = 'transparent';
      els.labelBailedHint.style.color = '';
      els.labelBailedHint.textContent = 'end: ' + s.finishReason;
    } else {
      els.labelBailedHint.hidden = true;
    }
    const counts = trickCounts();
    const tricks = allTricks().slice().sort((a, b) => (counts.get(b.name) || 0) - (counts.get(a.name) || 0));
    els.trickButtons.innerHTML = '';
    for (const t of tricks) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '<strong>' + escapeHtml(t.name) + '</strong><small>difficulty ' + t.difficulty + ' · ' + (counts.get(t.name) || 0) + ' samples</small>';
      btn.addEventListener('click', () => saveLabelledSample(t.name, t.difficulty));
      els.trickButtons.appendChild(btn);
    }
    if (tricks.length === 0) {
      const note = document.createElement('p');
      note.className = 'muted small';
      note.textContent = 'No tricks yet — use the form below.';
      els.trickButtons.appendChild(note);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- sensor pipeline ----------

  async function requestMotionPermissionIfNeeded() {
    let motionGranted = true, orientationGranted = true;
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { motionGranted = (await DeviceMotionEvent.requestPermission()) === 'granted'; }
      catch (_) { motionGranted = false; }
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { orientationGranted = (await DeviceOrientationEvent.requestPermission()) === 'granted'; }
      catch (_) { orientationGranted = false; }
    }
    return motionGranted && orientationGranted;
  }

  function attachMotion() {
    if (app.motionHandler) return;
    app.lastFrameTs = 0;
    app.frameCount = 0;
    app.rateWindowStart = performance.now();
    app.motionHandler = (ev) => onMotion(ev);
    window.addEventListener('devicemotion', app.motionHandler);
    if (!app.orientationHandler) {
      app.orientationHandler = (ev) => {
        app.lastOrientation = {
          alpha: ev.alpha || 0,
          beta: ev.beta || 0,
          gamma: ev.gamma || 0,
        };
      };
      window.addEventListener('deviceorientation', app.orientationHandler);
    }
  }

  function detachMotion() {
    if (app.motionHandler) {
      window.removeEventListener('devicemotion', app.motionHandler);
      app.motionHandler = null;
    }
    if (app.orientationHandler) {
      window.removeEventListener('deviceorientation', app.orientationHandler);
      app.orientationHandler = null;
    }
  }

  function onMotion(ev) {
    const now = performance.now();
    app.frameCount++;
    if (now - app.rateWindowStart >= 1000) {
      app.sampleRateHz = app.frameCount * 1000 / (now - app.rateWindowStart);
      app.frameCount = 0;
      app.rateWindowStart = now;
      els.sampleRateReadout.textContent = 'Sample rate: ' + app.sampleRateHz.toFixed(1) + ' Hz';
    }

    const rr = ev.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    const aLin = ev.acceleration || { x: 0, y: 0, z: 0 };
    const aG = ev.accelerationIncludingGravity || aLin || { x: 0, y: 0, z: 0 };
    const frame = {
      t: now,
      accel: [aLin.x || 0, aLin.y || 0, aLin.z || 0],
      rotationRate: [rr.alpha || 0, rr.beta || 0, rr.gamma || 0],
      orientation: [0, 0, 0],
    };
    // Free-fall detection uses gravity-inclusive magnitude: ~9.8 at rest, ~0 in flight.
    const accelMag = Math.hypot(aG.x || 0, aG.y || 0, aG.z || 0);
    const omega = Math.hypot(frame.rotationRate[0], frame.rotationRate[1], frame.rotationRate[2]);

    // trigger bar: blend free-fall proximity + rotation proximity. Either path can launch.
    const ffLow = Math.max(0.01, app.settings.freefallLow);
    const rotLaunch = Math.max(1, app.settings.rotationLaunch);
    const ffRatio = accelMag <= ffLow ? 1 : Math.max(0, ffLow / accelMag);
    const rotRatio = Math.min(1, omega / rotLaunch);
    const fillRatio = Math.max(ffRatio, rotRatio);
    els.triggerFill.style.width = (fillRatio * 100).toFixed(1) + '%';
    els.triggerFill.classList.toggle('fired', fillRatio >= 1);

    if (app.state === State.ARMED || app.state === State.CLASSIFYING) {
      pushRing(frame);
      const inCooldown = app.triggerCooldownUntil && now < app.triggerCooldownUntil;
      if (!inCooldown) {
        if (accelMag < ffLow) {
          app.capture.freefallCount = (app.capture.freefallCount || 0) + 1;
        } else {
          app.capture.freefallCount = 0;
        }
        const ffLaunch = app.capture.freefallCount >= app.settings.freefallFrames;
        const rotLaunchHit = omega > rotLaunch;
        if (ffLaunch || rotLaunchHit) {
          play(app.popSound);
          startRecording(frame);
        }
      }
    } else if (app.state === State.RECORDING) {
      app.capture.frames.push(frame);
      const elapsed = now - app.capture.startedAt;

      // Track peak rotation. Catch = |ω| drops sharply from peak (hand grip kills spin).
      if (omega > (app.capture.peakOmega || 0)) app.capture.peakOmega = omega;

      let reason = null;
      const peakReached = app.capture.peakOmega >= rotLaunch * 0.5;
      if (elapsed >= app.settings.minAirtimeMs && peakReached) {
        const dropTarget = app.capture.peakOmega * app.settings.catchOmegaDropFrac;
        if (omega < dropTarget) {
          app.capture.omegaDropCount = (app.capture.omegaDropCount || 0) + 1;
          if (app.capture.omegaDropCount >= app.settings.catchOmegaDropFrames) reason = 'catch';
        } else {
          app.capture.omegaDropCount = 0;
        }
      }
      if (!reason && elapsed >= app.settings.maxRecordMs) reason = 'max-time';
      if (reason) {
        app.capture.finishReason = reason;
        finishRecording();
      }
    }
  }

  function pushRing(frame) {
    if (!app.capture) app.capture = { ring: [], frames: [], startedAt: 0, freefallCount: 0 };
    app.capture.ring.push(frame);
    if (app.capture.ring.length > app.settings.prerollFrames) app.capture.ring.shift();
  }

  function startRecording(triggerFrame) {
    const ring = (app.capture && app.capture.ring) ? app.capture.ring.slice() : [];
    app.capture = {
      ring: [],
      frames: ring.concat([triggerFrame]),
      startedAt: performance.now(),
      freefallCount: 0,
      peakOmega: 0,
      omegaDropCount: 0,
      startOrientation: app.lastOrientation ? { ...app.lastOrientation } : null,
    };
    setState(State.RECORDING);
  }

  // Screen-up score: projection of phone's +z axis onto world up. 1 = flat face up, 0 = vertical, -1 = face down.
  function screenUpScore(beta, gamma) {
    const b = beta * Math.PI / 180;
    const g = gamma * Math.PI / 180;
    return Math.cos(b) * Math.cos(g);
  }

  // shortest signed angular diff in degrees over a cyclic range
  function angDiff(a, b, range) {
    const half = range / 2;
    let d = ((b - a + half) % range + range) % range - half;
    return d;
  }

  function computeBailed(startO, endO) {
    if (!startO || !endO) return { bailed: false, dBeta: 0, dGamma: 0 };
    const dBeta = angDiff(startO.beta, endO.beta, 360);
    const dGamma = angDiff(startO.gamma, endO.gamma, 180);
    const tol = app.settings.bailedTolerance;
    const bailed = Math.max(Math.abs(dBeta), Math.abs(dGamma)) > tol;
    return { bailed, dBeta, dGamma };
  }

  function finishRecording() {
    const frames = app.capture.frames;
    const finishReason = app.capture.finishReason || 'unknown';
    const startOrientation = app.capture.startOrientation;
    const endOrientation = app.lastOrientation ? { ...app.lastOrientation } : null;
    app.capture = null;
    if (!frames || frames.length < 4) {
      setState(State.ARMED);
      app.capture = { ring: [], frames: [], startedAt: 0, freefallCount: 0 };
      return;
    }
    const sample = framesToSample(frames);
    sample.startOrientation = startOrientation;
    sample.endOrientation = endOrientation;
    const bailedInfo = computeBailed(startOrientation, endOrientation);
    sample.bailed = bailedInfo.bailed;
    sample.bailedDelta = { dBeta: bailedInfo.dBeta, dGamma: bailedInfo.dGamma };
    sample.finishReason = finishReason;
    play(sample.bailed ? app.bailSound : app.landSound);
    if (app.learnMode) {
      app.pendingSample = sample;
      app.viz = { current: sample, match: null, label: null };
      setState(State.LABELLING);
    } else {
      app.pendingSample = sample;
      classifyAndShow(sample);
    }
  }

  function framesToSample(frames) {
    const t0 = frames[0].t;
    return {
      id: 'sample-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36),
      trick: null,
      capturedAt: new Date().toISOString(),
      sampleRateHz: Math.round(app.sampleRateHz || 60),
      timestamps: frames.map(f => +(f.t - t0).toFixed(2)),
      accel: frames.map(f => f.accel.map(v => +v.toFixed(4))),
      rotationRate: frames.map(f => f.rotationRate.map(v => +v.toFixed(4))),
      orientation: frames.map(f => f.orientation),
    };
  }

  // ---------- classifier (DTW k-NN on rotation rate) ----------

  function resampleAndNormalize(series, target) {
    // series: array of [a,b,g]
    const N = series.length;
    if (N === 0) return [];
    const out = [];
    for (let i = 0; i < target; i++) {
      const idx = (i / (target - 1)) * (N - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      const frac = idx - lo;
      const a = series[lo], b = series[hi];
      out.push([
        a[0] + (b[0] - a[0]) * frac,
        a[1] + (b[1] - a[1]) * frac,
        a[2] + (b[2] - a[2]) * frac,
      ]);
    }
    const mean = [0, 0, 0];
    for (const f of out) { mean[0] += f[0]; mean[1] += f[1]; mean[2] += f[2]; }
    mean[0] /= out.length; mean[1] /= out.length; mean[2] /= out.length;
    for (const f of out) { f[0] -= mean[0]; f[1] -= mean[1]; f[2] -= mean[2]; }
    return out;
  }

  function frameDist(a, b) {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  function dtw(a, b, band) {
    const n = a.length, m = b.length;
    const w = Math.max(band || Math.floor(Math.max(n, m) / 8), Math.abs(n - m));
    const INF = Infinity;
    let prev = new Array(m + 1).fill(INF);
    let curr = new Array(m + 1).fill(INF);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      curr[0] = INF;
      const jStart = Math.max(1, i - w);
      const jEnd = Math.min(m, i + w);
      for (let j = 1; j <= m; j++) curr[j] = INF;
      for (let j = jStart; j <= jEnd; j++) {
        const cost = frameDist(a[i - 1], b[j - 1]);
        curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[m];
  }

  function sampleDurationMs(s) {
    if (!s.timestamps || s.timestamps.length === 0) return 0;
    return s.timestamps[s.timestamps.length - 1] - s.timestamps[0];
  }

  // Per-axis signed rotation (degrees): trapezoidal integral of ω_axis over time.
  // Net rotation around α, β, γ. Captures both magnitude and which axis spun.
  function rotationPerAxis(s) {
    const rr = s.rotationRate || [];
    const ts = s.timestamps || [];
    if (rr.length < 2 || ts.length !== rr.length) return [0, 0, 0];
    const out = [0, 0, 0];
    for (let i = 1; i < rr.length; i++) {
      const dtS = (ts[i] - ts[i - 1]) / 1000;
      for (let c = 0; c < 3; c++) out[c] += 0.5 * (rr[i - 1][c] + rr[i][c]) * dtS;
    }
    return out;
  }

  function rotationAxisDistance(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  }

  function resampleSeriesToLen(series, newLen) {
    const N = series.length;
    if (N === 0 || newLen <= 0) return [];
    if (N === newLen) return series.map(f => f.slice());
    const out = [];
    for (let i = 0; i < newLen; i++) {
      const idx = (i / (newLen - 1)) * (N - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      const frac = idx - lo;
      const a = series[lo], b = series[hi];
      const f = new Array(a.length);
      for (let c = 0; c < a.length; c++) f[c] = a[c] + (b[c] - a[c]) * frac;
      out.push(f);
    }
    return out;
  }

  // #22 — resample reference series to query sample rate so DTW alignment isn't biased by rate drift.
  function rateAlignToQuery(refSample, queryRate) {
    const rr = refSample.rotationRate || [];
    const refRate = refSample.sampleRateHz || queryRate || 60;
    if (!queryRate || refRate === queryRate || rr.length < 2) return rr;
    const ratio = queryRate / refRate;
    const newLen = Math.max(2, Math.round(rr.length * ratio));
    return resampleSeriesToLen(rr, newLen);
  }

  // #4 — feature builder. Mean-center rotationRate, append |ω|.
  function buildFeatures(rotationRate) {
    if (rotationRate.length === 0) return [];
    const series = rotationRate.map(f => [f[0], f[1], f[2]]);

    const mean = [0, 0, 0];
    for (const f of series) { mean[0] += f[0]; mean[1] += f[1]; mean[2] += f[2]; }
    mean[0] /= series.length; mean[1] /= series.length; mean[2] /= series.length;
    for (const f of series) { f[0] -= mean[0]; f[1] -= mean[1]; f[2] -= mean[2]; }

    return series.map(f => [f[0], f[1], f[2], Math.hypot(f[0], f[1], f[2])]);
  }

  // #8 class prototypes via medoid (sample with minimum sum-of-DTW to siblings).
  function invalidateMedoids() { app.medoids = null; app.inferredDifficulty = null; }

  const MEDOIDS_PER_CLASS = 3;

  function computeMedoids() {
    const byTrick = new Map();
    for (const s of allSamples()) {
      if (!s.trick) continue;
      if (!byTrick.has(s.trick)) byTrick.set(s.trick, []);
      byTrick.get(s.trick).push(s);
    }
    const medoids = new Map();
    for (const [trick, list] of byTrick) {
      if (list.length <= MEDOIDS_PER_CLASS) { medoids.set(trick, list.slice()); continue; }
      const feats = list.map(s => buildFeatures(s.rotationRate));
      const sums = list.map((_, i) => {
        let sum = 0;
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          sum += dtw(feats[i], feats[j]);
        }
        return { idx: i, sum };
      });
      sums.sort((a, b) => a.sum - b.sum);
      medoids.set(trick, sums.slice(0, MEDOIDS_PER_CLASS).map(s => list[s.idx]));
    }
    app.medoids = medoids;
  }

  function classify(sample) {
    if (!app.medoids) computeMedoids();
    const queryRate = sample.sampleRateHz || app.sampleRateHz || 60;
    const query = buildFeatures(sample.rotationRate);
    const rotQ = rotationPerAxis(sample);
    const mu = app.settings.useRotationDistance ? (app.settings.rotationWeight || 0) : 0;
    const scored = [];
    for (const [trick, exList] of app.medoids) {
      let best = null;
      for (const ex of exList) {
        const rateAlignedRR = rateAlignToQuery(ex, queryRate);
        const ref = buildFeatures(rateAlignedRR);
        if (ref.length === 0) continue;
        const dShape = dtw(query, ref);
        const dRot = rotationAxisDistance(rotQ, rotationPerAxis(ex));
        const d = dShape + mu * dRot;
        if (!best || d < best.distance) best = { trick, distance: d, dShape, dRot, id: ex.id };
      }
      if (best) scored.push(best);
    }
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, 3);
  }

  function classifyAndShow(sample) {
    const top = classify(sample);
    setState(State.CLASSIFYING);
    if (top.length === 0) {
      els.resultTitle.textContent = 'No dataset';
      els.resultSubtitle.textContent = 'Add samples in Learn mode first.';
      els.resultRows.innerHTML = '';
      app.viz = null;
      return;
    }
    const winner = top[0];
    const second = top[1];
    // #10 ambiguous gate: relative margin between top1 and top2.
    let ambiguous = false;
    if (second && winner.distance > 0) {
      const margin = (second.distance - winner.distance) / winner.distance;
      ambiguous = margin < app.settings.ambiguousMargin;
    }
    const difficulty = displayedDifficulty(winner.trick);
    const titlePrefix = sample.bailed ? 'BAILED — ' : (ambiguous ? '? ' : '');
    els.resultTitle.textContent = titlePrefix + (winner.trick || '(unlabelled)');
    const subParts = [];
    subParts.push('Difficulty ' + (difficulty != null ? difficulty : '?'));
    subParts.push('distance ' + winner.distance.toFixed(2));
    if (ambiguous) subParts.push('AMBIGUOUS vs ' + (second.trick || '?'));
    if (sample.bailed && sample.bailedDelta) {
      subParts.push('Δβ ' + Math.round(sample.bailedDelta.dBeta) + '° · Δγ ' + Math.round(sample.bailedDelta.dGamma) + '°');
    }
    if (sample.finishReason) subParts.push('end: ' + sample.finishReason);
    els.resultSubtitle.textContent = subParts.join(' · ');
    const rotQ = rotationPerAxis(sample);
    els.resultRows.innerHTML = '';
    appendResultRow('captured', 'captured', null, null, rotQ, false, false);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const ref = allSamples().find(s => s.id === r.id);
      const rotR = ref ? rotationPerAxis(ref) : null;
      appendResultRow(r.trick || '?', '', r.distance, r.dShape, rotR, i === 0, i === 1 && ambiguous);
    }
    const matchSample = winner.id ? allSamples().find(s => s.id === winner.id) : null;
    app.viz = { current: sample, match: matchSample, label: winner.trick };
    render();
  }

  function appendResultRow(label, kind, total, shape, rotAxis, winner, ambiguous) {
    const tr = document.createElement('tr');
    if (kind === 'captured') tr.className = 'captured';
    else if (winner) tr.className = 'winner';
    else if (ambiguous) tr.className = 'ambiguous';
    const rotText = !rotAxis ? '—' :
      Math.round(rotAxis[0]) + '/' + Math.round(rotAxis[1]) + '/' + Math.round(rotAxis[2]) + '°';
    const cells = [
      label,
      total == null ? '—' : total.toFixed(2),
      shape == null ? '—' : shape.toFixed(2),
      rotText,
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    els.resultRows.appendChild(tr);
  }

  // #16 inferred difficulty: per-trick metric = mean(peak|ω| * duration_s),
  // mapped to 1..10 via min/max across tricks in dataset.
  function displayedDifficulty(trickName) {
    if (!trickName) return null;
    const stored = (allTricks().find(t => t.name === trickName) || {}).difficulty;
    if (!app.settings.inferDifficulty) return stored;
    if (!app.inferredDifficulty) app.inferredDifficulty = computeInferredDifficulty();
    return app.inferredDifficulty.get(trickName) != null ? app.inferredDifficulty.get(trickName) : stored;
  }

  function computeInferredDifficulty() {
    const byTrick = new Map();
    for (const s of allSamples()) {
      if (!s.trick) continue;
      const peak = peakOmega(s);
      const dur = sampleDurationMs(s) / 1000;
      const score = peak * dur;
      if (!byTrick.has(s.trick)) byTrick.set(s.trick, []);
      byTrick.get(s.trick).push(score);
    }
    const averages = new Map();
    for (const [k, arr] of byTrick) averages.set(k, arr.reduce((a, b) => a + b, 0) / arr.length);
    if (averages.size === 0) return averages;
    const values = Array.from(averages.values());
    const lo = Math.min(...values), hi = Math.max(...values);
    const out = new Map();
    for (const [k, v] of averages) {
      const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
      out.set(k, Math.round(1 + t * 9));
    }
    return out;
  }

  function peakOmega(sample) {
    let m = 0;
    for (const f of sample.rotationRate || []) {
      const o = Math.hypot(f[0], f[1], f[2]);
      if (o > m) m = o;
    }
    return m;
  }

  // ---------- visualisation ----------

  function vizSeriesFromSample(s, queryRate) {
    if (!s) return null;
    const rr = queryRate ? rateAlignToQuery(s, queryRate) : s.rotationRate;
    return buildFeatures(rr);
  }

  function drawViz(currentSample, matchSample, matchLabel) {
    const canvas = els.vizCanvas;
    if (!canvas) return;
    if (canvas.clientWidth === 0) {
      requestAnimationFrame(() => drawViz(currentSample, matchSample, matchLabel));
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = 240;
    const queryRate = currentSample ? (currentSample.sampleRateHz || app.sampleRateHz || 60) : null;
    const currentSeries = vizSeriesFromSample(currentSample, null);
    const matchSeries = vizSeriesFromSample(matchSample, queryRate);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const styles = getComputedStyle(document.documentElement);
    const fg = styles.getPropertyValue('--pico-color') || '#000';
    const grid = styles.getPropertyValue('--pico-muted-border-color') || '#888';
    ctx.clearRect(0, 0, cssW, cssH);

    const series = [];
    if (currentSeries && currentSeries.length) series.push({ data: currentSeries, dashed: false });
    if (matchSeries && matchSeries.length) series.push({ data: matchSeries, dashed: true });
    if (series.length === 0) return;
    const channels = Math.min(...series.map(s => s.data[0].length));

    let min = Infinity, max = -Infinity;
    for (const s of series) {
      for (const f of s.data) {
        for (let c = 0; c < channels; c++) {
          const v = f[c];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.1;
    min -= pad; max += pad;

    const padL = 8, padR = 8, padT = 8, padB = 8;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;
    const yOf = v => padT + plotH * (1 - (v - min) / (max - min));
    const xOf = (i, n) => padL + plotW * (n <= 1 ? 0 : i / (n - 1));

    ctx.strokeStyle = grid;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    const zeroY = yOf(0);
    ctx.moveTo(padL, zeroY); ctx.lineTo(cssW - padR, zeroY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const colors = ['#e24a4a', '#4a90e2', '#4ae28a', '#e2a04a'];
    for (const s of series) {
      ctx.setLineDash(s.dashed ? [6, 4] : []);
      ctx.lineWidth = s.dashed ? 1.5 : 2;
      ctx.globalAlpha = s.dashed ? 0.6 : 1;
      for (let ch = 0; ch < channels; ch++) {
        ctx.strokeStyle = colors[ch];
        ctx.beginPath();
        const n = s.data.length;
        for (let i = 0; i < n; i++) {
          const x = xOf(i, n);
          const y = yOf(s.data[i][ch]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const channelNames = ['α (red)', 'β (blue)', 'γ (green)', '|ω| (orange)'];
    let legend = 'solid: capture · ' + channelNames.slice(0, channels).join(' · ');
    if (matchSample) legend += ' — dashed: ' + (matchLabel || matchSample.trick || '?');
    els.vizLegend.textContent = legend;
  }

  // ---------- actions ----------

  function saveLabelledSample(name, difficulty) {
    if (!app.pendingSample) return;
    app.pendingSample.trick = name;
    if (difficulty != null) app.pendingSample.difficulty = difficulty;
    app.unsaved.push(app.pendingSample);
    app.pendingSample = null;
    app.viz = null;
    invalidateMedoids();
    saveLocal();
    setState(State.ARMED);
  }

  function exportDataset() {
    const merged = {
      version: app.committed.version || 1,
      tricks: mergeTricks(),
      samples: app.committed.samples.concat(app.unsaved.map(s => {
        const { difficulty, ...rest } = s;
        return rest;
      })),
    };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tricks.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function mergeTricks() {
    const map = new Map();
    for (const t of app.committed.tricks) map.set(t.name, t.difficulty);
    for (const s of app.unsaved) {
      if (s.trick && !map.has(s.trick)) map.set(s.trick, s.difficulty != null ? s.difficulty : 3);
    }
    return Array.from(map.entries()).map(([name, difficulty]) => ({ name, difficulty }));
  }

  // ---------- wiring ----------

  els.primaryBtn.addEventListener('click', async () => {
    if (app.state === State.IDLE) {
      const granted = await requestMotionPermissionIfNeeded();
      if (!granted) {
        els.hint.textContent = 'Motion permission denied. Reload and accept the prompt.';
        return;
      }
      attachMotion();
      acquireWakeLock();
      app.capture = { ring: [], frames: [], startedAt: 0, freefallCount: 0 };
      setState(State.ARMED);
    } else if (app.state === State.ARMED) {
      detachMotion();
      releaseWakeLock();
      app.capture = null;
      els.triggerFill.style.width = '0%';
      els.triggerFill.classList.remove('fired');
      setState(State.IDLE);
    }
  });

  els.learnToggle.addEventListener('change', () => {
    app.learnMode = els.learnToggle.checked;
    saveLocal();
    render();
  });

  els.exportBtn.addEventListener('click', exportDataset);

  els.settingsBtn.addEventListener('click', () => {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });

  els.freefallLowInput.addEventListener('change', () => {
    app.settings.freefallLow = clamp(+els.freefallLowInput.value || DEFAULTS.freefallLow, 0.1, 9.8);
    saveLocal();
    render();
  });
  els.freefallFramesInput.addEventListener('change', () => {
    const v = parseInt(els.freefallFramesInput.value, 10);
    app.settings.freefallFrames = Number.isFinite(v) ? clamp(v, 1, 30) : DEFAULTS.freefallFrames;
    saveLocal();
    render();
  });
  els.rotationLaunchInput.addEventListener('change', () => {
    app.settings.rotationLaunch = clamp(+els.rotationLaunchInput.value || DEFAULTS.rotationLaunch, 50, 3000);
    saveLocal();
    render();
  });
  els.catchDropFracInput.addEventListener('change', () => {
    app.settings.catchOmegaDropFrac = clamp(+els.catchDropFracInput.value || DEFAULTS.catchOmegaDropFrac, 0.05, 0.95);
    saveLocal();
    render();
  });
  els.catchDropFramesInput.addEventListener('change', () => {
    const v = parseInt(els.catchDropFramesInput.value, 10);
    app.settings.catchOmegaDropFrames = Number.isFinite(v) ? clamp(v, 1, 30) : DEFAULTS.catchOmegaDropFrames;
    saveLocal();
    render();
  });
  els.minAirtimeInput.addEventListener('change', () => {
    app.settings.minAirtimeMs = clamp(+els.minAirtimeInput.value || DEFAULTS.minAirtimeMs, 0, 2000);
    saveLocal();
    render();
  });
  els.prerollInput.addEventListener('change', () => {
    app.settings.prerollFrames = clamp(+els.prerollInput.value || DEFAULTS.prerollFrames, 0, 60);
    saveLocal();
    render();
  });
  els.maxRecordInput.addEventListener('change', () => {
    app.settings.maxRecordMs = clamp(+els.maxRecordInput.value || DEFAULTS.maxRecordMs, 200, 10000);
    saveLocal();
    render();
  });
  els.rotationWeightInput.addEventListener('change', () => {
    app.settings.rotationWeight = clamp(+els.rotationWeightInput.value || 0, 0, 10);
    saveLocal();
    render();
  });
  els.useRotationInput.addEventListener('change', () => {
    app.settings.useRotationDistance = els.useRotationInput.checked;
    saveLocal();
    render();
  });
  els.ambiguousMarginInput.addEventListener('change', () => {
    app.settings.ambiguousMargin = clamp(+els.ambiguousMarginInput.value || 0, 0, 1);
    saveLocal();
    render();
  });
  els.bailedToleranceInput.addEventListener('change', () => {
    app.settings.bailedTolerance = clamp(+els.bailedToleranceInput.value || 0, 0, 180);
    saveLocal();
    render();
  });
  els.inferDifficultyInput.addEventListener('change', () => {
    app.settings.inferDifficulty = els.inferDifficultyInput.checked;
    saveLocal();
    render();
  });
  els.visualiseInput.addEventListener('change', () => {
    app.settings.visualise = els.visualiseInput.checked;
    saveLocal();
    render();
  });

  els.resetLocalBtn.addEventListener('click', () => {
    if (!confirm('Wipe all local state? This clears settings AND ' + app.unsaved.length + ' unsaved samples.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    location.reload();
  });

  els.clearUnsavedBtn.addEventListener('click', () => {
    if (app.unsaved.length === 0) return;
    if (!confirm('Discard ' + app.unsaved.length + ' unsaved samples?')) return;
    app.unsaved = [];
    invalidateMedoids();
    saveLocal();
    render();
  });

  els.newTrickForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.newTrickName.value.trim().toLowerCase();
    const diff = clamp(+els.newTrickDifficulty.value || 3, 1, 10);
    if (!name) return;
    saveLabelledSample(name, diff);
    els.newTrickName.value = '';
  });

  els.discardBtn.addEventListener('click', () => {
    app.pendingSample = null;
    app.viz = null;
    setState(State.ARMED);
  });

  els.resultDoneTopBtn.addEventListener('click', finishClassifying);

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // #18 wake lock — keep screen on while armed/recording.
  async function acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        app.wakeLock = await navigator.wakeLock.request('screen');
        app.wakeLock.addEventListener('release', () => { app.wakeLock = null; });
      }
    } catch (_) {}
  }

  function releaseWakeLock() {
    if (app.wakeLock) {
      try { app.wakeLock.release(); } catch (_) {}
      app.wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && app.state !== State.IDLE && !app.wakeLock) {
      acquireWakeLock();
    }
  });

  // ---------- init ----------

  function loadAudio() {
    try {
      app.popSound = new Audio('./audio/ollie-pop.wav');
      app.landSound = new Audio('./audio/ollie-land.wav');
      app.bailSound = new Audio('./audio/bail.wav');
      app.popSound.preload = 'auto';
      app.landSound.preload = 'auto';
      app.bailSound.preload = 'auto';
    } catch (_) {}
  }

  function play(snd) {
    if (!snd) return;
    try { snd.currentTime = 0; snd.play().catch(() => {}); } catch (_) {}
  }

  function renderDesktopQr() {
    const host = document.getElementById('desktop-banner-qr');
    const urlEl = document.getElementById('desktop-banner-url');
    const url = window.location.href;
    if (urlEl) urlEl.textContent = url;
    if (!host || typeof qrcode !== 'function') return;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      host.innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
    } catch (e) {
      host.hidden = true;
    }
  }

  function isMobileDevice() {
    if (!('DeviceMotionEvent' in window)) return false;
    if (navigator.maxTouchPoints > 0) return true;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  (async function init() {
    loadLocal();
    loadAudio();
    await loadCommittedDataset();
    invalidateMedoids();
    app.isMobile = isMobileDevice();
    if (!app.isMobile) {
      const banner = document.getElementById('desktop-banner');
      if (banner) banner.hidden = false;
      renderDesktopQr();
    }
    render();
  })();
})();
