from pathlib import Path

import polars as pl
import pytest

import csvista.core.csv_loader as csv_loader_module
from csvista.core.csv_loader import CsvFilterError, CsvLoader, CsvLoaderError
from csvista.core.file_registry import FileRecord
from csvista.models.file import FilterValue, SearchSpec, SortSpec, ValueFilter


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


def test_filters_rows_with_column_or_and_cross_column_and(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name,team\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    monkeypatch.setattr(
        csv_loader_module.pl,
        "read_csv",
        lambda *args, **kwargs: pl.DataFrame(
            {
                "id": [1, 2, 3, 4],
                "name": ["Ada", "Grace", "Linus", "Margaret"],
                "team": ["core", "core", "docs", "ops"],
            }
        ),
    )

    rows = CsvLoader().filtered_rows(
        record,
        offset=0,
        limit=10,
        filters=[
            ValueFilter(
                column="name",
                values=[FilterValue(kind="value", value="Ada"), FilterValue(kind="value", value="Grace")],
            ),
            ValueFilter(column="team", values=[FilterValue(kind="value", value="core")]),
        ],
    )

    assert rows.total_rows == 2
    assert rows.rows == [
        {"id": 1, "name": "Ada", "team": "core"},
        {"id": 2, "name": "Grace", "team": "core"},
    ]


def test_filters_null_and_empty_string_separately(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_file = tmp_path / "notes.csv"
    csv_file.write_text("id,note\n")
    record = FileRecord(file_id="file-1", name="notes.csv", path=csv_file, source="path")

    monkeypatch.setattr(
        csv_loader_module.pl,
        "read_csv",
        lambda *args, **kwargs: pl.DataFrame({"id": [1, 2, 3], "note": [None, "", "hello"]}),
    )
    loader = CsvLoader()

    null_rows = loader.filtered_rows(
        record,
        offset=0,
        limit=10,
        filters=[ValueFilter(column="note", values=[FilterValue(kind="null")])],
    )
    empty_rows = loader.filtered_rows(
        record,
        offset=0,
        limit=10,
        filters=[ValueFilter(column="note", values=[FilterValue(kind="value", value="")])],
    )

    assert null_rows.rows == [{"id": 1, "note": None}]
    assert empty_rows.rows == [{"id": 2, "note": ""}]


def test_query_rows_searches_sorts_and_paginates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name,team\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    monkeypatch.setattr(
        csv_loader_module.pl,
        "read_csv",
        lambda *args, **kwargs: pl.DataFrame(
            {
                "id": [1, 2, 3, 4],
                "name": ["Ada", "Grace", "Alan", "Adele"],
                "team": ["core", "core", "docs", "core"],
            }
        ),
    )

    rows = CsvLoader().query_rows(
        record,
        offset=1,
        limit=1,
        filters=[ValueFilter(column="team", values=[FilterValue(kind="value", value="core")])],
        sort=[SortSpec(column="name", direction="desc")],
        search=SearchSpec(text="a", columns=["name"]),
    )

    assert rows.total_rows == 3
    assert rows.rows == [{"id": 4, "name": "Adele", "team": "core"}]


def test_query_rows_searches_all_columns_case_insensitively(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name,team\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    monkeypatch.setattr(
        csv_loader_module.pl,
        "read_csv",
        lambda *args, **kwargs: pl.DataFrame(
            {
                "id": [1, 2, 3],
                "name": ["Ada", "Grace", "Linus"],
                "team": ["core", "Docs", None],
            }
        ),
    )

    rows = CsvLoader().query_rows(
        record,
        offset=0,
        limit=10,
        filters=[],
        sort=[SortSpec(column="id", direction="asc")],
        search=SearchSpec(text="DOC"),
    )

    assert rows.total_rows == 1
    assert rows.rows == [{"id": 2, "name": "Grace", "team": "Docs"}]


def test_query_rows_sorts_by_multiple_columns(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name,team\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    monkeypatch.setattr(
        csv_loader_module.pl,
        "read_csv",
        lambda *args, **kwargs: pl.DataFrame(
            {
                "id": [1, 2, 3, 4],
                "name": ["Ada", "Grace", "Alan", "Adele"],
                "team": ["core", "docs", "core", "docs"],
            }
        ),
    )

    rows = CsvLoader().query_rows(
        record,
        offset=0,
        limit=10,
        filters=[],
        sort=[SortSpec(column="team", direction="asc"), SortSpec(column="name", direction="desc")],
        search=None,
    )

    assert [row["name"] for row in rows.rows] == ["Alan", "Ada", "Grace", "Adele"]


def test_value_options_are_faceted_and_searchable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name,team\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    monkeypatch.setattr(
        csv_loader_module.pl,
        "read_csv",
        lambda *args, **kwargs: pl.DataFrame(
            {
                "id": [1, 2, 3, 4],
                "name": ["Ada", "Grace", "Alan", "Adele"],
                "team": ["core", "core", "docs", "core"],
            }
        ),
    )

    options = CsvLoader().value_options(
        record,
        column="name",
        search="ad",
        offset=0,
        limit=10,
        filters=[
            ValueFilter(column="team", values=[FilterValue(kind="value", value="core")]),
            ValueFilter(column="name", values=[FilterValue(kind="value", value="Grace")]),
        ],
    )

    assert options.total_values == 2
    assert [(option.display, option.count) for option in options.values] == [("Ada", 1), ("Adele", 1)]


def test_filter_rejects_unknown_column(tmp_path: Path) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name\n1,Ada\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    with pytest.raises(CsvFilterError):
        CsvLoader().filtered_rows(
            record,
            offset=0,
            limit=10,
            filters=[ValueFilter(column="missing", values=[FilterValue(kind="value", value="Ada")])],
        )


def test_query_rows_rejects_unknown_search_column(tmp_path: Path) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name\n1,Ada\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    with pytest.raises(CsvFilterError):
        CsvLoader().query_rows(
            record,
            offset=0,
            limit=10,
            filters=[],
            sort=[],
            search=SearchSpec(text="Ada", columns=["missing"]),
        )


def test_query_rows_rejects_unknown_sort_column(tmp_path: Path) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name\n1,Ada\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    with pytest.raises(CsvFilterError):
        CsvLoader().query_rows(
            record,
            offset=0,
            limit=10,
            filters=[],
            sort=[SortSpec(column="missing")],
            search=None,
        )


def test_filter_rejects_incompatible_value_type(tmp_path: Path) -> None:
    csv_file = tmp_path / "people.csv"
    csv_file.write_text("id,name\n1,Ada\n2,Grace\n")
    record = FileRecord(file_id="file-1", name="people.csv", path=csv_file, source="path")

    with pytest.raises(CsvFilterError, match="incompatible"):
        CsvLoader().filtered_rows(
            record,
            offset=0,
            limit=10,
            filters=[ValueFilter(column="id", values=[FilterValue(kind="value", value="1")])],
        )


def test_raises_loader_error_for_unreadable_csv(tmp_path: Path) -> None:
    csv_file = tmp_path / "broken.csv"
    csv_file.write_text("id\n1,2\n")
    record = FileRecord(file_id="file-1", name="broken.csv", path=csv_file, source="path")

    with pytest.raises(CsvLoaderError):
        CsvLoader().metadata(record)
