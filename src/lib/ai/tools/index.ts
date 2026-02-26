import type { Tool } from "ai";
import { readTool } from "./read";
import { parseDocumentTool } from "./parse-document";
import { writeTool } from "./write";
import { editTool } from "./edit";
import { bashTool } from "./bash";
import { fetchUrlTool } from "./fetch-url";
import { skillTool, createSkillTool, createSkillResourceTool } from "./skill";
import { writeSkillTool } from "./write-skill";
import { officellmTool } from "./officellm";

export const AGENT_TOOLS = {
  read: readTool,
  parse_document: parseDocumentTool,
  write: writeTool,
  edit: editTool,
  bash: bashTool,
  fetch_url: fetchUrlTool,
  skill: skillTool,
  officellm: officellmTool,
} as const;

export type AgentToolId = keyof typeof AGENT_TOOLS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolRecord = Record<string, Tool<any, any>>;

/** 根据勾选名单生成工具集：仅勾选的 skill 会出现在 skill 工具中并可供模型调用 */
export function getAgentTools(
  enabledSkillNames: string[],
  options?: { officellm?: boolean },
): ToolRecord {
  const tools: ToolRecord = {
    read: readTool,
    parse_document: parseDocumentTool,
    write: writeTool,
    edit: editTool,
    bash: bashTool,
    fetch_url: fetchUrlTool,
    skill: createSkillTool(enabledSkillNames),
    skill_resource: createSkillResourceTool(enabledSkillNames),
  };
  if (enabledSkillNames.includes("skill-creator")) {
    tools.write_skill = writeSkillTool;
  }
  if (options?.officellm) {
    tools.officellm = officellmTool;
  }
  return tools;
}
