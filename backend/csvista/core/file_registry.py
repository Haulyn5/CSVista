from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4


@dataclass(frozen=True)
class FileRecord:
    file_id: str
    name: str
    path: Path
    source: str


class FileRegistry:
    def __init__(self) -> None:
        self._records: dict[str, FileRecord] = {}
        self._upload_dir = TemporaryDirectory(prefix="csvista-uploads-")

    def register_path(self, path: Path) -> FileRecord:
        file_id = uuid4().hex
        record = FileRecord(file_id=file_id, name=path.name, path=path, source="path")
        self._records[file_id] = record
        return record

    def prepare_upload(self, filename: str) -> tuple[str, str, Path]:
        file_id = uuid4().hex
        safe_name = Path(filename).name
        path = Path(self._upload_dir.name) / f"{file_id}-{safe_name}"
        return file_id, safe_name, path

    def register_upload(self, file_id: str, safe_name: str, path: Path) -> FileRecord:
        record = FileRecord(file_id=file_id, name=safe_name, path=path, source="upload")
        self._records[file_id] = record
        return record

    def get(self, file_id: str) -> FileRecord | None:
        return self._records.get(file_id)
