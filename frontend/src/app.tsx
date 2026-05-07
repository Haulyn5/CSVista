import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDown,
  Clock,
  FileUp,
  Filter,
  FolderOpen,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  TableProperties,
  WrapText,
  X
} from "lucide-react";

import {
  FilterValue,
  FileOpenResponse,
  MetadataResponse,
  RowsResponse,
  ValueFilter,
  ValueOption,
  getMetadata,
  getRows,
  openPath,
  queryColumnValues,
  queryRows,
  uploadCsv
} from "./api/client";

const PAGE_SIZE = 100;
const ROW_NUMBER_WIDTH = 72;
const DEFAULT_COLUMN_WIDTH = 180;
const DEFAULT_MAX_COLUMN_WIDTH = 280;
const MIN_COLUMN_WIDTH = 80;
const MAX_COLUMN_WIDTH = 720;
const VALUE_OPTIONS_PAGE_SIZE = 100;

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

type DisplaySettings = {
  showCellNewlines: boolean;
};

type ColumnFilters = Record<string, FilterValue[]>;

type RecentFile = {
  path: string;
  name: string;
  openedAt: number;
};

const EMPTY_COLUMNS: RowsResponse["columns"] = [];
const EMPTY_ROWS: RowsResponse["rows"] = [];
const LAYOUT_STORAGE_PREFIX = "csvista:table-layout:v1:";
const FILTER_STORAGE_PREFIX = "csvista:table-filters:v1:";
const DISPLAY_SETTINGS_STORAGE_KEY = "csvista:display-settings:v1";
const RECENT_FILES_STORAGE_KEY = "csvista:recent-files:v1";
const MAX_RECENT_FILES = 8;
const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showCellNewlines: false
};

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadRecentFiles());
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => loadDisplaySettings());
  const recentMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const [layoutIdentityHint, setLayoutIdentityHint] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>({});
  const [columnSettings, setColumnSettings] = useState<ColumnSettingsByName>({});
  const [layoutReady, setLayoutReady] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [filtersReady, setFiltersReady] = useState(false);
  const [restoredFiltersNotice, setRestoredFiltersNotice] = useState(false);
  const loading = opening || rowsLoading;
  const layoutStorageKey = useMemo(
    () => (metadata ? layoutStorageKeyForMetadata(metadata, layoutIdentityHint) : null),
    [layoutIdentityHint, metadata]
  );
  const filterStorageKey = useMemo(
    () => (metadata ? filterStorageKeyForMetadata(metadata, layoutIdentityHint) : null),
    [layoutIdentityHint, metadata]
  );
  const activeFilters = useMemo(() => columnFiltersToValueFilters(columnFilters), [columnFilters]);
  const hasActiveFilters = activeFilters.length > 0;

  const loadFile = useCallback(async (file: FileOpenResponse, nextLayoutIdentityHint?: string) => {
    setOpening(true);
    setError(null);
    setMetadata(null);
    setRows(null);
    setColumnFilters({});
    setFiltersReady(false);
    setRestoredFiltersNotice(false);
    setOffset(0);
    if (nextLayoutIdentityHint !== undefined) {
      setLayoutIdentityHint(nextLayoutIdentityHint);
    }
    try {
      const nextMetadata = await getMetadata(file.file_id);
      setCurrentFile(file);
      setMetadata(nextMetadata);
      return true;
    } catch (err) {
      setCurrentFile(null);
      setError(err instanceof Error ? err.message : "Failed to load file.");
      return false;
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    if (!currentFile || !metadata || !filtersReady) {
      return;
    }
    let cancelled = false;
    setRowsLoading(true);
    setError(null);
    const rowsRequest = hasActiveFilters
      ? queryRows(currentFile.file_id, {offset, limit: PAGE_SIZE, filters: activeFilters})
      : getRows(currentFile.file_id, offset, PAGE_SIZE);
    rowsRequest
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
  }, [activeFilters, currentFile, filtersReady, hasActiveFilters, metadata, offset]);

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
    if (!metadata) {
      setColumnFilters({});
      setFiltersReady(false);
      setRestoredFiltersNotice(false);
      return;
    }

    const storedFilters = loadStoredFilters(metadata, layoutIdentityHint);
    const nextFilters = storedFilters ? mergeFiltersWithMetadata(storedFilters, metadata) : {};
    setColumnFilters(nextFilters);
    setFiltersReady(true);
    setRestoredFiltersNotice(Object.keys(nextFilters).length > 0);
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

  useEffect(() => {
    if (!metadata || !filtersReady || !filterStorageKey) {
      return;
    }

    storeFilters(filterStorageKey, columnFilters);
  }, [columnFilters, filterStorageKey, filtersReady, metadata]);

  useEffect(() => {
    if (!recentMenuOpen) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!recentMenuRef.current?.contains(event.target as Node)) {
        setRecentMenuOpen(false);
      }
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setRecentMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [recentMenuOpen]);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [settingsOpen]);

  async function handleOpenPath() {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      return;
    }
    setOpening(true);
    setError(null);
    try {
      const openedFile = await openPath(trimmedPath);
      if (await loadFile(openedFile, `path:${trimmedPath}`)) {
        rememberRecentFile(trimmedPath, openedFile.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open path.");
    } finally {
      setOpening(false);
    }
  }

  async function handleOpenRecent(recentFile: RecentFile) {
    setRecentMenuOpen(false);
    setPath(recentFile.path);
    setOpening(true);
    setError(null);
    try {
      const openedFile = await openPath(recentFile.path);
      if (await loadFile(openedFile, `path:${recentFile.path}`)) {
        rememberRecentFile(recentFile.path, openedFile.name);
      } else {
        removeRecentFile(recentFile.path);
      }
    } catch (err) {
      removeRecentFile(recentFile.path);
      setError(err instanceof Error ? err.message : "Failed to open recent file.");
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

  function rememberRecentFile(recentPath: string, name: string) {
    setRecentFiles((currentFiles) => {
      const nextFiles = [
        {
          path: recentPath,
          name,
          openedAt: Date.now()
        },
        ...currentFiles.filter((recentFile) => recentFile.path !== recentPath)
      ].slice(0, MAX_RECENT_FILES);
      storeRecentFiles(nextFiles);
      return nextFiles;
    });
  }

  function removeRecentFile(recentPath: string) {
    setRecentFiles((currentFiles) => {
      const nextFiles = currentFiles.filter((recentFile) => recentFile.path !== recentPath);
      storeRecentFiles(nextFiles);
      return nextFiles;
    });
  }

  function clearRecentFiles() {
    setRecentFiles([]);
    storeRecentFiles([]);
  }

  function setColumnFilter(columnName: string, values: FilterValue[]) {
    setColumnFilters((currentFilters) => {
      const nextFilters = {...currentFilters};
      if (values.length > 0) {
        nextFilters[columnName] = values;
      } else {
        delete nextFilters[columnName];
      }
      return nextFilters;
    });
    setRestoredFiltersNotice(false);
    setOffset(0);
  }

  function clearAllFilters() {
    setColumnFilters({});
    setRestoredFiltersNotice(false);
    setOffset(0);
  }

  function updateDisplaySettings(nextSettings: DisplaySettings) {
    setDisplaySettings(nextSettings);
    storeDisplaySettings(nextSettings);
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

        <div className="recent-menu" ref={recentMenuRef}>
          <button
            type="button"
            className="secondary-button recent-button"
            aria-expanded={recentMenuOpen}
            aria-haspopup="menu"
            onClick={() => setRecentMenuOpen((open) => !open)}
          >
            <Clock size={18} />
            Recent
            <ChevronDown size={16} />
          </button>
          {recentMenuOpen ? (
            <div className="recent-popover" role="menu">
              {recentFiles.length > 0 ? (
                <>
                  {recentFiles.map((recentFile) => (
                    <button
                      type="button"
                      className="recent-item"
                      key={recentFile.path}
                      role="menuitem"
                      onClick={() => void handleOpenRecent(recentFile)}
                    >
                      <span className="recent-name">{recentFile.name}</span>
                      <span className="recent-path">{recentFile.path}</span>
                      <span className="recent-time">{formatRecentTime(recentFile.openedAt)}</span>
                    </button>
                  ))}
                  <div className="recent-actions">
                    <button type="button" className="recent-clear" role="menuitem" onClick={clearRecentFiles}>
                      Clear recent files
                    </button>
                  </div>
                </>
              ) : (
                <div className="recent-empty" role="menuitem">
                  No recent files
                </div>
              )}
            </div>
          ) : null}
        </div>

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
            <div className="table-actions">
              <div className="settings-menu" ref={settingsMenuRef}>
                <button
                  type="button"
                  className="secondary-button settings-button"
                  aria-controls="table-display-settings"
                  aria-expanded={settingsOpen}
                  aria-haspopup="true"
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <Settings2 size={16} />
                  Settings
                </button>
                {settingsOpen ? (
                  <div className="settings-popover" id="table-display-settings" role="group" aria-label="Table display settings">
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={displaySettings.showCellNewlines}
                        onChange={(event) =>
                          updateDisplaySettings({
                            ...displaySettings,
                            showCellNewlines: event.target.checked
                          })
                        }
                      />
                      <span>
                        <strong>Show cell line breaks</strong>
                        <small>Render newline characters inside cell values.</small>
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => currentFile && void loadFile(currentFile)}
                disabled={!currentFile || loading}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>

          {restoredFiltersNotice ? (
            <div className="filter-notice" role="status">
              <span>This file has restored filters.</span>
              <button type="button" className="secondary-button compact-button" onClick={clearAllFilters}>
                Clear all filters
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss restored filters notice"
                title="Dismiss"
                onClick={() => setRestoredFiltersNotice(false)}
              >
                <X size={15} />
              </button>
            </div>
          ) : null}

          {hasActiveFilters ? (
            <div className="filter-bar" aria-label="Active filters">
              {activeFilters.map((filterItem) => (
                <span className="filter-chip" key={filterItem.column}>
                  <strong>{filterItem.column}</strong>
                  <span>{formatFilterSummary(filterItem.values)}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Clear filter for ${filterItem.column}`}
                    title={`Clear filter for ${filterItem.column}`}
                    onClick={() => setColumnFilter(filterItem.column, [])}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              <button type="button" className="secondary-button compact-button" onClick={clearAllFilters}>
                Clear all
              </button>
            </div>
          ) : null}

          <DataTable
            fileId={currentFile?.file_id ?? null}
            rows={rows}
            offset={offset}
            loading={loading}
            columnOrder={columnOrder}
            visibleColumns={visibleColumns}
            columnSettings={columnSettings}
            columnFilters={columnFilters}
            activeFilters={activeFilters}
            displaySettings={displaySettings}
            onColumnWidthChange={setColumnWidth}
            onColumnFilterChange={setColumnFilter}
            onToggleColumnWrap={toggleColumnWrap}
          />

          <div className="pager">
            <button type="button" disabled={!canGoPrevious} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </button>
            <span>{formatPagerLabel(rows, offset, PAGE_SIZE)}</span>
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
  onColumnWidthChange,
  onColumnFilterChange,
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
  onColumnWidthChange: (columnName: string, width: number) => void;
  onColumnFilterChange: (columnName: string, values: FilterValue[]) => void;
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

function ColumnFilterPopover({
  fileId,
  columnName,
  activeFilters,
  selectedValues,
  onApply,
  onClose
}: {
  fileId: string;
  columnName: string;
  activeFilters: ValueFilter[];
  selectedValues: FilterValue[];
  onApply: (values: FilterValue[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<ValueOption[]>([]);
  const [totalValues, setTotalValues] = useState(0);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<FilterValue[]>(selectedValues);
  const draftKeys = useMemo(() => new Set(draftValues.map(filterValueKey)), [draftValues]);
  const hasMore = options.length < totalValues;

  useEffect(() => {
    setDraftValues(selectedValues);
  }, [selectedValues]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    setOptionError(null);
    queryColumnValues(fileId, {
      column: columnName,
      search,
      offset: 0,
      limit: VALUE_OPTIONS_PAGE_SIZE,
      filters: activeFilters
    })
      .then((response) => {
        if (!cancelled) {
          setOptions(response.values);
          setTotalValues(response.total_values);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOptionError(err instanceof Error ? err.message : "Failed to load filter values.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFilters, columnName, fileId, search]);

  function loadMore() {
    setLoadingOptions(true);
    setOptionError(null);
    queryColumnValues(fileId, {
      column: columnName,
      search,
      offset: options.length,
      limit: VALUE_OPTIONS_PAGE_SIZE,
      filters: activeFilters
    })
      .then((response) => {
        setOptions((currentOptions) => [...currentOptions, ...response.values]);
        setTotalValues(response.total_values);
      })
      .catch((err) => {
        setOptionError(err instanceof Error ? err.message : "Failed to load filter values.");
      })
      .finally(() => setLoadingOptions(false));
  }

  function toggleValue(value: FilterValue) {
    const key = filterValueKey(value);
    setDraftValues((currentValues) =>
      currentValues.some((currentValue) => filterValueKey(currentValue) === key)
        ? currentValues.filter((currentValue) => filterValueKey(currentValue) !== key)
        : [...currentValues, value]
    );
  }

  return (
    <div className="filter-popover" role="group" aria-label={`Filter ${columnName}`}>
      <div className="filter-search">
        <Search size={15} />
        <input
          autoFocus
          value={search}
          placeholder="Search values"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="filter-options" aria-busy={loadingOptions}>
        {optionError ? <div className="filter-message">{optionError}</div> : null}
        {!optionError && options.length === 0 && !loadingOptions ? (
          <div className="filter-message">No values found.</div>
        ) : null}
        {options.map((option) => {
          const key = filterValueKey(option.value);
          return (
            <label className="filter-option" key={key}>
              <input type="checkbox" checked={draftKeys.has(key)} onChange={() => toggleValue(option.value)} />
              <span title={option.display}>{option.display}</span>
              <strong>{option.count}</strong>
            </label>
          );
        })}
        {loadingOptions ? <div className="filter-message">Loading values...</div> : null}
      </div>
      {hasMore ? (
        <button type="button" className="secondary-button filter-load-more" disabled={loadingOptions} onClick={loadMore}>
          Load more
        </button>
      ) : null}
      <div className="filter-actions">
        <button type="button" className="secondary-button compact-button" onClick={() => setDraftValues([])}>
          Clear column
        </button>
        <button type="button" className="secondary-button compact-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="compact-button" onClick={() => onApply(draftValues)}>
          Apply
        </button>
      </div>
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
  return `${LAYOUT_STORAGE_PREFIX}${hashMetadata(metadata, identityHint)}`;
}

function filterStorageKeyForMetadata(metadata: MetadataResponse, identityHint: string | null) {
  return `${FILTER_STORAGE_PREFIX}${hashMetadata(metadata, identityHint)}`;
}

function hashMetadata(metadata: MetadataResponse, identityHint: string | null) {
  const fingerprint = JSON.stringify({
    identityHint,
    name: metadata.name,
    source: metadata.source,
    sizeBytes: metadata.size_bytes,
    totalRows: metadata.total_rows,
    columns: metadata.columns.map((column) => [column.name, column.dtype])
  });
  return hashString(fingerprint);
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

function mergeFiltersWithMetadata(filters: ColumnFilters, metadata: MetadataResponse): ColumnFilters {
  const columnNameSet = new Set(metadata.columns.map((column) => column.name));
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([columnName, values]) => columnNameSet.has(columnName) && values.length > 0)
      .map(([columnName, values]) => [columnName, uniqueFilterValues(values)])
  );
}

function columnFiltersToValueFilters(filters: ColumnFilters): ValueFilter[] {
  return Object.entries(filters)
    .filter(([, values]) => values.length > 0)
    .map(([column, values]) => ({column, values}));
}

function loadStoredFilters(metadata: MetadataResponse, identityHint: string | null): ColumnFilters | null {
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

function storeFilters(storageKey: string, filters: ColumnFilters) {
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

function loadDisplaySettings(): DisplaySettings {
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

function storeDisplaySettings(settings: DisplaySettings) {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Browsing should continue if storage is unavailable or full.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueColumnNames(columnNames: string[]) {
  return columnNames.filter((columnName, index) => columnNames.indexOf(columnName) === index);
}

function uniqueFilterValues(values: FilterValue[]) {
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

function filterValueKey(value: FilterValue) {
  return JSON.stringify(value);
}

function formatFilterValue(value: FilterValue) {
  if (value.kind === "null") {
    return "NULL";
  }
  if (value.value === "") {
    return "(empty string)";
  }
  return String(value.value);
}

function formatFilterSummary(values: FilterValue[]) {
  if (values.length === 0) {
    return "No values";
  }
  if (values.length <= 2) {
    return values.map(formatFilterValue).join(", ");
  }
  return `${values.slice(0, 2).map(formatFilterValue).join(", ")} +${values.length - 2}`;
}

function formatPagerLabel(rows: RowsResponse | null, offset: number, pageSize: number) {
  if (!rows || rows.total_rows === 0) {
    return "0 rows";
  }
  return `${offset + 1}-${Math.min(offset + pageSize, rows.total_rows)} of ${rows.total_rows}`;
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

function loadRecentFiles(): RecentFile[] {
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

function storeRecentFiles(recentFiles: RecentFile[]) {
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

function formatRecentTime(openedAt: number) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  return formatter.format(new Date(openedAt));
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
