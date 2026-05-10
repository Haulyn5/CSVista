import type { MetadataResponse } from "../api/client";
import { hashString } from "./hash";

export function metadataFingerprint(metadata: MetadataResponse, identityHint: string | null) {
  const fingerprint = JSON.stringify({
    identityHint,
    name: metadata.name,
    source: metadata.source,
    sizeBytes: metadata.size_bytes,
    totalRows: metadata.total_rows,
    columns: metadata.columns.map((column) => [column.name, column.dtype])
  });
  return hashString(fingerprint);
}
