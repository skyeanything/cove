import type { Provider, ProviderConfig, ModelInfo } from "@/db/types";

const DEFAULT_TIMESTAMP = "2025-01-01T00:00:00Z";

export function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "provider-1",
    name: "Test Provider",
    type: "openai",
    api_key: "sk-test-key",
    base_url: "https://api.openai.com/v1",
    enabled: 1,
    config: undefined,
    created_at: DEFAULT_TIMESTAMP,
    updated_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

export function makeProviderWithConfig(
  overrides: Partial<Provider> = {},
  config: ProviderConfig = {},
): Provider {
  return makeProvider({
    config: JSON.stringify(config),
    ...overrides,
  });
}

export function makeModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: "gpt-4o",
    name: "GPT-4o",
    provider_id: "provider-1",
    provider_name: "Test Provider",
    provider_type: "openai",
    ...overrides,
  };
}
