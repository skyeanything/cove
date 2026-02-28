import { describe, expect, it, vi } from "vitest";
import { makeAssistant } from "@/test-utils";

vi.mock("./skills/loader", () => ({
  getAlwaysSkills: vi.fn().mockReturnValue([]),
}));

import { buildSystemPrompt } from "./context";
import { getAlwaysSkills } from "./skills/loader";

describe("buildSystemPrompt", () => {
  it("includes base assistant identity", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("helpful coding assistant");
  });

  it("includes current time", () => {
    const prompt = buildSystemPrompt({});
    // ISO string contains "T" separator
    expect(prompt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("includes tool usage rules", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("read");
    expect(prompt).toContain("write");
    expect(prompt).toContain("bash");
  });

  it("injects workspacePath when provided", () => {
    const prompt = buildSystemPrompt({ workspacePath: "/home/user/project" });
    expect(prompt).toContain("/home/user/project");
  });

  it("omits workspace line when not provided", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).not.toContain("Workspace:");
  });

  it("injects officellm hint when available", () => {
    const prompt = buildSystemPrompt({ officellmAvailable: true });
    expect(prompt).toContain("officellm is available");
  });

  it("omits officellm hint when not available", () => {
    const prompt = buildSystemPrompt({ officellmAvailable: false });
    expect(prompt).not.toContain("officellm is available");
  });

  it("injects assistant system_instruction", () => {
    const assistant = makeAssistant({ system_instruction: "You are a poet." });
    const prompt = buildSystemPrompt({ assistant });
    expect(prompt).toContain("You are a poet.");
  });

  it("injects customInstructions", () => {
    const prompt = buildSystemPrompt({ customInstructions: "Always respond in Chinese." });
    expect(prompt).toContain("Always respond in Chinese.");
  });

  it("injects always-on skill content", () => {
    vi.mocked(getAlwaysSkills).mockReturnValue([
      {
        meta: { name: "test-skill", description: "test", always: true },
        content: "SKILL_CONTENT_HERE",
      },
    ]);

    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("SKILL_CONTENT_HERE");
  });

  it("includes skill tool hint", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("skill tool");
  });
});
