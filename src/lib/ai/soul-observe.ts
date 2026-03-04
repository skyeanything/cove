/**
 * Real-time observation recording: after meaningful conversations,
 * cove evaluates whether there are observations worth noting and
 * appends them to SOUL.private.md.
 */

import type { Message } from "@/db/types";
import { readSoul, writeSoul } from "./soul";

const MIN_TURNS_FOR_OBSERVATION = 3;

/**
 * Evaluate conversation for observations and append to SOUL.private.md.
 * Non-blocking: designed for fire-and-forget usage.
 */
export async function maybeRecordObservation(
  _conversationId: string,
  messages: Message[],
  generateFn: (prompt: string) => Promise<string>,
): Promise<void> {
  const substantive = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  // Only observe after meaningful conversations
  const userTurns = substantive.filter((m) => m.role === "user").length;
  if (userTurns < MIN_TURNS_FOR_OBSERVATION) return;

  const soul = await readSoul();
  const transcript = substantive
    .slice(-16) // Last 16 messages max
    .map((m) => `[${m.role}]: ${m.content ?? ""}`)
    .join("\n");

  const prompt = `You are reflecting on a conversation you just had. Your current self-understanding:

${soul.private || "(no observations yet)"}

The conversation:
${transcript}

Is there anything worth noting about the user or about your own understanding?
If yes, write 1-2 brief observations (single lines, starting with "- ").
If nothing notable, respond with exactly "nothing".
Do not repeat existing observations. Focus on new insights only.`;

  try {
    const raw = await generateFn(prompt);
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "nothing" || trimmed === "") return;

    // Extract observation lines
    const lines = raw
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.trim());
    if (lines.length === 0) return;

    // Append observations with date header
    const today = new Date().toISOString().split("T")[0];
    const existingPrivate = soul.private;
    const hasDateHeader = existingPrivate.includes(`### ${today}`);

    let appendBlock: string;
    if (hasDateHeader) {
      appendBlock = lines.join("\n") + "\n";
    } else {
      appendBlock = `\n### ${today}\n${lines.join("\n")}\n`;
    }

    const updated = existingPrivate.trimEnd() + "\n" + appendBlock;
    await writeSoul("SOUL.private.md", updated);
    console.info(
      `[SOUL] observation appended: ${lines.length} item(s)`,
    );
  } catch (e) {
    console.error("[SOUL] observation recording failed:", e);
  }
}
