from pathlib import Path
from tempfile import SpooledTemporaryFile

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.routing import APIRoute

from csvista.api.files import create_files_router
from csvista.config import ServerConfig
from csvista.core.file_registry import FileRegistry
from csvista.core.path_policy import PathPolicy
from csvista.models.file import FileOpenRequest


def upload_file(filename: str, content: bytes) -> UploadFile:
    spooled = SpooledTemporaryFile()
    spooled.write(content)
    spooled.seek(0)
    return UploadFile(file=spooled, filename=filename)


@pytest.mark.anyio
async def test_upload_csv_and_fetch_rows(tmp_path: Path) -> None:
    registry = FileRegistry()
    policy = PathPolicy([tmp_path])
    router = create_files_router(
        registry,
        policy,
        ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"),
    )
    upload = next(
        route.endpoint
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == "/files/upload"
    )
    rows = next(
        route.endpoint
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == "/files/{file_id}/rows"
    )

    opened = await upload(upload_file("people.csv", b"id,name\n1,Ada\n"))
    response = rows(opened.file_id, offset=0, limit=10)

    assert response.rows == [{"id": 1, "name": "Ada"}]


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
    upload = next(
        route.endpoint
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == "/files/upload"
    )

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
    open_path = next(
        route.endpoint
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == "/files/open-path"
    )
    metadata = next(
        route.endpoint
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == "/files/{file_id}/metadata"
    )

    opened = open_path(FileOpenRequest(path=str(csv_file)))
    with pytest.raises(HTTPException) as exc_info:
        metadata(opened.file_id)

    assert exc_info.value.status_code == 422
    assert "Unable to read CSV file" in exc_info.value.detail
