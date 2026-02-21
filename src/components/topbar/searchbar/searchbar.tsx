import { useEffect, useRef, useState } from "react";
import { IconContext } from "react-icons";
import { IoIosArrowBack, IoIosArrowForward, IoMdRefresh } from "react-icons/io";


export default function Searchbar(){
    const [canBack, setCanBack] = useState(false)
    const [canForward, setCanForward] = useState(false)

    useEffect(() => {
        const update = async () => {
            setCanBack(await window.tabs.canGoBack())
            setCanForward(await window.tabs.canGoForward())
        }

        update()

        const unsub = window.tabs.onUpdate(update)
        return unsub
    }, [])

    return (
        <>
            <div className="p-2 px-4 gap-6 cursor-default flex items-center h-[3.625rem] border-b-2 border-b-solid border-b-[#333]">
                <div className="flex gap-2 flex-row">
                    <div style = {{ background: canBack ? "white" : "#666" }} className="p-[0.1rem] clip-diamond">
                        <button
                            disabled={!canBack}
                            onClick={() => window.tabs.goBack()}
                            className="hover:border-white cursor-default clip-diamond p-1 bg-[#06070D] text-2xl flex items-center justify-center"
                            style={{ willChange: 'transform, color', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                        >
                            <IconContext.Provider value = {{ size: '1rem' }}>
                                <IoIosArrowBack style={{ color: canBack ? "white": "#666" }}/>
                            </IconContext.Provider>
                        </button>
                    </div>
                    <div style = {{ background: canForward ? "white" : "#666" }} className="p-[0.1rem] clip-diamond">
                        <button
                            disabled={!canForward}
                            onClick={() => window.tabs.goForward()}
                            className="hover:border-white cursor-default clip-diamond p-1 bg-[#06070D] text-2xl flex items-center justify-center"
                            style={{ willChange: 'transform, color', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                        >
                            <IconContext.Provider value = {{ size: '1rem' }}>
                                <IoIosArrowForward style={{ color: canForward ? "white": "#666" }}/>
                            </IconContext.Provider>
                        </button>
                    </div>
                </div>
                <div className="p-[0.1rem] bg-white clip-diamond">
                    <button
                        onClick={() => window.tabs.reload()}
                        className="hover:border-white cursor-default clip-diamond p-1 bg-[#06070D] text-2xl flex items-center justify-center"
                        style={{ willChange: 'transform, color', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                    >
                        <IconContext.Provider value = {{ size: '1rem' }}>
                            <IoMdRefresh className="text-white"/>
                        </IconContext.Provider>
                    </button>
                </div>
                <div className="relative grow flex"></div>
            </div>
        </>
    )
}