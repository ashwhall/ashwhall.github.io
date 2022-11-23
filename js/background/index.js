import attractors from "./attractors.js";
import floaters from "./floaters.js";

const BACKGROUNDS = [attractors, floaters];
class Perf {
  constructor() {
    this.lastTime = performance.now();
    this.smoothDelta = 0;
    this.movingAverageWeight = 0.95;
  }

  update() {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    this.smoothDelta =
      this.smoothDelta * this.movingAverageWeight +
      delta * (1 - this.movingAverageWeight);
  }

  render(ctx, canvas) {
    ctx.save();
    this.update();
    const prevFill = ctx.fillStyle;
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = "bold 16px arial";
    ctx.fillText(
      `${Math.round(1000 / this.smoothDelta)}FPS`,
      canvas.width,
      canvas.height
    );
    ctx.fill();
    ctx.fillStyle = prevFill;
    ctx.restore();
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

document.addEventListener("DOMContentLoaded", function () {
  const [ctx, canvas] = setup();
  const perf = new Perf(ctx, canvas);
  // Randomly pick a background
  const background =
    BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
  const renderCallback = () => perf.render(ctx, canvas);
  background(ctx, canvas, renderCallback);
});
