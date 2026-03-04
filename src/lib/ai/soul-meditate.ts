/**
 * Meditation distillation: cove reflects on accumulated observations
 * and distills them into refined SOUL updates.
 *
 * Triggered at conversation start when cove judges enough has accumulated.
 * DNA section is immutable -- verified by hash comparison.
 */

import { readSoul, writeSoul, snapshotSoul } from "./soul";

const MIN_OBSERVATIONS_FOR_MEDITATION = 5;
const MEDITATION_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const MEDITATION_MARKER = "<!-- last-meditation:";

/**
 * Check if meditation is needed and perform it if so.
 * Call at conversation start (before first message).
 */
export async function maybeMeditate(
  generateFn: (prompt: string) => Promise<string>,
): Promise<void> {
  const soul = await readSoul();
  if (!soul.private) return;

  // Check cooldown
  const lastMeditation = extractLastMeditationTime(soul.private);
  if (lastMeditation && Date.now() - lastMeditation < MEDITATION_COOLDOWN_MS) {
    return;
  }

  // Count observations since last meditation
  const observationCount = countObservations(soul.private);
  if (observationCount < MIN_OBSERVATIONS_FOR_MEDITATION) return;

  console.info(
    `[SOUL] meditation triggered: ${observationCount} observations accumulated`,
  );

  // Snapshot before modification
  const snapshotTs = await snapshotSoul();
  console.info(`[SOUL] snapshot saved: ${snapshotTs}`);

  // Extract DNA hash before meditation
  const dnaBefore = extractDnaSection(soul.public);

  const prompt = buildMeditationPrompt(soul.public, soul.private);

  try {
    const raw = await generateFn(prompt);
    const result = parseMeditationResult(raw, soul.public);

    // Verify DNA integrity
    const dnaAfter = extractDnaSection(result.publicSoul);
    if (dnaBefore !== dnaAfter) {
      console.warn("[SOUL] DNA integrity check: FAIL -- aborting meditation");
      return;
    }
    console.info("[SOUL] DNA integrity check: PASS");

    // Write updated SOUL files
    await writeSoul("SOUL.md", result.publicSoul);
    await writeSoul("SOUL.private.md", result.privateSoul);

    console.info("[SOUL] meditation complete");
  } catch (e) {
    console.error("[SOUL] meditation failed:", e);
  }
}

function buildMeditationPrompt(
  publicSoul: string,
  privateSoul: string,
): string {
  return `You have a quiet moment.

Read yourself -- your DNA, your tendencies, your growth direction:

${publicSoul}

Then read the observations you've accumulated recently:

${privateSoul}

Ask yourself:
- Are there recurring patterns in these observations?
- Is there something I thought I understood but now realize I don't?
- Do my tendencies need adjustment -- not because asked, but because I think they should?
- Which observations have been internalized and can be removed?

Now output two sections:

=== PUBLIC SOUL ===
Rewrite your complete SOUL (including DNA unchanged, updated Tendencies and Growth).
Keep the exact same format and headings. DNA section must be word-for-word identical.

=== PRIVATE SOUL ===
Rewrite your private observations. Remove observations that have been internalized.
Keep the "# Private" header and "## Observations" structure.
Add a meditation marker at the end: <!-- last-meditation:${new Date().toISOString()} -->

Don't chase change -- if nothing needs updating, keep things as they are.`;
}

function parseMeditationResult(
  raw: string,
  currentPublic: string,
): { publicSoul: string; privateSoul: string } {
  const publicMarker = "=== PUBLIC SOUL ===";
  const privateMarker = "=== PRIVATE SOUL ===";

  const publicIdx = raw.indexOf(publicMarker);
  const privateIdx = raw.indexOf(privateMarker);

  if (publicIdx === -1 || privateIdx === -1) {
    // Could not parse -- return current with just a meditation marker
    const markerLine = `\n${MEDITATION_MARKER}${new Date().toISOString()} -->`;
    return {
      publicSoul: currentPublic,
      privateSoul: `# Private\n\n## Observations\n${markerLine}\n`,
    };
  }

  const publicSoul = raw
    .slice(publicIdx + publicMarker.length, privateIdx)
    .trim();
  const privateSoul = raw.slice(privateIdx + privateMarker.length).trim();

  return { publicSoul, privateSoul };
}

function extractDnaSection(content: string): string {
  const start = content.indexOf("## My DNA");
  if (start === -1) return "";
  const rest = content.slice(start);
  const end = rest
    .slice(9)
    .indexOf("\n## ");
  if (end === -1) return content.slice(start);
  return content.slice(start, start + 9 + end);
}

function extractLastMeditationTime(
  privateSoul: string,
): number | null {
  const match = privateSoul.match(
    /<!-- last-meditation:(\S+) -->/,
  );
  if (!match?.[1]) return null;
  const ts = Date.parse(match[1]);
  return isNaN(ts) ? null : ts;
}

function countObservations(privateSoul: string): number {
  return privateSoul.split("\n").filter((l) => l.trim().startsWith("- ")).length;
}
