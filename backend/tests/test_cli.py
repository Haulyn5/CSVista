from typer.testing import CliRunner

from csvista.config import ServerConfig
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
    assert "--unsafe-allow-all-paths" in result.stdout


def test_serve_wires_unsafe_all_paths_flag(monkeypatch) -> None:
    captured: dict[str, object] = {}
    fake_app = object()

    def fake_create_app(config: ServerConfig) -> object:
        captured["config"] = config
        return fake_app

    def fake_uvicorn_run(app: object, *, host: str, port: int) -> None:
        captured["app"] = app
        captured["host"] = host
        captured["port"] = port

    monkeypatch.setattr("csvista.cli.create_app", fake_create_app)
    monkeypatch.setattr("csvista.cli.uvicorn.run", fake_uvicorn_run)

    runner = CliRunner()
    result = runner.invoke(app, ["serve", "--unsafe-allow-all-paths"])

    assert result.exit_code == 0
    assert isinstance(captured["config"], ServerConfig)
    assert captured["config"].unsafe_allow_all_paths is True
    assert captured["app"] is fake_app
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 7860
