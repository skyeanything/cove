import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { recordRead } from "../file-time";

const DEFAULT_LIMIT = 2000;

interface FsErrorPayload {
  kind: string;
  message?: string;
}

function isFsError(err: unknown): err is FsErrorPayload {
  return typeof err === "object" && err !== null && "kind" in err;
}

export const readTool = tool({
  description:
    "Read the contents of a file in the current workspace. Path is relative to workspace root. Returns line-numbered text. Use offset/limit for large files.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative path to the file from workspace root"),
    offset: z.number().optional().describe("Skip this many lines (0-based)"),
    limit: z.number().optional().describe("Max lines to return (default 2000)"),
  }),
  execute: async ({ filePath, offset, limit }) => {
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "请先在输入框上方选择工作区目录，再使用 read 工具。";
    }
    const workspaceRoot = activeWorkspace.path;
    const effectiveLimit = limit ?? DEFAULT_LIMIT;

    try {
      const content = await invoke<string>("read_file", {
        args: {
          workspaceRoot,
          path: filePath,
          offset: offset ?? undefined,
          limit: effectiveLimit,
        },
      });
      const sessionId = useDataStore.getState().activeConversationId;
      if (sessionId) {
        const resolved = filePath.startsWith("/") ? filePath : `${workspaceRoot}/${filePath}`.replace(/\/+/g, "/");
        recordRead(sessionId, resolved);
      }
      return content;
    } catch (err) {
      if (!isFsError(err)) {
        return `读取失败：${err instanceof Error ? err.message : String(err)}`;
      }
      switch (err.kind) {
        case "OutsideWorkspace":
          return "该路径不在当前工作区内，无法读取。";
        case "NotFound": {
          return `文件不存在：${filePath}`;
        }
        case "BinaryFile":
          return "该文件被识别为二进制，无法以文本形式读取。";
        case "TooLarge":
          return "文件超过 250KB 上限，请使用 offset/limit 分段读取。";
        case "NotAllowed":
          return err.message ? `无法读取：${err.message}` : "无法读取该路径。";
        default:
          return err.message ? `错误：${err.message}` : `错误：${err.kind}`;
      }
    }
  },
});
