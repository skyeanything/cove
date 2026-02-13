export interface SkillMeta {
  name: string;
  description: string;
  emoji?: string;
  always?: boolean;
  requires?: { tools?: string[] };
}

export interface Skill {
  meta: SkillMeta;
  content: string;
}
