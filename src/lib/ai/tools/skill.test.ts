import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Skill, SkillMeta } from "@/lib/ai/skills/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@/stores/skillsStore", () => ({
  useSkillsStore: { getState: vi.fn() },
}));
vi.mock("@/lib/ai/skills/loader", () => ({
  loadSkill: vi.fn(),
  listSkills: vi.fn(),
  getAllBundledSkills: vi.fn(),
  formatSkillContentForTool: vi.fn(),
  getSkillToolDescription: vi.fn(),
  getSkillToolDescriptionForSkills: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useSkillsStore } from "@/stores/skillsStore";
import {
  loadSkill,
  listSkills,
  getAllBundledSkills,
  formatSkillContentForTool,
  getSkillToolDescription,
  getSkillToolDescriptionForSkills,
} from "@/lib/ai/skills/loader";
import { sourcePriority, createSkillTool, skillTool, createSkillResourceTool } from "./skill";

const mockInvoke = vi.mocked(invoke);
const mockGetState = vi.mocked(useSkillsStore.getState);
const mockLoadSkill = vi.mocked(loadSkill);
const mockListSkills = vi.mocked(listSkills);
const mockGetAllBundled = vi.mocked(getAllBundledSkills);
const mockFormatContent = vi.mocked(formatSkillContentForTool);
const mockGetDescription = vi.mocked(getSkillToolDescription);
const mockGetDescForSkills = vi.mocked(getSkillToolDescriptionForSkills);

function makeMeta(name: string, description = ""): SkillMeta {
  return { name, description };
}

function makeSkill(name: string, content = "content", resources?: Skill["resources"]): Skill {
  return { meta: makeMeta(name), content, resources };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockReturnValue({ externalSkills: [] } as ReturnType<typeof mockGetState>);
  mockListSkills.mockReturnValue([]);
  mockGetAllBundled.mockReturnValue([]);
  mockGetDescription.mockReturnValue("skill tool description");
  mockGetDescForSkills.mockReturnValue("filtered skill tool description");
  mockFormatContent.mockImplementation((s: Skill) => `formatted:${s.meta.name}`);
});

// ---------- sourcePriority ----------

describe("sourcePriority", () => {
  it("returns 0 for cove", () => {
    expect(sourcePriority("cove")).toBe(0);
  });

  it("returns 1 for claude", () => {
    expect(sourcePriority("claude")).toBe(1);
  });

  it("returns 1 for office-bundled", () => {
    expect(sourcePriority("office-bundled")).toBe(1);
  });

  it("returns 2 for other / app", () => {
    expect(sourcePriority("other")).toBe(2);
    expect(sourcePriority("app")).toBe(2);
    expect(sourcePriority("office")).toBe(2);
  });

  it("is case-insensitive", () => {
    expect(sourcePriority("Cove")).toBe(0);
    expect(sourcePriority("CLAUDE")).toBe(1);
    expect(sourcePriority("Office-Bundled")).toBe(1);
  });
});

// ---------- createSkillTool ----------

describe("createSkillTool", () => {
  it("returns formatted content for an enabled bundled skill", async () => {
    const skill = makeSkill("my-skill");
    mockListSkills.mockReturnValue([makeMeta("my-skill")]);
    mockLoadSkill.mockReturnValue(skill);

    const t = createSkillTool(["my-skill"]);
    const result = await t.execute({ name: "my-skill" }, {} as never);

    expect(result).toBe("formatted:my-skill");
    expect(mockFormatContent).toHaveBeenCalledWith(skill);
  });

  it("returns not-enabled message for a disabled skill", async () => {
    mockListSkills.mockReturnValue([makeMeta("other-skill")]);

    const t = createSkillTool(["other-skill"]);
    const result = await t.execute({ name: "secret-skill" }, {} as never);

    expect(result).toContain("not enabled");
  });

  it("returns not-found with available list for non-existent skill", async () => {
    mockListSkills.mockReturnValue([makeMeta("alpha")]);
    mockLoadSkill.mockReturnValue(undefined);

    const t = createSkillTool(["alpha"]);
    const result = await t.execute({ name: "alpha" }, {} as never);

    expect(result).toContain("not found");
    expect(result).toContain("alpha");
  });

  it("prefers external skill over bundled when names match", async () => {
    const externalSkill = makeSkill("my-skill", "external-content");
    const bundledSkill = makeSkill("my-skill", "bundled-content");

    mockGetState.mockReturnValue({
      externalSkills: [{
        skill: externalSkill, source: "cove", path: "/p", folderName: "my-skill",
        skillDir: "/skills/my-skill", resourcePaths: [],
      }],
    } as ReturnType<typeof mockGetState>);
    mockListSkills.mockReturnValue([makeMeta("my-skill")]);
    mockLoadSkill.mockReturnValue(bundledSkill);

    const t = createSkillTool(["my-skill"]);
    const result = await t.execute({ name: "my-skill" }, {} as never);

    // External (cove, priority 0) beats bundled (app, priority 2)
    expect(mockFormatContent).toHaveBeenCalledWith(externalSkill);
    expect(result).toBe("formatted:my-skill");
  });
});

// ---------- skillTool (unfiltered) ----------

describe("skillTool", () => {
  it("returns formatted content when skill is found", async () => {
    const skill = makeSkill("global-skill");
    mockLoadSkill.mockReturnValue(skill);

    const result = await skillTool.execute({ name: "global-skill" }, {} as never);

    expect(result).toBe("formatted:global-skill");
  });

  it("returns not-found with available list when skill missing", async () => {
    mockLoadSkill.mockReturnValue(undefined);
    mockListSkills.mockReturnValue([makeMeta("a"), makeMeta("b")]);

    const result = await skillTool.execute({ name: "nope" }, {} as never);

    expect(result).toContain("not found");
    expect(result).toContain("a");
    expect(result).toContain("b");
  });
});

// ---------- createSkillResourceTool ----------

describe("createSkillResourceTool", () => {
  it("returns resource wrapped in skill_resource tags", async () => {
    const skill = makeSkill("doc-skill", "content", [
      { path: "resources/GUIDE.md", content: "Guide content here" },
    ]);
    mockGetAllBundled.mockReturnValue([skill]);

    const t = createSkillResourceTool(["doc-skill"]);
    const result = await t.execute(
      { skillName: "doc-skill", resourcePath: "resources/GUIDE.md" },
      {} as never,
    );

    expect(result).toContain("<skill_resource");
    expect(result).toContain('skill="doc-skill"');
    expect(result).toContain("Guide content here");
    expect(result).toContain("</skill_resource>");
  });

  it("returns not-enabled message for disabled skill", async () => {
    const skill = makeSkill("locked-skill", "content", [
      { path: "resources/X.md", content: "x" },
    ]);
    mockGetAllBundled.mockReturnValue([skill]);

    const t = createSkillResourceTool(["other"]);
    const result = await t.execute(
      { skillName: "locked-skill", resourcePath: "resources/X.md" },
      {} as never,
    );

    expect(result).toContain("not enabled");
  });

  it("returns no-resources message when skill has none", async () => {
    mockGetAllBundled.mockReturnValue([]);

    const t = createSkillResourceTool(["bare-skill"]);
    const result = await t.execute(
      { skillName: "bare-skill", resourcePath: "resources/A.md" },
      {} as never,
    );

    expect(result).toContain("no available resources");
  });

  it("returns not-found with available list for wrong resource path", async () => {
    const skill = makeSkill("doc-skill", "content", [
      { path: "resources/GUIDE.md", content: "guide" },
      { path: "resources/FAQ.md", content: "faq" },
    ]);
    mockGetAllBundled.mockReturnValue([skill]);

    const t = createSkillResourceTool(["doc-skill"]);
    const result = await t.execute(
      { skillName: "doc-skill", resourcePath: "resources/MISSING.md" },
      {} as never,
    );

    expect(result).toContain("not found");
    expect(result).toContain("resources/GUIDE.md");
    expect(result).toContain("resources/FAQ.md");
  });

  it("lists both bundled and external resources in description", () => {
    const bundledSkill = makeSkill("bundled-s", "content", [
      { path: "resources/A.md", content: "a" },
    ]);
    mockGetAllBundled.mockReturnValue([bundledSkill]);
    mockGetState.mockReturnValue({
      externalSkills: [{
        skill: makeSkill("ext-s"), source: "office", path: "/p", folderName: "ext-s",
        skillDir: "/skills/ext-s", resourcePaths: ["resources/B.md"],
      }],
    } as ReturnType<typeof mockGetState>);

    const t = createSkillResourceTool(["bundled-s", "ext-s"]);
    expect(t.description).toContain("bundled-s: resources/A.md");
    expect(t.description).toContain("ext-s: resources/B.md");
  });

  it("loads external resource via invoke", async () => {
    mockGetAllBundled.mockReturnValue([]);
    mockGetState.mockReturnValue({
      externalSkills: [{
        skill: makeSkill("ext-skill"), source: "office", path: "/p", folderName: "ext-skill",
        skillDir: "/skills/ext-skill", resourcePaths: ["resources/GUIDE.md"],
      }],
    } as ReturnType<typeof mockGetState>);
    mockInvoke.mockResolvedValue("External guide content");

    const t = createSkillResourceTool(["ext-skill"]);
    const result = await t.execute(
      { skillName: "ext-skill", resourcePath: "resources/GUIDE.md" },
      {} as never,
    );

    expect(mockInvoke).toHaveBeenCalledWith("read_skill_resource", {
      skillDir: "/skills/ext-skill",
      resourcePath: "resources/GUIDE.md",
    });
    expect(result).toContain("External guide content");
    expect(result).toContain("<skill_resource");
  });

  it("rejects disabled external skill", async () => {
    mockGetAllBundled.mockReturnValue([]);
    mockGetState.mockReturnValue({
      externalSkills: [{
        skill: makeSkill("ext-skill"), source: "office", path: "/p", folderName: "ext-skill",
        skillDir: "/skills/ext-skill", resourcePaths: ["resources/X.md"],
      }],
    } as ReturnType<typeof mockGetState>);

    const t = createSkillResourceTool(["other-skill"]);
    const result = await t.execute(
      { skillName: "ext-skill", resourcePath: "resources/X.md" },
      {} as never,
    );

    expect(result).toContain("not enabled");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
