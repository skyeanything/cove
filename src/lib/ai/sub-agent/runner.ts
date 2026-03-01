import { generateText, stepCountIs } from "ai";
import { loadSkill } from "../skills/loader";
import type { ToolRecord } from "../tools";
import type { SubAgentConfig, SubAgentContext, SubAgentResult } from "./types";

const DEFAULT_MAX_STEPS = 15;

/** Build a system prompt for the sub-agent including task and loaded skills */
function buildSubAgentPrompt(config: SubAgentConfig, context: SubAgentContext): string {
  const parts: string[] = [];
  parts.push("You are a sub-agent working on a specific task. Complete the task and return your result.");
  if (context.workspacePath) {
    parts.push(`Workspace: ${context.workspacePath}`);
  }
  parts.push(`Task: ${config.task}`);

  if (config.skillNames) {
    for (const name of config.skillNames) {
      const skill = loadSkill(name);
      if (skill) parts.push(skill.content);
    }
  }
  return parts.join("\n\n");
}

/** Filter parent tools to only include the specified tool IDs */
function filterTools(parentTools: ToolRecord, toolIds?: string[]): ToolRecord {
  if (!toolIds || toolIds.length === 0) return { ...parentTools };
  const filtered: ToolRecord = {};
  for (const id of toolIds) {
    if (parentTools[id]) filtered[id] = parentTools[id];
  }
  return filtered;
}

/**
 * Run a sub-agent with its own generateText() call.
 * Sub-agents are invisible to the user and run to completion.
 */
export async function runSubAgent(
  config: SubAgentConfig,
  context: SubAgentContext,
): Promise<SubAgentResult> {
  if (context.currentDepth >= context.maxDepth) {
    return { output: "", success: false, error: "Max sub-agent depth exceeded" };
  }

  const system = buildSubAgentPrompt(config, context);
  const tools = filterTools(context.parentTools, config.toolIds);
  const maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;

  try {
    const result = await generateText({
      model: context.model,
      system,
      messages: [{ role: "user", content: config.task }],
      tools,
      stopWhen: stepCountIs(maxSteps),
      abortSignal: context.abortSignal,
    });

    return {
      output: result.text,
      success: true,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return {
      output: "",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
