'use strict';

// Settings for the desktop app (tray, start at login, global shortcut). Only shown when the
// page runs inside the desktop shell, which exposes window.desktop (see desktop/preload.js).
const DesktopPrefs = (() => {
  const api = window.desktop;
  const isMac = !!api && api.platform === 'darwin';
  let root = null;
  let state = null;
  let recording = false;
  let message = null; // { kind: 'error' | 'ok', text }

  const PRESETS = isMac
    ? ['Command+Shift+Space', 'Alt+Space', 'Control+Alt+D', 'Command+Alt+D', 'F9']
    : ['CommandOrControl+Shift+Space', 'Control+Alt+Space', 'Control+Alt+D', 'Alt+Shift+D', 'F9'];

  // ------------------------------------------------------------------ accelerator <-> keys
  const MAC_SYMBOL = { Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Super: '⌘' };
  const PC_NAME = { CommandOrControl: 'Ctrl', Command: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Option: 'Alt', Shift: 'Shift', Super: api && api.platform === 'win32' ? 'Win' : 'Super' };
  const KEY_LABEL = { Space: 'Space', Up: '↑', Down: '↓', Left: '←', Right: '→', Enter: 'Enter', Backspace: '⌫', Delete: 'Del', Escape: 'Esc', Tab: 'Tab' };

  function keycaps(acc) {
    if (!acc) return '<span class="kbd-none">none</span>';
    return acc.split('+').map((p) => {
      const label = MODS.has(p) ? (isMac ? MAC_SYMBOL[p] : PC_NAME[p]) : (KEY_LABEL[p] || p.replace(/^num/, 'Num '));
      return `<kbd>${label}</kbd>`;
    }).join('<i>+</i>');
  }
  const MODS = new Set(['CommandOrControl', 'Command', 'Cmd', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super']);

  const CODE_KEY = {
    Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
    PrintScreen: 'PrintScreen', ScrollLock: 'Scrolllock', Pause: 'Pause',
    MediaPlayPause: 'MediaPlayPause', MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', MediaStop: 'MediaStop',
    AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
  };
  function keyOf(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
    if (/^Numpad\d$/.test(code)) return `num${code.slice(6)}`;
    return CODE_KEY[code] || null;
  }
  function modsOf(e) {
    const m = [];
    if (isMac) { if (e.metaKey) m.push('Command'); if (e.ctrlKey) m.push('Control'); }
    else { if (e.ctrlKey) m.push('Control'); if (e.metaKey) m.push('Super'); }
    if (e.altKey) m.push('Alt');
    if (e.shiftKey) m.push('Shift');
    return m;
  }
  // A shortcut must not swallow normal typing everywhere: F-keys and media keys may stand alone,
  // everything else needs Ctrl / Cmd / Alt / Win (Shift alone isn't enough).
  function validate(mods, key) {
    const solo = /^F\d+$/.test(key) || /^(Media|Volume)/.test(key);
    if (solo) return null;
    if (!mods.some((m) => m !== 'Shift')) return 'Add Ctrl, Alt' + (isMac ? ', Cmd' : ', Win') + ' or use an F-key, so it doesn\'t fire while you type in other apps.';
    return null;
  }

  // ------------------------------------------------------------------ recording
  function onRecordKey(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const mods = modsOf(e);
    if (e.type === 'keyup') { preview(mods); return; }
    if (e.key === 'Escape' && !mods.length) { stopRecording(); return; }
    const key = keyOf(e.code);
    if (!key) { preview(mods); return; } // only modifiers so far
    const problem = validate(mods, key);
    if (problem) { message = { kind: 'error', text: problem }; draw(); return; }
    save([...mods, key].join('+'));
  }
  function preview(mods) {
    const el = root && root.querySelector('.kbd-live');
    if (el) el.innerHTML = mods.length ? keycaps(mods.join('+')) + '<i>+</i><kbd class="ghost">…</kbd>' : '<span class="kbd-hint">Press the keys together…</span>';
  }
  async function startRecording() {
    recording = true;
    message = null;
    await api.pauseShortcut();
    addEventListener('keydown', onRecordKey, true);
    addEventListener('keyup', onRecordKey, true);
    draw();
  }
  async function stopRecording() {
    recording = false;
    removeEventListener('keydown', onRecordKey, true);
    removeEventListener('keyup', onRecordKey, true);
    await api.resumeShortcut();
    state = await api.get();
    draw();
  }
  async function save(acc) {
    recording = false;
    removeEventListener('keydown', onRecordKey, true);
    removeEventListener('keyup', onRecordKey, true);
    const res = await api.set('shortcut', acc);
    state = res;
    if (res.rejected) {
      message = { kind: 'error', text: res.shortcutError === 'invalid'
        ? 'That combination isn\'t supported. Try another one.'
        : 'Another app or the system already uses that combination. Pick another one.' };
    } else {
      message = { kind: 'ok', text: 'Saved. Press it anywhere to show or hide the app.' };
    }
    draw();
  }

  // ------------------------------------------------------------------ UI
  const toggle = (key, label, hint, disabled = false) => `
    <div class="pref pref-inline ${disabled ? 'disabled' : ''}">
      <div class="pref-head"><b>${label}</b>${hint ? `<span>${hint}</span>` : ''}</div>
      <button class="switch ${state[key] ? 'on' : ''}" data-dk="${key}" role="switch" aria-checked="${!!state[key]}" aria-label="${label}" ${disabled ? 'disabled' : ''}><i></i></button>
    </div>`;

  function draw() {
    if (!root || !state) return;
    const s = state;
    const actionIdx = s.shortcutAction === 'show' ? 1 : 0;
    root.innerHTML = `
      <h3>Desktop app</h3>
      <div class="set-group prefs-group">
        ${toggle('runInBackground', 'Keep running in the background', 'Closing the window keeps the app in the tray, so the shortcut always works.')}
        ${toggle('openAtLogin', 'Start when I log in', 'Opens with your computer.')}
        ${toggle('startHidden', 'Start hidden in the tray', 'At login, wait quietly until you press the shortcut.', !s.openAtLogin)}
      </div>
      <h3>Global shortcut</h3>
      <div class="set-group prefs-group">
        ${toggle('shortcutEnabled', 'Shortcut on', 'Works from any app, even when this window is hidden.')}
        <div class="pref ${s.shortcutEnabled ? '' : 'disabled'}">
          <div class="pref-head"><b>Keys</b><span>Press it once to bring the app forward, again to send it back.</span></div>
          <div class="kbd-row">
            <div class="kbd-box ${recording ? 'recording' : ''}">
              ${recording ? '<div class="kbd-live"><span class="kbd-hint">Press the keys together…</span></div>' : `<div>${keycaps(s.shortcut)}</div>`}
            </div>
            ${recording
              ? '<button class="pref-preview rp" data-dk-act="cancel">Cancel</button>'
              : '<button class="pref-preview rp" data-dk-act="record">Change</button>'}
          </div>
          ${message ? `<div class="kbd-msg ${message.kind}">${message.text}</div>` : ''}
          <div class="kbd-presets">
            ${PRESETS.map((p) => `<button class="kbd-preset ${p === s.shortcut ? 'on' : ''}" data-dk-act="preset" data-val="${p}">${keycaps(p)}</button>`).join('')}
            <button class="kbd-preset reset" data-dk-act="preset" data-val="${s.defaultShortcut}">Reset</button>
          </div>
        </div>
        <div class="pref ${s.shortcutEnabled ? '' : 'disabled'}">
          <div class="pref-head"><b>Pressing it</b></div>
          <div class="seg" style="--n:2;--idx:${actionIdx}"><i class="seg-pill"></i>
            <button class="${actionIdx === 0 ? 'on' : ''}" data-dk-seg="shortcutAction" data-val="toggle">Shows and hides</button>
            <button class="${actionIdx === 1 ? 'on' : ''}" data-dk-seg="shortcutAction" data-val="show">Always shows</button>
          </div>
        </div>
        ${toggle('focusQuickAdd', 'Ready to type when it appears', 'The cursor waits in the quick-add box. Type, Enter, done.')}
        ${toggle('hideOnBlur', 'Hide when I click elsewhere', 'Behaves like a launcher: it gets out of the way on its own.')}
        ${s.platform === 'linux' ? '<div class="kbd-note">On Linux Wayland sessions some desktops block app shortcuts. If it doesn\'t react, bind the same keys to this app in your system keyboard settings.</div>' : ''}
      </div>`;
  }

  function bind() {
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-dk], [data-dk-act], [data-dk-seg]');
      if (!t || t.disabled) return;
      if (t.dataset.dk) {
        const key = t.dataset.dk;
        state = await api.set(key, !state[key]);
        if (key === 'shortcutEnabled' && state.shortcutError) message = { kind: 'error', text: 'Another app already uses that combination. Pick another one.' };
        draw();
        return;
      }
      if (t.dataset.dkSeg) { state = await api.set(t.dataset.dkSeg, t.dataset.val); draw(); return; }
      const act = t.dataset.dkAct;
      if (act === 'record') startRecording();
      if (act === 'cancel') { message = null; stopRecording(); }
      if (act === 'preset') save(t.dataset.val);
    });
  }

  let bound = false;
  async function render(container) {
    if (!api) { container.hidden = true; return; }
    container.hidden = false;
    root = container;
    if (!bound) { bind(); bound = true; api.onSettings((s) => { state = s; if (!recording) draw(); }); }
    state = await api.get();
    message = null;
    draw();
  }

  return { available: !!api, render, get recording() { return recording; }, stop: () => recording && stopRecording() };
})();
