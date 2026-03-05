// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  parseSkillFields,
  buildSkillMd,
  yamlInlineString,
  type SkillFields,
} from "./skill-utils";

// ─── yamlInlineString ──────────────────────────────────────────────

describe("yamlInlineString", () => {
  it("returns bare string when no special chars", () => {
    expect(yamlInlineString("hello world")).toBe("hello world");
  });

  it("quotes empty string", () => {
    expect(yamlInlineString("")).toBe('""');
  });

  it("quotes string with colon", () => {
    expect(yamlInlineString("key: value")).toBe('"key: value"');
  });

  it("quotes string with hash", () => {
    expect(yamlInlineString("has # comment")).toBe('"has # comment"');
  });

  it("quotes string with bracket", () => {
    expect(yamlInlineString("[array]")).toBe('"[array]"');
  });

  it("quotes and escapes double-quote inside", () => {
    expect(yamlInlineString('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("quotes and escapes newline", () => {
    expect(yamlInlineString("line1\nline2")).toBe('"line1\\nline2"');
  });

  it("quotes string with leading space", () => {
    expect(yamlInlineString(" leading")).toBe('" leading"');
  });

  it("strips carriage return", () => {
    expect(yamlInlineString("a\r\nb")).toBe('"a\\nb"');
  });

  it("escapes backslash before other escapes", () => {
    expect(yamlInlineString("a\\b\n")).toBe('"a\\\\b\\n"');
  });
});

// ─── parseSkillFields ──────────────────────────────────────────────

describe("parseSkillFields", () => {
  it("parses standard frontmatter with body", () => {
    const md = `---
name: my-skill
emoji: fire
description: A cool skill
---

Do something useful.`;
    const f = parseSkillFields(md);
    expect(f.name).toBe("my-skill");
    expect(f.emoji).toBe("fire");
    expect(f.description).toBe("A cool skill");
    expect(f.instructions).toBe("Do something useful.");
    expect(f.extraFrontmatter).toEqual([]);
  });

  it("unquotes double-quoted values with escapes", () => {
    const md = `---
name: test
description: "line1\\nline2 \\"quoted\\" back\\\\"
---
body`;
    const f = parseSkillFields(md);
    expect(f.description).toBe('line1\nline2 "quoted" back\\');
  });

  it("unquotes single-quoted values", () => {
    const md = `---
name: test
description: 'it''s fine'
---
body`;
    const f = parseSkillFields(md);
    expect(f.description).toBe("it's fine");
  });

  it("handles bare (unquoted) values", () => {
    const md = `---
name: bare-skill
description: just plain text
---
body`;
    const f = parseSkillFields(md);
    expect(f.description).toBe("just plain text");
  });

  it("preserves unknown frontmatter fields in extraFrontmatter", () => {
    const md = `---
name: test
always: true
description: desc
requires:
  tools:
    - bash
metadata:
  version: "1.0"
---
body`;
    const f = parseSkillFields(md);
    expect(f.extraFrontmatter).toContain("always: true");
    expect(f.extraFrontmatter.some((l) => l.includes("requires"))).toBe(true);
  });

  it("returns raw content when no frontmatter", () => {
    const raw = "Just some instructions without frontmatter.";
    const f = parseSkillFields(raw);
    expect(f.name).toBe("");
    expect(f.emoji).toBe("");
    expect(f.description).toBe("");
    expect(f.instructions).toBe(raw);
    expect(f.extraFrontmatter).toEqual([]);
  });

  it("handles empty body", () => {
    const md = `---
name: empty
description: nothing
---
`;
    const f = parseSkillFields(md);
    expect(f.instructions).toBe("");
  });

  it("handles CRLF line endings", () => {
    const md = "---\r\nname: crlf\r\ndescription: works\r\n---\r\nbody text";
    const f = parseSkillFields(md);
    expect(f.name).toBe("crlf");
    expect(f.description).toBe("works");
    expect(f.instructions).toBe("body text");
  });

  it("returns empty emoji when not present", () => {
    const md = `---
name: no-emoji
description: desc
---
body`;
    const f = parseSkillFields(md);
    expect(f.emoji).toBe("");
  });
});

// ─── buildSkillMd ──────────────────────────────────────────────────

describe("buildSkillMd", () => {
  it("builds standard skill markdown", () => {
    const result = buildSkillMd({
      name: "test",
      emoji: "fire",
      description: "A skill",
      instructions: "Do things",
      extraFrontmatter: [],
    });
    expect(result).toBe(`---
name: test
emoji: fire
description: A skill
---

Do things`);
  });

  it("omits emoji when empty", () => {
    const result = buildSkillMd({
      name: "test",
      emoji: "",
      description: "desc",
      instructions: "body",
      extraFrontmatter: [],
    });
    expect(result).not.toContain("emoji");
  });

  it("omits emoji when whitespace-only", () => {
    const result = buildSkillMd({
      name: "test",
      emoji: "  ",
      description: "desc",
      instructions: "body",
      extraFrontmatter: [],
    });
    expect(result).not.toContain("emoji");
  });

  it("preserves extra frontmatter lines", () => {
    const result = buildSkillMd({
      name: "test",
      emoji: "",
      description: "desc",
      instructions: "body",
      extraFrontmatter: ["always: true", "requires:", "  tools:", "    - bash"],
    });
    expect(result).toContain("always: true");
    expect(result).toContain("    - bash");
  });

  it("quotes description that needs quoting", () => {
    const result = buildSkillMd({
      name: "test",
      emoji: "",
      description: "has: colon",
      instructions: "body",
      extraFrontmatter: [],
    });
    expect(result).toContain('description: "has: colon"');
  });
});

// ─── Round-trip ────────────────────────────────────────────────────

describe("round-trip: parseSkillFields(buildSkillMd(fields))", () => {
  it("preserves simple fields", () => {
    const original: SkillFields = {
      name: "round-trip",
      emoji: "zap",
      description: "A round-trip test",
      instructions: "Step 1: do this\nStep 2: do that",
      extraFrontmatter: [],
    };
    const rebuilt = parseSkillFields(buildSkillMd(original));
    expect(rebuilt.name).toBe(original.name);
    expect(rebuilt.emoji).toBe(original.emoji);
    expect(rebuilt.description).toBe(original.description);
    expect(rebuilt.instructions).toBe(original.instructions);
  });

  it("preserves description with special characters", () => {
    const original: SkillFields = {
      name: "special",
      emoji: "",
      description: 'has "quotes" and: colons',
      instructions: "body",
      extraFrontmatter: [],
    };
    const rebuilt = parseSkillFields(buildSkillMd(original));
    expect(rebuilt.description).toBe(original.description);
  });

  it("preserves extra frontmatter lines", () => {
    const original: SkillFields = {
      name: "extra",
      emoji: "",
      description: "desc",
      instructions: "body",
      extraFrontmatter: ["always: true", "metadata:", '  version: "2.0"'],
    };
    const rebuilt = parseSkillFields(buildSkillMd(original));
    expect(rebuilt.extraFrontmatter).toEqual(original.extraFrontmatter);
  });
});
