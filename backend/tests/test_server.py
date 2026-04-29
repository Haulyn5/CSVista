from pathlib import Path

from fastapi.routing import APIRoute
from starlette.routing import Mount

from csvista.config import ServerConfig
from csvista.server import create_app


def test_root_returns_frontend_fallback_when_dist_is_missing(tmp_path: Path) -> None:
    app = create_app(ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"))
    route = next(route for route in app.routes if isinstance(route, APIRoute) and route.path == "/")
    response = route.endpoint()

    assert response.status_code == 200
    assert "CSVista backend is running" in response.body.decode()


def test_api_still_works_with_frontend_fallback(tmp_path: Path) -> None:
    app = create_app(ServerConfig(allowed_dirs=[tmp_path], frontend_dist=tmp_path / "missing"))

    assert any(isinstance(route, APIRoute) and route.path == "/api/health" for route in app.routes)


def test_create_app_wires_unsafe_all_paths_mode(tmp_path: Path) -> None:
    app = create_app(
        ServerConfig(
            allowed_dirs=[tmp_path],
            frontend_dist=tmp_path / "missing",
            unsafe_allow_all_paths=True,
        )
    )

    assert app.state.path_policy.allow_all_paths is True


def test_serves_built_frontend_when_dist_exists(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>CSVista UI</body></html>")

    app = create_app(ServerConfig(allowed_dirs=[tmp_path], frontend_dist=dist))

    assert any(isinstance(route, Mount) and route.path == "" for route in app.routes)
