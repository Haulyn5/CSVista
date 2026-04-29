from pathlib import Path

import polars as pl
import pytest

import csvista.core.csv_loader as csv_loader_module
from csvista.core.csv_loader import CsvLoader, CsvLoaderError
from csvista.core.file_registry import FileRecord


def test_reads_metadata_and_rows(tmp_path: Path) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name\n1,Ada\n2,Grace\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    loader = CsvLoader()
    metadata = loader.metadata(record)
    rows = loader.rows(record, offset=1, limit=1)

    assert metadata.total_rows == 2
    assert metadata.total_columns == 2
    assert [column.name for column in metadata.columns] == ["id", "name"]
    assert rows.rows == [{"id": 2, "name": "Grace"}]


def test_reuses_cached_snapshot_for_unchanged_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name\n1,Ada\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")
    read_count = 0

    def read_csv(*args: object, **kwargs: object) -> pl.DataFrame:
        nonlocal read_count
        read_count += 1
        return pl.DataFrame({"id": [1], "name": ["Ada"]})

    monkeypatch.setattr(csv_loader_module.pl, "read_csv", read_csv)

    loader = CsvLoader()
    metadata = loader.metadata(record)
    rows = loader.rows(record, offset=0, limit=10)

    assert metadata.total_rows == 1
    assert rows.total_rows == 1
    assert read_count == 1


def test_raises_loader_error_for_unreadable_csv(tmp_path: Path) -> None:
    csv_file = tmp_path / "broken.csv"
    csv_file.write_text("id\n1,2\n")
    record = FileRecord(file_id="file-1", name="broken.csv", path=csv_file, source="path")

    with pytest.raises(CsvLoaderError):
        CsvLoader().metadata(record)
