# API Notes

This document tracks the planned HTTP API. It is intentionally small while the
project is in the MVP phase.

## Health

```text
GET /api/health
```

Returns service status.

## Open Local Path

```text
POST /api/files/open-path
```

Request:

```json
{
  "path": "/allowed/data/file.csv"
}
```

Response:

```json
{
  "file_id": "opaque-id",
  "name": "file.csv"
}
```

## Upload

```text
POST /api/files/upload
```

Accepts multipart form data with a `file` field.

## Metadata

```text
GET /api/files/{file_id}/metadata
```

Returns file name, size, row count, column count, and inferred columns.

## Rows

```text
GET /api/files/{file_id}/rows?offset=0&limit=100
```

Returns a page of rows and column metadata.

## Query Rows

```text
POST /api/files/{file_id}/rows/query
```

Request:

```json
{
  "offset": 0,
  "limit": 100,
  "filters": [
    {
      "column": "team",
      "values": [{"kind": "value", "value": "core"}]
    },
    {
      "column": "note",
      "values": [{"kind": "null"}]
    }
  ],
  "sort": [
    {"column": "name", "direction": "asc"}
  ],
  "search": {
    "text": "ada"
  }
}
```

Returns the same shape as the unfiltered rows endpoint. `total_rows` is the
number of rows after filters and search are applied. Multiple values within one
column are ORed together; filters across columns are ANDed together.
`{"kind": "null"}` is distinct from `{"kind": "value", "value": ""}`.

Search is a case-insensitive substring match across all columns by default. A
request may include `search.columns` to limit search to specific columns.
Sorting accepts one or more sort specs, although the current frontend sends one
column at a time.

## Filter Value Options

```text
POST /api/files/{file_id}/values/query
```

Request:

```json
{
  "column": "name",
  "search": "ad",
  "offset": 0,
  "limit": 100,
  "filters": [
    {
      "column": "team",
      "values": [{"kind": "value", "value": "core"}]
    }
  ]
}
```

Response:

```json
{
  "column": "name",
  "offset": 0,
  "limit": 100,
  "total_values": 1,
  "values": [
    {
      "value": {"kind": "value", "value": "Ada"},
      "display": "Ada",
      "count": 12
    }
  ]
}
```

The value options endpoint returns paginated unique values for one column with
row counts. Options are narrowed by other active filters, while the current
column's own filter is ignored so users can add or remove values for that
column.

CSV parsing failures return `422` with a JSON `detail` message. Missing file IDs
return `404`, invalid pagination parameters or unknown query columns return
`400`, and uploads that exceed the configured limit return `413`.
