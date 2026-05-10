import type { MetadataResponse } from "../../api/client";
import { isRecord } from "../../lib/guards";
import { DEFAULT_COLUMN_WIDTH } from "./constants";
import { layoutStorageKeyForMetadata } from "./tableLayout";
import type { ColumnSettings, TableLayout } from "./types";

export function loadStoredLayout(metadata: MetadataResponse, identityHint: string | null): TableLayout | null {
  try {
    const rawLayout = localStorage.getItem(layoutStorageKeyForMetadata(metadata, identityHint));
    if (!rawLayout) {
      return null;
    }
    return parseStoredLayout(JSON.parse(rawLayout));
  } catch {
    return null;
  }
}

export function storeLayout(storageKey: string, layout: TableLayout) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Browsing should continue if storage is unavailable or full.
  }
}

export function removeStoredLayout(storageKey: string | null) {
  if (!storageKey) {
    return;
  }
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Browsing should continue if storage is unavailable.
  }
}

function parseStoredLayout(value: unknown): TableLayout | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const layout = value as Partial<TableLayout>;
  if (!Array.isArray(layout.columnOrder) || !isRecord(layout.visibleColumns) || !isRecord(layout.columnSettings)) {
    return null;
  }

  return {
    columnOrder: layout.columnOrder.filter((columnName): columnName is string => typeof columnName === "string"),
    visibleColumns: Object.fromEntries(
      Object.entries(layout.visibleColumns).filter(
        (entry): entry is [string, boolean] => typeof entry[0] === "string" && typeof entry[1] === "boolean"
      )
    ),
    columnSettings: Object.fromEntries(
      Object.entries(layout.columnSettings)
        .map(([columnName, settings]) => {
          if (!isRecord(settings)) {
            return null;
          }
          return [
            columnName,
            {
              width: typeof settings.width === "number" ? settings.width : DEFAULT_COLUMN_WIDTH,
              wrap: typeof settings.wrap === "boolean" ? settings.wrap : false
            }
          ] as const;
        })
        .filter((entry): entry is readonly [string, ColumnSettings] => Boolean(entry))
    )
  };
}

