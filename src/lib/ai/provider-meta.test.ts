import { describe, it, expect } from "vitest";
import { PROVIDER_METAS } from "@/lib/ai/provider-meta";
import { BUILTIN_PROVIDER_TYPES } from "@/lib/ai/provider-meta-types";

describe("PROVIDER_METAS", () => {
  it("contains all ProviderType keys", () => {
    const allTypes = Object.keys(PROVIDER_METAS);
    const expectedTypes = [
      "openai", "aliyun", "anthropic", "google", "ollama",
      "tencent-cloud", "volcengine-ark", "azure", "bedrock",
      "deepseek", "groq", "mistral", "minimax", "moonshot",
      "openrouter", "perplexity", "together", "xai",
      "github-copilot", "github-models", "custom",
    ];
    for (const type of expectedTypes) {
      expect(allTypes).toContain(type);
    }
  });

  it("sets requiresApiKey correctly for key providers", () => {
    expect(PROVIDER_METAS.anthropic.requiresApiKey).toBe(true);
    expect(PROVIDER_METAS.openai.requiresApiKey).toBe(true);
    expect(PROVIDER_METAS.google.requiresApiKey).toBe(true);
    expect(PROVIDER_METAS.deepseek.requiresApiKey).toBe(true);
    expect(PROVIDER_METAS.ollama.requiresApiKey).toBe(false);
    expect(PROVIDER_METAS.bedrock.requiresApiKey).toBe(false);
    expect(PROVIDER_METAS.custom.requiresApiKey).toBe(false);
  });

  it("sets requiresBaseUrl correctly", () => {
    expect(PROVIDER_METAS.ollama.requiresBaseUrl).toBe(true);
    expect(PROVIDER_METAS.azure.requiresBaseUrl).toBe(true);
    expect(PROVIDER_METAS.aliyun.requiresBaseUrl).toBe(true);
    expect(PROVIDER_METAS.minimax.requiresBaseUrl).toBe(true);
    expect(PROVIDER_METAS.custom.requiresBaseUrl).toBe(true);
    expect(PROVIDER_METAS.anthropic.requiresBaseUrl).toBe(false);
    expect(PROVIDER_METAS.openai.requiresBaseUrl).toBe(false);
    expect(PROVIDER_METAS.google.requiresBaseUrl).toBe(false);
  });

  it("provides non-empty knownModels for major providers", () => {
    expect(PROVIDER_METAS.anthropic.knownModels.length).toBeGreaterThan(0);
    expect(PROVIDER_METAS.openai.knownModels.length).toBeGreaterThan(0);
    expect(PROVIDER_METAS.google.knownModels.length).toBeGreaterThan(0);
    expect(PROVIDER_METAS.deepseek.knownModels.length).toBeGreaterThan(0);
    expect(PROVIDER_METAS.minimax.knownModels.length).toBeGreaterThan(0);
    expect(PROVIDER_METAS.azure.knownModels.length).toBeGreaterThan(0);
  });

  it("anthropic knownModelDetails has vision and pdf_native for all models", () => {
    const details = PROVIDER_METAS.anthropic.knownModelDetails;
    expect(details).toBeDefined();
    for (const [, caps] of Object.entries(details!)) {
      expect(caps.vision).toBe(true);
      expect(caps.pdf_native).toBe(true);
    }
  });

  it("google knownModelDetails has vision and pdf_native capabilities", () => {
    const details = PROVIDER_METAS.google.knownModelDetails;
    expect(details).toBeDefined();
    for (const [, caps] of Object.entries(details!)) {
      expect(caps.vision).toBe(true);
      expect(caps.pdf_native).toBe(true);
    }
  });

  it("deepseek knownModelDetails distinguishes reasoning models", () => {
    const details = PROVIDER_METAS.deepseek.knownModelDetails;
    expect(details?.["deepseek-reasoner"]?.reasoning).toBe(true);
    expect(details?.["deepseek-chat"]?.reasoning).toBe(false);
  });

  it("azure has required fields: deployment and api_version", () => {
    const fieldKeys = PROVIDER_METAS.azure.fields.map((f) => f.key);
    expect(fieldKeys).toContain("deployment");
    expect(fieldKeys).toContain("api_version");
  });

  it("aliyun has baseUrlOptions for multiple regions", () => {
    expect(PROVIDER_METAS.aliyun.baseUrlOptions?.length).toBeGreaterThan(1);
  });

  it("minimax has baseUrlOptions for China and international", () => {
    const opts = PROVIDER_METAS.minimax.baseUrlOptions;
    expect(opts?.length).toBeGreaterThan(1);
  });

  it("moonshot has baseUrlOptions for China and international", () => {
    const opts = PROVIDER_METAS.moonshot.baseUrlOptions;
    expect(opts?.length).toBeGreaterThan(1);
  });

  it("every entry has a non-empty displayName", () => {
    for (const [, meta] of Object.entries(PROVIDER_METAS)) {
      expect(meta.displayName).toBeTruthy();
    }
  });

  it("every entry has a knownModels array (may be empty)", () => {
    for (const [, meta] of Object.entries(PROVIDER_METAS)) {
      expect(Array.isArray(meta.knownModels)).toBe(true);
    }
  });

  it("ollama and moonshot have empty knownModels (dynamic fetch)", () => {
    expect(PROVIDER_METAS.ollama.knownModels).toHaveLength(0);
    expect(PROVIDER_METAS.moonshot.knownModels).toHaveLength(0);
  });

  it("custom and github-models have builtIn=false", () => {
    expect(PROVIDER_METAS.custom.builtIn).toBe(false);
    expect(PROVIDER_METAS["github-models"].builtIn).toBe(false);
  });

  it("openai knownModelDetails has vision/pdf_native for gpt-4o models", () => {
    const details = PROVIDER_METAS.openai.knownModelDetails;
    expect(details?.["gpt-4o"]?.vision).toBe(true);
    expect(details?.["gpt-4o"]?.pdf_native).toBe(true);
    expect(details?.["gpt-4o-mini"]?.vision).toBe(true);
  });
});

describe("BUILTIN_PROVIDER_TYPES", () => {
  it("every builtin type exists in PROVIDER_METAS", () => {
    for (const type of BUILTIN_PROVIDER_TYPES) {
      expect(PROVIDER_METAS[type]).toBeDefined();
    }
  });

  it("includes the key Chinese-market providers", () => {
    expect(BUILTIN_PROVIDER_TYPES).toContain("aliyun");
    expect(BUILTIN_PROVIDER_TYPES).toContain("deepseek");
    expect(BUILTIN_PROVIDER_TYPES).toContain("minimax");
    expect(BUILTIN_PROVIDER_TYPES).toContain("moonshot");
    expect(BUILTIN_PROVIDER_TYPES).toContain("tencent-cloud");
    expect(BUILTIN_PROVIDER_TYPES).toContain("volcengine-ark");
  });

  it("includes universal providers", () => {
    expect(BUILTIN_PROVIDER_TYPES).toContain("openai");
    expect(BUILTIN_PROVIDER_TYPES).toContain("ollama");
    expect(BUILTIN_PROVIDER_TYPES).toContain("openrouter");
  });

  it("is an array with no duplicates", () => {
    const seen = new Set<string>();
    for (const type of BUILTIN_PROVIDER_TYPES) {
      expect(seen.has(type)).toBe(false);
      seen.add(type);
    }
  });
});
