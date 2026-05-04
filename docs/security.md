# Security Model

CSVista is local-first, but it still exposes a web service that can read files.
Filesystem access therefore needs explicit boundaries.

## Defaults

- Bind to `127.0.0.1` by default.
- Allow local path reads only under the process working directory by default.
- Require explicit `--allow-dir` values for additional directories.
- Provide `--unsafe-allow-all-paths` as an explicit dangerous escape hatch for
  trusted local-only sessions that need to open CSV files from any local path.
- Store uploads in a managed temporary directory.
- Do not fetch remote URLs in the MVP.

## Local Path Policy

Every user-provided local path must be resolved before use:

1. Expand user syntax such as `~`.
2. Resolve symlinks and relative path segments.
3. Check that the resolved path is inside one of the allowed directories.
4. Reject directories, missing files, and non-CSV file extensions by default.

This prevents path traversal such as:

```text
../../etc/passwd
```

and symlink escapes from an allowed directory.

When the service is started with `--unsafe-allow-all-paths`, step 3 is skipped.
The service still resolves paths and still rejects directories, missing files,
and non-CSV file extensions. This mode is not appropriate for services exposed
to an untrusted network.

## Network Exposure

The service should warn when binding to a non-loopback host such as `0.0.0.0`.
CSVista is not designed to be safely exposed to an untrusted network without an
additional authentication and authorization layer.

## Uploads

Upload handling should enforce:

- maximum file size;
- controlled temporary storage;
- generated internal file IDs;
- no execution of file contents;
- cleanup of stale uploaded files.

## Sensitive Data

CSV files often contain private data. CSVista should avoid telemetry by default,
avoid sending data outside the local service, and make any future external
integration opt-in.

The browser UI stores per-file table layout preferences in `localStorage` so a
CSV can reopen with the remembered column order, visibility, widths, and wrapping
settings. It also stores global display preferences, such as whether newline
characters inside cell values are shown as line breaks. This storage is local to
the browser and does not include row values, but per-file layout state can
include column names and layout metadata. Users handling especially sensitive
schemas should clear browser site data if that local metadata should not remain
on the machine.
