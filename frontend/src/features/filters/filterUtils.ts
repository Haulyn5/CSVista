import type { FilterValue, ValueFilter } from "../../api/client";
import type { ColumnFilters } from "./types";

export function mergeFiltersWithMetadata(filters: ColumnFilters, metadata: {columns: {name: string}[]}): ColumnFilters {
  const columnNameSet = new Set(metadata.columns.map((column) => column.name));
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([columnName, values]) => columnNameSet.has(columnName) && values.length > 0)
      .map(([columnName, values]) => [columnName, uniqueFilterValues(values)])
  );
}

export function columnFiltersToValueFilters(filters: ColumnFilters): ValueFilter[] {
  return Object.entries(filters)
    .filter(([, values]) => values.length > 0)
    .map(([column, values]) => ({column, values}));
}

export function uniqueFilterValues(values: FilterValue[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = filterValueKey(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function filterValueKey(value: FilterValue) {
  return JSON.stringify(value);
}

