import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { attachmentRepo } from "@/db/repos/attachmentRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { useDataStore } from "@/stores/dataStore";

interface ParseDocumentTextResult {
  fileType: string;
  content: string;
  truncated: boolean;
  warnings: string[];
}

type ParseMode = "full" | "summary" | "chunks";

interface ParseDocumentResult {
  attachmentId: string;
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

export const parseDocumentTool = tool({
  description:
    "解析当前会话中的附件文本内容。根据用户消息提供的 attachmentId 调用本工具，获取文档文本后再继续回答。",
  inputSchema: z.object({
    attachmentId: z.string().describe("附件 ID（由用户消息中的附件清单提供）"),
    mode: z.enum(["full", "summary", "chunks"]).optional().describe("返回模式：full|summary|chunks"),
    maxBytes: z.number().optional().describe("最多读取字节数（默认 128KB，最大 512KB）"),
    chunkSize: z.number().optional().describe("chunks 模式的每块字符数（默认 3200）"),
    maxChunks: z.number().optional().describe("chunks 模式最多返回块数（默认 12）"),
    pageRange: z.string().optional().describe("PDF 页码范围，例如 1-3,5"),
  }),
  execute: async ({ attachmentId, mode = "full", maxBytes, chunkSize, maxChunks, pageRange }) => {
    const conversationId = useDataStore.getState().activeConversationId;
    if (!conversationId) {
      return "当前没有激活会话，无法解析附件。";
    }

    const attachment = await attachmentRepo.getById(attachmentId);
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
      const chunks = chunkText(
        parsed.content,
        chunkSize && chunkSize > 200 ? Math.min(12_000, chunkSize) : 3200,
        maxChunks && maxChunks > 0 ? Math.min(50, maxChunks) : 12,
      );
      const summary = buildSummary(parsed.content);
      const payload: ParseDocumentResult = {
        attachmentId,
        name: attachment.name ?? "unknown",
        path: attachment.path,
        fileType: parsed.fileType || "unknown",
        mode,
        truncated: parsed.truncated,
        warnings: parsed.warnings ?? [],
        summary,
        chunkCount: mode === "summary" ? 0 : chunks.length,
        chunks: mode === "summary" ? [] : chunks,
      };
      if (mode === "full") {
        payload.chunks = [{ index: 0, text: parsed.content }];
        payload.chunkCount = 1;
      }
      return JSON.stringify(payload, null, 2);
    } catch (error) {
      return `解析附件失败：${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
