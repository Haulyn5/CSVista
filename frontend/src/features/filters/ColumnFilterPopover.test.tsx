import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import type {ValueOptionsResponse} from "../../api/client";
import {queryColumnValues} from "../../api/client";
import {ColumnFilterPopover} from "./ColumnFilterPopover";

vi.mock("../../api/client", () => ({
  queryColumnValues: vi.fn()
}));

const queryColumnValuesMock = vi.mocked(queryColumnValues);

function deferredResponse() {
  let resolve!: (value: ValueOptionsResponse) => void;
  const promise = new Promise<ValueOptionsResponse>((nextResolve) => {
    resolve = nextResolve;
  });
  return {promise, resolve};
}

describe("ColumnFilterPopover", () => {
  it("ignores stale load-more responses after the search changes", async () => {
    const initialRequest = deferredResponse();
    const loadMoreRequest = deferredResponse();
    const searchRequest = deferredResponse();

    queryColumnValuesMock
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(loadMoreRequest.promise)
      .mockReturnValueOnce(searchRequest.promise);

    render(
      <ColumnFilterPopover
        fileId="file-1"
        columnName="name"
        activeFilters={[]}
        selectedValues={[]}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />
    );

    initialRequest.resolve({
      column: "name",
      offset: 0,
      limit: 100,
      total_values: 2,
      values: [{value: {kind: "value", value: "Ada"}, display: "Ada", count: 3}]
    });

    expect(await screen.findByText("Ada")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", {name: "Load more"}));
    fireEvent.change(screen.getByPlaceholderText("Search values"), {target: {value: "gr"}});

    searchRequest.resolve({
      column: "name",
      offset: 0,
      limit: 100,
      total_values: 1,
      values: [{value: {kind: "value", value: "Grace"}, display: "Grace", count: 1}]
    });

    expect(await screen.findByText("Grace")).toBeTruthy();

    loadMoreRequest.resolve({
      column: "name",
      offset: 1,
      limit: 100,
      total_values: 2,
      values: [{value: {kind: "value", value: "Stale"}, display: "Stale", count: 1}]
    });

    await waitFor(() => {
      expect(screen.queryByText("Stale")).toBeNull();
    });
    expect(queryColumnValuesMock).toHaveBeenNthCalledWith(2, "file-1", {
      column: "name",
      search: "",
      offset: 1,
      limit: 100,
      filters: []
    });
    expect(queryColumnValuesMock).toHaveBeenNthCalledWith(3, "file-1", {
      column: "name",
      search: "gr",
      offset: 0,
      limit: 100,
      filters: []
    });
  });
});
