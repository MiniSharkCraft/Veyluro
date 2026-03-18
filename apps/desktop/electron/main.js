/**
 * @file main.js — Electron main process
 * @description Wraps the Vite-built web app in an Electron window.
 * In dev: loads http://localhost:3000 (Vite dev server).
 * In prod: loads the bundled web dist from extraResources.
 *
 * Security: contextIsolation=true, nodeIntegration=false.
 * The renderer is just a browser — no Node.js access.
 */

const { app, BrowserWindow, globalShortcut, Notification, ipcMain, shell } = require('electron')
const path = require('path')

const isDev = !app.isPackaged

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#050508',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'win32',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      // Security: renderer is pure browser context
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      // Allow IndexedDB for key storage (same as browser)
      webSecurity: true,
    },
  })

  const appURL = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(process.resourcesPath, 'web-dist', 'index.html')}`

  mainWindow.loadURL(appURL)
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  registerShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function registerShortcuts() {
  // Ctrl+R / Cmd+R: reload
  globalShortcut.register('CommandOrControl+R', () => {
    mainWindow?.webContents.reload()
  })

  // F11: fullscreen toggle
  globalShortcut.register('F11', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })

  // Ctrl+Shift+D: devtools (dev only)
  if (isDev) {
    globalShortcut.register('CommandOrControl+Shift+D', () => {
      mainWindow?.webContents.toggleDevTools()
    })
  }
}

// ─── IPC: System notifications ────────────────────────────────────────────────
// The renderer calls window.electron.notify(title, body) via the preload bridge.
ipcMain.handle('notify', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '../assets/icon.png') }).show()
  }
})
