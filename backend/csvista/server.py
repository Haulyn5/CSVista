from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from csvista.api.files import create_files_router
from csvista.api.health import router as health_router
from csvista.config import ServerConfig
from csvista.core.file_registry import FileRegistry
from csvista.core.path_policy import PathPolicy


def create_app(config: ServerConfig | None = None) -> FastAPI:
    config = config or ServerConfig()
    app = FastAPI(title="CSVista", version="0.1.0")

    path_policy = PathPolicy(
        config.resolved_allowed_dirs(),
        allow_all_paths=config.unsafe_allow_all_paths,
    )
    registry = FileRegistry()

    app.state.config = config
    app.state.path_policy = path_policy
    app.state.registry = registry

    app.include_router(health_router, prefix="/api")
    app.include_router(create_files_router(registry, path_policy, config), prefix="/api")
    mount_frontend(app, config)
    return app


def mount_frontend(app: FastAPI, config: ServerConfig) -> None:
    frontend_dist = config.frontend_dist or default_frontend_dist()
    index_html = frontend_dist / "index.html"

    if index_html.exists():
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
        return

    @app.get("/", include_in_schema=False)
    def frontend_not_built() -> HTMLResponse:
        return HTMLResponse(
            """
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>CSVista</title>
                <style>
                  body {
                    color: #18212f;
                    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    margin: 0;
                    padding: 40px;
                    background: #f6f7f9;
                  }
                  main {
                    background: white;
                    border: 1px solid #dce1e8;
                    border-radius: 8px;
                    max-width: 760px;
                    padding: 24px;
                  }
                  h1 { margin: 0 0 12px; }
                  p { color: #475467; line-height: 1.6; }
                  code {
                    background: #eef4f3;
                    border-radius: 4px;
                    color: #245a55;
                    padding: 2px 5px;
                  }
                </style>
              </head>
              <body>
                <main>
                  <h1>CSVista backend is running</h1>
                  <p>
                    The frontend build was not found. To serve the browser UI from this
                    port, run <code>pnpm --dir frontend build</code> and restart
                    <code>csvista serve</code>.
                  </p>
                  <p>
                    For hot-reload development, keep this backend running and start
                    <code>pnpm dev</code>, then open <code>http://127.0.0.1:5173</code>.
                  </p>
                </main>
              </body>
            </html>
            """
        )

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> Response:
        return Response(status_code=204)


def default_frontend_dist() -> Path:
    package_dist = Path(__file__).resolve().parent / "frontend" / "dist"
    if package_dist.exists():
        return package_dist
    return Path(__file__).resolve().parents[2] / "frontend" / "dist"
