from typing import Any

from pydantic import BaseModel, Field


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


class FilterValue(BaseModel):
    kind: str
    value: Any | None = None


class ValueFilter(BaseModel):
    column: str
    values: list[FilterValue]


class RowsQueryRequest(BaseModel):
    offset: int = 0
    limit: int = 100
    filters: list[ValueFilter] = Field(default_factory=list)


class ValueOption(BaseModel):
    value: FilterValue
    display: str
    count: int


class ValueOptionsQueryRequest(BaseModel):
    column: str
    search: str = ""
    offset: int = 0
    limit: int = 100
    filters: list[ValueFilter] = Field(default_factory=list)


class ValueOptionsResponse(BaseModel):
    column: str
    offset: int
    limit: int
    total_values: int
    values: list[ValueOption]
