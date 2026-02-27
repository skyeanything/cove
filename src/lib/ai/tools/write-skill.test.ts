import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/stores/skillsStore", () => ({
  useSkillsStore: { getState: vi.fn() },
}));
vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: { getState: vi.fn() },
}));
vi.mock("@/stores/dataStore", () => ({
  useDataStore: { getState: vi.fn() },
}));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(),
  join: vi.fn(),
}));

import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { homeDir, join } from "@tauri-apps/api/path";
import { writeSkillTool } from "./write-skill";

const mockSkillsGetState = vi.mocked(useSkillsStore.getState);
const mockWorkspaceGetState = vi.mocked(useWorkspaceStore.getState);
const mockDataGetState = vi.mocked(useDataStore.getState);
const mockHomeDir = vi.mocked(homeDir);
const mockJoin = vi.mocked(join);

const mockSaveSkill = vi.fn();
const mockAdd = vi.fn();
const mockSelect = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSkillsGetState.mockReturnValue({ saveSkill: mockSaveSkill } as ReturnType<
    typeof mockSkillsGetState
  >);
  mockWorkspaceGetState.mockReturnValue({
    add: mockAdd,
    select: mockSelect,
  } as ReturnType<typeof mockWorkspaceGetState>);
  mockDataGetState.mockReturnValue({
    activeConversationId: "conv-123",
  } as ReturnType<typeof mockDataGetState>);
  mockHomeDir.mockResolvedValue("/Users/test");
  mockJoin.mockResolvedValue("/Users/test/.cove/skills/my-skill");
  mockAdd.mockResolvedValue({ id: "ws-1" });
  mockSaveSkill.mockResolvedValue(undefined);
  mockSelect.mockResolvedValue(undefined);
});

describe("writeSkillTool", () => {
  const input = { name: "my-skill", content: "---\nname: my-skill\n---\nBody" };

  it("saves the skill and switches workspace on success", async () => {
    const result = await writeSkillTool.execute(input, {} as never);

    expect(mockSaveSkill).toHaveBeenCalledWith("my-skill", input.content, null);
    expect(mockHomeDir).toHaveBeenCalled();
    expect(mockJoin).toHaveBeenCalledWith("/Users/test", ".cove", "skills", "my-skill");
    expect(mockAdd).toHaveBeenCalledWith("/Users/test/.cove/skills/my-skill");
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "conv-123");
    expect(result).toContain("saved");
    expect(result).toContain("Workspace switched");
  });

  it("still reports success when workspace switch fails", async () => {
    mockAdd.mockRejectedValue(new Error("workspace error"));

    const result = await writeSkillTool.execute(input, {} as never);

    expect(mockSaveSkill).toHaveBeenCalledWith("my-skill", input.content, null);
    expect(result).toContain("saved");
    expect(result).toContain("workspace switch failed");
  });
});
