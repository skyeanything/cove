export interface SkillMeta {
  name: string;
  description: string;
  emoji?: string;
  always?: boolean;
  requires?: { tools?: string[] };
  /** Extra frontmatter fields (e.g. version, author, license) */
  metadata?: Record<string, string>;
}

/** A resource file bundled with a skill (e.g. guides, schemas) */
export interface SkillResource {
  /** Relative path within the skill directory, e.g. "resources/TABLE_OPERATIONS_GUIDE.md" */
  path: string;
  content: string;
}

export interface Skill {
  meta: SkillMeta;
  content: string;
  resources?: SkillResource[];
}
