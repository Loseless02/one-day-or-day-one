'use strict';

// 4-digit passcode screen. The code is stored only as a salted SHA-256 hash.
// It is a privacy screen for a shared or borrowed device, not encryption: the task data itself
// stays readable to anyone with developer tools on this browser profile.
const Lock = (() => {
  const KEY = 'onedaydayone.lock';
  const MAX_TRIES = 5;
  const COOLDOWN = 30000;
  const AUTO_OPTIONS = [[0, 'Immediately'], [60000, 'After 1 minute'], [300000, 'After 5 minutes'], [900000, 'After 15 minutes']];

  let cfg = read();
  let root, dotsEl, promptEl, msgEl, altEl, timeEl, dateEl, lineEl;
  let mode = null, entry = '', first = '', busy = false, resolveFn = null, hiddenAt = 0, clockTimer = 0, closeTimer = 0;
  const unlockListeners = [];

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } }
  function write() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) { /* storage blocked */ } }
  const enabled = () => !!cfg.hash;
  const autoMs = () => (typeof cfg.auto === 'number' ? cfg.auto : 60000);
  const isOpen = () => !!root && !root.hidden;
  const cooldownLeft = () => Math.max(0, (cfg.until || 0) - Date.now());

  async function digest(pin, salt) {
    const data = new TextEncoder().encode(`${salt}:${pin}`);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Insecure contexts have no SubtleCrypto; fall back to a plain hash.
    let h = 0x811c9dc5;
    for (const c of data) { h ^= c; h = Math.imul(h, 16777619); }
    return `fnv${(h >>> 0).toString(16)}`;
  }
  function newSalt() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function build() {
    root = document.getElementById('lock');
    root.innerHTML = `
      <div class="lock-bg"><div class="lock-sun"></div><div class="lock-horizon"></div></div>
      <div class="lock-inner">
        <div class="lock-clock">
          <div class="lock-time" id="lockTime"></div>
          <div class="lock-date" id="lockDate"></div>
          <div class="lock-line" id="lockLine"></div>
        </div>
        <div class="lock-pad">
          <div class="lock-brand">ONE DAY <i>or</i> <b>DAY ONE</b></div>
          <div class="lock-prompt" id="lockPrompt"></div>
          <div class="lock-dots" id="lockDots"><i></i><i></i><i></i><i></i></div>
          <div class="lock-msg" id="lockMsg"></div>
          <div class="keypad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="key rp" data-k="${n}">${n}</button>`).join('')}
            <button class="key key-text" data-k="alt" id="lockAlt"></button>
            <button class="key rp" data-k="0">0</button>
            <button class="key key-text" data-k="del" aria-label="Delete digit">
              <svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12z"/><path d="m12 9 6 6M18 9l-6 6"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    dotsEl = root.querySelector('#lockDots');
    promptEl = root.querySelector('#lockPrompt');
    msgEl = root.querySelector('#lockMsg');
    altEl = root.querySelector('#lockAlt');
    timeEl = root.querySelector('#lockTime');
    dateEl = root.querySelector('#lockDate');
    lineEl = root.querySelector('#lockLine');
    root.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (k) press(k.dataset.k);
    });
    addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      e.stopImmediatePropagation();
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape' && mode !== 'unlock') press('alt');
      e.preventDefault();
    }, true);
  }

  const PROMPTS = {
    unlock: 'Enter passcode',
    verify: 'Enter current passcode',
    set1: 'Choose a 4-digit passcode',
    set2: 'Type it once more',
  };

  function open(m) {
    clearTimeout(closeTimer);
    dotsEl.classList.remove('ok', 'shake');
    mode = m;
    entry = '';
    first = '';
    busy = false;
    root.hidden = false;
    root.classList.remove('opening', 'closing');
    root.classList.toggle('setup', m !== 'unlock');
    if (m === 'unlock') document.documentElement.classList.add('locked');
    setPrompt(PROMPTS[m]);
    altEl.textContent = m === 'unlock' ? 'Forgot?' : 'Cancel';
    msgEl.textContent = '';
    dots();
    clock();
    clearInterval(clockTimer);
    clockTimer = setInterval(clock, 1000);
    return new Promise((res) => { resolveFn = res; });
  }

  function setPrompt(text) {
    promptEl.textContent = text;
    promptEl.classList.remove('swap');
    void promptEl.offsetWidth;
    promptEl.classList.add('swap');
  }

  function clock() {
    const d = new Date();
    timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    try {
      const s = Store.streakInfo();
      lineEl.textContent = s.current === 0 ? 'Today can be Day One.'
        : s.doneToday ? `${s.current}-day streak · kept today` : `${s.current}-day streak · on the line`;
    } catch (_) { lineEl.textContent = ''; }
    const left = cooldownLeft();
    if (left > 0) msgEl.textContent = `Too many tries. Wait ${Math.ceil(left / 1000)}s.`;
    else if (msgEl.textContent.startsWith('Too many')) msgEl.textContent = '';
  }

  function dots(pop) {
    [...dotsEl.children].forEach((d, i) => {
      const on = i < entry.length;
      d.classList.toggle('on', on);
      if (pop && i === entry.length - 1) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
    });
  }

  function press(k) {
    if (busy) return;
    if (k === 'alt') { alt(); return; }
    if (k === 'del') { entry = entry.slice(0, -1); dots(); return; }
    if ((mode === 'unlock' || mode === 'verify') && cooldownLeft() > 0) {
      dotsEl.classList.remove('shake'); void dotsEl.offsetWidth; dotsEl.classList.add('shake');
      return;
    }
    if (entry.length >= 4) return;
    entry += k;
    Sound.key(+k);
    Haptics.play('tick');
    dots(true);
    if (entry.length === 4) { busy = true; setTimeout(submit, 150); }
  }

  async function submit() {
    const pin = entry;
    if (mode === 'unlock' || mode === 'verify') {
      const ok = (await digest(pin, cfg.salt)) === cfg.hash;
      if (ok) { cfg.fails = 0; cfg.until = 0; write(); success(); } else fail();
    } else if (mode === 'set1') {
      first = pin;
      mode = 'set2';
      entry = '';
      busy = false;
      dots();
      setPrompt(PROMPTS.set2);
    } else if (mode === 'set2') {
      if (pin === first) {
        cfg.salt = newSalt();
        cfg.hash = await digest(pin, cfg.salt);
        if (typeof cfg.auto !== 'number') cfg.auto = 60000;
        cfg.fails = 0;
        write();
        success();
      } else {
        mode = 'set1';
        first = '';
        reject("Didn't match. Pick one again.");
        setPrompt(PROMPTS.set1);
      }
    }
  }

  function fail() {
    cfg.fails = (cfg.fails || 0) + 1;
    let msg = `Wrong passcode${cfg.fails >= 3 ? ` · ${MAX_TRIES - cfg.fails} left before a pause` : ''}`;
    if (cfg.fails >= MAX_TRIES) {
      cfg.fails = 0;
      cfg.until = Date.now() + COOLDOWN;
      msg = `Too many tries. Wait ${COOLDOWN / 1000}s.`;
    }
    write();
    reject(msg);
  }

  function reject(msg) {
    Sound.denied();
    Haptics.play('wrong');
    dotsEl.classList.remove('shake', 'ok');
    void dotsEl.offsetWidth;
    dotsEl.classList.add('shake');
    msgEl.textContent = msg;
    setTimeout(() => { entry = ''; dots(); busy = false; }, 420);
  }

  function success() {
    dotsEl.classList.add('ok');
    Sound.unlockChime();
    Haptics.play('unlock');
    setTimeout(() => close(true), 280);
  }

  function close(ok) {
    clearInterval(clockTimer);
    const wasUnlock = mode === 'unlock';
    mode = null;
    const html = document.documentElement;
    root.classList.add(wasUnlock ? 'opening' : 'closing');
    if (wasUnlock) {
      html.classList.remove('locked');
      html.classList.add('unlocking');
    }
    closeTimer = setTimeout(() => {
      root.hidden = true;
      root.classList.remove('opening', 'closing');
      dotsEl.classList.remove('ok', 'shake');
      html.classList.remove('unlocking');
    }, wasUnlock ? 800 : 300);
    const r = resolveFn;
    resolveFn = null;
    if (r) r(ok);
    if (wasUnlock && ok) unlockListeners.forEach((fn) => fn());
  }

  function alt() {
    if (mode !== 'unlock') { close(false); return; }
    const sure = confirm('Forgot your passcode?\n\nIt cannot be recovered. The only way back in is to erase everything stored by this app on this device: tasks, relics, sky and streak.\n\nErase everything?');
    if (!sure) return;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(Store.KEY);
    } catch (_) { /* ignore */ }
    location.reload();
  }

  function init() {
    build();
    if (enabled()) open('unlock');
    document.addEventListener('visibilitychange', () => {
      if (!enabled() || isOpen()) return;
      if (document.hidden) {
        hiddenAt = Date.now();
        if (autoMs() === 0) open('unlock');
      } else if (hiddenAt && Date.now() - hiddenAt >= autoMs()) {
        open('unlock');
      }
    });
  }

  return {
    init,
    AUTO_OPTIONS,
    get enabled() { return enabled(); },
    get auto() { return autoMs(); },
    set auto(ms) { cfg.auto = ms; write(); },
    isOpen,
    onUnlock(fn) { unlockListeners.push(fn); },
    lockNow() { if (enabled() && !isOpen()) open('unlock'); },
    async setup() { return open('set1'); },
    async change() { return (await open('verify')) && open('set1'); },
    async remove() {
      if (!(await open('verify'))) return false;
      cfg = { auto: cfg.auto };
      write();
      return true;
    },
  };
})();
