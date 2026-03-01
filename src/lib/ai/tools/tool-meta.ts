export interface ToolInfo {
  id: string;
  name: string;
  category: "core" | "extension";
}

export const ALL_TOOL_INFOS: ToolInfo[] = [
  { id: "read", name: "Read File", category: "core" },
  { id: "write", name: "Write File", category: "core" },
  { id: "edit", name: "Edit File", category: "core" },
  { id: "bash", name: "Shell Command", category: "core" },
  { id: "fetch_url", name: "Fetch URL", category: "core" },
  { id: "parse_document", name: "Parse Document", category: "core" },
  { id: "skill", name: "Load Skill", category: "core" },
  { id: "skill_resource", name: "Skill Resource", category: "core" },
  { id: "js_interpreter", name: "JavaScript Interpreter", category: "extension" },
  { id: "write_skill", name: "Create Skill", category: "extension" },
  { id: "officellm", name: "OfficeLLM", category: "extension" },
  { id: "render_mermaid", name: "Render Mermaid", category: "extension" },
];
