import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Provider } from "@/db/types";

// vi.hoisted ensures these values are available inside vi.mock factory functions
const { mockModel, mockProvider } = vi.hoisted(() => {
  const mockModel = { _tag: "mock-model" };
  const mockProvider = Object.assign(vi.fn(() => mockModel), {
    chat: vi.fn(() => mockModel),
    chatModel: vi.fn(() => mockModel),
  });
  return { mockModel, mockProvider };
});

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn(() => mockProvider) }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: vi.fn(() => mockProvider) }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn(() => mockProvider) }));
vi.mock("@ai-sdk/amazon-bedrock", () => ({ createAmazonBedrock: vi.fn(() => mockProvider) }));
vi.mock("@ai-sdk/deepseek", () => ({ createDeepSeek: vi.fn(() => mockProvider) }));
vi.mock("@ai-sdk/moonshotai", () => ({ createMoonshotAI: vi.fn(() => mockProvider) }));

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { getModel } from "@/lib/ai/provider-factory";

function makeProvider(type: Provider["type"], overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "Test Provider",
    type,
    api_key: "test-key",
    base_url: "",
    enabled: 1,
    config: undefined,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    ...overrides,
  };
}

describe("getModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider.mockReturnValue(mockModel);
    mockProvider.chat.mockReturnValue(mockModel);
    mockProvider.chatModel.mockReturnValue(mockModel);
  });

  it("openai: uses createOpenAI and calls provider(modelId)", () => {
    const provider = makeProvider("openai");
    const result = getModel(provider, "gpt-4o");
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "test-key", baseURL: undefined });
    expect(mockProvider).toHaveBeenCalledWith("gpt-4o");
    expect(result).toBe(mockModel);
  });

  it("openai: passes base_url when set", () => {
    const provider = makeProvider("openai", { base_url: "https://my-proxy.com/v1" });
    getModel(provider, "gpt-4o");
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/v1",
    });
  });

  it("anthropic: uses createAnthropic and calls provider(modelId)", () => {
    const provider = makeProvider("anthropic");
    const result = getModel(provider, "claude-3-5-sonnet-20241022");
    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: "test-key", baseURL: undefined });
    expect(mockProvider).toHaveBeenCalledWith("claude-3-5-sonnet-20241022");
    expect(result).toBe(mockModel);
  });

  it("google: uses createGoogleGenerativeAI and calls provider(modelId)", () => {
    const provider = makeProvider("google");
    const result = getModel(provider, "gemini-2.0-flash");
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: "test-key", baseURL: undefined });
    expect(mockProvider).toHaveBeenCalledWith("gemini-2.0-flash");
    expect(result).toBe(mockModel);
  });

  it("deepseek: uses createDeepSeek and calls .chat(modelId)", () => {
    const provider = makeProvider("deepseek");
    const result = getModel(provider, "deepseek-chat");
    expect(createDeepSeek).toHaveBeenCalledWith({ apiKey: "test-key", baseURL: undefined });
    expect(mockProvider.chat).toHaveBeenCalledWith("deepseek-chat");
    expect(result).toBe(mockModel);
  });

  it("moonshot: uses createMoonshotAI, appends /v1, calls .chatModel(modelId)", () => {
    const provider = makeProvider("moonshot", { base_url: "https://api.moonshot.cn" });
    const result = getModel(provider, "moonshot-v1-8k");
    expect(createMoonshotAI).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://api.moonshot.cn/v1",
    });
    expect(mockProvider.chatModel).toHaveBeenCalledWith("moonshot-v1-8k");
    expect(result).toBe(mockModel);
  });

  it("moonshot: does not double-append /v1 when URL already ends with /v1", () => {
    const provider = makeProvider("moonshot", { base_url: "https://api.moonshot.cn/v1" });
    getModel(provider, "moonshot-v1-8k");
    expect(createMoonshotAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.moonshot.cn/v1" }),
    );
  });

  it("bedrock: uses createAmazonBedrock with aws_region from config", () => {
    const provider = makeProvider("bedrock", {
      config: JSON.stringify({
        aws_region: "eu-west-1",
        aws_access_key_id: "AK123",
        aws_secret_access_key: "SK456",
      }),
    });
    const result = getModel(provider, "anthropic.claude-3-5-sonnet-20241022-v2:0");
    expect(createAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({ region: "eu-west-1" }),
    );
    expect(result).toBe(mockModel);
  });

  it("bedrock: defaults to us-east-1 when no aws_region in config", () => {
    const provider = makeProvider("bedrock", { config: "{}" });
    getModel(provider, "amazon.nova-pro-v1:0");
    expect(createAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({ region: "us-east-1" }),
    );
  });

  it("ollama: uses createOpenAI and appends /v1 to base_url", () => {
    const provider = makeProvider("ollama", { base_url: "http://localhost:11434" });
    getModel(provider, "llama3");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://localhost:11434/v1" }),
    );
    expect(mockProvider).toHaveBeenCalledWith("llama3");
  });

  it("ollama: uses default localhost URL when base_url is empty", () => {
    const provider = makeProvider("ollama", { base_url: "" });
    getModel(provider, "llama3");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "http://localhost:11434/v1" }),
    );
  });

  it("aliyun: uses createOpenAI with given base_url and calls .chat(modelId)", () => {
    const provider = makeProvider("aliyun", {
      base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    getModel(provider, "qwen-plus");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" }),
    );
    expect(mockProvider.chat).toHaveBeenCalledWith("qwen-plus");
  });

  it("aliyun: uses default dashscope URL when base_url is empty", () => {
    const provider = makeProvider("aliyun", { base_url: "" });
    getModel(provider, "qwen-plus");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" }),
    );
  });

  it("minimax: normalizes URL and calls .chat(modelId)", () => {
    const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com" });
    getModel(provider, "MiniMax-M2.5");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.minimaxi.com/v1" }),
    );
    expect(mockProvider.chat).toHaveBeenCalledWith("MiniMax-M2.5");
  });

  it("minimax: strips trailing /v1 before re-adding it (no double /v1)", () => {
    const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com/v1" });
    getModel(provider, "MiniMax-M2.5");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.minimaxi.com/v1" }),
    );
  });

  it("minimax: strips trailing slash before normalization", () => {
    const provider = makeProvider("minimax", { base_url: "https://api.minimaxi.com/" });
    getModel(provider, "MiniMax-M2.5");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: "https://api.minimaxi.com/v1" }),
    );
  });

  it("custom: uses api_key from provider", () => {
    const provider = makeProvider("custom", {
      api_key: "custom-key",
      base_url: "https://my-custom.api.com",
    });
    getModel(provider, "custom-model");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "custom-key" }),
    );
    expect(mockProvider).toHaveBeenCalledWith("custom-model");
  });

  it("custom: falls back to 'no-key' when api_key is empty", () => {
    const provider = makeProvider("custom", { api_key: "" });
    getModel(provider, "custom-model");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "no-key" }),
    );
  });

  it("github-models: uses createOpenAI with no-key fallback", () => {
    const provider = makeProvider("github-models", { api_key: "" });
    getModel(provider, "gpt-4o");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "no-key" }),
    );
  });

  it("github-copilot: uses createOpenAI with provided api_key", () => {
    const provider = makeProvider("github-copilot", { api_key: "gh-token" });
    getModel(provider, "gpt-4o");
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "gh-token" }),
    );
    expect(mockProvider).toHaveBeenCalledWith("gpt-4o");
  });

  it("unknown type: throws Unsupported provider type error", () => {
    const provider = { ...makeProvider("openai"), type: "unknown-provider" as Provider["type"] };
    expect(() => getModel(provider, "some-model")).toThrow(
      "Unsupported provider type: unknown-provider",
    );
  });
});
