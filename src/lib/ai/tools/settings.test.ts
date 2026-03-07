import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn().mockResolvedValue(undefined),
  updateConfig: vi.fn(),
}));
vi.mock("@/stores/themeStore", () => ({
  useThemeStore: {
    getState: vi.fn().mockReturnValue({
      setTheme: vi.fn(),
    }),
  },
}));
vi.mock("@/stores/layoutStore", () => ({
  useLayoutStore: {
    getState: vi.fn().mockReturnValue({
      toggleLeftSidebar: vi.fn(),
      setLeftSidebarWidth: vi.fn(),
      setChatWidth: vi.fn(),
      toggleFilePanel: vi.fn(),
      setFileTreeWidth: vi.fn(),
      setFilePreviewWidth: vi.fn(),
      setFileTreeShowHidden: vi.fn(),
      setFilePreviewOpen: vi.fn(),
    }),
  },
}));
vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn().mockReturnValue({
      setSendMessageShortcut: vi.fn(),
    }),
  },
}));
vi.mock("@/stores/skillsStore", () => ({
  useSkillsStore: { setState: vi.fn() },
  getEnabledSkillNames: vi.fn().mockResolvedValue(["skill-a"]),
  setEnabledSkillNames: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/stores/dataStore", () => ({
  useDataStore: {
    getState: vi.fn().mockReturnValue({
      providers: [],
      assistants: [],
      activeConversationId: "conv-1",
      updateProvider: vi.fn().mockResolvedValue(undefined),
      loadAssistants: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: vi.fn().mockReturnValue({
      enableTrustMode: vi.fn(),
      disableTrustMode: vi.fn(),
      requestTrustMode: vi.fn().mockResolvedValue(true),
    }),
  },
}));
vi.mock("@/db/repos/assistantRepo", () => ({
  assistantRepo: { update: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/lib/ai/model-verify", () => ({
  verifyApiKey: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/i18n", () => ({
  i18n: { changeLanguage: vi.fn() },
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

import { readConfig } from "@/lib/config";
import { useThemeStore } from "@/stores/themeStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useDataStore } from "@/stores/dataStore";
import { usePermissionStore } from "@/stores/permissionStore";
import { emit } from "@tauri-apps/api/event";
import { handleSettings } from "./settings-handlers";

beforeEach(() => vi.clearAllMocks());

describe("handleSettings - appearance", () => {
  it("list returns theme info", async () => {
    vi.mocked(readConfig).mockResolvedValue({ theme: "dark" });
    const result = await handleSettings({ action: "list", category: "appearance" });
    expect(result).toContain("theme: dark");
  });

  it("get theme returns current value", async () => {
    vi.mocked(readConfig).mockResolvedValue({ theme: "light" });
    const result = await handleSettings({ action: "get", category: "appearance", key: "theme" });
    expect(result).toBe("theme: light");
  });

  it("set theme calls store", async () => {
    vi.mocked(readConfig).mockResolvedValue({ theme: "light" });
    const result = await handleSettings({
      action: "set", category: "appearance", key: "theme", value: "dark",
    });
    expect(result).toContain("dark");
    expect(useThemeStore.getState().setTheme).toHaveBeenCalledWith("dark");
  });

  it("set theme rejects invalid value", async () => {
    vi.mocked(readConfig).mockResolvedValue({ theme: "light" });
    const result = await handleSettings({
      action: "set", category: "appearance", key: "theme", value: "purple",
    });
    expect(result).toContain("Invalid");
  });
});

describe("handleSettings - layout", () => {
  it("list returns all layout keys", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      leftSidebarOpen: true, leftSidebarWidth: 260, chatWidth: 640,
      filePanelOpen: true, fileTreeWidth: 260, filePreviewWidth: 360,
      fileTreeShowHidden: true,
    });
    const result = await handleSettings({ action: "list", category: "layout" });
    expect(result).toContain("leftSidebarOpen");
    expect(result).toContain("chatWidth");
  });

  it("set chatWidth calls store", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      leftSidebarOpen: true, leftSidebarWidth: 260, chatWidth: 640,
      filePanelOpen: true, fileTreeWidth: 260, filePreviewWidth: 360,
      fileTreeShowHidden: true,
    });
    const result = await handleSettings({
      action: "set", category: "layout", key: "chatWidth", value: "800",
    });
    expect(result).toContain("800");
    expect(useLayoutStore.getState().setChatWidth).toHaveBeenCalledWith(800);
  });

  it("set with invalid number returns error", async () => {
    vi.mocked(readConfig).mockResolvedValue({});
    const result = await handleSettings({
      action: "set", category: "layout", key: "chatWidth", value: "abc",
    });
    expect(result).toContain("Invalid number");
  });
});

describe("handleSettings - general", () => {
  it("list returns locale and sendShortcut", async () => {
    vi.mocked(readConfig).mockResolvedValue({ locale: "zh", sendShortcut: "enter" });
    const result = await handleSettings({ action: "list", category: "general" });
    expect(result).toContain("locale: zh");
    expect(result).toContain("sendShortcut: enter");
  });

  it("set locale rejects invalid value", async () => {
    vi.mocked(readConfig).mockResolvedValue({ locale: "zh", sendShortcut: "enter" });
    const result = await handleSettings({
      action: "set", category: "general", key: "locale", value: "fr",
    });
    expect(result).toContain("Invalid locale");
  });
});

describe("handleSettings - provider", () => {
  it("list shows providers from store", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      providers: [
        { id: "1", name: "OpenAI", type: "openai", enabled: 1, api_key: "sk-1234567890abcdef", created_at: "", updated_at: "" },
      ],
    });
    const result = await handleSettings({ action: "list", category: "provider" });
    expect(result).toContain("OpenAI");
    expect(result).toContain("sk-1...cdef");
  });

  it("list shows no providers message", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      providers: [],
    });
    const result = await handleSettings({ action: "list", category: "provider" });
    expect(result).toContain("No providers");
  });

  it("disabling a provider emits provider-disabled event", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      providers: [
        { id: "p1", name: "OpenAI", type: "openai", enabled: 1, created_at: "", updated_at: "" },
      ],
    });
    await handleSettings({
      action: "set", category: "provider", provider_type: "openai", key: "enabled", value: "false",
    });
    expect(emit).toHaveBeenCalledWith("provider-disabled", { providerId: "p1" });
  });

  it("enabling a provider does not emit provider-disabled event", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      providers: [
        { id: "p1", name: "OpenAI", type: "openai", enabled: 0, created_at: "", updated_at: "" },
      ],
    });
    await handleSettings({
      action: "set", category: "provider", provider_type: "openai", key: "enabled", value: "true",
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("get returns not found for unknown provider", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      providers: [
        { id: "1", name: "OpenAI", type: "openai", enabled: 1, created_at: "", updated_at: "" },
      ],
    });
    const result = await handleSettings({
      action: "get", category: "provider", provider_type: "unknown", key: "enabled",
    });
    expect(result).toContain("not found");
  });
});

describe("handleSettings - assistant", () => {
  it("list shows assistants from store", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [
        {
          id: "a1", name: "Helper", model: "gpt-4", temperature: 0.7,
          top_p: 1, frequency_penalty: 0, presence_penalty: 0,
          web_search_enabled: 0, artifacts_enabled: 0, tools_enabled: 1,
          sort_order: 0, created_at: "", updated_at: "",
        },
      ],
    });
    const result = await handleSettings({ action: "list", category: "assistant" });
    expect(result).toContain("Helper");
  });

  it("get returns not found for unknown assistant", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [
        {
          id: "a1", name: "Helper", model: "gpt-4", temperature: 0.7,
          top_p: 1, frequency_penalty: 0, presence_penalty: 0,
          web_search_enabled: 0, artifacts_enabled: 0, tools_enabled: 1,
          sort_order: 0, created_at: "", updated_at: "",
        },
      ],
    });
    const result = await handleSettings({
      action: "get", category: "assistant", assistant_name: "Unknown", key: "temperature",
    });
    expect(result).toContain("not found");
  });
});

describe("handleSettings - skills", () => {
  it("list returns enabled skills", async () => {
    vi.mocked(readConfig).mockResolvedValue({ enabled: ["a"], dirPaths: [] });
    const result = await handleSettings({ action: "list", category: "skills" });
    expect(result).toContain("skill-a");
  });
});

describe("handleSettings - assistant trust_mode", () => {
  const assistantFixture = {
    id: "a1", name: "Helper", model: "gpt-4", temperature: 0.7,
    top_p: 1, frequency_penalty: 0, presence_penalty: 0,
    web_search_enabled: 0, artifacts_enabled: 0, tools_enabled: 1,
    sort_order: 0, created_at: "", updated_at: "",
  };

  it("setting trust_mode true calls requestTrustMode and awaits user confirmation", async () => {
    vi.mocked(usePermissionStore.getState).mockReturnValue({
      ...usePermissionStore.getState(),
      requestTrustMode: vi.fn().mockResolvedValue(true),
    });
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [assistantFixture],
      activeConversationId: "conv-42",
    });
    const result = await handleSettings({
      action: "set", category: "assistant", assistant_name: "Helper",
      key: "trust_mode", value: "true",
    });
    expect(result).toContain("enabled");
    expect(result).toContain("user confirmed");
    expect(usePermissionStore.getState().requestTrustMode).toHaveBeenCalledWith("conv-42");
  });

  it("setting trust_mode true returns denied when user rejects", async () => {
    vi.mocked(usePermissionStore.getState).mockReturnValue({
      ...usePermissionStore.getState(),
      requestTrustMode: vi.fn().mockResolvedValue(false),
    });
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [assistantFixture],
      activeConversationId: "conv-42",
    });
    const result = await handleSettings({
      action: "set", category: "assistant", assistant_name: "Helper",
      key: "trust_mode", value: "true",
    });
    expect(result).toContain("denied");
  });

  it("setting trust_mode false calls disableTrustMode", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [assistantFixture],
      activeConversationId: "conv-42",
    });
    const result = await handleSettings({
      action: "set", category: "assistant", assistant_name: "Helper",
      key: "trust_mode", value: "false",
    });
    expect(result).toContain("disabled");
    expect(usePermissionStore.getState().disableTrustMode).toHaveBeenCalledWith("conv-42");
  });

  it("returns error when disabling with no active conversation", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [assistantFixture],
      activeConversationId: null,
    });
    const result = await handleSettings({
      action: "set", category: "assistant", assistant_name: "Helper",
      key: "trust_mode", value: "false",
    });
    expect(result).toContain("No active conversation");
  });

  it("returns error for invalid boolean value", async () => {
    vi.mocked(useDataStore.getState).mockReturnValue({
      ...useDataStore.getState(),
      assistants: [assistantFixture],
      activeConversationId: "conv-42",
    });
    const result = await handleSettings({
      action: "set", category: "assistant", assistant_name: "Helper",
      key: "trust_mode", value: "maybe",
    });
    expect(result).toContain("Invalid boolean");
  });
});

describe("handleSettings - unknown category", () => {
  it("returns error for unknown category", async () => {
    const result = await handleSettings({ action: "list", category: "unknown" });
    expect(result).toContain("Unknown category");
  });
});
