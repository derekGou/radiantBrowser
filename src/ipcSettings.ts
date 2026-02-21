import { ipcMain } from "electron";
import {
    setSetting,
    getSetting,
    deleteSetting,
    getAllSettings
} from "./settingsDB";

export function registerSettingsIPC() {
    ipcMain.handle("settings:get", (_e, key, defaultValue) => {
        return getSetting(key, defaultValue);
    });

    ipcMain.handle("settings:set", (_e, key, value) => {
        setSetting(key, value);
        ipcMain.emit('settings:updated', undefined, key, value);
    });

    ipcMain.handle("settings:delete", (_e, key) => {
        deleteSetting(key);
    });

    ipcMain.handle("settings:getAll", () => {
        return getAllSettings();
    });
}
