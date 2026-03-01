import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
}));
vi.mock("../skills/loader", () => ({
  loadSkill: vi.fn(),
}));

import { generateText } from "ai";
import { loadSkill } from "../skills/loader";
import { runSubAgent } from "./runner";
import type { SubAgentContext, SubAgentConfig } from "./types";

const mockGenerateText = vi.mocked(generateText);
const mockLoadSkill = vi.mocked(loadSkill);

beforeEach(() => vi.clearAllMocks());

function makeContext(overrides: Partial<SubAgentContext> = {}): SubAgentContext {
  return {
    model: { id: "test-model" } as never,
    parentTools: { read: { _id: "read" } as never, bash: { _id: "bash" } as never },
    enabledSkillNames: [],
    currentDepth: 0,
    maxDepth: 2,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    task: "Summarize the README",
    ...overrides,
  };
}

describe("runSubAgent", () => {
  it("returns error when depth exceeds maxDepth", async () => {
    const result = await runSubAgent(makeConfig(), makeContext({ currentDepth: 2, maxDepth: 2 }));
    expect(result.success).toBe(false);
    expect(result.error).toContain("depth");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("calls generateText with correct params on success", async () => {
    mockGenerateText.mockResolvedValue({
      text: "Summary here",
      usage: { inputTokens: 100, outputTokens: 50 },
    } as never);

    const ctx = makeContext({ workspacePath: "/workspace" });
    const result = await runSubAgent(makeConfig(), ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBe("Summary here");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: ctx.model,
        messages: [{ role: "user", content: "Summarize the README" }],
      }),
    );
  });

  it("includes workspace path in system prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);

    await runSubAgent(makeConfig(), makeContext({ workspacePath: "/my/project" }));

    const call = mockGenerateText.mock.calls[0]![0];
    expect(call.system).toContain("/my/project");
  });

  it("loads skills into system prompt", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);
    mockLoadSkill.mockReturnValue({
      meta: { name: "test-skill", description: "test" },
      content: "SKILL_INSTRUCTIONS",
    } as never);

    await runSubAgent(
      makeConfig({ skillNames: ["test-skill"] }),
      makeContext(),
    );

    const call = mockGenerateText.mock.calls[0]![0];
    expect(call.system).toContain("SKILL_INSTRUCTIONS");
    expect(mockLoadSkill).toHaveBeenCalledWith("test-skill");
  });

  it("filters tools by toolIds when provided", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);

    await runSubAgent(
      makeConfig({ toolIds: ["read"] }),
      makeContext(),
    );

    const call = mockGenerateText.mock.calls[0]![0];
    expect(Object.keys(call.tools)).toEqual(["read"]);
  });

  it("passes all parent tools when toolIds not provided", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);

    await runSubAgent(makeConfig(), makeContext());

    const call = mockGenerateText.mock.calls[0]![0];
    expect(Object.keys(call.tools)).toEqual(["read", "bash"]);
  });

  it("uses default maxSteps of 15", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);

    await runSubAgent(makeConfig(), makeContext());

    const { stepCountIs } = await import("ai");
    expect(vi.mocked(stepCountIs)).toHaveBeenCalledWith(15);
  });

  it("uses custom maxSteps when provided", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);

    await runSubAgent(makeConfig({ maxSteps: 5 }), makeContext());

    const { stepCountIs } = await import("ai");
    expect(vi.mocked(stepCountIs)).toHaveBeenCalledWith(5);
  });

  it("passes abortSignal from context", async () => {
    mockGenerateText.mockResolvedValue({ text: "ok", usage: {} } as never);
    const ac = new AbortController();

    await runSubAgent(makeConfig(), makeContext({ abortSignal: ac.signal }));

    const call = mockGenerateText.mock.calls[0]![0];
    expect(call.abortSignal).toBe(ac.signal);
  });

  it("returns error on non-abort exception", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));

    const result = await runSubAgent(makeConfig(), makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("API error");
    expect(result.output).toBe("");
  });

  it("re-throws AbortError", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    mockGenerateText.mockRejectedValue(abortError);

    await expect(runSubAgent(makeConfig(), makeContext())).rejects.toThrow("Aborted");
  });
});
