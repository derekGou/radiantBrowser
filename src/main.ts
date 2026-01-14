import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import { Tabs } from './tabs' // import your Tabs class
import { getOmniboxSuggestions } from './omnibox'

if (started) app.quit()

let mainWindow: BrowserWindow | null = null
let tabs: Tabs

// Resolve dev server URL from environment when available (plugin-vite sets VITE_DEV_SERVER_URL)
const MAIN_WINDOW_VITE_DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

function createWindow() {
    const isDev = process.env.NODE_ENV === 'development'
    const preloadPath = isDev
        ? path.join(__dirname, 'preload.js')
        : path.join(process.resourcesPath, 'app.asar.unpacked', '.vite', 'build', 'preload.js')

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        backgroundColor: '#06070D',
        titleBarStyle: 'hiddenInset',
        ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
        webPreferences: {
            webviewTag: true,
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    // Open DevTools in development for profiling
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools()
    }

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    } else {
        // packaged renderer lives inside the app.asar at .vite/renderer/<name>/index.html
        mainWindow.loadFile(
            path.join(process.resourcesPath, 'app.asar', '.vite', 'renderer', 'main_window', 'index.html')
        )
    }

    // Instantiate tabs
    tabs = new Tabs(mainWindow)
    tabs.create('') // open first tab
}

// Wire IPC handlers (only once, outside createWindow)
ipcMain.handle('tabs:create', (_e, url: string) => tabs.create(url))
ipcMain.handle('tabs:activate', (_e, id: string) => tabs.activate(id))
ipcMain.handle('tabs:close', (_e, id: string) => tabs.close(id))
ipcMain.handle('tabs:get', () => tabs.getTabInfo())
ipcMain.handle("tabs:canGoBack", () => tabs.canGoBack());
ipcMain.handle("tabs:canGoForward", () => tabs.canGoForward());
ipcMain.on("tabs:goBack", () => tabs.goBack())
ipcMain.on("tabs:goForward", () => tabs.goForward())
ipcMain.on("tabs:navigate", (_, url: string) => tabs.navigate(url));
ipcMain.on("tabs:setUIOffset", (_, px: number) => tabs.setUIOffset(px));
ipcMain.on('tabs:reload', () => {
    const tab = tabs.getActiveTab();
    if (!tab) return;

    tab.view.webContents.reload();
});
ipcMain.handle('omnibox:query', (_, text) => {
    return getOmniboxSuggestions(
        text,
        [],
        []
    )
});
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})