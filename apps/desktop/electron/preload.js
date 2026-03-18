/**
 * @file preload.js — Electron preload bridge
 * @description Exposes a minimal, safe API from main → renderer.
 * contextIsolation=true means the renderer can't access Node.js directly.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  /** Send a system notification from the renderer */
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  /** Platform info for UI adjustments */
  platform: process.platform,

  /** App version */
  version: process.env.npm_package_version ?? '0.1.0',
})
