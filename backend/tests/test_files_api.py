from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import Callable

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.routing import APIRoute
from pydantic import ValidationError

from csvista.api.files import create_files_router
from csvista.config import ServerConfig
from csvista.core.file_registry import FileRegistry
from csvista.core.path_policy import PathPolicy
from csvista.models.file import (
    FileOpenRequest,
    FilterValue,
    RowsQueryRequest,
    SearchSpec,
    SortSpec,
    ValueFilter,
    ValueOptionsQueryRequest,
)


def upload_file(filename: str, content: bytes) -> UploadFile:
    spooled = SpooledTemporaryFile()
    spooled.write(content)
    spooled.seek(0)
    return UploadFile(file=spooled, filename=filename)


def endpoint(router: object, path: str) -> object:
    return next(
        route.endpoint
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == path
    )


@pytest.mark.anyio
async def test_upload_csv_and_fetch_rows(tmp_path: Path) -> None:
    registry = FileRegistry()
    policy = PathPolicy([tmp_path])
    router = create_files_router(
        registry,
        policy,
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    upload = endpoint(router, "/files/upload")
    rows = endpoint(router, "/files/{file_id}/rows")

    opened = await upload(upload_file("people.csv", b"id,name\n1,Ada\n"))
    response = rows(opened.file_id, offset=0, limit=10)

    assert response.rows == [{"id": 1, "name": "Ada"}]


@pytest.mark.anyio
async def test_query_rows_and_values(tmp_path: Path) -> None:
    registry = FileRegistry()
    policy = PathPolicy([tmp_path])
    router = create_files_router(
        registry,
        policy,
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    upload = endpoint(router, "/files/upload")
    query_rows = endpoint(router, "/files/{file_id}/rows/query")
    query_values = endpoint(router, "/files/{file_id}/values/query")

    opened = await upload(upload_file("people.csv", b"id,name,team\n1,Ada,core\n2,Grace,core\n3,Alan,docs\n"))
    rows_response = query_rows(
        opened.file_id,
        RowsQueryRequest(
            offset=0,
            limit=10,
            filters=[ValueFilter(column="team", values=[FilterValue(kind="value", value="core")])],
        ),
    )
    values_response = query_values(
        opened.file_id,
        ValueOptionsQueryRequest(
            column="name",
            search="a",
            offset=0,
            limit=10,
            filters=[ValueFilter(column="team", values=[FilterValue(kind="value", value="core")])],
        ),
    )

    assert rows_response.total_rows == 2
    assert rows_response.rows == [
        {"id": 1, "name": "Ada", "team": "core"},
        {"id": 2, "name": "Grace", "team": "core"},
    ]
    assert [(option.display, option.count) for option in values_response.values] == [("Ada", 1), ("Grace", 1)]


@pytest.mark.anyio
async def test_query_rows_supports_filters_search_and_sort(tmp_path: Path) -> None:
    registry = FileRegistry()
    router = create_files_router(
        registry,
        PathPolicy([tmp_path]),
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    upload = endpoint(router, "/files/upload")
    query_rows = endpoint(router, "/files/{file_id}/rows/query")

    opened = await upload(
        upload_file(
            "people.csv",
            b"id,name,team\n1,Ada,core\n2,Grace,core\n3,Alan,docs\n4,Adele,core\n",
        )
    )
    response = query_rows(
        opened.file_id,
        RowsQueryRequest(
            offset=0,
            limit=10,
            filters=[ValueFilter(column="team", values=[FilterValue(kind="value", value="core")])],
            search=SearchSpec(text="a", columns=["name"]),
            sort=[SortSpec(column="name", direction="desc")],
        ),
    )

    assert response.total_rows == 3
    assert [row["name"] for row in response.rows] == ["Grace", "Adele", "Ada"]


@pytest.mark.anyio
async def test_query_rows_rejects_unknown_filter_column(tmp_path: Path) -> None:
    registry = FileRegistry()
    router = create_files_router(
        registry,
        PathPolicy([tmp_path]),
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    upload = endpoint(router, "/files/upload")
    query_rows = endpoint(router, "/files/{file_id}/rows/query")

    opened = await upload(upload_file("people.csv", b"id,name\n1,Ada\n"))
    with pytest.raises(HTTPException) as exc_info:
        query_rows(
            opened.file_id,
            RowsQueryRequest(
                offset=0,
                limit=10,
                filters=[ValueFilter(column="missing", values=[FilterValue(kind="value", value="Ada")])],
            ),
        )

    assert exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_query_endpoints_reject_incompatible_filter_value_type(tmp_path: Path) -> None:
    registry = FileRegistry()
    router = create_files_router(
        registry,
        PathPolicy([tmp_path]),
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    upload = endpoint(router, "/files/upload")
    query_rows = endpoint(router, "/files/{file_id}/rows/query")
    query_values = endpoint(router, "/files/{file_id}/values/query")

    opened = await upload(upload_file("people.csv", b"id,name\n1,Ada\n2,Grace\n"))
    incompatible_filter = ValueFilter(column="id", values=[FilterValue(kind="value", value="1")])

    with pytest.raises(HTTPException) as rows_exc_info:
        query_rows(
            opened.file_id,
            RowsQueryRequest(offset=0, limit=10, filters=[incompatible_filter]),
        )
    with pytest.raises(HTTPException) as values_exc_info:
        query_values(
            opened.file_id,
            ValueOptionsQueryRequest(column="name", offset=0, limit=10, filters=[incompatible_filter]),
        )

    assert rows_exc_info.value.status_code == 400
    assert values_exc_info.value.status_code == 400


@pytest.mark.anyio
async def test_upload_rejects_files_over_limit(tmp_path: Path) -> None:
    registry = FileRegistry()
    router = create_files_router(
        registry,
        PathPolicy([tmp_path]),
        ServerConfig(
            allowed_dirs=[tmp_path],
            frontend_dist=tmp_path / "missing",
            max_upload_bytes=4,
        ),
    )
    upload = endpoint(router, "/files/upload")

    with pytest.raises(HTTPException) as exc_info:
        await upload(upload_file("too-large.csv", b"id,name\n1,Ada\n"))

    assert exc_info.value.status_code == 413


def test_metadata_returns_422_for_unreadable_csv(tmp_path: Path) -> None:
    csv_file = tmp_path / "broken.csv"
    csv_file.write_text("id\n1,2\n")
    registry = FileRegistry()
    router = create_files_router(
        registry,
        PathPolicy([tmp_path]),
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    open_path = endpoint(router, "/files/open-path")
    metadata = endpoint(router, "/files/{file_id}/metadata")

    opened = open_path(FileOpenRequest(path=str(csv_file)))
    with pytest.raises(HTTPException) as exc_info:
        metadata(opened.file_id)

    assert exc_info.value.status_code == 422
    assert "Unable to read CSV file" in exc_info.value.detail


@pytest.mark.parametrize(
    "request_factory",
    [
        lambda: FileOpenRequest(path=""),
        lambda: RowsQueryRequest(offset=-1),
        lambda: RowsQueryRequest(limit=0),
        lambda: RowsQueryRequest(limit=1001),
        lambda: RowsQueryRequest(sort=[SortSpec(column="name", direction="sideways")]),
        lambda: RowsQueryRequest(search=SearchSpec(text="")),
        lambda: RowsQueryRequest(search=SearchSpec(text="Ada", columns=[])),
        lambda: ValueOptionsQueryRequest(column=""),
        lambda: ValueOptionsQueryRequest(column="name", offset=-1),
        lambda: ValueOptionsQueryRequest(column="name", limit=1001),
        lambda: ValueFilter(column="", values=[]),
        lambda: FilterValue(kind="unknown"),
        lambda: FilterValue(kind="value"),
    ],
)
def test_request_models_reject_invalid_values(request_factory: Callable[[], object]) -> None:
    with pytest.raises(ValidationError):
        request_factory()


def test_null_filter_values_ignore_supplied_payload() -> None:
    assert FilterValue(kind="null", value="ignored").value is None
