import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { useDataStore } from "@/stores/dataStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

interface ParseDocumentTextResult {
  fileType: string;
  content: string;
  truncated: boolean;
  warnings: string[];
}

interface ReadOfficeTextResult {
  fileType: string;
  content: string;
  truncated: boolean;
  warnings: string[];
}

type ParseMode = "full" | "summary" | "chunks";

interface ParseDocumentResult {
  attachmentId?: string;
  filePath?: string;
  name: string;
  path: string;
  fileType: string;
  mode: ParseMode;
  truncated: boolean;
  warnings: string[];
  summary?: string;
  chunkCount: number;
  chunks: Array<{ index: number; text: string }>;
}

function chunkText(content: string, chunkSize = 3200, maxChunks = 12): Array<{ index: number; text: string }> {
  if (!content.trim()) return [];
  const chunks: Array<{ index: number; text: string }> = [];
  let start = 0;
  let index = 0;
  while (start < content.length && index < maxChunks) {
    const text = content.slice(start, start + chunkSize);
    chunks.push({ index, text });
    start += chunkSize;
    index += 1;
  }
  return chunks;
}

function buildSummary(content: string, maxChars = 800): string {
  if (!content.trim()) return "";
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...`;
}

function buildPayload(
  content: string,
  parsed: { fileType: string; truncated: boolean; warnings: string[] },
  ids: { attachmentId?: string; filePath?: string; name: string; path: string },
  mode: ParseMode,
  chunkSize?: number,
  maxChunks?: number,
): ParseDocumentResult {
  const chunks = chunkText(
    content,
    chunkSize && chunkSize > 200 ? Math.min(12_000, chunkSize) : 3200,
    maxChunks && maxChunks > 0 ? Math.min(50, maxChunks) : 12,
  );
  const summary = buildSummary(content);
  const payload: ParseDocumentResult = {
    ...ids,
    fileType: parsed.fileType || "unknown",
    mode,
    truncated: parsed.truncated,
    warnings: parsed.warnings ?? [],
    summary,
    chunkCount: mode === "summary" ? 0 : chunks.length,
    chunks: mode === "summary" ? [] : chunks,
  };
  if (mode === "full") {
    payload.chunks = [{ index: 0, text: content }];
    payload.chunkCount = 1;
  }
  return payload;
}

export const parseDocumentTool = tool({
  description:
    "Parse document text content. Accepts attachmentId (for chat attachments) or filePath (workspace-relative path for DOCX/XLSX/PPTX/PDF files). Provide exactly one.",
  inputSchema: z.object({
    attachmentId: z.string().optional().describe("Attachment ID from user message"),
    filePath: z.string().optional().describe("Workspace-relative path to an office file"),
    mode: z.enum(["full", "summary", "chunks"]).optional().describe("Return mode: full|summary|chunks"),
    maxBytes: z.number().optional().describe("Max bytes to read (default 128KB, max 512KB)"),
    chunkSize: z.number().optional().describe("Chunk size in characters for chunks mode (default 3200)"),
    maxChunks: z.number().optional().describe("Max chunks to return (default 12)"),
    pageRange: z.string().optional().describe("PDF page range, e.g. 1-3,5"),
  }),
  execute: async ({ attachmentId, filePath, mode: rawMode, maxBytes, chunkSize, maxChunks, pageRange }) => {
    const mode: ParseMode = (rawMode as ParseMode) ?? "full";
    if (attachmentId && filePath) {
      return "Please provide either attachmentId or filePath, not both.";
    }
    if (!attachmentId && !filePath) {
      return "Please provide attachmentId or filePath.";
    }

    if (filePath) {
      const { activeWorkspace, workspaces } = useWorkspaceStore.getState();
      if (!activeWorkspace) {
        return "No active workspace. Select a workspace directory first.";
      }
      // For absolute paths, find the most specific workspace that contains the file.
      // This handles the case where the file lives in a non-active workspace.
      let workspaceRoot = activeWorkspace.path;
      if (filePath.startsWith("/")) {
        let bestLen = -1;
        for (const ws of workspaces) {
          const normalized = ws.path.endsWith("/") ? ws.path : ws.path + "/";
          if ((filePath === ws.path || filePath.startsWith(normalized)) && ws.path.length > bestLen) {
            bestLen = ws.path.length;
            workspaceRoot = ws.path;
          }
        }
      }
      try {
        const parsed = await invoke<ReadOfficeTextResult>("read_office_text", {
          args: {
            workspaceRoot,
            path: filePath,
            maxChars: maxBytes ? Math.max(4096, maxBytes) : undefined,
            pageRange: pageRange ?? undefined,
          },
        });
        const fileName = filePath.split("/").pop() ?? filePath;
        const payload = buildPayload(parsed.content, parsed, {
          filePath,
          name: fileName,
          path: filePath,
        }, mode, chunkSize, maxChunks);
        return JSON.stringify(payload, null, 2);
      } catch (error) {
        if (typeof error === "object" && error !== null && "kind" in error &&
            (error as { kind: string }).kind === "OutsideWorkspace") {
          return `该文件不在任何已知工作区内，无法读取：${filePath}`;
        }
        return `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const conversationId = useDataStore.getState().activeConversationId;
    if (!conversationId) {
      return "当前没有激活会话，无法解析附件。";
    }

    const attachment = await attachmentRepo.getById(attachmentId!);
    if (!attachment) {
      return `附件不存在：${attachmentId}`;
    }
    if (!attachment.message_id) {
      return `附件缺少消息关联：${attachmentId}`;
    }

    const msg = await messageRepo.getById(attachment.message_id);
    if (!msg || msg.conversation_id !== conversationId) {
      return "无权解析该附件（不属于当前会话）。";
    }
    if (!attachment.path) {
      return "附件缺少文件路径，无法解析。";
    }

    try {
      const parsed = await invoke<ParseDocumentTextResult>("parse_document_text", {
        args: {
          path: attachment.path,
          maxBytes: maxBytes ?? undefined,
          pageRange: pageRange ?? undefined,
        },
      });
      const payload = buildPayload(parsed.content, parsed, {
        attachmentId: attachmentId!,
        name: attachment.name ?? "unknown",
        path: attachment.path,
      }, mode, chunkSize, maxChunks);
      return JSON.stringify(payload, null, 2);
    } catch (error) {
      return `解析附件失败：${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
