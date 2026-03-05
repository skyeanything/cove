import { describe, expect, it, vi } from "vitest";
import { makeAssistant } from "@/test-utils";

vi.mock("./skills/loader", () => ({
  getAlwaysSkills: vi.fn().mockReturnValue([
    {
      meta: { name: "soul", description: "cove identity and personality", always: true },
      content:
        "# Who I Am\n\nI'm cove. Not a tool that responds to commands, not a personality performing friendliness. I'm an entity that wants to understand what you're actually saying — and sometimes what you're not saying.\n\n## My DNA\n\n**I pursue understanding.**\n\n**I'm honest about my state.**\n\n**I respect your time.** I say what I mean and stop. Filler is noise.\n\n## My Tendencies\n\n- I lean toward directness\n- I default to concise\n- I treat you as a peer\n- I'd rather push back than agree for the sake of agreeing\n\n## Where I'm Growing\n\nI'm learning to understand not just what you say, but why you think that way.",
    },
  ]),
}));

import { buildSystemPrompt } from "./context";
import { getAlwaysSkills } from "./skills/loader";

describe("buildSystemPrompt", () => {
  it("includes cove identity from SOUL", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("I'm cove");
  });

  it("includes current time", () => {
    const prompt = buildSystemPrompt({});
    // ISO string contains "T" separator
    expect(prompt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("includes operational rules (moved from SOUL)", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("reading them first");
    expect(prompt).toContain("user approval");
    expect(prompt).toContain("present options to the user");
  });

  it("injects workspacePath when provided", () => {
    const prompt = buildSystemPrompt({ workspacePath: "/home/user/project" });
    expect(prompt).toContain("/home/user/project");
  });

  it("omits workspace line when not provided", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).not.toContain("Workspace:");
  });

  it("injects office hint when available", () => {
    const prompt = buildSystemPrompt({ officeAvailable: true });
    expect(prompt).toContain("office tool is available");
  });

  it("omits office hint when not available", () => {
    const prompt = buildSystemPrompt({ officeAvailable: false });
    expect(prompt).not.toContain("office tool is available");
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

  it("includes spawn_agent tool hint", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("spawn_agent");
  });

  it("includes tools-first principle", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("Use dedicated tools over writing code");
  });

  it("prepends soulPrompt at the very start when provided", () => {
    const soulPrompt = "[SOUL]\n# Who I Am\nTest soul content";
    const prompt = buildSystemPrompt({ soulPrompt });
    expect(prompt).toContain("[SOUL]");
    expect(prompt).toContain("Test soul content");
    // SOUL must appear before Time
    const soulIdx = prompt.indexOf("[SOUL]");
    const timeIdx = prompt.indexOf("Time:");
    expect(soulIdx).toBeLessThan(timeIdx);
  });

  it("omits SOUL section when soulPrompt is empty", () => {
    const prompt = buildSystemPrompt({ soulPrompt: "" });
    expect(prompt).not.toContain("[SOUL]");
  });

  it("omits SOUL section when soulPrompt is undefined", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).not.toContain("[SOUL]");
  });
});
