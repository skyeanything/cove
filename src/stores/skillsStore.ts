import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Skill } from "@/lib/ai/skills/types";
import { parseSkillFromRaw, listSkills } from "@/lib/ai/skills/loader";
import { settingsRepo } from "@/db/repos/settingsRepo";

const SKILL_DIR_PATHS_KEY = "skillDirPaths";
const ENABLED_SKILL_NAMES_KEY = "enabledSkillNames";

export async function getSkillDirPaths(): Promise<string[]> {
  const raw = await settingsRepo.get(SKILL_DIR_PATHS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setSkillDirPaths(paths: string[]): Promise<void> {
  await settingsRepo.set(SKILL_DIR_PATHS_KEY, JSON.stringify(paths));
}

interface ExternalSkillEntry {
  source: string;
  name: string;
  path: string;
  content: string;
}

/** 外部 skill 及其来源（claude / cursor / opencode / agents / custom） */
export interface ExternalSkillWithSource {
  skill: Skill;
  source: string;
  /** File path of the skill on disk */
  path: string;
  /** Folder name on disk (may differ from frontmatter name) — use for Tauri CRUD ops */
  folderName: string;
}

/** Migrate legacy skill names to current names */
const SKILL_NAME_MIGRATIONS: Record<string, string> = {
  officellm: "office",
  "code-interpreter": "cove",
};

/** 从 settings 读取已勾选 skill 名称；若为空则用内置 skill 名单填充并保存 */
export async function getEnabledSkillNames(): Promise<string[]> {
  const raw = await settingsRepo.get(ENABLED_SKILL_NAMES_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        const names = arr.filter((x): x is string => typeof x === "string");
        const migrated = names.map((n) => SKILL_NAME_MIGRATIONS[n] ?? n);
        if (JSON.stringify(migrated) !== JSON.stringify(names)) {
          await settingsRepo.set(ENABLED_SKILL_NAMES_KEY, JSON.stringify(migrated));
        }
        return migrated;
      }
    } catch {
      /* ignore */
    }
  }
  const defaultEnabled = listSkills().map((s) => s.name);
  await settingsRepo.set(ENABLED_SKILL_NAMES_KEY, JSON.stringify(defaultEnabled));
  return defaultEnabled;
}

export async function setEnabledSkillNames(names: string[]): Promise<void> {
  await settingsRepo.set(ENABLED_SKILL_NAMES_KEY, JSON.stringify(names));
}

interface SkillsState {
  externalSkills: ExternalSkillWithSource[];
  loaded: boolean;
  loading: boolean;
  /** discover_external_skills 失败时的错误信息；null 表示正常 */
  scanError: string | null;
  /** 勾选后才会发给模型的 skill 名称（与 UI 同步，由 loadEnabledSkillNames 加载） */
  enabledSkillNames: string[];
  loadExternalSkills: (workspacePath?: string | null) => Promise<void>;
  loadEnabledSkillNames: () => Promise<void>;
  toggleSkillEnabled: (name: string) => Promise<void>;
  /** Create or update a skill: folderName for disk CRUD, skillName for enabledSkillNames */
  saveSkill: (folderName: string, content: string, workspacePath?: string | null, skillName?: string) => Promise<void>;
  /** Delete a skill: folderName for disk CRUD, skillName for enabledSkillNames */
  deleteSkill: (folderName: string, workspacePath?: string | null, skillName?: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  externalSkills: [],
  loaded: false,
  loading: false,
  scanError: null,
  enabledSkillNames: [],

  loadExternalSkills: async (workspacePath) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const customRoots = await getSkillDirPaths();
      const entries = await invoke<ExternalSkillEntry[]>("discover_external_skills", {
        workspacePath: workspacePath ?? null,
        customRoots: customRoots.length > 0 ? customRoots : null,
      });
      const withSource: ExternalSkillWithSource[] = entries.map((e) => ({
        skill: parseSkillFromRaw(e.content, e.name),
        source: e.source,
        path: e.path,
        folderName: e.name,
      }));
      set({ externalSkills: withSource, loaded: true, scanError: null });
    } catch (e) {
      set({ externalSkills: [], loaded: true, scanError: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loadEnabledSkillNames: async () => {
    const names = await getEnabledSkillNames();
    set({ enabledSkillNames: names });
  },

  toggleSkillEnabled: async (name: string) => {
    const prev = get().enabledSkillNames;
    const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
    await setEnabledSkillNames(next);
    set({ enabledSkillNames: next });
  },

  saveSkill: async (folderName, content, workspacePath, skillName) => {
    await invoke<string>("write_skill", { name: folderName, content });
    // Auto-enable only if genuinely new (not already tracked in externalSkills)
    const enableKey = skillName ?? folderName;
    const isNew = !get().externalSkills.some(
      (e) => e.folderName === folderName || e.skill.meta.name === enableKey,
    );
    if (isNew) {
      const prev = get().enabledSkillNames;
      if (!prev.includes(enableKey)) {
        const next = [...prev, enableKey];
        await setEnabledSkillNames(next);
        set({ enabledSkillNames: next });
      }
    }
    // Refresh external skills list
    await get().loadExternalSkills(workspacePath);
  },

  deleteSkill: async (folderName, workspacePath, skillName) => {
    await invoke<void>("delete_skill", { name: folderName });
    // Remove by logical skill name (frontmatter name), fall back to folder name
    const enableKey = skillName ?? folderName;
    const prev = get().enabledSkillNames;
    if (prev.includes(enableKey)) {
      const next = prev.filter((n) => n !== enableKey);
      await setEnabledSkillNames(next);
      set({ enabledSkillNames: next });
    }
    // Refresh external skills list
    await get().loadExternalSkills(workspacePath);
  },
}));
