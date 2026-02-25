import { useCallback, useEffect, useRef, useState } from "react";
import { IconContext } from "react-icons";
import { CiCircleMinus } from "react-icons/ci";

export default function Shortcut({
    value,
    setValue,
    emptyLabel,
}: {
    value: string[];
    setValue: (val: string[]) => void;
    emptyLabel?: string;
}) {
    const [isFocused, setIsFocused] = useState(false);
    const divRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            console.log('Shortcut keydown:', e.key, e.code, e)
            // Get the key - use key first, fall back to code
            let key = e.key.toLowerCase();
            
            console.log("Processed key:", key);
            
            // If key is "unidentified", try to extract from code
            if (key === "unidentified" && e.code) {
                // Convert code like "KeyA" -> "a", "Digit1" -> "1"
                if (e.code.startsWith("Key")) {
                    key = e.code.slice(3).toLowerCase();
                } else if (e.code.startsWith("Digit")) {
                    key = e.code.slice(5).toLowerCase();
                } else {
                    key = e.code.toLowerCase();
                }
            }

            // Determine which modifier is active (cmd on mac, ctrl on windows)
            const isMac = (window as any).platform?.os === "darwin";
            const isCmd = e.metaKey;
            const isCtrl = e.ctrlKey;
            const isShift = e.shiftKey;
            const isAlt = e.altKey;

            // Check if this is a special character that requires shift
            // For these, we DON'T add shift as a modifier, we just record the character
            const shiftRequiredChars = new Set([
                '+', '_', '{', '}', '|', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 
                ':', '<', '>', '?', '"'
            ]);
            const isShiftRequiredChar = shiftRequiredChars.has(e.key);

            // Build the key combination, excluding the platform modifier
            const keys: string[] = [];

            if (isMac) {
                if (isCtrl) keys.push("ctrl");
                if (isAlt) keys.push("alt");
                // Only add shift if it's NOT being used to type a special character
                if (isShift && !isShiftRequiredChar) keys.push("shift");
            } else {
                if (isCmd) keys.push("cmd");
                if (isAlt) keys.push("alt");
                // Only add shift if it's NOT being used to type a special character
                if (isShift && !isShiftRequiredChar) keys.push("shift");
            }

            // Add the actual key if it's not a modifier alone
            if (key !== "meta" && key !== "control" && key !== "alt" && key !== "shift") {
                keys.push(key);
            }

            // Only update if we have a non-modifier key
            const hasActualKey = key !== "meta" && key !== "control" && key !== "alt" && key !== "shift";
            if (hasActualKey) {
                setValue(keys);
                setIsFocused(false);
            }
        },
        [setValue]
    );

    const displayValue = value.length === 0 ? (emptyLabel ?? "") : value.join(" + ");

    // Handle click outside to unfocus
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (divRef.current && !divRef.current.contains(e.target as Node)) {
                setIsFocused(false);
            }
        };

        if (isFocused) {
            document.addEventListener("mousedown", handleClickOutside);
            inputRef.current?.focus();
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isFocused]);

    // Notify overlay when we're active
    useEffect(() => {
        if (isFocused){
            document.addEventListener("keydown", handleKeyDown)
        } else {
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [isFocused]);

    return (
        <>
            <div
                ref={divRef}
                className={`w-full relative h-full flex items-center justify-center text-white cursor-pointer p-2 rounded ${
                    isFocused ? "bg-[#fff5] border border-white" : ""
                }`}
                onClick={() => setIsFocused(true)}
            >
                <p>{isFocused ? "Press keys..." : displayValue}</p>
                { isFocused && 
                    <div
                        className="absolute left-4 rounded-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            setValue([]);
                            setIsFocused(false);
                        }}
                    >
                        <IconContext.Provider value={{ color: "white", size: "20" }}>
                            <CiCircleMinus/>
                        </IconContext.Provider>
                    </div>
                }
            </div>
        </>
    );
}