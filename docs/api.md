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

CSV parsing failures return `422` with a JSON `detail` message. Missing file IDs
return `404`, invalid pagination parameters return `400`, and uploads that
exceed the configured limit return `413`.
