import { useCallback, useEffect, useState } from "react";
import {
  FileUp,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  TableProperties,
  X
} from "lucide-react";

import {
  FileOpenResponse,
  MetadataResponse,
  RowsResponse,
  getMetadata,
  getRows,
  openPath,
  queryRows,
  uploadCsv
} from "./api/client";
import { MetadataSummary } from "./features/columns/MetadataSummary";
import { useColumnFilters } from "./features/filters/useColumnFilters";
import { RecentFilesMenu } from "./features/recentFiles/RecentFilesMenu";
import type { RecentFile } from "./features/recentFiles/types";
import { useRecentFiles } from "./features/recentFiles/useRecentFiles";
import { TableSettingsMenu } from "./features/settings/TableSettingsMenu";
import { useDisplaySettings } from "./features/settings/useDisplaySettings";
import { PAGE_SIZE } from "./features/table/constants";
import { DataTable } from "./features/table/DataTable";
import { useTableLayout } from "./features/table/useTableLayout";
import { formatFilterSummary, formatPagerLabel } from "./lib/format";

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
  const {recentFiles, rememberRecentFile, removeRecentFile, clearRecentFiles} = useRecentFiles();
  const {displaySettings, updateDisplaySettings} = useDisplaySettings();
  const [layoutIdentityHint, setLayoutIdentityHint] = useState<string | null>(null);
  const {
    columnOrder,
    visibleColumns,
    columnSettings,
    toggleColumnVisibility,
    moveColumn,
    resetLayout,
    setColumnWidth,
    toggleColumnWrap
  } = useTableLayout(metadata, layoutIdentityHint);
  const {
    columnFilters,
    activeFilters,
    filtersReady,
    restoredFiltersNotice,
    setColumnFilter,
    clearAllFilters,
    dismissRestoredFiltersNotice
  } = useColumnFilters(metadata, layoutIdentityHint, () => setOffset(0));
  const loading = opening || rowsLoading;
  const hasActiveFilters = activeFilters.length > 0;

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

        <RecentFilesMenu
          recentFiles={recentFiles}
          onOpenRecent={(recentFile) => void handleOpenRecent(recentFile)}
          onClearRecentFiles={clearRecentFiles}
        />

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
              <TableSettingsMenu displaySettings={displaySettings} onUpdateDisplaySettings={updateDisplaySettings} />
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
                onClick={dismissRestoredFiltersNotice}
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
