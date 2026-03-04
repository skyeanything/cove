import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getModelsForProviders,
  getModelOption,
  fetchModels,
  verifyAndFetchModels,
  testConnection,
} from "./model-service";
import type { Provider } from "@/db/types";

vi.mock("./model-verify", () => ({
  verifyApiKey: vi.fn().mockResolvedValue(undefined),
  extractErrorMessage: vi.fn().mockResolvedValue("mock error"),
}));

const mockVerifyApiKey = vi.mocked(
  (await import("./model-verify")).verifyApiKey,
);

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

function mockFetchJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", mockFetchJson({}));
});

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

describe("getModelOption", () => {
  it("returns knownModelDetails when model exists in meta", () => {
    const provider = makeProvider({ type: "anthropic" });
    const option = getModelOption(provider, "claude-sonnet-4-5-20250929");
    expect(option).toBeDefined();
    expect(option?.vision).toBe(true);
    expect(option?.pdf_native).toBe(true);
  });

  it("returns undefined when model not found", () => {
    const provider = makeProvider({ type: "deepseek" });
    expect(getModelOption(provider, "nonexistent-model")).toBeUndefined();
  });

  it("returns config model_options when present", () => {
    const provider = makeProvider({
      type: "deepseek",
      config: JSON.stringify({
        model_options: { "deepseek-chat": { context_window: 64000 } },
      }),
    });
    const option = getModelOption(provider, "deepseek-chat");
    expect(option?.context_window).toBe(64000);
  });

  it("merges meta and config with config taking precedence", () => {
    const provider = makeProvider({
      type: "anthropic",
      config: JSON.stringify({
        model_options: { "claude-sonnet-4-5-20250929": { context_window: 999 } },
      }),
    });
    const option = getModelOption(provider, "claude-sonnet-4-5-20250929");
    expect(option?.context_window).toBe(999);
    expect(option?.vision).toBe(true);
  });

  it("handles malformed config JSON", () => {
    const provider = makeProvider({ type: "anthropic", config: "bad-json" });
    const option = getModelOption(provider, "claude-sonnet-4-5-20250929");
    // meta knownModelDetails still accessible even with bad config
    expect(option).toBeDefined();
    expect(option?.vision).toBe(true);
  });

  it("returns undefined for provider with no knownModelDetails and no config", () => {
    const provider = makeProvider({ type: "ollama" });
    expect(getModelOption(provider, "llama3")).toBeUndefined();
  });
});

describe("fetchModels", () => {
  it("returns cached models when cache is valid", async () => {
    const provider = makeProvider({
      config: JSON.stringify({
        cached_models: ["cached-model-1"],
        cached_models_at: new Date().toISOString(),
      }),
    });
    const result = await fetchModels(provider);
    expect(result).toEqual(["cached-model-1"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to knownModels when cache expired", async () => {
    const provider = makeProvider({
      type: "deepseek",
      config: JSON.stringify({
        cached_models: ["old-model"],
        cached_models_at: "2020-01-01T00:00:00Z",
      }),
    });
    const result = await fetchModels(provider);
    expect(result).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("falls back to knownModels when no cache", async () => {
    const provider = makeProvider({ type: "deepseek" });
    const result = await fetchModels(provider);
    expect(result).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("calls /api/tags for ollama provider", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ models: [{ name: "llama3" }, { name: "codellama" }] }),
    );
    const provider = makeProvider({
      type: "ollama",
      base_url: "http://localhost:11434",
    });
    const result = await fetchModels(provider);
    expect(result).toEqual(["codellama", "llama3"]);
    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/api/tags");
  });

  it("calls /v1/models for moonshot provider", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ data: [{ id: "moonshot-v1-8k" }, { id: "moonshot-v1-32k" }] }),
    );
    const provider = makeProvider({
      type: "moonshot",
      base_url: "https://api.moonshot.cn",
      api_key: "sk-moon",
    });
    const result = await fetchModels(provider);
    expect(result).toEqual(["moonshot-v1-32k", "moonshot-v1-8k"]);
  });

  it("calls /v1/models for openai-compatible with supportsModelFetch", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ data: [{ id: "llama-3.3-70b" }, { id: "gemma2-9b" }] }),
    );
    const provider = makeProvider({
      type: "groq",
      base_url: "https://api.groq.com/openai",
      api_key: "sk-groq",
    });
    const result = await fetchModels(provider);
    expect(result).toEqual(["gemma2-9b", "llama-3.3-70b"]);
  });

  it("falls back to knownModels on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const provider = makeProvider({
      type: "groq",
      base_url: "https://api.groq.com/openai",
    });
    const result = await fetchModels(provider);
    expect(result).toEqual([
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ]);
  });

  it("skips fetch for providers without supportsModelFetch", async () => {
    const provider = makeProvider({ type: "anthropic" });
    const result = await fetchModels(provider);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("verifyAndFetchModels", () => {
  it("fetches ollama models from /api/tags", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ models: [{ name: "llama3" }] }),
    );
    const provider = makeProvider({ type: "ollama", base_url: "http://localhost:11434" });
    const result = await verifyAndFetchModels(provider);
    expect(result).toEqual(["llama3"]);
  });

  it("returns modelIds and modelOptions for moonshot", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        data: [{ id: "moonshot-v1-8k", context_length: 8192, supports_image_in: true }],
      }),
    );
    const provider = makeProvider({ type: "moonshot", base_url: "https://api.moonshot.cn", api_key: "k" });
    const result = await verifyAndFetchModels(provider);
    expect(result).toHaveProperty("modelIds");
    expect(result).toHaveProperty("modelOptions");
    const typed = result as { modelIds: string[]; modelOptions: Record<string, unknown> };
    expect(typed.modelIds).toEqual(["moonshot-v1-8k"]);
    expect(typed.modelOptions["moonshot-v1-8k"]).toEqual({ context_window: 8192, image_in: true });
  });

  it("returns sorted model IDs for openai-compatible", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ data: [{ id: "z-model" }, { id: "a-model" }] }),
    );
    const provider = makeProvider({ type: "groq", base_url: "https://api.groq.com/openai", api_key: "k" });
    const result = await verifyAndFetchModels(provider);
    expect(result).toEqual(["a-model", "z-model"]);
  });

  it("calls verifyApiKey for non-fetchable provider and returns knownModels", async () => {
    const provider = makeProvider({ type: "anthropic", api_key: "sk-ant" });
    const result = await verifyAndFetchModels(provider);
    expect(mockVerifyApiKey).toHaveBeenCalledWith(provider);
    expect(Array.isArray(result)).toBe(true);
    expect((result as string[]).length).toBeGreaterThan(0);
  });

  it("propagates fetch errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const provider = makeProvider({ type: "ollama", base_url: "http://localhost:11434" });
    await expect(verifyAndFetchModels(provider)).rejects.toThrow("timeout");
  });
});

describe("testConnection", () => {
  it("returns ok with models for fetchable provider", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ data: [{ id: "model-1" }] }),
    );
    const provider = makeProvider({ type: "groq", base_url: "https://api.groq.com/openai", api_key: "k" });
    const result = await testConnection(provider);
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["model-1"]);
  });

  it("returns ok with knownModels for non-fetchable provider", async () => {
    const provider = makeProvider({ type: "anthropic", api_key: "sk-ant" });
    const result = await testConnection(provider);
    expect(result.ok).toBe(true);
    expect(result.models!.length).toBeGreaterThan(0);
    expect(mockVerifyApiKey).toHaveBeenCalledWith(provider);
  });

  it("returns error on failure", async () => {
    mockVerifyApiKey.mockRejectedValueOnce(new Error("Invalid API key"));
    const provider = makeProvider({ type: "anthropic", api_key: "bad-key" });
    const result = await testConnection(provider);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid API key");
  });

  it("returns generic message for non-Error thrown", async () => {
    mockVerifyApiKey.mockRejectedValueOnce("something weird");
    const provider = makeProvider({ type: "anthropic", api_key: "bad-key" });
    const result = await testConnection(provider);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection failed");
  });
});
