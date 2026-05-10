import type { MetadataResponse } from "../../api/client";
import { metadataFingerprint } from "../../lib/metadataFingerprint";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_MAX_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH
} from "./constants";
import type { ColumnSettings, TableLayout } from "./types";

export const LAYOUT_STORAGE_PREFIX = "csvista:table-layout:v1:";

export function estimateDefaultColumnWidth(columnName: string) {
  const headerWidth = columnName.length * 9 + 72;
  return Math.min(DEFAULT_MAX_COLUMN_WIDTH, clampColumnWidth(Math.max(DEFAULT_COLUMN_WIDTH, headerWidth)));
}

export function createDefaultLayout(metadata: MetadataResponse): TableLayout {
  const columnNames = metadata.columns.map((column) => column.name);
  return {
    columnOrder: columnNames,
    visibleColumns: Object.fromEntries(columnNames.map((columnName) => [columnName, true])),
    columnSettings: Object.fromEntries(
      columnNames.map((columnName) => [
        columnName,
        {
          width: estimateDefaultColumnWidth(columnName),
          wrap: false
        }
      ])
    )
  };
}

export function mergeLayoutWithMetadata(layout: TableLayout, metadata: MetadataResponse): TableLayout {
  const columnNames = metadata.columns.map((column) => column.name);
  const columnNameSet = new Set(columnNames);
  const preservedOrder = uniqueColumnNames(layout.columnOrder.filter((columnName) => columnNameSet.has(columnName)));
  const addedColumns = columnNames.filter((columnName) => !preservedOrder.includes(columnName));

  return {
    columnOrder: [...preservedOrder, ...addedColumns],
    visibleColumns: Object.fromEntries(
      columnNames.map((columnName) => [columnName, layout.visibleColumns[columnName] ?? true])
    ),
    columnSettings: Object.fromEntries(
      columnNames.map((columnName) => [
        columnName,
        sanitizeColumnSettings(layout.columnSettings[columnName], columnName)
      ])
    )
  };
}

export function layoutStorageKeyForMetadata(metadata: MetadataResponse, identityHint: string | null) {
  return `${LAYOUT_STORAGE_PREFIX}${metadataFingerprint(metadata, identityHint)}`;
}

export function clampColumnWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

function sanitizeColumnSettings(settings: ColumnSettings | undefined, columnName: string): ColumnSettings {
  return {
    width: clampColumnWidth(settings?.width ?? estimateDefaultColumnWidth(columnName)),
    wrap: settings?.wrap ?? false
  };
}

function uniqueColumnNames(columnNames: string[]) {
  return columnNames.filter((columnName, index) => columnNames.indexOf(columnName) === index);
}
