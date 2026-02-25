import { ipcMain } from "electron";
import {
    setSetting,
    getSetting,
    deleteSetting,
    getAllSettings,
    getCrosshairPresets,
    getCurrentCrosshair,
    setCurrentCrosshairIndex,
    addCrosshairPreset,
    removeCrosshairPreset,
    updateCrosshairPreset
} from "./settingsDB";
import { decodeCrosshair } from "./components/crosshair/crosshair";

export function registerSettingsIPC() {
    ipcMain.handle("settings:get", (_e, key, defaultValue) => {
        return getSetting(key, defaultValue);
    });

    ipcMain.handle("settings:set", (_e, key, value) => {
        console.log('[IPC SETTINGS] Saving setting:', key, '=', JSON.stringify(value));
        setSetting(key, value);
        ipcMain.emit('settings:updated', undefined, key, value);
    });

    ipcMain.handle("settings:delete", (_e, key) => {
        deleteSetting(key);
    });

    ipcMain.handle("settings:getAll", () => {
        return getAllSettings();
    });

    ipcMain.handle("crosshair:getSettings", () => {
        const preset = getCurrentCrosshair();
        return decodeCrosshair(preset.code);
    });

    ipcMain.handle("crosshair:getPresets", () => {
        return getCrosshairPresets();
    });

    ipcMain.handle("crosshair:setCurrentIndex", (_e, index: number) => {
        setCurrentCrosshairIndex(index);
    });

    ipcMain.handle("crosshair:addPreset", (_e, name: string, code: string) => {
        addCrosshairPreset({ name, code });
        return getCrosshairPresets();
    });

    ipcMain.handle("crosshair:removePreset", (_e, index: number) => {
        removeCrosshairPreset(index);
        return getCrosshairPresets();
    });

    ipcMain.handle("crosshair:updatePreset", (_e, name: string, code: string) => {
        updateCrosshairPreset({ name, code });
        return getCrosshairPresets();
    });
}
