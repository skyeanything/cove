import type { ProviderType } from "@/db/types";

export interface ProviderMeta {
  type: ProviderType;
  displayName: string;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModelFetch: boolean;
  builtIn: boolean;
  fields: ProviderField[];
  knownModels: string[];
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
  },
  "github-copilot": {
    type: "github-copilot",
    displayName: "GitHub Copilot",
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
  ollama: {
    type: "ollama",
    displayName: "Ollama",
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
    requiresApiKey: false,
    requiresBaseUrl: true,
    supportsModelFetch: true,
    builtIn: false,
    fields: [],
    knownModels: [],
  },
};
