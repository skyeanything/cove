import { describe, expect, it, vi } from "vitest";

// Mock all tool modules to return simple placeholder objects
vi.mock("./read", () => ({ readTool: { _id: "read" } }));
vi.mock("./parse-document", () => ({ parseDocumentTool: { _id: "parse_document" } }));
vi.mock("./write", () => ({ writeTool: { _id: "write" } }));
vi.mock("./edit", () => ({ editTool: { _id: "edit" } }));
vi.mock("./bash", () => ({ bashTool: { _id: "bash" } }));
vi.mock("./fetch-url", () => ({ fetchUrlTool: { _id: "fetch_url" } }));
vi.mock("./office", () => ({ officeTool: { _id: "office" } }));
vi.mock("./jsInterpreter", () => ({ jsInterpreterTool: { _id: "js_interpreter" } }));
vi.mock("./diagram", () => ({ diagramTool: { _id: "diagram" } }));
vi.mock("./write-skill", () => ({ writeSkillTool: { _id: "write_skill" } }));
vi.mock("./skill", () => ({
  createSkillTool: vi.fn(() => ({ _id: "skill_filtered" })),
  createSkillResourceTool: vi.fn(() => ({ _id: "skill_resource" })),
}));
vi.mock("./spawn-agent", () => ({
  createSpawnAgentTool: vi.fn(() => ({ _id: "spawn_agent" })),
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
    // skill-bundled tools should not appear without their skill enabled
    expect(keys).not.toContain("js_interpreter");
    expect(keys).not.toContain("write_skill");
    expect(keys).not.toContain("office");
    expect(keys).not.toContain("diagram");
    // spawn_agent should not appear without subAgentContext
    expect(keys).not.toContain("spawn_agent");
  });

  it("includes js_interpreter when cove skill is enabled", () => {
    const tools = getAgentTools(["cove"]);
    expect(Object.keys(tools)).toContain("js_interpreter");
  });

  it("does not include js_interpreter without cove skill", () => {
    const tools = getAgentTools(["some-other-skill"]);
    expect(Object.keys(tools)).not.toContain("js_interpreter");
  });

  it("includes write_skill when skill-creator is enabled", () => {
    const tools = getAgentTools(["skill-creator"]);
    expect(Object.keys(tools)).toContain("write_skill");
  });

  it("does not include write_skill without skill-creator", () => {
    const tools = getAgentTools(["some-other-skill"]);
    expect(Object.keys(tools)).not.toContain("write_skill");
  });

  it("includes office and diagram when office skill enabled and runtime available", () => {
    const tools = getAgentTools(["office"], { runtimeAvailability: { office: true } });
    const keys = Object.keys(tools);
    expect(keys).toContain("office");
    expect(keys).toContain("diagram");
  });

  it("does not include office or diagram when runtime not available", () => {
    const tools = getAgentTools(["office"], { runtimeAvailability: { office: false } });
    expect(Object.keys(tools)).not.toContain("office");
    expect(Object.keys(tools)).not.toContain("diagram");
  });

  it("does not include office or diagram when office skill not enabled", () => {
    const tools = getAgentTools([], { runtimeAvailability: { office: true } });
    expect(Object.keys(tools)).not.toContain("office");
    expect(Object.keys(tools)).not.toContain("diagram");
  });

  it("does not include office or diagram when runtimeAvailability omitted", () => {
    const tools = getAgentTools(["office"]);
    expect(Object.keys(tools)).not.toContain("office");
    expect(Object.keys(tools)).not.toContain("diagram");
  });

  it("includes all skill-bundled tools when all conditions met", () => {
    const tools = getAgentTools(["cove", "skill-creator", "office"], {
      runtimeAvailability: { office: true },
    });
    const keys = Object.keys(tools);
    expect(keys).toContain("js_interpreter");
    expect(keys).toContain("write_skill");
    expect(keys).toContain("office");
    expect(keys).toContain("diagram");
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
