from pathlib import Path


class PathPolicyError(ValueError):
    """Raised when a local file path violates the configured access policy."""


class PathPolicy:
    def __init__(self, allowed_dirs: list[Path]) -> None:
        if not allowed_dirs:
            raise ValueError("At least one allowed directory is required.")
        self.allowed_dirs = [path.expanduser().resolve() for path in allowed_dirs]

    def validate_csv_file(self, path: Path) -> Path:
        resolved = path.expanduser().resolve()
        if not self._is_allowed(resolved):
            raise PathPolicyError("Path is outside the configured allowed directories.")
        if not resolved.exists():
            raise PathPolicyError("Path does not exist.")
        if not resolved.is_file():
            raise PathPolicyError("Path is not a file.")
        if resolved.suffix.lower() != ".csv":
            raise PathPolicyError("Only .csv files are supported.")
        return resolved

    def _is_allowed(self, path: Path) -> bool:
        return any(path == allowed or path.is_relative_to(allowed) for allowed in self.allowed_dirs)

