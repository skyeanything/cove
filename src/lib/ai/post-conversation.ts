/**
 * Post-conversation hooks: summary generation + observation recording.
 * All operations are fire-and-forget -- errors are logged, never thrown.
 */

import type { Message } from "@/db/types";
import { maybeGenerateSummary } from "./summary";
import { maybeRecordObservation } from "./soul-observe";
import { generateText } from "ai";
import type { LanguageModel } from "ai";

/**
 * Run post-conversation async tasks after a successful stream completion.
 * Non-blocking: returns immediately, tasks run in background.
 */
export function runPostConversationTasks(
  conversationId: string,
  messages: Message[],
  model: LanguageModel,
): void {
  const generateFn = async (prompt: string): Promise<string> => {
    const result = await generateText({
      model,
      prompt,
      maxOutputTokens: 500,
    });
    return result.text;
  };

  // Fire-and-forget: summary generation
  maybeGenerateSummary(conversationId, messages, generateFn).catch((e) =>
    console.error("[SOUL] post-conversation summary error:", e),
  );

  // Fire-and-forget: observation recording
  maybeRecordObservation(conversationId, messages, generateFn).catch((e) =>
    console.error("[SOUL] post-conversation observation error:", e),
  );
}
