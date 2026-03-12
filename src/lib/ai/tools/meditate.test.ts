import { describe, expect, it, vi } from "vitest";

vi.mock("../soul-meditate", () => ({
  forceMeditate: vi.fn(),
}));

import { forceMeditate } from "../soul-meditate";
import { createMeditateTool } from "./meditate";

describe("createMeditateTool", () => {
  const generateFn = vi.fn();
  const tool = createMeditateTool(generateFn);

  it("has empty input schema", () => {
    expect(tool.inputSchema).toBeDefined();
  });

  it("returns success message when meditation succeeds", async () => {
    vi.mocked(forceMeditate).mockResolvedValue({
      success: true,
      snapshotTimestamp: "2026-03-09T12-00-00Z",
      updatedFiles: ["SOUL.md", "observations.md", "patterns.md"],
    });
    const result = await tool.execute!({}, { messages: [], toolCallId: "t1", abortSignal: new AbortController().signal });
    expect(result).toContain("Meditation complete");
    expect(result).toContain("2026-03-09T12-00-00Z");
    expect(result).toContain("SOUL.md, observations.md, patterns.md");
  });

  it("returns failure message when meditation fails", async () => {
    vi.mocked(forceMeditate).mockResolvedValue({
      success: false,
      error: "No observations",
    });
    const result = await tool.execute!({}, { messages: [], toolCallId: "t2", abortSignal: new AbortController().signal });
    expect(result).toContain("could not complete");
    expect(result).toContain("No observations");
  });

  it("passes generateFn to forceMeditate", async () => {
    vi.mocked(forceMeditate).mockResolvedValue({
      success: true,
      snapshotTimestamp: "ts",
      updatedFiles: [],
    });
    await tool.execute!({}, { messages: [], toolCallId: "t3", abortSignal: new AbortController().signal });
    expect(forceMeditate).toHaveBeenCalledWith(generateFn);
  });
});
