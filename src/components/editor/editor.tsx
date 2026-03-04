import { useEffect, useRef, useState } from "react"
import { IconContext } from "react-icons";
import { MdOutlineDelete, MdContentCopy, MdEditNote } from "react-icons/md";
import { PiDownloadSimple, PiUploadSimple } from "react-icons/pi";
import { IoMdArrowDropdown } from "react-icons/io";
import type { CrosshairSettings } from "../crosshair/crosshair";
import { DEFAULT_CROSSHAIR, encodeCrosshair, decodeCrosshair } from "../crosshair/crosshair";

interface CrosshairProfile {
    name: string;
    code: string;
}

export default function Editor(){
    const [crosshairSettings, setCrosshairSettings] = useState<CrosshairSettings | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [profiles, setProfiles] = useState<CrosshairProfile[]>([]);
    const [currentProfileIndex, setCurrentProfileIndex] = useState<number>(0);
    const [showDropdown, setShowDropdown] = useState(false);

    // Redraw crosshair when settings change
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

    useEffect(() => {
        let isActive = true;
        
        // Load crosshair profiles and current selection
        const loadProfiles = async () => {
            try {
                const crosshairs = await window.settings.get<CrosshairProfile[]>('crosshairs', [{ name: "Default", code: encodeCrosshair(DEFAULT_CROSSHAIR) }]);
                const currentIndex = await window.settings.get<number>('currentCrosshair', 0);
                
                if (isActive) {
                    setProfiles(crosshairs);
                    setCurrentProfileIndex(currentIndex);
                    
                    // Load current crosshair settings
                    if (crosshairs[currentIndex]) {
                        const decoded = decodeCrosshair(crosshairs[currentIndex].code);
                        setCrosshairSettings(decoded);
                    } else {
                        setCrosshairSettings(DEFAULT_CROSSHAIR);
                    }
                }
            } catch (error) {
                console.error('Failed to load crosshair profiles:', error);
                if (isActive) {
                    setProfiles([{ name: "Default", code: encodeCrosshair(DEFAULT_CROSSHAIR) }]);
                    setCurrentProfileIndex(0);
                    setCrosshairSettings(DEFAULT_CROSSHAIR);
                }
            }
        };

        loadProfiles();
        
        return () => {
            isActive = false;
        };
    }, []);

    // Draw crosshair when settings change
    useEffect(() => {
        redrawCrosshair();
    }, [crosshairSettings]);

    // Redraw when component mounts
    useEffect(() => {
        // Give React a chance to render the component first
        setTimeout(() => {
            redrawCrosshair();
        }, 0);
    }, []);

    const createNewProfile = async () => {
        if (profiles.length >= 15) return;
        
        const newProfile: CrosshairProfile = {
            name: "Crosshair Profile",
            code: encodeCrosshair(DEFAULT_CROSSHAIR)
        };
        
        const updatedProfiles = [...profiles, newProfile];
        const newIndex = updatedProfiles.length - 1;
        
        try {
            await window.settings.set('crosshairs', updatedProfiles);
            await window.settings.set('currentCrosshair', newIndex);
            
            setProfiles(updatedProfiles);
            setCurrentProfileIndex(newIndex);
            setCrosshairSettings(DEFAULT_CROSSHAIR);
        } catch (error) {
            console.error('Failed to create new profile:', error);
        }
    };

    const selectProfile = async (index: number) => {
        try {
            await window.settings.set('currentCrosshair', index);
            setCurrentProfileIndex(index);
            
            if (profiles[index]) {
                const decoded = decodeCrosshair(profiles[index].code);
                setCrosshairSettings(decoded);
            }
            
            setShowDropdown(false);
        } catch (error) {
            console.error('Failed to select profile:', error);
        }
    };

    return (
        <>
            <div className="w-full flex flex-col gap-1">
                <div className="w-full flex items-center justify-center relative" style={{ height: '100px', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', overflow: 'hidden', zIndex: 20, width: '200px', height: '200px' }}>
                        <canvas 
                            ref={canvasRef}
                            width="200"
                            height="200"
                            style={{ border: 'none', outline: 'none' }}
                        />
                    </div>
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
                                        <div className="p-2 bg-[#fff3] w-fit h-fit hover:bg-[#fff6]">
                                            <IconContext.Provider value={{ color: "#faa"}}>
                                                <MdOutlineDelete/>
                                            </IconContext.Provider>
                                        </div>
                                        <div className="w-[1px] py-1 self-stretch">
                                            <div className="bg-white h-full w-full"></div>
                                        </div>
                                        <div className="p-2 bg-[#fff3] w-fit h-fit hover:bg-[#fff6]">
                                            <IconContext.Provider value={{ color: "#fff"}}>
                                                <PiUploadSimple/>
                                            </IconContext.Provider>
                                        </div>
                                        <div className="p-2 bg-[#fff3] w-fit h-fit hover:bg-[#fff6]">
                                            <IconContext.Provider value={{ color: "#fff"}}>
                                                <PiDownloadSimple/>
                                            </IconContext.Provider>
                                        </div>
                                        <div className="p-2 bg-[#fff3] w-fit h-fit hover:bg-[#fff6]">
                                            <IconContext.Provider value={{ color: "#fff"}}>
                                                <MdContentCopy/>
                                            </IconContext.Provider>
                                        </div>
                                        <div className="p-2 bg-[#fff3] w-fit h-fit hover:bg-[#fff6]">
                                            <IconContext.Provider value={{ color: "#fff"}}>
                                                <MdEditNote/>
                                            </IconContext.Provider>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full flex flex-1 pl-6 flex-row items-center justify-center">
                                    <div 
                                        tabIndex={0} 
                                        onBlur={() => setShowDropdown(false)} 
                                        className="w-full relative"
                                    >
                                        <div 
                                            onClick={() => setShowDropdown(prev => !prev)} 
                                            className="p-4 hover:bg-[#fff5] flex flex-row cursor-pointer"
                                        >
                                            <p 
                                                onClick={() => setShowDropdown(prev => !prev)} 
                                                className="text-white grow pointer-events-none"
                                            >
                                                {profiles[currentProfileIndex]?.name || "No Profile"}
                                            </p>
                                            <IconContext.Provider value={{ color: "white" }}>
                                                <IoMdArrowDropdown className="mt-1 pointer-events-none"/>
                                            </IconContext.Provider>
                                        </div>
                                        {showDropdown && (
                                            <div className="absolute flex flex-col left-0 top-full w-full z-50">
                                                {profiles.length < 15 && (
                                                    <div 
                                                        onClick={createNewProfile} 
                                                        style={{ background: "#ddd" }} 
                                                        className="hover:brightness-75 cursor-pointer p-2"
                                                    >
                                                        <p className="text-black text-[0.8rem] pointer-events-none">
                                                            Create New Profile (slots: {profiles.length}/15)
                                                        </p>
                                                    </div>
                                                )}
                                                {profiles.map((profile, index) => (
                                                    <div 
                                                        key={index}
                                                        onClick={() => selectProfile(index)} 
                                                        style={{ 
                                                            background: index % 2 ? "white" : "#eee",
                                                        }} 
                                                        className="hover:brightness-75 cursor-pointer p-2"
                                                    >
                                                        <p className="text-black text-[0.8rem] pointer-events-none">{profile.name}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
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
        </>
    )
}