export default function (ctx, canvas, renderCallback) {
  const ALPHA = 0.03;

  class Ball {
    constructor(x, y, radius, colour, velocity) {
      this.x = x;
      this.y = y;
      this.radius = radius;
      this.colour = colour;
      this.velocity = velocity;
    }

    draw(ctx) {
      ctx.restore();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
      ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
      ctx.fillStyle = this.colour;
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
        const xMin = this.radius;
        const xMax = canvas.width - this.radius;
        const yMin = this.radius;
        const yMax = canvas.height - this.radius;
        this.x = Math.random() * (xMax - xMin) + xMin;
        this.y = Math.random() * (yMax - yMin) + yMin;
      }
    }
  }

  function makeBalls(count) {
    const balls = [];
    for (let i = 0; i < count; i++) {
      const radius = Math.random() * 30 + 10;
      const x = Math.random() * (window.innerWidth - radius * 2) + radius;
      const y = Math.random() * (window.innerHeight - radius * 2) + radius;
      const colour = `rgba(${Math.round(Math.random() * 255)}, ${Math.round(
        Math.random() * 255
      )}, ${Math.round(Math.random() * 255)}, ${ALPHA})`;
      const velocity = {
        x: Math.random() - 0.5,
        y: Math.random() - 0.5,
      };
      balls.push(new Ball(x, y, radius, colour, velocity));
    }
    return balls;
  }

  function adjustCounts(balls) {
    const desiredBalls = Math.floor(
      (window.innerWidth * window.innerHeight) / 30000
    );
    while (balls.length < desiredBalls) {
      balls.push(makeBalls(1)[0]);
    }
    while (balls.length > desiredBalls) {
      // Randomly remove a ball
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
    balls.forEach((b) => b.update(ctx, canvas));
  }
  function draw(ctx, canvas, balls) {
    balls.forEach((b) => b.draw(ctx, canvas));
  }

  function loop(ctx, canvas, balls) {
    resize(canvas);
    clear(ctx, canvas);
    adjustCounts(balls);
    update(ctx, canvas, balls);
    draw(ctx, canvas, balls);

    renderCallback();
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

  const balls = [];
  window.addEventListener("click", (e) => onClick(e, balls), false);
  loop(ctx, canvas, balls);
}
