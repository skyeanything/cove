import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/ai/skills/loader", () => ({
  parseSkillFromRaw: vi.fn(),
  listSkills: vi.fn().mockReturnValue([]),
}));

// --- imports after mocks ---

import { invoke } from "@tauri-apps/api/core";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { parseSkillFromRaw, listSkills } from "@/lib/ai/skills/loader";
import {
  useSkillsStore,
  getSkillDirPaths,
  setSkillDirPaths,
  getEnabledSkillNames,
  setEnabledSkillNames,
} from "./skillsStore";
import { createStoreReset } from "@/test-utils";
import type { Skill } from "@/lib/ai/skills/types";

// --- setup ---

const resetStore = createStoreReset(useSkillsStore);
beforeEach(() => vi.clearAllMocks());
afterEach(() => resetStore());

// --- helpers ---

function makeSkill(name: string): Skill {
  return {
    meta: { name, description: `${name} desc`, always: false },
    content: `${name} content`,
  };
}

// --- tests ---

describe("getSkillDirPaths", () => {
  it("returns [] when settingsRepo returns null", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    expect(await getSkillDirPaths()).toEqual([]);
  });

  it("parses valid JSON array of strings", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify(["/a", "/b"]));
    expect(await getSkillDirPaths()).toEqual(["/a", "/b"]);
  });

  it("filters out non-string values", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify(["/a", 42, null, "/b"]));
    expect(await getSkillDirPaths()).toEqual(["/a", "/b"]);
  });

  it("returns [] on invalid JSON", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue("{broken");
    expect(await getSkillDirPaths()).toEqual([]);
  });

  it("returns [] when parsed value is not an array", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify({ a: 1 }));
    expect(await getSkillDirPaths()).toEqual([]);
  });
});

describe("setSkillDirPaths", () => {
  it("persists JSON-stringified array to settingsRepo", async () => {
    await setSkillDirPaths(["/x", "/y"]);
    expect(settingsRepo.set).toHaveBeenCalledWith("skillDirPaths", JSON.stringify(["/x", "/y"]));
  });
});

describe("getEnabledSkillNames", () => {
  it("returns parsed names when settingsRepo has valid data", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify(["skill-a", "skill-b"]));
    expect(await getEnabledSkillNames()).toEqual(["skill-a", "skill-b"]);
  });

  it("seeds defaults from listSkills() when settingsRepo is empty", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(listSkills).mockReturnValue([
      { name: "builtin-1", description: "", always: false },
      { name: "builtin-2", description: "", always: false },
    ]);
    const result = await getEnabledSkillNames();
    expect(result).toEqual(["builtin-1", "builtin-2"]);
    expect(settingsRepo.set).toHaveBeenCalledWith(
      "enabledSkillNames",
      JSON.stringify(["builtin-1", "builtin-2"]),
    );
  });

  it("handles invalid JSON gracefully (seeds defaults)", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue("not-json");
    vi.mocked(listSkills).mockReturnValue([{ name: "default", description: "", always: false }]);
    const result = await getEnabledSkillNames();
    expect(result).toEqual(["default"]);
  });

  it("filters out non-string values from stored array", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify(["ok", 123, null]));
    expect(await getEnabledSkillNames()).toEqual(["ok"]);
  });
});

describe("setEnabledSkillNames", () => {
  it("persists JSON-stringified names to settingsRepo", async () => {
    await setEnabledSkillNames(["a", "b"]);
    expect(settingsRepo.set).toHaveBeenCalledWith("enabledSkillNames", JSON.stringify(["a", "b"]));
  });
});

describe("skillsStore — loadExternalSkills", () => {
  it("calls invoke with workspacePath and customRoots", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify(["/custom"]));
    vi.mocked(invoke).mockResolvedValue([]);

    await useSkillsStore.getState().loadExternalSkills("/workspace");

    expect(invoke).toHaveBeenCalledWith("discover_external_skills", {
      workspacePath: "/workspace",
      customRoots: ["/custom"],
    });
  });

  it("parses entries via parseSkillFromRaw and sets externalSkills", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    const skill = makeSkill("test-skill");
    vi.mocked(parseSkillFromRaw).mockReturnValue(skill);
    vi.mocked(invoke).mockResolvedValue([
      { source: "claude", name: "test-folder", path: "/path/to/skill", content: "raw md" },
    ]);

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.externalSkills).toHaveLength(1);
    expect(state.externalSkills[0].skill).toBe(skill);
    expect(state.externalSkills[0].source).toBe("claude");
    expect(state.externalSkills[0].path).toBe("/path/to/skill");
    expect(state.externalSkills[0].folderName).toBe("test-folder");
    expect(parseSkillFromRaw).toHaveBeenCalledWith("raw md", "test-folder");
  });

  it("sets loaded=true, scanError=null on success", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(invoke).mockResolvedValue([]);

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.scanError).toBeNull();
  });

  it("sets scanError on invoke failure", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(invoke).mockRejectedValue(new Error("tauri error"));

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.scanError).toBe("Error: tauri error");
    expect(state.externalSkills).toEqual([]);
  });

  it("skips if already loading (guard)", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(invoke).mockResolvedValue([]);

    // Force loading=true
    useSkillsStore.setState({ loading: true });
    await useSkillsStore.getState().loadExternalSkills();

    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes null customRoots when getSkillDirPaths returns []", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(invoke).mockResolvedValue([]);

    await useSkillsStore.getState().loadExternalSkills("/ws");

    expect(invoke).toHaveBeenCalledWith("discover_external_skills", {
      workspacePath: "/ws",
      customRoots: null,
    });
  });
});

describe("skillsStore — loadEnabledSkillNames", () => {
  it("populates enabledSkillNames from getEnabledSkillNames()", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(JSON.stringify(["s1", "s2"]));

    await useSkillsStore.getState().loadEnabledSkillNames();

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["s1", "s2"]);
  });
});

describe("skillsStore — toggleSkillEnabled", () => {
  it("adds skill name when not present", async () => {
    useSkillsStore.setState({ enabledSkillNames: ["existing"] });

    await useSkillsStore.getState().toggleSkillEnabled("new-skill");

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["existing", "new-skill"]);
    expect(settingsRepo.set).toHaveBeenCalledWith(
      "enabledSkillNames",
      JSON.stringify(["existing", "new-skill"]),
    );
  });

  it("removes skill name when already present", async () => {
    useSkillsStore.setState({ enabledSkillNames: ["a", "b", "c"] });

    await useSkillsStore.getState().toggleSkillEnabled("b");

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["a", "c"]);
    expect(settingsRepo.set).toHaveBeenCalledWith("enabledSkillNames", JSON.stringify(["a", "c"]));
  });
});

describe("skillsStore — saveSkill", () => {
  beforeEach(() => {
    // Prevent loadExternalSkills from actually running
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(invoke).mockResolvedValue([]);
  });

  it("invokes write_skill with folderName and content", async () => {
    await useSkillsStore.getState().saveSkill("my-folder", "# content");

    expect(invoke).toHaveBeenCalledWith("write_skill", { name: "my-folder", content: "# content" });
  });

  it("auto-enables new skill (not in externalSkills)", async () => {
    useSkillsStore.setState({ externalSkills: [], enabledSkillNames: ["old"] });

    await useSkillsStore.getState().saveSkill("new-folder", "content", null, "new-skill");

    expect(useSkillsStore.getState().enabledSkillNames).toContain("new-skill");
    expect(settingsRepo.set).toHaveBeenCalledWith(
      "enabledSkillNames",
      expect.stringContaining("new-skill"),
    );
  });

  it("does not auto-enable existing skill", async () => {
    const skill = makeSkill("existing-skill");
    useSkillsStore.setState({
      externalSkills: [{ skill, source: "claude", path: "/p", folderName: "existing-folder" }],
      enabledSkillNames: ["other"],
    });

    await useSkillsStore.getState().saveSkill("existing-folder", "updated");

    // Should NOT add "existing-folder" to enabled list since it's an existing skill
    expect(useSkillsStore.getState().enabledSkillNames).not.toContain("existing-folder");
  });

  it("refreshes external skills after save", async () => {
    await useSkillsStore.getState().saveSkill("f", "c");

    // invoke called for write_skill + discover_external_skills
    expect(invoke).toHaveBeenCalledWith("discover_external_skills", expect.any(Object));
  });
});

describe("skillsStore — deleteSkill", () => {
  beforeEach(() => {
    vi.mocked(settingsRepo.get).mockResolvedValue(null);
    vi.mocked(invoke).mockResolvedValue([]);
  });

  it("invokes delete_skill with folderName", async () => {
    await useSkillsStore.getState().deleteSkill("my-folder");

    expect(invoke).toHaveBeenCalledWith("delete_skill", { name: "my-folder" });
  });

  it("removes skillName from enabledSkillNames", async () => {
    useSkillsStore.setState({ enabledSkillNames: ["keep", "remove-me", "also-keep"] });

    await useSkillsStore.getState().deleteSkill("folder", null, "remove-me");

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["keep", "also-keep"]);
  });

  it("uses folderName as fallback when skillName is undefined", async () => {
    useSkillsStore.setState({ enabledSkillNames: ["my-folder", "other"] });

    await useSkillsStore.getState().deleteSkill("my-folder");

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["other"]);
  });

  it("refreshes external skills after delete", async () => {
    await useSkillsStore.getState().deleteSkill("f");

    expect(invoke).toHaveBeenCalledWith("discover_external_skills", expect.any(Object));
  });
});
