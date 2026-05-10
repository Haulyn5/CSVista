import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import { GripVertical } from "lucide-react";

import type { MetadataResponse } from "../../api/client";
import { formatBytes } from "../../lib/format";
import type { ColumnVisibility } from "../table/types";

export function MetadataSummary({
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

