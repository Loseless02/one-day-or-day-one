'use strict';

// Phone vibration.
// Android (Chrome, Edge, Firefox): the Vibration API, with real patterns and strength.
// iPhone: Safari has no Vibration API. Since iOS 18, toggling a hidden <input switch> plays the
// system haptic tick, so patterns are played as a series of ticks. Desktop: silently does nothing.
const Haptics = (() => {
  const canVibrate = typeof navigator.vibrate === 'function';
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let enabled = true;
  let strength = 1;

  // [buzz, pause, buzz, pause, ...] in ms
  const PATTERNS = {
    tap: [8],
    tick: [5],
    add: [12],
    hold: [6],
    complete: [22, 40, 34],
    rare: [18, 30, 18, 30, 40],
    epic: [25, 40, 25, 40, 60, 50, 90],
    legendary: [40, 50, 40, 50, 40, 60, 140, 70, 200],
    crown: [30, 40, 70],
    boss: [70, 40, 70, 40, 220],
    level: [30, 50, 30, 50, 30, 60, 160],
    perfect: [50, 60, 50, 60, 50, 70, 260],
    swipe: [10],
    wrong: [60, 50, 60, 50, 90],
    unlock: [15, 40, 30],
  };

  function iosTick() {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  }

  function play(name) {
    if (!enabled) return;
    const p = PATTERNS[name] || PATTERNS.tap;
    if (canVibrate) {
      try { navigator.vibrate(p.map((ms, i) => (i % 2 ? ms : Math.max(1, Math.round(ms * strength))))); } catch (_) { /* blocked */ }
      return;
    }
    if (isIOS) {
      // One tick per buzz; iOS decides the strength. Cap at 5 ticks so it stays crisp.
      let t = 0;
      p.forEach((ms, i) => {
        if (i % 2 === 0 && i / 2 < 5) setTimeout(iosTick, t);
        t += ms;
      });
    }
  }

  return {
    play,
    // Desktop Chrome exposes navigator.vibrate but has no motor, so also require a touch screen.
    kind: canVibrate && navigator.maxTouchPoints > 0 ? 'vibrate' : isIOS ? 'ios' : 'none',
    set enabled(v) { enabled = !!v; },
    set strength(v) { strength = v; },
  };
})();
