import { useEffect, useRef, useState } from "react";
import Topbar from "./components/topbar/topbar";
import NewTab from "./components/newtab/newtab";
import Settings from "./components/settings/settings";

export default function App(){const escPressedRef = useRef(false);

    useEffect(() => {
        const handleKey = (e : KeyboardEvent) => {
            if (e.key === "Escape") escPressedRef.current = true;
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);


    const [showNewTab, setShowNewTab] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const useWebviewPages = true
    const [isCustomCursorEnabled, setIsCustomCursorEnabled] = useState(false)
    const [hasCursorState, setHasCursorState] = useState(false)
    const [showLaunchScreen, setShowLaunchScreen] = useState(true)
    const shouldShowLaunchScreen = showLaunchScreen || !isCustomCursorEnabled


    useEffect(() => {
        if (isCustomCursorEnabled) {
            // Hide the cursor with CSS
            document.body.style.cursor = 'none';
            
            return () => {
                document.body.style.cursor = '';
            };
        } else {
            document.body.style.cursor = '';
        }
    }, [isCustomCursorEnabled])

    useEffect(() => {
        const handleCustomCursor = (enabled: boolean) => {
            setHasCursorState(true)
            setIsCustomCursorEnabled(enabled)
            if (enabled) {
                setShowLaunchScreen(false)
            }
        }
        
        const cleanup = window.customCursor?.onEnabled(handleCustomCursor) ?? (() => {})

        return () => {
            cleanup()
        }
    }, [isCustomCursorEnabled])

    const updateTabState = () => {
        window.tabs?.get().then(tabs => {
            const active = tabs.find(t => t.active)
            const url = active?.url ?? ""
            console.log('[app.tsx updateTabState] active tab url:', url)
            setShowNewTab(url === "" || url === "radiant://newtab" || url === "about:blank")
            setShowSettings(url === "radiant://settings")
        })
    }


    useEffect(() => {
        updateTabState()

        const unsubscribe = window.tabs?.onUpdate(tabs => {
            const active = tabs.find(t => t.active)
            const url = active?.url ?? ""
            setShowNewTab(url === "" || url === "radiant://newtab" || url === "about:blank")
            setShowSettings(url === "radiant://settings")
        })

        const handleFocus = () => {
            console.log('Window focused, re-syncing tab state')
            updateTabState()
        }

        window.addEventListener('focus', handleFocus)

        return () => {
            unsubscribe && unsubscribe()
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    useEffect(() => {
        const rendererShouldBeVisible = !shouldShowLaunchScreen;
        
        if (rendererShouldBeVisible) {
            window.renderer?.setVisible(true)
        } else {
            window.renderer?.setVisible(false)
        }
        
        // NEW: Send visibility state to main process for click routing
        window.electron?.ipc.send('renderer:visibility-state', rendererShouldBeVisible);
        
    }, [showNewTab, showSettings, isCustomCursorEnabled, shouldShowLaunchScreen])

    const topbarRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const updateOffset = () => {
            if (shouldShowLaunchScreen) return
            const height = topbarRef.current?.offsetHeight ?? 0
            window.tabs.setUIOffset(height)
        }

        updateOffset()

        window.addEventListener("resize", updateOffset)
        return () => window.removeEventListener("resize", updateOffset)
    }, [shouldShowLaunchScreen])

    const handleToggleCursor = () => {
        setShowLaunchScreen(false)
        window.customCursor?.toggle()
    }
    const minimize = () => window.windowControls.minimize();
    const maximize = () => window.windowControls.maximize();
    const close = () => window.windowControls.close();

    return (
        <>
            <div className="flex flex-col w-full h-full bg-[#06070D]">
                <div ref={topbarRef}>
                    <Topbar />
                </div>
                {!useWebviewPages && showNewTab && (
                    <div className="flex-1 overflow-auto no-bar ">
                        <NewTab />
                    </div>
                )}
                {!useWebviewPages && showSettings && (
                    <div className="flex-1 overflow-auto no-bar ">
                        <Settings />
                    </div>
                )}
                {shouldShowLaunchScreen && 
                    <div onClick={handleToggleCursor} className="no-bar fixed inset-0 z-10 flex flex-col gap-2 items-center justify-center h-full w-full cursor-pointer bg-[#06070D]">
                        <img src="/assets/radiantbrowser.svg" className="h-32 mb-8"></img>
                        <h1 className="text-white text-2xl">Click here or press to enable Radiant Browser</h1>
                        <h1 className="text-white text-2xl">Click 'shift' + 'esc' to escape</h1>
                    </div>
                }
                <div className="fixed top-0 right-[12px] w-[96px] h-[38px] flex flex-row z-50">
                    <div className="flex items-center justify-center h-[38px] w-[32px]">
                        <div onClick={()=>{maximize()}} className="flex items-center justify-center h-[26px] w-[26px] box-border border border-solid border-[#fff6] bg-[#000]">
                            <div className="flex items-center justify-center h-[20px] w-[20px] bg-[#36375D]">
                                <div className="h-[20px] w-[20px] brightness-75 flex items-center justify-center overflow-hidden">
                                    <img className="max-w-none max-h-none h-[30px] w-[30px] brightness-100 invert" src="/assets/icons/maximize.svg"></img>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-center h-[38px] w-[32px]">
                        <div onClick={()=>{minimize()}} className="flex items-center justify-center h-[26px] w-[26px] box-border border border-solid border-[#fff6] bg-[#000]">
                            <div className="flex items-center justify-center h-[20px] w-[20px] bg-[#36375D]">
                                <div className="h-[20px] w-[20px] brightness-75 flex items-center justify-center overflow-hidden">
                                    <img className="max-w-none max-h-none h-[30px] w-[30px] brightness-100 invert" src="/assets/icons/minimize.svg"></img>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-center h-[38px] w-[32px]">
                        <div onClick={()=>{close()}} className="flex items-center justify-center h-[26px] w-[26px] box-border border border-solid border-[#fff6] bg-[#000]">
                            <div className="flex items-center justify-center h-[20px] w-[20px] bg-[#36375D]">
                                <div className="h-[20px] w-[20px] brightness-75 flex items-center justify-center overflow-hidden">
                                    <img className="max-w-none max-h-none h-[30px] w-[30px] brightness-100 invert" src="/assets/icons/close.svg"></img>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}