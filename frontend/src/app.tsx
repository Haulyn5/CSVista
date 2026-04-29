import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { FileUp, FolderOpen, RefreshCw, TableProperties, WrapText } from "lucide-react";

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

const EMPTY_COLUMNS: RowsResponse["columns"] = [];
const EMPTY_ROWS: RowsResponse["rows"] = [];

export function App() {
  const [currentFile, setCurrentFile] = useState<FileOpenResponse | null>(null);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [rows, setRows] = useState<RowsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [rowsLoading, setRowsLoading] = useState(false);
  const loading = opening || rowsLoading;

  const loadFile = useCallback(async (file: FileOpenResponse) => {
    setOpening(true);
    setError(null);
    setMetadata(null);
    setRows(null);
    setOffset(0);
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

  async function handleOpenPath() {
    if (!path.trim()) {
      return;
    }
    setOpening(true);
    setError(null);
    try {
      await loadFile(await openPath(path.trim()));
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
      await loadFile(await uploadCsv(file));
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

      <section className="workspace">
        <aside className="sidebar">
          <h2>{metadata?.name ?? "Columns"}</h2>
          {metadata ? <MetadataSummary metadata={metadata} /> : <p className="muted">Open a CSV to inspect columns.</p>}
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

          <DataTable rows={rows} offset={offset} loading={loading} />

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

function MetadataSummary({metadata}: {metadata: MetadataResponse}) {
  return (
    <div className="column-list">
      <div className="metric">
        <span>Size</span>
        <strong>{formatBytes(metadata.size_bytes)}</strong>
      </div>
      {metadata.columns.map((column) => (
        <div className="column-item" key={column.name}>
          <span title={column.name}>{column.name}</span>
          <code>{column.dtype}</code>
        </div>
      ))}
    </div>
  );
}

function DataTable({rows, offset, loading}: {rows: RowsResponse | null; offset: number; loading: boolean}) {
  const columns = rows?.columns ?? EMPTY_COLUMNS;
  const visibleRows = rows?.rows ?? EMPTY_ROWS;
  const hasRows = visibleRows.length > 0;
  const columnNames = useMemo(() => columns.map((column) => column.name), [columns]);
  const defaultColumnWidths = useMemo(() => {
    return Object.fromEntries(columnNames.map((columnName) => [columnName, estimateDefaultColumnWidth(columnName)]));
  }, [columnNames]);
  const [columnSettings, setColumnSettings] = useState<Record<string, ColumnSettings>>({});

  useEffect(() => {
    setColumnSettings((currentSettings) => {
      const nextSettings: Record<string, ColumnSettings> = {};
      for (const column of columns) {
        nextSettings[column.name] = currentSettings[column.name] ?? {
          width: defaultColumnWidths[column.name] ?? DEFAULT_COLUMN_WIDTH,
          wrap: false
        };
      }
      return nextSettings;
    });
  }, [columns, defaultColumnWidths]);

  const totalTableWidth = useMemo(() => {
    return columnNames.reduce(
      (total, columnName) => total + (columnSettings[columnName]?.width ?? defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH),
      ROW_NUMBER_WIDTH
    );
  }, [columnNames, columnSettings, defaultColumnWidths]);

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
        width: defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH,
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

  function handleResizeStart(columnName: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnSettings[columnName]?.width ?? defaultColumnWidths[columnName] ?? DEFAULT_COLUMN_WIDTH;

    function handlePointerMove(pointerEvent: PointerEvent) {
      pointerEvent.preventDefault();
      setColumnWidth(columnName, startWidth + pointerEvent.clientX - startX);
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
    setColumnWidth(
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
                    onClick={() => toggleColumnWrap(column.name)}
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
          {hasRows ? (
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
