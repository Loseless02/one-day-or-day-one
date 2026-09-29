'use strict';

// Desktop shell for One Day or Day One (Windows, macOS, Linux).
// Loads the same web app, adds a tray icon, background mode, start-at-login and a global
// shortcut that toggles the window.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space';

// ------------------------------------------------------------------ settings (main-process owned)
const DEFAULTS = {
  runInBackground: true,   // closing the window keeps the app in the tray
  openAtLogin: false,
  startHidden: true,       // when launched at login, stay in the tray until summoned
  shortcutEnabled: true,
  shortcut: DEFAULT_SHORTCUT,
  shortcutAction: 'toggle', // 'toggle' (show/hide) or 'show' (always bring to front)
  hideOnBlur: false,       // hide when you click away, like a launcher
  focusQuickAdd: true,     // caret lands in the quick-add box whenever the window appears
};
const settingsFile = () => path.join(app.getPath('userData'), 'desktop-settings.json');
let settings = { ...DEFAULTS };
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (_) { settings = { ...DEFAULTS }; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (err) { console.error('Could not save desktop settings', err); }
}

// ------------------------------------------------------------------ app:// protocol
// Serving the app from a custom secure origin (instead of file://) lets it fetch its audio
// samples and keeps its saved data under one stable origin.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function serveApp() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(ROOT, rel));
    const allowed = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons', 'samples'];
    const inside = path.relative(ROOT, file);
    if (inside.startsWith('..') || path.isAbsolute(inside) || !allowed.some((a) => inside === a || inside.startsWith(a + path.sep))) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ------------------------------------------------------------------ window
let win = null;
let tray = null;
let quitting = false;

const iconPath = () => path.join(ROOT, 'icons', 'icon-512.png');

function createWindow({ show }) {
  win = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 380,
    minHeight: 520,
    show: false,
    backgroundColor: '#0a0c16',
    title: 'One Day or Day One',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://bundle/index.html');

  win.once('ready-to-show', () => { if (show) reveal(); });

  // Stay inside the app: external links open in the browser, nothing else navigates.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });

  win.on('close', (e) => {
    if (quitting || !settings.runInBackground) return;
    e.preventDefault();
    hideWindow();
  });
  win.on('blur', () => {
    if (settings.hideOnBlur && win.isVisible() && !win.webContents.isDevToolsFocused()) hideWindow();
  });
  win.on('closed', () => { win = null; });
}

function reveal() {
  if (!win) createWindow({ show: false });
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (IS_MAC) app.focus({ steal: true });
  if (settings.focusQuickAdd) win.webContents.send('desktop:shown');
  refreshTray();
}

function hideWindow() {
  if (!win) return;
  win.hide();
  if (IS_MAC) app.hide(); // hand focus back to the previous app
  refreshTray();
}

function toggleWindow() {
  if (settings.shortcutAction === 'show') return reveal();
  if (win && win.isVisible() && win.isFocused()) hideWindow();
  else reveal();
}

// ------------------------------------------------------------------ global shortcut
let shortcutError = null;
function registerShortcut() {
  globalShortcut.unregisterAll();
  shortcutError = null;
  if (!settings.shortcutEnabled || !settings.shortcut) return true;
  let ok = false;
  try { ok = globalShortcut.register(settings.shortcut, toggleWindow); } catch (err) { shortcutError = 'invalid'; return false; }
  if (!ok) shortcutError = 'taken';
  return ok;
}

// ------------------------------------------------------------------ start at login
function linuxAutostartFile() {
  return path.join(os.homedir(), '.config', 'autostart', 'one-day-or-day-one.desktop');
}
function applyLoginItem() {
  const hiddenArg = settings.startHidden ? ['--hidden'] : [];
  if (IS_LINUX) {
    const file = linuxAutostartFile();
    try {
      if (settings.openAtLogin) {
        const exec = process.env.APPIMAGE || process.execPath;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, [
          '[Desktop Entry]', 'Type=Application', 'Name=One Day or Day One',
          `Exec="${exec}" ${hiddenArg.join(' ')}`.trim(), 'X-GNOME-Autostart-enabled=true', '',
        ].join('\n'));
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (err) { console.error('Autostart update failed', err); }
    return;
  }
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin, openAsHidden: settings.startHidden, args: hiddenArg });
}
function launchedHidden() {
  if (process.argv.includes('--hidden')) return true;
  if (IS_MAC) {
    const s = app.getLoginItemSettings();
    return s.wasOpenedAtLogin && settings.startHidden;
  }
  return false;
}

// ------------------------------------------------------------------ tray
function refreshTray() {
  if (!tray) return;
  const visible = win && win.isVisible();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visible ? 'Hide' : 'Show One Day or Day One', click: () => (visible ? hideWindow() : reveal()) },
    { label: 'Add a task…', click: () => reveal() },
    { type: 'separator' },
    { label: 'Keep running in background', type: 'checkbox', checked: settings.runInBackground, click: (i) => setSetting('runInBackground', i.checked) },
    { label: 'Start at login', type: 'checkbox', checked: settings.openAtLogin, click: (i) => setSetting('openAtLogin', i.checked) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.setToolTip(settings.shortcutEnabled && settings.shortcut
    ? `One Day or Day One (${settings.shortcut.replace('CommandOrControl', IS_MAC ? 'Cmd' : 'Ctrl')})`
    : 'One Day or Day One');
}
function createTray() {
  const img = nativeImage.createFromPath(iconPath()).resize({ width: IS_MAC ? 18 : 16, height: IS_MAC ? 18 : 16 });
  tray = new Tray(img);
  tray.on('click', () => { if (!IS_MAC) toggleWindow(); });
  refreshTray();
}

// ------------------------------------------------------------------ settings bridge
function status() {
  return { ...settings, platform: process.platform, shortcutError, defaultShortcut: DEFAULT_SHORTCUT, version: app.getVersion() };
}
function setSetting(key, value) {
  if (!(key in DEFAULTS)) return status();
  const prev = settings[key];
  settings[key] = value;
  if (key === 'shortcut' || key === 'shortcutEnabled') {
    if (!registerShortcut() && key === 'shortcut') {
      // Keep the new choice visible with its error, but fall back to the previous working one.
      const failed = shortcutError;
      settings.shortcut = prev;
      registerShortcut();
      saveSettings();
      refreshTray();
      return { ...status(), shortcutError: failed, rejected: value };
    }
  }
  if (key === 'openAtLogin' || key === 'startHidden') applyLoginItem();
  saveSettings();
  refreshTray();
  if (win) win.webContents.send('desktop:settings', status());
  return status();
}

ipcMain.handle('desktop:get', () => status());
ipcMain.handle('desktop:set', (_e, key, value) => setSetting(key, value));
// While the renderer records a new shortcut, the current one must not fire.
ipcMain.handle('desktop:pause-shortcut', () => { globalShortcut.unregisterAll(); return true; });
ipcMain.handle('desktop:resume-shortcut', () => registerShortcut());
ipcMain.handle('desktop:hide', () => hideWindow());

// ------------------------------------------------------------------ lifecycle
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => reveal());

  app.whenReady().then(() => {
    loadSettings();
    serveApp();
    if (IS_MAC && app.dock) app.dock.setIcon(nativeImage.createFromPath(iconPath()));
    createTray();
    createWindow({ show: !launchedHidden() });
    registerShortcut();
    applyLoginItem();
  });

  app.on('activate', () => reveal()); // macOS dock click
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {
    if (!settings.runInBackground) app.quit();
  });
}
