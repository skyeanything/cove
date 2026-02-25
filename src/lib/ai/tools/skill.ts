import { tool } from "ai";
import { z } from "zod/v4";
import type { SkillMeta } from "@/lib/ai/skills/types";
import {
  loadSkill,
  formatSkillContentForTool,
  getSkillToolDescription,
  getSkillToolDescriptionForSkills,
  listSkills,
  getAllBundledSkills,
} from "@/lib/ai/skills/loader";
import { useSkillsStore } from "@/stores/skillsStore";

function getAllSkillMetas(): SkillMeta[] {
  const bundled = listSkills();
  const external = useSkillsStore.getState().externalSkills.map((e) => e.skill.meta);
  const seen = new Set<string>();
  const out: SkillMeta[] = [];
  for (const m of bundled) {
    seen.add(m.name);
    out.push(m);
  }
  for (const m of external) {
    if (!seen.has(m.name)) {
      seen.add(m.name);
      out.push(m);
    }
  }
  return out;
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
      const bundled = loadSkill(name);
      if (bundled) return formatSkillContentForTool(bundled);
      const external = useSkillsStore.getState().externalSkills.find((s) => s.skill.meta.name === name);
      if (external) return formatSkillContentForTool(external.skill);
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
    const bundled = loadSkill(name);
    if (bundled) return formatSkillContentForTool(bundled);
    const external = useSkillsStore.getState().externalSkills.find((s) => s.skill.meta.name === name);
    if (external) return formatSkillContentForTool(external.skill);
    const bundledNames = listSkills().map((s) => s.name);
    const externalNames = useSkillsStore.getState().externalSkills.map((s) => s.skill.meta.name);
    const available = [...new Set([...bundledNames, ...externalNames])].join(", ");
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
