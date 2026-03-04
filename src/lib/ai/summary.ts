/**
 * Conversation summary generation for the Archive layer.
 * Generates summaries after meaningful conversations (>= 4 messages).
 * Summaries are for future cove's recall, not for user display.
 */

import type { Message } from "@/db/types";
import { summaryRepo } from "@/db/repos/summaryRepo";

const MIN_MESSAGES_FOR_SUMMARY = 4;

/**
 * Generate and store a conversation summary if conditions are met.
 * Non-blocking: call with fire-and-forget pattern.
 */
export async function maybeGenerateSummary(
  conversationId: string,
  messages: Message[],
  generateFn: (prompt: string) => Promise<string>,
): Promise<void> {
  const substantive = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  if (substantive.length < MIN_MESSAGES_FOR_SUMMARY) return;

  // Check if summary already exists for this conversation
  const existing = await summaryRepo.getByConversation(conversationId);
  if (existing) return;

  const transcript = substantive
    .slice(-20) // Last 20 messages max
    .map((m) => `[${m.role}]: ${m.content ?? ""}`)
    .join("\n");

  const prompt = `Summarize this conversation for future reference. Focus on:
- Topics discussed and key decisions made
- Unresolved questions or open items
- Any preferences or patterns observed

Return a JSON object with two fields:
- "summary": 2-3 sentence summary
- "keywords": comma-separated keywords (5-10 words)

Conversation:
${transcript}`;

  try {
    const raw = await generateFn(prompt);
    const parsed = parseSummaryResponse(raw);
    await summaryRepo.create(
      crypto.randomUUID(),
      conversationId,
      parsed.summary,
      parsed.keywords,
    );
  } catch (e) {
    console.error("[SOUL] summary generation failed:", e);
  }
}

function parseSummaryResponse(raw: string): {
  summary: string;
  keywords: string;
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        summary: String(parsed["summary"] ?? raw),
        keywords: String(parsed["keywords"] ?? ""),
      };
    }
  } catch {
    // Fall through
  }
  // Fallback: use raw text as summary
  return { summary: raw.slice(0, 500), keywords: "" };
}
