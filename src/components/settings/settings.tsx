import { useEffect, useRef, useState } from "react"
import { IconContext } from "react-icons";
import { IoMdArrowDropdown } from "react-icons/io";
import { MdOutlineDelete, MdContentCopy, MdEditNote } from "react-icons/md";
import { PiDownloadSimple, PiUploadSimple } from "react-icons/pi";

import OnOff from "./onoff";
import Slider from "./slider";
import Shortcut from "./shortcut";
import type { CrosshairSettings } from "../crosshair/crosshair";
import { DEFAULT_CROSSHAIR } from "../crosshair/crosshair";

export default function Settings(){
    const [selected, setSelected] = useState(0)
    const [crosshairSettings, setCrosshairSettings] = useState<CrosshairSettings | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Redraw crosshair when tab is selected or settings change
    const redrawCrosshair = () => {
        const canvas = canvasRef.current;
        if (!canvas || !crosshairSettings) return;

        // Ensure canvas size is set
        canvas.width = 200;
        canvas.height = 200;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const SIZE = 200;
        const HALF = SIZE / 2;

        // Clear with transparent
        ctx.clearRect(0, 0, SIZE, SIZE);

        const c = crosshairSettings.color || "white";
        const hasOutline = crosshairSettings.outlines?.enabled;

        // Helper to draw lines with proper outline
        const drawLines = (cfg: any) => {
            const lengthH = cfg.lengthH ?? 0;
            const lengthV = cfg.lengthV ?? 0;
            const baseOffset = 3; // Default offset from center
            const offset = baseOffset + (cfg.offset ?? 0);
            const endH = offset + lengthH; // Where line ends: gap + length
            const endV = offset + lengthV;
            const thickness = cfg.thickness ?? 1;
            const opacity = cfg.opacity ?? 0;

            ctx.globalAlpha = opacity;

            // Draw black outline first (thicker)
            if (hasOutline) {
                ctx.lineWidth = thickness + 2;
                ctx.strokeStyle = "black";
                ctx.lineCap = "square";
                ctx.lineJoin = "bevel";
                ctx.beginPath();
                ctx.moveTo(HALF - endH, HALF);
                ctx.lineTo(HALF - offset, HALF);
                ctx.moveTo(HALF + offset, HALF);
                ctx.lineTo(HALF + endH, HALF);
                ctx.moveTo(HALF, HALF - endV);
                ctx.lineTo(HALF, HALF - offset);
                ctx.moveTo(HALF, HALF + offset);
                ctx.lineTo(HALF, HALF + endV);
                ctx.stroke();
            }

            // Draw colored lines on top
            ctx.lineWidth = thickness;
            ctx.strokeStyle = c;
            ctx.lineCap = "square";
            ctx.lineJoin = "bevel";
            ctx.beginPath();
            ctx.moveTo(HALF - endH, HALF);
            ctx.lineTo(HALF - offset, HALF);
            ctx.moveTo(HALF + offset, HALF);
            ctx.lineTo(HALF + endH, HALF);
            ctx.moveTo(HALF, HALF - endV);
            ctx.lineTo(HALF, HALF - offset);
            ctx.moveTo(HALF, HALF + offset);
            ctx.lineTo(HALF, HALF + endV);
            ctx.stroke();
        };

        // Draw outer lines first
        if (crosshairSettings.outerLines?.enabled) {
            drawLines(crosshairSettings.outerLines);
        }

        // Draw inner lines (appears on top of outer)
        if (crosshairSettings.innerLines?.enabled) {
            drawLines(crosshairSettings.innerLines);
        }

        // Center dot
        if (crosshairSettings.centerDot?.enabled) {
            const t = crosshairSettings.centerDot.thickness ?? 2;
            const opacity = crosshairSettings.centerDot.opacity ?? 1;

            ctx.globalAlpha = opacity;

            // Draw black outline if enabled
            if (hasOutline) {
                ctx.fillStyle = "black";
                ctx.fillRect(HALF - t / 2 - 1, HALF - t / 2 - 1, t + 2, t + 2);
            }

            // Draw colored dot on top
            ctx.fillStyle = c;
            ctx.fillRect(HALF - t / 2, HALF - t / 2, t, t);
        }

        ctx.globalAlpha = 1;
    };

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
        
        // Load crosshair settings
        const loadCrosshairSettings = async () => {
            try {
                if (window.crosshair && window.crosshair.getSettings) {
                    const settings = await window.crosshair.getSettings();
                    if (isActive) {
                        setCrosshairSettings(settings);
                    }
                } else {
                    // Fallback to default if API not available
                    if (isActive) {
                        setCrosshairSettings(DEFAULT_CROSSHAIR);
                    }
                }
            } catch (error) {
                // Fallback to default on error
                if (isActive) {
                    setCrosshairSettings(DEFAULT_CROSSHAIR);
                }
            }
        };

        loadCrosshairSettings();
        
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

    // Draw crosshair when settings change
    useEffect(() => {
        redrawCrosshair();
    }, [crosshairSettings]);

    // Redraw when crosshair tab is selected
    useEffect(() => {
        if (selected === 2) {
            // Give React a chance to render the tab content first
            setTimeout(() => {
                redrawCrosshair();
            }, 0);
        }
    }, [selected]);

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
                                                    console.log('[SHORTCUT SAVE] Setting', name, 'binding 0 to:', newValue);
                                                    const updated = [...bindings];
                                                    updated[0] = newValue;
                                                    console.log('[SHORTCUT SAVE] Full updated bindings:', updated);
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
                                                    console.log('[SHORTCUT SAVE] Setting', name, 'binding 1 to:', newValue);
                                                    const updated = [...bindings];
                                                    updated[1] = newValue;
                                                    console.log('[SHORTCUT SAVE] Full updated bindings:', updated);
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
                    { selected == 2 &&
                        <div className="w-full flex flex-col gap-1">
                            <div className="w-full flex items-center justify-center relative" style={{ height: '100px' }}>
                                <canvas 
                                    ref={canvasRef}
                                    width="200"
                                    height="200"
                                    style={{ position: 'absolute', zIndex: 20, width: '200px', height: '200px', border: 'none', outline: 'none' }}
                                />
                                <div className="absolute z-20 right-0 p-2 bg-[#fff4]">
                                    <p className="text-white text-[0.8rem]">RESET CROSSHAIR TO DEFAULT</p>
                                </div>
                                <img className="w-full h-full object-cover" src="/assets/crosshairbg.png"></img>
                            </div>
                            <table>
                                <tbody className="w-full">
                                    <tr className="bg-[#fff1] flex w-full">
                                        <td className="w-full flex flex-row items-center justify-center">
                                            <div className="w-full flex grow flex-1 flex-row items-center justify-center">
                                                <div className="grow p-2 px-4 flex flex-row">
                                                    <p className="text-white grow">Crosshair Profile</p>
                                                </div>
                                                <div className="grow-1 pl-4 gap-2 flex flex-row items-center justify-center">
                                                    <div className="p-2 bg-[#fff3] w-fit h-fit">
                                                        <IconContext.Provider value={{ color: "#faa"}}>
                                                            <MdOutlineDelete/>
                                                        </IconContext.Provider>
                                                    </div>
                                                    <div className="w-[1px] py-1 self-stretch">
                                                        <div className="bg-white h-full w-full"></div>
                                                    </div>
                                                    <div className="p-2 bg-[#fff3] w-fit h-fit">
                                                        <IconContext.Provider value={{ color: "#fff"}}>
                                                            <PiUploadSimple/>
                                                        </IconContext.Provider>
                                                    </div>
                                                    <div className="p-2 bg-[#fff3] w-fit h-fit">
                                                        <IconContext.Provider value={{ color: "#fff"}}>
                                                            <PiDownloadSimple/>
                                                        </IconContext.Provider>
                                                    </div>
                                                    <div className="p-2 bg-[#fff3] w-fit h-fit">
                                                        <IconContext.Provider value={{ color: "#fff"}}>
                                                            <MdContentCopy/>
                                                        </IconContext.Provider>
                                                    </div>
                                                    <div className="p-2 bg-[#fff3] w-fit h-fit">
                                                        <IconContext.Provider value={{ color: "#fff"}}>
                                                            <MdEditNote/>
                                                        </IconContext.Provider>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="w-full flex flex-1 flex-row items-center justify-center">
                                                {/* dropdown listing all crosshair names */}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <table>
                                <thead>
                                    <tr className="headrow">
                                        <th>
                                            Crosshair
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Crosshair Color</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Outlines</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Outline Opacity</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Outline Thickness</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Center Dot</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Center Dot Opacity</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Center Dot Thickness</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Crosshair</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="bg-[#fff1] p-4 relative">
                                                <p className="text-white">Crosshair</p>
                                            </div>
                                        </td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    }
                </div>
            </div>
        </>
    )
}