const BACKGROUNDS = [
  () => {
    const root = document.querySelector("html");
    root.style.minHeight = "100%";
    const body = document.querySelector("body");
    const canvas = document.createElement("canvas");
    body.insertBefore(canvas, body.firstChild);
    canvas.id = "dot-canvas";
    canvas.style.position = "fixed";
    canvas.style.top = 0;
    canvas.style.left = 0;
    canvas.style.bottom = 0;
    canvas.style.right = 0;
    const { width, height } = root.getBoundingClientRect();
    canvas.style.width = width;
    canvas.style.height = height;
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;
    window.addEventListener("mousemove", updateMousePos, false);
    document.addEventListener("mouseleave", mouseLeave, false);
    window.addEventListener("click", movePoint, false);
    let mousePos = [-1000, -1000];
    const DOTS_PER_PX = 0.00007;
    const MIN_SPEED = 0.3;
    const MAX_SPEED = 1;
    const MAX_DIST_SQ = 100 ** 2;
    const INFLUENCE_DISTANCE = 100;
    const DOT_INFLUENCE_AMOUNT = 1 / 200;
    const MOUSE_INFLUENCE_AMOUNT = 1 / 20;
    const EXPLOSION_COUNT = 10;
    const EXPLOSION_SCALE_MIN = 2;
    const EXPLOSION_SCALE_MAX = 8;
    const EXPLOSION_RADIUS = INFLUENCE_DISTANCE;
    const COLLISION_DIST = 10;

    const numDots = (w, h) => Math.round(w * h * DOTS_PER_PX);

    const textArr = ["🔴", " 🟢", "🔵"];
    let textArrIdx = 0;
    const explosionArr = ["💥"];
    let explosionArrIdx = 0;

    let explosions = [];

    function makeExplosion(x, y) {
      const distsArr = explosions.map((exp) =>
        distance(exp, { position: [x, y] })
      );
      const nearProposed = distsArr.map((d) => d <= EXPLOSION_RADIUS);
      if (nearProposed.filter(Boolean).length > 0) {
        return;
      }

      const char = explosionArr[explosionArrIdx];
      explosionArrIdx = (explosionArrIdx + 1) % explosionArr.length;
      explosions.push({
        char,
        scale: EXPLOSION_SCALE_MIN,
        position: [x, y],
        applied: false,
      });
    }
    function generateDot(w, h) {
      const angle = Math.random() * Math.PI * 2;
      const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      const char = textArr[textArrIdx];
      textArrIdx = (textArrIdx + 1) % textArr.length;
      return {
        char,
        position: [Math.random() * w, Math.random() * h],
        velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed],
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
    function clickExplode(e) {
      makeExplosion(e.clientX, e.clientY);
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
      return Math.sqrt(distanceSq(l, r));
    }
    function distanceSq(l, r) {
      return (
        (l.position[0] - r.position[0]) ** 2 +
        (l.position[1] - r.position[1]) ** 2
      );
    }
    function vecMul(l, r) {
      return l.map((_, i) => l[i] * r[i]);
    }
    function vecDiv(l, r) {
      return l.map((_, i) => l[i] / r[i]);
    }
    function vecAdd(l, r) {
      return l.map((_, i) => l[i] + r[i]);
    }
    function vecSub(l, r) {
      return l.map((_, i) => l[i] - r[i]);
    }
    function scalarVecMul(scalar, vec) {
      return vec.map((v) => v * scalar);
    }
    function scalarVecDiv(scalar, vec) {
      return vec.map((v) => scalar / v);
    }
    function scalarVecAdd(scalar, vec) {
      return vec.map((v) => v + scalar);
    }
    function scalarVecSub(scalar, vec) {
      return vec.map((v) => scalar - v);
    }
    function dot(l, r) {
      return vecMul(l, r).reduce((m, n) => m + n);
    }
    function magnitude(vec) {
      return Math.sqrt(vec.reduce((l, r) => l + r ** 2, 0));
    }
    function vecNorm(vec) {
      const mag = magnitude(vec);
      return vec.map((v) => v / mag);
    }
    function directionVector(from, to) {
      return vecNorm([to[0] - from[0], to[1] - from[1]]);
    }
    function angleBetween(from, to) {
      const vec = directionVector(from, to);
      return Math.atan2(vec[1], vec[0]);
    }
    function applyCollision(target, recipient) {
      const p1 = recipient.position;
      const p2 = target.position;
      let v1 = recipient.velocity;
      let v2 = target.velocity;

      const phi = angleBetween(p2, p1);
      const theta1 = angleBetween(p1, vecAdd(p1, v1));
      const theta2 = angleBetween(p2, vecAdd(p2, v2));

      v1 = magnitude(v1);
      v2 = magnitude(v2);

      // First term in the numerator cancels for equal masses, as does the 2 and denominator
      const numerator = v2 * Math.cos(theta2 - phi);

      const xFirstTerm = Math.cos(phi);
      const xSecondTerm =
        v1 * Math.sin(theta1 - phi) * Math.cos(phi + Math.PI / 2);
      const xNew = numerator * xFirstTerm + xSecondTerm;

      const yFirstTerm = Math.sin(phi);
      const ySecondTerm =
        v1 * Math.sin(theta1 - phi) * Math.sin(phi + Math.PI / 2);
      const yNew = numerator * yFirstTerm + ySecondTerm;

      const newVel = [xNew * 1.05, yNew * 1.05];

      const newPos = vecAdd(
        target.position,
        scalarVecMul(
          COLLISION_DIST,
          directionVector(target.position, recipient.position)
        )
      );

      return [newVel, newPos];
    }
    function influence(affectee, affector, amount, canCollide) {
      if (affectee === affector) return;
      const distSq = distanceSq(affectee, affector);

      if (distSq < INFLUENCE_DISTANCE ** 2) {
        const dist = Math.sqrt(distSq);
        let influenceAmount = Math.min(
          10,
          Math.max(1, INFLUENCE_DISTANCE / dist)
        );
        if (affector.char && affectee.char !== affector.char) {
          influenceAmount *= -1;
        }
        affectee.velocity[0] +=
          ((affector.position[0] - affectee.position[0]) / dist) *
          influenceAmount *
          amount;
        affectee.velocity[1] +=
          ((affector.position[1] - affectee.position[1]) / dist) *
          influenceAmount *
          amount;
        if (canCollide && dist > 0 && dist < COLLISION_DIST) {
          const [affecteeVel, affecteePos] = applyCollision(affector, affectee);
          const [affectorVel, affectorPos] = applyCollision(affectee, affector);
          affectee.velocity = affecteeVel;
          affectee.position = affecteePos;
          affector.velocity = affectorVel;
          affector.position = affectorPos;
        }
      }
      return distSq;
    }

    function updateDot(dot) {
      const dotDistancesSq = dots.map((d) =>
        influence(dot, d, DOT_INFLUENCE_AMOUNT, true)
      );
      const influenceDistances = dotDistancesSq.filter(
        (dist) => dist <= INFLUENCE_DISTANCE ** 2
      );
      const influenceCount = influenceDistances.length;
      // const maxInfluenceDistance = Math.max(...influenceDistances);
      const meanInfluenceDistance =
        influenceDistances.reduce((l, r) => l + r, 0) /
        influenceDistances.length;

      if (
        mousePos[0] >= 0 &&
        mousePos[1] >= 0 &&
        mousePos[0] < canvas.width &&
        mousePos[1] < canvas.height
      ) {
        influence(dot, { position: mousePos }, MOUSE_INFLUENCE_AMOUNT, false);
      }
      const velocitySq = dot.velocity[0] ** 2 + dot.velocity[1] ** 2;
      const maxSpeedSq = MAX_SPEED ** 2;
      if (velocitySq > maxSpeedSq) {
        dot.velocity[0] *= 0.99;
        dot.velocity[1] *= 0.99;
      } else {
        // Only make explosions if we're within the "max velocity"
        if (
          influenceCount >= EXPLOSION_COUNT ||
          (influenceCount >= 2 &&
            !isNaN(meanInfluenceDistance) &&
            meanInfluenceDistance < 25 ** 2)
        ) {
          makeExplosion(dot.position[0], dot.position[1]);
        }
      }
    }
    function applyExplosions(dot) {
      for (let i = 0; i < explosions.length; i++) {
        const exp = explosions[i];
        if (!exp.applied) {
          const expDistSq = distanceSq(exp, dot);
          if (expDistSq <= EXPLOSION_RADIUS ** 2) {
            const expDist = Math.sqrt(expDistSq);
            const force = (1 - expDist / EXPLOSION_RADIUS) * MAX_SPEED * 10;
            const angle = angleBetween(exp.position, dot.position);

            dot.velocity = [
              dot.velocity[0] + Math.cos(angle) * force,
              dot.velocity[1] + Math.sin(angle) * force,
            ];
          }
        }
      }
    }
    // https://stackoverflow.com/questions/1997661/unique-object-identifier-in-javascript/1997811
    (function () {
      if (typeof Object.id == "undefined") {
        var id = 0;

        Object.id = function (o) {
          if (typeof o.__uniqueid == "undefined") {
            Object.defineProperty(o, "__uniqueid", {
              value: ++id,
              enumerable: false,
              // This could go either way, depending on your
              // interpretation of what an "id" is
              writable: false,
            });
          }

          return o.__uniqueid;
        };
      }
    })();
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
      if (Object.id(l) > Object.id(r)) return;

      const distSq =
        (l.position[0] - r.position[0]) ** 2 +
        (l.position[1] - r.position[1]) ** 2;
      if (distSq < MAX_DIST_SQ) {
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 * (1 - distSq / MAX_DIST_SQ)})`;
        if (l.char && r.char && l.char !== r.char) {
          ctx.setLineDash([4, 2]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.moveTo(l.position[0], l.position[1]);
        ctx.lineTo(r.position[0], r.position[1]);
      }
    }
    function drawLine(dot) {
      ctx.beginPath();
      // ctx.lineWidth = 5;
      ctx.fillStyle = "";
      ctx.lineWidth = 3;

      dots.forEach((other) => lineBetween(dot, other));

      lineBetween(dot, { position: mousePos });
      ctx.stroke();
    }
    function drawText(obj) {
      const scale = obj.scale ?? 1;
      const alpha = obj.alpha ?? 0.2;
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.translate(obj.position[0], obj.position[1]);
      ctx.scale(scale, scale);
      ctx.fillText(obj.char, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    function adjustDotCounts(w, h) {
      const newDotCount = numDots(w, h);
      let missingDots = newDotCount - dots.length;
      while (missingDots > 0) {
        dots.push(generateDot(canvas.width, canvas.height));
        missingDots--;
      }
      if (missingDots < 0) {
        dots.splice(missingDots);
      }
    }
    function drawExplosion(explosion) {
      drawText(explosion);
      explosion.scale += 0.25;
      explosion.alpha = 0.3 * (1 - explosion.scale / EXPLOSION_SCALE_MAX);
      explosion.applied = true;
      if (explosion.scale >= EXPLOSION_SCALE_MAX) {
        explosions.splice(0, 1);
      }
    }
    let maDelta = 0;
    const maW = 0.95;
    function draw() {
      const start = performance.now();
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = canvas.width;
      canvas.style.height = canvas.height;
      ctx.fillStyle = "#FFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      adjustDotCounts(canvas.width, canvas.height);
      dots.forEach(updateDot);
      dots.forEach(applyExplosions);
      dots.forEach(moveDot);
      dots.forEach(drawLine);
      ctx.font = "8px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      dots.forEach(drawText);
      explosions.forEach(drawExplosion);
      const delta = performance.now() - start;
      maDelta = maW * maDelta + (1 - maW) * delta;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      drawText({
        position: [canvas.width, canvas.height],
        char: `${Math.round(1000 / maDelta)}FPS`,
        scale: 1.5,
      });
      if (
        /Android|webOS|iPhone|iPad|Mac|Macintosh|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
      ) {
        // Move the "mouse" off screen if it's a mobile device to simulate just a single tap on the screen
        mousePos = [-1000, -1000];
      }
      window.requestAnimationFrame(draw);
    }
    draw();
  },
  () => {
    const ALPHA = 0.05;

    class Ball {
      constructor(x, y, radius, color, velocity) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.velocity = velocity;
      }

      draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = ALPHA;
        ctx.fill();
      }

      update(ctx, canvas) {
        this.draw(ctx);
        let pastXBounds = Math.max(
          this.x + this.radius - canvas.width,
          -(this.x - this.radius)
        );
        let pastYBounds = Math.max(
          this.y + this.radius - canvas.height,
          -(this.y - this.radius)
        );
        if (pastXBounds > 0) {
          this.velocity.x = -this.velocity.x;
        }
        if (pastYBounds > 0) {
          this.velocity.y = -this.velocity.y;
        }
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        pastXBounds = Math.max(
          this.x + this.radius - canvas.width,
          -(this.x - this.radius)
        );
        pastYBounds = Math.max(
          this.y + this.radius - canvas.height,
          -(this.y - this.radius)
        );
        // If we're still past the screen bounds by more a pixel or more, move randomly into the screen
        // as this is an indication that the user has resized the window
        if (pastXBounds >= 1 || pastYBounds >= 1) {
          console.log(pastXBounds, pastYBounds);
          const xMin = this.radius;
          const xMax = canvas.width - this.radius;
          const yMin = this.radius;
          const yMax = canvas.height - this.radius;
          this.x = Math.random() * (xMax - xMin) + xMin;
          this.y = Math.random() * (yMax - yMin) + yMin;
        }
      }
    }

    function setup() {
      const root = document.querySelector("html");
      root.style.minHeight = "100%";
      const body = document.querySelector("body");
      const canvas = document.createElement("canvas");
      body.insertBefore(canvas, body.firstChild);
      canvas.id = "dot-canvas";
      canvas.style.position = "fixed";
      canvas.style.top = 0;
      canvas.style.left = 0;
      canvas.style.bottom = 0;
      canvas.style.right = 0;
      const { width, height } = root.getBoundingClientRect();
      canvas.style.width = width;
      canvas.style.height = height;
      const ctx = canvas.getContext("2d");
      canvas.width = width;
      canvas.height = height;

      return [ctx, canvas];
    }

    function makeballs(count) {
      const balls = [];
      for (let i = 0; i < count; i++) {
        const radius = Math.random() * 30 + 10;
        const x = Math.random() * (window.innerWidth - radius * 2) + radius;
        const y = Math.random() * (window.innerHeight - radius * 2) + radius;
        const color = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${
          Math.random() * 255
        }, 0.5)`;
        const velocity = {
          x: Math.random() - 0.5,
          y: Math.random() - 0.5,
        };
        balls.push(new Ball(x, y, radius, color, velocity));
      }
      return balls;
    }

    function adjustCounts(balls) {
      const desiredBalls = Math.floor(
        (window.innerWidth * window.innerHeight) / 20000
      );
      while (balls.length < desiredBalls) {
        balls.push(makeballs(1)[0]);
      }
      while (balls.length > desiredBalls) {
        // Randomly remove ball
        balls.splice(Math.floor(Math.random() * balls.length), 1);
      }
      return balls;
    }

    function resize(canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = canvas.width;
      canvas.style.height = canvas.height;
    }

    function clear(ctx, canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function update(ctx, canvas, balls) {
      balls.forEach((o, i) => o.update(ctx, canvas, balls, i));
    }
    function draw(ctx, canvas, balls) {
      balls.forEach((o) => o.draw(ctx, canvas));
    }

    function loop(ctx, canvas, balls) {
      resize(canvas);
      clear(ctx, canvas);
      adjustCounts(balls);
      update(ctx, canvas, balls);
      draw(ctx, canvas, balls);

      window.requestAnimationFrame(loop.bind(null, ctx, canvas, balls));
    }

    function onClick(e, balls) {
      // On click, push nearby balls away from the click, maintaining their current absolute velocity
      const x = e.clientX + 1e-8;
      const y = e.clientY + 1e-8;

      balls.forEach((o) => {
        const dx = x - o.x;
        const dy = y - o.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < o.radius * 5) {
          const currVel = Math.sqrt(
            o.velocity.x * o.velocity.x + o.velocity.y * o.velocity.y
          );
          const theta = Math.atan2(dy, dx);

          o.velocity.x = Math.cos(theta) * currVel;
          o.velocity.y = Math.sin(theta) * currVel;
          o.velocity.x *= -1;
          o.velocity.y *= -1;
        }
      });
    }

    const [ctx, canvas] = setup();
    const balls = makeballs(100);
    window.addEventListener("click", (e) => onClick(e, balls), false);
    loop(ctx, canvas, balls);
  },
];

document.addEventListener("DOMContentLoaded", function () {
  // Randomly pick a background
  const background =
    BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  background();
});
