import { describe, expect, it, vi } from "vitest";

// Mock all tool modules to return simple placeholder objects
vi.mock("./read", () => ({ readTool: { _id: "read" } }));
vi.mock("./parse-document", () => ({ parseDocumentTool: { _id: "parse_document" } }));
vi.mock("./write", () => ({ writeTool: { _id: "write" } }));
vi.mock("./edit", () => ({ editTool: { _id: "edit" } }));
vi.mock("./bash", () => ({ createBashTool: vi.fn(() => ({ _id: "bash" })) }));
vi.mock("./fetch-url", () => ({ fetchUrlTool: { _id: "fetch_url" } }));
vi.mock("./office", () => ({ officeTool: { _id: "office" } }));
vi.mock("./jsInterpreter", () => ({ jsInterpreterTool: { _id: "cove_interpreter" } }));
vi.mock("./diagram", () => ({ diagramTool: { _id: "diagram" } }));
vi.mock("./write-skill", () => ({ writeSkillTool: { _id: "write_skill" } }));
vi.mock("./skill", () => ({
  createSkillTool: vi.fn(() => ({ _id: "skill_filtered" })),
  createSkillResourceTool: vi.fn(() => ({ _id: "skill_resource" })),
}));
vi.mock("./spawn-agent", () => ({
  createSpawnAgentTool: vi.fn(() => ({ _id: "spawn_agent" })),
}));
vi.mock("./meditate", () => ({
  createMeditateTool: vi.fn(() => ({ _id: "meditate" })),
}));

import { getAgentTools } from "./index";
import type { SubAgentContext } from "../sub-agent";

describe("getAgentTools", () => {
  it("returns built-in tools when called with empty skill list", () => {
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
      ]),
    );
    // cove_interpreter and diagram are built-in, should always appear
    expect(keys).toContain("cove_interpreter");
    expect(keys).toContain("diagram");
    // skill-bundled tools should not appear without their skill enabled
    expect(keys).not.toContain("write_skill");
    expect(keys).not.toContain("office");
    // spawn_agent should not appear without subAgentContext
    expect(keys).not.toContain("spawn_agent");
  });

  it("includes write_skill when skill-creator is enabled", () => {
    const tools = getAgentTools(["skill-creator"]);
    expect(Object.keys(tools)).toContain("write_skill");
  });

  it("does not include write_skill without skill-creator", () => {
    const tools = getAgentTools(["some-other-skill"]);
    expect(Object.keys(tools)).not.toContain("write_skill");
  });

  it("includes office when OfficeLLM skill enabled and runtime available", () => {
    const tools = getAgentTools(["OfficeLLM"], { runtimeAvailability: { office: true } });
    expect(Object.keys(tools)).toContain("office");
  });

  it("does not include office when runtime not available", () => {
    const tools = getAgentTools(["OfficeLLM"], { runtimeAvailability: { office: false } });
    expect(Object.keys(tools)).not.toContain("office");
  });

  it("does not include office when OfficeLLM skill not enabled", () => {
    const tools = getAgentTools([], { runtimeAvailability: { office: true } });
    expect(Object.keys(tools)).not.toContain("office");
  });

  it("does not include office when runtimeAvailability omitted", () => {
    const tools = getAgentTools(["OfficeLLM"]);
    expect(Object.keys(tools)).not.toContain("office");
  });

  it("diagram is always available as built-in regardless of skills", () => {
    const tools = getAgentTools([]);
    expect(Object.keys(tools)).toContain("diagram");
  });

  it("includes all skill-bundled tools when all conditions met", () => {
    const tools = getAgentTools(["skill-creator", "OfficeLLM"], {
      runtimeAvailability: { office: true },
    });
    const keys = Object.keys(tools);
    expect(keys).toContain("cove_interpreter");
    expect(keys).toContain("write_skill");
    expect(keys).toContain("office");
    expect(keys).toContain("diagram");
  });

  describe("meditate", () => {
    it("includes meditate when generateFn provided", () => {
      const tools = getAgentTools([], { generateFn: async () => ({ text: "", finishReason: "stop" }) });
      expect(Object.keys(tools)).toContain("meditate");
    });

    it("does not include meditate when generateFn omitted", () => {
      const tools = getAgentTools([]);
      expect(Object.keys(tools)).not.toContain("meditate");
    });
  });

  describe("spawn_agent", () => {
    function makeSubAgentContext(overrides: Partial<SubAgentContext> = {}): SubAgentContext {
      return {
        model: {} as never,
        parentTools: {},
        enabledSkillNames: [],
        currentDepth: 0,
        maxDepth: 2,
        ...overrides,
      };
    }

    it("includes spawn_agent when subAgentContext provided and depth allows", () => {
      const tools = getAgentTools([], {
        subAgentContext: makeSubAgentContext({ currentDepth: 0, maxDepth: 2 }),
      });
      expect(Object.keys(tools)).toContain("spawn_agent");
    });

    it("does not include spawn_agent when depth equals maxDepth", () => {
      const tools = getAgentTools([], {
        subAgentContext: makeSubAgentContext({ currentDepth: 2, maxDepth: 2 }),
      });
      expect(Object.keys(tools)).not.toContain("spawn_agent");
    });

    it("does not include spawn_agent when no subAgentContext", () => {
      const tools = getAgentTools([]);
      expect(Object.keys(tools)).not.toContain("spawn_agent");
    });
  });
});
