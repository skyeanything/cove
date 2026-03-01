import { describe, expect, it, vi } from "vitest";

// Mock all tool modules to return simple placeholder objects
vi.mock("./read", () => ({ readTool: { _id: "read" } }));
vi.mock("./parse-document", () => ({ parseDocumentTool: { _id: "parse_document" } }));
vi.mock("./write", () => ({ writeTool: { _id: "write" } }));
vi.mock("./edit", () => ({ editTool: { _id: "edit" } }));
vi.mock("./bash", () => ({ bashTool: { _id: "bash" } }));
vi.mock("./fetch-url", () => ({ fetchUrlTool: { _id: "fetch_url" } }));
vi.mock("./officellm", () => ({ officellmTool: { _id: "officellm" } }));
vi.mock("./jsInterpreter", () => ({ jsInterpreterTool: { _id: "js_interpreter" } }));
vi.mock("./render-mermaid", () => ({ renderMermaidTool: { _id: "render_mermaid" } }));
vi.mock("./write-skill", () => ({ writeSkillTool: { _id: "write_skill" } }));
vi.mock("./skill", () => ({
  skillTool: { _id: "skill" },
  createSkillTool: vi.fn(() => ({ _id: "skill_filtered" })),
  createSkillResourceTool: vi.fn(() => ({ _id: "skill_resource" })),
}));

import { AGENT_TOOLS, getAgentTools } from "./index";

describe("AGENT_TOOLS", () => {
  it("contains all 10 default tool keys", () => {
    const keys = Object.keys(AGENT_TOOLS);
    expect(keys).toEqual(
      expect.arrayContaining([
        "read",
        "parse_document",
        "write",
        "edit",
        "bash",
        "fetch_url",
        "skill",
        "officellm",
        "js_interpreter",
        "render_mermaid",
      ]),
    );
    expect(keys).toHaveLength(10);
  });
});

describe("getAgentTools", () => {
  it("returns base tools when called with empty skill list", () => {
    const tools = getAgentTools([]);
    const keys = Object.keys(tools);
    expect(keys).toEqual(
      expect.arrayContaining([
        "read",
        "parse_document",
        "write",
        "edit",
        "bash",
        "fetch_url",
        "skill",
        "skill_resource",
        "js_interpreter",
      ]),
    );
    expect(keys).not.toContain("write_skill");
    expect(keys).not.toContain("officellm");
    expect(keys).not.toContain("render_mermaid");
  });

  it("includes write_skill when skill-creator is enabled", () => {
    const tools = getAgentTools(["skill-creator"]);
    expect(Object.keys(tools)).toContain("write_skill");
  });

  it("does not include write_skill without skill-creator", () => {
    const tools = getAgentTools(["some-other-skill"]);
    expect(Object.keys(tools)).not.toContain("write_skill");
  });

  it("includes officellm and render_mermaid when option is true", () => {
    const tools = getAgentTools([], { officellm: true });
    const keys = Object.keys(tools);
    expect(keys).toContain("officellm");
    expect(keys).toContain("render_mermaid");
  });

  it("does not include officellm or render_mermaid when option is false or omitted", () => {
    expect(Object.keys(getAgentTools([]))).not.toContain("officellm");
    expect(Object.keys(getAgentTools([]))).not.toContain("render_mermaid");
    expect(Object.keys(getAgentTools([], { officellm: false }))).not.toContain("officellm");
    expect(Object.keys(getAgentTools([], { officellm: false }))).not.toContain("render_mermaid");
  });

  it("includes write_skill, officellm, and render_mermaid when all conditions met", () => {
    const tools = getAgentTools(["skill-creator"], { officellm: true });
    const keys = Object.keys(tools);
    expect(keys).toContain("write_skill");
    expect(keys).toContain("officellm");
    expect(keys).toContain("render_mermaid");
  });
});
