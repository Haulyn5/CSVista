# Security Model

CSVista is local-first, but it still exposes a web service that can read files.
Filesystem access therefore needs explicit boundaries.

## Defaults

- Bind to `127.0.0.1` by default.
- Allow local path reads only under the process working directory by default.
- Require explicit `--allow-dir` values for additional directories.
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

