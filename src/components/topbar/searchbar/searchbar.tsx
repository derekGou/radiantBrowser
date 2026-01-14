import { useEffect, useRef, useState } from "react";
import { IconContext } from "react-icons";
import { IoIosArrowBack, IoIosArrowForward, IoMdRefresh } from "react-icons/io";


export default function Searchbar(){
    const [isEditing, setIsEditing] = useState(false);

    const [activeUrl, setActiveUrl] = useState("");
    // `inputValue` is what is shown in the input box.
    // `queryValue` is what we send to the omnibox for suggestions.
    const [inputValue, setInputValue] = useState("");
    const [queryValue, setQueryValue] = useState("");
    // When true, skip the next automatic update of `queryValue`.
    const [suppressQuery, setSuppressQuery] = useState(false);

    useEffect(() => {
        window.tabs?.get().then(tabs => {
            const active = tabs.find(t => t.active);
            setActiveUrl(active?.url ?? "");
        });

        const unsubscribe = window.tabs?.onUpdate(tabs => {
            const active = tabs.find(t => t.active);
            setActiveUrl(active?.url ?? "");
        });

        return () => unsubscribe && unsubscribe();
    }, []);

    useEffect(()=>{
        if (!isEditing) {
            setInputValue(activeUrl);
            setQueryValue(activeUrl);
        }
    }, [activeUrl, isEditing])

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const url = inputValue.trim();
        if (!url) return;

        window.tabs.navigate(url);
    };

    const [suggestions, setSuggestions] = useState<OmniboxSuggestion[]>([])
    // -1 means no selection (don't auto-select first suggestion)
    const [selected, setSelected] = useState(-1)

    // Debounce updating `queryValue` from user edits.
    useEffect(() => {
        if (!isEditing) return;
        const id = setTimeout(() => {
            if (suppressQuery) {
                return;
            }
            setQueryValue(inputValue);
        }, 80);

        return () => clearTimeout(id);
    }, [inputValue, isEditing, suppressQuery]);

    // Fetch suggestions whenever `queryValue` changes.
    useEffect(() => {
        if (!queryValue) {
            setSuggestions([])
            setSelected(-1)
            return
        }

        let cancelled = false
        ;(async () => {
            const results = await window.omnibox.query(queryValue)
            if (cancelled) return
            setSuggestions(results)
            // Don't auto-select any result; leave `selected` as -1.
            setSelected(-1)
        })()

        return () => { cancelled = true }
    }, [queryValue])

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown'){
            if (suggestions.length === 0) return;
            if (selected >= suggestions.length - 1){
                setSelected(0);
            } else if (selected === -1) {
                setSelected(0);
            } else {
                setSelected(s => s + 1);
            }
            e.preventDefault();
        } else if (e.key === 'ArrowUp'){
            if (suggestions.length === 0) return;
            if (selected <= 0){
                setSelected(suggestions.length - 1);
            } else {
                setSelected(s => s - 1);
            }
            e.preventDefault();
        } else {
            setSuppressQuery(false);
        }
    }

    // When selection changes, update the displayed input but DO NOT update
    // `queryValue` so omnibox suggestions aren't re-run until the user edits.
    useEffect(() => {
        if (suggestions.length === 0) return;
        if (selected < 0 || selected >= suggestions.length) return;

        // Apply the suggestion to the displayed input but suppress the
        // next automatic query so suggestions don't immediately refresh.
        setInputValue(suggestions[selected].value);
        setSuppressQuery(true);
    }, [selected, suggestions]);

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
                            className="hover:bg-[#666] hover:border-white cursor-default clip-diamond p-1 bg-[#06070D] text-2xl flex items-center justify-center"
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
                            className="hover:bg-[#666] hover:border-white cursor-default clip-diamond p-1 bg-[#06070D] text-2xl flex items-center justify-center"
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
                        className="hover:bg-[#666] hover:border-white cursor-default clip-diamond p-1 bg-[#06070D] text-2xl flex items-center justify-center"
                        style={{ willChange: 'transform, color', WebkitBackfaceVisibility: 'hidden', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
                    >
                        <IconContext.Provider value = {{ size: '1rem' }}>
                            <IoMdRefresh className="text-white"/>
                        </IconContext.Provider>
                    </button>
                </div>
                <div className="relative grow flex">
                    <div className="py-[0.1rem] px-[0.14rem] bg-[#666] focus-within:bg-[#ff4654] clip-bar-1 flex grow">
                        <div className="h-[1.5rem] bg-[#06070D] clip-bar-2 flex grow px-4 focus-within:bg-[#333]">
                            <form onSubmit = {(e) => handleSubmit(e)} className="h-full w-full flex grow focus-within:bg-[#333]">
                                <input
                                    placeholder="Search Google or type a URL"
                                    onKeyDown={(e) => {onKeyDown(e)}}
                                    value={inputValue}
                                    onFocus={() => setIsEditing(true)}
                                    onBlur={() => setIsEditing(false)}
                                    onChange={(e) => {
                                        setInputValue(e.target.value);
                                        setIsEditing(true);
                                    }}
                                    className="focus:bg-[#333] grow text-white bg-[#06070D] border-0 outline-none focus:outline-none focus:ring-0 focus:border-0 shadow-none"
                                />
                            </form>
                        </div>
                    </div>
                    {suggestions.length > 0 && (
                        <div className="absolute top-full flex flex-row w-full text-white">
                            <div className="grow bg-[#111] mx-3 border border-[#333]">
                                {suggestions.map((s, i) => (
                                    <div
                                    key={s.id}
                                    className={`px-3 py-2 ${
                                        i === selected ? 'bg-[#333]' : ''
                                    }`}
                                    onMouseDown={() => window.tabs.navigate(s.value)}
                                    >
                                        <div>{s.title}</div>
                                        <div className="text-xs opacity-60">{s.subtitle}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}