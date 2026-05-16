from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class FileOpenRequest(BaseModel):
    path: str = Field(min_length=1)


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
    kind: Literal["null", "value"]
    value: Any | None = None

    @model_validator(mode="after")
    def validate_value(self) -> "FilterValue":
        if self.kind == "null":
            self.value = None
        elif self.value is None:
            raise ValueError("Filter values with kind 'value' must include a value.")
        return self


class ValueFilter(BaseModel):
    column: str = Field(min_length=1)
    values: list[FilterValue]


class RowsQueryRequest(BaseModel):
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)
    filters: list[ValueFilter] = Field(default_factory=list)


class ValueOption(BaseModel):
    value: FilterValue
    display: str
    count: int


class ValueOptionsQueryRequest(BaseModel):
    column: str = Field(min_length=1)
    search: str = ""
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)
    filters: list[ValueFilter] = Field(default_factory=list)


class ValueOptionsResponse(BaseModel):
    column: str
    offset: int
    limit: int
    total_values: int
    values: list[ValueOption]
