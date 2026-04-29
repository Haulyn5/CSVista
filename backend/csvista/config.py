from pathlib import Path

from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    allowed_dirs: list[Path] = Field(default_factory=lambda: [Path.cwd()])
    unsafe_allow_all_paths: bool = False
    max_upload_bytes: int = 256 * 1024 * 1024
    frontend_dist: Path | None = None

    def resolved_allowed_dirs(self) -> list[Path]:
        return [path.expanduser().resolve() for path in self.allowed_dirs]
