// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillEditDialog, DeleteSkillDialog } from "./SkillEditDialog";
import type { SkillFields } from "./skill-utils";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => {
      if (vars) return `${k}:${JSON.stringify(vars)}`;
      return k;
    },
  }),
}));

afterEach(cleanup);

function makeFields(overrides?: Partial<SkillFields>): SkillFields {
  return {
    name: "test-skill",
    emoji: "zap",
    description: "A test skill",
    instructions: "Do something",
    extraFrontmatter: [],
    ...overrides,
  };
}

// ─── SkillEditDialog ───────────────────────────────────────────────

describe("SkillEditDialog", () => {
  let onOpenChange: Mock<(open: boolean) => void>;
  let onSave: Mock<(fields: SkillFields) => Promise<void>>;

  beforeEach(() => {
    onOpenChange = vi.fn();
    onSave = vi.fn<(fields: SkillFields) => Promise<void>>().mockResolvedValue(undefined);
  });

  function renderDialog(fields?: SkillFields, open = true) {
    return render(
      <SkillEditDialog
        open={open}
        onOpenChange={onOpenChange}
        fields={fields ?? makeFields()}
        onSave={onSave}
      />,
    );
  }

  it("renders form fields when open", () => {
    renderDialog();
    expect(screen.getByDisplayValue("test-skill")).toBeDefined();
    expect(screen.getByDisplayValue("zap")).toBeDefined();
    expect(screen.getByDisplayValue("A test skill")).toBeDefined();
    expect(screen.getByDisplayValue("Do something")).toBeDefined();
  });

  it("name input is disabled", () => {
    renderDialog();
    const nameInput = screen.getByDisplayValue("test-skill");
    expect(nameInput).toHaveProperty("disabled", true);
  });

  it("syncs fields from props when dialog opens", async () => {
    const oc = vi.fn<(open: boolean) => void>();
    const sv = vi.fn<(f: SkillFields) => Promise<void>>().mockResolvedValue(undefined);
    const { rerender } = render(
      <SkillEditDialog
        open={false}
        onOpenChange={oc}
        fields={makeFields({ description: "old" })}
        onSave={sv}
      />,
    );
    rerender(
      <SkillEditDialog
        open={true}
        onOpenChange={oc}
        fields={makeFields({ description: "new desc" })}
        onSave={sv}
      />,
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue("new desc")).toBeDefined();
    });
  });

  it("shows validation error for empty description", async () => {
    const user = userEvent.setup();
    renderDialog(makeFields({ description: "" }));

    await user.click(screen.getByText("skills.save"));

    expect(screen.getByText("skills.descriptionPlaceholder")).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with correct fields and closes on success", async () => {
    const user = userEvent.setup();
    renderDialog(makeFields({ extraFrontmatter: ["always: true"] }));

    await user.click(screen.getByText("skills.save"));

    expect(onSave).toHaveBeenCalledWith({
      name: "test-skill",
      emoji: "zap",
      description: "A test skill",
      instructions: "Do something",
      extraFrontmatter: ["always: true"],
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error and does not close on save failure", async () => {
    onSave.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("skills.save"));

    await waitFor(() => {
      expect(screen.getByText("Error: Network error")).toBeDefined();
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("saves edited emoji, description, and instructions", async () => {
    const user = userEvent.setup();
    renderDialog(makeFields({ emoji: "", description: "old desc", instructions: "old inst" }));

    const emojiInput = screen.getByPlaceholderText("skills.emojiPlaceholder");
    await user.type(emojiInput, "star");

    const descArea = screen.getByDisplayValue("old desc");
    await user.clear(descArea);
    await user.type(descArea, "new desc");

    const instArea = screen.getByDisplayValue("old inst");
    await user.clear(instArea);
    await user.type(instArea, "new inst");

    await user.click(screen.getByText("skills.save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        emoji: "star",
        description: "new desc",
        instructions: "new inst",
      }),
    );
  });

  it("cancel button calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByText("skills.cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ─── DeleteSkillDialog ─────────────────────────────────────────────

describe("DeleteSkillDialog", () => {
  let onOpenChange: Mock<(open: boolean) => void>;
  let onConfirm: Mock<() => Promise<void>>;

  beforeEach(() => {
    onOpenChange = vi.fn();
    onConfirm = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  });

  function renderDelete(name = "my-skill", open = true) {
    return render(
      <DeleteSkillDialog
        open={open}
        onOpenChange={onOpenChange}
        name={name}
        onConfirm={onConfirm}
      />,
    );
  }

  it("renders skill name in description", () => {
    renderDelete("cool-skill");
    expect(
      screen.getByText('skills.deleteConfirmDesc:{"name":"cool-skill"}'),
    ).toBeDefined();
  });

  it("confirm calls onConfirm and closes on success", async () => {
    const user = userEvent.setup();
    renderDelete();

    await user.click(screen.getByText("skills.delete"));

    expect(onConfirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error on confirm failure", async () => {
    onConfirm.mockRejectedValue(new Error("Delete failed"));
    const user = userEvent.setup();
    renderDelete();

    await user.click(screen.getByText("skills.delete"));

    await waitFor(() => {
      expect(screen.getByText("Error: Delete failed")).toBeDefined();
    });
  });

  it("cancel button is rendered", () => {
    renderDelete();
    expect(screen.getByText("skills.cancel")).toBeDefined();
  });
});
