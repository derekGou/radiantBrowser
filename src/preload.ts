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
    canGoBack: () => ipcRenderer.invoke("tabs:canGoBack"),
    canGoForward: () => ipcRenderer.invoke("tabs:canGoForward"),
});

contextBridge.exposeInMainWorld("platform", {
    os: process.platform, // "darwin" | "win32" | "linux"
});

contextBridge.exposeInMainWorld('omnibox', {
    query: (text: string) => ipcRenderer.invoke('omnibox:query', text)
});