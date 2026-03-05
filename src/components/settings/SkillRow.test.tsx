// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SectionHeading,
  BuiltInSkillRow,
  ExternalSkillRow,
} from "./SkillRow";
import type { Skill } from "@/lib/ai/skills/types";
import type { ExternalSkillWithSource } from "@/stores/skillsStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => {
      if (vars) return `${k}:${JSON.stringify(vars)}`;
      return k;
    },
  }),
}));

afterEach(cleanup);

function makeSkill(overrides?: Partial<Skill>): Skill {
  return {
    meta: { name: "test-skill", description: "A test skill" },
    content: "Test content here",
    ...overrides,
  };
}

function makeExternal(
  overrides?: Partial<ExternalSkillWithSource>,
): ExternalSkillWithSource {
  return {
    skill: makeSkill(),
    source: "cove",
    path: "/home/user/.cove/skills/test-skill/SKILL.md",
    folderName: "test-skill",
    ...overrides,
  };
}

// ─── SectionHeading ────────────────────────────────────────────────

describe("SectionHeading", () => {
  it("renders children text", () => {
    render(<SectionHeading>Built-in Skills</SectionHeading>);
    expect(screen.getByText("Built-in Skills")).toBeDefined();
  });

  it("renders optional action slot", () => {
    render(
      <SectionHeading action={<button>Add</button>}>
        Title
      </SectionHeading>,
    );
    expect(screen.getByText("Add")).toBeDefined();
  });
});

// ─── BuiltInSkillRow ───────────────────────────────────────────────

describe("BuiltInSkillRow", () => {
  it("renders skill name, emoji, description", () => {
    const skill = makeSkill({ meta: { name: "code-review", description: "Review code", emoji: "mag" } });
    render(<BuiltInSkillRow skill={skill} enabled={false} onToggle={vi.fn()} />);
    expect(screen.getByText("code-review")).toBeDefined();
    expect(screen.getByText("mag")).toBeDefined();
    expect(screen.getByText("Review code")).toBeDefined();
  });

  it("displays version and author from metadata", () => {
    const skill = makeSkill({
      meta: {
        name: "s",
        description: "d",
        metadata: { version: "2.1", author: "Alice" },
      },
    });
    render(<BuiltInSkillRow skill={skill} enabled={false} onToggle={vi.fn()} />);
    expect(screen.getByText('skills.version:{"version":"2.1"}')).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("switch reflects enabled state", () => {
    const { container } = render(
      <BuiltInSkillRow skill={makeSkill()} enabled={true} onToggle={vi.fn()} />,
    );
    const switchEl = container.querySelector("button[role='switch']");
    expect(switchEl?.getAttribute("data-state")).toBe("checked");
  });

  it("calls onToggle when switch is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <BuiltInSkillRow skill={makeSkill()} enabled={false} onToggle={onToggle} />,
    );
    const switchEl = container.querySelector("button[role='switch']");
    expect(switchEl).not.toBeNull();
    await user.click(switchEl!);
    expect(onToggle).toHaveBeenCalled();
  });

  it("expand/collapse toggles content visibility", async () => {
    const user = userEvent.setup();
    render(
      <BuiltInSkillRow skill={makeSkill()} enabled={false} onToggle={vi.fn()} />,
    );

    // Initially collapsed
    expect(screen.queryByText("Test content here")).toBeNull();
    expect(screen.getByText("skills.viewContent")).toBeDefined();

    // Expand
    await user.click(screen.getByText("skills.viewContent"));
    expect(screen.getByText("Test content here")).toBeDefined();
    expect(screen.getByText("skills.hideContent")).toBeDefined();

    // Collapse
    await user.click(screen.getByText("skills.hideContent"));
    expect(screen.queryByText("Test content here")).toBeNull();
  });

  it("truncates content at 3000 chars", async () => {
    const user = userEvent.setup();
    const longContent = "x".repeat(3500);
    const skill = makeSkill({ content: longContent });
    render(
      <BuiltInSkillRow skill={skill} enabled={false} onToggle={vi.fn()} />,
    );

    await user.click(screen.getByText("skills.viewContent"));
    const pre = screen.getByText(/^x+/);
    expect(pre.textContent).toContain("(truncated)");
  });

  it("displays resources count", () => {
    const skill = makeSkill({
      resources: [
        { path: "resources/a.md", content: "a" },
        { path: "resources/b.md", content: "b" },
      ],
    });
    render(<BuiltInSkillRow skill={skill} enabled={false} onToggle={vi.fn()} />);
    expect(screen.getByText('skills.resources:{"count":2}')).toBeDefined();
  });
});

// ─── ExternalSkillRow ──────────────────────────────────────────────

describe("ExternalSkillRow", () => {
  const defaultProps = {
    enabled: false,
    onToggle: vi.fn(),
    isCoveSkill: true,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it("renders skill name, emoji, description, source badge, path", () => {
    const ext = makeExternal({
      skill: makeSkill({
        meta: { name: "ext-skill", description: "External desc", emoji: "zap" },
      }),
      source: "claude",
      path: "/home/.claude/skills/ext-skill/SKILL.md",
    });
    render(<ExternalSkillRow ext={ext} {...defaultProps} />);
    expect(screen.getByText("ext-skill")).toBeDefined();
    expect(screen.getByText("zap")).toBeDefined();
    expect(screen.getByText("External desc")).toBeDefined();
    expect(screen.getByText("claude")).toBeDefined();
    expect(screen.getByText("/home/.claude/skills/ext-skill/SKILL.md")).toBeDefined();
  });

  it("shows edit/delete buttons when isCoveSkill=true", () => {
    render(
      <ExternalSkillRow ext={makeExternal()} {...defaultProps} isCoveSkill={true} />,
    );
    expect(screen.getByTitle("skills.editSkill")).toBeDefined();
    expect(screen.getByTitle("skills.deleteSkill")).toBeDefined();
  });

  it("hides edit/delete buttons when isCoveSkill=false", () => {
    render(
      <ExternalSkillRow ext={makeExternal()} {...defaultProps} isCoveSkill={false} />,
    );
    expect(screen.queryByTitle("skills.editSkill")).toBeNull();
    expect(screen.queryByTitle("skills.deleteSkill")).toBeNull();
  });

  it("calls onEdit when edit button clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <ExternalSkillRow ext={makeExternal()} {...defaultProps} onEdit={onEdit} />,
    );
    await user.click(screen.getByTitle("skills.editSkill"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("calls onDelete when delete button clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ExternalSkillRow ext={makeExternal()} {...defaultProps} onDelete={onDelete} />,
    );
    await user.click(screen.getByTitle("skills.deleteSkill"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("switch reflects enabled state and calls onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <ExternalSkillRow ext={makeExternal()} {...defaultProps} enabled={true} onToggle={onToggle} />,
    );
    const switchEl = container.querySelector("button[role='switch']");
    expect(switchEl?.getAttribute("data-state")).toBe("checked");
    await user.click(switchEl!);
    expect(onToggle).toHaveBeenCalled();
  });

  it("expand/collapse works same as BuiltInSkillRow", async () => {
    const user = userEvent.setup();
    render(
      <ExternalSkillRow ext={makeExternal()} {...defaultProps} />,
    );

    expect(screen.queryByText("Test content here")).toBeNull();
    await user.click(screen.getByText("skills.viewContent"));
    expect(screen.getByText("Test content here")).toBeDefined();
    await user.click(screen.getByText("skills.hideContent"));
    expect(screen.queryByText("Test content here")).toBeNull();
  });
});
