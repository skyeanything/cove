import { tool } from "ai";
import { z } from "zod/v4";
import type { SkillMeta } from "@/lib/ai/skills/types";
import {
  loadSkill,
  formatSkillContentForTool,
  getSkillToolDescription,
  getSkillToolDescriptionForSkills,
  listSkills,
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
