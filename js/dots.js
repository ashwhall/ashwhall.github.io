document.addEventListener('DOMContentLoaded', function() {
  const root = document.querySelector('html');
  root.style.minHeight = '100%';
  const body = document.querySelector('body');
  const canvas = document.createElement('canvas');
  body.insertBefore(canvas, body.firstChild);
  canvas.id = 'dot-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = 0;
  canvas.style.left = 0;
  canvas.style.bottom = 0;
  canvas.style.right = 0;
  const { width, height } = root.getBoundingClientRect();
  canvas.style.width = width;
  canvas.style.height = height;
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  window.addEventListener('mousemove', updateMousePos, false);
  document.addEventListener('mouseleave', mouseLeave, false);
  window.addEventListener('click', movePoint, false);
  let mousePos = [-1000, -1000];
  const DOTS_PER_PX = 0.0001;
  const MIN_SPEED = 0.3;
  const MAX_SPEED = 1;
  const DOT_SIZE = 2;
  const MAX_DIST = 100 ** 2;
  const INFLUENCE_DISTANCE = 100;
  const DOT_INFLUENCE_AMOUNT = 1 / 500;
  const MOUSE_INFLUENCE_AMOUNT = 1 / 50;
  const EXPLOSION_COUNT = 10;
  const EXPLOSION_SCALE_MIN = 2;
  const EXPLOSION_SCALE_MAX = 8;

  const numDots = (w, h) => Math.round(w * h * DOTS_PER_PX);
  // const textArr = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '☺️', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔'];
  // const textArr = ['➕', '❇️'];
  // const textArr = ['A', 'S', 'H']
  // const textArr = ['X', '+']
  const textArr = ['🔴', ' 🟢', '🔵']
  // const textArr = ['+', '-', '÷', 'x']
  let textArrIdx = 0;
  const explosionArr = ['💥'];
  let explosionArrIdx = 0;

  let explosions = [];
  // const textArr = ['a', 's', 'h'];
  // const textArr = ['π']

  function makeExplosion(x, y) {
    const distsArr = explosions.map(exp => distance(exp, { position: [x, y] }));
    const nearProposed = distsArr.map(d => d <= 25);
    if (nearProposed.filter(Boolean).length > 0) {
      return;
    }

    const char = explosionArr[explosionArrIdx];
    explosionArrIdx = (explosionArrIdx + 1)  % explosionArr.length;
    explosions.push({
      char,
      scale: EXPLOSION_SCALE_MIN,
      position: [x, y],
    });
  }
  function generateDot(w, h) {
    const angle = Math.random() * Math.PI * 2;
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    const char = textArr[textArrIdx];
    textArrIdx = (textArrIdx + 1)  % textArr.length;
    return {
      char,
      position: [Math.random() * w, Math.random() * h],
      velocity: [
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
      ],
    };
  }
  let dots = [];
  for (let i = 0; i < numDots(width, height); i++) {
    dots.push(generateDot(canvas.width, canvas.height));
  }

  function updateMousePos(e) {
    mousePos = [e.clientX, e.clientY];
  }
  function mouseLeave() {
    mousePos = [-1000, -1000];
  }
  function movePoint(e) {
    const dot = dots.splice(0, 1)[0];

    const angle = Math.random() * Math.PI * 2;
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    dots.push({
      ...dot,
      position: [e.clientX + 1e-8, e.clientY + 1e-8],
      velocity: [
        Math.cos(angle) * MAX_SPEED * 3.5,
        Math.sin(angle) * MAX_SPEED * 3.5,
      ],
    });
  }
  function distance(l, r) {
    return Math.sqrt((l.position[0] - r.position[0]) ** 2 + (l.position[1] - r.position[1]) ** 2);
  }
  function influence(effectee, effector, amount) {
    if (effectee === effector) return;
    const dist = distance(effectee, effector);
    let influenceAmount = Math.min(10, Math.max(1, INFLUENCE_DISTANCE / dist));
    if (influenceAmount > 1) {
      if (effector.char && effectee.char !== effector.char) {
        influenceAmount *= -1;
      }
      effectee.velocity[0] += (effector.position[0] - effectee.position[0]) / dist * influenceAmount * amount;
      effectee.velocity[1] += (effector.position[1] - effectee.position[1]) / dist * influenceAmount * amount;
    }
    return dist < INFLUENCE_DISTANCE;
  }
  function updateDot(dot) {
    const influenceCount = dots.map(d => influence(dot, d, DOT_INFLUENCE_AMOUNT)).filter(Boolean).length;
    if (mousePos[0] >= 0 && mousePos[1] >= 0 && mousePos[0] < canvas.width && mousePos[1] < canvas.height) {
      influence(dot, { position: mousePos }, MOUSE_INFLUENCE_AMOUNT)
    }
    for (let i = 0; i < dot.velocity.length; i++) {
      if (dot.velocity[i] > MAX_SPEED || dot.velocity[i] < -MAX_SPEED) {
        dot.velocity[i] *= 0.99;
      }
    }
    if (influenceCount >= EXPLOSION_COUNT) {
      // Explosion!
      const angle = Math.random() * Math.PI * 2;
      const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      dot.velocity = [
        Math.cos(angle) * MAX_SPEED * 10,
        Math.sin(angle) * MAX_SPEED * 10,
      ];
      makeExplosion(dot.position[0], dot.position[1]);
    }
  }
  function moveDot(dot) {
    dot.position = [
      dot.position[0] + dot.velocity[0],
      dot.position[1] + dot.velocity[1],
    ];
    if (dot.position[0] < 0) dot.position[0] = canvas.width;
    else if (dot.position[0] > canvas.width) dot.position[0] = 0;
    if (dot.position[1] < 0) dot.position[1] = canvas.height;
    else if (dot.position[1] > canvas.height) dot.position[1] = 0;
  }
  function lineBetween(l, r) {
    if (l === r) return;
    const dist = (l.position[0] - r.position[0]) ** 2 + (l.position[1] - r.position[1]) ** 2;
    if (dist < MAX_DIST) {
      ctx.beginPath();
      ctx.fillStyle = '';
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.1 * (1 - dist / MAX_DIST)})`;
      ctx.lineWidth = 1;
      ctx.moveTo(l.position[0], l.position[1]);
      ctx.lineTo(r.position[0], r.position[1]);
      ctx.stroke();
    }
  }
  function drawLine(dot) {
    ctx.lineWidth = 5;
    dots.forEach(other => lineBetween(dot, other));
    lineBetween(dot, { position: mousePos });
  }
  function drawText(obj) {
  const scale = obj.scale ?? 1;
  const alpha = obj.alpha ?? 0.2;
    ctx.save();
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.textBaseline = 'middle';
    ctx.translate(obj.position[0], obj.position[1]);
    ctx.scale(scale, scale);
    ctx.fillText(obj.char, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  function adjustDotCounts(w, h) {
    const newDotCount = numDots(w, h);
    let missingDots = newDotCount - dots.length;
    while(missingDots > 0) {
      dots.push(generateDot(canvas.width, canvas.height));
      missingDots--;
    }
    if(missingDots < 0) {
      dots.splice(missingDots);
    }
  }
  function drawExplosion(explosion) {
    drawText(explosion);
    explosion.scale += 0.25;
    explosion.alpha = 0.3 * (1 - (explosion.scale / EXPLOSION_SCALE_MAX));
    if (explosion.scale >= EXPLOSION_SCALE_MAX) {
      explosions.splice(0, 1);
    }
  }

  function draw() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = canvas.width;
    canvas.style.height = canvas.height;
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    adjustDotCounts(canvas.width, canvas.height);
    dots.forEach(updateDot)
    dots.forEach(moveDot);
    dots.forEach(drawLine);
    dots.forEach(drawText);
    explosions.forEach(drawExplosion);
    window.requestAnimationFrame(draw);
  }
  draw();
});
