import { BrowserWindow, WebContentsView, session, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { v4 as uuid } from 'uuid'
import { addHistoryEntry, getHistoryEntries, updateHistoryEntryTitle } from './settingsDB'

type Tab = {
    id: string
    view: WebContentsView
    url: string
}

export type TabInfo = {
    id: string
    title: string
    url: string
    active: boolean
}

export type TabHistoryEntry = {
    tabId: string
    tabTitle: string
    index: number
    url: string
    title?: string
    timestamp: number
    isActive: boolean
    dbId?: number  // Database ID for persistent history entries
}

export class Tabs {
    private win: BrowserWindow
    private tabs = new Map<string, Tab>()
    private activeTabId: string | null = null
    private locale: string
    private ses: Electron.Session
    private headerListenerAttached = false
    private preloadPath?: string
    private isDev: boolean
    private devServerUrl: string
    private radiantProtocolRegistered = false
    private historyTimestamps = new Map<string, Map<number, number>>()
    private loadRetryCounts = new Map<string, number>()

    private UI_OFFSET = 96

    constructor(
        win: BrowserWindow,
        locale: string = 'en-US',
        preloadPath?: string,
        isDev: boolean = false,
        devServerUrl: string = ''
    ) {
        this.win = win
        this.locale = locale
        this.preloadPath = preloadPath
        this.isDev = isDev
        this.devServerUrl = devServerUrl
        
        // Use a single partition name regardless of locale
        // This way the partition gets cleared when the app restarts
        const partitionName = `persist:tabs`
        this.ses = session.fromPartition(partitionName)
        
        // Set up the Accept-Language header ONCE for all requests
        this.setupLanguageHeaders()
        
        // Set spellcheck language
        const langCode = this.locale.split('-')[0];
        this.ses.setSpellCheckerLanguages([langCode]);
        
        win.on('resize', () => this.resizeActive())

        this.registerRadiantProtocol()
    }

    private registerRadiantProtocol() {
        if (this.radiantProtocolRegistered) return

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

        if (this.isDev) {
            this.ses.protocol.handle('radiant', async (request) => {
                const url = new URL(request.url)
                const targetPath = resolveRadiantTarget(url)
                const resolvedUrl = `${this.devServerUrl}${targetPath}${url.search}`
                return net.fetch(resolvedUrl)
            })
        } else {
            this.ses.protocol.handle('radiant', async (request) => {
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
                console.log('[radiant protocol] url:', request.url)
                console.log('[radiant protocol] targetPath:', targetPath)
                console.log('[radiant protocol] resolved filePath:', filePath)
                console.log('[radiant protocol] file exists?', fs.existsSync(filePath))
                return net.fetch('file://' + filePath)
            })
        }

        this.radiantProtocolRegistered = true
    }

    private setupLanguageHeaders() {
        if (this.headerListenerAttached) return;
        
        this.ses.webRequest.onBeforeSendHeaders((details, callback) => {
            details.requestHeaders['Accept-Language'] = this.locale;
            callback({ requestHeaders: details.requestHeaders });
        });
        
        this.headerListenerAttached = true;
    }

    private resize(view: WebContentsView) {
        const { width, height } = this.win.getBounds()

        view.setBounds({
            x: 0,
            y: this.UI_OFFSET,
            width,
            height: height - this.UI_OFFSET
        })
    }

    private resizeActive() {
        if (!this.activeTabId) return
        const tab = this.tabs.get(this.activeTabId)
        tab && this.resize(tab.view)
    }

    create(url = 'radiant://newtab') {
        const view = new WebContentsView({
            webPreferences: {
                sandbox: true,
                contextIsolation: true,
                session: this.ses,  // Use the shared session
                ...(this.preloadPath ? { preload: this.preloadPath } : {})
            }
        })

        const id = uuid()
        this.loadRetryCounts.set(id, 0)

        // Load URL or default to blank
        if (url) {
            view.webContents.loadURL(url);
        } else {
            view.webContents.loadURL('radiant://newtab');
        }

        // Hide cursor in the renderer
        view.webContents.on('did-finish-load', () => {
            try {
                view.webContents.insertCSS(`
                    * {
                        cursor: none !important;
                    }
                    body, html {
                        cursor: none !important;
                    }
                `);
            } catch (e) {
                console.error('Error injecting cursor CSS:', e);
            }
        });

        view.webContents.on("did-navigate", (_, url) => {
            const t = this.tabs.get(id);
            if (!t) return;
            t.url = url;
            this.recordHistoryTimestamp(id)
            // Save to persistent history (skip radiant:// internal pages)
            if (!url.startsWith('radiant://')) {
                const title = view.webContents.getTitle();
                addHistoryEntry(url, title);
                console.log(`[History] Saved navigation to DB: ${url} (title: ${title || 'pending...'})`);  
            }
            this.sendUpdate();
        });

        view.webContents.on("did-navigate-in-page", (_, url) => {
            const t = this.tabs.get(id);
            if (!t) return;
            t.url = url;
            this.recordHistoryTimestamp(id)
            // For in-page navigation (hash/pushState), only update title, don't create new entry
            if (!url.startsWith('radiant://')) {
                const title = view.webContents.getTitle();
                updateHistoryEntryTitle(url, title);
                console.log(`[History] Updated title for in-page navigation: ${url} (title: ${title || 'pending...'})`);
            }
            this.sendUpdate();
        });

        view.webContents.on('page-title-updated', (_, title) => {
            // Update the title in the database for the current URL
            const currentUrl = view.webContents.getURL();
            if (currentUrl && !currentUrl.startsWith('radiant://')) {
                updateHistoryEntryTitle(currentUrl, title);
                console.log(`[History] Updated title in DB for ${currentUrl}: ${title}`);
            }
            this.sendUpdate()
        })
        
        view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            console.error(`[did-fail-load] url: ${validatedURL}, error: ${errorDescription}, code: ${errorCode}, isMainFrame: ${isMainFrame}`);

            if (!isMainFrame) {
                console.log('[did-fail-load] ignoring sub-frame load failure')
                return
            }
            if (!validatedURL) {
                console.log('[did-fail-load] no validatedURL')
                return
            }

            // Ignore intentional aborts (e.g., new navigation)
            if (errorCode === -3) {
                console.log('[did-fail-load] ignoring abort error')
                return
            }

            const attempts = this.loadRetryCounts.get(id) ?? 0
            console.log('[did-fail-load] retry attempt', attempts + 1)
            if (attempts >= 2) {
                console.log('[did-fail-load] max retries reached')
                return
            }

            this.loadRetryCounts.set(id, attempts + 1)
            setTimeout(() => {
                if (!view.webContents.isDestroyed()) {
                    console.log('[did-fail-load] retrying load of', validatedURL)
                    view.webContents.loadURL(validatedURL)
                }
            }, 250)
        })

        view.webContents.on('did-finish-load', () => {
            console.log('[did-finish-load] page loaded successfully')
            this.loadRetryCounts.set(id, 0)
        })

        this.tabs.set(id, { id, url: url || 'radiant://newtab', view })

        this.recordHistoryTimestamp(id)

        this.activate(id)
        // notify renderer about new tabs
        this.sendUpdate()

        return id
    }

    private recordHistoryTimestamp(tabId: string) {
        const tab = this.tabs.get(tabId)
        if (!tab) return

        const nav = (tab.view.webContents as any).navigationHistory
        if (!nav || typeof nav.getActiveIndex !== 'function') return

        const activeIndex = nav.getActiveIndex()
        if (activeIndex < 0) return

        let map = this.historyTimestamps.get(tabId)
        if (!map) {
            map = new Map<number, number>()
            this.historyTimestamps.set(tabId, map)
        }
        map.set(activeIndex, Date.now())
    }

    activate(id: string) {
        if (this.activeTabId === id) return

        if (this.activeTabId) {
            const old = this.tabs.get(this.activeTabId)
            old && this.win.contentView.removeChildView(old.view)
        }

        const tab = this.tabs.get(id)
        if (!tab) return

        this.win.contentView.addChildView(tab.view)
        this.resize(tab.view)

        this.activeTabId = id
        // notify renderer about active change
        this.sendUpdate()
    }

    close(id: string) {
        const tab = this.tabs.get(id)
        if (!tab) return

        const tabIds = [...this.tabs.keys()]
        const closedIndex = tabIds.indexOf(id)

        // Determine next tab to activate if the closed tab was active
        let nextTabId: string | undefined
        if (this.activeTabId === id) {
            if (closedIndex + 1 < tabIds.length) nextTabId = tabIds[closedIndex + 1] // right neighbor
            else if (closedIndex - 1 >= 0) nextTabId = tabIds[closedIndex - 1]      // left neighbor
        }

        // Remove from contentView if active
        if (this.activeTabId === id) {
            try {
                this.win.contentView.removeChildView(tab.view)
            } catch (e) {
                console.error('Error removing child view:', e);
            }
            this.activeTabId = null
        }

        // Close the webContents (this is the correct method)
        try {
            if (tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()) {
                tab.view.webContents.close();
            }
        } catch (e) {
            console.error('Error closing webContents:', e);
        }

        // Delete from map
        this.tabs.delete(id)
        this.loadRetryCounts.delete(id)

        if (this.tabs.size === 0 && !this.win.isDestroyed()) {
            this.win.close()
            return
        }

        // Activate next tab if it exists, else send update
        if (nextTabId) this.activate(nextTabId)
        else this.sendUpdate()
    }

    setUIOffset(px: number) {
        this.UI_OFFSET = px;
        this.resizeActive();
    }

    private toTabInfo(): TabInfo[] {
        return [...this.tabs.values()].map(tab => ({
            id: tab.id,
            title: tab.url == "radiant://settings" ? 'Settings' : tab.view.webContents.getTitle() || 'New Tab',
            url: tab.url,
            active: tab.id === this.activeTabId
        }))
    }

    private sendUpdate() {
        if (this.win.isDestroyed()) return
        if (this.win.webContents.isDestroyed()) return

        this.win.webContents.send('tabs:update', this.toTabInfo())
    }

    getTabInfo() {
        return this.toTabInfo()
    }

    navigate(url: string) {
        if (!this.activeTabId) return;

        const tab = this.tabs.get(this.activeTabId);
        if (!tab) return;

        // Normalize input like a real browser
        function resolveInput(input: string): string {
            const value = input.trim()

            // 1. Explicit scheme
            if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) {
                return value
            }

            // 2. localhost
            if (value === 'localhost' || value.startsWith('localhost:')) {
                return `http://${value}`
            }

            // 3. IP address
            if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(value)) {
                return `http://${value}`
            }

            // 4. Looks like a domain (no spaces, has dot)
            if (!value.includes(' ') && value.includes('.')) {
                return `https://${value}`
            }

            // 5. Fallback → Google search
            const query = encodeURIComponent(value)
            return `https://www.google.com/search?q=${query}`
        }

        const finalUrl = resolveInput(url);
        
        tab.view.webContents.loadURL(finalUrl);
        tab.url = finalUrl;
        this.sendUpdate();
    }

    reloadActive() {
        const tab = this.getActiveTab()
        if (!tab?.view?.webContents) return

        const currentUrl = tab.view.webContents.getURL()
        const storedUrl = tab.url
        const isRadiant =
            (storedUrl && storedUrl.startsWith('radiant://')) ||
            (currentUrl && currentUrl.startsWith('radiant://'))

        console.log('[reloadActive] storedUrl:', storedUrl)
        console.log('[reloadActive] currentUrl:', currentUrl)
        console.log('[reloadActive] isRadiant:', isRadiant)

        if (isRadiant) {
            const targetUrl = storedUrl && storedUrl.startsWith('radiant://')
                ? storedUrl
                : currentUrl
            console.log('[reloadActive] reloading radiant URL:', targetUrl)
            if (targetUrl) {
                tab.view.webContents.loadURL(targetUrl)
                return
            }
        }

        console.log('[reloadActive] reloading non-radiant URL via reloadIgnoringCache')
        tab.view.webContents.reloadIgnoringCache()
    }

    getActiveTab = (): Tab | null => {
        if (!this.activeTabId) return null
        return this.tabs.get(this.activeTabId) ?? null
    }
    
    canGoBack = (): boolean => {
        const tab = this.getActiveTab();
        if (!tab) return false;
        return tab ? tab.view.webContents.navigationHistory.canGoBack() : false;
    }

    canGoForward = (): boolean => {
        const tab = this.getActiveTab();
        if (!tab) return false;
        return tab ? tab.view.webContents.navigationHistory.canGoForward() : false;
    }

    goBack = () => {
        const tab = this.getActiveTab();
        if (tab?.view.webContents.navigationHistory.canGoBack()) {
            tab.view.webContents.navigationHistory.goBack()
        }
    }

    goForward = () => {
        const tab = this.getActiveTab();
        if (tab?.view.webContents.navigationHistory.canGoForward()) {
            tab.view.webContents.navigationHistory.goForward()
        }
    }

    getHistory = (): { entries: TabHistoryEntry[] } => {
        const entries: TabHistoryEntry[] = []

        // Get all entries from database
        const dbEntries = getHistoryEntries(500)
        
        dbEntries.forEach((entry) => {
            entries.push({
                tabId: 'persistent-history',
                tabTitle: 'History',
                index: -1,
                url: entry.url,
                title: entry.title || entry.url,
                timestamp: entry.timestamp,
                isActive: false,
                dbId: entry.id
            })
        })

        return { entries }
    }

    goToHistoryEntry = (url: string) => {
        // Navigate to the URL in the active tab, or create a new tab if none exists
        if (this.activeTabId) {
            const tab = this.tabs.get(this.activeTabId)
            if (tab) {
                tab.view.webContents.loadURL(url)
                return
            }
        }
        // No active tab, create a new one
        this.create(url)
    }
}