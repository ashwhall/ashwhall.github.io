(() => {
  'use strict';

  // ---------- Music ----------

  const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTE_NAMES = ROOTS;
  const MODES = {
    major:         [0, 2, 4, 5, 7, 9, 11],
    naturalMinor:  [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor:  [0, 2, 3, 5, 7, 9, 11],
    dorian:        [0, 2, 3, 5, 7, 9, 10],
    phrygian:      [0, 1, 3, 5, 6, 8, 10],
    lydian:        [0, 2, 4, 6, 7, 9, 11],
    mixolydian:    [0, 2, 4, 5, 7, 9, 10],
    locrian:       [0, 1, 3, 5, 6, 8, 10],
  };

  function midiOf(rootIdx, modeKey, octave, degree) {
    return 12 * (octave + 1) + rootIdx + MODES[modeKey][degree];
  }
  function noteName(midi) {
    return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }
  function freqOf(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ---------- Audio ----------

  let actx = null;
  let master = null;       // sum bus (voices connect here, dry path)
  let reverbSend = null;   // voices also send here for wet path
  let reverbWet = null;    // wet output gain (slider-controlled)
  let convNode = null;     // ConvolverNode (buffer swapped to change tail length)

  function makeImpulse(ctx, durSec, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * durSec);
    const buf = ctx.createBuffer(2, len, rate);
    let seed = 0x9E3779B9 >>> 0;
    const rand = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    };
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, decay);
        // Light early reflection emphasis
        const early = i < rate * 0.04 ? 1.6 : 1.0;
        data[i] = rand() * env * early;
      }
    }
    return buf;
  }

  function ensureAudio() {
    if (actx) {
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    actx = new Ctx();

    const sumBus = actx.createGain();
    sumBus.gain.value = 1;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const out = actx.createGain();
    out.gain.value = 0.85;
    sumBus.connect(comp).connect(out).connect(actx.destination);

    // Reverb path: voices → reverbSend → preDamp → conv → reverbWet → sumBus
    convNode = actx.createConvolver();
    rebuildImpulse();
    const preDamp = actx.createBiquadFilter();
    preDamp.type = 'lowpass';
    preDamp.frequency.value = 4200;
    preDamp.Q.value = 0.5;
    reverbSend = actx.createGain();
    reverbSend.gain.value = 1;
    reverbWet = actx.createGain();
    reverbWet.gain.value = state.reverb;
    reverbSend.connect(preDamp).connect(convNode).connect(reverbWet).connect(sumBus);

    master = sumBus;
    return actx;
  }

  function reverbLengthSeconds() {
    return 0.6 + state.reverb * 6.4; // 0.6s → 7.0s
  }
  function rebuildImpulse() {
    if (!actx || !convNode) return;
    const dur = reverbLengthSeconds();
    const decay = 1.8 + state.reverb * 1.6; // shape of falloff
    convNode.buffer = makeImpulse(actx, dur, decay);
  }

  function playNote(midi, velocity) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const v = Math.max(0.05, Math.min(1, velocity));
    const t0 = ctx.currentTime;
    const peak = 0.10 + 0.22 * v;
    const release = 0.45 + 0.35 * v;
    const f = freqOf(midi);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(f, t0);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(f / 2, t0);
    const sub = ctx.createGain();
    sub.gain.value = 0.28;
    osc2.connect(sub);

    const mix = ctx.createGain();
    mix.gain.value = 1;
    osc1.connect(mix);
    sub.connect(mix);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 0.6;
    const cutoff = 1400 + v * 3400;
    lpf.frequency.setValueAtTime(cutoff, t0);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(420, cutoff * 0.35), t0 + release);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.010);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + release);

    mix.connect(lpf).connect(env);
    env.connect(master);
    if (reverbSend) env.connect(reverbSend);
    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + release + 0.05);
    osc2.stop(t0 + release + 0.05);
  }

  // ---------- State ----------

  const HALF_LEN = 60;
  const BALL_R = 12;
  const GRAVITY = 1400;     // px/s^2
  const DT = 1 / 120;
  const MAX_SUBSTEPS = 8;
  const COOLDOWN_STEPS = 6; // ~50ms at 120Hz
  const HIT_VEL_MIN = 12;   // below: skip note

  const VEL_SCALE = 4;  // world-px drag → initial velocity (px/s)

  const state = {
    scale: { rootIdx: 0, mode: 'major', octave: 4 },
    bars: [],
    nextBarId: 1,
    spawns: [],         // [{x, y, vx, vy}, ...]
    balls: [],          // [{x, y, vx, vy}, ...]
    mode: 'edit',       // 'edit' | 'play'
    simStep: 0,
    gravityOn: true,
    bounciness: 0.82, // 0..1; 1 = perfectly elastic
    reverb: 0.35,     // 0..1 wet level
    camera: { x: 0, y: 0, zoom: 1 },
    cameraAtPlay: null,
    lastHits: [],
  };

  // ---------- Canvas / Camera ----------

  const canvas = document.getElementById('stage');
  const ctx2d = canvas.getContext('2d');
  let DPR = Math.max(1, window.devicePixelRatio || 1);
  let W = 0, H = 0;

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  function screenToWorld(sx, sy) {
    const c = state.camera;
    return {
      x: (sx - W / 2) / c.zoom + c.x,
      y: (sy - H / 2) / c.zoom + c.y,
    };
  }
  function worldToScreen(wx, wy) {
    const c = state.camera;
    return {
      x: (wx - c.x) * c.zoom + W / 2,
      y: (wy - c.y) * c.zoom + H / 2,
    };
  }

  // ---------- Geometry helpers ----------

  function barEndpoints(b) {
    const cx = Math.cos(b.angle), sn = Math.sin(b.angle);
    return {
      p1x: b.cx - cx * b.halfLen, p1y: b.cy - sn * b.halfLen,
      p2x: b.cx + cx * b.halfLen, p2y: b.cy + sn * b.halfLen,
    };
  }
  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = ((px - ax) * dx + (py - ay) * dy) / (len2 || 1);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return { x: ax + t * dx, y: ay + t * dy, t };
  }
  function distPointSeg(px, py, ax, ay, bx, by) {
    const c = closestPointOnSegment(px, py, ax, ay, bx, by);
    const dx = px - c.x, dy = py - c.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------- Physics ----------

  function step() {
    if (state.balls.length === 0) { state.simStep++; return; }
    for (let bi = 0; bi < state.balls.length; bi++) {
      const ball = state.balls[bi];
      if (state.gravityOn) ball.vy += GRAVITY * DT;
      ball.x += ball.vx * DT;
      ball.y += ball.vy * DT;

      for (let i = 0; i < state.bars.length; i++) {
        const bar = state.bars[i];
        const { p1x, p1y, p2x, p2y } = barEndpoints(bar);
        const cp = closestPointOnSegment(ball.x, ball.y, p1x, p1y, p2x, p2y);
        const dx = ball.x - cp.x, dy = ball.y - cp.y;
        const dist2 = dx * dx + dy * dy;
        const radius = BALL_R;
        if (dist2 < radius * radius) {
          const dist = Math.sqrt(dist2) || 0.0001;
          const nx = dx / dist, ny = dy / dist;
          const overlap = radius - dist;
          ball.x += nx * overlap;
          ball.y += ny * overlap;
          const vn = ball.vx * nx + ball.vy * ny;
          if (vn < 0) {
            const tx = -ny, ty = nx;
            const vt = ball.vx * tx + ball.vy * ty;
            const e = state.bounciness;
            const friction = (1 - e) * 0.05; // 0 friction at 100% bounciness
            const newVn = -vn * e;
            const newVt = vt * (1 - friction);
            ball.vx = nx * newVn + tx * newVt;
            ball.vy = ny * newVn + ty * newVt;

            const impact = -vn;
            if (impact >= HIT_VEL_MIN && state.simStep >= bar.cooldownStep) {
              bar.cooldownStep = state.simStep + COOLDOWN_STEPS;
              const v = Math.min(1, impact / 900);
              playNote(bar.midi, v);
              bar.flash = 1;
            }
          }
        }
      }
    }
    state.simStep++;
  }

  // ---------- Render ----------

  function drawGrid() {
    const c = state.camera;
    const spacingWorld = 80;
    const spacingScreen = spacingWorld * c.zoom;
    if (spacingScreen < 18) return; // too dense
    const startWx = c.x - (W / 2) / c.zoom;
    const startWy = c.y - (H / 2) / c.zoom;
    const firstX = Math.floor(startWx / spacingWorld) * spacingWorld;
    const firstY = Math.floor(startWy / spacingWorld) * spacingWorld;
    ctx2d.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    for (let wx = firstX; wx < startWx + W / c.zoom + spacingWorld; wx += spacingWorld) {
      const s = worldToScreen(wx, 0);
      ctx2d.moveTo(s.x, 0);
      ctx2d.lineTo(s.x, H);
    }
    for (let wy = firstY; wy < startWy + H / c.zoom + spacingWorld; wy += spacingWorld) {
      const s = worldToScreen(0, wy);
      ctx2d.moveTo(0, s.y);
      ctx2d.lineTo(W, s.y);
    }
    ctx2d.stroke();
  }

  function colorForMidi(midi) {
    const pc = ((midi % 12) + 12) % 12;
    const hue = (pc * 30) % 360;
    return `hsl(${hue} 70% 62%)`;
  }

  function drawBar(bar) {
    const { p1x, p1y, p2x, p2y } = barEndpoints(bar);
    const a = worldToScreen(p1x, p1y);
    const b = worldToScreen(p2x, p2y);
    const flash = bar.flash || 0;
    ctx2d.lineCap = 'round';
    ctx2d.strokeStyle = colorForMidi(bar.midi);
    ctx2d.lineWidth = (8 + flash * 6) * state.camera.zoom;
    ctx2d.globalAlpha = 0.95;
    ctx2d.beginPath();
    ctx2d.moveTo(a.x, a.y);
    ctx2d.lineTo(b.x, b.y);
    ctx2d.stroke();
    ctx2d.globalAlpha = 1;

    if (state.mode === 'edit') {
      ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
      ctx2d.beginPath(); ctx2d.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.beginPath(); ctx2d.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx2d.fill();
    }

    // Label at center
    const cs = worldToScreen(bar.cx, bar.cy);
    ctx2d.fillStyle = 'rgba(255,255,255,0.85)';
    ctx2d.font = `${12 * Math.min(1.4, state.camera.zoom)}px -apple-system, system-ui, sans-serif`;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(noteName(bar.midi), cs.x, cs.y - 14);

    if (flash > 0) bar.flash = Math.max(0, flash - 0.08);
  }

  function drawBalls() {
    for (let i = 0; i < state.balls.length; i++) {
      const ball = state.balls[i];
      const s = worldToScreen(ball.x, ball.y);
      const r = BALL_R * state.camera.zoom;
      const grad = ctx2d.createRadialGradient(s.x - r * 0.3, s.y - r * 0.3, r * 0.1, s.x, s.y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#7fd1ff');
      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }

  function drawSpawns() {
    if (state.mode !== 'edit') return;
    for (let i = 0; i < state.spawns.length; i++) {
      const sp = state.spawns[i];
      const s = worldToScreen(sp.x, sp.y);
      const r = BALL_R * state.camera.zoom;
      ctx2d.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx2d.fillStyle = 'rgba(127,209,255,0.18)';
      ctx2d.setLineDash([4, 4]);
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.stroke();
      ctx2d.setLineDash([]);

      // Velocity arrow
      const vmag = Math.hypot(sp.vx, sp.vy);
      if (vmag > 1) {
        const ex = sp.x + sp.vx / VEL_SCALE;
        const ey = sp.y + sp.vy / VEL_SCALE;
        const eScreen = worldToScreen(ex, ey);
        ctx2d.strokeStyle = 'rgba(255,204,102,0.9)';
        ctx2d.fillStyle = 'rgba(255,204,102,0.9)';
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.moveTo(s.x, s.y);
        ctx2d.lineTo(eScreen.x, eScreen.y);
        ctx2d.stroke();
        // Arrowhead
        const ang = Math.atan2(eScreen.y - s.y, eScreen.x - s.x);
        const ah = 8;
        ctx2d.beginPath();
        ctx2d.moveTo(eScreen.x, eScreen.y);
        ctx2d.lineTo(eScreen.x - ah * Math.cos(ang - 0.5), eScreen.y - ah * Math.sin(ang - 0.5));
        ctx2d.lineTo(eScreen.x - ah * Math.cos(ang + 0.5), eScreen.y - ah * Math.sin(ang + 0.5));
        ctx2d.closePath();
        ctx2d.fill();
      }
    }
  }

  function drawGhost() {
    if (!drag || drag.kind !== 'palette') return;
    const wx = drag.worldX, wy = drag.worldY;
    const half = HALF_LEN;
    const a = worldToScreen(wx - half, wy);
    const b = worldToScreen(wx + half, wy);
    ctx2d.globalAlpha = drag.overCanvas ? 0.75 : 0.3;
    ctx2d.lineCap = 'round';
    ctx2d.strokeStyle = colorForMidi(drag.midi);
    ctx2d.lineWidth = 8 * state.camera.zoom;
    ctx2d.setLineDash(drag.overCanvas ? [] : [6, 6]);
    ctx2d.beginPath();
    ctx2d.moveTo(a.x, a.y);
    ctx2d.lineTo(b.x, b.y);
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.globalAlpha = 1;
  }

  function render() {
    ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx2d.clearRect(0, 0, W, H);
    drawGrid();
    drawSpawns();
    for (let i = 0; i < state.bars.length; i++) drawBar(state.bars[i]);
    drawBalls();
    drawGhost();
  }

  // ---------- Main loop ----------

  let lastTime = 0;
  let accumulator = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    let frame = (now - lastTime) / 1000;
    lastTime = now;
    if (frame > 0.25) frame = 0.25;

    if (state.mode === 'play') {
      accumulator += frame;
      let substeps = 0;
      while (accumulator >= DT && substeps < MAX_SUBSTEPS) {
        step();
        accumulator -= DT;
        substeps++;
      }
      // Camera follow: centroid of balls
      if (state.balls.length > 0) {
        let mx = 0, my = 0;
        for (const b of state.balls) { mx += b.x; my += b.y; }
        mx /= state.balls.length; my /= state.balls.length;
        const c = state.camera;
        const lerp = 0.08;
        c.x += (mx - c.x) * lerp;
        c.y += (my - c.y) * lerp;
      }
    } else {
      accumulator = 0;
    }

    render();
  }
  requestAnimationFrame(loop);

  // ---------- Palette ----------

  const paletteEl = document.getElementById('palette');
  function rebuildPalette() {
    paletteEl.innerHTML = '';
    const { rootIdx, mode, octave } = state.scale;
    const degrees = MODES[mode];
    for (let d = 0; d < degrees.length; d++) {
      const midi = midiOf(rootIdx, mode, octave, d);
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.dataset.midi = String(midi);
      chip.style.borderColor = colorForMidi(midi);
      chip.innerHTML = `<span>${noteName(midi)}</span><span class="deg">${d + 1}</span>`;
      chip.addEventListener('pointerdown', onChipPointerDown);
      paletteEl.appendChild(chip);
    }
    // Add high tonic as 8th chip
    const midiOctave = midiOf(rootIdx, mode, octave + 1, 0);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.midi = String(midiOctave);
    chip.style.borderColor = colorForMidi(midiOctave);
    chip.innerHTML = `<span>${noteName(midiOctave)}</span><span class="deg">8</span>`;
    chip.addEventListener('pointerdown', onChipPointerDown);
    paletteEl.appendChild(chip);
  }

  // ---------- Input ----------

  let drag = null;
  // drag shapes:
  //  { kind: 'palette', midi, overCanvas, worldX, worldY }
  //  { kind: 'move', bar, offsetX, offsetY }
  //  { kind: 'rotate', bar, endpointSign }
  //  { kind: 'pan', startCamX, startCamY, startPx, startPy }

  function onChipPointerDown(e) {
    if (state.mode !== 'edit') return;
    e.preventDefault();
    ensureAudio();
    const midi = Number(e.currentTarget.dataset.midi);
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    drag = { kind: 'palette', midi, overCanvas: false, worldX: w.x, worldY: w.y };
    e.currentTarget.classList.add('dragging');
    drag.chipEl = e.currentTarget;
    document.addEventListener('pointermove', onPaletteDragMove);
    document.addEventListener('pointerup', onPaletteDragUp, { once: true });
    document.addEventListener('pointercancel', onPaletteDragUp, { once: true });
  }
  function onPaletteDragMove(e) {
    if (!drag || drag.kind !== 'palette') return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    drag.worldX = w.x; drag.worldY = w.y;
    const paletteWrap = document.querySelector('.palette-wrap');
    const topbar = document.querySelector('.topbar');
    const paletteTop = paletteWrap ? paletteWrap.getBoundingClientRect().top : H;
    const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 0;
    drag.overCanvas = (e.clientY < paletteTop - 4 && e.clientY > topbarBottom + 4);
  }
  function onPaletteDragUp(e) {
    document.removeEventListener('pointermove', onPaletteDragMove);
    if (!drag || drag.kind !== 'palette') { drag = null; return; }
    if (drag.chipEl) drag.chipEl.classList.remove('dragging');
    if (drag.overCanvas) {
      state.bars.push({
        id: state.nextBarId++,
        cx: drag.worldX, cy: drag.worldY,
        angle: 0, halfLen: HALF_LEN,
        midi: drag.midi,
        cooldownStep: 0,
        flash: 0,
      });
      hideHint();
    }
    drag = null;
  }

  // Canvas interactions
  function pickSpawn(wx, wy) {
    const pickR = BALL_R + 4 / state.camera.zoom;
    for (let i = state.spawns.length - 1; i >= 0; i--) {
      const sp = state.spawns[i];
      const dx = wx - sp.x, dy = wy - sp.y;
      if (dx * dx + dy * dy <= pickR * pickR) return sp;
    }
    return null;
  }

  function pickBar(wx, wy) {
    // returns {bar, kind: 'endpoint'|'body', endpointSign?}
    let best = null;
    for (let i = state.bars.length - 1; i >= 0; i--) {
      const bar = state.bars[i];
      const { p1x, p1y, p2x, p2y } = barEndpoints(bar);
      const dx1 = wx - p1x, dy1 = wy - p1y;
      const dx2 = wx - p2x, dy2 = wy - p2y;
      const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      const endR = 14 / state.camera.zoom;
      if (d1 < endR) return { bar, kind: 'endpoint', endpointSign: -1 };
      if (d2 < endR) return { bar, kind: 'endpoint', endpointSign: 1 };
      const dSeg = distPointSeg(wx, wy, p1x, p1y, p2x, p2y);
      if (dSeg < 12 / state.camera.zoom) {
        best = { bar, kind: 'body' };
      }
    }
    return best;
  }

  let panKey = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') panKey = true;
    if (e.key === 'c' || e.key === 'C') recenterCamera();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') panKey = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas) return;
    ensureAudio();
    canvas.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    const w = screenToWorld(sx, sy);

    if (e.button === 1 || panKey) {
      drag = { kind: 'pan', startCamX: state.camera.x, startCamY: state.camera.y, startPx: sx, startPy: sy };
      return;
    }
    if (e.button === 2) {
      // Let contextmenu handler deal with delete; do not start any drag.
      return;
    }

    if (state.mode === 'edit') {
      const hit = pickBar(w.x, w.y);
      if (hit) {
        if (e.metaKey || e.ctrlKey) {
          const clone = { ...hit.bar, id: state.nextBarId++, cooldownStep: 0, flash: 0 };
          state.bars.push(clone);
          hit.bar = clone;
        }
        if (hit.kind === 'endpoint') {
          drag = { kind: 'rotate', bar: hit.bar, endpointSign: hit.endpointSign };
        } else {
          drag = { kind: 'move', bar: hit.bar, offsetX: w.x - hit.bar.cx, offsetY: w.y - hit.bar.cy };
        }
        return;
      }
      // Spawn handling: click existing → start vel-drag (treat tap as toggle-off).
      // Click empty → add new spawn at point and start vel-drag from it.
      const existing = pickSpawn(w.x, w.y);
      if (existing) {
        drag = { kind: 'spawn-vel', spawn: existing, isNew: false, startSx: sx, startSy: sy, moved: false };
      } else {
        const sp = { x: w.x, y: w.y, vx: 0, vy: 0 };
        state.spawns.push(sp);
        drag = { kind: 'spawn-vel', spawn: sp, isNew: true, startSx: sx, startSy: sy, moved: false };
      }
      hideHint();
    }
    // Play mode: empty click does nothing
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (state.mode === 'play' && drag.kind !== 'pan') return;
    const sx = e.clientX, sy = e.clientY;
    if (drag.kind === 'pan') {
      const dx = (sx - drag.startPx) / state.camera.zoom;
      const dy = (sy - drag.startPy) / state.camera.zoom;
      state.camera.x = drag.startCamX - dx;
      state.camera.y = drag.startCamY - dy;
      return;
    }
    const w = screenToWorld(sx, sy);
    if (drag.kind === 'move') {
      drag.bar.cx = w.x - drag.offsetX;
      drag.bar.cy = w.y - drag.offsetY;
    } else if (drag.kind === 'rotate') {
      // Endpoint drag rotates + resizes: angle and halfLen both follow cursor.
      const bar = drag.bar;
      let dx = w.x - bar.cx, dy = w.y - bar.cy;
      if (drag.endpointSign < 0) { dx = -dx; dy = -dy; }
      bar.angle = Math.atan2(dy, dx);
      bar.halfLen = Math.max(20, Math.min(400, Math.hypot(dx, dy)));
    } else if (drag.kind === 'spawn-vel') {
      const dxs = sx - drag.startSx, dys = sy - drag.startSy;
      if (dxs * dxs + dys * dys > 36) drag.moved = true;
      if (drag.moved) {
        const sp = drag.spawn;
        sp.vx = (w.x - sp.x) * VEL_SCALE;
        sp.vy = (w.y - sp.y) * VEL_SCALE;
      }
    }
  });

  function endPointerDrag() {
    if (!drag) return;
    if (drag.kind === 'spawn-vel') {
      if (!drag.moved && !drag.isNew) {
        drag.spawn.vx = 0;
        drag.spawn.vy = 0;
      }
      drag = null;
      return;
    }
    if (drag.kind !== 'palette') drag = null;
  }
  canvas.addEventListener('pointerup', endPointerDrag);
  canvas.addEventListener('pointercancel', endPointerDrag);

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.mode !== 'edit') return;
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const sp = pickSpawn(w.x, w.y);
    if (sp) {
      const idx = state.spawns.indexOf(sp);
      if (idx >= 0) state.spawns.splice(idx, 1);
      return;
    }
    const hit = pickBar(w.x, w.y);
    if (hit) {
      state.bars = state.bars.filter(b => b !== hit.bar);
    }
  });

  function zoomAtScreen(sx, sy, factor) {
    const wBefore = screenToWorld(sx, sy);
    state.camera.zoom = Math.min(4, Math.max(0.25, state.camera.zoom * factor));
    const wAfter = screenToWorld(sx, sy);
    state.camera.x += wBefore.x - wAfter.x;
    state.camera.y += wBefore.y - wAfter.y;
  }
  function panScreen(dx, dy) {
    state.camera.x -= dx / state.camera.zoom;
    state.camera.y -= dy / state.camera.zoom;
  }

  // Wheel / trackpad: ctrl/shift+wheel → zoom (also Mac trackpad pinch sets ctrlKey);
  // plain wheel → pan (trackpad two-finger scroll).
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (e.ctrlKey || e.shiftKey) {
      const factor = Math.pow(1.0025, -e.deltaY);
      zoomAtScreen(sx, sy, factor);
    } else {
      panScreen(-e.deltaX, -e.deltaY);
    }
  }, { passive: false });

  // Touch: 1 finger = edit interactions (handled above), 2 fingers = pan + pinch zoom.
  const activeTouches = new Map();
  let twoFinger = null; // { cx, cy, dist }

  function refreshTwoFinger() {
    if (activeTouches.size < 2) { twoFinger = null; return; }
    const [a, b] = [...activeTouches.values()];
    twoFinger = {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size >= 2) {
      // Cancel any in-progress single-finger drag, switch to gesture.
      if (drag && (drag.kind === 'move' || drag.kind === 'rotate' || drag.kind === 'palette')) {
        if (drag.kind === 'palette' && drag.chipEl) drag.chipEl.classList.remove('dragging');
        drag = null;
      }
      refreshTwoFinger();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size >= 2 && twoFinger) {
      const prev = twoFinger;
      refreshTwoFinger();
      const dxCentroid = twoFinger.cx - prev.cx;
      const dyCentroid = twoFinger.cy - prev.cy;
      panScreen(dxCentroid, dyCentroid);
      if (prev.dist > 0) {
        const factor = twoFinger.dist / prev.dist;
        const rect = canvas.getBoundingClientRect();
        zoomAtScreen(twoFinger.cx - rect.left, twoFinger.cy - rect.top, factor);
      }
    }
  });

  function endTouch(e) {
    if (e.pointerType !== 'touch') return;
    activeTouches.delete(e.pointerId);
    refreshTwoFinger();
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  function recenterCamera() {
    if (state.ball) {
      state.camera.x = state.ball.x; state.camera.y = state.ball.y;
    } else if (state.spawn) {
      state.camera.x = state.spawn.x; state.camera.y = state.spawn.y;
    } else {
      state.camera.x = 0; state.camera.y = 0;
    }
  }

  // ---------- UI wiring ----------

  const rootSel = document.getElementById('root');
  const modeSel = document.getElementById('mode');
  const octVal = document.getElementById('oct-val');
  const playBtn = document.getElementById('play');
  const resetBtn = document.getElementById('reset');
  const clearBtn = document.getElementById('clear');
  const gravityBtn = document.getElementById('gravity');
  const hintEl = document.getElementById('hint');

  function hideHint() { hintEl.classList.add('fade'); }
  function updateOctView() { octVal.textContent = String(state.scale.octave); }

  rootSel.addEventListener('change', () => {
    state.scale.rootIdx = ROOTS.indexOf(rootSel.value);
    rebuildPalette();
  });
  modeSel.addEventListener('change', () => {
    state.scale.mode = modeSel.value;
    rebuildPalette();
  });
  document.getElementById('oct-down').addEventListener('click', () => {
    state.scale.octave = Math.max(1, state.scale.octave - 1);
    updateOctView(); rebuildPalette();
  });
  document.getElementById('oct-up').addEventListener('click', () => {
    state.scale.octave = Math.min(7, state.scale.octave + 1);
    updateOctView(); rebuildPalette();
  });

  function setMode(m) {
    state.mode = m;
    canvas.style.cursor = m === 'play' ? 'default' : 'crosshair';
    // Cancel any in-progress edit drag when leaving edit mode.
    if (drag && (drag.kind === 'move' || drag.kind === 'rotate' || drag.kind === 'palette' || drag.kind === 'spawn-vel')) {
      if (drag.kind === 'palette' && drag.chipEl) drag.chipEl.classList.remove('dragging');
      drag = null;
    }
    if (m === 'play') {
      playBtn.textContent = '⏸ Pause';
      playBtn.classList.add('playing');
    } else {
      playBtn.textContent = '▶ Play';
      playBtn.classList.remove('playing');
    }
  }

  function spawnBalls() {
    state.balls = state.spawns.map(sp => ({ x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy }));
  }

  playBtn.addEventListener('click', () => {
    ensureAudio();
    if (state.mode === 'edit') {
      if (state.spawns.length === 0) {
        state.spawns.push({ x: state.camera.x, y: state.camera.y - 200, vx: 0, vy: 0 });
      }
      spawnBalls();
      state.simStep = 0;
      for (const b of state.bars) b.cooldownStep = 0;
      state.cameraAtPlay = { x: state.camera.x, y: state.camera.y, zoom: state.camera.zoom };
      setMode('play');
    } else {
      setMode('edit');
    }
    hideHint();
  });

  resetBtn.addEventListener('click', () => {
    state.balls = [];
    state.simStep = 0;
    for (const b of state.bars) b.cooldownStep = 0;
    if (state.cameraAtPlay) {
      state.camera.x = state.cameraAtPlay.x;
      state.camera.y = state.cameraAtPlay.y;
      state.camera.zoom = state.cameraAtPlay.zoom;
    }
    setMode('edit');
  });

  clearBtn.addEventListener('click', () => {
    if (state.bars.length && !confirm('Clear all bars and spawns?')) return;
    state.bars = [];
    state.spawns = [];
    state.balls = [];
    setMode('edit');
  });

  function updateGravityBtn() {
    gravityBtn.textContent = state.gravityOn ? '⬇ Gravity' : '✕ No Gravity';
    gravityBtn.classList.toggle('off', !state.gravityOn);
  }
  gravityBtn.addEventListener('click', () => {
    state.gravityOn = !state.gravityOn;
    updateGravityBtn();
  });
  updateGravityBtn();

  const bounceSlider = document.getElementById('bounce');
  const bounceVal = document.getElementById('bounce-val');
  bounceSlider.addEventListener('input', () => {
    const pct = Number(bounceSlider.value);
    state.bounciness = pct / 100;
    bounceVal.textContent = pct + '%';
  });

  const reverbSlider = document.getElementById('reverb');
  const reverbValEl = document.getElementById('reverb-val');
  let reverbRebuildTimer = null;
  reverbSlider.addEventListener('input', () => {
    const pct = Number(reverbSlider.value);
    state.reverb = pct / 100;
    reverbValEl.textContent = pct + '%';
    if (reverbWet) reverbWet.gain.value = state.reverb;
    // Debounce-rebuild impulse so tail length tracks slider.
    if (reverbRebuildTimer) clearTimeout(reverbRebuildTimer);
    reverbRebuildTimer = setTimeout(() => {
      reverbRebuildTimer = null;
      rebuildImpulse();
    }, 120);
  });

  // Prevent iOS double-tap zoom on controls
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------- Init ----------

  rebuildPalette();
  updateOctView();

})();
