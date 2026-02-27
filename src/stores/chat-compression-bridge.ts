import type { LanguageModel } from "ai";
import type { Message } from "@/db/types";
import { messageRepo } from "@/db/repos/messageRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import {
  shouldCompress,
  selectCompressionBoundary,
  generateSummary,
} from "@/lib/ai/context-compression";

export interface CompressionResult {
  compressed: boolean;
  messages: Message[];
  summaryUpTo?: string;
}

/**
 * Check if context compression is needed and execute it.
 * Called before runStreamLoop in sendMessage / regenerateMessage / editAndResend.
 * On failure, returns the original messages to avoid blocking the user.
 */
export async function maybeCompressContext(
  messages: Message[],
  conversationId: string,
  contextWindow: number,
  model: LanguageModel,
): Promise<CompressionResult> {
  if (!shouldCompress(messages, contextWindow)) {
    return { compressed: false, messages };
  }

  try {
    const { toCompress, toKeep } = selectCompressionBoundary(
      messages,
      contextWindow,
    );
    if (toCompress.length === 0) {
      return { compressed: false, messages };
    }

    // Check for existing summary (chain compression)
    const existingSummary = await messageRepo.getSummaryMessage(conversationId);
    const existingSummaryContent = existingSummary?.content ?? null;

    const { summaryContent, compressedUpTo } = await generateSummary(
      model,
      toCompress,
      existingSummaryContent,
    );

    // Delete old summary message if it exists
    await messageRepo.deleteSummaryMessage(conversationId);

    // Create new summary message
    const summaryMsg: Omit<Message, "created_at"> = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "system",
      content: summaryContent,
      parent_id: "__context_summary__",
    };
    await messageRepo.create(summaryMsg);

    // Update conversation with summary_up_to
    await conversationRepo.update(conversationId, {
      summary_up_to: compressedUpTo,
    });

    // Return updated message list: summary + kept messages
    const updatedMessages: Message[] = [
      { ...summaryMsg, created_at: new Date().toISOString() },
      ...toKeep,
    ];

    return {
      compressed: true,
      messages: updatedMessages,
      summaryUpTo: compressedUpTo,
    };
  } catch (err) {
    console.warn("[context-compression] Failed to compress:", err);
    return { compressed: false, messages };
  }
}
