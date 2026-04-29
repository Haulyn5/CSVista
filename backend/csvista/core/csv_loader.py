from typing import Any

import polars as pl
from polars.exceptions import PolarsError

from csvista.core.file_registry import FileRecord
from csvista.models.file import ColumnInfo, MetadataResponse, RowsResponse


class CsvLoaderError(ValueError):
    """Raised when a CSV file cannot be loaded for display."""


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
