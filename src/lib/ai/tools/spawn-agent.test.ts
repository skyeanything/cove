import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sub-agent", () => ({
  runSubAgent: vi.fn(),
}));

import { runSubAgent } from "../sub-agent";
import { createSpawnAgentTool } from "./spawn-agent";
import type { SubAgentContext } from "../sub-agent";

const mockRunSubAgent = vi.mocked(runSubAgent);

beforeEach(() => vi.clearAllMocks());

function makeContext(overrides: Partial<SubAgentContext> = {}): SubAgentContext {
  return {
    model: { id: "test" } as never,
    parentTools: {},
    enabledSkillNames: [],
    currentDepth: 0,
    maxDepth: 2,
    ...overrides,
  };
}

describe("createSpawnAgentTool", () => {
  it("returns a tool with description and parameters", () => {
    const tool = createSpawnAgentTool(makeContext());
    expect(tool.description).toContain("sub-agent");
    expect(tool.inputSchema).toBeDefined();
  });

  it("calls runSubAgent with correct config on execute", async () => {
    mockRunSubAgent.mockResolvedValue({
      output: "Done!",
      success: true,
      inputTokens: 50,
      outputTokens: 30,
    });

    const ctx = makeContext();
    const tool = createSpawnAgentTool(ctx);
    const result = await tool.execute!(
      { task: "Fix the bug", tools: ["read", "edit"], skills: ["cove"] },
      { toolCallId: "tc1", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result).toBe("Done!");
    expect(mockRunSubAgent).toHaveBeenCalledWith(
      { task: "Fix the bug", toolIds: ["read", "edit"], skillNames: ["cove"] },
      ctx,
    );
  });

  it("returns error message when sub-agent fails", async () => {
    mockRunSubAgent.mockResolvedValue({
      output: "",
      success: false,
      error: "Max depth exceeded",
    });

    const tool = createSpawnAgentTool(makeContext());
    const result = await tool.execute!(
      { task: "Do something" },
      { toolCallId: "tc2", messages: [], abortSignal: new AbortController().signal },
    );

    expect(result).toContain("Sub-agent error");
    expect(result).toContain("Max depth exceeded");
  });

  it("passes undefined toolIds and skillNames when not provided", async () => {
    mockRunSubAgent.mockResolvedValue({ output: "ok", success: true });

    const tool = createSpawnAgentTool(makeContext());
    await tool.execute!(
      { task: "Simple task" },
      { toolCallId: "tc3", messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockRunSubAgent).toHaveBeenCalledWith(
      { task: "Simple task", toolIds: undefined, skillNames: undefined },
      expect.anything(),
    );
  });
});
