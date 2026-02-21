import { useCallback, useMemo, useRef } from "react";

export default function Slider({
    percent,
    setPercent,
}: {
    percent: number;
    setPercent: (val: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef(false);
    const clamped = useMemo(() => {
        if (Number.isNaN(percent)) {
            return 0.1;
        }
        return Math.min(100, Math.max(0.1, percent));
    }, [percent]);

    const updateFromClientX = useCallback(
        (clientX: number) => {
            if (!trackRef.current) {
                return;
            }
            const rect = trackRef.current.getBoundingClientRect();
            const next = ((clientX - rect.left) / rect.width) * 100;
            const value = Math.min(100, Math.max(0.1, Math.round(next * 10) / 10));
            setPercent(value);
        },
        [setPercent]
    );

    return (
        <div className="h-full w-full flex flex-row items-center justify-center">
            <div className="relative w-full h-4">
                <div
                    className="p-0.5 pointer-events-none absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-[#fff3]"
                    ref={trackRef}
                >
                    <div
                        className="h-1 rounded-full bg-white w-full"
                    />
                    <div
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                        style={{ left: `${clamped}%` }}
                    />
                </div>
                <div
                    className="absolute inset-0 cursor-pointer"
                    onClick={(event) => {
                        updateFromClientX(event.clientX);
                    }}
                    onMouseDownCapture={(event) => {
                        draggingRef.current = true;
                        const handleMove = (e: MouseEvent) => {
                            if (draggingRef.current) {
                                updateFromClientX(e.clientX);
                            }
                        };
                        const handleUp = () => {
                            draggingRef.current = false;
                            window.removeEventListener("mousemove", handleMove);
                            window.removeEventListener("mouseup", handleUp);
                        };
                        window.addEventListener("mousemove", handleMove);
                        window.addEventListener("mouseup", handleUp);
                    }}
                    role="slider"
                    tabIndex={0}
                />
            </div>
        </div>
    );
}