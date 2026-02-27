import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: { getState: vi.fn() },
}));
vi.mock("@/stores/dataStore", () => ({
  useDataStore: { getState: vi.fn() },
}));
vi.mock("../file-time", () => ({
  recordRead: vi.fn(),
  assertReadBeforeWrite: vi.fn(),
}));
vi.mock("diff", () => ({ createPatch: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { assertReadBeforeWrite, recordRead } from "../file-time";
import { createPatch } from "diff";
import { writeTool } from "./write";

const mockInvoke = vi.mocked(invoke);
const mockWsGetState = vi.mocked(useWorkspaceStore.getState);
const mockDataGetState = vi.mocked(useDataStore.getState);
const mockAssert = vi.mocked(assertReadBeforeWrite);
const mockRecordRead = vi.mocked(recordRead);
const mockCreatePatch = vi.mocked(createPatch);

const exec = (args: { filePath: string; content: string }) =>
  writeTool.execute(args, {} as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockWsGetState.mockReturnValue({
    activeWorkspace: { id: "ws-1", path: "/workspace" },
  } as ReturnType<typeof mockWsGetState>);
  mockDataGetState.mockReturnValue({
    activeConversationId: "conv-123",
  } as ReturnType<typeof mockDataGetState>);
  mockAssert.mockReturnValue({ ok: true });
  mockCreatePatch.mockReturnValue("mock-diff");

  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "read_file") return "00001| old content";
    if (cmd === "stat_file") return { mtime_secs: 1000, is_dir: false };
    if (cmd === "write_file") return undefined;
    return undefined;
  });
});

describe("writeTool", () => {
  // --- success: overwrite existing file ---

  it("overwrites existing file with diff", async () => {
    const result = await exec({ filePath: "src/a.ts", content: "new content" });

    expect(mockInvoke).toHaveBeenCalledWith("stat_file", {
      args: { workspaceRoot: "/workspace", path: "src/a.ts" },
    });
    expect(mockAssert).toHaveBeenCalledWith("conv-123", "/workspace/src/a.ts", 1000);
    expect(mockInvoke).toHaveBeenCalledWith("write_file", {
      args: { workspaceRoot: "/workspace", path: "src/a.ts", content: "new content" },
    });
    expect(mockRecordRead).toHaveBeenCalledWith("conv-123", "/workspace/src/a.ts");
    expect(mockCreatePatch).toHaveBeenCalledWith("src/a.ts", "old content", "new content");
    expect(result).toContain("已写入");
    expect(result).toContain("mock-diff");
  });

  // --- success: create new file ---

  it("creates new file when stat_file throws NotFound", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") throw { kind: "NotFound" };
      if (cmd === "write_file") return undefined;
      return undefined;
    });

    const result = await exec({ filePath: "new.ts", content: "hello" });

    expect(mockAssert).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith("write_file", {
      args: { workspaceRoot: "/workspace", path: "new.ts", content: "hello" },
    });
    expect(result).toContain("已创建并写入");
  });

  // --- no conversationId ---

  it("skips recordRead when no conversationId", async () => {
    mockDataGetState.mockReturnValue({
      activeConversationId: null,
    } as unknown as ReturnType<typeof mockDataGetState>);

    await exec({ filePath: "a.ts", content: "x" });

    expect(mockRecordRead).not.toHaveBeenCalled();
  });

  // --- no workspace ---

  it("returns prompt when no active workspace", async () => {
    mockWsGetState.mockReturnValue({
      activeWorkspace: null,
    } as unknown as ReturnType<typeof mockWsGetState>);

    const result = await exec({ filePath: "a.ts", content: "x" });

    expect(result).toContain("请先在输入框上方选择工作区目录");
  });

  // --- directory check ---

  it("returns error when path is a directory", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") return { mtime_secs: 1000, is_dir: true };
      return undefined;
    });

    const result = await exec({ filePath: "src/", content: "x" });

    expect(result).toContain("该路径是目录");
  });

  // --- assertReadBeforeWrite failure ---

  it("returns message when read-before-write check fails", async () => {
    mockAssert.mockReturnValue({ ok: false, message: "请先读取文件" });

    const result = await exec({ filePath: "a.ts", content: "x" });

    expect(result).toBe("请先读取文件");
  });

  // --- FsError at stat phase ---

  it("handles OutsideWorkspace at stat phase", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") throw { kind: "OutsideWorkspace" };
      return undefined;
    });

    const result = await exec({ filePath: "../../etc/passwd", content: "x" });

    expect(result).toContain("不在当前工作区内");
  });

  // --- FsError at write phase ---

  it("handles OutsideWorkspace at write phase", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") throw { kind: "NotFound" };
      if (cmd === "write_file") throw { kind: "OutsideWorkspace" };
      return undefined;
    });

    const result = await exec({ filePath: "a.ts", content: "x" });

    expect(result).toContain("不在当前工作区内");
  });

  it("handles NotAllowed at write phase", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") throw { kind: "NotFound" };
      if (cmd === "write_file") throw { kind: "NotAllowed", message: "read-only" };
      return undefined;
    });

    const result = await exec({ filePath: "a.ts", content: "x" });

    expect(result).toContain("read-only");
  });

  // --- non-FsError ---

  it("handles plain Error at stat phase", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") throw new Error("disk error");
      return undefined;
    });

    const result = await exec({ filePath: "a.ts", content: "x" });

    expect(result).toContain("写入前检查失败");
    expect(result).toContain("disk error");
  });

  it("handles plain Error at write phase", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "stat_file") throw { kind: "NotFound" };
      if (cmd === "write_file") throw new Error("io error");
      return undefined;
    });

    const result = await exec({ filePath: "a.ts", content: "x" });

    expect(result).toContain("写入失败");
    expect(result).toContain("io error");
  });
});
