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
  "anthropic",
  "azure",
  "deepseek",
  "github-copilot",
  "google",
  "groq",
  "mistral",
  "moonshot",
  "ollama",
  "openai",
  "openrouter",
  "perplexity",
  "together",
  "xai",
];

export const PROVIDER_METAS: Record<ProviderType, ProviderMeta> = {
  anthropic: {
    type: "anthropic",
    displayName: "Anthropic",
    description: "Claude 系列模型，长上下文与强推理能力",
    defaultBaseUrl: "https://api.anthropic.com",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: [
      "claude-opus-4-6",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
  },
  azure: {
    type: "azure",
    displayName: "Azure OpenAI",
    description: "通过 Azure 使用的 OpenAI 模型",
    requiresApiKey: true,
    requiresBaseUrl: true,
    supportsModelFetch: false,
    builtIn: true,
    fields: [
      {
        key: "deployment",
        label: "Deployment Name",
        type: "text",
        placeholder: "gpt-4o",
        required: true,
      },
      {
        key: "api_version",
        label: "API Version",
        type: "text",
        placeholder: "2024-06-01",
        required: true,
      },
    ],
    knownModels: ["gpt-4o", "gpt-4-turbo", "gpt-35-turbo"],
  },
  deepseek: {
    type: "deepseek",
    displayName: "DeepSeek",
    descriptionKey: "provider.deepseek.description",
    defaultBaseUrl: "https://api.deepseek.com",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: [
      "deepseek-chat",
      "deepseek-reasoner",
    ],
    // 参考 https://api-docs.deepseek.com/zh-cn/quick_start/pricing
    knownModelDetails: {
      "deepseek-chat": {
        context_window: 128_000,
        max_output_tokens: 8192,
        tool_calling: true,
        reasoning: false,
      },
      "deepseek-reasoner": {
        context_window: 128_000,
        max_output_tokens: 64_000,
        tool_calling: true,
        reasoning: true,
      },
    },
  },
  "github-copilot": {
    type: "github-copilot",
    displayName: "GitHub Copilot",
    description: "GitHub Copilot 托管模型",
    defaultBaseUrl: "https://api.githubcopilot.com",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: ["gpt-4o", "claude-3.5-sonnet", "o1"],
  },
  google: {
    type: "google",
    displayName: "Google AI",
    description: "Gemini 系列多模态模型",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: [
      "gemini-2.0-flash",
      "gemini-2.0-pro",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
  },
  groq: {
    type: "groq",
    displayName: "Groq",
    description: "Groq 高速推理 API",
    defaultBaseUrl: "https://api.groq.com/openai",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    builtIn: true,
    fields: [],
    knownModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
  },
  mistral: {
    type: "mistral",
    displayName: "Mistral",
    description: "Mistral 大模型 API",
    defaultBaseUrl: "https://api.mistral.ai",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "open-mixtral-8x22b",
    ],
  },
  moonshot: {
    type: "moonshot",
    displayName: "Moonshot",
    descriptionKey: "provider.moonshot.description",
    defaultBaseUrl: "https://api.moonshot.cn",
    baseUrlOptions: [
      { value: "https://api.moonshot.ai", label: "International ( api.moonshot.ai )" },
      { value: "https://api.moonshot.cn", label: "China ( api.moonshot.cn )" },
    ],
    requiresApiKey: true,
    requiresBaseUrl: true,
    supportsModelFetch: true,
    builtIn: true,
    fields: [],
    knownModels: [],
  },
  ollama: {
    type: "ollama",
    displayName: "Ollama",
    description: "本地运行的开源模型",
    defaultBaseUrl: "http://localhost:11434",
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsModelFetch: true,
    builtIn: true,
    fields: [],
    knownModels: [],
  },
  openai: {
    type: "openai",
    displayName: "OpenAI",
    description: "GPT 与 o 系列模型",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    builtIn: true,
    fields: [],
    knownModels: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "o1",
      "o1-mini",
      "o3-mini",
    ],
  },
  openrouter: {
    type: "openrouter",
    displayName: "OpenRouter",
    description: "多模型统一 API 网关",
    defaultBaseUrl: "https://openrouter.ai/api",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    builtIn: true,
    fields: [],
    knownModels: [
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-2.0-flash",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },
  perplexity: {
    type: "perplexity",
    displayName: "Perplexity",
    description: "Perplexity 搜索与推理模型",
    defaultBaseUrl: "https://api.perplexity.ai",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: [
      "sonar-pro",
      "sonar",
      "sonar-reasoning-pro",
      "sonar-reasoning",
    ],
  },
  together: {
    type: "together",
    displayName: "Together",
    description: "Together 开源模型 API",
    defaultBaseUrl: "https://api.together.xyz",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    builtIn: true,
    fields: [],
    knownModels: [
      "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "mistralai/Mixtral-8x22B-Instruct-v0.1",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
  },
  xai: {
    type: "xai",
    displayName: "xAI",
    description: "xAI Grok 模型",
    defaultBaseUrl: "https://api.x.ai",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: true,
    fields: [],
    knownModels: [
      "grok-2",
      "grok-2-mini",
    ],
  },
  bedrock: {
    type: "bedrock",
    displayName: "AWS Bedrock",
    description: "AWS 托管的多厂商模型",
    requiresApiKey: false,
    requiresBaseUrl: false,
    supportsModelFetch: false,
    builtIn: false,
    fields: [
      {
        key: "aws_region",
        label: "AWS Region",
        type: "text",
        placeholder: "us-east-1",
        required: true,
      },
      {
        key: "aws_access_key_id",
        label: "Access Key ID",
        type: "password",
        required: true,
      },
      {
        key: "aws_secret_access_key",
        label: "Secret Access Key",
        type: "password",
        required: true,
      },
    ],
    knownModels: [
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "anthropic.claude-3-haiku-20240307-v1:0",
      "amazon.nova-pro-v1:0",
      "amazon.nova-lite-v1:0",
    ],
  },
  "github-models": {
    type: "github-models",
    displayName: "GitHub Models",
    description: "GitHub 推理服务模型",
    defaultBaseUrl: "https://models.inference.ai.azure.com",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsModelFetch: true,
    builtIn: false,
    fields: [],
    knownModels: [
      "gpt-4o",
      "gpt-4o-mini",
      "Meta-Llama-3.1-405B-Instruct",
      "Mistral-Large",
    ],
  },
  custom: {
    type: "custom",
    displayName: "OpenAI Compatible",
    description: "兼容 OpenAI API 的自定义端点",
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsModelFetch: true,
    builtIn: false,
    fields: [],
    knownModels: [],
  },
};
