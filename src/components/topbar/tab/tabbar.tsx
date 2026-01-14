import { useEffect, useState } from "react";
import { TabInfo } from "../../../tabs";
import { IconContext } from "react-icons";
import { IoMdClose, IoMdAdd } from "react-icons/io";

export default function Tabbar(){
    const [padding, setPadding] = useState<{left: number, right: number}>({left: 12, right: 12});
    const os = window.platform.os;

    function getTitlebarInsets() {
        if (os === "darwin") {
            return {
                left: 84,
                right: 12,
            };
        }

        if (os === "win32") {
            return {
                left: 12,
                right: 150,
            };
        }

        return {
            left: 12,
            right: 12,
        };
    }

    useEffect(()=>{
        setPadding(getTitlebarInsets());
    }, [])

    const [tabs, setTabs] = useState<TabInfo[]>([]);

    useEffect(() => {
        // fetch initial tabs
        window.tabs?.get().then(setTabs).catch(() => {})

        // subscribe to updates from main process
        const unsubscribe = window.tabs?.onUpdate((newTabs: TabInfo[]) => {
            setTabs(newTabs)
        })

        return () => unsubscribe && unsubscribe()
    }, [])

    const fetchTabs = async () => {
        const t = await window.tabs.get()
        setTabs(t)
    }

    const activateTab = (id: string) => {
        window.tabs.activate(id)
    }

    const closeTab = (id: string) => {
        window.tabs.close(id)
    }

    const createTab = (url = '') => {
        window.tabs.create(url)
    }

    const [activeUrl, setActiveUrl] = useState<string>("");
    useEffect(() => {
        const activeTab = tabs.find(t => t.active);
        setActiveUrl(activeTab?.url ?? "");
    }, [tabs]);

    return (
        <div style={{
            paddingLeft: padding.left + "px",
            paddingRight: padding.right + "px",
        }} className="cursor-default topbar flex items-center h-[2.375rem] border-b-2 border-b-solid border-b-[#333] box-border">
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    onClick={() => activateTab(tab.id)}
                    className={`tab cursor-default max-w-56 hover:bg-[#fff3] justify-center whitespace-nowrap min-w-1 h-full px-3 py-1 flex flex-1 items-center`}
                >
                    <div className="w-full h-full flex items-center justify-start overflow-hidden">
                        <span className={`cursor-default transition-all text-center text-[0.9rem] w-full ${tab.active ? 'text-yellow-200' : 'text-[#BBB]'}`}>{tab.title}</span>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                        className="group hover:bg-[#06070D] cursor-default border border-solid border-white absolute rotate-45 translate-y-[1.25rem] bg-white text-2xl flex items-center justify-center"
                        style={{ willChange: 'transform, color', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                    >
                        <IconContext.Provider value = {{ size: '0.6rem', className: 'rotate-45' }}>
                            <IoMdClose className="tab text-[#06070D] group-hover:text-white"/>
                        </IconContext.Provider>
                    </button>
                </div>
            ))}
            <div className="px-2">
                <button 
                    onClick={() => createTab('')} className="group tab hover:bg-[#BBB] cursor-default border border-solid border-[#BBB] rotate-45 bg-[#06070D] text-2xl flex items-center justify-center"
                    style={{ willChange: 'transform, color', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                >
                    <IconContext.Provider value = {{ size: '0.75rem', className: 'rotate-45' }}>
                        <IoMdAdd className="tab text-[#FFF] group-hover:text-[#06070D]"/>
                    </IconContext.Provider>
                </button>
            </div>
        </div>
    )
}