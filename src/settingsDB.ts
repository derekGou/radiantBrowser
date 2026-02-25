import Database from "better-sqlite3";
import { app } from "electron";
import path from "path";

type SettingRow = {
    key: string;
    value: string;
};

const dBPath = path.join(app.getPath("userData"), "settings.db");

export const db = new Database(dBPath);

db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )    
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        timestamp INTEGER NOT NULL
    )
`).run();

const defaultSettings: Record<string, any> = {
    invertMouse: false,
    sensitivity: 1,
    crosshairs: [
        { name: "Default", code: "0;P;z;2" }
    ],
    currentCrosshair: 0,
    history: [
        ["y"],
        []
    ],
    find: [
        ["f"],
        []
    ],
    closeTab: [
        ["w"],
        []
    ],
    reloadTab: [
        ["r"],
        []
    ],
    newTab: [
        ["t"],
        []
    ],
    zoominTab: [
        ["+"],
        ["="]
    ],
    zoomoutTab: [
        ["-"],
        ["_"]
    ],
    zoomresetTab: [
        ["0"],
        []
    ],
};

const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES(?, ?)
`)

for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(
        key,
        JSON.stringify(value)
    );
}

export function setSetting(key: string, value: any){
    db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
}

export function getSetting <T = any> (key: string, defaultValue?: T): T {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as SettingRow

    if (!row) return defaultValue as T;
    return JSON.parse(row.value)
}

export function deleteSetting(key: string) {
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

export function getAllSettings(): Record<string, any> {
    const rows = db
        .prepare<[], SettingRow>(`SELECT key, value FROM settings`)
        .all();

    return Object.fromEntries(
        rows.map(r => [r.key, JSON.parse(r.value)])
    );
}

// History functions
export function addHistoryEntry(url: string, title?: string) {
    // Check if this exact URL was added in the last 5 seconds
    const recentEntry = db.prepare(`
        SELECT id FROM history
        WHERE url = ? AND timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 1
    `).get(url, Date.now() - 5000) as { id: number } | undefined;
    
    if (recentEntry) {
        // Update the existing recent entry's title if provided
        if (title) {
            db.prepare(`UPDATE history SET title = ? WHERE id = ?`).run(title, recentEntry.id);
        }
        return;
    }
    
    // Add new entry
    db.prepare(`
        INSERT INTO history (url, title, timestamp)
        VALUES (?, ?, ?)
    `).run(url, title || null, Date.now());
}

export function getHistoryEntries(limit: number = 1000): Array<{ id: number; url: string; title: string | null; timestamp: number }> {
    return db.prepare(`
        SELECT id, url, title, timestamp FROM history
        ORDER BY timestamp DESC
        LIMIT ?
    `).all(limit) as Array<{ id: number; url: string; title: string | null; timestamp: number }>;
}

export function clearHistory() {
    db.prepare(`DELETE FROM history`).run();
}

export function deleteHistoryEntry(id: number) {
    db.prepare(`DELETE FROM history WHERE id = ?`).run(id);
}

export function clearHistoryByTimePeriod(timePeriod: 'day' | 'week' | 'month' | 'year' | 'all') {
    const now = Date.now();
    let timestamp = 0;

    switch (timePeriod) {
        case 'day':
            timestamp = now - 24 * 60 * 60 * 1000;
            break;
        case 'week':
            timestamp = now - 7 * 24 * 60 * 60 * 1000;
            break;
        case 'month':
            timestamp = now - 30 * 24 * 60 * 60 * 1000;
            break;
        case 'year':
            timestamp = now - 365 * 24 * 60 * 60 * 1000;
            break;
        case 'all':
            db.prepare(`DELETE FROM history`).run();
            return;
    }

    db.prepare(`DELETE FROM history WHERE timestamp < ?`).run(timestamp);
}

export function getHistoryIdByUrl(url: string): number | null {
    const result = db.prepare(`
        SELECT id FROM history
        WHERE url = ?
        ORDER BY timestamp DESC
        LIMIT 1
    `).get(url) as { id: number } | undefined;
    return result?.id ?? null;
}

export function updateHistoryEntryTitle(url: string, title: string) {
    // Update the most recent entry for this URL
    db.prepare(`
        UPDATE history
        SET title = ?
        WHERE id = (
            SELECT id FROM history
            WHERE url = ?
            ORDER BY timestamp DESC
            LIMIT 1
        )
    `).run(title, url);
}

// Crosshair preset functions
export interface CrosshairPreset {
    name: string;
    code: string;
}

export function getCrosshairPresets(): CrosshairPreset[] {
    return getSetting<CrosshairPreset[]>("crosshairs", [
        { name: "Default", code: "0;P;z;2" }
    ]);
}

export function getCurrentCrosshairIndex(): number {
    return getSetting<number>("currentCrosshair", 0);
}

export function getCurrentCrosshair(): CrosshairPreset {
    const presets = getCrosshairPresets();
    const index = getCurrentCrosshairIndex();
    return presets[index] || presets[0] || { name: "Default", code: "0;P;z;2" };
}

export function setCurrentCrosshairIndex(index: number) {
    const presets = getCrosshairPresets();
    if (index >= 0 && index < presets.length) {
        setSetting("currentCrosshair", index);
    }
}

export function addCrosshairPreset(preset: CrosshairPreset) {
    const presets = getCrosshairPresets();
    presets.push(preset);
    setSetting("crosshairs", presets);
}

export function removeCrosshairPreset(index: number) {
    const presets = getCrosshairPresets();
    if (presets.length > 1) {
        presets.splice(index, 1);
        setSetting("crosshairs", presets);
        // If the removed preset was the current one, switch to index 0
        if (getCurrentCrosshairIndex() >= presets.length) {
            setCurrentCrosshairIndex(0);
        }
    }
}

export function updateCrosshairPreset(preset: CrosshairPreset) {
    const presets = getCrosshairPresets();
    const index = getCurrentCrosshairIndex();
    if (index >= 0 && index < presets.length) {
        presets[index] = preset;
        setSetting("crosshairs", presets);
    }
}