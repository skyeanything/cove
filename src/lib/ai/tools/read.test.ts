import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: { getState: vi.fn() },
}));
vi.mock("@/stores/dataStore", () => ({
  useDataStore: { getState: vi.fn() },
}));
vi.mock("../file-time", () => ({ recordRead: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { recordRead } from "../file-time";
import { readTool } from "./read";

const mockInvoke = vi.mocked(invoke);
const mockWsGetState = vi.mocked(useWorkspaceStore.getState);
const mockDataGetState = vi.mocked(useDataStore.getState);
const mockRecordRead = vi.mocked(recordRead);

const exec = (args: { filePath: string; offset?: number; limit?: number }) =>
  readTool.execute(args, {} as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockWsGetState.mockReturnValue({
    activeWorkspace: { id: "ws-1", path: "/workspace" },
  } as ReturnType<typeof mockWsGetState>);
  mockDataGetState.mockReturnValue({
    activeConversationId: "conv-123",
  } as ReturnType<typeof mockDataGetState>);
  mockInvoke.mockResolvedValue("00001| line 1\n00002| line 2");
});

describe("readTool", () => {
  // --- success paths ---

  it("reads file and calls recordRead", async () => {
    const result = await exec({ filePath: "src/main.ts" });

    expect(mockInvoke).toHaveBeenCalledWith("read_file", {
      args: {
        workspaceRoot: "/workspace",
        path: "src/main.ts",
        offset: undefined,
        limit: 2000,
      },
    });
    expect(mockRecordRead).toHaveBeenCalledWith("conv-123", "/workspace/src/main.ts");
    expect(result).toBe("00001| line 1\n00002| line 2");
  });

  it("passes offset and limit to invoke", async () => {
    await exec({ filePath: "a.ts", offset: 10, limit: 50 });

    expect(mockInvoke).toHaveBeenCalledWith("read_file", {
      args: { workspaceRoot: "/workspace", path: "a.ts", offset: 10, limit: 50 },
    });
  });

  it("resolves absolute path correctly", async () => {
    await exec({ filePath: "/abs/path.ts" });

    expect(mockRecordRead).toHaveBeenCalledWith("conv-123", "/abs/path.ts");
  });

  it("skips recordRead when no activeConversationId", async () => {
    mockDataGetState.mockReturnValue({
      activeConversationId: null,
    } as unknown as ReturnType<typeof mockDataGetState>);

    await exec({ filePath: "a.ts" });

    expect(mockRecordRead).not.toHaveBeenCalled();
  });

  // --- no workspace ---

  it("returns prompt when no active workspace", async () => {
    mockWsGetState.mockReturnValue({
      activeWorkspace: null,
    } as unknown as ReturnType<typeof mockWsGetState>);

    const result = await exec({ filePath: "a.ts" });

    expect(result).toContain("请先在输入框上方选择工作区目录");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // --- FsError branches ---

  it("handles OutsideWorkspace error", async () => {
    mockInvoke.mockRejectedValue({ kind: "OutsideWorkspace" });

    const result = await exec({ filePath: "../../etc/passwd" });

    expect(result).toContain("不在当前工作区内");
  });

  it("handles NotFound error", async () => {
    mockInvoke.mockRejectedValue({ kind: "NotFound" });

    const result = await exec({ filePath: "missing.ts" });

    expect(result).toContain("文件不存在");
    expect(result).toContain("missing.ts");
  });

  it("handles BinaryFile error", async () => {
    mockInvoke.mockRejectedValue({ kind: "BinaryFile" });

    const result = await exec({ filePath: "img.png" });

    expect(result).toContain("二进制");
  });

  it("handles TooLarge error", async () => {
    mockInvoke.mockRejectedValue({ kind: "TooLarge" });

    const result = await exec({ filePath: "huge.log" });

    expect(result).toContain("250KB");
  });

  it("handles NotAllowed with message", async () => {
    mockInvoke.mockRejectedValue({ kind: "NotAllowed", message: ".env is blocked" });

    const result = await exec({ filePath: ".env" });

    expect(result).toContain(".env is blocked");
  });

  it("handles NotAllowed without message", async () => {
    mockInvoke.mockRejectedValue({ kind: "NotAllowed" });

    const result = await exec({ filePath: ".env" });

    expect(result).toContain("无法读取该路径");
  });

  // --- non-FsError ---

  it("handles plain Error", async () => {
    mockInvoke.mockRejectedValue(new Error("network timeout"));

    const result = await exec({ filePath: "a.ts" });

    expect(result).toContain("读取失败");
    expect(result).toContain("network timeout");
  });
});
