import type { Assistant } from "@/db/types";
import { getAlwaysSkills } from "./skills/loader";

/** 极简系统提示词：最小必要信息 + 四工具规则 + 技能摘要，保留 assistant/custom 注入 */
export function buildSystemPrompt(options: {
  assistant?: Assistant;
  customInstructions?: string;
  workspacePath?: string;
  officellmAvailable?: boolean;
}): string {
  const parts: string[] = [];

  parts.push("You are a helpful coding assistant.");
  parts.push(`Time: ${new Date().toISOString()}`);
  if (options.workspacePath) {
    parts.push(`Workspace: ${options.workspacePath}`);
  }

  // 四工具使用规则（极简）
  parts.push(
    "Tools: read (files in workspace); write/edit only after reading; prefer bash+rg for search, bash+curl for web; dangerous bash requires user approval.",
  );

  if (options.officellmAvailable) {
    parts.push(
      "The officellm binary is detected on host. This does not guarantee direct CLI access in the current toolset. For document operations (DOCX/PPTX/XLSX), load the 'officellm' skill for guidance; if execution tools are unavailable, state the limitation instead of attempting unsupported commands.",
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

  return parts.join("\n\n");
}
