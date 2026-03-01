export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: "core" | "extension";
}

export const ALL_TOOL_INFOS: ToolInfo[] = [
  { id: "read", name: "Read File", description: "Read file contents from the workspace.", category: "core" },
  { id: "write", name: "Write File", description: "Create or overwrite a file in the workspace.", category: "core" },
  { id: "edit", name: "Edit File", description: "Apply targeted edits to an existing file.", category: "core" },
  { id: "bash", name: "Shell Command", description: "Execute a shell command in the workspace.", category: "core" },
  { id: "fetch_url", name: "Fetch URL", description: "Fetch content from a URL and return it as text.", category: "core" },
  { id: "parse_document", name: "Parse Document", description: "Parse document files into structured text.", category: "core" },
  { id: "skill", name: "Load Skill", description: "Load a skill's instructions into the conversation.", category: "core" },
  { id: "skill_resource", name: "Skill Resource", description: "Load a specific resource guide from an enabled skill.", category: "core" },
  { id: "js_interpreter", name: "JavaScript Interpreter", description: "Run JavaScript code in a sandboxed interpreter.", category: "extension" },
  { id: "write_skill", name: "Create Skill", description: "Save a skill to the user's Cove skill directory.", category: "extension" },
  { id: "officellm", name: "OfficeLLM", description: "Interact with office documents via OfficeLLM.", category: "extension" },
  { id: "render_mermaid", name: "Render Mermaid", description: "Render Mermaid diagrams to images.", category: "extension" },
];
