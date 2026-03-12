import { tool } from "ai";
import { z } from "zod/v4";
import { forceMeditate, type MeditationOutcome, type MeditateGenResult } from "../soul-meditate";

type GenerateFn = (prompt: string) => Promise<MeditateGenResult>;

export function createMeditateTool(generateFn: GenerateFn) {
  return tool({
    description:
      "Reflect on accumulated observations and update your soul files. " +
      "Use when the user asks you to meditate, reflect, or think about what you've learned. " +
      "No parameters needed.",
    inputSchema: z.object({}),
    execute: async (): Promise<string> => {
      const outcome: MeditationOutcome = await forceMeditate(generateFn);
      if (outcome.success) {
        const files = outcome.updatedFiles?.join(", ") ?? "none";
        return `Meditation complete. Snapshot: ${outcome.snapshotTimestamp}. Updated: ${files}.`;
      }
      return `Meditation could not complete: ${outcome.error ?? "unknown error"}.`;
    },
  });
}
