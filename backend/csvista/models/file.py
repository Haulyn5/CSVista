from typing import Any

from pydantic import BaseModel


class FileOpenRequest(BaseModel):
    path: str


class FileOpenResponse(BaseModel):
    file_id: str
    name: str


class ColumnInfo(BaseModel):
    name: str
    dtype: str


class MetadataResponse(BaseModel):
    file_id: str
    name: str
    source: str
    size_bytes: int
    total_rows: int
    total_columns: int
    columns: list[ColumnInfo]


class RowsResponse(BaseModel):
    offset: int
    limit: int
    total_rows: int
    columns: list[ColumnInfo]
    rows: list[dict[str, Any]]

