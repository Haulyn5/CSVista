export type ColumnInfo = {
  name: string;
  dtype: string;
};

export type FileOpenResponse = {
  file_id: string;
  name: string;
};

export type MetadataResponse = {
  file_id: string;
  name: string;
  source: string;
  size_bytes: number;
  total_rows: number;
  total_columns: number;
  columns: ColumnInfo[];
};

export type RowsResponse = {
  offset: number;
  limit: number;
  total_rows: number;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
};

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "";
  }
  try {
    const body = JSON.parse(text) as {detail?: unknown};
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    return text;
  }
  return text;
}

export async function openPath(path: string): Promise<FileOpenResponse> {
  return requestJson<FileOpenResponse>("/api/files/open-path", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({path})
  });
}

export async function uploadCsv(file: File): Promise<FileOpenResponse> {
  const body = new FormData();
  body.append("file", file);
  return requestJson<FileOpenResponse>("/api/files/upload", {
    method: "POST",
    body
  });
}

export async function getMetadata(fileId: string): Promise<MetadataResponse> {
  return requestJson<MetadataResponse>(`/api/files/${fileId}/metadata`);
}

export async function getRows(fileId: string, offset: number, limit: number): Promise<RowsResponse> {
  const params = new URLSearchParams({offset: String(offset), limit: String(limit)});
  return requestJson<RowsResponse>(`/api/files/${fileId}/rows?${params}`);
}
