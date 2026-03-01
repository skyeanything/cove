import { tool } from "ai";
import { z } from "zod/v4";
import { runSubAgent } from "../sub-agent";
import type { SubAgentContext } from "../sub-agent";

/** Factory: creates a spawn_agent tool bound to the given sub-agent context */
export function createSpawnAgentTool(context: SubAgentContext) {
  return tool({
    description:
      "Spawn a sub-agent to work on a subtask independently. " +
      "The sub-agent runs to completion and returns its output. " +
      "Use this for tasks that can be delegated without real-time interaction.",
    inputSchema: z.object({
      task: z.string().describe("Clear description of what the sub-agent should accomplish"),
      tools: z.array(z.string()).optional().describe("Tool IDs available to the sub-agent (defaults to all parent tools)"),
      skills: z.array(z.string()).optional().describe("Skill names to load into the sub-agent's context"),
    }),
    execute: async ({ task, tools, skills }) => {
      const result = await runSubAgent(
        { task, toolIds: tools, skillNames: skills },
        context,
      );
      if (!result.success) return `Sub-agent error: ${result.error}`;
      return result.output;
    },
  });
}
