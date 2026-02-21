import { useEffect, useRef, useState } from "react"
import { IconContext } from "react-icons";
import { IoMdArrowDropdown } from "react-icons/io";
import OnOff from "./onoff";
import Slider from "./slider";
import Shortcut from "./shortcut";

export default function Settings(){
    const [selected, setSelected] = useState(0)

    const languages = {
        "English (United States)": "en-US",
        "Deutsch (Deutschland)": "de-DE",
        "español (España)": "es-ES",
        "español (LATAM)": "es-419",
        "français (France)": "fr-FR",
        "Bahasa Indonesia (Indonesia)": "id-ID",
        "italiano (Italia)": "it-IT",
        "日本語 (日本)": "ja-JP",
        "한국어 (대한민국)": "ko-KR",
        "polski (Polska)": "pl-PL",
        "português (Brazil)": "pt-BR",
        "русский (Россия)": "ru-RU",
        "ไทย (ไทย)": "th-TH",
        "Türkçe (Türkiye)": "tr-TR",
        "中文 (繁體)": "zh-TW",
    }
    const [showLanguages, setShowLanguages] = useState(false);
    type LanguageLabel = keyof typeof languages;
    const [language, setLanguage] = useState<LanguageLabel>("English (United States)");

    useEffect(() => {
        try {
            const currentLocale = window.electron.getCurrentLocale();
            // Find matching language key
            const matchingLang = (Object.entries(languages) as [LanguageLabel, string][])
                .find(([_, code]) => code === currentLocale);
            
            if (matchingLang) {
                setLanguage(matchingLang[0]);
            }
        } catch (error) {
            console.error('Failed to get current locale:', error);
        }
    }, []) // Empty dependency array - run only once on mount

    const [invertMouse, setInvertMouse] = useState(false);
    const [sense, setSense] = useState(10);
    const lastValidSenseRef = useRef(sense);
    const settingsLoadedRef = useRef(false);

    type ShortcutSettings = {
        [key: string]: string[][];
    };

    const [shortcuts, setShortcuts] = useState<ShortcutSettings>({});

    const loadShortcuts = async () => {
        try {
            const allSettings = await window.settings.getAll();
            const shortcutData: ShortcutSettings = {};

            // Filter for settings that have the shortcut structure (array of arrays)
            for (const [key, value] of Object.entries(allSettings)) {
                // Simple check: if it's an array of arrays, it's a shortcut
                if (
                    Array.isArray(value) &&
                    value.length >= 2 &&
                    Array.isArray(value[0]) &&
                    Array.isArray(value[1])
                ) {
                    // Skip non-shortcut settings like crosshair that also are arrays
                    if (key !== 'crosshair' && key !== 'history' && !key.startsWith('invertMouse') && !key.startsWith('sensitivity')) {
                        shortcutData[key] = value;
                    } else if (key === 'history' || key === 'find' || key === 'closeTab' || key === 'reloadTab' || key === 'newTab' || key === 'zoominTab' || key === 'zoomoutTab' || key === 'zoomresetTab') {
                        shortcutData[key] = value;
                    }
                }
            }

            setShortcuts(shortcutData);
        } catch (error) {
            console.error('Failed to load shortcuts:', error);
        }
    };

    const clampSense = (val: number) => Math.min(100, Math.max(0.1, val));

    const updateSense = (val: number) => {
        const clamped = clampSense(val);
        setSense(clamped);
        lastValidSenseRef.current = clamped;
    };

    useEffect(() => {
        let isActive = true;
        const loadSettings = async () => {
            try {
                const [dbInvert, dbSensitivity] = await Promise.all([
                    window.settings.get<boolean>('invertMouse', false),
                    window.settings.get<number>('sensitivity', 1),
                ]);

                if (!isActive) return;

                setInvertMouse(Boolean(dbInvert));
                const nextSense = clampSense((Number(dbSensitivity) || 1) * 10);
                setSense(nextSense);
                lastValidSenseRef.current = nextSense;
                settingsLoadedRef.current = true;
            } catch (error) {
                console.error('Failed to load mouse settings:', error);
                settingsLoadedRef.current = true;
            }
        };

        loadSettings();
        loadShortcuts();
        
        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (!settingsLoadedRef.current) return;
        window.settings.set('invertMouse', invertMouse).catch((error) => {
            console.error('Failed to save invertMouse:', error);
        });
    }, [invertMouse]);

    useEffect(() => {
        if (!settingsLoadedRef.current) return;
        window.settings.set('sensitivity', sense / 10).catch((error) => {
            console.error('Failed to save sensitivity:', error);
        });
    }, [sense]);

    return (
        <>
            <div className="relative min-h-full w-full flex flex-col items-center gap-8 no-bar">
                <div className="z-0 fixed w-full h-full overflow-hidden">
                    <img
                        src={`/assets/bg.png`}
                        alt="Background image"
                        className="pointer-events-none w-full h-full object-cover brightness-90"
                    />
                </div>
                <div className="w-[32rem] z-10">
                    <div className="border-b border-b-solid border-b-white w-full flex flex-row">
                        <div style={{ backgroundColor: selected == 0 ? "#fff3" : "transparent", fontWeight: selected == 0 ? 600 : 400 }} onClick={() => setSelected(0)} className="text-white flex-1 flex items-center justify-center text-center hover:!bg-[#fff3] p-2 cursor-pointer">
                            <span>General</span>
                            {selected === 0 && <div className="bg-white h-2 w-2 absolute translate-y-5 rotate-45"></div>}
                        </div>
                        <div style={{ backgroundColor: selected == 1 ? "#fff3" : "transparent", fontWeight: selected == 1 ? 600 : 400 }} onClick={() => setSelected(1)} className="text-white flex-1 flex items-center justify-center text-center hover:!bg-[#fff3] p-2 cursor-pointer">
                            <span>Controls</span>
                            {selected === 1 && <div className="bg-white h-2 w-2 absolute translate-y-5 rotate-45"></div>}
                        </div>
                        <div style={{ backgroundColor: selected == 2 ? "#fff3" : "transparent", fontWeight: selected == 2 ? 600 : 400 }} onClick={() => setSelected(2)} className="text-white flex-1 flex items-center justify-center text-center hover:!bg-[#fff3] p-2 cursor-pointer">
                            <span>Crosshair</span>
                            {selected === 2 && <div className="bg-white h-2 w-2 absolute translate-y-5 rotate-45"></div>}
                        </div>
                    </div>
                </div>
                <div className="min-w-[48rem] flex flex-col items-center z-10 no-bar">
                    { selected == 0 && 
                        <table>
                            <thead>
                                <tr className="headrow">
                                    <th>
                                        Accessibility
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <div className="bg-[#fff1] p-4 relative">
                                            <p className="text-white">Text Language</p>
                                        </div>
                                    </td>
                                    <td tabIndex={0} onBlur={()=>{
                                            setShowLanguages(false);
                                        }} className="relative">
                                        <div onClick={()=>{setShowLanguages(prev => !prev)}} className="bg-[#fff1] p-4 hover:bg-[#fff3] flex flex-row cursor-pointer">
                                            <p className="text-white grow">{language}</p>
                                            <IconContext.Provider value={{ color: "white" }}>
                                                <IoMdArrowDropdown className="mt-1"/>
                                            </IconContext.Provider>
                                        </div>
                                        { showLanguages && 
                                            <div className="absolute flex flex-col left-0 top-full w-full z-50">
                                                {
                                                    (Object.keys(languages) as LanguageLabel[]).map((lang, index) => (
                                                        <div key={lang} onClick={async ()=>{
                                                            setShowLanguages(false);
                                                            setLanguage(lang);
                                                            try {
                                                                await window.electron.changeLanguage(languages[lang]);
                                                                // Give a moment for the store to write, then restart
                                                                setTimeout(() => {
                                                                    window.electron.ipc.send('restart-app');
                                                                }, 200);
                                                            } catch (error) {
                                                                console.error('Failed to change language:', error);
                                                            }
                                                        }} style={{ background: index % 2 ? "white" : "#eee" }} className="hover:brightness-75 cursor-pointer p-2">
                                                            <p className="text-black">{lang}</p>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        }
                                    </td>
                                </tr>
                            </tbody>
                            <thead>
                                <tr className="headrow">
                                    <th>
                                        Mouse
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <div className="bg-[#fff1] p-4">
                                            <p className="text-white">Sensitivity: Aim</p>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="bg-[#fff1] p-4 hover:bg-[#fff3]">
                                            <div className="flex flex-row gap-4 items-center">
                                                <input value = {(sense / 10).toFixed(2)} onChange={(e)=>{const next = parseFloat(e.target.value); if (!Number.isFinite(next)) { setSense(lastValidSenseRef.current); return; } updateSense(next * 10); }} className="text-white w-10 bg-transparent"></input>
                                                <div className="flex-1">
                                                    <Slider percent={ sense } setPercent = {updateSense}/>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <div className="bg-[#fff1] p-4">
                                            <p className="text-white">Invert Mouse</p>
                                        </div>
                                    </td>
                                    <td>
                                        <OnOff on = {invertMouse} setOn = {setInvertMouse}/>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    }
                    { selected == 1 && 
                        <table>
                            <tbody className="w-full">
                                {Object.entries(shortcuts).map(([name, bindings]) => (
                                    <tr key={name} className="flex w-full">
                                        <td className="bg-[#fff1] flex-2 p-4">
                                            <p className="text-white">{name}</p>
                                        </td>
                                        <td className="flex-1 bg-[#fff1] hover:bg-[#fff6]">
                                            <Shortcut 
                                                value={bindings[0]} 
                                                emptyLabel="none"
                                                setValue={(newValue) => {
                                                    const updated = [...bindings];
                                                    updated[0] = newValue;
                                                    const newShortcuts = { ...shortcuts, [name]: updated };
                                                    setShortcuts(newShortcuts);
                                                    window.settings.set(name, updated);
                                                }}
                                            />
                                        </td>
                                        <td className="flex-1 bg-[#fff1] hover:bg-[#fff6]">
                                            <Shortcut 
                                                value={bindings[1]} 
                                                emptyLabel="none"
                                                setValue={(newValue) => {
                                                    const updated = [...bindings];
                                                    updated[1] = newValue;
                                                    const newShortcuts = { ...shortcuts, [name]: updated };
                                                    setShortcuts(newShortcuts);
                                                    window.settings.set(name, updated);
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    }
                </div>
            </div>
        </>
    )
}