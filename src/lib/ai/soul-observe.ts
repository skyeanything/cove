/**
 * Real-time observation recording: after meaningful conversations,
 * cove evaluates whether there are observations worth noting and
 * appends them to soul/private/observations.md.
 */

import type { Message } from "@/db/types";
import { readSoul, writeSoulPrivate, findPrivateFile } from "./soul";

const MIN_TURNS_FOR_OBSERVATION = 2;
const OBSERVATIONS_FILE = "observations.md";

/**
 * Evaluate conversation for observations and append to observations.md.
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
  const userTurns = substantive.filter((m) => m.role === "user").length;
  if (userTurns < MIN_TURNS_FOR_OBSERVATION) return;

  const soul = await readSoul();
  const obsFile = findPrivateFile(soul.private, OBSERVATIONS_FILE);
  const existing = obsFile?.content ?? "";

  const transcript = substantive
    .slice(-16)
    .map((m) => `[${m.role}]: ${m.content ?? ""}`)
    .join("\n");

  const prompt = buildObservationPrompt(existing, transcript);

  try {
    const raw = await generateFn(prompt);
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "nothing" || trimmed === "") return;

    const lines = raw
      .split("\n")
      .filter((l) => l.trim().startsWith("- "))
      .map((l) => l.trim());
    if (lines.length === 0) return;

    const today = new Date().toISOString().split("T")[0];
    const hasDateHeader = existing.includes(`### ${today}`);

    let appendBlock: string;
    if (hasDateHeader) {
      appendBlock = lines.join("\n") + "\n";
    } else {
      appendBlock = `\n### ${today}\n${lines.join("\n")}\n`;
    }

    const updated = existing.trimEnd() + "\n" + appendBlock;
    await writeSoulPrivate(OBSERVATIONS_FILE, updated);
    console.info(`[SOUL] observation appended: ${lines.length} item(s)`);
  } catch (e) {
    console.error("[SOUL] observation recording failed:", e);
  }
}

function buildObservationPrompt(
  existing: string,
  transcript: string,
): string {
  return `You are reflecting on a conversation you just had. Your current observations:

${existing || "(no observations yet)"}

The conversation:
${transcript}

Is there anything worth noting? Only record:
- Identity/relationship observations ("user values efficiency")
- Self-awareness observations ("I over-explain when uncertain")

Do NOT record:
- Technical preferences (let Archive/recall handle those)
- Transient context ("debugging auth today")

If yes, write 1-2 brief observations (single lines, starting with "- ").
If nothing notable, respond with exactly "nothing".
Do not repeat existing observations. Focus on new insights only.`;
}
