import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/stores/dataStore", () => ({
  useDataStore: {
    getState: vi.fn().mockReturnValue({
      providers: [],
      updateProvider: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock("@/lib/ai/model-verify", () => ({
  verifyApiKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai/model-service", () => ({
  getModelOption: vi.fn(),
  verifyAndFetchModels: vi.fn(),
}));
vi.mock("@/lib/ai/provider-factory", () => ({
  getModel: vi.fn(),
}));
vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((def: Record<string, unknown>) => def),
}));

import { useDataStore } from "@/stores/dataStore";
import { emit } from "@tauri-apps/api/event";
import {
  getModelOption,
  verifyAndFetchModels,
} from "@/lib/ai/model-service";
import { getModel } from "@/lib/ai/provider-factory";
import { generateText } from "ai";
import { handleProvider } from "./settings-provider-handler";
import type { Provider } from "@/db/types";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "DeepSeek",
    type: "deepseek",
    enabled: 1,
    api_key: "sk-1234567890abcdef",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function mockProviders(providers: Provider[]) {
  vi.mocked(useDataStore.getState).mockReturnValue({
    ...useDataStore.getState(),
    providers,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("handleProvider - list/get/set", () => {
  it("list shows providers", async () => {
    mockProviders([makeProvider()]);
    const result = await handleProvider({ action: "list" });
    expect(result).toContain("DeepSeek");
    expect(result).toContain("sk-1...cdef");
  });

  it("list shows no providers message", async () => {
    mockProviders([]);
    const result = await handleProvider({ action: "list" });
    expect(result).toContain("No providers");
  });

  it("get returns provider info", async () => {
    mockProviders([makeProvider()]);
    const result = await handleProvider({
      action: "get",
      provider_type: "deepseek",
    });
    expect(result).toContain("DeepSeek");
    expect(result).toContain("deepseek");
  });

  it("get returns not found for unknown provider", async () => {
    mockProviders([makeProvider()]);
    const result = await handleProvider({
      action: "get",
      provider_type: "unknown",
      key: "enabled",
    });
    expect(result).toContain("not found");
  });

  it("set enabled=false emits provider-disabled", async () => {
    mockProviders([makeProvider()]);
    await handleProvider({
      action: "set",
      provider_type: "deepseek",
      key: "enabled",
      value: "false",
    });
    expect(emit).toHaveBeenCalledWith("provider-disabled", {
      providerId: "p1",
    });
  });
});

describe("handleProvider - validate", () => {
  it("connection OK with models and capabilities (always hits API)", async () => {
    const provider = makeProvider();
    mockProviders([provider]);
    vi.mocked(verifyAndFetchModels).mockResolvedValue([
      "deepseek-chat",
      "deepseek-coder",
    ]);
    vi.mocked(getModelOption).mockImplementation((_p, modelId) => {
      if (modelId === "deepseek-chat")
        return { tool_calling: true, reasoning: true };
      return undefined;
    });

    const result = await handleProvider({
      action: "validate",
      provider_type: "deepseek",
    });
    expect(result).toContain("connection OK");
    expect(result).toContain("deepseek-chat");
    expect(result).toContain("tool_calling=true");
    expect(result).toContain("deepseek-coder");
    expect(verifyAndFetchModels).toHaveBeenCalledWith(provider);
  });

  it("connection failed returns error", async () => {
    mockProviders([makeProvider()]);
    vi.mocked(verifyAndFetchModels).mockRejectedValue(
      new Error("Invalid API key"),
    );

    const result = await handleProvider({
      action: "validate",
      provider_type: "deepseek",
    });
    expect(result).toContain("FAILED");
    expect(result).toContain("Invalid API key");
  });

  it("provider not found", async () => {
    mockProviders([makeProvider()]);
    const result = await handleProvider({
      action: "validate",
      provider_type: "openai",
    });
    expect(result).toContain("not found");
  });
});

describe("handleProvider - fetch_models", () => {
  it("returns model list and updates cache", async () => {
    mockProviders([makeProvider({ config: "{}" })]);
    vi.mocked(verifyAndFetchModels).mockResolvedValue([
      "deepseek-chat",
      "deepseek-coder",
    ]);

    const result = await handleProvider({
      action: "fetch_models",
      provider_type: "deepseek",
    });
    expect(result).toContain("Fetched 2 models");
    expect(result).toContain("deepseek-chat");

    const updateCall = vi.mocked(useDataStore.getState().updateProvider);
    expect(updateCall).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ config: expect.any(String) }),
    );
    const savedConfig = JSON.parse(updateCall.mock.calls[0]![1].config!);
    expect(savedConfig.cached_models).toEqual([
      "deepseek-chat",
      "deepseek-coder",
    ]);
    expect(savedConfig.cached_models_at).toBeDefined();
  });

  it("handles moonshot-style response with modelOptions", async () => {
    mockProviders([makeProvider({ type: "moonshot", name: "Moonshot" })]);
    vi.mocked(verifyAndFetchModels).mockResolvedValue({
      modelIds: ["moonshot-v1"],
      modelOptions: { "moonshot-v1": { context_window: 128000 } },
    });

    const result = await handleProvider({
      action: "fetch_models",
      provider_type: "moonshot",
    });
    expect(result).toContain("Fetched 1 models");

    const updateCall = vi.mocked(useDataStore.getState().updateProvider);
    const savedConfig = JSON.parse(updateCall.mock.calls[0]![1].config!);
    expect(savedConfig.model_options["moonshot-v1"].context_window).toBe(
      128000,
    );
  });

  it("provider not found", async () => {
    mockProviders([]);
    const result = await handleProvider({
      action: "fetch_models",
      provider_type: "openai",
    });
    expect(result).toContain("not found");
  });
});

describe("handleProvider - probe", () => {
  const fakeModel = {} as ReturnType<typeof getModel>;

  beforeEach(() => {
    vi.mocked(getModel).mockReturnValue(fakeModel);
    mockProviders([makeProvider({ config: "{}" })]);
  });

  it("detects tool_calling=true only when model emits a tool call", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "",
      reasoning: undefined,
      toolCalls: [{ toolName: "ping", args: { msg: "ok" } }],
    } as never);

    const result = await handleProvider({
      action: "probe",
      provider_type: "deepseek",
      model_id: "deepseek-chat",
    });
    expect(result).toContain("tool_calling: supported");
    expect(result).toContain("Capabilities saved");
  });

  it("detects tool_calling=false when model returns without tool calls", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "ok",
      reasoning: undefined,
      toolCalls: [],
    } as never);

    const result = await handleProvider({
      action: "probe",
      provider_type: "deepseek",
      model_id: "deepseek-chat",
    });
    expect(result).toContain("tool_calling: not supported");
  });

  it("detects tool_calling=false when tool call throws", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("tools not supported"))
      .mockResolvedValueOnce({ text: "ok", reasoning: undefined } as never);

    const result = await handleProvider({
      action: "probe",
      provider_type: "deepseek",
      model_id: "deepseek-chat",
    });
    expect(result).toContain("tool_calling: not supported");
  });

  it("detects reasoning from result.reasoning", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "",
      reasoning: "thinking...",
      toolCalls: [{ toolName: "ping", args: { msg: "ok" } }],
    } as never);

    const result = await handleProvider({
      action: "probe",
      provider_type: "deepseek",
      model_id: "deepseek-reasoner",
    });
    expect(result).toContain("tool_calling: supported");
    expect(result).toContain("reasoning: supported");
  });

  it("returns unreachable when both calls fail", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error("tools not supported"))
      .mockRejectedValueOnce(new Error("model not found"));

    const result = await handleProvider({
      action: "probe",
      provider_type: "deepseek",
      model_id: "bad-model",
    });
    expect(result).toContain("unreachable");
    expect(result).toContain("model not found");
  });

  it("requires model_id parameter", async () => {
    const result = await handleProvider({
      action: "probe",
      provider_type: "deepseek",
    });
    expect(result).toContain("model_id is required");
  });

  it("persists detected capabilities to config.model_options", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "",
      reasoning: "thought",
      toolCalls: [{ toolName: "ping", args: { msg: "ok" } }],
    } as never);

    await handleProvider({
      action: "probe",
      provider_type: "deepseek",
      model_id: "deepseek-chat",
    });

    const updateCall = vi.mocked(useDataStore.getState().updateProvider);
    expect(updateCall).toHaveBeenCalled();
    const savedConfig = JSON.parse(updateCall.mock.calls[0]![1].config!);
    expect(savedConfig.model_options["deepseek-chat"]).toEqual({
      tool_calling: true,
      reasoning: true,
    });
  });
});
