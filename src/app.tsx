import { useEffect, useRef } from "react";
import Topbar from "./components/topbar/topbar";

export default function App(){
    const topbarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateOffset = () => {
            const height = topbarRef.current?.offsetHeight ?? 0;
            window.tabs.setUIOffset(height);
        };

        // initial measurement
        updateOffset();

        // optional: update on window resize (responsive)
        window.addEventListener("resize", updateOffset);
        return () => window.removeEventListener("resize", updateOffset);
    }, []);

    return (
        <>
            <div className="flex flex-col w-full h-full bg-[#06070D]">
                <div ref={topbarRef}>
                    <Topbar />
                </div>

                {/* Placeholder for WebContentsView */}
                <div className="flex-1 bg-black" />
            </div>
        </>
    )
}