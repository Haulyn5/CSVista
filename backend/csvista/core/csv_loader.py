import json
from collections import Counter
from typing import Any

import polars as pl
from polars.exceptions import PolarsError

from csvista.core.file_registry import FileRecord
from csvista.models.file import (
    ColumnInfo,
    FilterValue,
    MetadataResponse,
    RowsResponse,
    ValueFilter,
    ValueOption,
    ValueOptionsResponse,
)

VALUE_COUNT_COLUMN_PREFIX = "__csvista_value_count"


class CsvLoaderError(ValueError):
    """Raised when a CSV file cannot be loaded for display."""


class CsvFilterError(ValueError):
    """Raised when row filters are invalid for a CSV file."""


class CsvLoader:
    def __init__(self) -> None:
        self._cache: dict[tuple[str, int, int], pl.DataFrame] = {}

    def metadata(self, record: FileRecord) -> MetadataResponse:
        frame = self._read(record)
        columns = [
            ColumnInfo(name=name, dtype=str(dtype))
            for name, dtype in zip(frame.columns, frame.dtypes, strict=True)
        ]
        return MetadataResponse(
            file_id=record.file_id,
            name=record.name,
            source=record.source,
            size_bytes=record.path.stat().st_size,
            total_rows=frame.height,
            total_columns=frame.width,
            columns=columns,
        )

    def rows(self, record: FileRecord, offset: int, limit: int) -> RowsResponse:
        frame = self._read(record)
        page = frame.slice(offset, limit)
        return self._rows_response(frame, page, offset, limit)

    def filtered_rows(
        self,
        record: FileRecord,
        offset: int,
        limit: int,
        filters: list[ValueFilter],
    ) -> RowsResponse:
        frame = self._read(record)
        filtered = self._apply_filters(frame, filters)
        page = filtered.slice(offset, limit)
        return self._rows_response(filtered, page, offset, limit)

    def value_options(
        self,
        record: FileRecord,
        column: str,
        search: str,
        offset: int,
        limit: int,
        filters: list[ValueFilter],
    ) -> ValueOptionsResponse:
        frame = self._read(record)
        self._validate_column(frame, column)
        candidate_filters = [value_filter for value_filter in filters if value_filter.column != column]
        filtered = self._apply_filters(frame, candidate_filters)
        normalized_search = search.casefold()
        count_column = self._count_column_name(filtered)
        counts = self._value_counts(filtered, column, count_column)
        counter: Counter[str] = Counter()
        values_by_key: dict[str, FilterValue] = {}
        displays_by_key: dict[str, str] = {}

        for row in counts.iter_rows(named=True):
            value = row[column]
            count = row[count_column]
            filter_value = self._filter_value_from_cell(value)
            display = self._display_filter_value(filter_value)
            if normalized_search and normalized_search not in display.casefold():
                continue
            key = self._filter_value_key(filter_value)
            counter[key] += count
            values_by_key[key] = filter_value
            displays_by_key[key] = display

        sorted_keys = sorted(counter, key=lambda key: (-counter[key], displays_by_key[key]))
        page_keys = sorted_keys[offset : offset + limit]
        return ValueOptionsResponse(
            column=column,
            offset=offset,
            limit=limit,
            total_values=len(sorted_keys),
            values=[
                ValueOption(value=values_by_key[key], display=displays_by_key[key], count=counter[key])
                for key in page_keys
            ],
        )

    def _rows_response(self, frame: pl.DataFrame, page: pl.DataFrame, offset: int, limit: int) -> RowsResponse:
        columns = [
            ColumnInfo(name=name, dtype=str(dtype))
            for name, dtype in zip(frame.columns, frame.dtypes, strict=True)
        ]
        return RowsResponse(
            offset=offset,
            limit=limit,
            total_rows=frame.height,
            columns=columns,
            rows=self._json_rows(page),
        )

    def _apply_filters(self, frame: pl.DataFrame, filters: list[ValueFilter]) -> pl.DataFrame:
        if not filters:
            return frame

        expressions: list[pl.Expr] = []
        for value_filter in filters:
            self._validate_column(frame, value_filter.column)
            if not value_filter.values:
                continue

            null_selected = any(value.kind == "null" for value in value_filter.values)
            normal_values = [value.value for value in value_filter.values if value.kind == "value"]
            invalid_values = [value for value in value_filter.values if value.kind not in {"null", "value"}]
            if invalid_values:
                raise CsvFilterError("Filter values must use kind 'null' or 'value'.")

            column_expr = pl.col(value_filter.column)
            value_expr: pl.Expr | None = None
            if normal_values:
                value_expr = column_expr.is_in(normal_values)
            if null_selected:
                null_expr = column_expr.is_null()
                value_expr = null_expr if value_expr is None else value_expr | null_expr
            if value_expr is not None:
                expressions.append(value_expr)

        try:
            for expression in expressions:
                frame = frame.filter(expression)
        except PolarsError as exc:
            raise CsvFilterError("Filter value is incompatible with column type.") from exc
        return frame

    def _validate_column(self, frame: pl.DataFrame, column: str) -> None:
        if column not in frame.columns:
            raise CsvFilterError(f"Column not found: {column}")

    def _count_column_name(self, frame: pl.DataFrame) -> str:
        count_column = VALUE_COUNT_COLUMN_PREFIX
        while count_column in frame.columns:
            count_column = f"_{count_column}"
        return count_column

    def _value_counts(self, frame: pl.DataFrame, column: str, count_column: str) -> pl.DataFrame:
        try:
            return frame.group_by(column).agg(pl.len().alias(count_column))
        except PolarsError as exc:
            raise CsvFilterError("Unable to count filter values for column.") from exc

    def _filter_value_from_cell(self, value: Any) -> FilterValue:
        if value is None:
            return FilterValue(kind="null")
        return FilterValue(kind="value", value=value)

    def _display_filter_value(self, value: FilterValue) -> str:
        if value.kind == "null":
            return "NULL"
        if value.value == "":
            return "(empty string)"
        return str(value.value)

    def _filter_value_key(self, value: FilterValue) -> str:
        try:
            return json.dumps([value.kind, value.value], sort_keys=True, default=str)
        except TypeError:
            return repr((value.kind, value.value))

    def _read(self, record: FileRecord) -> pl.DataFrame:
        try:
            stat = record.path.stat()
            cache_key = (str(record.path), stat.st_mtime_ns, stat.st_size)
            cached = self._cache.get(cache_key)
            if cached is not None:
                return cached

            frame = pl.read_csv(record.path, infer_schema_length=1000, ignore_errors=False)
        except (OSError, PolarsError) as exc:
            raise CsvLoaderError(f"Unable to read CSV file: {exc}") from exc

        self._cache = {cache_key: frame}
        return frame

    def _json_rows(self, frame: pl.DataFrame) -> list[dict[str, Any]]:
        return frame.to_dicts()
