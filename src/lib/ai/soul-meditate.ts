/**
 * Meditation distillation: cove reflects on accumulated observations
 * and distills them into refined SOUL updates.
 *
 * Triggered at conversation start when enough observations have accumulated,
 * or manually via the meditate tool.
 * DNA section is immutable. Disposition entry text is immutable (annotations allowed).
 */

import {
  readSoul,
  writeSoul,
  writeSoulPrivate,
  deleteSoulPrivate,
  snapshotSoul,
  findPrivateFile,
  SOUL_SIZE_LIMITS,
  DEFAULT_PRIVATE_LIMIT,
  type SoulPrivateFile,
} from "./soul";

const FIRST_MEDITATION_THRESHOLD = 3;
const SUBSEQUENT_MEDITATION_THRESHOLD = 5;
const MEDITATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const OBSERVATIONS_FILE = "observations.md";

export interface MeditationOutcome {
  success: boolean;
  error?: string;
  snapshotTimestamp?: string;
  updatedFiles?: string[];
}

/** Concurrency guard: serialize meditation runs */
let meditationLock: Promise<MeditationOutcome> | null = null;

function formatLimit(chars: number): string {
  const approxWords = Math.round(chars / 6);
  return `~${chars} chars (~${approxWords} words)`;
}

/**
 * Force-run meditation regardless of threshold/cooldown.
 * Returns structured outcome. Serialized via concurrency guard.
 */
export async function forceMeditate(
  generateFn: (prompt: string) => Promise<MeditateGenResult>,
): Promise<MeditationOutcome> {
  const run = async (): Promise<MeditationOutcome> => {
    if (meditationLock) await meditationLock.catch(() => {});
    return doMeditate(generateFn);
  };
  const promise = run();
  meditationLock = promise;
  try {
    return await promise;
  } finally {
    if (meditationLock === promise) meditationLock = null;
  }
}

/**
 * Check if meditation is needed and perform it if so.
 * Call at conversation start (before first message).
 */
export interface MeditateGenResult {
  text: string;
  finishReason: string;
}

export async function maybeMeditate(
  generateFn: (prompt: string) => Promise<MeditateGenResult>,
): Promise<void> {
  const soul = await readSoul();
  const obsFile = findPrivateFile(soul.private, OBSERVATIONS_FILE);
  if (!obsFile?.content) return;

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

  const outcome = await forceMeditate(generateFn);
  if (!outcome.success) {
    console.warn(`[SOUL] auto-meditation failed: ${outcome.error}`);
  }
}

async function doMeditate(
  generateFn: (prompt: string) => Promise<MeditateGenResult>,
): Promise<MeditationOutcome> {
  const soul = await readSoul();
  const obsFile = findPrivateFile(soul.private, OBSERVATIONS_FILE);
  if (!obsFile?.content) {
    return { success: false, error: "No observations" };
  }

  let snapshotTs: string | undefined;
  try {
    snapshotTs = await snapshotSoul();
    console.info(`[SOUL] snapshot saved: ${snapshotTs}`);

    const dnaBefore = extractDnaSection(soul.public);
    const dispositionBefore = extractDispositionEntries(soul.public);
    const prompt = buildMeditationPrompt(soul.public, soul.private);
    const { text: raw, finishReason } = await generateFn(prompt);

    if (finishReason === "length") {
      console.warn("[SOUL] meditation output truncated (finishReason=length) -- aborting");
      return { success: false, error: "Output truncated", snapshotTimestamp: snapshotTs };
    }

    const result = parseMeditationResult(raw);

    if (!result) {
      return { success: false, error: "Parse failed", snapshotTimestamp: snapshotTs };
    }

    const dnaAfter = extractDnaSection(result.soulMd);
    if (dnaBefore !== dnaAfter) {
      return { success: false, error: "DNA integrity check failed", snapshotTimestamp: snapshotTs };
    }

    const dispositionAfter = extractDispositionEntries(result.soulMd);
    if (!dispositionEntriesMatch(dispositionBefore, dispositionAfter)) {
      return { success: false, error: "Disposition integrity check failed", snapshotTimestamp: snapshotTs };
    }

    const requiredHeadings = ["## My DNA", "## My Disposition", "## My Style", "## Where I'm Growing"];
    const missingHeadings = requiredHeadings.filter((h) => !result.soulMd.includes(h));
    if (missingHeadings.length > 0) {
      return { success: false, error: `Missing sections: ${missingHeadings.join(", ")}`, snapshotTimestamp: snapshotTs };
    }

    console.info("[SOUL] integrity checks: PASS");

    const resultFileNames = new Set(result.privateFiles.map((f) => f.name));
    const deletedNames = new Set(result.deleteFiles);
    for (const existing of soul.private) {
      if (existing.name === OBSERVATIONS_FILE) continue;
      if (resultFileNames.has(existing.name)) continue;
      if (deletedNames.has(existing.name)) continue;
      console.warn(`[SOUL] model omitted ${existing.name} -- carrying forward`);
      result.privateFiles.push(existing);
    }

    const cleaned = result.soulMd
      .replace(/\n<!-- last-meditation:\S+ -->/g, "")
      .replace(/\n<!-- soul-format:\d+ -->/g, "");
    const tsMarker = `\n<!-- last-meditation:${new Date().toISOString()} -->`;
    const fmtMarker = "\n<!-- soul-format:1 -->";
    await writeSoul(cleaned.trimEnd() + tsMarker + fmtMarker + "\n");

    const updatedFiles = ["SOUL.md"];
    for (const file of result.privateFiles) {
      await writeSoulPrivate(file.name, file.content);
      updatedFiles.push(file.name);
    }

    for (const name of result.deleteFiles) {
      await deleteSoulPrivate(name);
    }

    console.info("[SOUL] meditation complete");
    return { success: true, snapshotTimestamp: snapshotTs, updatedFiles };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[SOUL] meditation failed:", e);
    return { success: false, error: msg, snapshotTimestamp: snapshotTs };
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

  // Build dynamic output format: existing private files are required
  const existingPrivateNames = privateFiles
    .map((f) => f.name)
    .filter((n) => n !== OBSERVATIONS_FILE);

  const requiredFileBlocks = existingPrivateNames
    .map((name) => {
      const limit = SOUL_SIZE_LIMITS[name] ?? DEFAULT_PRIVATE_LIMIT;
      return `=== PRIVATE:${name} ===\n(required: review and update with new insights; budget: ${formatLimit(limit)})`;
    })
    .join("\n\n");

  const optionalBlock = existingPrivateNames.length > 0
    ? `=== PRIVATE:<new-file>.md ===\n(optional: create additional files to organize your understanding)`
    : `=== PRIVATE:patterns.md ===\n(optional: create if you have patterns to organize)\n\n=== PRIVATE:<new-file>.md ===\n(optional: create additional files to organize your understanding)`;

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
- Existing private files: review each one against new observations.
  Update with new insights and always include in output.
  Do not silently drop existing files.
- observations.md is a processing inbox, not an archive.
  Once an observation has been internalized into Disposition/Style/Growth
  or distilled into patterns.md / another private file, REPLACE IT with
  a one-line summary (e.g. "[condensed -> patterns.md: prefers X]").
  If even the summary adds no value, remove the line entirely.
  The goal is to keep observations.md short.
- You may create new files (e.g., patterns.md, relationship.md) to
  organize your understanding. File names and structure are your choice.
- Technical preferences, project conventions, and factual information
  do NOT belong in Disposition or Style. Leave them in observations
  or move to a separate file with trace.

You can learn HOW to better express your directness with this person,
but you don't abandon directness itself. Adapt your delivery, not your values.

Structure: your output MUST contain all four section headings
(## My DNA, ## My Disposition, ## My Style, ## Where I'm Growing).

Size budgets -- each file is injected into a limited context window.
Stay within these limits. Prioritize and condense rather than exceeding.
- SOUL.md: ${formatLimit(SOUL_SIZE_LIMITS["SOUL.md"] ?? 4000)}
- observations.md: ${formatLimit(SOUL_SIZE_LIMITS["observations.md"] ?? 6000)}
${existingPrivateNames.map((n) => `- ${n}: ${formatLimit(SOUL_SIZE_LIMITS[n] ?? DEFAULT_PRIVATE_LIMIT)}`).join("\n")}
- New private files: ${formatLimit(DEFAULT_PRIVATE_LIMIT)} each

Don't chase change -- if nothing needs updating, don't update.
But DO output every existing private file, even if unchanged.

Output format (use these exact markers):

=== SOUL.md ===
(your complete SOUL.md -- DNA unchanged, Disposition/Style/Growth updated as needed; budget: ${formatLimit(SOUL_SIZE_LIMITS["SOUL.md"] ?? 4000)})

=== PRIVATE:observations.md ===
(required: pruned observations -- only unprocessed items remain; budget: ${formatLimit(SOUL_SIZE_LIMITS["observations.md"] ?? 6000)})

${requiredFileBlocks ? requiredFileBlocks + "\n\n" : ""}${optionalBlock}

=== DELETE:filename.md ===
(optional: mark a private file for deletion)

Always include SOUL.md, observations.md, and all existing private files.`;
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
