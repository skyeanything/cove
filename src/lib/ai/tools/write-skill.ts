import { tool } from "ai";
import { z } from "zod/v4";
import { homeDir } from "@tauri-apps/api/path";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";

/**
 * write_skill tool — AI 调用此工具将生成的 SKILL.md 写入 ~/.cove/skills/{name}/SKILL.md。
 * skill-creator skill 在对话引导后调用此工具保存用户 skill。
 * 保存成功后自动将工作目录切换到 ~/.cove/skills/{name}/。
 */
export const writeSkillTool = tool({
  description:
    "Save a skill to the user's Cove skill directory (~/.cove/skills/{name}/SKILL.md). " +
    "Use this after drafting a skill with the user to persist it and make it immediately available. " +
    "The skill will be auto-enabled after saving, and the workspace will switch to the skill directory.",
  inputSchema: z.object({
    name: z
      .string()
      .describe(
        "The skill slug: lowercase letters, digits, and hyphens only (e.g. 'pdf-editor', 'my-workflow')",
      ),
    content: z
      .string()
      .describe(
        "Full SKILL.md content including YAML frontmatter (--- ... ---) and the markdown body",
      ),
  }),
  execute: async ({ name, content }) => {
    await useSkillsStore.getState().saveSkill(name, content, null);

    // Switch workspace to the newly created skill directory
    try {
      const home = await homeDir();
      const skillDir = `${home}/.cove/skills/${name}`;
      const ws = await useWorkspaceStore.getState().add(skillDir);
      const conversationId = useDataStore.getState().activeConversationId;
      await useWorkspaceStore.getState().select(ws.id, conversationId);
    } catch {
      // Workspace switch is best-effort; skill was already saved successfully
    }

    return `Skill "${name}" has been saved to ~/.cove/skills/${name}/SKILL.md and enabled. Workspace switched to the skill directory.`;
  },
});
