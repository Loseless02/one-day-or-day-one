'use strict';

// The only bridge between the web app and the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  get: () => ipcRenderer.invoke('desktop:get'),
  set: (key, value) => ipcRenderer.invoke('desktop:set', key, value),
  pauseShortcut: () => ipcRenderer.invoke('desktop:pause-shortcut'),
  resumeShortcut: () => ipcRenderer.invoke('desktop:resume-shortcut'),
  hide: () => ipcRenderer.invoke('desktop:hide'),
  onShown: (fn) => ipcRenderer.on('desktop:shown', () => fn()),
  onSettings: (fn) => ipcRenderer.on('desktop:settings', (_e, s) => fn(s)),
});
