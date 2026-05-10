import type { RowsResponse } from "../api/client";
import type { FilterValue } from "../api/client";

export function formatFilterValue(value: FilterValue) {
  if (value.kind === "null") {
    return "NULL";
  }
  if (value.value === "") {
    return "(empty string)";
  }
  return String(value.value);
}

export function formatFilterSummary(values: FilterValue[]) {
  if (values.length === 0) {
    return "No values";
  }
  if (values.length <= 2) {
    return values.map(formatFilterValue).join(", ");
  }
  return `${values.slice(0, 2).map(formatFilterValue).join(", ")} +${values.length - 2}`;
}

export function formatPagerLabel(rows: RowsResponse | null, offset: number, pageSize: number) {
  if (!rows || rows.total_rows === 0) {
    return "0 rows";
  }
  return `${offset + 1}-${Math.min(offset + pageSize, rows.total_rows)} of ${rows.total_rows}`;
}

export function formatRecentTime(openedAt: number) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return formatter.format(new Date(openedAt));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

