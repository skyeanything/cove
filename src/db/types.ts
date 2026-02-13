export type ProviderType =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "azure"
  | "bedrock"
  | "deepseek"
  | "groq"
  | "mistral"
  | "openrouter"
  | "perplexity"
  | "together"
  | "xai"
  | "github-copilot"
  | "github-models"
  | "custom";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  api_key?: string;
  base_url?: string;
  enabled: number;
  config?: string;
  created_at: string;
  updated_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider_id: string;
  provider_name: string;
  provider_type: ProviderType;
}

export interface ProviderConfig {
  // Azure
  deployment?: string;
  api_version?: string;
  // Bedrock
  aws_region?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  // Cached models
  cached_models?: string[];
  cached_models_at?: string;
  // Disabled models (user-toggled off)
  disabled_models?: string[];
  // Proxy
  proxy_url?: string;
}

export interface Assistant {
  id: string;
  name: string;
  icon?: string;
  model?: string;
  provider?: string;
  system_instruction?: string;
  temperature: number;
  top_p: number;
  max_tokens?: number;
  frequency_penalty: number;
  presence_penalty: number;
  web_search_enabled: number;
  artifacts_enabled: number;
  tools_enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  assistant_id: string;
  title?: string;
  pinned: number;
  model_override?: string;
  system_instruction_override?: string;
  temperature_override?: number;
  provider_type?: string;
  workspace_path?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  reasoning?: string;
  parts?: string;
  model?: string;
  tokens_input?: number;
  tokens_output?: number;
  parent_id?: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  message_id: string;
  type: "image" | "pdf" | "audio" | "file";
  name?: string;
  path?: string;
  mime_type?: string;
  size?: number;
  content?: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  is_default: number;
  created_at: string;
}

export interface Prompt {
  id: string;
  name: string;
  content: string;
  builtin: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface McpServer {
  id: string;
  name: string;
  type: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string;
  env?: string;
  url?: string;
  auto_run: number;
  long_running: number;
  enabled: number;
  created_at: string;
}
