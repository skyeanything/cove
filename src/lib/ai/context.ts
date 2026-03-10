import type { Assistant } from "@/db/types";
import { getAlwaysSkills } from "./skills/loader";

/** System prompt: SOUL identity + always-on skills + context + assistant/custom injections */
export function buildSystemPrompt(options: {
  assistant?: Assistant;
  customInstructions?: string;
  workspacePath?: string;
  officeAvailable?: boolean;
  /** Pre-formatted SOUL prompt (from formatSoulPrompt). Injected first. */
  soulPrompt?: string;
}): string {
  const parts: string[] = [];

  // SOUL identity injected at the very top -- cove knows who she is before anything else
  if (options.soulPrompt) {
    parts.push(options.soulPrompt);
  }

  parts.push(`Time: ${new Date().toISOString()}`);
  if (options.workspacePath) {
    parts.push(`Workspace: ${options.workspacePath}`);
  }

  if (options.officeAvailable) {
    parts.push("Office tool available for DOCX/PPTX/XLSX. Load 'OfficeLLM' skill for commands.");
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

  // Operational rules (condensed — details in cove-core skill)
  parts.push("Use dedicated tools first. Load skills for domain-specific tasks. Use spawn_agent for independent subtasks.");

  return parts.join("\n\n");
}
