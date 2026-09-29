'use strict';

// Particles, screen shake, flashes, floating text.
const FX = (() => {
  const cv = document.getElementById('fx');
  const g = cv.getContext('2d');
  const floaters = document.getElementById('floaters');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let parts = [];
  let running = false;
  let last = 0;
  // user settings: particle look, amount/speed multiplier, screen shake on/off
  let style = 'confetti';
  let power = 1;
  let shakeOn = true;
  const STYLE_SHAPE = { stars: 'star', hearts: 'heart', sparks: 'spark', petals: 'petal' };
  const shapeFor = (shapes, i, keep) => (keep || style === 'confetti' ? shapes[i % shapes.length] : STYLE_SHAPE[style]);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function burst(x, y, {
    count = 40, colors = ['#ffcf4a', '#ff7a59'], speed = 7, spread = Math.PI * 2, angle = -Math.PI / 2,
    gravity = 0.18, life = 70, size = 6, shapes = ['rect', 'circle', 'tri'], drag = 0.985, keepShape = false,
  } = {}) {
    count = Math.round(count * (keepShape ? 1 : power));
    if (power > 1 && !keepShape) speed *= 1.15;
    if (reduce) count = Math.min(count, 8);
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.9);
      const shape = shapeFor(shapes, i, keepShape);
      parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: shape === 'petal' ? gravity * 0.35 : gravity, drag,
        life: life * (0.6 + Math.random() * 0.7) * (shape === 'petal' ? 1.6 : 1), age: 0,
        c: colors[i % colors.length], shape, wobble: shape === 'petal' ? Math.random() * 6 : 0,
        size: size * (0.5 + Math.random()) * (shape === 'heart' || shape === 'star' ? 1.4 : 1),
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
      });
    }
    start();
  }

  function confetti(colors = ['#ffcf4a', '#ff7a59', '#b77dff', '#4fc3ff', '#6dffb0', '#ffffff']) {
    const n = reduce ? 20 : Math.round(160 * power);
    for (let i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, g: 0.06, drag: 0.995,
        life: 200 + Math.random() * 120, age: 0, c: colors[i % colors.length],
        shape: shapeFor(['rect', 'rect', 'circle'], i), size: 5 + Math.random() * 6,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, wobble: Math.random() * 6,
      });
    }
    start();
  }

  // Grey puff when dusty tasks get pulled into Day One.
  function dust(x, y) {
    burst(x, y, {
      count: 26, colors: ['#8a93b8', '#5c647f', '#b9c0d8'], speed: 3.2, gravity: -0.02,
      life: 60, size: 5, shapes: ['circle'], drag: 0.96, keepShape: true,
    });
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(step);
  }

  function step(now) {
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    g.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.age < p.life && p.y < innerHeight + 40);
    for (const p of parts) {
      p.age += dt;
      p.vx *= Math.pow(p.drag, dt);
      p.vy = p.vy * Math.pow(p.drag, dt) + p.g * dt;
      p.x += (p.vx + (p.wobble ? Math.sin((p.age + p.wobble * 10) / 12) * 0.8 : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const alpha = Math.max(0, 1 - p.age / p.life);
      g.globalAlpha = alpha;
      g.fillStyle = p.c;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      const s = p.size;
      if (p.shape === 'circle') {
        g.beginPath(); g.arc(0, 0, s / 2, 0, Math.PI * 2); g.fill();
      } else if (p.shape === 'star') {
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = k % 2 ? s * 0.22 : s * 0.55;
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath(); g.fill();
      } else if (p.shape === 'heart') {
        const h = s * 0.5;
        g.beginPath();
        g.moveTo(0, h * 0.9);
        g.bezierCurveTo(-h * 1.4, -h * 0.1, -h * 0.6, -h * 1.2, 0, -h * 0.45);
        g.bezierCurveTo(h * 0.6, -h * 1.2, h * 1.4, -h * 0.1, 0, h * 0.9);
        g.fill();
      } else if (p.shape === 'spark') {
        g.globalCompositeOperation = 'lighter';
        g.beginPath(); g.arc(0, 0, s * 0.28, 0, Math.PI * 2); g.fill();
        g.globalAlpha *= 0.35;
        g.beginPath(); g.arc(0, 0, s * 0.8, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
      } else if (p.shape === 'petal') {
        g.beginPath(); g.ellipse(0, 0, s * 0.6, s * 0.28, 0, 0, Math.PI * 2); g.fill();
      } else if (p.shape === 'tri') {
        g.beginPath(); g.moveTo(0, -s / 1.6); g.lineTo(s / 1.8, s / 2.4); g.lineTo(-s / 1.8, s / 2.4); g.closePath(); g.fill();
      } else {
        g.fillRect(-s / 2, -s / 4, s, s / 2);
      }
      g.restore();
    }
    g.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(step);
    else { running = false; g.clearRect(0, 0, innerWidth, innerHeight); }
  }

  function shake(strength = 1) {
    if (reduce || !shakeOn) return;
    const b = document.body;
    b.style.setProperty('--shake', `${Math.min(strength * Math.min(power, 1.4), 5) * 3}px`);
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }

  function flash(color = '#fff', strength = 0.35) {
    if (reduce) strength *= 0.4;
    const el = document.createElement('div');
    el.className = 'flash';
    el.style.background = color;
    el.style.setProperty('--strength', strength);
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function floatText(x, y, text, { color = '#fff', size = 18, delay = 0, cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.style.animationDelay = `${delay}ms`;
    floaters.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function configure(opts) {
    if (opts.style) style = opts.style;
    if (opts.power) power = opts.power;
    if (opts.shake !== undefined) shakeOn = opts.shake;
  }

  return { burst, confetti, dust, shake, flash, floatText, configure, reduce };
})();
