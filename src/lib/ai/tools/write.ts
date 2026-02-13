import { tool } from "ai";
import { z } from "zod/v4";
import { createPatch } from "diff";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { assertReadBeforeWrite, recordRead } from "../file-time";

interface FsErrorPayload {
  kind: string;
  message?: string;
}

function isFsError(err: unknown): err is FsErrorPayload {
  return typeof err === "object" && err !== null && "kind" in err;
}

/** 去掉 read_file 返回的行号前缀，得到原始内容 */
function stripLineNumbers(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^\d{5}\| /, ""))
    .join("\n");
}

function resolvePath(workspaceRoot: string, filePath: string): string {
  const p = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  return p.startsWith("/") ? p : `${workspaceRoot}/${p}`.replace(/\/+/g, "/");
}

export const writeTool = tool({
  description:
    "Write or overwrite a file in the workspace. You must have read the file in this conversation before overwriting. Path is relative to workspace root.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative path to the file from workspace root"),
    content: z.string().describe("Full new content of the file"),
  }),
  execute: async ({ filePath, content }) => {
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "请先在输入框上方选择工作区目录，再使用 write 工具。";
    }
    const workspaceRoot = activeWorkspace.path;
    const conversationId = useDataStore.getState().activeConversationId;
    const resolvedPath = resolvePath(workspaceRoot, filePath);

    // Phase 5: read/write/edit 默认允许，仅保留 read-before-write 校验
    let existingRaw = "";
    try {
      const st = await invoke<{ mtime_secs: number; is_dir: boolean }>("stat_file", {
        args: { workspaceRoot, path: filePath },
      });
      if (st.is_dir) {
        return "该路径是目录，无法写入。";
      }
      const assert = assertReadBeforeWrite(conversationId ?? "", resolvedPath, st.mtime_secs);
      if (!assert.ok) {
        return assert.message ?? "无法写入：未通过读后写校验。";
      }
      const withLineNumbers = await invoke<string>("read_file", {
        args: { workspaceRoot, path: filePath },
      });
      existingRaw = stripLineNumbers(withLineNumbers);
    } catch (err) {
      if (isFsError(err) && err.kind === "NotFound") {
        // 新文件，无需 assert
      } else if (isFsError(err)) {
        if (err.kind === "OutsideWorkspace") return "该路径不在当前工作区内。";
        return err.message ? `错误：${err.message}` : `错误：${err.kind}`;
      } else {
        return `写入前检查失败：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    try {
      await invoke("write_file", {
        args: { workspaceRoot, path: filePath, content },
      });
      if (conversationId) {
        recordRead(conversationId, resolvedPath);
      }
      // 新文件或覆盖都返回 diff，便于界面统一以 diff 展示
      const diff = createPatch(filePath, existingRaw, content);
      const intro = existingRaw !== "" ? `已写入 ${filePath}。` : `已创建并写入 ${filePath}。`;
      return `${intro}\n\n--- Diff ---\n${diff}`;
    } catch (err) {
      if (isFsError(err)) {
        if (err.kind === "OutsideWorkspace") return "该路径不在当前工作区内。";
        if (err.kind === "NotAllowed") return err.message ?? "无法写入该路径。";
        return err.message ? `错误：${err.message}` : `错误：${err.kind}`;
      }
      return `写入失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
