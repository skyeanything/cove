import { tool } from "ai";
import { z } from "zod/v4";
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

/**
 * 创建 skill_resource 工具：按需加载 skill 中的 resource 文件（如 TABLE_OPERATIONS_GUIDE.md）。
 * 避免将整个 96KB SKILL.md + 所有 resource 一次性注入上下文。
 */
export function createSkillResourceTool(enabledNames: string[]) {
  const enabledSet = new Set(enabledNames);
  const allSkills = getAllBundledSkills();
  const skillsWithResources = allSkills.filter(
    (s) => enabledSet.has(s.meta.name) && s.resources && s.resources.length > 0,
  );

  // Build resource listing for description
  const resourceLines = skillsWithResources.flatMap((s) =>
    (s.resources ?? []).map((r) => `  - ${s.meta.name}: ${r.path}`),
  );

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
      const skill = allSkills.find((s) => s.meta.name === skillName);
      if (!skill) return `Skill "${skillName}" not found.`;
      if (!skill.resources || skill.resources.length === 0) {
        return `Skill "${skillName}" has no bundled resources.`;
      }
      const resource = skill.resources.find((r) => r.path === resourcePath);
      if (!resource) {
        const available = skill.resources.map((r) => r.path).join(", ");
        return `Resource "${resourcePath}" not found in skill "${skillName}". Available: ${available}`;
      }
      return [
        `<skill_resource skill="${skillName}" path="${resourcePath}">`,
        resource.content.trim(),
        "</skill_resource>",
      ].join("\n");
    },
  });
}
