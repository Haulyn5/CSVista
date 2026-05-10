import { useEffect, useMemo, useState } from "react";

import type { FilterValue, MetadataResponse } from "../../api/client";
import { filterStorageKeyForMetadata, loadStoredFilters, storeFilters } from "./filterStorage";
import { columnFiltersToValueFilters, mergeFiltersWithMetadata } from "./filterUtils";
import type { ColumnFilters } from "./types";

export function useColumnFilters(
  metadata: MetadataResponse | null,
  layoutIdentityHint: string | null,
  onFiltersChanged: () => void
) {
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [filtersReady, setFiltersReady] = useState(false);
  const [restoredFiltersNotice, setRestoredFiltersNotice] = useState(false);

  const filterStorageKey = useMemo(
    () => (metadata ? filterStorageKeyForMetadata(metadata, layoutIdentityHint) : null),
    [layoutIdentityHint, metadata]
  );
  const activeFilters = useMemo(() => columnFiltersToValueFilters(columnFilters), [columnFilters]);

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
    if (!metadata || !filtersReady || !filterStorageKey) {
      return;
    }

    storeFilters(filterStorageKey, columnFilters);
  }, [columnFilters, filterStorageKey, filtersReady, metadata]);

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
    onFiltersChanged();
  }

  function clearAllFilters() {
    setColumnFilters({});
    setRestoredFiltersNotice(false);
    onFiltersChanged();
  }

  return {
    columnFilters,
    activeFilters,
    filtersReady,
    restoredFiltersNotice,
    setColumnFilter,
    clearAllFilters,
    dismissRestoredFiltersNotice: () => setRestoredFiltersNotice(false)
  };
}
