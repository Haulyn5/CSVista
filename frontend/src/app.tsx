import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, FolderOpen, RefreshCw, TableProperties } from "lucide-react";

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
  const columns = rows?.columns ?? [];
  const visibleRows = rows?.rows ?? [];
  const hasRows = visibleRows.length > 0;
  const columnNames = useMemo(() => columns.map((column) => column.name), [columns]);

  if (!rows) {
    return <div className="empty-state">Open a CSV file to start browsing.</div>;
  }

  return (
    <div className="table-wrap" aria-busy={loading}>
      <table>
        <thead>
          <tr>
            <th className="row-number">#</th>
            {columns.map((column) => (
              <th key={column.name}>
                <span>{column.name}</span>
                <code>{column.dtype}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasRows ? (
            visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="row-number">{offset + rowIndex + 1}</td>
                {columnNames.map((columnName) => (
                  <td key={columnName}>{formatCell(row[columnName])}</td>
                ))}
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
