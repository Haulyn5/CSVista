from pathlib import Path
from typing import Annotated

import typer
import uvicorn

from csvista.config import ServerConfig
from csvista.server import create_app

app = typer.Typer(help="CSVista local CSV browser.", no_args_is_help=True)


@app.callback()
def main() -> None:
    """CSVista command line interface."""


@app.command()
def serve(
    host: Annotated[str, typer.Option(help="Host address to bind.")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="Port to bind.")] = 7860,
    allow_dir: Annotated[
        list[Path] | None,
        typer.Option("--allow-dir", help="Directory that CSVista may read local CSV files from."),
    ] = None,
    unsafe_allow_all_paths: Annotated[
        bool,
        typer.Option(
            "--unsafe-allow-all-paths",
            help="Dangerous: allow opening CSV files from any local path, ignoring --allow-dir.",
        ),
    ] = False,
) -> None:
    """Start the CSVista web service."""
    allowed_dirs = allow_dir or [Path.cwd()]
    if host not in {"127.0.0.1", "localhost", "::1"}:
        typer.echo(
            "Warning: CSVista is designed for trusted local use. "
            f"Binding to {host!r} may expose local file browsing APIs."
        )
    if unsafe_allow_all_paths:
        typer.echo(
            "Warning: --unsafe-allow-all-paths disables local path allow-dir restrictions. "
            "Only use it on a trusted machine and network."
        )

    config = ServerConfig(
        allowed_dirs=allowed_dirs,
        unsafe_allow_all_paths=unsafe_allow_all_paths,
    )
    uvicorn.run(create_app(config), host=host, port=port)


if __name__ == "__main__":
    app()
