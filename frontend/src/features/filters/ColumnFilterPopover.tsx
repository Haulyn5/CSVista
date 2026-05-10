import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { Search } from "lucide-react";

import type { FilterValue, ValueFilter, ValueOption } from "../../api/client";
import { queryColumnValues } from "../../api/client";
import { VALUE_OPTIONS_PAGE_SIZE } from "./constants";
import { filterValueKey } from "./filterUtils";

export function ColumnFilterPopover({
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
  const requestVersionRef = useRef(0);
  const draftKeys = useMemo(() => new Set(draftValues.map(filterValueKey)), [draftValues]);
  const hasMore = options.length < totalValues;

  useEffect(() => {
    setDraftValues(selectedValues);
  }, [selectedValues]);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
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
        if (!cancelled && requestVersionRef.current === requestVersion) {
          setOptions(response.values);
          setTotalValues(response.total_values);
        }
      })
      .catch((err) => {
        if (!cancelled && requestVersionRef.current === requestVersion) {
          setOptionError(err instanceof Error ? err.message : "Failed to load filter values.");
        }
      })
      .finally(() => {
        if (!cancelled && requestVersionRef.current === requestVersion) {
          setLoadingOptions(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeFilters, columnName, fileId, search]);

  function loadMore() {
    const requestVersion = requestVersionRef.current;
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
        if (requestVersionRef.current === requestVersion) {
          setOptions((currentOptions) => [...currentOptions, ...response.values]);
          setTotalValues(response.total_values);
        }
      })
      .catch((err) => {
        if (requestVersionRef.current === requestVersion) {
          setOptionError(err instanceof Error ? err.message : "Failed to load filter values.");
        }
      })
      .finally(() => {
        if (requestVersionRef.current === requestVersion) {
          setLoadingOptions(false);
        }
      });
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
