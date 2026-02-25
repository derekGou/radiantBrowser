import { app, BrowserWindow, ipcMain, session, screen, globalShortcut, InputEvent, protocol, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import Store from 'electron-store'
import started from 'electron-squirrel-startup'
import { Tabs } from './tabs'
import { getOmniboxSuggestions } from './omnibox'
import { exec, spawn, ChildProcess } from "child_process"
import { registerSettingsIPC } from "./ipcSettings"
import { db, getSetting, deleteHistoryEntry, clearHistoryByTimePeriod } from './settingsDB'

// Track launch performance
const LAUNCH_START_TIME = performance.now()
console.log('[Launch] App started')

if (started) app.quit()

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'radiant',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
])

// Performance optimizations
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// Window references
let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null // Combined: crosshair + input capture + suggestions
let tabs: Tabs
let keytapProcess: ChildProcess | null = null

// State variables
let virtualCursorPos = { x: 0, y: 0 }
let sensitivity = 0.75
let invertMouse = false
let isCustomCursorMode = false
let isRendererVisible = false

// Performance optimization variables
let lastClickTime = 0
let pendingCrosshairUpdate = false
let lastWebviewMouseUpdate = 0
let lastAppMouseUpdate = 0

// Constants
const CROSSHAIR_SIZE = 200
const HALF = CROSSHAIR_SIZE / 2
const CLICK_DEBOUNCE = 50
const UI_OFFSET = 96
const WEBVIEW_MOUSE_THROTTLE = 16 // ~60fps

// Store and locale
const store = new Store()
const savedLocale = store.get('locale') as string
let currentLocale = savedLocale || 'en-US'

;(global as any).currentLocale = currentLocale

app.commandLine.appendSwitch("lang", currentLocale)
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const MAIN_WINDOW_VITE_DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'

// Utility functions
function isUsable(win: BrowserWindow | null): win is BrowserWindow {
    return win !== null && !win.isDestroyed()
}

function normalizeSensitivity(value: unknown) {
    const num = Number(value)
    if (!Number.isFinite(num)) return 1
    return Math.min(10, Math.max(0.01, num))
}

sensitivity = normalizeSensitivity(getSetting<number>('sensitivity', 1))
invertMouse = Boolean(getSetting<boolean>('invertMouse', false))

function getKeytapBinaryPath(): string | null {
    const isDev = process.env.NODE_ENV === 'development'
    let binaryName = 'keytap'
    
    if (process.platform === 'darwin') {
        binaryName = 'keytap'
    } else if (process.platform === 'win32') {
        binaryName = 'keytap.exe'
    } else {
        return null
    }

    const devPath = path.join(app.getAppPath(), 'resources', binaryName)
    const prodPath = path.join(process.resourcesPath, binaryName)

    if (fs.existsSync(prodPath)) return prodPath
    if (fs.existsSync(devPath)) return devPath

    return null
}

function startKeytapProcess() {
    if (keytapProcess || process.platform !== 'darwin') return

    const binaryPath = getKeytapBinaryPath()
    if (!binaryPath) {
        console.warn('Keytap binary not found; skipping')
        return
    }

    keytapProcess = spawn(binaryPath, [String(process.pid)], {
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    keytapProcess.stdout?.on('data', (data) => {
        const message = String(data).trim()
        if (message === 'ESC_PRESSED') {
            if (isUsable(mainWindow)) {
                mainWindow.webContents.sendInputEvent({
                    type: 'keyDown',
                    keyCode: 'Escape',
                })
                mainWindow.webContents.sendInputEvent({
                    type: 'keyUp',
                    keyCode: 'Escape',
                })
            }
        } else {
            console.log(`[keytap] ${message}`)
        }
    })

    keytapProcess.stderr?.on('data', (data) => {
        console.error(`[keytap] ${String(data).trim()}`)
    })

    keytapProcess.on('exit', () => {
        keytapProcess = null
    })
}

function stopKeytapProcess() {
    if (!keytapProcess) return
    keytapProcess.kill('SIGTERM')
    keytapProcess = null
}

function toggleCustomCursor() {
    isCustomCursorMode = !isCustomCursorMode
    
    console.log('Custom cursor mode:', isCustomCursorMode)
    
    if (!isUsable(mainWindow) || !isUsable(overlayWindow)) return
    
    if (isCustomCursorMode) {
        // Enable custom cursor
        // virtualCursorPos is already set by cursor:set-initial from the overlay
        // If not set, use center of window as fallback
        if (virtualCursorPos.x === 0 && virtualCursorPos.y === 0) {
            const bounds = mainWindow.getBounds()
            virtualCursorPos = { x: bounds.width / 2, y: bounds.height / 2 }
        }
        
        // Show overlay first
        overlayWindow.show()
        
        // Send initial position
        overlayWindow.webContents.send('crosshair:move', virtualCursorPos)
        
        // Focus and bring to top
        overlayWindow.moveTop()
        overlayWindow.focus()
        
        // Notify windows
        mainWindow.webContents.send('customcursor:enabled', true)
        overlayWindow.webContents.send('customcursor:enabled', true)
    } else {
        // Disable custom cursor
        // Notify first, then hide
        mainWindow.webContents.send('customcursor:enabled', false)
        overlayWindow.webContents.send('customcursor:enabled', false)

        // Keep overlay focused so the next click is captured immediately
        overlayWindow.show()
        overlayWindow.moveTop()
        overlayWindow.focus()
    }
}

function disableCustomCursor() {
    if (!isCustomCursorMode) return

    isCustomCursorMode = false

    // Notify windows first to release pointer lock
    if (isUsable(mainWindow)) mainWindow.webContents.send('customcursor:enabled', false)
    if (isUsable(overlayWindow)) overlayWindow.webContents.send('customcursor:enabled', false)
}

// Optimized click handler
function handleClick(sendInputEvents = true) {
    if (!isUsable(mainWindow)) return
    
    const now = Date.now()
    if (now - lastClickTime < CLICK_DEBOUNCE) return
    lastClickTime = now
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    // Fast path: Route directly to webview if renderer is visible
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        const webviewY = virtualCursorPos.y - UI_OFFSET
        
        // Send click events first
        if (sendInputEvents) {
            wc.sendInputEvent({ type: 'mouseDown', x: virtualCursorPos.x, y: webviewY, button: 'left', clickCount: 1 })
            wc.sendInputEvent({ type: 'mouseUp', x: virtualCursorPos.x, y: webviewY, button: 'left', clickCount: 1 })
        }
        
        // Inject comprehensive focus script with text input detection
        setTimeout(() => {
            wc.executeJavaScript(`
                (function() {
                    try {
                        const x = ${virtualCursorPos.x};
                        const y = ${webviewY};
                        const el = document.elementFromPoint(x, y);
                        
                        if (!el) {
                            console.log('No element at', x, y);
                            return null;
                        }
                        
                        console.log('Element:', el.tagName, el.type, el.className);
                        
                        const tagName = el.tagName.toUpperCase();
                        const isInput = tagName === 'INPUT';
                        const isTextArea = tagName === 'TEXTAREA';
                        const isEditable = el.isContentEditable === true;
                        
                        // Focus any input-like element
                        if (isInput || isTextArea || isEditable) {
                            // Track the active element so commit can target it reliably
                            document.querySelector('[data-radiant-text-input="true"]')?.removeAttribute('data-radiant-text-input');
                            el.setAttribute('data-radiant-text-input', 'true');
                            // Store original opacity and make transparent
                            el.setAttribute('data-radiant-original-opacity', el.style.opacity || '1');
                            el.style.opacity = '0';
                            if (typeof el.focus === 'function') {
                                try {
                                    el.focus({ preventScroll: true });
                                } catch {
                                    el.focus();
                                }
                            }
                            console.log('Focusing element');
                            
                            // Blur anything else first
                            if (document.activeElement && document.activeElement !== el) {
                                document.activeElement.blur();
                            }
                            
                            // Get element bounds for overlay
                            const rect = el.getBoundingClientRect();
                            const computedStyle = window.getComputedStyle(el);
                            const styleObject = {};

                            for (let i = 0; i < computedStyle.length; i++) {
                                const prop = computedStyle[i];
                                styleObject[prop] = computedStyle.getPropertyValue(prop);
                            }
                            
                            // Find first non-transparent background color
                            const findBackgroundColor = (element) => {
                                let current = element;
                                while (current && current !== document.body.parentElement) {
                                    const bg = window.getComputedStyle(current).backgroundColor;
                                    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                                        return bg;
                                    }
                                    current = current.parentElement;
                                }
                                return 'transparent';
                            };
                            
                            const contextBackgroundColor = findBackgroundColor(el);
                            styleObject['background-color'] = contextBackgroundColor;
                            
                            // Set cursor position for text inputs
                            const isTextInput = isInput && (
                                !el.type || 
                                el.type === 'text' || 
                                el.type === 'search' || 
                                el.type === 'url' || 
                                el.type === 'email' || 
                                el.type === 'password' ||
                                el.type === 'tel'
                            );
                            
                            if ((isTextInput || isTextArea) && el.setSelectionRange) {
                                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                                const clickX = x - rect.left - paddingLeft;
                                
                                // Create canvas for text measurement
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                ctx.font = computedStyle.font;
                                
                                const text = el.value || '';
                                let cursorPos = text.length; // Default to end
                                
                                // Find cursor position
                                for (let i = 0; i <= text.length; i++) {
                                    const width = ctx.measureText(text.substring(0, i)).width;
                                    if (width >= clickX) {
                                        cursorPos = i > 0 ? i - 1 : 0;
                                        break;
                                    }
                                }
                                
                                console.log('Setting cursor to position', cursorPos, 'in text:', text);
                                el.setSelectionRange(cursorPos, cursorPos);
                            }
                            
                            // Return bounds and value for overlay
                            return {
                                x: rect.left,
                                y: rect.top,
                                width: rect.width,
                                height: rect.height,
                                value: el.value,
                                type: el.type || 'text',
                                // Convert CSSStyleDeclaration to plain object
                                style: styleObject,
                            };
                        }
                        
                        return null;
                    } catch (e) {
                        console.error('Error in focus script:', e);
                        return null;
                    }
                })();
            `).then((inputData: any) => {
                if (inputData && overlayWindow && isUsable(overlayWindow)) {
                    // Don't re-show if we already have an active text input
                    if (activeTextInput && activeTextInput.isActive) {
                        console.log('Ignoring click - text input already active')
                        return
                    }
                    
                    activeTextInput = {
                        x: inputData.x,
                        y: inputData.y + UI_OFFSET,
                        width: inputData.width,
                        height: inputData.height,
                        value: inputData.value,
                        isActive: true,
                        style: inputData.style,
                    }
                    // Adjust coordinates for UI offset
                    overlayWindow.webContents.send('textinput:show', activeTextInput)
                }
            }).catch((err: any) => console.error('executeJavaScript error:', err))
        }, 50)
        
        return
    }
    
    // UI click path (React UI inputs) - only send click events if not already dragging
    if (sendInputEvents && !isDragging) {
        mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x: virtualCursorPos.x, y: virtualCursorPos.y, button: 'left', clickCount: 1 })
        mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x: virtualCursorPos.x, y: virtualCursorPos.y, button: 'left', clickCount: 1 })
    }
    
    mainWindow.webContents.executeJavaScript(`
        (() => {
            const x = ${virtualCursorPos.x};
            const y = ${virtualCursorPos.y};
            const el = document.elementFromPoint(x, y);
            if (!el) return { isWebview: false };
            
            if (el.tagName === 'WEBVIEW') return { isWebview: true };
            
            if (document.activeElement !== el) document.activeElement?.blur();
            
            const tagName = el.tagName.toUpperCase();
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || el.isContentEditable) {
                if (document.activeElement && document.activeElement !== el) {
                    document.activeElement.blur();
                }

                document.querySelector('[data-radiant-text-input="true"]')?.removeAttribute('data-radiant-text-input');
                el.setAttribute('data-radiant-text-input', 'true');
                // Store original opacity and make transparent
                el.setAttribute('data-radiant-original-opacity', el.style.opacity || '1');
                el.style.opacity = '0';
                if (typeof el.focus === 'function') {
                    try {
                        el.focus({ preventScroll: true });
                    } catch {
                        el.focus();
                    }
                }
                
                const originalValue = el.value || '';
                const isTextInput = tagName === 'INPUT' && (!el.type || ['text','search','url','email','password','tel'].includes(el.type));
                
                if ((isTextInput || tagName === 'TEXTAREA') && el.setSelectionRange) {
                    const rect = el.getBoundingClientRect();
                    const computedStyle = window.getComputedStyle(el);
                    const styleObject = {};

                    for (let i = 0; i < computedStyle.length; i++) {
                        const prop = computedStyle[i];
                        styleObject[prop] = computedStyle.getPropertyValue(prop);
                    }

                    const clickX = x - rect.left - parseFloat(computedStyle.paddingLeft);
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    ctx.font = computedStyle.font;
                    
                    const text = el.value || '';
                    let cursorPos = text.length;
                    
                    for (let i = 0; i <= text.length; i++) {
                        if (ctx.measureText(text.substring(0, i)).width >= clickX) {
                            cursorPos = i > 0 ? i - 1 : 0;
                            break;
                        }
                    }
                    
                    el.setSelectionRange(cursorPos, cursorPos);
                }
                
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const styleObject = {};

                for (let i = 0; i < style.length; i++) {
                    const prop = style[i];
                    styleObject[prop] = style.getPropertyValue(prop);
                }
                
                const findBackgroundColor = (element) => {
                    let current = element;
                    while (current && current !== document.body.parentElement) {
                        const bg = window.getComputedStyle(current).backgroundColor;
                        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                            return bg;
                        }
                        current = current.parentElement;
                    }
                    return 'transparent';
                };
                
                const contextBackgroundColor = findBackgroundColor(el);
                styleObject['context-background-color'] = contextBackgroundColor;

                return {
                    isWebview: false,
                    inputData: {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                        value: originalValue,
                        type: el.type || 'text',
                        style: styleObject,
                    },
                };
            }
            
            if (!el.isContentEditable && ${sendInputEvents}) {
                el.click?.() || el.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    clientX: x,
                    clientY: y
                }));
            }
            
            return { isWebview: false };
        })()
    `).then(result => {
        if (result?.inputData && overlayWindow && isUsable(overlayWindow)) {
            // Don't re-show if we already have an active text input
            if (activeTextInput && activeTextInput.isActive) {
                console.log('Ignoring click - text input already active')
                return
            }
            
            activeTextInput = {
                x: result.inputData.x,
                y: result.inputData.y,
                width: result.inputData.width,
                height: result.inputData.height,
                value: result.inputData.value,
                isActive: true,
                style: result.inputData.style,
            }
            overlayWindow.webContents.send('textinput:show', activeTextInput)
        }

        if (result?.isWebview) {
            const tab = (tabs as any).getActiveTab()
            if (!tab?.view?.webContents) return
            
            const wc = tab.view.webContents
            const webviewY = virtualCursorPos.y - UI_OFFSET
            
            if (sendInputEvents) {
                wc.sendInputEvent({ type: 'mouseDown', x: virtualCursorPos.x, y: webviewY, button: 'left', clickCount: 1 })
                wc.sendInputEvent({ type: 'mouseUp', x: virtualCursorPos.x, y: webviewY, button: 'left', clickCount: 1 })
            }
            
            // Same as fast path above
            setTimeout(() => {
                wc.executeJavaScript(`
                    (function() {
                        try {
                            const x = ${virtualCursorPos.x};
                            const y = ${webviewY};
                            const el = document.elementFromPoint(x, y);
                            
                            if (!el) return null;
                            
                            const tagName = el.tagName.toUpperCase();
                            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || el.isContentEditable) {
                                if (document.activeElement && document.activeElement !== el) {
                                    document.activeElement.blur();
                                }
                                
                                // Track and make transparent
                                document.querySelector('[data-radiant-text-input="true"]')?.removeAttribute('data-radiant-text-input');
                                el.setAttribute('data-radiant-text-input', 'true');
                                el.setAttribute('data-radiant-original-opacity', el.style.opacity || '1');
                                el.style.opacity = '0';
                                
                                // Capture original value for the overlay input
                                const originalValue = el.value || '';
                                
                                const isTextInput = tagName === 'INPUT' && (!el.type || ['text','search','url','email','password','tel'].includes(el.type));
                                
                                if ((isTextInput || tagName === 'TEXTAREA') && el.setSelectionRange) {
                                    const rect = el.getBoundingClientRect();
                                    const computedStyle = window.getComputedStyle(el);
                                    const styleObject = {};

                                    for (let i = 0; i < computedStyle.length; i++) {
                                        const prop = computedStyle[i];
                                        styleObject[prop] = computedStyle.getPropertyValue(prop);
                                    }

                                    const clickX = x - rect.left - parseFloat(computedStyle.paddingLeft);
                                    
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    ctx.font = computedStyle.font;
                                    
                                    const text = el.value || '';
                                    let cursorPos = text.length;
                                    
                                    for (let i = 0; i <= text.length; i++) {
                                        if (ctx.measureText(text.substring(0, i)).width >= clickX) {
                                            cursorPos = i > 0 ? i - 1 : 0;
                                            break;
                                        }
                                    }
                                    
                                    el.setSelectionRange(cursorPos, cursorPos);
                                }
                                
                                // Return bounds for overlay
                                const rect = el.getBoundingClientRect();
                                const style = window.getComputedStyle(el);
                                const styleObject = {};

                                for (let i = 0; i < style.length; i++) {
                                    const prop = style[i];
                                    styleObject[prop] = style.getPropertyValue(prop);
                                }
                                
                                // Find first non-transparent background color
                                const findBackgroundColor = (element) => {
                                    let current = element;
                                    while (current && current !== document.body.parentElement) {
                                        const bg = window.getComputedStyle(current).backgroundColor;
                                        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                                            return bg;
                                        }
                                        current = current.parentElement;
                                    }
                                    return 'transparent';
                                };
                                
                                const contextBackgroundColor = findBackgroundColor(el);
                                styleObject['context-background-color'] = contextBackgroundColor;

                                return {
                                    x: rect.left,
                                    y: rect.top,
                                    width: rect.width,
                                    height: rect.height,
                                    value: originalValue,
                                    type: el.type || 'text',
                                    style: styleObject,
                                };
                            }
                            
                            return null;
                        } catch (e) {
                            console.error('Error in focus script:', e);
                            return null;
                        }
                    })();
                `).then((inputData: any) => {
                    if (inputData && overlayWindow && isUsable(overlayWindow)) {
                        // Don't re-show if we already have an active text input
                        if (activeTextInput && activeTextInput.isActive) {
                            console.log('Ignoring click - text input already active')
                            return
                        }
                        
                        activeTextInput = {
                            x: inputData.x,
                            y: inputData.y + UI_OFFSET,
                            width: inputData.width,
                            height: inputData.height,
                            value: inputData.value,
                            isActive: true,
                            style: inputData.style,
                        }
                        
                        overlayWindow.webContents.send('textinput:show', activeTextInput)
                    }
                }).catch(() => {})
            }, 50)
        }
    }).catch(() => {})
}


function createWindow() {
    console.log(`[Launch] Creating window: ${(performance.now() - LAUNCH_START_TIME).toFixed(2)}ms`)
    
    const isDev = process.env.NODE_ENV === 'development'
    const preloadPath = isDev
        ? path.join(__dirname, 'preload.js')
        : path.join(process.resourcesPath, 'app.asar.unpacked', '.vite', 'build', 'preload.js')

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false, // Don't show until ready - improves perceived performance
        transparent: true,
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

    mainWindow.setWindowButtonVisibility(false)

    const ses = mainWindow.webContents.session
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['Accept-Language'] = currentLocale
        callback({ requestHeaders: details.requestHeaders })
    })
    
    const langCode = currentLocale.split('-')[0]
    ses.setSpellCheckerLanguages([langCode])

    if (isDev) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    } else {
        mainWindow.loadFile(
            path.join(process.resourcesPath, 'app.asar', '.vite', 'renderer', 'main_window', 'index.html')
        )
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error(`Failed to load: ${errorDescription} (Code: ${errorCode})`)
    })

    mainWindow.webContents.on('did-finish-load', () => {
        const loadTime = performance.now()
        console.log(`[Launch] Main window loaded: ${(loadTime - LAUNCH_START_TIME).toFixed(2)}ms`)
        console.log(`[Launch] 🚀 Browser ready! Total time: ${(loadTime - LAUNCH_START_TIME).toFixed(2)}ms`)
        
        // Show window now that it's ready
        if (isUsable(mainWindow)) {
            // Ensure UI window is NOT zoomed
            mainWindow.webContents.setZoomLevel(0)
            mainWindow.show()
            
            // Defer non-critical operations
            setImmediate(() => {
                if (isDev && isUsable(mainWindow)) {
                    mainWindow.webContents.openDevTools()
                }
                startKeytapProcess()
            })
        }
    })

    console.log(`[Launch] Main window created: ${(performance.now() - LAUNCH_START_TIME).toFixed(2)}ms`)

    tabs = new Tabs(mainWindow, currentLocale, preloadPath, isDev, MAIN_WINDOW_VITE_DEV_SERVER_URL)
    tabs.create('')

    const bounds = mainWindow.getBounds()

    // Create unified overlay window (combines crosshair, input capture, and suggestions)
    overlayWindow = new BrowserWindow({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        transparent: true,
        frame: false,
        focusable: true,
        hasShadow: false,
        modal: false,
        skipTaskbar: true,
        fullscreenable: true,
        show: false, // Start hidden for better performance
        parent: mainWindow,
        acceptFirstMouse: true,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        }
    })
    
    // Show overlay after it loads
    overlayWindow.webContents.once('did-finish-load', () => {
        if (isUsable(overlayWindow)) overlayWindow.show()
    })

    if (isDev) {
        overlayWindow.loadFile('./src/components/overlay/index.html')
    } else {
        overlayWindow.loadFile(path.join(process.resourcesPath, 'app.asar', '.vite', 'renderer', 'overlay', 'index.html'))
    }

    overlayWindow.setAlwaysOnTop(true, "normal")
    
    console.log(`[Launch] Overlay window created: ${(performance.now() - LAUNCH_START_TIME).toFixed(2)}ms`)

    // Ensure overlay window is NOT zoomed
    overlayWindow.webContents.on('did-finish-load', () => {
        if (isUsable(overlayWindow)) {
            overlayWindow.webContents.setZoomLevel(0)
        }
    })

    // Handle keyboard input for shortcuts when overlay window is focused
    overlayWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return

        const eventForMatching = {
            key: input.key || '',
            shiftKey: input.shift || false,
            ctrlKey: input.control || false,
            altKey: input.alt || false,
            metaKey: input.meta || false
        }

        // Prevent Electron's default zoom from affecting overlay UI
        if ((eventForMatching.ctrlKey || eventForMatching.metaKey) && 
            (eventForMatching.key === '=' || eventForMatching.key === '+' || 
             eventForMatching.key === '-' || eventForMatching.key === '_' || eventForMatching.key === '0')) {
            event.preventDefault()
            // Don't return - let our handlers process it
        }

        // Handle special shortcuts: Shift+Enter and Shift+Esc
        if (eventForMatching.key === 'Enter' && eventForMatching.shiftKey && !eventForMatching.ctrlKey && !eventForMatching.altKey && !eventForMatching.metaKey) {
            if (isCustomCursorMode) {
                event.preventDefault()
                toggleCustomCursor()
                return
            }
        }
        
        if (eventForMatching.key === 'Escape' && eventForMatching.shiftKey && !eventForMatching.ctrlKey && !eventForMatching.altKey && !eventForMatching.metaKey) {
            event.preventDefault()
            toggleCustomCursor()
            return
        }

        const shortcuts = {
            history: getSetting('history', [['y'], []]),
            find: getSetting('find', [['f'], []]),
            closeTab: getSetting('closeTab', [['w'], []]),
            reloadTab: getSetting('reloadTab', [['r'], []]),
            newTab: getSetting('newTab', [['t'], []]),
            zoominTab: getSetting('zoominTab', [['+'], ["="]]),
            zoomoutTab: getSetting('zoomoutTab', [['-'], ["_"]]),
            zoomresetTab: getSetting('zoomresetTab', [['0'], []])
        }

        // Debug zoom shortcuts and loaded settings
        if ((eventForMatching.ctrlKey || eventForMatching.metaKey) && 
            (eventForMatching.key === '=' || eventForMatching.key === '+' || 
             eventForMatching.key === '-' || eventForMatching.key === '_' || eventForMatching.key === '0')) {
            console.log('[DEBUG ZOOM] Key pressed:', eventForMatching.key, 'shift:', eventForMatching.shiftKey, 'meta:', eventForMatching.metaKey, 'ctrl:', eventForMatching.ctrlKey)
            console.log('[DEBUG ZOOM] Loaded shortcuts config:', JSON.stringify(shortcuts))
            console.log('[DEBUG ZOOM] zoominTab from DB:', JSON.stringify(getSetting('zoominTab')))
            console.log('[DEBUG ZOOM] zoomoutTab from DB:', JSON.stringify(getSetting('zoomoutTab')))
        }

        for (const [action, shortcutConfig] of Object.entries(shortcuts)) {
            if (matchesShortcut(eventForMatching, shortcutConfig as any)) {
                event.preventDefault()
                handleShortcutAction(action)
                console.log('[DEBUG ZOOM] Matched action:', action)
                return
            }
        }
    })

    mainWindow.on("closed", () => {
        if (isUsable(overlayWindow)) overlayWindow.close()
        stopKeytapProcess()
    })

    // Keytap now started after main window loads (deferred)

    // Handle keyboard input for shortcuts even when custom cursor is off
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return
        
        // Convert input event to shortcut-matching format
        const eventForMatching = {
            key: input.key || '',
            shiftKey: input.shift || false,
            ctrlKey: input.control || false,
            altKey: input.alt || false,
            metaKey: input.meta || false
        }
        
        // Prevent Electron's default zoom from affecting mainWindow UI
        if ((eventForMatching.ctrlKey || eventForMatching.metaKey) && 
            (eventForMatching.key === '=' || eventForMatching.key === '+' || 
             eventForMatching.key === '-' || eventForMatching.key === '_' || eventForMatching.key === '0')) {
            event.preventDefault()
            // Don't return - let our handlers process it
        }
        
        // Handle special shortcuts: Shift+Enter and Shift+Esc
        if (eventForMatching.key === 'Enter' && eventForMatching.shiftKey && !eventForMatching.ctrlKey && !eventForMatching.altKey && !eventForMatching.metaKey) {
            if (isCustomCursorMode) {
                event.preventDefault()
                toggleCustomCursor()
                return
            }
        }
        
        if (eventForMatching.key === 'Escape' && eventForMatching.shiftKey && !eventForMatching.ctrlKey && !eventForMatching.altKey && !eventForMatching.metaKey) {
            event.preventDefault()
            toggleCustomCursor()
            return
        }

        const shortcuts = {
            history: getSetting('history', [['y'], []]),
            find: getSetting('find', [['f'], []]),
            closeTab: getSetting('closeTab', [['w'], []]),
            reloadTab: getSetting('reloadTab', [['r'], []]),
            newTab: getSetting('newTab', [['t'], []]),
            zoominTab: getSetting('zoominTab', [['+'], ['=']]),
            zoomoutTab: getSetting('zoomoutTab', [['-'], []]),
            zoomresetTab: getSetting('zoomresetTab', [['0'], []])
        }

        // Debug zoom shortcuts and loaded settings
        if ((eventForMatching.ctrlKey || eventForMatching.metaKey) && 
            (eventForMatching.key === '=' || eventForMatching.key === '+' || 
             eventForMatching.key === '-' || eventForMatching.key === '_' || eventForMatching.key === '0')) {
            console.log('[DEBUG ZOOM OVERLAY] Key pressed:', eventForMatching.key, 'shift:', eventForMatching.shiftKey, 'meta:', eventForMatching.metaKey, 'ctrl:', eventForMatching.ctrlKey)
            console.log('[DEBUG ZOOM OVERLAY] Loaded shortcuts config:', JSON.stringify(shortcuts))
            console.log('[DEBUG ZOOM OVERLAY] zoominTab from DB:', JSON.stringify(getSetting('zoominTab')))
            console.log('[DEBUG ZOOM OVERLAY] zoomoutTab from DB:', JSON.stringify(getSetting('zoomoutTab')))
        }

        for (const [action, shortcutConfig] of Object.entries(shortcuts)) {
            if (matchesShortcut(eventForMatching, shortcutConfig as any)) {
                event.preventDefault()
                handleShortcutAction(action)
                console.log('[DEBUG ZOOM MAIN] Matched action:', action)
                return
            }
        }
    })

    mainWindow.on("restore", () => {
        if (isUsable(overlayWindow)) overlayWindow.show()
    })
}

function registerRadiantProtocol() {
    const isDev = process.env.NODE_ENV === 'development'

    const resolveRadiantTarget = (url: URL) => {
        const host = url.host
        const pathName = url.pathname || '/'

        if ((host === 'newtab' || host === 'settings' || host === 'history') && (pathName === '/' || pathName === '')) {
            if (host === 'settings') return '/radiant-settings.html'
            if (host === 'history') return '/radiant-history.html'
            return '/radiant-newtab.html'
        }

        if (host === 'newtab' || host === 'settings' || host === 'history') {
            return pathName
        }

        return `/${host}${pathName}`
    }

    if (isDev) {
        protocol.handle('radiant', async (request) => {
            const url = new URL(request.url)
            const targetPath = resolveRadiantTarget(url)
            const resolvedUrl = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}${targetPath}${url.search}`
            console.log('[main.ts registerRadiantProtocol] request URL:', request.url)
            console.log('[main.ts registerRadiantProtocol] resolved to:', resolvedUrl)
            return net.fetch(resolvedUrl)
        })
        return
    }

    protocol.handle('radiant', async (request) => {
        const url = new URL(request.url)
        const targetPath = resolveRadiantTarget(url)
        const target = targetPath.replace(/^\/+/, '')
        const filePath = path.join(
            process.resourcesPath,
            'app.asar',
            '.vite',
            'renderer',
            'main_window',
            target
        )
        console.log('[main.ts registerRadiantProtocol] request URL:', request.url)
        console.log('[main.ts registerRadiantProtocol] resolved filePath:', filePath)
        console.log('[main.ts registerRadiantProtocol] file exists?', fs.existsSync(filePath))

        return net.fetch('file://' + filePath)
    })
}

app.whenReady().then(() => {
    const readyTime = performance.now()
    console.log(`[Launch] App ready: ${(readyTime - LAUNCH_START_TIME).toFixed(2)}ms`)
    
    registerSettingsIPC()
    registerRadiantProtocol()
    createWindow()
})

// IPC Handlers

// Add this near the top with other state variables
let activeTextInput: {
    x: number
    y: number
    width: number
    height: number
    value: string
    isActive: boolean
    style: any
} | null = null

// Add these IPC handlers with your other handlers

ipcMain.on('textinput:activate', (_, data: { x: number; y: number; width: number; height: number; value: string; style: any }) => {
    if (!isUsable(overlayWindow)) return
    
    activeTextInput = {
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        value: data.value,
        isActive: true,
        style: data.style,
    }
    
    console.log('Activating text input overlay:', activeTextInput)
    overlayWindow.webContents.send('textinput:show', activeTextInput)
})

ipcMain.on('textinput:deactivate', () => {
    if (!isUsable(overlayWindow)) return
    
    activeTextInput = null
    overlayWindow.webContents.send('textinput:hide')

    finalizeActiveTextInput().catch(() => {})
})

async function finalizeActiveTextInput() {
    const tab = (tabs as any).getActiveTab();
    const wc = isRendererVisible ? tab?.view?.webContents : mainWindow?.webContents;
    if (!wc) return;

    await wc.executeJavaScript(`
        (function() {
            const el = document.querySelector('[data-radiant-text-input="true"]');
            if (!el) return;
            
            console.log('finalizeActiveTextInput: restoring opacity and cleaning up');

            // Restore original opacity
            const originalOpacity = el.getAttribute('data-radiant-original-opacity');
            if (originalOpacity !== null) {
                el.style.opacity = originalOpacity;
                el.removeAttribute('data-radiant-original-opacity');
            }

            if (typeof el.blur === 'function') {
                el.blur();
            }
            el.removeAttribute('data-radiant-text-input');
        })();
    `);
}

ipcMain.on('textinput:commit-value', async (_, value: string) => {
    console.log('textinput:commit-value received:', value);
    // Immediately update the underlying input
    const tab = (tabs as any).getActiveTab();
    const wc = isRendererVisible ? tab?.view?.webContents : mainWindow?.webContents;
    if (!wc) return;
    
    await wc.executeJavaScript(`
        (function() {
            const el = document.querySelector('[data-radiant-text-input="true"]');
            if (!el) {
                console.log('No element with data-radiant-text-input found');
                return;
            }
            console.log('Found element with data-radiant-text-input, current value:', el.value);
            
            const tagName = el.tagName ? el.tagName.toUpperCase() : '';
            const isEditable = tagName === 'INPUT' || tagName === 'TEXTAREA' || el.isContentEditable;
            if (!isEditable) return;

            const setValue = (element, val) => {
                const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
                const prototype = Object.getPrototypeOf(element);
                const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

                if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                    prototypeValueSetter.call(element, val);
                } else if (valueSetter) {
                    valueSetter.call(element, val);
                } else {
                    element.value = val;
                }
            };

            console.log('Setting value to:', ${JSON.stringify(value)});
            setValue(el, ${JSON.stringify(value)});
            
            console.log('Dispatching input and change events');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Events dispatched, new value:', el.value);
        })();
    `).catch((err:any) => console.error('Error in commit-value:', err));
});

ipcMain.on('textinput:submit-form', () => {
    console.log('Submitting form')
    
    if (!activeTextInput) {
        console.log('No active text input to submit')
        return
    }
    
    // Submit the form by pressing Enter on the underlying input
    if (isRendererVisible) {
        const tab = (tabs as any).getActiveTab()
        if (tab?.view?.webContents) {
            const wc = tab.view.webContents
            
            // Send Enter keypress to the focused element
            wc.executeJavaScript(`
                (function() {
                    const el = document.activeElement
                    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                        console.log('Submitting form for element:', el)
                        
                        // Try to find and submit the parent form
                        const form = el.closest('form')
                        if (form) {
                            console.log('Found form, submitting')
                            form.submit()
                            return true
                        }
                        
                        // If no form, trigger Enter key event
                        console.log('No form found, triggering Enter key')
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true
                        })
                        el.dispatchEvent(enterEvent)
                        
                        const enterUpEvent = new KeyboardEvent('keyup', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true
                        })
                        el.dispatchEvent(enterUpEvent)
                        
                        return true
                    }
                    return false
                })()
            `).then((success:any) => {
                if (success) {
                    console.log('Successfully submitted form')
                } else {
                    console.log('Failed to submit - no active input element')
                }
            }).catch((err:any) => {
                console.error('Error submitting form:', err)
            })
        }
    } else {
        // For React UI inputs
        mainWindow?.webContents.executeJavaScript(`
            (function() {
                const el = document.activeElement
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    const form = el.closest('form')
                    if (form) {
                        form.submit()
                        return true
                    }
                    
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    })
                    el.dispatchEvent(enterEvent)
                    return true
                }
                return false
            })()
        `).catch(() => {})
    }

    finalizeActiveTextInput().catch(() => {})
})

ipcMain.handle('textinput:get-active', () => {
    return activeTextInput
})

ipcMain.on("cursor:set-initial", (_, pos) => {
    virtualCursorPos = { x: pos.x, y: pos.y }
    if (isUsable(overlayWindow)) overlayWindow.webContents.send("crosshair:move", virtualCursorPos)
})

ipcMain.handle("window:minimize", () => {
    if (isUsable(mainWindow)) {
        disableCustomCursor()
        mainWindow.minimize()
    }
})

ipcMain.handle("window:maximize", () => {
    if (!isUsable(mainWindow)) return
    
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
        if (isUsable(overlayWindow)) {
            overlayWindow.unmaximize()
            overlayWindow.moveTop()
            overlayWindow.focus()
        }
    } else {
        mainWindow.maximize()
        if (isUsable(overlayWindow)) {
            overlayWindow.maximize()
            overlayWindow.moveTop()
            overlayWindow.focus()
        }
    }
})

ipcMain.handle("window:close", () => {
    if (isUsable(mainWindow)) mainWindow.close()
})

ipcMain.on("navigate-to", (_, url: string) => {
    if (!isUsable(mainWindow)) return
    ;(tabs as any).navigate(url)
    // Hide suggestions
    if (isUsable(overlayWindow)) {
        overlayWindow.webContents.send('suggestions:hide')
    }
    if (isUsable(mainWindow)) mainWindow.focus()
})

// Optimized mouse move handler
ipcMain.on('mouse:move', (event, delta: { movementX: number; movementY: number }) => {
    if (!isCustomCursorMode || !isUsable(mainWindow) || !isUsable(overlayWindow)) return

    const bounds = mainWindow.getBounds()

    const movementX = invertMouse ? -delta.movementX : delta.movementX
    const movementY = invertMouse ? -delta.movementY : delta.movementY
    const newX = virtualCursorPos.x + movementX * sensitivity
    const newY = virtualCursorPos.y + movementY * sensitivity
    
    virtualCursorPos.x = Math.max(0, Math.min(bounds.width, newX))
    virtualCursorPos.y = Math.max(0, Math.min(bounds.height, newY))
    
    // Batch crosshair updates
    if (!pendingCrosshairUpdate) {
        pendingCrosshairUpdate = true
        setImmediate(() => {
            if (isUsable(overlayWindow) && isUsable(mainWindow)) {
                overlayWindow.webContents.send('crosshair:move', virtualCursorPos)
                mainWindow.webContents.send('crosshair:move', virtualCursorPos)
            }
            pendingCrosshairUpdate = false
        })
    }
    
    // Continuous webview tracking
    if (isRendererVisible) {
        const now = Date.now()
        if (now - lastWebviewMouseUpdate >= WEBVIEW_MOUSE_THROTTLE) {
            lastWebviewMouseUpdate = now
            
            const tab = (tabs as any).getActiveTab()
            if (tab?.view?.webContents) {
                const webviewY = virtualCursorPos.y - UI_OFFSET
                
                if (webviewY >= 0) {
                    tab.view.webContents.sendInputEvent({
                        type: 'mouseMove',
                        x: virtualCursorPos.x,
                        y: webviewY
                    })
                }
            }
        }
    } else {
        const now = Date.now()
        if (now - lastAppMouseUpdate >= WEBVIEW_MOUSE_THROTTLE) {
            lastAppMouseUpdate = now
            mainWindow.webContents.sendInputEvent({
                type: 'mouseMove',
                x: virtualCursorPos.x,
                y: virtualCursorPos.y
            })
        }
    }
})

ipcMain.handle('get-window-bounds', () => {
    if (!isUsable(mainWindow)) return { x: 0, y: 0 }
    const bounds = mainWindow.getBounds()
    return { x: bounds.x, y: bounds.y }
})

ipcMain.on('update-suggestions', (_, suggestions) => {
    if (!isUsable(overlayWindow)) return
    try {
        overlayWindow.webContents.send('suggestions', suggestions)
    } catch (e) {
        console.error('Error in update-suggestions:', e)
    }
})

ipcMain.handle('omnibox:query', (_, text) => {
    try {
        return getOmniboxSuggestions(text, [], [])
    } catch (e) {
        console.error('Error in omnibox:query:', e)
        return []
    }
})

ipcMain.on('settings:updated', (_event, key: string, value: any) => {
    if (key === 'sensitivity') {
        sensitivity = normalizeSensitivity(value)
    }
    if (key === 'invertMouse') {
        invertMouse = Boolean(value)
    }
})

// Tab handlers
ipcMain.handle('tabs:create', (_e, url: string) => (tabs as any).create(url))
ipcMain.handle('tabs:activate', (_e, id: string) => (tabs as any).activate(id))
ipcMain.handle('tabs:close', (_e, id: string) => (tabs as any).close(id))
ipcMain.handle('tabs:get', () => (tabs as any).getTabInfo())
ipcMain.on("tabs:canGoBack", (event) => {
    event.returnValue = (tabs as any).canGoBack()
})
ipcMain.on("tabs:canGoForward", (event) => {
    event.returnValue = (tabs as any).canGoForward()
})
ipcMain.on("tabs:goBack", () => (tabs as any).goBack())
ipcMain.on("tabs:goForward", () => (tabs as any).goForward())
ipcMain.on("tabs:navigate", (_, url: string) => (tabs as any).navigate(url))
ipcMain.on("tabs:setUIOffset", (_, px: number) => (tabs as any).setUIOffset(px))
ipcMain.on('tabs:reload', () => {
    console.log('[tabs:reload] reload requested')
    ;(tabs as any).reloadActive()
})

ipcMain.handle('history:get', () => (tabs as any).getHistory())
ipcMain.handle('history:goToEntry', (_, url: string) => (tabs as any).goToHistoryEntry(url))
ipcMain.handle('history:deleteEntry', (_, dbId: number) => {
    deleteHistoryEntry(dbId);
    return (tabs as any).getHistory();
})
ipcMain.handle('history:clearByPeriod', (_, timePeriod: 'day' | 'week' | 'month' | 'year' | 'all') => {
    clearHistoryByTimePeriod(timePeriod);
    return (tabs as any).getHistory();
})

ipcMain.on("renderer:setVisible", (_, visible: boolean) => {
    if (!isUsable(mainWindow)) return
    try {
        const tab = (tabs as any).getActiveTab()
        if (!tab) return
        
        if (visible) {
            (tabs as any).setUIOffset(UI_OFFSET)
        } else {
            const bounds = mainWindow.getBounds()
            ;(tabs as any).setUIOffset(bounds.height)
        }
    } catch (e) {
        console.error('Error in renderer:setVisible:', e)
    }
})

ipcMain.on("renderer:visibility-state", (_, visible: boolean) => {
    isRendererVisible = visible
})

ipcMain.on('customcursor:toggle', toggleCustomCursor)
ipcMain.on('customcursor:click', () => handleClick(false))

let isDragging = false

ipcMain.on('customcursor:mousedown', () => {
    if (!isUsable(mainWindow)) return
    isDragging = true
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        const webviewY = virtualCursorPos.y - UI_OFFSET
        
        wc.sendInputEvent({ type: 'mouseDown', x: virtualCursorPos.x, y: webviewY, button: 'left', clickCount: 1 })
    } else {
        mainWindow.webContents.sendInputEvent({ type: 'mouseDown', x: virtualCursorPos.x, y: virtualCursorPos.y, button: 'left', clickCount: 1 })
    }
})

ipcMain.on('customcursor:mouseup', () => {
    if (!isUsable(mainWindow)) return
    isDragging = false
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        const webviewY = virtualCursorPos.y - UI_OFFSET
        
        wc.sendInputEvent({ type: 'mouseUp', x: virtualCursorPos.x, y: webviewY, button: 'left', clickCount: 1 })
    } else {
        mainWindow.webContents.sendInputEvent({ type: 'mouseUp', x: virtualCursorPos.x, y: virtualCursorPos.y, button: 'left', clickCount: 1 })
    }

    // Run the click-focus logic after mouseup so inputs can receive focus.
    handleClick(false)
})

// Helper function to check if key combination matches a shortcut
function matchesShortcut(event: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }, shortcutConfig: any): boolean {
    if (!Array.isArray(shortcutConfig)) return false

    const bindings: string[][] = shortcutConfig.every(Array.isArray)
        ? shortcutConfig as string[][]
        : [shortcutConfig as string[]]

    return bindings.some((binding) => matchesShortcutBinding(event, binding))
}

function matchesShortcutBinding(event: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }, binding: string[]): boolean {
    if (!Array.isArray(binding) || binding.length === 0) return false

    const modifierTokens = new Set(['shift', 'ctrl', 'control', 'alt', 'meta', 'command', 'cmd'])
    const normalized = binding.map((key) => String(key).toLowerCase())

    const keys = normalized.filter((key) => !modifierTokens.has(key))
    if (keys.length === 0) return false

    // Normalize the pressed key
    const pressedKey = event.key.toLowerCase()

    if (!keys.includes(pressedKey)) return false

    // Characters that require shift to type
    const shiftRequiredChars = new Set([
        '+', '_', '{', '}', '|', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 
        ':', '<', '>', '?', '"'
    ])
    
    // Map of unshifted keys to their shifted counterparts
    const shiftPairs: Record<string, string> = {
        '=': '+', '-': '_', '[': '{', ']': '}', '\\': '|', '`': '~',
        '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
        ';': ':', ',': '<', '.': '>', '/': '?', "'": '"'
    }
    
    // Check if this key or its shifted counterpart requires shift
    const isShiftRequiredChar = shiftRequiredChars.has(event.key) || 
        (event.shiftKey && shiftPairs[event.key] && shiftRequiredChars.has(shiftPairs[event.key]))

    // Check modifiers
    const hasShift = normalized.includes('shift')
    const hasCtrl = normalized.includes('ctrl') || normalized.includes('control')
    const hasAlt = normalized.includes('alt')
    const hasMeta = normalized.includes('meta') || normalized.includes('command') || normalized.includes('cmd')

    // If no primary modifier is specified, require Cmd on macOS and Ctrl elsewhere.
    const requiresMeta = hasMeta || (process.platform === 'darwin' && !hasCtrl && !hasMeta)
    const requiresCtrl = hasCtrl || (process.platform !== 'darwin' && !hasCtrl && !hasMeta)

    // For characters that require shift to type, ignore shift in the comparison
    const shiftMatches = isShiftRequiredChar ? true : (event.shiftKey === hasShift)

    return shiftMatches &&
        event.ctrlKey === requiresCtrl &&
        event.altKey === hasAlt &&
        event.metaKey === requiresMeta
}

// Helper function to handle shortcut actions
function handleShortcutAction(action: string) {
    const tab = (tabs as any).getActiveTab()
    
    switch(action) {
        case 'history':
            (tabs as any).navigate('radiant://history')
            break
        case 'find':
            // TODO: implement find functionality
            console.log('Find shortcut triggered')
            break
        case 'closeTab':
            if (tab) (tabs as any).close(tab.id)
            break
        case 'reloadTab':
            ;(tabs as any).reloadActive()
            break
        case 'newTab':
            (tabs as any).create('')
            break
        case 'zoominTab':
            console.log('[ZOOM HANDLER] Zoom in triggered, tab:', tab)
            if (tab?.view?.webContents) {
                const currentZoom = tab.view.webContents.getZoomLevel()
                const newZoom = currentZoom + 0.5
                console.log('[ZOOM HANDLER] Current zoom:', currentZoom, '→ New zoom:', newZoom)
                tab.view.webContents.setZoomLevel(newZoom)
                tab.zoom = newZoom
            }
            break
        case 'zoomoutTab':
            console.log('[ZOOM HANDLER] Zoom out triggered, tab:', tab)
            if (tab?.view?.webContents) {
                const currentZoom = tab.view.webContents.getZoomLevel()
                const newZoom = currentZoom - 0.5
                console.log('[ZOOM HANDLER] Current zoom:', currentZoom, '→ New zoom:', newZoom)
                tab.view.webContents.setZoomLevel(newZoom)
                tab.zoom = newZoom
            }
            break
        case 'zoomresetTab':
            console.log('[ZOOM HANDLER] Zoom reset triggered, tab:', tab)
            if (tab?.view?.webContents) {
                tab.view.webContents.setZoomLevel(0)
                tab.zoom = 0
                console.log('[ZOOM HANDLER] Reset zoom to 0')
            }
            break
    }
}

// Keyboard input handling
ipcMain.on('customcursor:keydown', (_, event: { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => {
    if (!isCustomCursorMode || !isUsable(mainWindow)) return

    // Block default zoom shortcuts from being passed to webview
    if ((event.ctrlKey || event.metaKey) && 
        (event.key === '=' || event.key === '+' || 
         event.key === '-' || event.key === '0')) {
        // Will be handled by shortcut matching below
    }

    // Check for shortcuts
    const shortcuts = {
        history: getSetting('history', [['y'], []]),
        find: getSetting('find', [['f'], []]),
        closeTab: getSetting('closeTab', [['w'], []]),
        reloadTab: getSetting('reloadTab', [['r'], []]),
        newTab: getSetting('newTab', [['t'], []]),
        zoominTab: getSetting('zoominTab', [['+'], []]),
        zoomoutTab: getSetting('zoomoutTab', [['-'], []]),
        zoomresetTab: getSetting('zoomresetTab', [['0'], []])
    }

    // Check if any shortcut matches
    for (const [action, shortcutConfig] of Object.entries(shortcuts)) {
        if (matchesShortcut(event, shortcutConfig as any)) {
            handleShortcutAction(action)
            return // Shortcut handled, don't pass through to webview
        }
    }
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    // Route to webview if renderer is visible and cursor is in webview area
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        wc.sendInputEvent({
            type: 'keyDown',
            keyCode: event.key,
            modifiers: [
                event.shiftKey ? 'shift' : '',
                event.ctrlKey ? 'control' : '',
                event.altKey ? 'alt' : '',
                event.metaKey ? 'meta' : ''
            ].filter(Boolean)
        })
    } else {
        // Route to main window UI
        mainWindow.webContents.sendInputEvent({
            type: 'keyDown',
            keyCode: event.key,
            modifiers: [
                event.shiftKey && 'shift',
                event.ctrlKey && 'control',
                event.altKey && 'alt',
                event.metaKey && 'meta'
            ].filter(Boolean) as InputEvent['modifiers']
        })
    }
})

ipcMain.on('customcursor:keyup', (_, event: { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => {
    if (!isCustomCursorMode || !isUsable(mainWindow)) return
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        wc.sendInputEvent({
            type: 'keyUp',
            keyCode: event.code,
            modifiers: [
                event.shiftKey ? 'shift' : '',
                event.ctrlKey ? 'control' : '',
                event.altKey ? 'alt' : '',
                event.metaKey ? 'meta' : ''
            ].filter(Boolean)
        })
    } else {
        mainWindow.webContents.sendInputEvent({
            type: 'keyUp',
            keyCode: event.code,
            modifiers: [
                event.shiftKey && 'shift',
                event.ctrlKey && 'control',
                event.altKey && 'alt',
                event.metaKey && 'meta'
            ].filter(Boolean) as InputEvent['modifiers']
        })
    }
})

ipcMain.on('customcursor:char', (_, event: { char: string }) => {
    if (!isCustomCursorMode || !isUsable(mainWindow)) return
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        wc.sendInputEvent({
            type: 'char',
            keyCode: event.char
        })
    } else {
        mainWindow.webContents.sendInputEvent({
            type: 'char',
            keyCode: event.char
        })
    }
})

// Mouse wheel/scroll handling
ipcMain.on('customcursor:wheel', (_, event: { deltaX: number; deltaY: number; canScroll: boolean }) => {
    if (!isCustomCursorMode || !isUsable(mainWindow)) return
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        const webviewY = virtualCursorPos.y - UI_OFFSET
        
        wc.sendInputEvent({
            type: 'mouseWheel',
            x: virtualCursorPos.x,
            y: webviewY,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            canScroll: event.canScroll
        })
    } else {
        mainWindow.webContents.sendInputEvent({
            type: 'mouseWheel',
            x: virtualCursorPos.x,
            y: virtualCursorPos.y,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            canScroll: event.canScroll
        })
    }
})

// Right click handling
ipcMain.on('customcursor:rightclick', () => {
    if (!isUsable(mainWindow)) return
    
    const cursorInWebviewArea = virtualCursorPos.y >= UI_OFFSET
    
    if (isRendererVisible && cursorInWebviewArea) {
        const tab = (tabs as any).getActiveTab()
        if (!tab?.view?.webContents) return
        
        const wc = tab.view.webContents
        const webviewY = virtualCursorPos.y - UI_OFFSET
        
        wc.sendInputEvent({ type: 'mouseDown', x: virtualCursorPos.x, y: webviewY, button: 'right', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: virtualCursorPos.x, y: webviewY, button: 'right', clickCount: 1 })
    } else {
        mainWindow.webContents.executeJavaScript(`
            (() => {
                const el = document.elementFromPoint(${virtualCursorPos.x}, ${virtualCursorPos.y})
                if (!el) return
                
                const contextMenuEvent = new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: ${virtualCursorPos.x},
                    clientY: ${virtualCursorPos.y},
                    button: 2
                })
                
                el.dispatchEvent(contextMenuEvent)
            })()
        `).catch(() => {})
    }
})

ipcMain.on("show-suggestions", (_event, suggestions) => {
    if (!isUsable(overlayWindow)) return
    
    try {
        overlayWindow.webContents.send('suggestions:show')
        overlayWindow.webContents.send('suggestions', suggestions)
    } catch (e) {
        console.error('Error in show-suggestions:', e)
    }
})

ipcMain.on("hide-suggestions", () => {
    if (isUsable(overlayWindow)) {
        try {
            overlayWindow.webContents.send('suggestions:hide')
        } catch (e) {
            console.error('Error in hide-suggestions:', e)
        }
    }
})

ipcMain.on('get-locale', (event) => {
    event.returnValue = currentLocale
})

ipcMain.handle("launch-valorant", async () => {
    if (process.platform !== "win32") {
        throw new Error("VALORANT is only available on Windows")
    }

    const riotPath = `"C:\\Riot Games\\Riot Client\\RiotClientServices.exe"`
    const command = `${riotPath} --launch-product=valorant --launch-patchline=live`

    exec(command, (error) => {
        if (error) {
            console.error("Failed to launch VALORANT:", error)
            throw error
        }
    })

    return true
})

ipcMain.handle('change-language', async (event, langCode) => {
    currentLocale = langCode
    ;(global as any).currentLocale = langCode
    store.set('locale', langCode)
    
    return langCode
})

ipcMain.on('restart-app', async () => {
    try {
        const tabSession = session.fromPartition('persist:tabs')
        
        // Only clear cache to ensure language changes take effect
        // Preserve cookies and other session data to maintain login state
        await tabSession.clearCache()
        
        console.log('Cache cleared, restarting...')
    } catch (e) {
        console.error('Error clearing cache:', e)
    }
    
    if (isUsable(overlayWindow)) overlayWindow.close()
    if (isUsable(mainWindow)) mainWindow.close()
    
    setTimeout(() => {
        app.relaunch({
            args: process.argv.slice(1),
        })
        app.quit()
    }, 500)
})

app.on('web-contents-created', (_event, contents) => {
    contents.on('did-attach-webview', (_event, webContents) => {
        webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return

            const eventForMatching = {
                key: input.key || '',
                shiftKey: input.shift || false,
                ctrlKey: input.control || false,
                altKey: input.alt || false,
                metaKey: input.meta || false
            }

            const shortcuts = {
                history: getSetting('history', [['y'], []]),
                find: getSetting('find', [['f'], []]),
                closeTab: getSetting('closeTab', [['w'], []]),
                reloadTab: getSetting('reloadTab', [['r'], []]),
                newTab: getSetting('newTab', [['t'], []]),
                zoominTab: getSetting('zoominTab', [['+'], []]),
                zoomoutTab: getSetting('zoomoutTab', [['-'], []]),
                zoomresetTab: getSetting('zoomresetTab', [['0'], ['ctrl']])
            }

            for (const [action, shortcutConfig] of Object.entries(shortcuts)) {
                if (matchesShortcut(eventForMatching, shortcutConfig as any)) {
                    event.preventDefault()
                    handleShortcutAction(action)
                    return
                }
            }
        })
        
        webContents.on('did-finish-load', () => {
            if (isUsable(mainWindow)) {
                setTimeout(() => {
                    if (isUsable(mainWindow)) {
                        mainWindow.focus()
                        mainWindow.webContents.focus()
                        mainWindow.webContents.send('navigation:complete')
                    }
                }, 10)
            }
        })
        
        webContents.on('did-start-navigation', () => {
            if (isUsable(mainWindow)) mainWindow.webContents.focus()
        })

        webContents.on('did-navigate', () => {
            if (isUsable(mainWindow)) mainWindow.webContents.focus()
        })

        webContents.on('did-frame-finish-load', () => {
            if (isUsable(mainWindow)) mainWindow.webContents.focus()
        })
    })
})

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('radiant', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('radiant')
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on("before-quit", () => {
    globalShortcut.unregisterAll()
    stopKeytapProcess()
    
    try {
        if (isUsable(overlayWindow)) overlayWindow.destroy()
    } catch (e) {
        console.error('Error destroying overlayWindow:', e)
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})