import { isRecord } from "../../lib/guards";
import type { DisplaySettings } from "./types";

const DISPLAY_SETTINGS_STORAGE_KEY = "csvista:display-settings:v1";

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showCellNewlines: false
};

export function loadDisplaySettings(): DisplaySettings {
  try {
    const rawSettings = localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY);
    if (!rawSettings) {
      return DEFAULT_DISPLAY_SETTINGS;
    }
    const parsed = JSON.parse(rawSettings);
    if (!isRecord(parsed)) {
      return DEFAULT_DISPLAY_SETTINGS;
    }
    return {
      showCellNewlines:
        typeof parsed.showCellNewlines === "boolean"
          ? parsed.showCellNewlines
          : DEFAULT_DISPLAY_SETTINGS.showCellNewlines
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export function storeDisplaySettings(settings: DisplaySettings) {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Browsing should continue if storage is unavailable or full.
  }
}

