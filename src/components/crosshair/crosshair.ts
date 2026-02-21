export interface CrosshairSettings {
    version: string;

    color?: string;

    outlines: {
        enabled?: boolean;
        opacity?: number;
        thickness?: number;
    };

    centerDot: {
        enabled?: boolean;
        opacity?: number;
        thickness?: number;
    };

    overrideFiringErrorOffset?: boolean;

    innerLines: {
        enabled?: boolean;
        opacity?: number;
        lengthH?: number;
        lengthV?: number;
        thickness?: number;
        offset?: number;
        movementError?: {
        enabled?: boolean;
        multiplier?: number;
        };
        firingError?: {
        enabled?: boolean;
        multiplier?: number;
        };
    };

    outerLines: {
        enabled?: boolean;
        opacity?: number;
        lengthH?: number;
        lengthV?: number;
        thickness?: number;
        offset?: number;
        movementError?: {
        enabled?: boolean;
        multiplier?: number;
        };
        firingError?: {
        enabled?: boolean;
        multiplier?: number;
        };
    };

    _unknown?: Record<string, string>;
}

export const TOKEN_MAP: Record<
    string,
    { path: string; type: "bool" | "float" | "color" }
> = {
    // Color
    "c": { path: "color", type: "color" },

    // Outlines
    "h": { path: "outlines.enabled", type: "bool" },
    "o": { path: "outlines.opacity", type: "float" },
    "w": { path: "outlines.thickness", type: "float" },

    // Center Dot
    "t": { path: "centerDot.enabled", type: "bool" },
    "z": { path: "centerDot.opacity", type: "float" },
    "x": { path: "centerDot.thickness", type: "float" },

    // Inner Lines (0 prefix)
    "0s": { path: "innerLines.enabled", type: "bool" },
    "0a": { path: "innerLines.opacity", type: "float" },
    "0l": { path: "innerLines.lengthH", type: "float" },
    "0v": { path: "innerLines.lengthV", type: "float" },
    "0t": { path: "innerLines.thickness", type: "float" },
    "0o": { path: "innerLines.offset", type: "float" },
    "0m": { path: "innerLines.movementError.enabled", type: "bool" },
    "0mm": { path: "innerLines.movementError.multiplier", type: "float" },
    "0f": { path: "innerLines.firingError.enabled", type: "bool" },
    "0fm": { path: "innerLines.firingError.multiplier", type: "float" },

    // Outer Lines (1 prefix)
    "1s": { path: "outerLines.enabled", type: "bool" },
    "1a": { path: "outerLines.opacity", type: "float" },
    "1l": { path: "outerLines.lengthH", type: "float" },
    "1v": { path: "outerLines.lengthV", type: "float" },
    "1t": { path: "outerLines.thickness", type: "float" },
    "1o": { path: "outerLines.offset", type: "float" },
    "1m": { path: "outerLines.movementError.enabled", type: "bool" },
    "1mm": { path: "outerLines.movementError.multiplier", type: "float" },
    "1f": { path: "outerLines.firingError.enabled", type: "bool" },
    "1fm": { path: "outerLines.firingError.multiplier", type: "float" },
};

export const DEFAULT_CROSSHAIR: CrosshairSettings = {
    version: "0",

    color: "white",

    outlines: {
        enabled: false,
        opacity: 0.5,
        thickness: 1,
    },

    centerDot: {
        enabled: false,
        opacity: 1,
        thickness: 2,
    },

    overrideFiringErrorOffset: false,

    innerLines: {
        enabled: true,
        opacity: 0.8,
        lengthH: 6,
        lengthV: 6,
        thickness: 2,
        offset: 3,
        movementError: {
            enabled: false,
            multiplier: 1,
        },
        firingError: {
            enabled: false,
            multiplier: 1,
        },
    },

    outerLines: {
        enabled: true,
        opacity: 0.35,
        lengthH: 2,
        lengthV: 2,
        thickness: 2,
        offset: 10,
        movementError: {
            enabled: false,
            multiplier: 1,
        },
        firingError: {
            enabled: false,
            multiplier: 1,
        },
    },
};

function deepMerge<T>(base: T, override: Partial<T>): T {
    const result: any = { ...base };

    for (const key in override) {
        const value = (override as any)[key];

        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            result[key] = deepMerge(result[key] ?? {}, value);
        } else {
            result[key] = value;
        }
    }

    return result;
}


// ENCODER

function setNested(obj: any, path: string, value: any) {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key]) current[key] = {};
        current = current[key];
    }

    current[parts[parts.length - 1]] = value;
}

function convertValue(raw: string, type: "bool" | "float" | "color") {
    if (type === "bool") return raw === "1";
    if (type === "float") return parseFloat(raw);

    if (type === "color") {
        const map: Record<string, string> = {
            "0": "white",
            "1": "green",
            "2": "yellow",
            "3": "cyan",
            "4": "pink",
            "5": "red",
            "6": "custom",
        };
        return map[raw] ?? raw;
    }

    return raw;
}

export function decodeCrosshair(code: string): CrosshairSettings {
    const parts = code.split(";");
    const version = parts[0];
    const data = parts.slice(1);

    const partial: CrosshairSettings = {
        version,
        outlines: {},
        centerDot: {},
        innerLines: { movementError: {}, firingError: {} },
        outerLines: { movementError: {}, firingError: {} },
    };

    for (let i = 0; i < data.length - 1; i += 2) {
        const token = data[i];
        const value = data[i + 1];

        const mapping = TOKEN_MAP[token];
        if (!mapping) {
            if (!partial._unknown) partial._unknown = {};
            partial._unknown[token] = value;
            continue;
        }

        const converted = convertValue(value, mapping.type);
        setNested(partial, mapping.path, converted);
    }

    // merge decoded values on top of defaults
    const final = deepMerge(DEFAULT_CROSSHAIR, partial);

    return final;
}

// DECODER

export const REVERSE_TOKEN_MAP: Record<
    string,
    { token: string; type: "bool" | "float" | "color" }
> = {};

for (const token in TOKEN_MAP) {
    const { path, type } = TOKEN_MAP[token];
    REVERSE_TOKEN_MAP[path] = { token, type };
}

function encodeValue(value: any, type: "bool" | "float" | "color"): string {
    if (type === "bool") return value ? "1" : "0";
    if (type === "float") return String(value);

    if (type === "color") {
        const map: Record<string, string> = {
            white: "0",
            green: "1",
            yellow: "2",
            cyan: "3",
            pink: "4",
            red: "5",
            custom: "6",
        };
        return map[value] ?? "0";
    }

    return String(value);
}

function flatten(obj: any, prefix = ""): Record<string, any> {
    let out: Record<string, any> = {};

    for (const key in obj) {
        const value = obj[key];
        const path = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === "object" && !Array.isArray(value)) {
            Object.assign(out, flatten(value, path));
        } else {
            out[path] = value;
        }
    }

    return out;
}

export function encodeCrosshair(settings: CrosshairSettings): string {
    const parts: string[] = [];

    // Always start with version
    parts.push(settings.version ?? "0");

    // Flatten the settings object
    const flat = flatten(settings);

    for (const path in flat) {
        if (path === "version") continue;

        const entry = REVERSE_TOKEN_MAP[path];
        if (!entry) continue; // skip unknown or unmapped fields

        const { token, type } = entry;
        const rawValue = flat[path];

        if (rawValue === undefined || rawValue === null) continue;

        const encoded = encodeValue(rawValue, type);

        parts.push(token, encoded);
    }

    return parts.join(";");
}
