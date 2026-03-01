import type { Tool } from "ai";
import { readTool } from "./read";
import { parseDocumentTool } from "./parse-document";
import { writeTool } from "./write";
import { editTool } from "./edit";
import { bashTool } from "./bash";
import { fetchUrlTool } from "./fetch-url";
import { createSkillTool, createSkillResourceTool } from "./skill";
import { writeSkillTool } from "./write-skill";
import { officeTool } from "./office";
import { jsInterpreterTool } from "./jsInterpreter";
import { diagramTool } from "./diagram";
import { createSpawnAgentTool } from "./spawn-agent";
import { ALL_TOOL_INFOS } from "./tool-meta";
import type { SubAgentContext } from "../sub-agent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = Tool<any, any>;

/** Static tool implementations keyed by tool ID */
const TOOL_IMPLS: Record<string, AnyTool> = {
  read: readTool,
  parse_document: parseDocumentTool,
  write: writeTool,
  edit: editTool,
  bash: bashTool,
  fetch_url: fetchUrlTool,
  js_interpreter: jsInterpreterTool,
  write_skill: writeSkillTool,
  office: officeTool,
  diagram: diagramTool,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolRecord = Record<string, Tool<any, any>>;

/** 根据勾选名单生成工具集：built-in 无条件注册，skill-bundled 按 skill + runtime 门控 */
export function getAgentTools(
  enabledSkillNames: string[],
  options?: {
    runtimeAvailability?: Record<string, boolean>;
    subAgentContext?: SubAgentContext;
  },
): ToolRecord {
  const tools: ToolRecord = {};
  const enabledSet = new Set(enabledSkillNames);

  for (const info of ALL_TOOL_INFOS) {
    if (info.category === "built-in") {
      // Factory-created tools
      if (info.id === "skill") {
        tools.skill = createSkillTool(enabledSkillNames);
      } else if (info.id === "skill_resource") {
        tools.skill_resource = createSkillResourceTool(enabledSkillNames);
      } else if (info.id === "spawn_agent") {
        // spawn_agent requires a SubAgentContext and depth headroom
        const ctx = options?.subAgentContext;
        if (ctx && ctx.currentDepth < ctx.maxDepth) {
          tools.spawn_agent = createSpawnAgentTool({
            ...ctx,
            currentDepth: ctx.currentDepth + 1,
          });
        }
      } else {
        const impl = TOOL_IMPLS[info.id];
        if (impl) tools[info.id] = impl;
      }
      continue;
    }

    // skill-bundled: check skill enabled + runtime availability
    if (info.skillName && !enabledSet.has(info.skillName)) continue;
    if (info.runtimeCheck && !options?.runtimeAvailability?.[info.runtimeCheck]) continue;
    const impl = TOOL_IMPLS[info.id];
    if (impl) tools[info.id] = impl;
  }

  return tools;
}
