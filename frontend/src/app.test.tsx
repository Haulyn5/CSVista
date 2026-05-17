import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {
  getMetadata,
  getRows,
  openPath,
  queryRows,
  uploadCsv
} from "./api/client";
import {App} from "./app";

vi.mock("./api/client", () => ({
  getMetadata: vi.fn(),
  getRows: vi.fn(),
  openPath: vi.fn(),
  queryRows: vi.fn(),
  uploadCsv: vi.fn()
}));

const getMetadataMock = vi.mocked(getMetadata);
const getRowsMock = vi.mocked(getRows);
const openPathMock = vi.mocked(openPath);
const queryRowsMock = vi.mocked(queryRows);
const uploadCsvMock = vi.mocked(uploadCsv);

const metadata = {
  file_id: "file-1",
  name: "people.csv",
  source: "path",
  size_bytes: 32,
  total_rows: 2,
  total_columns: 2,
  columns: [
    {name: "id", dtype: "Int64"},
    {name: "name", dtype: "String"}
  ]
};

const rows = {
  offset: 0,
  limit: 100,
  total_rows: 2,
  columns: metadata.columns,
  rows: [
    {id: 1, name: "Ada"},
    {id: 2, name: "Grace"}
  ]
};

describe("App row querying", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    openPathMock.mockResolvedValue({file_id: "file-1", name: "people.csv"});
    uploadCsvMock.mockResolvedValue({file_id: "file-1", name: "people.csv"});
    getMetadataMock.mockResolvedValue(metadata);
    getRowsMock.mockResolvedValue(rows);
    queryRowsMock.mockResolvedValue(rows);
  });

  it("sends search and sort through the row query endpoint", async () => {
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText("/path/inside/allowed/directory.csv"), {
      target: {value: "/tmp/people.csv"}
    });
    fireEvent.click(screen.getByRole("button", {name: "Open"}));

    const searchInput = await screen.findByPlaceholderText("Search rows");
    await waitFor(() => {
      expect((searchInput as HTMLInputElement).disabled).toBe(false);
    });

    fireEvent.change(searchInput, {target: {value: "ada"}});

    await waitFor(() => {
      expect(queryRowsMock).toHaveBeenLastCalledWith("file-1", {
        offset: 0,
        limit: 100,
        filters: [],
        sort: [],
        search: {text: "ada"}
      });
    });

    fireEvent.click(screen.getByRole("button", {name: "Sort by name"}));

    await waitFor(() => {
      expect(queryRowsMock).toHaveBeenLastCalledWith("file-1", {
        offset: 0,
        limit: 100,
        filters: [],
        sort: [{column: "name", direction: "asc"}],
        search: {text: "ada"}
      });
    });

    fireEvent.click(screen.getByRole("button", {name: "Sort by name"}));

    await waitFor(() => {
      expect(queryRowsMock).toHaveBeenLastCalledWith("file-1", {
        offset: 0,
        limit: 100,
        filters: [],
        sort: [{column: "name", direction: "desc"}],
        search: {text: "ada"}
      });
    });

    fireEvent.click(screen.getByRole("button", {name: "Sort by name"}));

    await waitFor(() => {
      expect(queryRowsMock).toHaveBeenLastCalledWith("file-1", {
        offset: 0,
        limit: 100,
        filters: [],
        sort: [],
        search: {text: "ada"}
      });
    });
  });
});
