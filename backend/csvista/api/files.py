from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from csvista.config import ServerConfig
from csvista.core.csv_loader import CsvFilterError, CsvLoader, CsvLoaderError
from csvista.core.file_registry import FileRegistry
from csvista.core.path_policy import PathPolicy, PathPolicyError
from csvista.models.file import (
    FileOpenRequest,
    FileOpenResponse,
    MetadataResponse,
    RowsQueryRequest,
    RowsResponse,
    ValueOptionsQueryRequest,
    ValueOptionsResponse,
)

UPLOAD_CHUNK_SIZE = 1024 * 1024


def create_files_router(
    registry: FileRegistry,
    path_policy: PathPolicy,
    config: ServerConfig,
) -> APIRouter:
    router = APIRouter(prefix="/files", tags=["files"])
    loader = CsvLoader()

    @router.post("/open-path", response_model=FileOpenResponse)
    def open_path(request: FileOpenRequest) -> FileOpenResponse:
        try:
            resolved = path_policy.validate_csv_file(Path(request.path))
        except PathPolicyError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        record = registry.register_path(resolved)
        return FileOpenResponse(file_id=record.file_id, name=record.name)

    @router.post("/upload", response_model=FileOpenResponse)
    async def upload(file: UploadFile = File(...)) -> FileOpenResponse:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")
        if not file.filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only .csv uploads are supported.")

        file_id, safe_name, path = registry.prepare_upload(file.filename)
        bytes_written = 0
        try:
            with path.open("wb") as output:
                while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                    bytes_written += len(chunk)
                    if bytes_written > config.max_upload_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail="Uploaded file exceeds the configured size limit.",
                        )
                    output.write(chunk)
        except HTTPException:
            path.unlink(missing_ok=True)
            raise
        except OSError as exc:
            path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Unable to store uploaded file.") from exc

        record = registry.register_upload(file_id, safe_name, path)
        return FileOpenResponse(file_id=record.file_id, name=record.name)

    @router.get("/{file_id}/metadata", response_model=MetadataResponse)
    def metadata(file_id: str) -> MetadataResponse:
        record = registry.get(file_id)
        if record is None:
            raise HTTPException(status_code=404, detail="File not found.")
        try:
            return loader.metadata(record)
        except CsvLoaderError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.get("/{file_id}/rows", response_model=RowsResponse)
    def rows(file_id: str, offset: int = 0, limit: int = 100) -> RowsResponse:
        if offset < 0:
            raise HTTPException(status_code=400, detail="offset must be non-negative.")
        if limit < 1 or limit > 1000:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 1000.")

        record = registry.get(file_id)
        if record is None:
            raise HTTPException(status_code=404, detail="File not found.")
        try:
            return loader.rows(record, offset=offset, limit=limit)
        except CsvLoaderError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.post("/{file_id}/rows/query", response_model=RowsResponse)
    def query_rows(file_id: str, request: RowsQueryRequest) -> RowsResponse:
        if request.offset < 0:
            raise HTTPException(status_code=400, detail="offset must be non-negative.")
        if request.limit < 1 or request.limit > 1000:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 1000.")

        record = registry.get(file_id)
        if record is None:
            raise HTTPException(status_code=404, detail="File not found.")
        try:
            return loader.query_rows(
                record,
                offset=request.offset,
                limit=request.limit,
                filters=request.filters,
                sort=request.sort,
                search=request.search,
            )
        except CsvFilterError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except CsvLoaderError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @router.post("/{file_id}/values/query", response_model=ValueOptionsResponse)
    def query_values(file_id: str, request: ValueOptionsQueryRequest) -> ValueOptionsResponse:
        if request.offset < 0:
            raise HTTPException(status_code=400, detail="offset must be non-negative.")
        if request.limit < 1 or request.limit > 1000:
            raise HTTPException(status_code=400, detail="limit must be between 1 and 1000.")

        record = registry.get(file_id)
        if record is None:
            raise HTTPException(status_code=404, detail="File not found.")
        try:
            return loader.value_options(
                record,
                column=request.column,
                search=request.search,
                offset=request.offset,
                limit=request.limit,
                filters=request.filters,
            )
        except CsvFilterError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except CsvLoaderError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return router
