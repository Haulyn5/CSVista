import type { MetadataResponse, FilterValue } from "../../api/client";
import { isRecord } from "../../lib/guards";
import { metadataFingerprint } from "../../lib/metadataFingerprint";
import type { ColumnFilters } from "./types";
import { uniqueFilterValues } from "./filterUtils";

export const FILTER_STORAGE_PREFIX = "csvista:table-filters:v1:";

export function filterStorageKeyForMetadata(metadata: MetadataResponse, identityHint: string | null) {
  return `${FILTER_STORAGE_PREFIX}${metadataFingerprint(metadata, identityHint)}`;
}

export function loadStoredFilters(metadata: MetadataResponse, identityHint: string | null): ColumnFilters | null {
  try {
    const rawFilters = localStorage.getItem(filterStorageKeyForMetadata(metadata, identityHint));
    if (!rawFilters) {
      return null;
    }
    return parseStoredFilters(JSON.parse(rawFilters));
  } catch {
    return null;
  }
}

export function storeFilters(storageKey: string, filters: ColumnFilters) {
  try {
    if (Object.keys(filters).length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    // Browsing should continue if storage is unavailable or full.
  }
}

function parseStoredFilters(value: unknown): ColumnFilters | null {
  if (!isRecord(value)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([columnName, values]) => {
        if (!Array.isArray(values)) {
          return null;
        }
        const parsedValues = values.map(parseFilterValue).filter((filterValue): filterValue is FilterValue => Boolean(filterValue));
        return parsedValues.length > 0 ? ([columnName, uniqueFilterValues(parsedValues)] as const) : null;
      })
      .filter((entry): entry is readonly [string, FilterValue[]] => Boolean(entry))
  );
}

function parseFilterValue(value: unknown): FilterValue | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return null;
  }
  if (value.kind === "null") {
    return {kind: "null"};
  }
  if (value.kind === "value") {
    return {kind: "value", value: value.value};
  }
  return null;
}
