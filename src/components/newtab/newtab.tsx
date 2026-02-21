import { useEffect, useState } from "react";
import Flag from "./flag/flag";

export default function NewTab(){
    const [os, setOS] = useState("")

    useEffect(() => {
        const os = window.platform?.os ?? "unknown";

        setOS(os);
    }, []);

    const launch_val = async () => {
        if (os == "win32"){
            try {
                await window.riot.launchValorant();
            } catch (e) {
                console.error("Launch failed", e);
            }
        }
    }

    return (
        <>
            <div className="w-full h-full relative">
                <div className="pointer-events-none fixed w-full h-full overflow-hidden">
                    <img
                        src={`/assets/bg.png`}
                        alt="Background image"
                        className="pointer-events-none w-full h-full object-cover brightness-90"
                    />
                </div>
                <div className="w-full h-full flex flex-row items-center justify-center relative z-10">
                    <div style={{ filter: os != "win32" ? "grayscale(100%)" : "grayscale(0%)", pointerEvents: os != "win32" ? "none" : "auto"  }} onClick = {() => launch_val()}>
                        <Flag title="Play" image="val.png" size = {25}/>
                    </div>
                    <div onClick={() => { window.tabs.navigate("http://tracker.gg/valorant/") }}>
                        <Flag title="Tracker" image="val.png" size = {28}/>
                    </div>
                    <div onClick={() => { window.tabs.navigate("radiant://settings") }}>
                        <Flag title="Settings" image="val.png" size = {30}/>
                    </div>
                    <div onClick={() => { window.tabs.navigate("radiant://history") }}>
                        <Flag title="History" image="val.png" size = {28}/>    
                    </div>
                    <Flag title="Coming Soon" image="val.png" size = {25}/>
                </div>
            </div>
        </>
    )
}