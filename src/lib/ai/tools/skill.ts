import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import type { Skill, SkillMeta } from "@/lib/ai/skills/types";
import {
  loadSkill,
  formatSkillContentForTool,
  getSkillToolDescription,
  getSkillToolDescriptionForSkills,
  listSkills,
  getAllBundledSkills,
} from "@/lib/ai/skills/loader";
import { useSkillsStore } from "@/stores/skillsStore";

/** 来源优先级：cove(0) > claude(1) > 其他含内置(2) */
export function sourcePriority(source: string): number {
  const s = source.toLowerCase();
  if (s === "cove") return 0;
  if (s === "claude") return 1;
  return 2;
}

/** 按优先级合并去重：cove > claude > 内置/其他 */
function getAllSkillMetas(): SkillMeta[] {
  const external = useSkillsStore.getState().externalSkills.map((e) => ({
    meta: e.skill.meta,
    priority: sourcePriority(e.source),
  }));
  const bundled = listSkills().map((m) => ({ meta: m, priority: sourcePriority("app") }));
  const all = [...external, ...bundled].sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  const out: SkillMeta[] = [];
  for (const { meta } of all) {
    if (!seen.has(meta.name)) {
      seen.add(meta.name);
      out.push(meta);
    }
  }
  return out;
}

/** 找到同名 skill 中优先级最高的那个 */
function resolveSkill(name: string): Skill | undefined {
  const candidates: { skill: Skill; priority: number }[] = [];
  for (const e of useSkillsStore.getState().externalSkills) {
    if (e.skill.meta.name === name) {
      candidates.push({ skill: e.skill, priority: sourcePriority(e.source) });
    }
  }
  const bundled = loadSkill(name);
  if (bundled) candidates.push({ skill: bundled, priority: sourcePriority("app") });
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.skill;
}

/**
 * 创建仅暴露 enabledNames 的 skill 工具；未勾选的 skill 不会出现在描述中且执行时返回不可用。
 */
export function createSkillTool(enabledNames: string[]) {
  const allMetas = getAllSkillMetas();
  const enabledSet = new Set(enabledNames);
  const filteredMetas = allMetas.filter((m) => enabledSet.has(m.name));
  const description = getSkillToolDescriptionForSkills(filteredMetas);

  return tool({
    description,
    inputSchema: z.object({
      name: z.string().describe("The name of the skill from available_skills"),
    }),
    execute: async ({ name }) => {
      if (!enabledSet.has(name)) {
        return "This skill is not enabled for this session. Enable it in the Skills panel to use it.";
      }
      const skill = resolveSkill(name);
      if (skill) return formatSkillContentForTool(skill);
      const available = filteredMetas.map((m) => m.name).join(", ");
      return `Skill "${name}" not found. Available skills: ${available || "none"}`;
    },
  });
}

/**
 * Skill 工具（未过滤，列出全部；用于 AGENT_TOOLS 默认）。
 */
export const skillTool = tool({
  description: getSkillToolDescription(),
  inputSchema: z.object({
    name: z.string().describe("The name of the skill from available_skills"),
  }),
  execute: async ({ name }) => {
    const skill = resolveSkill(name);
    if (skill) return formatSkillContentForTool(skill);
    const available = getAllSkillMetas().map((m) => m.name).join(", ");
    return `Skill "${name}" not found. Available skills: ${available || "none"}`;
  },
});

interface ResourceEntry {
  skillName: string;
  path: string;
  /** Bundled resources have content in memory; external ones need Tauri IPC */
  content?: string;
  /** For external resources: the skill directory to read from */
  skillDir?: string;
}

/**
 * Collect all available resources from both bundled and external skills.
 * Bundled resources take priority when a skill name exists in both.
 */
function collectAllResources(enabledSet: Set<string>): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  const seen = new Set<string>(); // "skillName:path" dedup key

  // Bundled resources (in-memory content)
  for (const skill of getAllBundledSkills()) {
    if (!enabledSet.has(skill.meta.name) || !skill.resources?.length) continue;
    for (const r of skill.resources) {
      const key = `${skill.meta.name}:${r.path}`;
      seen.add(key);
      entries.push({ skillName: skill.meta.name, path: r.path, content: r.content });
    }
  }

  // External resources (paths only, loaded on demand)
  for (const ext of useSkillsStore.getState().externalSkills) {
    if (!enabledSet.has(ext.skill.meta.name) || ext.resourcePaths.length === 0) continue;
    for (const rp of ext.resourcePaths) {
      const key = `${ext.skill.meta.name}:${rp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ skillName: ext.skill.meta.name, path: rp, skillDir: ext.skillDir });
    }
  }

  return entries;
}

/**
 * Create skill_resource tool: on-demand loading of resource files from both
 * bundled and external skills.
 */
export function createSkillResourceTool(enabledNames: string[]) {
  const enabledSet = new Set(enabledNames);
  const allResources = collectAllResources(enabledSet);

  const resourceLines = allResources.map((r) => `  - ${r.skillName}: ${r.path}`);
  const description =
    resourceLines.length > 0
      ? [
          "Load a specific resource guide from an enabled skill. Use this to retrieve detailed guides without loading the entire skill.",
          "",
          "Available resources:",
          ...resourceLines,
        ].join("\n")
      : "Load a specific resource guide from an enabled skill. No resources are currently available.";

  return tool({
    description,
    inputSchema: z.object({
      skillName: z.string().describe("The skill name that owns the resource"),
      resourcePath: z
        .string()
        .describe("The resource path, e.g. 'resources/TABLE_OPERATIONS_GUIDE.md'"),
    }),
    execute: async ({ skillName, resourcePath }) => {
      if (!enabledSet.has(skillName)) {
        return `Skill "${skillName}" is not enabled. Enable it in the Skills panel first.`;
      }
      const matching = allResources.filter((r) => r.skillName === skillName);
      if (matching.length === 0) {
        return `Skill "${skillName}" has no available resources.`;
      }
      const resource = matching.find((r) => r.path === resourcePath);
      if (!resource) {
        const available = matching.map((r) => r.path).join(", ");
        return `Resource "${resourcePath}" not found in skill "${skillName}". Available: ${available}`;
      }

      let content: string;
      if (resource.content !== undefined) {
        content = resource.content;
      } else if (resource.skillDir) {
        content = await invoke<string>("read_skill_resource", {
          skillDir: resource.skillDir,
          resourcePath: resource.path,
        });
      } else {
        return `Cannot load resource "${resourcePath}" — no content source available.`;
      }

      return [
        `<skill_resource skill="${skillName}" path="${resourcePath}">`,
        content.trim(),
        "</skill_resource>",
      ].join("\n");
    },
  });
}
