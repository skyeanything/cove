import type { ProviderType, ModelOption } from "@/db/types";

export interface BaseUrlOption {
  value: string;
  label: string;
}

export interface ProviderMeta {
  type: ProviderType;
  displayName: string;
  /** 简短介绍，用于设置页右侧展示；若设 descriptionKey 则优先用 i18n */
  description?: string;
  /** i18n 文案 key，优先于 description */
  descriptionKey?: string;
  defaultBaseUrl?: string;
  /** 当提供时，设置页用下拉选择 Base URL（如区域），替代手动输入 */
  baseUrlOptions?: BaseUrlOption[];
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModelFetch: boolean;
  builtIn: boolean;
  fields: ProviderField[];
  knownModels: string[];
  /** 已知模型的默认能力与窗口信息，参考官方文档（如 DeepSeek 定价页） */
  knownModelDetails?: Record<string, Partial<ModelOption>>;
}

export interface ProviderField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required?: boolean;
}

/** Ordered list of built-in provider types shown in the settings panel. */
export const BUILTIN_PROVIDER_TYPES: ProviderType[] = [
  // "anthropic",
  // "azure",
  "aliyun",
  "deepseek",
  // "github-copilot",
  // "google",
  // "groq",
  // "mistral",
  "minimax",
  "moonshot",
  "ollama",
  "openai",
  "openrouter",
  "tencent-cloud",
  "volcengine-ark",
  // "perplexity",
  // "together",
  // "xai",
];
