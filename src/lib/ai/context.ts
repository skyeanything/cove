import type { Assistant } from "@/db/types";
import soulPrompt from "@/prompts/SOUL.md?raw";
import { getAlwaysSkills } from "./skills/loader";

/** System prompt: SOUL.md identity + context + assistant/custom injections + skills */
export function buildSystemPrompt(options: {
  assistant?: Assistant;
  customInstructions?: string;
  workspacePath?: string;
  officeAvailable?: boolean;
}): string {
  const parts: string[] = [];

  parts.push(soulPrompt);
  parts.push(`Time: ${new Date().toISOString()}`);
  if (options.workspacePath) {
    parts.push(`Workspace: ${options.workspacePath}`);
  }

  if (options.officeAvailable) {
    parts.push(
      "The office tool is available. Use the office tool for document operations (DOCX/PPTX/XLSX). Load the 'office' skill for detailed usage instructions.",
    );
  }

  if (options.assistant?.system_instruction) {
    parts.push(options.assistant.system_instruction);
  }
  if (options.customInstructions) {
    parts.push(options.customInstructions);
  }

  const alwaysSkills = getAlwaysSkills();
  for (const skill of alwaysSkills) {
    parts.push(skill.content);
  }
  parts.push("Use the skill tool to load domain-specific instructions when a task matches an available skill in that tool.");
  parts.push("Use the spawn_agent tool to delegate independent subtasks to a sub-agent when the task can be completed without real-time user interaction.");

  return parts.join("\n\n");
}
