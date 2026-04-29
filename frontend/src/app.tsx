import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  FileUp,
  FolderOpen,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  TableProperties,
  WrapText
} from "lucide-react";

import {
  FileOpenResponse,
  MetadataResponse,
  RowsResponse,
  getMetadata,
  getRows,
  openPath,
  uploadCsv
} from "./api/client";

const PAGE_SIZE = 100;
const ROW_NUMBER_WIDTH = 72;
const DEFAULT_COLUMN_WIDTH = 180;
const DEFAULT_MAX_COLUMN_WIDTH = 280;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 720;

type ColumnSettings = {
  width: number;
  wrap: boolean;
};

type ColumnVisibility = Record<string, boolean>;
type ColumnSettingsByName = Record<string, ColumnSettings>;

type TableLayout = {
  columnOrder: string[];
  visibleColumns: ColumnVisibility;
  columnSettings: ColumnSettingsByName;
};

const EMPTY_COLUMNS: RowsResponse["columns"] = [];
const EMPTY_ROWS: RowsResponse["rows"] = [];
const LAYOUT_STORAGE_PREFIX = "csvista:table-layout:v1:";

export function App() {
  const [currentFile, setCurrentFile] = useState<FileOpenResponse | null>(null);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [rows, setRows] = useState<RowsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [layoutIdentityHint, setLayoutIdentityHint] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>({});
  const [columnSettings, setColumnSettings] = useState<ColumnSettingsByName>({});
  const [layoutReady, setLayoutReady] = useState(false);
  const loading = opening || rowsLoading;
  const layoutStorageKey = useMemo(
    () => (metadata ? layoutStorageKeyForMetadata(metadata, layoutIdentityHint) : null),
    [layoutIdentityHint, metadata]
  );

  const loadFile = useCallback(async (file: FileOpenResponse, nextLayoutIdentityHint?: string) => {
    setOpening(true);
    setError(null);
    setMetadata(null);
    setRows(null);
    setOffset(0);
    if (nextLayoutIdentityHint !== undefined) {
      setLayoutIdentityHint(nextLayoutIdentityHint);
    }
    try {
      const nextMetadata = await getMetadata(file.file_id);
      setCurrentFile(file);
      setMetadata(nextMetadata);
    } catch (err) {
      setCurrentFile(null);
      setError(err instanceof Error ? err.message : "Failed to load file.");
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    if (!currentFile) {
      return;
    }
    let cancelled = false;
    setRowsLoading(true);
    setError(null);
    getRows(currentFile.file_id, offset, PAGE_SIZE)
      .then((nextRows) => {
        if (!cancelled) {
          setRows(nextRows);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load rows.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRowsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentFile, offset]);

  useEffect(() => {
    if (!metadata) {
      setColumnOrder([]);
      setVisibleColumns({});
      setColumnSettings({});
      setLayoutReady(false);
      return;
    }

    const storedLayout = loadStoredLayout(metadata, layoutIdentityHint);
    const nextLayout = storedLayout ? mergeLayoutWithMetadata(storedLayout, metadata) : createDefaultLayout(metadata);
    setColumnOrder(nextLayout.columnOrder);
    setVisibleColumns(nextLayout.visibleColumns);
    setColumnSettings(nextLayout.columnSettings);
    setLayoutReady(true);
  }, [layoutIdentityHint, metadata]);

  useEffect(() => {
    if (!metadata || !layoutReady || !layoutStorageKey) {
      return;
    }

    storeLayout(layoutStorageKey, {
      columnOrder,
      visibleColumns,
      columnSettings
    });
  }, [columnOrder, columnSettings, layoutReady, layoutStorageKey, metadata, visibleColumns]);

  async function handleOpenPath() {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      return;
    }
    setOpening(true);
    setError(null);
    try {
      await loadFile(await openPath(trimmedPath), `path:${trimmedPath}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open path.");
    } finally {
      setOpening(false);
    }
  }

  async function handleUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    setOpening(true);
    setError(null);
    try {
      await loadFile(await uploadCsv(file), `upload:${file.name}:${file.size}:${file.lastModified}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setOpening(false);
    }
  }

  function toggleColumnVisibility(columnName: string) {
    setVisibleColumns((currentVisibility) => ({
      ...currentVisibility,
      [columnName]: !(currentVisibility[columnName] ?? true)
    }));
  }

  function moveColumn(draggedColumnName: string, targetColumnName: string, placement: "before" | "after") {
    if (draggedColumnName === targetColumnName) {
      return;
    }
    setColumnOrder((currentOrder) => {
      const nextOrder = currentOrder.filter((columnName) => columnName !== draggedColumnName);
      const targetIndex = nextOrder.indexOf(targetColumnName);
      if (targetIndex === -1) {
        return currentOrder;
      }
      nextOrder.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, draggedColumnName);
      return nextOrder;
    });
  }

  function resetLayout() {
    if (!metadata || !window.confirm("Reset this file's column layout?")) {
      return;
    }
    const defaultLayout = createDefaultLayout(metadata);
    removeStoredLayout(layoutStorageKey);
    setColumnOrder(defaultLayout.columnOrder);
    setVisibleColumns(defaultLayout.visibleColumns);
    setColumnSettings(defaultLayout.columnSettings);
  }

  function setColumnWidth(columnName: string, width: number) {
    setColumnSettings((currentSettings) => ({
      ...currentSettings,
      [columnName]: {
        width: clampColumnWidth(width),
        wrap: currentSettings[columnName]?.wrap ?? false
      }
    }));
  }

  function toggleColumnWrap(columnName: string) {
    setColumnSettings((currentSettings) => {
      const currentColumnSettings = currentSettings[columnName] ?? {
        width: estimateDefaultColumnWidth(columnName),
        wrap: false
      };
      return {
        ...currentSettings,
        [columnName]: {
          ...currentColumnSettings,
          wrap: !currentColumnSettings.wrap
        }
      };
    });
  }

  const canGoPrevious = offset > 0;
  const canGoNext = rows ? offset + PAGE_SIZE < rows.total_rows : false;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>CSVista</h1>
          <p>Local CSV browser</p>
        </div>
        <div className="status-pill">
          <TableProperties size={16} />
          {metadata ? `${metadata.total_rows} rows / ${metadata.total_columns} columns` : "No file open"}
        </div>
      </section>

      <section className="open-panel">
        <label className="upload-button">
          <FileUp size={18} />
          Upload CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
        </label>

        <div className="path-open">
          <FolderOpen size={18} />
          <input
            value={path}
            placeholder="/path/inside/allowed/directory.csv"
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleOpenPath();
              }
            }}
          />
          <button type="button" onClick={() => void handleOpenPath()}>
            Open
          </button>
        </div>
      </section>

      {error ? <section className="error-panel">{error}</section> : null}

      <section className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar" aria-label="Column controls">
          <div className="sidebar-header">
            <h2>{metadata?.name ?? "Columns"}</h2>
            <div className="sidebar-actions">
              {metadata ? (
                <button type="button" className="icon-button" title="Reset layout" aria-label="Reset column layout" onClick={resetLayout}>
                  <RotateCcw size={15} />
                </button>
              ) : null}
              <button
                type="button"
                className="icon-button"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={sidebarCollapsed ? "Expand column controls" : "Collapse column controls"}
                aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </button>
            </div>
          </div>
          <div className="sidebar-content" hidden={sidebarCollapsed}>
            {metadata ? (
              <MetadataSummary
                metadata={metadata}
                columnOrder={columnOrder}
                visibleColumns={visibleColumns}
                onMoveColumn={moveColumn}
                onToggleColumn={toggleColumnVisibility}
              />
            ) : (
              <p className="muted">Open a CSV to inspect columns.</p>
            )}
          </div>
        </aside>

        <section className="table-zone">
          <div className="table-toolbar">
            <div>{currentFile ? currentFile.name : "No active file"}</div>
            <button
              type="button"
              onClick={() => currentFile && void loadFile(currentFile)}
              disabled={!currentFile || loading}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          <DataTable
            rows={rows}
            offset={offset}
            loading={loading}
            columnOrder={columnOrder}
            visibleColumns={visibleColumns}
            columnSettings={columnSettings}
            onColumnWidthChange={setColumnWidth}
            onToggleColumnWrap={toggleColumnWrap}
          />

          <div className="pager">
            <button type="button" disabled={!canGoPrevious} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </button>
            <span>
              {rows ? `${offset + 1}-${Math.min(offset + PAGE_SIZE, rows.total_rows)} of ${rows.total_rows}` : "0 rows"}
            </span>
            <button type="button" disabled={!canGoNext} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

function MetadataSummary({
  metadata,
  columnOrder,
  visibleColumns,
  onMoveColumn,
  onToggleColumn
}: {
  metadata: MetadataResponse;
  columnOrder: string[];
  visibleColumns: ColumnVisibility;
  onMoveColumn: (draggedColumnName: string, targetColumnName: string, placement: "before" | "after") => void;
  onToggleColumn: (columnName: string) => void;
}) {
  const [draggedColumnName, setDraggedColumnName] = useState<string | null>(null);
  const columnsByName = useMemo(() => {
    return new Map(metadata.columns.map((column) => [column.name, column]));
  }, [metadata.columns]);
  const orderedColumns = useMemo(() => {
    const orderedColumnNames = columnOrder.length > 0 ? columnOrder : metadata.columns.map((column) => column.name);
    return orderedColumnNames
      .map((columnName) => columnsByName.get(columnName))
      .filter((column): column is MetadataResponse["columns"][number] => Boolean(column));
  }, [columnOrder, columnsByName, metadata.columns]);

  function handleDragStart(columnName: string, event: DragEvent<HTMLDivElement>) {
    setDraggedColumnName(columnName);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnName);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(targetColumnName: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const sourceColumnName = draggedColumnName ?? event.dataTransfer.getData("text/plain");
    if (sourceColumnName) {
      const rect = event.currentTarget.getBoundingClientRect();
      const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
      onMoveColumn(sourceColumnName, targetColumnName, placement);
    }
    setDraggedColumnName(null);
  }

  return (
    <div className="column-list">
      <div className="metric">
        <span>Size</span>
        <strong>{formatBytes(metadata.size_bytes)}</strong>
      </div>
      {orderedColumns.map((column) => (
        <div
          className={`column-item ${visibleColumns[column.name] ?? true ? "" : "hidden-column"} ${
            draggedColumnName === column.name ? "dragging" : ""
          }`}
          draggable
          key={column.name}
          onDragEnd={() => setDraggedColumnName(null)}
          onDragOver={handleDragOver}
          onDragStart={(event) => handleDragStart(column.name, event)}
          onDrop={(event) => handleDrop(column.name, event)}
        >
          <GripVertical className="column-drag-icon" size={16} aria-hidden="true" />
          <label className="column-visibility">
            <input
              type="checkbox"
              checked={visibleColumns[column.name] ?? true}
              onChange={() => onToggleColumn(column.name)}
            />
            <span title={column.name}>{column.name}</span>
          </label>
          <code>{column.dtype}</code>
        </div>
      ))}
    </div>
  );
}

function DataTable({
  rows,
  offset,
  loading,
  columnOrder,
  visibleColumns,
  columnSettings,
  onColumnWidthChange,
  onToggleColumnWrap
}: {
  rows: RowsResponse | null;
  offset: number;
  loading: boolean;
  columnOrder: string[];
  visibleColumns: ColumnVisibility;
  columnSettings: ColumnSettingsByName;
  onColumnWidthChange: (columnName: string, width: number) => void;
  onToggleColumnWrap: (columnName: string) => void;
}) {
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
              <th key={column.name}>
                <div className="column-header">
                  <div className="column-header-title">
                    <span>{column.name}</span>
                    <code>{column.dtype}</code>
                  </div>
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
                  return (
                    <td className={wraps ? "cell-wrap" : undefined} key={columnName}>
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

function estimateDefaultColumnWidth(columnName: string) {
  const headerWidth = columnName.length * 9 + 72;
  return Math.min(DEFAULT_MAX_COLUMN_WIDTH, clampColumnWidth(Math.max(DEFAULT_COLUMN_WIDTH, headerWidth)));
}

function createDefaultLayout(metadata: MetadataResponse): TableLayout {
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

function mergeLayoutWithMetadata(layout: TableLayout, metadata: MetadataResponse): TableLayout {
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

function sanitizeColumnSettings(settings: ColumnSettings | undefined, columnName: string): ColumnSettings {
  return {
    width: clampColumnWidth(settings?.width ?? estimateDefaultColumnWidth(columnName)),
    wrap: settings?.wrap ?? false
  };
}

function layoutStorageKeyForMetadata(metadata: MetadataResponse, identityHint: string | null) {
  const fingerprint = JSON.stringify({
    identityHint,
    name: metadata.name,
    source: metadata.source,
    sizeBytes: metadata.size_bytes,
    totalRows: metadata.total_rows,
    columns: metadata.columns.map((column) => [column.name, column.dtype])
  });
  return `${LAYOUT_STORAGE_PREFIX}${hashString(fingerprint)}`;
}

function loadStoredLayout(metadata: MetadataResponse, identityHint: string | null): TableLayout | null {
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

function storeLayout(storageKey: string, layout: TableLayout) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Browsing should continue if storage is unavailable or full.
  }
}

function removeStoredLayout(storageKey: string | null) {
  if (!storageKey) {
    return;
  }
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Browsing should continue if storage is unavailable.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueColumnNames(columnNames: string[]) {
  return columnNames.filter((columnName, index) => columnNames.indexOf(columnName) === index);
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function clampColumnWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <span className="null-cell">NULL</span>;
  }
  return String(value);
}

function formatBytes(bytes: number) {
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
