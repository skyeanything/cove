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

/** 统计 str 在 content 中的出现次数 */
function countOccurrences(content: string, str: string): number {
  if (str === "") return 0;
  let n = 0;
  let i = 0;
  while (true) {
    const idx = content.indexOf(str, i);
    if (idx === -1) break;
    n += 1;
    i = idx + str.length;
  }
  return n;
}

export const editTool = tool({
  description:
    "Edit a file by replacing a string. You must have read the file in this conversation first. oldString must match exactly once (or use replaceAll for multiple). Use oldString empty to create a new file; use newString empty to delete the matched content.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative path to the file from workspace root"),
    oldString: z.string().describe("Exact string to find and replace. Empty = create new file (content = newString)."),
    newString: z.string().describe("Replacement. Empty = delete the matched content."),
    replaceAll: z
      .boolean()
      .optional()
      .describe("If true, replace all occurrences; otherwise oldString must appear exactly once."),
  }),
  execute: async ({ filePath, oldString, newString, replaceAll }) => {
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "请先在输入框上方选择工作区目录，再使用 edit 工具。";
    }
    const workspaceRoot = activeWorkspace.path;
    const conversationId = useDataStore.getState().activeConversationId;
    const resolvedPath = resolvePath(workspaceRoot, filePath);

    // Phase 5: write/edit 默认允许，仅保留 read-before-write
    if (oldString === "") {
      try {
        await invoke("write_file", {
          args: { workspaceRoot, path: filePath, content: newString },
        });
        if (conversationId) recordRead(conversationId, resolvedPath);
        return `已创建并写入 ${filePath}。`;
      } catch (err) {
        if (isFsError(err)) {
          if (err.kind === "OutsideWorkspace") return "该路径不在当前工作区内。";
          return err.message ?? `错误：${err.kind}`;
        }
        return `写入失败：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    let rawContent: string;
    try {
      const withLineNumbers = await invoke<string>("read_file", {
        args: { workspaceRoot, path: filePath },
      });
      rawContent = stripLineNumbers(withLineNumbers);
    } catch (err) {
      if (isFsError(err)) {
        if (err.kind === "NotFound") return `文件不存在：${filePath}`;
        if (err.kind === "OutsideWorkspace") return "该路径不在当前工作区内。";
        return err.message ?? `读取失败：${err.kind}`;
      }
      return `读取失败：${err instanceof Error ? err.message : String(err)}`;
    }

    const count = countOccurrences(rawContent, oldString);
    if (count === 0) {
      return "未找到匹配内容，请检查 oldString 是否与文件内容一致（区分大小写与空格）。";
    }
    if (count > 1 && !replaceAll) {
      return `"oldString" 在文件中出现 ${count} 次，请提供更多上下文使匹配唯一，或设置 replaceAll: true 替换全部。`;
    }

    try {
      const st = await invoke<{ mtime_secs: number }>("stat_file", {
        args: { workspaceRoot, path: filePath },
      });
      const assert = assertReadBeforeWrite(conversationId ?? "", resolvedPath, st.mtime_secs);
      if (!assert.ok) {
        return assert.message ?? "无法编辑：未通过读后写校验。";
      }
    } catch (err) {
      return `校验失败：${err instanceof Error ? err.message : String(err)}`;
    }

    const newContent = replaceAll
      ? rawContent.split(oldString).join(newString)
      : rawContent.replace(oldString, newString);

    try {
      await invoke("write_file", {
        args: { workspaceRoot, path: filePath, content: newContent },
      });
      if (conversationId) recordRead(conversationId, resolvedPath);
      const diff = createPatch(filePath, rawContent, newContent);
      return `已编辑 ${filePath}。\n\n--- Diff ---\n${diff}`;
    } catch (err) {
      if (isFsError(err)) {
        if (err.kind === "OutsideWorkspace") return "该路径不在当前工作区内。";
        return err.message ?? `写入失败：${err.kind}`;
      }
      return `写入失败：${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
