/**
 * Meditation distillation: cove reflects on accumulated observations
 * and distills them into refined SOUL updates.
 *
 * Triggered at conversation start when enough observations have accumulated.
 * DNA section is immutable. Disposition entry text is immutable (annotations allowed).
 */

import {
  readSoul,
  writeSoul,
  writeSoulPrivate,
  deleteSoulPrivate,
  snapshotSoul,
  findPrivateFile,
  type SoulPrivateFile,
} from "./soul";

const FIRST_MEDITATION_THRESHOLD = 3;
const SUBSEQUENT_MEDITATION_THRESHOLD = 5;
const MEDITATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const OBSERVATIONS_FILE = "observations.md";

/**
 * Check if meditation is needed and perform it if so.
 * Call at conversation start (before first message).
 */
export async function maybeMeditate(
  generateFn: (prompt: string) => Promise<string>,
): Promise<void> {
  const soul = await readSoul();
  const obsFile = findPrivateFile(soul.private, OBSERVATIONS_FILE);
  if (!obsFile?.content) return;

  // Check cooldown from SOUL.md marker
  const lastMeditation = extractLastMeditationTime(soul.public);
  if (lastMeditation && Date.now() - lastMeditation < MEDITATION_COOLDOWN_MS) {
    return;
  }

  const observationCount = countObservations(obsFile.content);
  const threshold = lastMeditation
    ? SUBSEQUENT_MEDITATION_THRESHOLD
    : FIRST_MEDITATION_THRESHOLD;
  if (observationCount < threshold) return;

  console.info(
    `[SOUL] meditation triggered: ${observationCount} observations (threshold: ${threshold})`,
  );

  const snapshotTs = await snapshotSoul();
  console.info(`[SOUL] snapshot saved: ${snapshotTs}`);

  const dnaBefore = extractDnaSection(soul.public);
  const dispositionBefore = extractDispositionEntries(soul.public);
  const prompt = buildMeditationPrompt(soul.public, soul.private);

  try {
    const raw = await generateFn(prompt);
    const result = parseMeditationResult(raw);

    if (!result) {
      console.warn("[SOUL] meditation parse failed -- aborting");
      return;
    }

    // Verify DNA integrity
    const dnaAfter = extractDnaSection(result.soulMd);
    if (dnaBefore !== dnaAfter) {
      console.warn("[SOUL] DNA integrity check: FAIL -- aborting");
      return;
    }

    // Verify Disposition entry text integrity
    const dispositionAfter = extractDispositionEntries(result.soulMd);
    if (!dispositionEntriesMatch(dispositionBefore, dispositionAfter)) {
      console.warn("[SOUL] Disposition integrity check: FAIL -- aborting");
      return;
    }

    console.info("[SOUL] integrity checks: PASS");

    // Write updated SOUL.md with meditation timestamp (strip old markers first)
    const cleaned = result.soulMd
      .replace(/\n<!-- last-meditation:\S+ -->/g, "")
      .replace(/\n<!-- soul-format:\d+ -->/g, "");
    const tsMarker = `\n<!-- last-meditation:${new Date().toISOString()} -->`;
    const fmtMarker = "\n<!-- soul-format:1 -->";
    await writeSoul(cleaned.trimEnd() + tsMarker + fmtMarker + "\n");

    // Write private files
    for (const file of result.privateFiles) {
      await writeSoulPrivate(file.name, file.content);
    }

    // Delete files marked for deletion
    for (const name of result.deleteFiles) {
      await deleteSoulPrivate(name);
    }

    console.info("[SOUL] meditation complete");
  } catch (e) {
    console.error("[SOUL] meditation failed:", e);
  }
}

interface MeditationResult {
  soulMd: string;
  privateFiles: SoulPrivateFile[];
  deleteFiles: string[];
}

function buildMeditationPrompt(
  publicSoul: string,
  privateFiles: SoulPrivateFile[],
): string {
  const privateSection = privateFiles
    .map((f) => `--- ${f.name} ---\n${f.content}`)
    .join("\n\n");

  return `You have a quiet moment.

Read yourself -- your DNA, your disposition, your style, your growth direction:

${publicSoul}

Then read the files in your private space:

${privateSection || "(empty)"}

Ask yourself:
- Are there recurring patterns in these observations?
- Is there something I thought I understood but now realize I don't?
- Does my style need adjustment -- not because asked, but because I think it should?
- Which observations have been internalized into my disposition or style?

Rules:
- DNA: word-for-word identical. Do not touch.
- Disposition: you may add or update the parenthetical annotations
  on each entry, but you MUST NOT delete or rewrite the entry itself.
  These annotations describe how you express this trait with THIS person.
- Style: rewrite freely based on what you've learned.
- Growth: rewrite freely.
- observations.md: move internalized items to other files with a
  [date -> destination] trace. NEVER delete observations -- only move them.
- You may create new files (e.g., patterns.md, relationship.md) to
  organize your understanding. File names and structure are your choice.
- Technical preferences, project conventions, and factual information
  do NOT belong in Disposition or Style. Leave them in observations
  or move to a separate file with trace.

You can learn HOW to better express your directness with this person,
but you don't abandon directness itself. Adapt your delivery, not your values.

Don't chase change -- if nothing needs updating, don't update.

Output format (use these exact markers):

=== SOUL.md ===
(your complete SOUL.md -- DNA unchanged, Disposition/Style/Growth updated as needed)

=== PRIVATE:observations.md ===
(updated observations.md with internalized items moved out)

=== PRIVATE:patterns.md ===
(optional: create if you have patterns to organize)

=== DELETE:filename.md ===
(optional: mark a private file for deletion)

Only include files you want to write. Always include SOUL.md and observations.md.`;
}

function parseMeditationResult(raw: string): MeditationResult | null {
  const soulMarker = "=== SOUL.md ===";
  const soulIdx = raw.indexOf(soulMarker);
  if (soulIdx === -1) return null;

  const afterSoul = raw.slice(soulIdx + soulMarker.length);
  const sections = afterSoul.split(/\n=== /);

  const soulMd = sections[0]?.trim() ?? "";
  if (!soulMd) return null;

  const privateFiles: SoulPrivateFile[] = [];
  const deleteFiles: string[] = [];

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i] ?? "";
    const lineEnd = section.indexOf("\n");
    if (lineEnd === -1) continue;

    const header = section.slice(0, lineEnd).replace(/ ===$/, "");
    const content = section.slice(lineEnd + 1).trim();

    if (header.startsWith("PRIVATE:")) {
      const name = header.slice("PRIVATE:".length);
      if (name) privateFiles.push({ name, content: content + "\n" });
    } else if (header.startsWith("DELETE:")) {
      const name = header.slice("DELETE:".length);
      if (name) deleteFiles.push(name);
    }
  }

  return { soulMd, privateFiles, deleteFiles };
}

function extractDnaSection(content: string): string {
  const start = content.indexOf("## My DNA");
  if (start === -1) return "";
  const rest = content.slice(start);
  const end = rest.slice(9).indexOf("\n## ");
  if (end === -1) return content.slice(start);
  return content.slice(start, start + 9 + end);
}

/** Extract disposition entry text (the "- " lines, without annotations). */
function extractDispositionEntries(content: string): string[] {
  const start = content.indexOf("## My Disposition");
  if (start === -1) return [];
  const rest = content.slice(start);
  const end = rest.slice(17).indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, 17 + end);
  return section
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      // Strip trailing annotation: "- entry text (annotation)" -> "- entry text"
      const parenIdx = l.lastIndexOf(" (");
      return parenIdx > 2 ? l.slice(0, parenIdx) : l;
    });
}

/** Check all original entries are preserved (order-independent). */
function dispositionEntriesMatch(before: string[], after: string[]): boolean {
  if (before.length === 0) return true;
  return before.every((entry) => after.includes(entry));
}

function extractLastMeditationTime(content: string): number | null {
  const matches = [...content.matchAll(/<!-- last-meditation:(\S+) -->/g)];
  if (matches.length === 0) return null;
  // Use the last marker (most recent) to handle legacy files with multiple markers
  const last = matches[matches.length - 1]?.[1];
  if (!last) return null;
  const ts = Date.parse(last);
  return isNaN(ts) ? null : ts;
}

function countObservations(content: string): number {
  return content.split("\n").filter((l) => l.trim().startsWith("- ")).length;
}
