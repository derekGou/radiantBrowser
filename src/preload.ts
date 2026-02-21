import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

import type { TabInfo } from './tabs'

contextBridge.exposeInMainWorld('tabs', {
    reload: () => ipcRenderer.send('tabs:reload'),
    create: (url: string) => ipcRenderer.invoke('tabs:create', url),
    get: (): Promise<TabInfo[]> => ipcRenderer.invoke('tabs:get'),
    activate: (id: string) => ipcRenderer.invoke('tabs:activate', id),
    close: (id: string) => ipcRenderer.invoke('tabs:close', id),
    onUpdate: (callback: (tabs: TabInfo[]) => void) => {
        const listener = (_e: IpcRendererEvent, tabs: TabInfo[]) => callback(tabs)
        ipcRenderer.on('tabs:update', listener)
        return () => ipcRenderer.removeListener('tabs:update', listener)
    },
    navigate: (url: string) => ipcRenderer.send("tabs:navigate", url),
    setUIOffset: (px: number) => ipcRenderer.send("tabs:setUIOffset", px),
    goBack: () => ipcRenderer.send("tabs:goBack"),
    goForward: () => ipcRenderer.send("tabs:goForward"),
    canGoBack: () => ipcRenderer.sendSync("tabs:canGoBack"),
    canGoForward: () => ipcRenderer.sendSync("tabs:canGoForward"),
});

contextBridge.exposeInMainWorld("platform", {
    os: process.platform, // "darwin" | "win32" | "linux"
});

contextBridge.exposeInMainWorld('omnibox', {
    query: (text: string) => ipcRenderer.invoke('omnibox:query', text)
});

contextBridge.exposeInMainWorld("suggestionsAPI", {
    onSuggestions: (callback: (suggestions: any[]) => void) => {
        ipcRenderer.on("suggestions", (_event, suggestions) => {
            if (suggestions && Array.isArray(suggestions)) {
                callback(suggestions);
            }
        });
    },
    navigateTo: (url: string) => ipcRenderer.send("navigate-to", url),
});

contextBridge.exposeInMainWorld('electron', {
    changeLanguage: (langCode: string) => ipcRenderer.invoke('change-language', langCode),
    getCurrentLocale: () => ipcRenderer.sendSync('get-locale') || 'en-US',
    ipc: {
        send: (channel: string, data?: any) =>
            ipcRenderer.send(channel, data),
        on: (channel: string, listener: (...args: any[]) => void) => {
            const wrapped = (_: any, ...args: any[]) => listener(...args);
            ipcRenderer.on(channel, wrapped);
            return () => ipcRenderer.removeListener(channel, wrapped);
        },

        invoke: (channel: string, data?: any) =>
            ipcRenderer.invoke(channel, data),
        removeListener: ipcRenderer.removeListener.bind(ipcRenderer)
    }
});

contextBridge.exposeInMainWorld('renderer', {
    setVisible: (visible: boolean) => ipcRenderer.send('renderer:setVisible', visible),
});

contextBridge.exposeInMainWorld('riot', {
    launchValorant: () => ipcRenderer.invoke("launch-valorant"),
});

contextBridge.exposeInMainWorld("settings", {
    get: (key: string, defaultValue?: any) =>
        ipcRenderer.invoke("settings:get", key, defaultValue),

    set: (key: string, value: any) =>
        ipcRenderer.invoke("settings:set", key, value),

    delete: (key: string) =>
        ipcRenderer.invoke("settings:delete", key),

    getAll: () =>
        ipcRenderer.invoke("settings:getAll"),
});

contextBridge.exposeInMainWorld('tabHistory', {
    get: () => ipcRenderer.invoke('history:get'),
    goToEntry: (url: string) => ipcRenderer.invoke('history:goToEntry', url),
    deleteEntry: (dbId: number) => ipcRenderer.invoke('history:deleteEntry', dbId),
    clearByPeriod: (timePeriod: 'day' | 'week' | 'month' | 'year' | 'all') => ipcRenderer.invoke('history:clearByPeriod', timePeriod),
});

// Custom cursor / crosshair APIs
contextBridge.exposeInMainWorld('customCursor', {
    toggle: () => ipcRenderer.send('customcursor:toggle'),
    click: () => ipcRenderer.send('customcursor:click'),
    sendMouseMove: (delta: { movementX: number; movementY: number }) => 
        ipcRenderer.send('mouse:move', delta),
    onEnabled: (callback: (enabled: boolean) => void) => {
        const listener = (_event: IpcRendererEvent, enabled: boolean) => callback(enabled);
        ipcRenderer.on('customcursor:enabled', listener);
        return () => ipcRenderer.removeListener('customcursor:enabled', listener);
    },
    onNavigationComplete: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('navigation:complete', listener);
        return () => ipcRenderer.removeListener('navigation:complete', listener);
    },
});

contextBridge.exposeInMainWorld('crosshair', {
    onMove: (callback: (pos: { x: number; y: number }) => void) => {
        const listener = (_event: IpcRendererEvent, pos: { x: number; y: number }) => callback(pos);
        ipcRenderer.on('crosshair:move', listener);
        return () => ipcRenderer.removeListener('crosshair:move', listener);
    },
    getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
});

// Alias for input capture window - comprehensive input handling
contextBridge.exposeInMainWorld('electronAPI', {
    setInitialCursorPosition: (pos: { x: number; y: number }) => ipcRenderer.send("cursor:set-initial", pos),
    sendMouseMove: (delta: { movementX: number; movementY: number }) => 
        ipcRenderer.send('mouse:move', delta),
    customCursorClick: () => ipcRenderer.send('customcursor:click'),
    customCursorMouseDown: () => ipcRenderer.send('customcursor:mousedown'),
    customCursorMouseUp: () => ipcRenderer.send('customcursor:mouseup'),
    customCursorRightClick: () => ipcRenderer.send('customcursor:rightclick'),
    sendKeyDown: (event: { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) =>
        ipcRenderer.send('customcursor:keydown', event),
    sendKeyUp: (event: { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) =>
        ipcRenderer.send('customcursor:keyup', event),
    sendChar: (event: { char: string }) =>
        ipcRenderer.send('customcursor:char', event),
    sendWheel: (event: { deltaX: number; deltaY: number; canScroll: boolean }) =>
        ipcRenderer.send('customcursor:wheel', event),
    onCustomCursorEnabled: (callback: (enabled: boolean) => void) => {
        const listener = (_event: IpcRendererEvent, enabled: boolean) => callback(enabled);
        ipcRenderer.on('customcursor:enabled', listener);
        return () => ipcRenderer.removeListener('customcursor:enabled', listener);
    },
});

contextBridge.exposeInMainWorld("windowControls", {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
});

contextBridge.exposeInMainWorld('textInput', {
    onShow: (callback: (data: any) => void) => {
        const listener = (_event: any, data: any) => callback(data);
        ipcRenderer.on('textinput:show', listener);
        return () => ipcRenderer.removeListener('textinput:show', listener);
    },
    onHide: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('textinput:hide', listener);
        return () => ipcRenderer.removeListener('textinput:hide', listener);
    },
    commitValue: (value: string) => ipcRenderer.send('textinput:commit-value', value),
    submitForm: () => ipcRenderer.send('textinput:submit-form'),
    deactivate: () => ipcRenderer.send('textinput:deactivate'),
    getActive: () => ipcRenderer.invoke('textinput:get-active')
});

contextBridge.exposeInMainWorld('overlay', {
    setSettingsActive: (active: boolean) => ipcRenderer.send('overlay:set-settings-active', active),
});