import { tool } from "ai";
import { z } from "zod/v4";
import { summaryRepo } from "@/db/repos/summaryRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { truncateOutput } from "../truncation";

const RECALL_OPTS = { maxBytes: 4000 };
const DETAIL_OPTS = { maxBytes: 8000 };

export const recallTool = tool({
  description:
    "Search your conversation archive by topic. Returns summaries of past conversations. Use when you need to recall previous discussions, or when the user mentions something you discussed before.",
  inputSchema: z.object({
    query: z.string().describe("Search keywords or natural language query"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Max results (default 5)"),
  }),
  execute: async ({ query, limit }) => {
    try {
      const results = await summaryRepo.searchSummaries(query, limit ?? 5);
      if (results.length === 0) {
        return { found: false, message: "No matching conversations found." };
      }
      const items = results.map((r) => ({
        conversationId: r.conversation_id,
        summary: r.summary,
        keywords: r.keywords,
        date: r.created_at,
      }));
      const output = JSON.stringify(items, null, 2);
      return {
        found: true,
        count: items.length,
        results: truncateOutput(output, RECALL_OPTS).content,
      };
    } catch (e) {
      return { found: false, error: String(e) };
    }
  },
});

export const recallDetailTool = tool({
  description:
    "Retrieve original messages from a specific past conversation. Use after recall to get detailed context from a conversation you identified as relevant.",
  inputSchema: z.object({
    conversationId: z
      .string()
      .describe("The conversation ID from a recall result"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max messages to retrieve (default 50)"),
  }),
  execute: async ({ conversationId, limit }) => {
    try {
      const messages = await messageRepo.getByConversation(
        conversationId,
        limit ?? 50,
      );
      if (messages.length === 0) {
        return { found: false, message: "No messages found for this conversation." };
      }
      const formatted = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => `[${m.role}]: ${m.content ?? ""}`)
        .join("\n\n");
      return {
        found: true,
        messageCount: messages.length,
        conversation: truncateOutput(formatted, DETAIL_OPTS).content,
      };
    } catch (e) {
      return { found: false, error: String(e) };
    }
  },
});
