from pathlib import Path

import pytest

from csvista.core.path_policy import PathPolicy, PathPolicyError


def test_allows_csv_inside_allowed_dir(tmp_path: Path) -> None:
    csv_file = tmp_path / "data.csv"
    csv_file.write_text("id,name\n1,Ada\n")

    assert PathPolicy([tmp_path]).validate_csv_file(csv_file) == csv_file.resolve()


def test_rejects_file_outside_allowed_dir(tmp_path: Path) -> None:
    allowed = tmp_path / "allowed"
    outside = tmp_path / "outside"
    allowed.mkdir()
    outside.mkdir()
    csv_file = outside / "data.csv"
    csv_file.write_text("id,name\n1,Ada\n")

    with pytest.raises(PathPolicyError):
        PathPolicy([allowed]).validate_csv_file(csv_file)


def test_allows_csv_outside_allowed_dir_when_unrestricted(tmp_path: Path) -> None:
    allowed = tmp_path / "allowed"
    outside = tmp_path / "outside"
    allowed.mkdir()
    outside.mkdir()
    csv_file = outside / "data.csv"
    csv_file.write_text("id,name\n1,Ada\n")

    assert (
        PathPolicy([allowed], allow_all_paths=True).validate_csv_file(csv_file)
        == csv_file.resolve()
    )


def test_rejects_non_csv_file(tmp_path: Path) -> None:
    text_file = tmp_path / "data.txt"
    text_file.write_text("id,name\n1,Ada\n")

    with pytest.raises(PathPolicyError):
        PathPolicy([tmp_path]).validate_csv_file(text_file)
