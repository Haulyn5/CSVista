# Development Setup

CSVista uses a project-local Conda environment for Python and frontend tooling.
The recommended environment path is `.conda-env/` inside the repository.

The default project configuration is optimized for servers in mainland China:

- Conda packages use the Tsinghua `conda-forge` mirror.
- Python packages use the Tsinghua PyPI mirror during environment creation.
- Frontend packages use the `npmmirror` registry from `.npmrc`.
- pnpm stores downloaded packages in the project-local `.pnpm-store/`.

## Create the Environment

From the repository root:

```bash
conda env create --prefix ./.conda-env --file environment.yml
```

Activate it:

```bash
conda activate ./.conda-env
```

If the global Conda package cache is not writable, use project-local cache
directories:

```bash
CONDA_PKGS_DIRS="$PWD/.conda-pkgs" \
XDG_CACHE_HOME="$PWD/.cache" \
conda env create --prefix ./.conda-env --file environment.yml
```

The environment installs:

- Python 3.11
- backend runtime dependencies from `pyproject.toml`
- backend development dependencies such as `pytest` and `ruff`
- Node.js 22
- `pnpm`

## Install Frontend Dependencies

After activating the Conda environment:

```bash
pnpm install
```

## Run Checks

Backend tests:

```bash
python -m pytest backend/tests
```

Backend syntax check:

```bash
python -m compileall backend/csvista backend/tests
```

Frontend type check:

```bash
pnpm --dir frontend lint
```

## Run the App

### Single-Port Mode

Build the frontend and start the backend:

```bash
pnpm --dir frontend build
csvista serve --allow-dir examples
```

Open:

```text
http://127.0.0.1:7860
```

In this mode FastAPI serves both the API and the built frontend from the same
port. The Vite build writes to `backend/csvista/frontend/dist/` so the assets can
also be included in Python wheels. If the built `index.html` is missing, the
root page shows a setup message instead of a 404.

### Hot-Reload Development Mode

Start the backend:

```bash
csvista serve --allow-dir examples
```

In another terminal with the same Conda environment active, start the Vite
frontend:

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:5173
```

The Vite development server proxies `/api` requests to the backend at
`http://127.0.0.1:7860`.

## Recreate the Environment

If dependencies drift or the environment becomes inconsistent:

```bash
conda env remove --prefix ./.conda-env
conda env create --prefix ./.conda-env --file environment.yml
```

For restricted servers, recreate with local cache directories:

```bash
CONDA_PKGS_DIRS="$PWD/.conda-pkgs" \
XDG_CACHE_HOME="$PWD/.cache" \
conda env create --prefix ./.conda-env --file environment.yml
```
