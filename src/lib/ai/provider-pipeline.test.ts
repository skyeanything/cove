import { describe, it, expect } from "vitest";
import { getModelsForProviders } from "./model-service";
import { PROVIDER_METAS } from "./provider-meta";
import type { Provider, ProviderType, ProviderConfig } from "@/db/types";

/**
 * Integration-style tests for the full provider→model pipeline.
 * Simulates the data flow: DB provider row → getModelsForProviders → ModelInfo[]
 *
 * This tests the exact same code path as the ModelSelector component:
 *   1. loadProviders() → reads Provider[] from DB
 *   2. enabledProviders = providers.filter(p => p.enabled)
 *   3. getModelsForProviders(enabledProviders) → ModelInfo[]
 */

/** Simulate a DB row as returned by providerRepo.getAll() */
function dbRow(overrides: Partial<Provider> & { type: ProviderType }): Provider {
  return {
    id: crypto.randomUUID(),
    name: PROVIDER_METAS[overrides.type].displayName,
    api_key: "sk-test-key",
    base_url: PROVIDER_METAS[overrides.type].defaultBaseUrl ?? "",
    enabled: 1,
    config: null as unknown as string | undefined,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Provider → Model pipeline (end-to-end logic)", () => {
  describe("DeepSeek provider", () => {
    it("returns models for a newly-configured DeepSeek provider (no cached_models)", () => {
      // This simulates what happens right after save() creates the provider:
      // config is null because DeepSeek has no special config fields
      const provider = dbRow({
        type: "deepseek",
        api_key: "sk-97b6d795074c4ad4ba88f1af10605238",
        config: undefined,
      });

      // Simulate ModelSelector: filter enabled → get models
      const enabled = [provider].filter((p) => p.enabled);
      const models = getModelsForProviders(enabled);

      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
      expect(models[0]!.provider_id).toBe(provider.id);
      expect(models[0]!.provider_name).toBe("DeepSeek");
      expect(models[0]!.provider_type).toBe("deepseek");
    });

    it("returns models when config is null (DB stores NULL)", () => {
      const provider = dbRow({
        type: "deepseek",
        config: null as unknown as string | undefined,
      });

      const models = getModelsForProviders([provider]);
      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    });

    it("returns cached models when config has cached_models", () => {
      const cfg: ProviderConfig = {
        cached_models: ["deepseek-chat", "deepseek-reasoner"],
        cached_models_at: new Date().toISOString(),
      };
      const provider = dbRow({
        type: "deepseek",
        config: JSON.stringify(cfg),
      });

      const models = getModelsForProviders([provider]);
      expect(models).toHaveLength(2);
    });

    it("falls back to knownModels when cached_models is empty", () => {
      const cfg: ProviderConfig = { cached_models: [] };
      const provider = dbRow({
        type: "deepseek",
        config: JSON.stringify(cfg),
      });

      const models = getModelsForProviders([provider]);
      expect(models).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    });
  });

  describe("Multiple providers", () => {
    it("returns models from all enabled providers", () => {
      const providers = [
        dbRow({ type: "deepseek", id: "ds-1" }),
        dbRow({ type: "anthropic", id: "ant-1" }),
        dbRow({ type: "openai", id: "oai-1" }),
        dbRow({ type: "minimax", id: "mm-1" }),
      ];

      const models = getModelsForProviders(providers);

      const dsModels = models.filter((m) => m.provider_type === "deepseek");
      const antModels = models.filter((m) => m.provider_type === "anthropic");
      const oaiModels = models.filter((m) => m.provider_type === "openai");
      const mmModels = models.filter((m) => m.provider_type === "minimax");

      expect(dsModels).toHaveLength(PROVIDER_METAS.deepseek.knownModels.length);
      expect(antModels).toHaveLength(PROVIDER_METAS.anthropic.knownModels.length);
      expect(oaiModels).toHaveLength(PROVIDER_METAS.openai.knownModels.length);
      expect(mmModels).toHaveLength(PROVIDER_METAS.minimax.knownModels.length);
    });

    it("skips disabled providers", () => {
      const providers = [
        dbRow({ type: "deepseek", id: "ds-1", enabled: 1 }),
        dbRow({ type: "anthropic", id: "ant-1", enabled: 0 }),
      ];

      const models = getModelsForProviders(providers);
      expect(models.every((m) => m.provider_type === "deepseek")).toBe(true);
    });
  });

  describe("Provider config edge cases", () => {
    it("handles config with only disabled_models", () => {
      const cfg: ProviderConfig = {
        disabled_models: ["deepseek-reasoner"],
      };
      const provider = dbRow({
        type: "deepseek",
        config: JSON.stringify(cfg),
      });

      const models = getModelsForProviders([provider]);
      expect(models).toHaveLength(1);
      expect(models[0]!.id).toBe("deepseek-chat");
    });

    it("handles config that is empty JSON object", () => {
      const provider = dbRow({
        type: "deepseek",
        config: "{}",
      });

      const models = getModelsForProviders([provider]);
      expect(models).toHaveLength(2);
    });

    it("handles config that is invalid JSON", () => {
      const provider = dbRow({
        type: "deepseek",
        config: "{invalid json",
      });

      const models = getModelsForProviders([provider]);
      // Falls back to knownModels via parseConfig catch clause
      expect(models).toHaveLength(2);
    });
  });

  describe("Simulates ModelSelector filtering chain", () => {
    it("full ModelSelector chain: providers.filter → getModelsForProviders → grouped by provider", () => {
      // Simulate what dataStore.loadProviders() returns from DB
      const allProviders: Provider[] = [
        dbRow({ type: "deepseek", id: "ds-1", enabled: 1 }),
        dbRow({ type: "anthropic", id: "ant-1", enabled: 1 }),
        dbRow({ type: "ollama", id: "ol-1", enabled: 0 }), // disabled
      ];

      // ModelSelector: enabledProviders
      const enabledProviders = allProviders.filter((p) => p.enabled);
      expect(enabledProviders).toHaveLength(2);

      // ModelSelector: getModelsForProviders
      const models = getModelsForProviders(enabledProviders);
      expect(models.length).toBeGreaterThan(0);

      // ModelSelector: grouped by provider
      const grouped: Record<string, typeof models> = {};
      for (const model of models) {
        const key = model.provider_name;
        if (!grouped[key]) grouped[key] = [];
        grouped[key]!.push(model);
      }

      expect(Object.keys(grouped)).toContain("DeepSeek");
      expect(Object.keys(grouped)).toContain("Anthropic");
      expect(Object.keys(grouped)).not.toContain("Ollama");
    });
  });

  describe("Every built-in provider with knownModels returns models", () => {
    const typesWithKnownModels: ProviderType[] = [
      "aliyun",
      "anthropic",
      "deepseek",
      "google",
      "groq",
      "mistral",
      "minimax",
      "openai",
      "openrouter",
      "perplexity",
      "tencent-cloud",
      "together",
      "volcengine-ark",
      "xai",
    ];

    for (const type of typesWithKnownModels) {
      it(`${type}: returns knownModels when no cached_models`, () => {
        const provider = dbRow({ type });
        const models = getModelsForProviders([provider]);
        expect(models.length).toBe(PROVIDER_METAS[type].knownModels.length);
        expect(models.length).toBeGreaterThan(0);
      });
    }
  });
});
