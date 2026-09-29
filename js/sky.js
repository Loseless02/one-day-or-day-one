'use strict';

// The Sky: every finished task becomes a star; each day's wins are joined into a constellation.
const Sky = (() => {
  let cv, g, wrap, tip, onPick;
  let W = 0, H = 0, raf = null;
  let stars = [], dust = [], lines = [], labels = [];
  let hover = null;
  const lit = new Map(); // entry id -> time lit (for song playback)

  const SIZE = { common: 1.8, rare: 2.6, epic: 3.4, legendary: 4.8 };

  function mount(wrapEl, canvasEl, tipEl, pickCb) {
    wrap = wrapEl; cv = canvasEl; tip = tipEl; onPick = pickCb;
    g = cv.getContext('2d');
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mouseleave', () => { hover = null; tip.hidden = true; });
    cv.addEventListener('click', onClick);
    addEventListener('resize', () => { if (raf) layout(Store.state.log); });
  }

  function layout(log) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rnd = mulberry(7);
    dust = Array.from({ length: Math.round((W * H) / 2600) }, () => ({
      x: rnd() * W, y: rnd() * H, r: rnd() * 1.1 + 0.2, p: rnd() * 6, s: 0.5 + rnd() * 1.5,
    }));

    stars = []; lines = []; labels = [];
    if (!log.length) return;
    const today = Store.dayKey();
    const first = log.reduce((m, e) => (e.day < m ? e.day : m), today);
    const span = Math.max(0, Store.daysBetween(first, today));
    const padX = 48, padTop = 36, padBot = 44;
    const colW = (W - padX * 2) / (span + 1);
    const colX = (i) => (span === 0 ? W / 2 : padX + colW * (i + 0.5));

    const byDay = new Map();
    for (const e of log) {
      if (!byDay.has(e.day)) byDay.set(e.day, []);
      byDay.get(e.day).push(e);
    }
    const usableH = H - padTop - padBot;
    for (const [day, entries] of byDay) {
      const i = Store.daysBetween(first, day);
      // Each day's stars cluster around their own point, so a day reads as one shape.
      const radius = Math.min(usableH * 0.3, 26 + entries.length * 12);
      const cx = colX(i);
      const cy = padTop + radius + (Loot.hash(day) / 4294967295) * Math.max(0, usableH - radius * 2);
      const rx = Math.max(Math.min(colW * 0.6, radius), 18);
      const dayStars = entries.sort((a, b) => a.at - b.at).map((e) => {
        const a = (Loot.hash(e.id) / 4294967295) * Math.PI * 2;
        const h2 = Loot.hash(e.id + '*') / 4294967295;
        const d = 0.25 + 0.75 * Math.sqrt(h2);
        const s = {
          e, day, x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * radius * d,
          r: SIZE[e.rarity] + (e.boss ? 1.2 : 0), color: Loot.RARITY[e.rarity].color, tw: h2 * 6,
        };
        stars.push(s);
        return s;
      });
      // Nearest-neighbour path from the day's first win: short strokes, recognisable shapes.
      const perfect = !!Store.state.perfectDays[day];
      const left = dayStars.slice(1);
      let cur = dayStars[0];
      while (left.length) {
        let bi = 0, bd = Infinity;
        left.forEach((s, k) => { const dd = (s.x - cur.x) ** 2 + (s.y - cur.y) ** 2; if (dd < bd) { bd = dd; bi = k; } });
        const next = left.splice(bi, 1)[0];
        lines.push({ a: cur, b: next, perfect, day });
        cur = next;
      }
    }
    // A few date labels along the bottom.
    const every = Math.max(1, Math.ceil((span + 1) / Math.max(1, Math.floor(W / 90))));
    for (let i = 0; i <= span; i += every) {
      const d = new Date(Date.UTC(...first.split('-').map((n, k) => (k === 1 ? n - 1 : +n))) + i * 864e5);
      labels.push({ x: colX(i), text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
    }
  }

  function draw(now) {
    const t = now / 1000;
    g.clearRect(0, 0, W, H);
    // faint background stars
    for (const d of dust) {
      g.globalAlpha = 0.25 + 0.25 * Math.sin(t * d.s + d.p);
      g.fillStyle = '#c9d2ff';
      g.fillRect(d.x, d.y, d.r, d.r);
    }
    g.globalAlpha = 1;
    // constellation lines
    for (const l of lines) {
      const hot = hover && hover.day === l.day;
      g.strokeStyle = l.perfect ? `rgba(255,207,74,${hot ? 0.8 : 0.45})` : `rgba(170,190,255,${hot ? 0.6 : 0.2})`;
      g.lineWidth = l.perfect ? 1.4 : 1;
      g.beginPath(); g.moveTo(l.a.x, l.a.y); g.lineTo(l.b.x, l.b.y); g.stroke();
    }
    // stars
    for (const s of stars) {
      const litAt = lit.get(s.e.id);
      const pulse = litAt ? Math.max(0, 1 - (now - litAt) / 900) : 0;
      const tw = 0.75 + 0.25 * Math.sin(t * 2 + s.tw);
      const r = s.r * (1 + pulse * 1.6) * (hover === s ? 1.5 : 1);
      const glow = r * (s.e.rarity === 'legendary' ? 6 : 4);
      const grd = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, glow);
      grd.addColorStop(0, hexA(s.color, 0.55 * tw + pulse * 0.4));
      grd.addColorStop(1, hexA(s.color, 0));
      g.fillStyle = grd;
      g.beginPath(); g.arc(s.x, s.y, glow, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.globalAlpha = 0.85 * tw + pulse * 0.15;
      g.beginPath(); g.arc(s.x, s.y, r * 0.6, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      if (s.e.rarity === 'legendary' || s.e.boss) {
        g.strokeStyle = hexA(s.color, 0.6 * tw);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(s.x - r * 3, s.y); g.lineTo(s.x + r * 3, s.y);
        g.moveTo(s.x, s.y - r * 3); g.lineTo(s.x, s.y + r * 3);
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(160,170,210,.55)';
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const l of labels) g.fillText(l.text, l.x, H - 16);
    raf = requestAnimationFrame(draw);
  }

  function nearest(mx, my) {
    let best = null, bd = 18 * 18;
    for (const s of stars) {
      const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function onMove(ev) {
    const r = cv.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    hover = nearest(mx, my);
    cv.style.cursor = hover ? 'pointer' : 'default';
    if (!hover) { tip.hidden = true; return; }
    const e = hover.e;
    const R = Loot.RARITY[e.rarity];
    const relic = Loot.byId[e.relicId];
    const when = new Date(e.at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    tip.innerHTML = `<b>${esc(e.title)}</b><span style="color:${R.color}">${R.label}${relic ? ' · ' + esc(relic.name) : ''}</span><span>${when} · +${e.xp} XP${e.boss ? ' · boss' : ''}</span>`;
    tip.hidden = false;
    const tx = Math.min(Math.max(hover.x, 110), W - 110);
    tip.style.left = `${tx}px`;
    tip.style.top = `${hover.y < 90 ? hover.y + 18 : hover.y - 14}px`;
    tip.classList.toggle('below', hover.y < 90);
  }

  function onClick(ev) {
    const r = cv.getBoundingClientRect();
    const s = nearest(ev.clientX - r.left, ev.clientY - r.top);
    if (s && onPick) onPick(s.day);
  }

  function light(entryId) { lit.set(entryId, performance.now()); }

  function start(log) {
    layout(log);
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  }
  function mulberry(a) {
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  return { mount, start, stop, light };
})();
