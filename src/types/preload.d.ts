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

    interface TextInputData {
        x: number
        y: number
        width: number
        height: number
        value: string
        isActive: boolean
        style: CSSStyleDeclaration
    }

    type OmniboxSuggestion = {
        id: string
        type: 'url' | 'search' | 'history' | 'bookmark'
        title: string
        subtitle?: string
        value: string   // what navigating uses
    }

    interface CustomCursorAPI {
        toggle: () => void;
        click: () => void;
        setInitialCursorPosition: (pos: { x: number; y: number }) => void;
        sendMouseMove: (delta: { movementX: number; movementY: number }) => void;
        onEnabled: (callback: (enabled: boolean) => void) => () => void;
        onNavigationComplete: (callback: () => void) => () => void;
    }

    interface CrosshairAPI {
        onMove: (callback: (pos: { x: number; y: number }) => void) => () => void;
        getWindowBounds: () => Promise<{ x: number; y: number }>;
        getSettings: () => Promise<import('../components/crosshair/crosshair').CrosshairSettings>;
        getPresets: () => Promise<Array<{ name: string; code: string }>>;
        setCurrentIndex: (index: number) => Promise<void>;
        addPreset: (name: string, code: string) => Promise<Array<{ name: string; code: string }>>;
        removePreset: (index: number) => Promise<Array<{ name: string; code: string }>>;
        updatePreset: (name: string, code: string) => Promise<Array<{ name: string; code: string }>>;
    }

    interface Window {
        tabs: TabsAPI;
        platform: {
            os: "darwin" | "win32" | "linux";
        };
        omnibox: {
            query: (text: string) => Promise<OmniboxSuggestion[]>;
        };
        electron: {
            ipc: {
                send: (channel: string, data?: any) => void
                on: (
                    channel: string,
                    listener: (...args: any[]) => void
                ) => () => void
                invoke: (channel: string, data?: any) => Promise<any>
                removeListener: (
                    channel: string,
                    listener: (...args: any[]) => void
                ) => void
            }
            changeLanguage: (langCode: string) => Promise<string>;
            getCurrentLocale: () => string;
        };
        setSuggestions?: (suggestions: any[]) => void;
        suggestionsAPI: {
            onSuggestions: (callback: (suggestions: any[]) => void) => void;
            navigateTo: (url: string) => void;
        };
        renderer: {
            setVisible: (visible: boolean) => void
        }
        riot: {
            launchValorant: () => Promise<boolean>
        },
        settings: {
            get<T>(key: string, defaultValue?: T): Promise<T>;
            set(key: string, value: any): Promise<void>;
            delete(key: string): Promise<void>;
            getAll(): Promise<Record<string, any>>;
        };
        tabHistory: {
            get: () => Promise<{ entries: { tabId: string; tabTitle: string; index: number; url: string; title?: string; timestamp: number; isActive: boolean; dbId?: number }[] }>
            goToEntry: (url: string) => Promise<void>
            deleteEntry: (dbId: number) => Promise<{ entries: { tabId: string; tabTitle: string; index: number; url: string; title?: string; timestamp: number; isActive: boolean; dbId?: number }[] }>
            clearByPeriod: (timePeriod: 'day' | 'week' | 'month' | 'year' | 'all') => Promise<{ entries: { tabId: string; tabTitle: string; index: number; url: string; title?: string; timestamp: number; isActive: boolean; dbId?: number }[] }>
        };
        customCursor: CustomCursorAPI;
        crosshair: CrosshairAPI;

        windowControls: {
            minimize: () => Promise<void>;
            maximize: () => Promise<void>;
            close: () => Promise<void>;
        };

        textInput: {
            onShow: (callback: (data: TextInputData) => void) => () => void
            onHide: (callback: () => void) => () => void
            commitValue: (value: string) => void
            submitForm: () => void
            deactivate: () => void
            getActive: () => Promise<TextInputData | null>
        };
    }
}

export {};