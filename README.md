# CSVista

CSVista is a local-first CSV browser for fast opening and inspecting CSV files directly in the browser.

Tailored for developers, data analysts and researchers, it provides a lightweight way to explore CSV data without loading files into notebooks or traditional spreadsheets.

Frustrated by the lack of satisfying VS Code extensions for large CSV files, I built CSVista to handle oversized CSV files generated from experimental data. Hope it also helps others with the same pain points.

## Goals

- Open CSV files from upload or from explicitly allowed local paths.
- Render tabular data in a readable, high-density browser interface.
- Page through CSV rows without sending the full dataset to the client.
- Provide useful metadata: row count, column count, file size, and inferred
  column types.
- Customize the table layout with column hiding, drag-and-drop column ordering,
  column resizing, and per-column wrapping.
- Filter rows by selecting one or more exact values for any column.
- Sort rows by column and search across row values.
- Toggle whether newline characters inside cell values are rendered as line
  breaks.
- Remember table layout and filter preferences per CSV in browser storage when
  the same file is opened again.
- Keep local filesystem access explicit and constrained.

## Non-Goals (for now)

- CSV editing and saving.
- Cloud storage or multi-user collaboration.
- Spreadsheet formula support.
- Arbitrary remote URL ingestion.
- Full database replacement or general SQL workbench behavior.

## Planned Quick Start

The first stable CLI target is:

```bash
csvista serve
```

By default the service should bind to `127.0.0.1` and allow opening CSV files
under the current working directory. Additional local directories must be
enabled explicitly:

```bash
csvista serve --allow-dir /path/to/datasets
```

Then open:

```text
http://127.0.0.1:7860
```

If the frontend has not been built yet, build it once before starting the
single-port service. The build output is written under the backend package so it
can be served by `csvista serve` and included in wheels:

```bash
pnpm --dir frontend build
csvista serve --allow-dir examples
```

For frontend development with hot reload, run `csvista serve --allow-dir
examples` for the backend and `pnpm dev` for the Vite frontend, then open
`http://127.0.0.1:5173`.

## Development Setup

Create the project-local Conda environment:

```bash
conda env create --prefix ./.conda-env --file environment.yml
conda activate ./.conda-env
```

The environment file is configured for mainland China mirrors. On systems where
the global Conda cache is not writable, use project-local caches:

```bash
CONDA_PKGS_DIRS="$PWD/.conda-pkgs" \
XDG_CACHE_HOME="$PWD/.cache" \
conda env create --prefix ./.conda-env --file environment.yml
```

Install frontend dependencies:

```bash
pnpm install
```

Run the full local check suite:

```bash
pnpm check
```

See [docs/development.md](docs/development.md) for the full development
workflow.

## MVP Scope

- Start a local FastAPI service.
- Upload CSV files.
- Open CSV files from allowed local directories.
- Return file metadata and paginated rows through an API.
- Display rows in a responsive paginated web table.
- Support column hiding, column reordering, column resizing, per-column text
  wrapping, exact-value filtering, column sorting, simple row search, a global
  display setting for cell line breaks, and resettable per-file layout memory
  in the browser.
- Cache the most recently read file snapshot to avoid repeated parsing during
  normal browsing.

## Planned Features

- Detect common encodings and delimiters.
- Support virtual scrolling.
- Add missing-value summaries, sample values, and basic column profiling.

## Repository Layout

```text
backend/      FastAPI service, CSV loading, path policy, query layer
frontend/     Vite + React browser UI
docs/         Architecture, API, and security notes
examples/     Small sample CSV files for testing and demos
```

## Development Status

CSVista is in initial design and scaffolding. The public API and package layout
may change before the first release.
