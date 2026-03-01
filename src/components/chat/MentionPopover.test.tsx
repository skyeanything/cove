// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MentionPopover, buildMentionItems } from "./MentionPopover";
import type { ToolInfo } from "@/lib/ai/tools/tool-meta";
import type { SkillMeta } from "@/lib/ai/skills/types";
import type { MentionFileEntry } from "@/hooks/useMentionFiles";

const TOOLS: ToolInfo[] = [
  { id: "bash", name: "Shell Command", description: "Run shell", category: "core", userVisible: true },
  { id: "read", name: "Read File", description: "Read file", category: "core", userVisible: true },
];

const SKILLS: SkillMeta[] = [
  { name: "officellm", description: "Office integration", emoji: "📦" },
  { name: "skill-creator", description: "Create skills", emoji: "✨" },
];

const FILES: MentionFileEntry[] = [
  { name: "package.json", path: "package.json", isDir: false },
  { name: "src", path: "src", isDir: true },
];

afterEach(cleanup);

describe("buildMentionItems", () => {
  it("builds flat list from tools, skills, and files", () => {
    const items = buildMentionItems(TOOLS, SKILLS, FILES);
    expect(items).toHaveLength(6);
    expect(items[0]).toEqual({ type: "tool", id: "bash", label: "bash", description: "Shell Command" });
    expect(items[2]).toEqual({ type: "skill", id: "officellm", label: "officellm", description: "Office integration", emoji: "📦" });
    expect(items[4]).toEqual({ type: "file", id: "package.json", label: "package.json", isDir: false });
  });

  it("returns empty array when all inputs are empty", () => {
    expect(buildMentionItems([], [], [])).toEqual([]);
  });
});

describe("MentionPopover", () => {
  const defaultProps = {
    open: true,
    query: "",
    tools: TOOLS,
    skills: SKILLS,
    files: FILES,
    activeIndex: 0,
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders nothing when open is false", () => {
    const { container } = render(<MentionPopover {...defaultProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all lists are empty", () => {
    const { container } = render(
      <MentionPopover {...defaultProps} tools={[]} skills={[]} files={[]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders section headers", () => {
    render(<MentionPopover {...defaultProps} />);
    expect(screen.getByText("TOOLS")).toBeTruthy();
    expect(screen.getByText("SKILLS")).toBeTruthy();
    expect(screen.getByText("FILES")).toBeTruthy();
  });

  it("renders tool items", () => {
    render(<MentionPopover {...defaultProps} />);
    expect(screen.getByText("bash")).toBeTruthy();
    expect(screen.getByText("Shell Command")).toBeTruthy();
  });

  it("renders skill items with emoji", () => {
    render(<MentionPopover {...defaultProps} />);
    expect(screen.getByText("📦")).toBeTruthy();
    expect(screen.getByText("officellm")).toBeTruthy();
  });

  it("renders file items", () => {
    render(<MentionPopover {...defaultProps} />);
    expect(screen.getByText("package.json")).toBeTruthy();
    expect(screen.getByText("src")).toBeTruthy();
  });

  it("highlights active index item", () => {
    render(<MentionPopover {...defaultProps} activeIndex={1} />);
    const items = screen.getAllByRole("button");
    // activeIndex=1 should be the second item ("read")
    expect(items[1].className).toContain("bg-background-tertiary");
  });

  it("calls onSelect on mouseDown", () => {
    const onSelect = vi.fn();
    render(<MentionPopover {...defaultProps} onSelect={onSelect} />);
    const bashButton = screen.getByText("bash").closest("button")!;
    bashButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith("tool", "bash");
  });

  it("omits SKILLS section when skills is empty", () => {
    render(<MentionPopover {...defaultProps} skills={[]} />);
    expect(screen.queryByText("SKILLS")).toBeNull();
    expect(screen.getByText("TOOLS")).toBeTruthy();
  });

  it("omits TOOLS section when tools is empty", () => {
    render(<MentionPopover {...defaultProps} tools={[]} />);
    expect(screen.queryByText("TOOLS")).toBeNull();
    expect(screen.getByText("SKILLS")).toBeTruthy();
  });

  it("omits FILES section when files is empty", () => {
    render(<MentionPopover {...defaultProps} files={[]} />);
    expect(screen.queryByText("FILES")).toBeNull();
    expect(screen.getByText("TOOLS")).toBeTruthy();
  });
});
