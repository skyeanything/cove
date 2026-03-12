// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createStoreReset } from "@/test-utils/mock-store";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useFilePreviewStore } from "@/stores/filePreviewStore";
import { usePreviewContent, isTextKind, isDataUrlKind } from "./usePreviewContent";

const mockInvoke = vi.mocked(invoke);
const resetStore = createStoreReset(useFilePreviewStore);

afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("isTextKind", () => {
  it("returns true for text kinds", () => {
    expect(isTextKind("txt")).toBe(true);
    expect(isTextKind("md")).toBe(true);
    expect(isTextKind("code")).toBe(true);
    expect(isTextKind("csv")).toBe(true);
    expect(isTextKind("html")).toBe(true);
  });

  it("returns false for non-text kinds", () => {
    expect(isTextKind("image")).toBe(false);
    expect(isTextKind("pdf")).toBe(false);
  });
});

describe("isDataUrlKind", () => {
  it("returns true for data URL kinds", () => {
    expect(isDataUrlKind("image")).toBe(true);
    expect(isDataUrlKind("pdf")).toBe(true);
    expect(isDataUrlKind("office")).toBe(true);
  });

  it("returns false for non-data-url kinds", () => {
    expect(isDataUrlKind("txt")).toBe(false);
    expect(isDataUrlKind("md")).toBe(false);
  });
});

describe("usePreviewContent", () => {
  it("returns null cached when path is null", () => {
    const { result } = renderHook(() => usePreviewContent(null, null));
    expect(result.current.cached).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("skips loading for relative path without workspaceRoot", () => {
    const { result } = renderHook(() => usePreviewContent("file.md", null));
    expect(result.current.loading).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("calls read_file_raw for relative text file with workspace", async () => {
    mockInvoke.mockResolvedValueOnce("file content");

    const { result } = renderHook(() => usePreviewContent("file.md", "/workspace"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockInvoke).toHaveBeenCalledWith("read_file_raw", {
      args: { workspaceRoot: "/workspace", path: "file.md" },
    });
    expect(result.current.cached?.type).toBe("text");
  });

  it("calls read_absolute_file for absolute text file path", async () => {
    mockInvoke.mockResolvedValueOnce("skill content");

    const { result } = renderHook(() =>
      usePreviewContent("/home/user/.cove/skills/my-skill/SKILL.md", null),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockInvoke).toHaveBeenCalledWith("read_absolute_file", {
      args: { path: "/home/user/.cove/skills/my-skill/SKILL.md" },
    });
    expect(result.current.cached?.type).toBe("text");
  });

  it("calls read_absolute_file_as_data_url for absolute image path", async () => {
    mockInvoke.mockResolvedValueOnce({ dataUrl: "data:image/png;base64,abc" });

    const { result } = renderHook(() => usePreviewContent("/abs/photo.png", null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockInvoke).toHaveBeenCalledWith("read_absolute_file_as_data_url", {
      args: { path: "/abs/photo.png" },
    });
    expect(result.current.cached?.type).toBe("dataUrl");
  });

  it("sets error on invoke failure", async () => {
    mockInvoke.mockRejectedValueOnce({ kind: "NotFound", message: "file not found" });

    const { result } = renderHook(() => usePreviewContent("/abs/missing.md", null));

    await waitFor(() => expect(result.current.error).toBe("file not found"));
    expect(result.current.loading).toBe(false);
  });

  it("returns cached content without re-invoking", async () => {
    useFilePreviewStore.getState().setContent("/abs/file.md", {
      path: "/abs/file.md",
      type: "text",
      text: "cached",
      mtime: Date.now(),
    });

    const { result } = renderHook(() => usePreviewContent("/abs/file.md", null));

    expect(result.current.cached?.type).toBe("text");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
