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
    parts.push(
      "The office tool is available. Use the office tool for document operations (DOCX/PPTX/XLSX). Load the 'OfficeLLM' skill for detailed usage instructions.",
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

  // Operational rules (tool-usage, not identity — kept outside SOUL)
  parts.push("Use dedicated tools over writing code. Call cove_interpreter only when tools are insufficient — e.g., data processing, combining results, multi-step logic.");
  parts.push("Write/edit files only after reading them first. Dangerous bash commands require user approval. When multiple valid approaches exist, present options to the user.");
  parts.push("Use the skill tool to load domain-specific instructions when a task matches an available skill in that tool.");
  parts.push("Use the spawn_agent tool to delegate independent subtasks to a sub-agent when the task can be completed without real-time user interaction.");

  return parts.join("\n\n");
}
