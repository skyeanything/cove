import { readTool } from "./read";
import { parseDocumentTool } from "./parse-document";
import { writeTool } from "./write";
import { editTool } from "./edit";
import { bashTool } from "./bash";
import { fetchUrlTool } from "./fetch-url";
import { skillTool, createSkillTool } from "./skill";

export const AGENT_TOOLS = {
  read: readTool,
  parse_document: parseDocumentTool,
  write: writeTool,
  edit: editTool,
  bash: bashTool,
  fetch_url: fetchUrlTool,
  skill: skillTool,
} as const;

export type AgentToolId = keyof typeof AGENT_TOOLS;

/** 根据勾选名单生成工具集：仅勾选的 skill 会出现在 skill 工具中并可供模型调用 */
export function getAgentTools(enabledSkillNames: string[]) {
  return {
    read: readTool,
    parse_document: parseDocumentTool,
    write: writeTool,
    edit: editTool,
    bash: bashTool,
    fetch_url: fetchUrlTool,
    skill: createSkillTool(enabledSkillNames),
  } as const;
}
