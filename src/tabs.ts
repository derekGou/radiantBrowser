import { BrowserWindow, WebContentsView } from 'electron'
import { v4 as uuid } from 'uuid'

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

export class Tabs {
    private win: BrowserWindow
    private tabs = new Map<string, Tab>()
    private activeTabId: string | null = null

    private UI_OFFSET = 96

    constructor(win: BrowserWindow) {
        this.win = win
        win.on('resize', () => this.resizeActive())
    }

    create(url = '') {
        const view = new WebContentsView({
            webPreferences: {
                sandbox: true,
                contextIsolation: true
            }
        })

        view.webContents.loadURL(url)

        const id = uuid()

        view.webContents.on("did-navigate", (_, url) => {
            const t = this.tabs.get(id);
            if (!t) return;
            t.url = url;
            this.sendUpdate();
        });

        view.webContents.on("did-navigate-in-page", (_, url) => {
            const t = this.tabs.get(id);
            if (!t) return;
            t.url = url;
            this.sendUpdate();
        });

        view.webContents.on('page-title-updated', () => {
            this.sendUpdate()
        })

        this.tabs.set(id, { id, url, view })

        this.activate(id)
        // notify renderer about new tabs
        this.sendUpdate()
        return id
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
            this.win.contentView.removeChildView(tab.view)
            this.activeTabId = null
        }

        // Destroy web contents
        try {
            (tab.view.webContents as any).destroy()
        } catch {}

        // Delete from map
        this.tabs.delete(id)

        if (this.tabs.size === 0) {
            this.win.close()   // or this.win.destroy()
            return
        }

        // Activate next tab if it exists, else send update
        if (nextTabId) this.activate(nextTabId)
        else this.sendUpdate()
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

    setUIOffset(px: number) {
        this.UI_OFFSET = px;
        this.resizeActive();
    }

    private resizeActive() {
        if (!this.activeTabId) return
        const tab = this.tabs.get(this.activeTabId)
        tab && this.resize(tab.view)
    }

    private toTabInfo(): TabInfo[] {
        return [...this.tabs.values()].map(tab => ({
            id: tab.id,
            title: tab.view.webContents.getTitle() || 'New Tab',
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
        console.log("triggered")
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
}