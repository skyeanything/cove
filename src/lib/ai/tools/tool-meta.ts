export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: "core" | "extension";
  /** Whether this tool should appear in @mention autocomplete */
  userVisible: boolean;
}

export const ALL_TOOL_INFOS: ToolInfo[] = [
  { id: "read", name: "Read File", description: "Read file contents from the workspace.", category: "core", userVisible: true },
  { id: "write", name: "Write File", description: "Create or overwrite a file in the workspace.", category: "core", userVisible: true },
  { id: "edit", name: "Edit File", description: "Apply targeted edits to an existing file.", category: "core", userVisible: true },
  { id: "bash", name: "Shell Command", description: "Execute a shell command in the workspace.", category: "core", userVisible: true },
  { id: "fetch_url", name: "Fetch URL", description: "Fetch content from a URL and return it as text.", category: "core", userVisible: true },
  { id: "parse_document", name: "Parse Document", description: "Parse document files into structured text.", category: "core", userVisible: true },
  { id: "skill", name: "Load Skill", description: "Load a skill's instructions into the conversation.", category: "core", userVisible: false },
  { id: "skill_resource", name: "Skill Resource", description: "Load a specific resource guide from an enabled skill.", category: "core", userVisible: false },
  { id: "js_interpreter", name: "JavaScript Interpreter", description: "Run JavaScript code in a sandboxed interpreter.", category: "extension", userVisible: true },
  { id: "write_skill", name: "Create Skill", description: "Save a skill to the user's Cove skill directory.", category: "extension", userVisible: false },
  { id: "officellm", name: "OfficeLLM", description: "Interact with office documents via OfficeLLM.", category: "extension", userVisible: true },
  { id: "render_mermaid", name: "Render Mermaid", description: "Render Mermaid diagrams to images.", category: "extension", userVisible: true },
];

/** Tools visible to users in @mention autocomplete */
export const USER_VISIBLE_TOOLS = ALL_TOOL_INFOS.filter((t) => t.userVisible);
