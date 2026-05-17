import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowUp, Filter, WrapText } from "lucide-react";

import type { FilterValue, RowsResponse, SortSpec, ValueFilter } from "../../api/client";
import { ColumnFilterPopover } from "../filters/ColumnFilterPopover";
import type { ColumnFilters } from "../filters/types";
import type { DisplaySettings } from "../settings/types";
import {
  DEFAULT_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  ROW_NUMBER_WIDTH
} from "./constants";
import { estimateDefaultColumnWidth } from "./tableLayout";
import type { ColumnSettingsByName, ColumnVisibility } from "./types";

const EMPTY_COLUMNS: RowsResponse["columns"] = [];
const EMPTY_ROWS: RowsResponse["rows"] = [];

export function DataTable({
  fileId,
  rows,
  offset,
  loading,
  columnOrder,
  visibleColumns,
  columnSettings,
  columnFilters,
  activeFilters,
  displaySettings,
  sortSpec,
  onColumnWidthChange,
  onColumnFilterChange,
  onSortChange,
  onToggleColumnWrap
}: {
  fileId: string | null;
  rows: RowsResponse | null;
  offset: number;
  loading: boolean;
  columnOrder: string[];
  visibleColumns: ColumnVisibility;
  columnSettings: ColumnSettingsByName;
  columnFilters: ColumnFilters;
  activeFilters: ValueFilter[];
  displaySettings: DisplaySettings;
  sortSpec: SortSpec | null;
  onColumnWidthChange: (columnName: string, width: number) => void;
  onColumnFilterChange: (columnName: string, values: FilterValue[]) => void;
  onSortChange: (columnName: string) => void;
  onToggleColumnWrap: (columnName: string) => void;
}) {
  const [filterColumnName, setFilterColumnName] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const rowColumns = rows?.columns ?? EMPTY_COLUMNS;
  const visibleRows = rows?.rows ?? EMPTY_ROWS;
  const hasRows = visibleRows.length > 0;
  const defaultColumnWidths = useMemo(() => {
    return Object.fromEntries(rowColumns.map((column) => [column.name, estimateDefaultColumnWidth(column.name)]));
  }, [rowColumns]);
  const columns = useMemo(() => {
    if (rowColumns.length === 0) {
      return EMPTY_COLUMNS;
    }
    const columnsByName = new Map(rowColumns.map((column) => [column.name, column]));
    const orderedColumnNames = columnOrder.length > 0 ? columnOrder : rowColumns.map((column) => column.name);
    return orderedColumnNames
      .filter((columnName) => visibleColumns[columnName] ?? true)
      .map((columnName) => columnsByName.get(columnName))
      .filter((column): column is RowsResponse["columns"][number] => Boolean(column));
  }, [columnOrder, rowColumns, visibleColumns]);
  const columnNames = useMemo(() => columns.map((column) => column.name), [columns]);

  const totalTableWidth = useMemo(() => {
    return columnNames.reduce(
      (total, columnName) => total + (columnSettings[columnName]?.width ?? defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH),
      ROW_NUMBER_WIDTH
    );
  }, [columnNames, columnSettings, defaultColumnWidths]);

  function handleResizeStart(columnName: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnSettings[columnName]?.width ?? defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH;

    function handlePointerMove(pointerEvent: PointerEvent) {
      pointerEvent.preventDefault();
      onColumnWidthChange(columnName, startWidth + pointerEvent.clientX - startX);
    }

    function stopResize() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, {once: true});
    window.addEventListener("pointercancel", stopResize, {once: true});
  }

  function handleResizeKeyDown(columnName: string, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const step = event.shiftKey ? 40 : 10;
    onColumnWidthChange(
      columnName,
      (columnSettings[columnName]?.width ?? defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH) + direction * step
    );
  }

  useEffect(() => {
    if (!filterColumnName) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!filterMenuRef.current?.contains(event.target as Node)) {
        setFilterColumnName(null);
      }
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setFilterColumnName(null);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [filterColumnName]);

  if (!rows) {
    return <div className="empty-state">Open a CSV file to start browsing.</div>;
  }

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table style={{minWidth: `${totalTableWidth}px`, width: `${totalTableWidth}px`}}>
        <colgroup>
          <col style={{width: `${ROW_NUMBER_WIDTH}px`}} />
          {columnNames.map((columnName) => (
            <col
              key={columnName}
              style={{width: `${columnSettings[columnName]?.width ?? defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH}px`}}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="row-number">#</th>
            {columns.map((column) => (
              <th
                key={column.name}
                aria-sort={
                  sortSpec?.column === column.name
                    ? sortSpec.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <div className="column-header">
                  <button
                    type="button"
                    className={`column-sort-button ${sortSpec?.column === column.name ? "active" : ""}`}
                    aria-label={`Sort by ${column.name}`}
                    title={`Sort by ${column.name}`}
                    onClick={() => onSortChange(column.name)}
                  >
                    <div className="column-header-title">
                      <span>{column.name}</span>
                      <code>{column.dtype}</code>
                    </div>
                    {sortSpec?.column === column.name ? (
                      sortSpec.direction === "asc" ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`icon-button wrap-toggle ${columnSettings[column.name]?.wrap ? "active" : ""}`}
                    aria-label={`${columnSettings[column.name]?.wrap ? "Disable" : "Enable"} wrapping for ${column.name}`}
                    aria-pressed={columnSettings[column.name]?.wrap ?? false}
                    title={`${columnSettings[column.name]?.wrap ? "Disable" : "Enable"} wrapping`}
                    onClick={() => onToggleColumnWrap(column.name)}
                  >
                    <WrapText size={15} />
                  </button>
                  <div className="column-filter-menu" ref={filterColumnName === column.name ? filterMenuRef : null}>
                    <button
                      type="button"
                      className={`icon-button filter-toggle ${columnFilters[column.name]?.length ? "active" : ""}`}
                      aria-label={`Filter ${column.name}`}
                      aria-expanded={filterColumnName === column.name}
                      title={`Filter ${column.name}`}
                      onClick={() => setFilterColumnName((currentColumn) => (currentColumn === column.name ? null : column.name))}
                    >
                      <Filter size={15} />
                    </button>
                    {filterColumnName === column.name && fileId ? (
                      <ColumnFilterPopover
                        fileId={fileId}
                        columnName={column.name}
                        activeFilters={activeFilters}
                        selectedValues={columnFilters[column.name] ?? []}
                        onApply={(values) => {
                          onColumnFilterChange(column.name, values);
                          setFilterColumnName(null);
                        }}
                        onClose={() => setFilterColumnName(null)}
                      />
                    ) : null}
                  </div>
                </div>
                <div
                  role="separator"
                  tabIndex={0}
                  className="column-resizer"
                  aria-label={`Resize ${column.name} column`}
                  aria-orientation="vertical"
                  aria-valuemax={MAX_COLUMN_WIDTH}
                  aria-valuemin={MIN_COLUMN_WIDTH}
                  aria-valuenow={columnSettings[column.name]?.width ?? defaultColumnWidths[column.name] ?? DEFAULT_COLUMN_WIDTH}
                  title="Resize column"
                  onPointerDown={(event) => handleResizeStart(column.name, event)}
                  onKeyDown={(event) => handleResizeKeyDown(column.name, event)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.length === 0 ? (
            <tr>
              <td colSpan={1} className="empty-cell">
                No visible columns selected.
              </td>
            </tr>
          ) : hasRows ? (
            visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="row-number">{offset + rowIndex + 1}</td>
                {columnNames.map((columnName) => {
                  const wraps = columnSettings[columnName]?.wrap ?? false;
                  const cellClassName = [
                    wraps ? "cell-wrap" : null,
                    displaySettings.showCellNewlines ? "cell-preserve-newlines" : null
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td className={cellClassName || undefined} key={columnName}>
                      {formatCell(row[columnName])}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + 1} className="empty-cell">
                No rows in this range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <span className="null-cell">NULL</span>;
  }
  return String(value);
}
