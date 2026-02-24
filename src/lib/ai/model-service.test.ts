import { describe, it, expect } from "vitest";
import { getModelsForProviders } from "./model-service";
import type { Provider } from "@/db/types";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "test-id",
    name: "DeepSeek",
    type: "deepseek",
    api_key: "sk-test",
    base_url: "https://api.deepseek.com",
    enabled: 1,
    config: undefined,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getModelsForProviders", () => {
  it("returns empty array for empty providers list", () => {
    const result = getModelsForProviders([]);
    expect(result).toEqual([]);
  });

  it("returns knownModels for DeepSeek provider without cached_models", () => {
    const provider = makeProvider();
    const result = getModelsForProviders([provider]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "deepseek-chat",
      name: "deepseek-chat",
      provider_id: "test-id",
      provider_name: "DeepSeek",
      provider_type: "deepseek",
    });
    expect(result[1]).toEqual({
      id: "deepseek-reasoner",
      name: "deepseek-reasoner",
      provider_id: "test-id",
      provider_name: "DeepSeek",
      provider_type: "deepseek",
    });
  });

  it("returns knownModels when config is undefined", () => {
    const provider = makeProvider({ config: undefined });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("returns knownModels when config is null-ish string", () => {
    // Simulate what DB might return
    const provider = makeProvider({ config: "" });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(2);
  });

  it("returns knownModels when config JSON has no cached_models", () => {
    const provider = makeProvider({ config: JSON.stringify({}) });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("returns knownModels when cached_models is empty array", () => {
    const provider = makeProvider({
      config: JSON.stringify({ cached_models: [] }),
    });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(2);
  });

  it("returns cached_models when present and non-empty", () => {
    const provider = makeProvider({
      config: JSON.stringify({
        cached_models: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
        cached_models_at: "2025-01-01T00:00:00Z",
      }),
    });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.id)).toEqual([
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-coder",
    ]);
  });

  it("skips disabled provider (enabled = 0)", () => {
    const provider = makeProvider({ enabled: 0 });
    const result = getModelsForProviders([provider]);
    expect(result).toEqual([]);
  });

  it("excludes disabled_models from output", () => {
    const provider = makeProvider({
      config: JSON.stringify({
        disabled_models: ["deepseek-reasoner"],
      }),
    });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("deepseek-chat");
  });

  it("handles multiple providers", () => {
    const providers = [
      makeProvider({ id: "ds-1", name: "DeepSeek", type: "deepseek" }),
      makeProvider({
        id: "oai-1",
        name: "OpenAI",
        type: "openai",
        api_key: "sk-oai",
        base_url: "https://api.openai.com/v1",
      }),
    ];
    const result = getModelsForProviders(providers);

    // DeepSeek: 2 models, OpenAI: 6 models
    const dsModels = result.filter((m) => m.provider_type === "deepseek");
    const oaiModels = result.filter((m) => m.provider_type === "openai");
    expect(dsModels).toHaveLength(2);
    expect(oaiModels).toHaveLength(6);
  });

  it("sets correct provider_id and provider_name on each model", () => {
    const provider = makeProvider({
      id: "my-unique-id",
      name: "My DeepSeek",
    });
    const result = getModelsForProviders([provider]);
    for (const model of result) {
      expect(model.provider_id).toBe("my-unique-id");
      expect(model.provider_name).toBe("My DeepSeek");
      expect(model.provider_type).toBe("deepseek");
    }
  });

  it("handles malformed config JSON gracefully", () => {
    const provider = makeProvider({ config: "not-json" });
    const result = getModelsForProviders([provider]);
    // Should fall back to knownModels
    expect(result).toHaveLength(2);
  });

  it("handles Anthropic provider with knownModels", () => {
    const provider = makeProvider({
      id: "ant-1",
      name: "Anthropic",
      type: "anthropic",
      api_key: "sk-ant-test",
    });
    const result = getModelsForProviders([provider]);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((m) => m.provider_type === "anthropic")).toBe(true);
  });

  it("handles MiniMax provider with knownModels", () => {
    const provider = makeProvider({
      id: "mm-1",
      name: "MiniMax",
      type: "minimax",
      api_key: "sk-mm-test",
      base_url: "https://api.minimaxi.com",
    });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(5);
    expect(result.every((m) => m.provider_type === "minimax")).toBe(true);
  });

  it("handles MiniMax provider with cached_models", () => {
    const provider = makeProvider({
      id: "mm-1",
      name: "MiniMax",
      type: "minimax",
      api_key: "sk-mm-test",
      base_url: "https://api.minimaxi.com",
      config: JSON.stringify({
        cached_models: ["MiniMax-M2.5", "MiniMax-M2"],
      }),
    });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["MiniMax-M2.5", "MiniMax-M2"]);
  });

  it("handles Ollama provider with no knownModels and no cached_models", () => {
    const provider = makeProvider({
      id: "ollama-1",
      name: "Ollama",
      type: "ollama",
      api_key: undefined,
      base_url: "http://localhost:11434",
    });
    const result = getModelsForProviders([provider]);
    // Ollama has empty knownModels, so no models if no cached_models
    expect(result).toEqual([]);
  });

  it("handles Ollama provider with cached_models", () => {
    const provider = makeProvider({
      id: "ollama-1",
      name: "Ollama",
      type: "ollama",
      api_key: undefined,
      base_url: "http://localhost:11434",
      config: JSON.stringify({
        cached_models: ["llama3:latest", "codellama:latest"],
      }),
    });
    const result = getModelsForProviders([provider]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toEqual(["llama3:latest", "codellama:latest"]);
  });
});
