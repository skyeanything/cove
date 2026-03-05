import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Skill } from "@/lib/ai/skills/types";
import { parseSkillFromRaw, listSkills } from "@/lib/ai/skills/loader";
import { readConfig, writeConfig } from "@/lib/config";
import type { SkillsConfig } from "@/lib/config/types";

export async function getSkillDirPaths(): Promise<string[]> {
  const config = await readConfig<SkillsConfig>("skills");
  return config.dirPaths ?? [];
}

export async function setSkillDirPaths(paths: string[]): Promise<void> {
  const config = await readConfig<SkillsConfig>("skills");
  await writeConfig("skills", { ...config, dirPaths: paths });
}

interface ExternalSkillEntry {
  source: string;
  name: string;
  path: string;
  content: string;
}

export interface ExternalSkillWithSource {
  skill: Skill;
  source: string;
  path: string;
  folderName: string;
}

const SKILL_NAME_MIGRATIONS: Record<string, string> = {
  officellm: "OfficeLLM",
  office: "OfficeLLM",
  "code-interpreter": "cove-core",
  cove: "cove-core",
};

export async function getEnabledSkillNames(): Promise<string[]> {
  const config = await readConfig<SkillsConfig>("skills");
  const enabled = config.enabled;
  if (Array.isArray(enabled) && enabled.length > 0) {
    const migrated = enabled.map((n) => SKILL_NAME_MIGRATIONS[n] ?? n);
    if (JSON.stringify(migrated) !== JSON.stringify(enabled)) {
      await writeConfig("skills", { ...config, enabled: migrated });
    }
    return migrated;
  }
  const defaultEnabled = listSkills().map((s) => s.name);
  await writeConfig("skills", { ...config, enabled: defaultEnabled });
  return defaultEnabled;
}

export async function setEnabledSkillNames(names: string[]): Promise<void> {
  const config = await readConfig<SkillsConfig>("skills");
  await writeConfig("skills", { ...config, enabled: names });
}

interface SkillsState {
  externalSkills: ExternalSkillWithSource[];
  loaded: boolean;
  loading: boolean;
  scanError: string | null;
  enabledSkillNames: string[];
  loadExternalSkills: (workspacePath?: string | null) => Promise<void>;
  loadEnabledSkillNames: () => Promise<void>;
  toggleSkillEnabled: (name: string) => Promise<void>;
  saveSkill: (folderName: string, content: string, workspacePath?: string | null, skillName?: string) => Promise<void>;
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

      const bundledNames = withSource
        .filter((e) => e.source === "office-bundled")
        .map((e) => e.skill.meta.name);
      if (bundledNames.length > 0) {
        const enabled = get().enabledSkillNames;
        const missing = bundledNames.filter((n) => !enabled.includes(n));
        if (missing.length > 0) {
          const next = [...enabled, ...missing];
          await setEnabledSkillNames(next);
          set({ enabledSkillNames: next });
        }
      }
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
    await get().loadExternalSkills(workspacePath);
  },

  deleteSkill: async (folderName, workspacePath, skillName) => {
    await invoke<void>("delete_skill", { name: folderName });
    const enableKey = skillName ?? folderName;
    const prev = get().enabledSkillNames;
    if (prev.includes(enableKey)) {
      const next = prev.filter((n) => n !== enableKey);
      await setEnabledSkillNames(next);
      set({ enabledSkillNames: next });
    }
    await get().loadExternalSkills(workspacePath);
  },
}));
