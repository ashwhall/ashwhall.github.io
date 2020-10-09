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
  window.addEventListener('click', movePoint, false);
  let mousePos = [-1000, -1000];
  const DOTS_PER_PX = 0.0001;
  const MIN_SPEED = 0.3;
  const MAX_SPEED = 1;
  const DOT_SIZE = 2;
  const MAX_DIST = 100 ** 2;
  const INFLUENCE_DISTANCE = 100;
  const MOUSE_INFLUENCE_AMOUNT = 1 / 50;

  const numDots = (w, h) => Math.round(w * h * DOTS_PER_PX);

  function generateDot(w, h) {
    const angle = Math.random() * Math.PI * 2;
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    return {
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
  function movePoint(e) {
    dots.splice(0, 1);
    const angle = Math.random() * Math.PI * 2;
    const speed = MAX_SPEED * 3.5;
    dots.push({
      position: [e.clientX + 1e-8, e.clientY + 1e-8],
      velocity: [
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
      ],
    });
  }
  function influence(effectee, effector, amount) {
    if (effectee === effector) return;
    const dist = Math.sqrt((effectee.position[0] - effector.position[0]) ** 2 + (effectee.position[1] - effector.position[1]) ** 2);
    const influenceAmount = Math.min(10, Math.max(1, INFLUENCE_DISTANCE / dist));
    if (influenceAmount > 1) {
      effectee.velocity[0] += (effector.position[0] - effectee.position[0]) / dist * influenceAmount * amount;
      effectee.velocity[1] += (effector.position[1] - effectee.position[1]) / dist * influenceAmount * amount;
    }
  }
  function updateDot(dot) {
    if (mousePos.x >= 0 && mousePos.y >= 0) {
      influence(dot, { position: mousePos }, MOUSE_INFLUENCE_AMOUNT)
    }
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
  function drawDot(dot) {
    ctx.beginPath();
    ctx.arc(dot.position[0], dot.position[1], DOT_SIZE, 0, 2 * Math.PI, false);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fill();
    ctx.lineWidth = 5;
    dots.forEach(other => lineBetween(dot, other));
    lineBetween(dot, { position: mousePos });
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

  function draw() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = canvas.width;
    canvas.style.height = canvas.height;
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    adjustDotCounts(canvas.width, canvas.height);
    dots.forEach(updateDot)
    dots.forEach(drawDot);
    window.requestAnimationFrame(draw);
  }
  draw();
});
