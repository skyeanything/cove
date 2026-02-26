import type { Skill, SkillMeta, SkillResource } from "./types";

// Static skill registry — skills are registered at build time.
// In a Tauri/browser environment we can't dynamically scan the filesystem,
// so we use Vite's import.meta.glob to load SKILL.md files.

const skillModules = import.meta.glob("/src/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const resourceModules = import.meta.glob("/src/skills/*/resources/**/*.{md,json}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * 宽松提取 frontmatter 中的 name/description（opencode ConfigMarkdown.fallbackSanitization 思路）。
 * 当标准解析失败或 name 为空时使用，避免无效 YAML 导致整条 skill 丢失。
 */
function parseFrontmatterPermissive(raw: string): { name: string; description: string; content: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const block = match[1]!;
  const content = match[2]!.trim();
  const nameMatch = block.match(/^name\s*:\s*(.+)$/m);
  const descMatch = block.match(/^description\s*:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1]!.trim().replace(/^["']|["']$/g, "") : "";
  const description = descMatch ? descMatch[1]!.trim().replace(/^["']|["']$/g, "") : "";
  return { name, description, content };
}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, content: raw };
  }

  const yamlBlock = match[1]!;
  const content = match[2]!.trim();

  // Simple YAML parser for flat key-value pairs + nested arrays
  const meta: Record<string, unknown> = {};
  let currentKey = "";
  let currentList: string[] | null = null;

  for (const line of yamlBlock.split("\n")) {
    const listMatch = line.match(/^\s+-\s+(.+)/);
    if (listMatch && currentList) {
      currentList.push(listMatch[1]!.trim());
      continue;
    }

    // Flush any pending list
    if (currentList && currentKey) {
      // Find the parent object for nested keys
      const parts = currentKey.split(".");
      if (parts.length === 2) {
        const parent = parts[0]!;
        const child = parts[1]!;
        if (!meta[parent]) meta[parent] = {};
        (meta[parent] as Record<string, unknown>)[child] = currentList;
      } else {
        meta[currentKey] = currentList;
      }
      currentList = null;
      currentKey = "";
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1]!;
      const value = kvMatch[2]!.trim();
      if (value === "") {
        // Could be a map — skip, children will handle
      } else {
        meta[key] = parseYamlValue(value);
      }
      continue;
    }

    // Nested key like "  tools:"
    const nestedMatch = line.match(/^\s+(\w+):(.*)$/);
    if (nestedMatch) {
      const nestedKey = nestedMatch[1]!;
      const nestedValue = nestedMatch[2]!.trim();
      if (nestedValue === "") {
        // Array will follow
        currentKey = `${findParentKey(yamlBlock, line)}.${nestedKey}`;
        currentList = [];
      } else {
        const parentKey = findParentKey(yamlBlock, line);
        if (!meta[parentKey]) meta[parentKey] = {};
        (meta[parentKey] as Record<string, unknown>)[nestedKey] = parseYamlValue(nestedValue);
      }
    }
  }

  // Flush final list
  if (currentList && currentKey) {
    const parts = currentKey.split(".");
    if (parts.length === 2) {
      const parent = parts[0]!;
      const child = parts[1]!;
      if (!meta[parent]) meta[parent] = {};
      (meta[parent] as Record<string, unknown>)[child] = currentList;
    } else {
      meta[currentKey] = currentList;
    }
  }

  return { meta, content };
}

function parseYamlValue(value: string): string | number | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  // Strip surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function findParentKey(yaml: string, childLine: string): string {
  const lines = yaml.split("\n");
  const childIndex = lines.indexOf(childLine);
  // Walk backwards to find first non-indented key
  for (let i = childIndex - 1; i >= 0; i--) {
    const match = lines[i]!.match(/^(\w+):/);
    if (match) return match[1]!;
  }
  return "";
}

/** Collect resource files belonging to a skill directory */
function collectResources(skillDirName: string): SkillResource[] {
  const prefix = `/src/skills/${skillDirName}/`;
  const resources: SkillResource[] = [];
  for (const [resPath, resContent] of Object.entries(resourceModules)) {
    if (resPath.startsWith(prefix)) {
      resources.push({
        path: resPath.slice(prefix.length), // e.g. "resources/TABLE_OPERATIONS_GUIDE.md"
        content: resContent,
      });
    }
  }
  return resources;
}

/** Parse metadata JSON string from frontmatter (e.g. '{"version": "2.11", "author": "..."}') */
function parseMetadataField(raw: unknown): Record<string, string> | undefined {
  if (!raw) return undefined;
  if (typeof raw === "object" && raw !== null) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = String(v);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        out[k] = String(v);
      }
      return Object.keys(out).length > 0 ? out : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

let cachedSkills: Skill[] | null = null;

function loadAllSkills(): Skill[] {
  if (cachedSkills) return cachedSkills;

  const skills: Skill[] = [];

  for (const [path, raw] of Object.entries(skillModules)) {
    const parsed = parseFrontmatter(raw);
    let name = (parsed.meta.name as string) ?? "";
    let description = (parsed.meta.description as string) ?? "";
    let content = parsed.content;
    const pathName = path.match(/\/src\/skills\/([^/]+)\/SKILL\.md/)?.[1] ?? "unknown";

    // 与 opencode 对齐：解析失败或 name 为空时用宽松解析兜底
    if (!name || parsed.meta.name === undefined) {
      const fallback = parseFrontmatterPermissive(raw);
      if (fallback) {
        name = fallback.name || pathName;
        description = fallback.description;
        content = fallback.content;
      }
    }

    const metadata = parseMetadataField(parsed.meta.metadata);
    const resources = collectResources(pathName);

    const skillMeta: SkillMeta = {
      name: name || pathName,
      description: description,
      emoji: parsed.meta.emoji as string | undefined,
      always: (parsed.meta.always as boolean) ?? false,
      requires: parsed.meta.requires as { tools?: string[] } | undefined,
      metadata,
    };

    skills.push({
      meta: skillMeta,
      content,
      resources: resources.length > 0 ? resources : undefined,
    });
  }

  cachedSkills = skills;
  return skills;
}

/** Get all bundled skills with their full content and resources (for settings page) */
export function getAllBundledSkills(): Skill[] {
  return loadAllSkills();
}

export function listSkills(): SkillMeta[] {
  return loadAllSkills().map((s) => s.meta);
}

export function getAlwaysSkills(): Skill[] {
  return loadAllSkills().filter((s) => s.meta.always);
}

export function loadSkill(name: string): Skill | undefined {
  return loadAllSkills().find((s) => s.meta.name === name);
}

export function buildSkillsSummary(): string {
  const skills = loadAllSkills();
  if (skills.length === 0) return "";

  const items = skills
    .filter((s) => !s.meta.always)
    .map((s) => {
      const emoji = s.meta.emoji ? `${s.meta.emoji} ` : "";
      const tools = s.meta.requires?.tools?.length
        ? ` (requires: ${s.meta.requires.tools.join(", ")})`
        : "";
      return `  <skill name="${s.meta.name}">${emoji}${s.meta.description}${tools}</skill>`;
    });

  if (items.length === 0) return "";

  return `<available-skills>\n${items.join("\n")}\n</available-skills>`;
}

/**
 * 按 opencode tool/skill.ts 格式输出单条 skill 内容，供 skill 工具 execute 返回。
 * 参考：opencode packages/opencode/src/tool/skill.ts 的 output 结构。
 */
export function formatSkillContentForTool(skill: Skill): string {
  return [
    `<skill_content name="${skill.meta.name}">`,
    `# Skill: ${skill.meta.name}`,
    "",
    skill.content.trim(),
    "",
    "Relative paths in this skill (e.g., scripts/, reference/) are relative to the skill directory.",
    "</skill_content>",
  ].join("\n");
}

const SKILL_TOOL_DESCRIPTION_EMPTY =
  "Load a specialized skill that provides domain-specific instructions and workflows. No skills are currently available.";

const SKILL_TOOL_DESCRIPTION_INTRO = [
  "Load a specialized skill that provides domain-specific instructions and workflows.",
  "",
  "When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.",
  "",
  "The skill will inject detailed instructions, workflows, and access to bundled resources into the conversation context.",
  "",
  'Tool output includes a `<skill_content name="...">` block with the loaded content.',
  "",
  "Invoke this tool to load a skill when a task matches one of the available skills listed below:",
  "",
  "<available_skills>",
];

/**
 * 根据给定 skill 列表或 meta 列表构建工具 description（仅列出这些 skill，供「仅勾选技能」过滤用）。
 */
export function getSkillToolDescriptionForSkills(skills: Skill[]): string;
export function getSkillToolDescriptionForSkills(metas: SkillMeta[]): string;
export function getSkillToolDescriptionForSkills(skillsOrMetas: Skill[] | SkillMeta[]): string {
  const metas = skillsOrMetas.map((s) => ("meta" in s ? s.meta : s));
  if (metas.length === 0) return SKILL_TOOL_DESCRIPTION_EMPTY;
  const lines = [
    ...SKILL_TOOL_DESCRIPTION_INTRO,
    ...metas.flatMap((m) => [
      `  <skill>`,
      `    <name>${m.name}</name>`,
      `    <description>${m.description}</description>`,
      `  </skill>`,
    ]),
    "</available_skills>",
  ];
  return lines.join("\n");
}

/**
 * 构建 skill 工具的 description（列出全部 skill，未过滤）。
 * 参考：opencode tool/skill.ts 的 description 与 <available_skills> 结构。
 */
export function getSkillToolDescription(): string {
  const skills = loadAllSkills();
  return getSkillToolDescriptionForSkills(skills);
}

/**
 * 将 Tauri 返回的原始 SKILL.md 内容解析为 Skill（供外部 skill 缓存使用）。
 * 使用与 bundled 相同的 frontmatter 解析与宽松兜底。
 */
export function parseSkillFromRaw(rawContent: string, fallbackName: string): Skill {
  const parsed = parseFrontmatter(rawContent);
  let name = (parsed.meta.name as string) ?? "";
  let description = (parsed.meta.description as string) ?? "";
  let content = parsed.content;
  if (!name || parsed.meta.name === undefined) {
    const permissive = parseFrontmatterPermissive(rawContent);
    if (permissive) {
      name = permissive.name || fallbackName;
      description = permissive.description;
      content = permissive.content;
    } else {
      name = fallbackName;
    }
  }
  const skillMeta: SkillMeta = {
    name,
    description,
    emoji: parsed.meta.emoji as string | undefined,
    always: (parsed.meta.always as boolean) ?? false,
    requires: parsed.meta.requires as { tools?: string[] } | undefined,
    metadata: parseMetadataField(parsed.meta.metadata),
  };
  return { meta: skillMeta, content };
}
