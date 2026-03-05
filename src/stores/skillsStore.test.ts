import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn().mockResolvedValue({ enabled: [], dirPaths: [] }),
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/ai/skills/loader", () => ({
  parseSkillFromRaw: vi.fn(),
  listSkills: vi.fn().mockReturnValue([]),
}));

// --- imports after mocks ---

import { invoke } from "@tauri-apps/api/core";
import { readConfig, writeConfig } from "@/lib/config";
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

function mockConfig(config: { enabled?: string[]; dirPaths?: string[] }) {
  vi.mocked(readConfig).mockResolvedValue({
    enabled: config.enabled ?? [],
    dirPaths: config.dirPaths ?? [],
  });
}

// --- tests ---

describe("getSkillDirPaths", () => {
  it("returns [] when config has empty dirPaths", async () => {
    mockConfig({});
    expect(await getSkillDirPaths()).toEqual([]);
  });

  it("returns dirPaths from config", async () => {
    mockConfig({ dirPaths: ["/a", "/b"] });
    expect(await getSkillDirPaths()).toEqual(["/a", "/b"]);
  });
});

describe("setSkillDirPaths", () => {
  it("writes updated config with new dirPaths", async () => {
    mockConfig({ enabled: ["s1"], dirPaths: [] });
    await setSkillDirPaths(["/x", "/y"]);
    expect(writeConfig).toHaveBeenCalledWith("skills", {
      enabled: ["s1"],
      dirPaths: ["/x", "/y"],
    });
  });
});

describe("getEnabledSkillNames", () => {
  it("returns enabled names from config", async () => {
    mockConfig({ enabled: ["skill-a", "skill-b"] });
    expect(await getEnabledSkillNames()).toEqual(["skill-a", "skill-b"]);
  });

  it("seeds defaults from listSkills() when config has empty enabled", async () => {
    mockConfig({ enabled: [] });
    vi.mocked(listSkills).mockReturnValue([
      { name: "builtin-1", description: "", always: false },
      { name: "builtin-2", description: "", always: false },
    ]);
    const result = await getEnabledSkillNames();
    expect(result).toEqual(["builtin-1", "builtin-2"]);
    expect(writeConfig).toHaveBeenCalledWith("skills", {
      enabled: ["builtin-1", "builtin-2"],
      dirPaths: [],
    });
  });
});

describe("setEnabledSkillNames", () => {
  it("writes updated config with new enabled list", async () => {
    mockConfig({ enabled: [], dirPaths: ["/p"] });
    await setEnabledSkillNames(["a", "b"]);
    expect(writeConfig).toHaveBeenCalledWith("skills", {
      enabled: ["a", "b"],
      dirPaths: ["/p"],
    });
  });
});

describe("skillsStore - loadExternalSkills", () => {
  it("calls invoke with workspacePath and customRoots", async () => {
    mockConfig({ dirPaths: ["/custom"] });
    vi.mocked(invoke).mockResolvedValue([]);

    await useSkillsStore.getState().loadExternalSkills("/workspace");

    expect(invoke).toHaveBeenCalledWith("discover_external_skills", {
      workspacePath: "/workspace",
      customRoots: ["/custom"],
    });
  });

  it("parses entries via parseSkillFromRaw and sets externalSkills", async () => {
    mockConfig({});
    const skill = makeSkill("test-skill");
    vi.mocked(parseSkillFromRaw).mockReturnValue(skill);
    vi.mocked(invoke).mockResolvedValue([
      { source: "claude", name: "test-folder", path: "/path/to/skill", content: "raw md" },
    ]);

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.externalSkills).toHaveLength(1);
    expect(state.externalSkills[0]?.skill).toBe(skill);
    expect(state.externalSkills[0]?.source).toBe("claude");
    expect(state.externalSkills[0]?.path).toBe("/path/to/skill");
    expect(state.externalSkills[0]?.folderName).toBe("test-folder");
    expect(parseSkillFromRaw).toHaveBeenCalledWith("raw md", "test-folder");
  });

  it("sets loaded=true, scanError=null on success", async () => {
    mockConfig({});
    vi.mocked(invoke).mockResolvedValue([]);

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.scanError).toBeNull();
  });

  it("sets scanError on invoke failure", async () => {
    mockConfig({});
    vi.mocked(invoke).mockRejectedValue(new Error("tauri error"));

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.scanError).toBe("Error: tauri error");
    expect(state.externalSkills).toEqual([]);
  });

  it("skips if already loading (guard)", async () => {
    mockConfig({});
    vi.mocked(invoke).mockResolvedValue([]);

    useSkillsStore.setState({ loading: true });
    await useSkillsStore.getState().loadExternalSkills();

    expect(invoke).not.toHaveBeenCalled();
  });

  it("passes null customRoots when dirPaths is empty", async () => {
    mockConfig({ dirPaths: [] });
    vi.mocked(invoke).mockResolvedValue([]);

    await useSkillsStore.getState().loadExternalSkills("/ws");

    expect(invoke).toHaveBeenCalledWith("discover_external_skills", {
      workspacePath: "/ws",
      customRoots: null,
    });
  });
});

describe("skillsStore - loadEnabledSkillNames", () => {
  it("populates enabledSkillNames from config", async () => {
    mockConfig({ enabled: ["s1", "s2"] });

    await useSkillsStore.getState().loadEnabledSkillNames();

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["s1", "s2"]);
  });
});

describe("skillsStore - toggleSkillEnabled", () => {
  it("adds skill name when not present", async () => {
    mockConfig({ enabled: ["existing"] });
    useSkillsStore.setState({ enabledSkillNames: ["existing"] });

    await useSkillsStore.getState().toggleSkillEnabled("new-skill");

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["existing", "new-skill"]);
    expect(writeConfig).toHaveBeenCalled();
  });

  it("removes skill name when already present", async () => {
    mockConfig({ enabled: ["a", "b", "c"] });
    useSkillsStore.setState({ enabledSkillNames: ["a", "b", "c"] });

    await useSkillsStore.getState().toggleSkillEnabled("b");

    expect(useSkillsStore.getState().enabledSkillNames).toEqual(["a", "c"]);
    expect(writeConfig).toHaveBeenCalled();
  });
});

describe("skillsStore - saveSkill", () => {
  beforeEach(() => {
    mockConfig({});
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
  });

  it("does not auto-enable existing skill", async () => {
    const skill = makeSkill("existing-skill");
    useSkillsStore.setState({
      externalSkills: [{ skill, source: "claude", path: "/p", folderName: "existing-folder" }],
      enabledSkillNames: ["other"],
    });

    await useSkillsStore.getState().saveSkill("existing-folder", "updated");

    expect(useSkillsStore.getState().enabledSkillNames).not.toContain("existing-folder");
  });

  it("refreshes external skills after save", async () => {
    await useSkillsStore.getState().saveSkill("f", "c");

    expect(invoke).toHaveBeenCalledWith("discover_external_skills", expect.any(Object));
  });
});

describe("skillsStore - loadExternalSkills auto-enables office-bundled", () => {
  it("auto-enables office-bundled skill names missing from enabledSkillNames", async () => {
    mockConfig({});
    const bundledSkill = makeSkill("officellm-bundled");
    vi.mocked(parseSkillFromRaw).mockReturnValue(bundledSkill);
    vi.mocked(invoke).mockResolvedValue([
      { source: "office-bundled", name: "OfficeLLM", path: "/bundled/path", content: "bundled" },
    ]);
    useSkillsStore.setState({ enabledSkillNames: ["existing-skill"] });

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    expect(state.enabledSkillNames).toContain("officellm-bundled");
    expect(state.enabledSkillNames).toContain("existing-skill");
    expect(writeConfig).toHaveBeenCalled();
  });

  it("does not duplicate already-enabled office-bundled skills", async () => {
    mockConfig({});
    const bundledSkill = makeSkill("already-enabled");
    vi.mocked(parseSkillFromRaw).mockReturnValue(bundledSkill);
    vi.mocked(invoke).mockResolvedValue([
      { source: "office-bundled", name: "OfficeLLM", path: "/bundled/path", content: "bundled" },
    ]);
    useSkillsStore.setState({ enabledSkillNames: ["already-enabled"] });

    await useSkillsStore.getState().loadExternalSkills();

    const state = useSkillsStore.getState();
    const count = state.enabledSkillNames.filter((n) => n === "already-enabled").length;
    expect(count).toBe(1);
  });
});

describe("skillsStore - deleteSkill", () => {
  beforeEach(() => {
    mockConfig({});
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
