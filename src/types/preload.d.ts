declare global {
    interface TabsAPI {
        create: (url?: string) => Promise<string>;
        get: () => Promise<import('../tabs').TabInfo[]>;
        activate: (id: string) => Promise<void>;
        close: (id: string) => Promise<void>;
        navigate: (url: string) => Promise<void>;
        onUpdate: (callback: (tabs: import('../tabs').TabInfo[]) => void) => () => void;
        setUIOffset: (px: number) => void;
        reload: () => void;
        goBack: () => void;
        goForward: () => void;
        canGoBack: () => boolean;
        canGoForward: () => boolean;
    }

    type OmniboxSuggestion = {
        id: string
        type: 'url' | 'search' | 'history' | 'bookmark'
        title: string
        subtitle?: string
        value: string   // what navigating uses
    }

    interface Window {
        tabs: TabsAPI;
        platform: {
            os: "darwin" | "win32" | "linux";
        };
        omnibox: {
            query: (text: string) => Promise<OmniboxSuggestion[]>;
        };
    }
}

export {};