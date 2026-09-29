'use strict';

// User customization: schema, defaults, live application, and the settings controls.
// Values live in Store.state.settings so they travel with backups.
const Prefs = (() => {
  // [accent 1, accent 2, name, group]. Deep accents pair a dark base with a mid tone light enough to read as text.
  const ACCENTS = {
    dawn: ['#ff7a59', '#ffcf4a', 'Dawn', 'Bright'],
    ember: ['#ff3d3d', '#ff9d3d', 'Ember', 'Bright'],
    gold: ['#e0a100', '#ffe680', 'Gold', 'Bright'],
    rose: ['#ff4f8b', '#ffb3c7', 'Rose', 'Bright'],
    aurora: ['#7c5cff', '#6dffb0', 'Aurora', 'Bright'],
    ocean: ['#2f8cff', '#4fe3ff', 'Ocean', 'Bright'],
    forest: ['#2fbf71', '#d4ff5c', 'Forest', 'Bright'],
    mono: ['#9aa3c0', '#ffffff', 'Mono', 'Bright'],
    crimson: ['#7a0c1c', '#f0566a', 'Crimson', 'Deep'],
    wine: ['#4f0d24', '#df5f92', 'Wine', 'Deep'],
    plum: ['#3f1140', '#cc6ccc', 'Plum', 'Deep'],
    amethyst: ['#2e1466', '#9670ff', 'Amethyst', 'Deep'],
    midnight: ['#111d57', '#5b7dff', 'Midnight', 'Deep'],
    abyss: ['#053f45', '#1fbab6', 'Abyss', 'Deep'],
    emerald: ['#073d26', '#2bbd7c', 'Emerald', 'Deep'],
    moss: ['#2c3a0c', '#96ba3a', 'Moss', 'Deep'],
    bronze: ['#4a2508', '#cc7f35', 'Bronze', 'Deep'],
    obsidian: ['#16181f', '#7d86a8', 'Obsidian', 'Deep'],
  };

  const SCHEMA = [
    { section: 'Look' },
    { key: 'accent', label: 'Accent', type: 'swatch', def: 'dawn' },
    { key: 'tint', label: 'Tint background', hint: 'The sky takes on your accent color. Great with deep accents.', type: 'toggle', def: false },
    { key: 'bg', label: 'Background', hint: 'Live follows the real time of day', type: 'seg', def: 'live',
      options: [['live', 'Live'], ['dawn', 'Dawn'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night'], ['plain', 'Plain']] },
    { key: 'embers', label: 'Floating embers', hint: 'Slow sparks drifting up the background', type: 'toggle', def: true },
    { key: 'font', label: 'Font', type: 'seg', def: 'system',
      options: [['system', 'Clean'], ['soft', 'Soft'], ['wide', 'Wide'], ['serif', 'Serif'], ['mono', 'Mono']] },
    { key: 'cards', label: 'Cards', type: 'seg', def: 'glass', options: [['glass', 'Glass'], ['solid', 'Solid'], ['outline', 'Outline']] },
    { key: 'density', label: 'Density', type: 'seg', def: 'comfy', options: [['comfy', 'Comfortable'], ['compact', 'Compact']] },
    { key: 'radius', label: 'Corners', type: 'range', def: 14, min: 2, max: 24, unit: 'px' },
    { key: 'orb', label: 'Orb shape', type: 'seg', def: 'circle',
      options: [['circle', 'Circle'], ['square', 'Square'], ['diamond', 'Diamond'], ['hex', 'Hex']] },

    { section: 'Typing' },
    { key: 'quickLane', label: 'Type anywhere to add to', hint: 'Start typing with no field selected; Enter adds it and keeps you typing.', type: 'seg', def: 'someday',
      options: [['someday', 'One Day'], ['today', 'Day One']] },

    { section: 'Motion & rewards' },
    { key: 'celebrate', label: 'Celebrations', hint: 'Level-ups, epic drops, perfect days. Tap: stays until you tap. 3s / 1.5s: closes by itself. Toast: small popup, no full screen.', type: 'seg', def: 'auto', preview: true,
      options: [['tap', 'Tap'], ['auto', '3s'], ['quick', '1.5s'], ['toast', 'Toast']] },
    { key: 'particles', label: 'Particles', type: 'seg', def: 'confetti',
      options: [['confetti', 'Confetti'], ['stars', 'Stars'], ['hearts', 'Hearts'], ['sparks', 'Sparks'], ['petals', 'Petals']] },
    { key: 'fx', label: 'Effect intensity', type: 'seg', def: 'normal', options: [['low', 'Calm'], ['normal', 'Normal'], ['max', 'Chaos']] },
    { key: 'shake', label: 'Screen shake', type: 'toggle', def: true },
    { key: 'hold', label: 'Hold to complete', hint: 'Bosses scale from this', type: 'seg', def: 'normal',
      options: [['quick', 'Quick'], ['normal', 'Normal'], ['long', 'Long']] },

    { section: 'Sound & vibration' },
    { key: 'sound', label: 'Sound', hint: 'Synth tones on every win', type: 'toggle', def: true },
    { key: 'voice', label: 'Sound style', hint: 'Jazz: sax lead over piano and upright bass', type: 'seg', def: 'jazz',
      options: [['jazz', 'Jazz'], ['piano', 'Piano'], ['sax', 'Sax'], ['rhodes', 'Rhodes'], ['choir', 'Choir']] },
    { key: 'samples', label: 'Recorded instruments', hint: 'Real sax and grand piano recordings. Off: everything is synthesized.', type: 'toggle', def: true },
    { key: 'volume', label: 'Volume', type: 'range', def: 70, min: 0, max: 100, unit: '%' },
    { key: 'haptics', label: 'Vibration', type: 'toggle', def: true,
      hint: {
        vibrate: 'Buzz patterns on holds, wins, loot and level-ups.',
        ios: 'iPhone: uses the system haptic tick (iOS 18 or newer). Strength is set by iOS.',
        none: 'This device has no vibration motor. Works on phones.',
      }[Haptics.kind] },
    { key: 'hapticStrength', label: 'Vibration strength', type: 'seg', def: 'normal', androidOnly: true,
      options: [['light', 'Light'], ['normal', 'Normal'], ['strong', 'Strong']] },
  ];
  const FIELDS = SCHEMA.filter((s) => s.key);
  const byKey = Object.fromEntries(FIELDS.map((s) => [s.key, s]));

  const listeners = [];
  const settings = () => Store.state.settings;
  // Unknown or retired values (an old backup, a removed option) fall back to the default.
  function get(k) {
    const s = byKey[k];
    const v = settings()[k];
    if (v === undefined) return s.def;
    if (s.type === 'seg' && !s.options.some(([id]) => id === v)) return s.def;
    if (s.type === 'swatch' && !ACCENTS[v]) return s.def;
    return v;
  }
  const accent = () => ACCENTS[get('accent')];
  const rgbArr = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb = (hex) => rgbArr(hex).join(',');
  // WCAG relative luminance, used to pick dark or light text on accent fills.
  const lum = (hex) => {
    const [r, g, b] = rgbArr(hex).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const mixHex = (a, b, t) => `#${rgbArr(a).map((c, i) => Math.round(c + (rgbArr(b)[i] - c) * t).toString(16).padStart(2, '0')).join('')}`;
  const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  // Dark or white text: whichever keeps the best worst-case contrast across every fill it sits on.
  const DARK_INK = '#1f1206';
  const ink = (...fills) => {
    const worst = (c) => Math.min(...fills.map((f) => contrast(c, f)));
    return worst(DARK_INK) >= worst('#ffffff') ? DARK_INK : '#ffffff';
  };

  function set(k, v) {
    settings()[k] = v;
    Store.save();
    apply();
    update(k);
    listeners.forEach((fn) => fn(k, v));
  }

  function apply() {
    const html = document.documentElement;
    const [a1, a2] = accent();
    html.style.setProperty('--dawn1', a1);
    html.style.setProperty('--dawn2', a2);
    html.style.setProperty('--a1-rgb', rgb(a1));
    html.style.setProperty('--a2-rgb', rgb(a2));
    // Deep accents: lift accent 1 until it reads on the dark UI, and use white text on fills.
    let a1text = a1;
    for (let t = 0.1; contrast(a1text, '#141a2d') < 4.5 && t <= 0.9; t += 0.1) a1text = mixHex(a1, '#ffffff', t);
    html.style.setProperty('--a1-text', a1text);
    // Accent fills are gradients (buttons, pills) and their text must reach 4.5:1 at both ends.
    // Dark text: lighten the start toward a2. White text: darken the end toward a1 (then black).
    const onFill = ink(a1, a2, mixHex(a1, a2, 0.5));
    let fill1 = a1, fill2 = a2;
    if (onFill === DARK_INK) {
      for (let t = 0.1; contrast(onFill, fill1) < 4.5 && t <= 1; t += 0.1) fill1 = mixHex(a1, a2, t);
    } else {
      for (let t = 0.1; contrast(onFill, fill2) < 4.5 && t <= 1; t += 0.1) fill2 = mixHex(a2, a1, t);
      for (let t = 0.1; contrast(onFill, fill2) < 4.5 && t <= 0.6; t += 0.1) fill2 = mixHex(fill2, '#000000', t);
      for (let t = 0.1; contrast(onFill, fill1) < 4.5 && t <= 0.6; t += 0.1) fill1 = mixHex(a1, '#000000', t);
    }
    html.style.setProperty('--fill1', fill1);
    html.style.setProperty('--fill2', fill2);
    html.style.setProperty('--on-accent', onFill);
    html.style.setProperty('--on-a2', ink(a2));
    html.style.setProperty('--radius', `${get('radius')}px`);
    for (const k of ['bg', 'font', 'cards', 'density', 'orb', 'particles', 'fx']) html.dataset[k] = get(k);
    html.dataset.embers = get('embers') ? 'on' : 'off';
    html.dataset.tint = get('tint') ? 'on' : 'off';
    Haptics.enabled = get('haptics');
    Haptics.strength = { light: 0.5, normal: 1, strong: 1.8 }[get('hapticStrength')];
    FX.configure({ style: get('particles'), power: { low: 0.45, normal: 1, max: 2 }[get('fx')], shake: get('shake') });
    Sound.enabled = get('sound');
    Sound.voice = get('voice');
    Sound.samples = get('samples');
    Sound.volume = get('volume') / 100;
    if (typeof Anim !== 'undefined') Anim.setPhase();
  }

  // ------------------------------------------------------------------ controls
  let root = null;

  function control(s) {
    const v = get(s.key);
    const head = `<div class="pref-head"><b>${s.label}</b>${s.hint ? `<span>${s.hint}</span>` : ''}</div>`;
    if (s.type === 'swatch') {
      const groups = {};
      for (const [id, [c1, c2, name, group]] of Object.entries(ACCENTS)) {
        (groups[group] = groups[group] || []).push(
          `<button class="swatch ${v === id ? 'on' : ''}" data-pref="${s.key}" data-val="${id}" title="${name}" aria-label="${name}" style="--s1:${c1};--s2:${c2}"></button>`);
      }
      return `<div class="pref" data-key="${s.key}">${head}${Object.entries(groups).map(([g, items]) =>
        `<div class="swatch-group"><span>${g}</span><div class="swatches">${items.join('')}</div></div>`).join('')}
        <div class="swatch-name">${ACCENTS[v][2]}</div></div>`;
    }
    if (s.type === 'seg') {
      const idx = Math.max(0, s.options.findIndex(([id]) => id === v));
      return `<div class="pref" data-key="${s.key}">${head}<div class="pref-row">
        <div class="seg" style="--n:${s.options.length};--idx:${idx}"><i class="seg-pill"></i>${s.options.map(([id, label]) =>
          `<button class="${v === id ? 'on' : ''}" data-pref="${s.key}" data-val="${id}">${label}</button>`).join('')}</div>
        ${s.preview ? `<button class="pref-preview rp" data-preview="${s.key}">Try</button>` : ''}</div></div>`;
    }
    if (s.type === 'toggle') {
      return `<div class="pref pref-inline" data-key="${s.key}">${head}
        <button class="switch ${v ? 'on' : ''}" data-pref="${s.key}" data-toggle role="switch" aria-checked="${!!v}" aria-label="${s.label}"><i></i></button></div>`;
    }
    if (s.type === 'range') {
      return `<div class="pref" data-key="${s.key}">${head}<div class="pref-row">
        <input type="range" class="range" data-pref="${s.key}" min="${s.min}" max="${s.max}" value="${v}" style="--fill:${((v - s.min) / (s.max - s.min)) * 100}%">
        <output>${v}${s.unit || ''}</output></div></div>`;
    }
    return '';
  }

  function render(container) {
    root = container;
    let html = '';
    let open = false;
    for (const s of SCHEMA) {
      if (s.section) {
        if (open) html += '</div>';
        html += `<h3>${s.section}</h3><div class="set-group prefs-group">`;
        open = true;
      } else if (!(s.androidOnly && Haptics.kind !== 'vibrate')) html += control(s);
    }
    if (open) html += '</div>';
    root.innerHTML = html;
  }

  // Update one control in place so the sliding pill and switch animate instead of re-rendering.
  function update(k) {
    if (!root) return;
    const el = root.querySelector(`.pref[data-key="${k}"]`);
    if (!el) return;
    const s = byKey[k];
    const v = get(k);
    if (s.type === 'seg') {
      el.querySelector('.seg').style.setProperty('--idx', Math.max(0, s.options.findIndex(([id]) => id === v)));
      el.querySelectorAll('[data-val]').forEach((b) => b.classList.toggle('on', b.dataset.val === v));
    } else if (s.type === 'swatch') {
      el.querySelectorAll('[data-val]').forEach((b) => b.classList.toggle('on', b.dataset.val === v));
      el.querySelector('.swatch-name').textContent = ACCENTS[v][2];
    } else if (s.type === 'toggle') {
      const sw = el.querySelector('.switch');
      sw.classList.toggle('on', !!v);
      sw.setAttribute('aria-checked', String(!!v));
    } else if (s.type === 'range') {
      const input = el.querySelector('input');
      if (+input.value !== v) input.value = v;
      input.style.setProperty('--fill', `${((v - s.min) / (s.max - s.min)) * 100}%`);
      el.querySelector('output').textContent = `${v}${s.unit || ''}`;
    }
  }

  function bind(container, { onPreview } = {}) {
    container.addEventListener('click', (e) => {
      const pv = e.target.closest('[data-preview]');
      if (pv) { if (onPreview) onPreview(pv.dataset.preview, pv); return; }
      const b = e.target.closest('[data-pref]');
      if (!b || b.type === 'range') return;
      const k = b.dataset.pref;
      if (b.hasAttribute('data-toggle')) set(k, !get(k));
      else set(k, b.dataset.val);
      feedback(k, b);
    });
    container.addEventListener('input', (e) => {
      const r = e.target.closest('input[data-pref]');
      if (r) set(r.dataset.pref, +r.value);
    });
    container.addEventListener('change', (e) => {
      const r = e.target.closest('input[data-pref]');
      if (r && r.dataset.pref === 'volume') Sound.pluck(7);
    });
  }

  // Small taste of the change right where you tapped.
  function feedback(k, el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const [a1, a2] = accent();
    if (k === 'particles' || k === 'fx' || k === 'accent') {
      FX.burst(x, y, { count: 30, colors: [a1, a2, '#fff'], speed: 6 });
    }
    if (k === 'voice' || k === 'sound' || k === 'samples') Sound.demo();
    if (k === 'shake' && get('shake')) FX.shake(1.5);
    if (k === 'accent' || k === 'orb') Sound.tick();
    if (k === 'haptics' || k === 'hapticStrength') Haptics.play('complete');
    else Haptics.play('tap');
  }

  return {
    ACCENTS, get, set, apply, accent, render, bind,
    onChange(fn) { listeners.push(fn); },
    holdMs() { return { quick: 400, normal: 650, long: 1000 }[get('hold')] || 650; },
  };
})();
