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
import { editTool } from "./edit";

const mockInvoke = vi.mocked(invoke);
const mockWsGetState = vi.mocked(useWorkspaceStore.getState);
const mockDataGetState = vi.mocked(useDataStore.getState);
const mockAssert = vi.mocked(assertReadBeforeWrite);
const mockRecordRead = vi.mocked(recordRead);
const mockCreatePatch = vi.mocked(createPatch);

type EditArgs = {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
};

const exec = (args: EditArgs) => editTool.execute(args, {} as never);

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
    if (cmd === "read_file") return "00001| hello world";
    if (cmd === "stat_file") return { mtime_secs: 1000, is_dir: false };
    if (cmd === "write_file") return undefined;
    return undefined;
  });
});

describe("editTool", () => {
  // --- no workspace ---

  it("returns prompt when no active workspace", async () => {
    mockWsGetState.mockReturnValue({
      activeWorkspace: null,
    } as unknown as ReturnType<typeof mockWsGetState>);

    const result = await exec({ filePath: "a.ts", oldString: "a", newString: "b" });

    expect(result).toContain("请先在输入框上方选择工作区目录");
  });

  // --- Case A: create new file (oldString="") ---

  describe("create new file (oldString empty)", () => {
    it("creates file and calls recordRead", async () => {
      const result = await exec({ filePath: "new.ts", oldString: "", newString: "content" });

      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        args: { workspaceRoot: "/workspace", path: "new.ts", content: "content" },
      });
      expect(mockRecordRead).toHaveBeenCalledWith("conv-123", "/workspace/new.ts");
      expect(result).toContain("已创建并写入");
    });

    it("skips recordRead when no conversationId", async () => {
      mockDataGetState.mockReturnValue({
        activeConversationId: null,
      } as unknown as ReturnType<typeof mockDataGetState>);

      await exec({ filePath: "new.ts", oldString: "", newString: "x" });

      expect(mockRecordRead).not.toHaveBeenCalled();
    });

    it("handles OutsideWorkspace on write", async () => {
      mockInvoke.mockRejectedValue({ kind: "OutsideWorkspace" });

      const result = await exec({ filePath: "new.ts", oldString: "", newString: "x" });

      expect(result).toContain("不在当前工作区内");
    });

    it("handles FsError with message on write", async () => {
      mockInvoke.mockRejectedValue({ kind: "PermDenied", message: "no write perm" });

      const result = await exec({ filePath: "new.ts", oldString: "", newString: "x" });

      expect(result).toBe("no write perm");
    });

    it("handles plain Error on write", async () => {
      mockInvoke.mockRejectedValue(new Error("disk full"));

      const result = await exec({ filePath: "new.ts", oldString: "", newString: "x" });

      expect(result).toContain("写入失败");
      expect(result).toContain("disk full");
    });
  });

  // --- Case B: edit existing file ---

  describe("edit existing file", () => {
    it("replaces unique match and returns diff", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") return "00001| hello world";
        if (cmd === "stat_file") return { mtime_secs: 1000 };
        if (cmd === "write_file") return undefined;
        return undefined;
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "hello",
        newString: "goodbye",
      });

      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        args: { workspaceRoot: "/workspace", path: "a.ts", content: "goodbye world" },
      });
      expect(mockCreatePatch).toHaveBeenCalledWith("a.ts", "hello world", "goodbye world");
      expect(mockRecordRead).toHaveBeenCalledWith("conv-123", "/workspace/a.ts");
      expect(result).toContain("已编辑");
      expect(result).toContain("mock-diff");
    });

    it("replaces all occurrences with replaceAll=true", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") return "00001| aa bb aa";
        if (cmd === "stat_file") return { mtime_secs: 1000 };
        if (cmd === "write_file") return undefined;
        return undefined;
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "aa",
        newString: "cc",
        replaceAll: true,
      });

      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        args: { workspaceRoot: "/workspace", path: "a.ts", content: "cc bb cc" },
      });
      expect(result).toContain("已编辑");
    });

    it("returns error when no match found", async () => {
      const result = await exec({
        filePath: "a.ts",
        oldString: "nonexistent",
        newString: "x",
      });

      expect(result).toContain("未找到匹配内容");
    });

    it("returns error when multiple matches without replaceAll", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") return "00001| foo bar foo";
        return { mtime_secs: 1000 };
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "foo",
        newString: "baz",
      });

      expect(result).toContain("出现 2 次");
      expect(result).toContain("replaceAll");
    });

    // --- assertReadBeforeWrite failure ---

    it("returns message when read-before-write check fails", async () => {
      mockAssert.mockReturnValue({ ok: false, message: "请先读取" });

      const result = await exec({
        filePath: "a.ts",
        oldString: "hello",
        newString: "x",
      });

      expect(result).toBe("请先读取");
    });

    it("returns default message when assert fails without message", async () => {
      mockAssert.mockReturnValue({ ok: false });

      const result = await exec({
        filePath: "a.ts",
        oldString: "hello",
        newString: "x",
      });

      expect(result).toContain("未通过读后写校验");
    });

    // --- stat_file failure ---

    it("returns error when stat_file throws", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") return "00001| hello world";
        if (cmd === "stat_file") throw new Error("stat failed");
        return undefined;
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "hello",
        newString: "x",
      });

      expect(result).toContain("校验失败");
      expect(result).toContain("stat failed");
    });

    // --- read_file failure ---

    it("handles NotFound on read", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") throw { kind: "NotFound" };
        return undefined;
      });

      const result = await exec({
        filePath: "missing.ts",
        oldString: "x",
        newString: "y",
      });

      expect(result).toContain("文件不存在");
      expect(result).toContain("missing.ts");
    });

    it("handles OutsideWorkspace on read", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") throw { kind: "OutsideWorkspace" };
        return undefined;
      });

      const result = await exec({
        filePath: "../../etc/passwd",
        oldString: "x",
        newString: "y",
      });

      expect(result).toContain("不在当前工作区内");
    });

    it("handles plain Error on read", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") throw new Error("read err");
        return undefined;
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "x",
        newString: "y",
      });

      expect(result).toContain("读取失败");
      expect(result).toContain("read err");
    });

    // --- write_file failure ---

    it("handles FsError on write", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") return "00001| hello world";
        if (cmd === "stat_file") return { mtime_secs: 1000 };
        if (cmd === "write_file") throw { kind: "OutsideWorkspace" };
        return undefined;
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "hello",
        newString: "x",
      });

      expect(result).toContain("不在当前工作区内");
    });

    it("handles plain Error on write", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "read_file") return "00001| hello world";
        if (cmd === "stat_file") return { mtime_secs: 1000 };
        if (cmd === "write_file") throw new Error("write err");
        return undefined;
      });

      const result = await exec({
        filePath: "a.ts",
        oldString: "hello",
        newString: "x",
      });

      expect(result).toContain("写入失败");
      expect(result).toContain("write err");
    });
  });
});
