export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: "built-in" | "skill-bundled";
  /** skill-bundled 工具关联的 skill 名；该 skill 需要被启用此工具才注册 */
  skillName?: string;
  /** 运行时可用性检查 key（如 "office" 对应 sidecar 检测） */
  runtimeCheck?: string;
  /** Whether this tool should appear in @mention autocomplete */
  userVisible?: boolean;
}

export const ALL_TOOL_INFOS: ToolInfo[] = [
  { id: "read", name: "Read File", description: "Read file contents from the workspace.", category: "built-in", userVisible: true },
  { id: "write", name: "Write File", description: "Create or overwrite a file in the workspace.", category: "built-in", userVisible: true },
  { id: "edit", name: "Edit File", description: "Apply targeted edits to an existing file.", category: "built-in", userVisible: true },
  { id: "bash", name: "Shell Command", description: "Execute a shell command in the workspace.", category: "built-in", userVisible: true },
  { id: "fetch_url", name: "Fetch URL", description: "Fetch content from a URL and return it as text.", category: "built-in", userVisible: true },
  { id: "parse_document", name: "Parse Document", description: "Parse document files into structured text.", category: "built-in", userVisible: true },
  { id: "skill", name: "Load Skill", description: "Load a skill's instructions into the conversation.", category: "built-in", userVisible: false },
  { id: "skill_resource", name: "Skill Resource", description: "Load a specific resource guide from an enabled skill.", category: "built-in", userVisible: false },
  { id: "spawn_agent", name: "Spawn Agent", description: "Run a sub-agent for independent subtask execution.", category: "built-in", userVisible: false },
  { id: "js_interpreter", name: "JavaScript Interpreter", description: "Run JavaScript code in a sandboxed interpreter.", category: "skill-bundled", skillName: "cove", userVisible: true },
  { id: "write_skill", name: "Create Skill", description: "Save a skill to the user's Cove skill directory.", category: "skill-bundled", skillName: "skill-creator", userVisible: false },
  { id: "office", name: "Office", description: "Interact with office documents via OfficeLLM.", category: "skill-bundled", skillName: "office", runtimeCheck: "office", userVisible: true },
  { id: "diagram", name: "Diagram", description: "Render diagrams to images.", category: "skill-bundled", skillName: "office", runtimeCheck: "office", userVisible: true },
];

/** Tools visible to users in @mention autocomplete */
export const USER_VISIBLE_TOOLS = ALL_TOOL_INFOS.filter((t) => t.userVisible);
