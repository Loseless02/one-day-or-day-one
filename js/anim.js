'use strict';

// Motion helpers: FLIP list moves, count-ups, fly-to-target particles, swipe, tilt, ripple, ambient sky.
const Anim = (() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Record where every keyed element is, mutate the DOM, then animate each element
  // from its old spot to its new one. New elements get a staggered entrance.
  function flip(selector, mutate, { enter = true } = {}) {
    const before = new Map();
    if (!reduce) {
      document.querySelectorAll(selector).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width) before.set(el.dataset.id, r);
      });
    }
    mutate();
    if (reduce) return;
    let n = 0;
    document.querySelectorAll(selector).forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width) return;
      const a = before.get(el.dataset.id);
      if (!a) {
        if (enter) {
          el.animate(
            [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }],
            { duration: 460, delay: Math.min(n++, 12) * 45, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'backwards' },
          );
        }
        return;
      }
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const far = Math.abs(dx) > 60 || Math.abs(dy) > 160;
      const frames = far
        ? [
          { transform: `translate(${dx}px,${dy}px)`, boxShadow: '0 0 0 rgba(0,0,0,0)' },
          { transform: `translate(${dx * 0.45}px,${dy * 0.45 - 36}px) scale(1.06) rotate(${dx > 0 ? -2 : 2}deg)`, boxShadow: '0 30px 60px rgba(0,0,0,.55)', offset: 0.5 },
          { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)' },
        ]
        : [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }];
      if (far) el.style.zIndex = 10;
      const an = el.animate(frames, { duration: far ? 720 : 380, easing: 'cubic-bezier(.25,.9,.3,1)' });
      if (far) an.onfinish = () => { el.style.zIndex = ''; };
    });
  }

  function countTo(el, to, fmt = (v) => v) {
    const from = el._v === undefined ? to : el._v;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const dur = Math.min(1000, 300 + Math.abs(to - from) * 6);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (p < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  // Glowing motes that scatter from a point and home in on a target element.
  function flyTo(from, target, { count = 10, color = '#ffcf4a', size = 8, dur = 760, onArrive } = {}) {
    let called = false;
    const done = () => { if (!called) { called = true; if (onArrive) onArrive(); } };
    if (reduce || !target || !target.getClientRects().length) { setTimeout(done, 200); return; }
    const tr = target.getBoundingClientRect();
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    let landed = 0;
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.className = 'fly-dot';
      d.style.cssText = `left:${from.x - size / 2}px;top:${from.y - size / 2}px;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 12px ${color},0 0 4px #fff`;
      document.body.appendChild(d);
      const mx = (Math.random() - 0.5) * 180;
      const my = -40 - Math.random() * 110;
      const an = d.animate([
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1.25)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${tx - from.x}px,${ty - from.y}px) scale(.45)`, opacity: 0.95 },
      ], { duration: dur + i * 35, delay: i * 22, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
      an.onfinish = () => { d.remove(); if (++landed === count) done(); };
    }
    setTimeout(done, dur + count * 60 + 300);
  }

  function flyEl(html, from, target, { dur = 800, scale = 0.4 } = {}) {
    if (reduce || !target || !target.getClientRects().length) return;
    const tr = target.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'fly-el';
    d.innerHTML = html;
    d.style.left = `${from.x}px`;
    d.style.top = `${from.y}px`;
    document.body.appendChild(d);
    const dx = tr.left + tr.width / 2 - from.x, dy = tr.top + tr.height / 2 - from.y;
    d.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.4 - 60}px)) scale(1.1) rotate(-20deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale}) rotate(-200deg)`, opacity: 0.2 },
    ], { duration: dur, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).onfinish = () => d.remove();
  }

  // Replays a one-shot CSS animation class and removes it afterwards, so no end-state styles linger.
  function pulse(el, cls = 'pulse', ms = 1200) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el._pulse);
    el._pulse = setTimeout(() => el.classList.remove(cls), ms);
  }

  // Split a line into words that rise in one after another. No-op when the text has not changed.
  function words(el, text) {
    if (el._text === text) return;
    el._text = text;
    el.innerHTML = text.split(' ').map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
  }

  // Horizontal swipe on cards. Vertical drags scroll the page as usual.
  function swipe(root, selector, { canLeft, canRight, onLeft, onRight, threshold = 100 }) {
    let s = null;
    let suppress = false;
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const card = e.target.closest(selector);
      if (!card || e.target.closest('button, input, .orb')) return;
      s = { card, x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
    });
    root.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.active) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          s.active = true;
          try { s.card.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          s.card.classList.add('swiping');
        } else if (Math.abs(dy) > 12) { s = null; return; } else return;
      }
      const ok = (dx < 0 && canLeft(s.card)) || (dx > 0 && canRight(s.card));
      s.dx = ok ? dx : dx * 0.15;
      s.card.style.transform = `translateX(${s.dx}px) rotate(${s.dx / 45}deg)`;
      s.card.style.setProperty('--swipe', Math.min(1, Math.abs(s.dx) / threshold).toFixed(2));
      s.card.dataset.dir = dx < 0 ? 'left' : 'right';
      const armed = Math.abs(s.dx) > threshold;
      if (armed !== !!s.armed) { s.armed = armed; s.card.classList.toggle('armed', armed); if (armed) { Sound.tick(); Haptics.play('tick'); } }
    });
    const end = () => {
      if (!s) return;
      const { card, dx, active } = s;
      s = null;
      if (!active) return;
      suppress = true;
      setTimeout(() => { suppress = false; }, 60);
      card.classList.remove('swiping', 'armed');
      if (Math.abs(dx) > threshold && ((dx < 0 && canLeft(card)) || (dx > 0 && canRight(card)))) {
        Haptics.play('swipe');
        (dx < 0 ? onLeft : onRight)(card);
      } else {
        const from = card.style.transform;
        card.style.transform = '';
        card.style.removeProperty('--swipe');
        if (!reduce) card.animate([{ transform: from }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,1.5,.4,1)' });
      }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  function tilt(root, selector) {
    if (reduce) return;
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(520px) rotateY(${px * 20}deg) rotateX(${-py * 20}deg) translateY(-4px)`;
      el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
      el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
    });
    root.addEventListener('pointerout', (e) => {
      const el = e.target.closest(selector);
      if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
    });
  }

  function ripple(e) {
    const b = e.target.closest('.rp');
    if (!b || reduce) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
  document.addEventListener('pointerdown', ripple);

  // Background sky that follows the real time of day.
  function phaseFor(h) {
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 8 && h < 17) return 'day';
    if (h >= 17 && h < 21) return 'dusk';
    return 'night';
  }
  function ambient() {
    const layers = document.querySelectorAll('.ambient .stars');
    layers.forEach((layer, k) => {
      const pts = [];
      for (let i = 0; i < 70; i++) {
        const x = Math.round(Math.random() * 2000), y = Math.round(Math.random() * 1400);
        const a = (0.3 + Math.random() * 0.6).toFixed(2);
        pts.push(`${x}px ${y}px 0 ${k ? 0 : 0.5}px rgba(220,228,255,${a})`);
      }
      layer.style.boxShadow = pts.join(',');
    });
    const embers = document.querySelector('.ambient .embers');
    if (embers && !embers.childElementCount) {
      embers.innerHTML = Array.from({ length: 22 }, () => {
        const size = (2 + Math.random() * 3).toFixed(1);
        return `<span style="left:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;--dx:${Math.round((Math.random() - 0.5) * 160)}px;animation-duration:${(14 + Math.random() * 16).toFixed(1)}s;animation-delay:-${(Math.random() * 30).toFixed(1)}s"></span>`;
      }).join('');
    }
    setPhase();
  }
  // A fixed background choice in settings wins over the clock.
  function setPhase() {
    const html = document.documentElement;
    const fixed = html.dataset.bg;
    html.dataset.phase = ['dawn', 'day', 'dusk', 'night'].includes(fixed) ? fixed : fixed === 'plain' ? 'night' : phaseFor(new Date().getHours());
  }

  return { reduce, flip, countTo, flyTo, flyEl, pulse, words, swipe, tilt, ambient, setPhase };
})();
