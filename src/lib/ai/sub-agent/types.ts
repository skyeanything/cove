import type { LanguageModel } from "ai";
import type { ToolRecord } from "../tools";

export interface SubAgentConfig {
  /** Task description injected into the sub-agent's system prompt */
  task: string;
  /** Available tool IDs (subset of parent tools); omit to inherit all */
  toolIds?: string[];
  /** Skill names to load into the sub-agent's system prompt */
  skillNames?: string[];
  /** Maximum tool-use steps (default: 15) */
  maxSteps?: number;
}

export interface SubAgentResult {
  output: string;
  success: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface SubAgentContext {
  model: LanguageModel;
  /** Parent agent's full tool set */
  parentTools: ToolRecord;
  enabledSkillNames: string[];
  abortSignal?: AbortSignal;
  workspacePath?: string;
  /** Current nesting depth (0 = main agent) */
  currentDepth: number;
  /** Maximum nesting depth (default: 2) */
  maxDepth: number;
}
