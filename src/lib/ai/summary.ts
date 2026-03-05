/**
 * Conversation summary generation for the Archive layer.
 * Generates summaries after meaningful conversations (>= 4 messages).
 * Updates stale summaries when conversations grow significantly.
 * Summaries are for future cove's recall, not for user display.
 */

import type { Message } from "@/db/types";
import { summaryRepo } from "@/db/repos/summaryRepo";

const MIN_MESSAGES_FOR_SUMMARY = 4;
const STALE_GROWTH_FACTOR = 2;
const SUMMARY_REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate and store a conversation summary if conditions are met.
 * Updates existing summary if conversation has grown significantly.
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

  const existing = await summaryRepo.getByConversation(conversationId);
  if (existing && !isStaleSummary(existing.created_at, substantive.length)) {
    return;
  }

  const transcript = substantive
    .slice(-20)
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
      existing?.id ?? crypto.randomUUID(),
      conversationId,
      parsed.summary,
      parsed.keywords,
    );
    if (existing) {
      console.info("[SOUL] summary updated (conversation grew)");
    }
  } catch (e) {
    console.error("[SOUL] summary generation failed:", e);
  }
}

/**
 * A summary is stale when the conversation has grown past the refresh
 * threshold AND enough time has elapsed since last generation.
 * INSERT OR REPLACE resets created_at on each write, so the cooldown
 * prevents repeated refreshes after the first one.
 */
function isStaleSummary(
  createdAt: string,
  currentMessageCount: number,
): boolean {
  if (currentMessageCount < MIN_MESSAGES_FOR_SUMMARY * STALE_GROWTH_FACTOR) {
    return false;
  }
  const age = Date.now() - new Date(createdAt).getTime();
  return age > SUMMARY_REFRESH_COOLDOWN_MS;
}

function parseSummaryResponse(raw: string): {
  summary: string;
  keywords: string;
} {
  try {
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
  return { summary: raw.slice(0, 500), keywords: "" };
}
