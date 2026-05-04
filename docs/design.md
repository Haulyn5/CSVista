# CSVista Design

## Product Shape

CSVista runs as a local web service. A user starts the service from a terminal,
opens the browser UI, and chooses either:

- a CSV file upload; or
- a local CSV path that is inside an allowed directory, unless the service was
  started with the explicit unsafe all-paths mode.

The application should feel like a data inspection tool, not a marketing page:
the first screen is an open-file workflow, and the main screen is the table
browser.

## Architecture

CSVista is split into a backend API and a frontend client.

```text
Browser UI
   |
   | HTTP JSON
   v
FastAPI backend
   |
   +-- path policy
   +-- file registry
   +-- CSV loader
   +-- query/profiling layer
```

### Backend Responsibilities

- Validate local file paths against configured allow directories unless unsafe
  all-paths mode is explicitly enabled.
- Accept uploads into a managed temporary storage area.
- Register opened files and return opaque file IDs.
- Infer metadata and column types.
- Serve paginated row data.
- Cache the most recently read file snapshot to reduce repeated parsing during
  browsing.
- Planned: detect CSV parsing options such as delimiter and encoding, and
  provide column-level profile summaries.

### Frontend Responsibilities

- Provide upload and local-path open flows.
- Render metadata and table data clearly.
- Request only the row windows needed for the current view.
- Present loading, error, and empty states.
- Let users adjust the table layout with column visibility toggles, column
  reordering, column resizing, and per-column text wrapping.
- Let users choose whether newline characters inside cell values are rendered as
  line breaks. This is a global display preference, separate from per-column
  wrapping.
- Persist table layout preferences in browser storage per CSV so reopening the
  same file restores the remembered layout.
- Planned: keep richer interaction state such as selected columns, filters, and
  sorting.

## API Sketch

```text
GET  /api/health
POST /api/files/upload
POST /api/files/open-path
GET  /api/files/{file_id}/metadata
GET  /api/files/{file_id}/rows?offset=0&limit=100
GET  /api/files/{file_id}/columns
GET  /api/files/{file_id}/profile
POST /api/files/{file_id}/query
```

Rows are returned as a page:

```json
{
  "offset": 0,
  "limit": 100,
  "total_rows": 1234,
  "columns": [
    {"name": "id", "dtype": "int64"},
    {"name": "name", "dtype": "string"}
  ],
  "rows": [
    {"id": 1, "name": "Ada"}
  ]
}
```

## CSV Loading Strategy

The initial implementation can optimize for correctness and simplicity:

1. Read metadata and a sample with Polars.
2. Cache a lightweight file descriptor in the registry.
3. Serve paginated rows by slicing with Polars.

Future large-file work can add:

- persistent file indexes;
- lazy query plans;
- DuckDB-backed querying;
- background profiling jobs;
- streaming row windows.

## UI Principles

- Dense but readable table layout.
- Sticky column headers and row numbers.
- Zebra striping and hover states.
- Numeric values right-aligned.
- Null and empty values visually distinct but quiet.
- Long values truncated with a detail expansion path.
- Cell-internal newline rendering should be user-controlled so dense browsing
  remains compact by default while multiline values can be inspected when
  needed.
- Column metadata visible near the table, not buried in settings.
- User-adjusted table layouts should be recoverable through a reset action, and
  remembered layout state should be scoped to the CSV rather than global across
  unrelated files.

## Initial Project Milestones

1. Project scaffold and documentation.
2. Backend file registry, path policy, and CSV row APIs.
3. Frontend open-file page and viewer page.
4. Table interactions: pagination, hiding, reordering, resizing, wrapping,
   cell-line-break display, and per-file layout memory.
5. Column profiling.
6. Packaging into a single installable CLI.

Future table work includes virtual scrolling, sorting, and search.
