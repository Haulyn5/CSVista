import { useEffect, useMemo, useState } from "react";

import type { MetadataResponse } from "../../api/client";
import {
  clampColumnWidth,
  createDefaultLayout,
  estimateDefaultColumnWidth,
  layoutStorageKeyForMetadata,
  mergeLayoutWithMetadata
} from "./tableLayout";
import { loadStoredLayout, removeStoredLayout, storeLayout } from "./tableLayoutStorage";
import type { ColumnSettingsByName, ColumnVisibility } from "./types";

export function useTableLayout(metadata: MetadataResponse | null, layoutIdentityHint: string | null) {
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>({});
  const [columnSettings, setColumnSettings] = useState<ColumnSettingsByName>({});
  const [layoutReady, setLayoutReady] = useState(false);

  const layoutStorageKey = useMemo(
    () => (metadata ? layoutStorageKeyForMetadata(metadata, layoutIdentityHint) : null),
    [layoutIdentityHint, metadata]
  );

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

  return {
    columnOrder,
    visibleColumns,
    columnSettings,
    toggleColumnVisibility,
    moveColumn,
    resetLayout,
    setColumnWidth,
    toggleColumnWrap
  };
}

