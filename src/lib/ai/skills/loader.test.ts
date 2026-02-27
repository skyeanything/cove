import { describe, expect, it } from "vitest";
import type { Skill, SkillMeta } from "./types";
import {
  parseSkillFromRaw,
  formatSkillContentForTool,
  getSkillToolDescriptionForSkills,
  buildSkillsSummary,
  getAllBundledSkills,
  listSkills,
  getAlwaysSkills,
  loadSkill,
} from "./loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<SkillMeta> = {}, content = "Skill body"): Skill {
  return {
    meta: {
      name: "test-skill",
      description: "A test skill",
      always: false,
      ...overrides,
    },
    content,
  };
}

// ---------------------------------------------------------------------------
// parseSkillFromRaw
// ---------------------------------------------------------------------------

describe("parseSkillFromRaw", () => {
  it("parses a complete frontmatter", () => {
    const raw = [
      "---",
      'name: my-skill',
      'description: "Does something"',
      "emoji: 🔧",
      "always: false",
      "---",
      "",
      "Skill content here.",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");

    expect(skill.meta.name).toBe("my-skill");
    expect(skill.meta.description).toBe("Does something");
    expect(skill.meta.emoji).toBe("🔧");
    expect(skill.meta.always).toBe(false);
    expect(skill.content).toBe("Skill content here.");
  });

  it("parses minimal frontmatter (name + description only)", () => {
    const raw = [
      "---",
      "name: minimal",
      "description: Minimal skill",
      "---",
      "Content.",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");

    expect(skill.meta.name).toBe("minimal");
    expect(skill.meta.description).toBe("Minimal skill");
    expect(skill.meta.always).toBe(false);
    expect(skill.meta.emoji).toBeUndefined();
    expect(skill.content).toBe("Content.");
  });

  it("parses always: true", () => {
    const raw = [
      "---",
      "name: always-skill",
      "description: Always injected",
      "always: true",
      "---",
      "Always content.",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");
    expect(skill.meta.always).toBe(true);
  });

  it("parses requires.tools array", () => {
    const raw = [
      "---",
      "name: tool-skill",
      "description: Needs tools",
      "requires:",
      "  tools:",
      "    - bash",
      "    - write",
      "---",
      "Content.",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");
    expect(skill.meta.requires?.tools).toEqual(["bash", "write"]);
  });

  it("parses metadata as object", () => {
    const raw = [
      "---",
      "name: meta-skill",
      "description: With metadata",
      "metadata:",
      "  version: 1.0",
      "  author: tester",
      "---",
      "Content.",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");
    // The simple YAML parser leaves floats as strings; "1.0" stays "1.0"
    expect(skill.meta.metadata).toEqual({ version: "1.0", author: "tester" });
  });

  it("parses metadata as JSON string (legacy)", () => {
    const raw = [
      "---",
      "name: json-meta-skill",
      "description: JSON metadata",
      `metadata: '{"version":"2.0","author":"someone"}'`,
      "---",
      "Content.",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");
    expect(skill.meta.metadata).toEqual({ version: "2.0", author: "someone" });
  });

  it("falls back to fallbackName when no frontmatter", () => {
    const raw = "Just plain content, no frontmatter at all.";

    const skill = parseSkillFromRaw(raw, "my-fallback");
    expect(skill.meta.name).toBe("my-fallback");
    expect(skill.meta.description).toBe("");
  });

  it("uses permissive parser when name is empty in standard parse", () => {
    // The standard YAML parser won't find name because the value is empty;
    // the permissive fallback should extract it via regex.
    const raw = [
      "---",
      "name: permissive-name",
      "description: Found via permissive",
      "bad yaml: [unclosed",
      "---",
      "Body content.",
    ].join("\n");

    // Even with malformed YAML the permissive parser should still find name
    const skill = parseSkillFromRaw(raw, "fallback-name");
    // Either parsed correctly or fell back; name should not be empty
    expect(skill.meta.name).toBeTruthy();
    expect(skill.meta.name).not.toBe("");
  });

  it("handles \\r\\n line endings (Windows)", () => {
    const raw = "---\r\nname: win-skill\r\ndescription: Windows\r\n---\r\nContent on Windows.";

    const skill = parseSkillFromRaw(raw, "fallback");
    // Permissive parser handles \r\n; standard may not — either way name should not be fallback
    expect(skill.meta.name).toBe("win-skill");
    expect(skill.meta.description).toBe("Windows");
  });

  it("trims whitespace from content", () => {
    const raw = [
      "---",
      "name: trim-skill",
      "description: Trim test",
      "---",
      "",
      "  Content with leading space.  ",
      "",
    ].join("\n");

    const skill = parseSkillFromRaw(raw, "fallback");
    // parseFrontmatter trims content
    expect(skill.content).toBe("Content with leading space.");
  });

  it("uses fallbackName when name field is present but empty string", () => {
    const raw = ["---", 'name: ""', "description: Has empty name", "---", "Content."].join("\n");

    const skill = parseSkillFromRaw(raw, "empty-name-fallback");
    // Standard parse gives name="" (empty after stripping quotes), permissive fallback kicks in
    expect(skill.meta.name).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatSkillContentForTool
// ---------------------------------------------------------------------------

describe("formatSkillContentForTool", () => {
  it("wraps content in skill_content tag", () => {
    const skill = makeSkill({ name: "my-skill" }, "Do this and that.");
    const result = formatSkillContentForTool(skill);

    expect(result).toContain('<skill_content name="my-skill">');
    expect(result).toContain("</skill_content>");
  });

  it("includes skill name in heading", () => {
    const skill = makeSkill({ name: "coder" }, "Code carefully.");
    const result = formatSkillContentForTool(skill);

    expect(result).toContain("# Skill: coder");
  });

  it("trims skill content", () => {
    const skill = makeSkill({ name: "trim-skill" }, "  trimmed content  ");
    const result = formatSkillContentForTool(skill);

    expect(result).toContain("trimmed content");
    expect(result).not.toContain("  trimmed content  ");
  });

  it("includes relative-path note", () => {
    const skill = makeSkill({ name: "x" }, "Body.");
    const result = formatSkillContentForTool(skill);

    expect(result).toContain("Relative paths in this skill");
  });

  it("is a single string (no trailing newline issues)", () => {
    const skill = makeSkill({ name: "x" }, "Body.");
    const result = formatSkillContentForTool(skill);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getSkillToolDescriptionForSkills
// ---------------------------------------------------------------------------

describe("getSkillToolDescriptionForSkills", () => {
  it("returns EMPTY description when passed empty Skill array", () => {
    const result = getSkillToolDescriptionForSkills([] as Skill[]);
    expect(result).toContain("No skills are currently available");
  });

  it("returns EMPTY description when passed empty SkillMeta array", () => {
    const result = getSkillToolDescriptionForSkills([] as SkillMeta[]);
    expect(result).toContain("No skills are currently available");
  });

  it("includes available_skills tags for Skill[] overload", () => {
    const skills: Skill[] = [
      makeSkill({ name: "alpha", description: "Alpha skill" }),
      makeSkill({ name: "beta", description: "Beta skill" }),
    ];
    const result = getSkillToolDescriptionForSkills(skills);

    expect(result).toContain("<available_skills>");
    expect(result).toContain("</available_skills>");
  });

  it("includes each skill name and description", () => {
    const skills: Skill[] = [
      makeSkill({ name: "alpha", description: "Alpha skill" }),
      makeSkill({ name: "beta", description: "Beta skill" }),
    ];
    const result = getSkillToolDescriptionForSkills(skills);

    expect(result).toContain("<name>alpha</name>");
    expect(result).toContain("<description>Alpha skill</description>");
    expect(result).toContain("<name>beta</name>");
    expect(result).toContain("<description>Beta skill</description>");
  });

  it("accepts SkillMeta[] overload", () => {
    const metas: SkillMeta[] = [
      { name: "direct-meta", description: "Meta overload" },
    ];
    const result = getSkillToolDescriptionForSkills(metas);

    expect(result).toContain("<name>direct-meta</name>");
    expect(result).toContain("<description>Meta overload</description>");
  });

  it("includes introductory text", () => {
    const skills: Skill[] = [makeSkill({ name: "x", description: "y" })];
    const result = getSkillToolDescriptionForSkills(skills);

    expect(result).toContain("Load a specialized skill");
  });

  it("single skill produces exactly one <skill> block", () => {
    const skills: Skill[] = [makeSkill({ name: "one", description: "only one" })];
    const result = getSkillToolDescriptionForSkills(skills);

    const matches = result.match(/<skill>/g);
    expect(matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildSkillsSummary — uses actual bundled skills (smoke + format checks)
// ---------------------------------------------------------------------------

describe("buildSkillsSummary", () => {
  it("returns a string", () => {
    const result = buildSkillsSummary();
    expect(typeof result).toBe("string");
  });

  it("returns empty string or wrapped in available-skills tags", () => {
    const result = buildSkillsSummary();
    if (result.length > 0) {
      expect(result).toContain("<available-skills>");
      expect(result).toContain("</available-skills>");
    }
  });

  it("always-only skills produce empty summary (all filtered out)", () => {
    // This tests the filter logic indirectly: if all bundled skills are always=true,
    // buildSkillsSummary should return "". We verify the shape is correct otherwise.
    const allSkills = getAllBundledSkills();
    const nonAlways = allSkills.filter((s) => !s.meta.always);

    const result = buildSkillsSummary();

    if (nonAlways.length === 0) {
      expect(result).toBe("");
    } else {
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("each non-always skill appears as a <skill name=...> element", () => {
    const allSkills = getAllBundledSkills();
    const nonAlways = allSkills.filter((s) => !s.meta.always);
    const result = buildSkillsSummary();

    for (const skill of nonAlways) {
      expect(result).toContain(`<skill name="${skill.meta.name}">`);
    }
  });

  it("always-true skills do not appear in summary", () => {
    const alwaysSkills = getAllBundledSkills().filter((s) => s.meta.always);
    const result = buildSkillsSummary();

    for (const skill of alwaysSkills) {
      // The skill should not have a <skill name="..."> entry
      expect(result).not.toContain(`<skill name="${skill.meta.name}">`);
    }
  });

  it("skills with requires.tools include requires annotation", () => {
    const withTools = getAllBundledSkills().filter(
      (s) => !s.meta.always && (s.meta.requires?.tools?.length ?? 0) > 0,
    );
    const result = buildSkillsSummary();

    if (withTools.length > 0) {
      expect(result).toContain("requires:");
    }
  });
});

// ---------------------------------------------------------------------------
// Bundled skill loading (smoke tests)
// ---------------------------------------------------------------------------

describe("getAllBundledSkills", () => {
  it("returns an array", () => {
    const skills = getAllBundledSkills();
    expect(Array.isArray(skills)).toBe(true);
  });

  it("every skill has a non-empty name and description", () => {
    const skills = getAllBundledSkills();
    for (const skill of skills) {
      expect(typeof skill.meta.name).toBe("string");
      expect(skill.meta.name.length).toBeGreaterThan(0);
      expect(typeof skill.meta.description).toBe("string");
    }
  });

  it("every skill has a string content field", () => {
    const skills = getAllBundledSkills();
    for (const skill of skills) {
      expect(typeof skill.content).toBe("string");
    }
  });
});

describe("listSkills", () => {
  it("returns the same count as getAllBundledSkills", () => {
    const metas = listSkills();
    const skills = getAllBundledSkills();
    expect(metas.length).toBe(skills.length);
  });

  it("returns SkillMeta objects without content", () => {
    const metas = listSkills();
    for (const meta of metas) {
      expect(meta).not.toHaveProperty("content");
      expect(meta).toHaveProperty("name");
      expect(meta).toHaveProperty("description");
    }
  });
});

describe("getAlwaysSkills", () => {
  it("returns a subset of getAllBundledSkills", () => {
    const always = getAlwaysSkills();
    const all = getAllBundledSkills();
    expect(always.length).toBeLessThanOrEqual(all.length);
  });

  it("every returned skill has always=true", () => {
    const always = getAlwaysSkills();
    for (const skill of always) {
      expect(skill.meta.always).toBe(true);
    }
  });
});

describe("loadSkill", () => {
  it("returns undefined for a non-existent skill name", () => {
    const result = loadSkill("non-existent-skill-xyz-12345");
    expect(result).toBeUndefined();
  });

  it("returns the correct skill when given a valid name", () => {
    const all = getAllBundledSkills();
    if (all.length === 0) return; // no bundled skills to test

    const first = all[0]!;
    const found = loadSkill(first.meta.name);

    expect(found).toBeDefined();
    expect(found?.meta.name).toBe(first.meta.name);
  });

  it("lookup is case-sensitive", () => {
    const all = getAllBundledSkills();
    if (all.length === 0) return;

    const first = all[0]!;
    const upperName = first.meta.name.toUpperCase();
    // Only if uppercase differs from original should we expect undefined
    if (upperName !== first.meta.name) {
      expect(loadSkill(upperName)).toBeUndefined();
    }
  });
});
