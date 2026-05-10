import { isRecord } from "../../lib/guards";
import type { RecentFile } from "./types";

export const MAX_RECENT_FILES = 8;

const RECENT_FILES_STORAGE_KEY = "csvista:recent-files:v1";

export function loadRecentFiles(): RecentFile[] {
  try {
    const rawRecentFiles = localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    if (!rawRecentFiles) {
      return [];
    }
    const parsed = JSON.parse(rawRecentFiles);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isRecentFile)
      .sort((left, right) => right.openedAt - left.openedAt)
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}

export function storeRecentFiles(recentFiles: RecentFile[]) {
  try {
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(recentFiles));
  } catch {
    // Recent files are a convenience and should not block opening CSVs.
  }
}

function isRecentFile(value: unknown): value is RecentFile {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.path === "string" && typeof value.name === "string" && typeof value.openedAt === "number";
}

