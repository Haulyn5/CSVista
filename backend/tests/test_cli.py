from typer.testing import CliRunner

from csvista.cli import app


def test_cli_exposes_serve_subcommand() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "serve" in result.stdout


def test_serve_help_is_available() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["serve", "--help"])

    assert result.exit_code == 0
    assert "--allow-dir" in result.stdout
