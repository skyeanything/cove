import { readConfig, writeConfig } from "@/lib/config";
import type {
  AppearanceConfig,
  GeneralConfig,
  LayoutConfig,
  SkillsConfig,
} from "@/lib/config/types";
import { useThemeStore } from "@/stores/themeStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  useSkillsStore,
  getEnabledSkillNames,
  setEnabledSkillNames,
} from "@/stores/skillsStore";
import { useDataStore } from "@/stores/dataStore";
import { assistantRepo } from "@/db/repos/assistantRepo";
import { verifyApiKey } from "@/lib/ai/model-verify";
import { emit } from "@tauri-apps/api/event";
import { i18n } from "@/i18n";

interface SettingsInput {
  action: "get" | "set" | "list";
  category: string;
  key?: string;
  value?: string;
  provider_type?: string;
  assistant_name?: string;
}

export async function handleSettings(input: SettingsInput): Promise<string> {
  switch (input.category) {
    case "appearance":
      return handleAppearance(input);
    case "layout":
      return handleLayout(input);
    case "general":
      return handleGeneral(input);
    case "skills":
      return handleSkills(input);
    case "provider":
      return handleProvider(input);
    case "assistant":
      return handleAssistant(input);
    default:
      return `Unknown category: ${input.category}`;
  }
}

async function handleAppearance(input: SettingsInput): Promise<string> {
  const config = await readConfig<AppearanceConfig>("appearance");

  if (input.action === "list" || (input.action === "get" && !input.key)) {
    return `Appearance settings:\n- theme: ${config.theme} (valid: light, dark, system)`;
  }

  if (input.action === "get") {
    if (input.key === "theme") return `theme: ${config.theme}`;
    return `Unknown key: ${input.key}`;
  }

  if (input.action === "set") {
    if (input.key !== "theme") return `Unknown key: ${input.key}`;
    const v = input.value;
    if (v !== "light" && v !== "dark" && v !== "system") {
      return `Invalid value "${v}". Must be: light, dark, system`;
    }
    useThemeStore.getState().setTheme(v);
    return `Theme set to: ${v}`;
  }

  return `Unknown action: ${input.action}`;
}

async function handleLayout(input: SettingsInput): Promise<string> {
  const config = await readConfig<LayoutConfig>("layout");

  if (input.action === "list" || (input.action === "get" && !input.key)) {
    return [
      "Layout settings:",
      `- leftSidebarOpen: ${config.leftSidebarOpen}`,
      `- leftSidebarWidth: ${config.leftSidebarWidth}`,
      `- chatWidth: ${config.chatWidth}`,
      `- filePanelOpen: ${config.filePanelOpen}`,
      `- fileTreeWidth: ${config.fileTreeWidth}`,
      `- filePreviewWidth: ${config.filePreviewWidth}`,
      `- fileTreeShowHidden: ${config.fileTreeShowHidden}`,
    ].join("\n");
  }

  if (input.action === "get") {
    const val = config[input.key as keyof LayoutConfig];
    if (val === undefined) return `Unknown key: ${input.key}`;
    return `${input.key}: ${val}`;
  }

  if (input.action === "set") {
    return setLayoutKey(input.key, input.value, config);
  }

  return `Unknown action: ${input.action}`;
}

function setLayoutKey(
  key: string | undefined,
  value: string | undefined,
  config: LayoutConfig,
): string {
  if (!key || !value) return "key and value are required";
  const store = useLayoutStore.getState();

  switch (key) {
    case "leftSidebarOpen": {
      const open = parseBool(value);
      if (open === null) return `Invalid boolean: ${value}`;
      if (open !== config.leftSidebarOpen) store.toggleLeftSidebar();
      return `leftSidebarOpen set to: ${open}`;
    }
    case "leftSidebarWidth": {
      const n = parseNumber(value);
      if (n === null) return `Invalid number: ${value}`;
      store.setLeftSidebarWidth(n);
      return `leftSidebarWidth set to: ${n}`;
    }
    case "chatWidth": {
      const n = parseNumber(value);
      if (n === null) return `Invalid number: ${value}`;
      store.setChatWidth(n);
      return `chatWidth set to: ${n}`;
    }
    case "filePanelOpen": {
      const open = parseBool(value);
      if (open === null) return `Invalid boolean: ${value}`;
      if (open !== config.filePanelOpen) store.toggleFilePanel();
      return `filePanelOpen set to: ${open}`;
    }
    case "fileTreeWidth": {
      const n = parseNumber(value);
      if (n === null) return `Invalid number: ${value}`;
      store.setFileTreeWidth(n);
      return `fileTreeWidth set to: ${n}`;
    }
    case "filePreviewWidth": {
      const n = parseNumber(value);
      if (n === null) return `Invalid number: ${value}`;
      store.setFilePreviewWidth(n);
      return `filePreviewWidth set to: ${n}`;
    }
    case "fileTreeShowHidden": {
      const show = parseBool(value);
      if (show === null) return `Invalid boolean: ${value}`;
      store.setFileTreeShowHidden(show);
      return `fileTreeShowHidden set to: ${show}`;
    }
    default:
      return `Unknown layout key: ${key}`;
  }
}

async function handleGeneral(input: SettingsInput): Promise<string> {
  const config = await readConfig<GeneralConfig>("general");

  if (input.action === "list" || (input.action === "get" && !input.key)) {
    return [
      "General settings:",
      `- locale: ${config.locale} (valid: zh, en)`,
      `- sendShortcut: ${config.sendShortcut} (valid: enter, modifierEnter)`,
    ].join("\n");
  }

  if (input.action === "get") {
    if (input.key === "locale") return `locale: ${config.locale}`;
    if (input.key === "sendShortcut")
      return `sendShortcut: ${config.sendShortcut}`;
    return `Unknown key: ${input.key}`;
  }

  if (input.action === "set") {
    if (input.key === "locale") {
      const v = input.value;
      if (v !== "zh" && v !== "en") {
        return `Invalid locale "${v}". Must be: zh, en`;
      }
      await writeConfig("general", { ...config, locale: v });
      i18n.changeLanguage(v);
      return `Locale set to: ${v}`;
    }
    if (input.key === "sendShortcut") {
      const v = input.value;
      if (v !== "enter" && v !== "modifierEnter") {
        return `Invalid sendShortcut "${v}". Must be: enter, modifierEnter`;
      }
      useSettingsStore.getState().setSendMessageShortcut(v);
      return `Send shortcut set to: ${v}`;
    }
    return `Unknown key: ${input.key}`;
  }

  return `Unknown action: ${input.action}`;
}

async function handleSkills(input: SettingsInput): Promise<string> {
  if (input.action === "list" || (input.action === "get" && !input.key)) {
    const enabled = await getEnabledSkillNames();
    const config = await readConfig<SkillsConfig>("skills");
    return [
      "Skills settings:",
      `- enabled: ${enabled.join(", ") || "(none)"}`,
      `- dirPaths: ${config.dirPaths.join(", ") || "(none)"}`,
    ].join("\n");
  }

  if (input.action === "get") {
    if (input.key === "enabled") {
      const enabled = await getEnabledSkillNames();
      return `enabled: ${enabled.join(", ") || "(none)"}`;
    }
    if (input.key === "dirPaths") {
      const config = await readConfig<SkillsConfig>("skills");
      return `dirPaths: ${config.dirPaths.join(", ") || "(none)"}`;
    }
    return `Unknown key: ${input.key}`;
  }

  if (input.action === "set") {
    if (input.key === "enabled" && input.value) {
      const names = input.value.split(",").map((s) => s.trim()).filter(Boolean);
      await setEnabledSkillNames(names);
      useSkillsStore.setState({ enabledSkillNames: names });
      return `Enabled skills set to: ${names.join(", ")}`;
    }
    return `Unknown key or missing value: ${input.key}`;
  }

  return `Unknown action: ${input.action}`;
}

async function handleProvider(input: SettingsInput): Promise<string> {
  const providers = useDataStore.getState().providers;

  if (input.action === "list" || (input.action === "get" && !input.key)) {
    if (providers.length === 0) return "No providers configured.";
    const lines = providers.map(
      (p) =>
        `- ${p.name} (type: ${p.type}, enabled: ${!!p.enabled}, api_key: ${maskApiKey(p.api_key)})`,
    );
    return `Providers:\n${lines.join("\n")}`;
  }

  const provider = input.provider_type
    ? providers.find((p) => p.type === input.provider_type)
    : null;

  if (input.action === "get") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    if (!input.key)
      return `${provider.name}: type=${provider.type}, enabled=${!!provider.enabled}, api_key=${maskApiKey(provider.api_key)}`;
    if (input.key === "enabled") return `enabled: ${!!provider.enabled}`;
    if (input.key === "api_key")
      return `api_key: ${maskApiKey(provider.api_key)}`;
    if (input.key === "base_url")
      return `base_url: ${provider.base_url ?? "(default)"}`;
    return `Unknown key: ${input.key}`;
  }

  if (input.action === "set") {
    if (!provider) {
      return `Provider not found: ${input.provider_type}. Available: ${providers.map((p) => p.type).join(", ")}`;
    }
    if (input.key === "enabled") {
      const enabled = parseBool(input.value ?? "");
      if (enabled === null) return `Invalid boolean: ${input.value}`;
      await useDataStore.getState().updateProvider(provider.id, {
        enabled: enabled ? 1 : 0,
      });
      if (!enabled) await emit("provider-disabled", { providerId: provider.id });
      return `Provider ${provider.name} ${enabled ? "enabled" : "disabled"}.`;
    }
    if (input.key === "api_key") {
      if (!input.value) return "API key value is required.";
      try {
        await verifyApiKey({ ...provider, api_key: input.value });
      } catch (err) {
        return `API key verification failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      await useDataStore.getState().updateProvider(provider.id, {
        api_key: input.value,
      });
      return `API key updated for ${provider.name}.`;
    }
    if (input.key === "base_url") {
      await useDataStore.getState().updateProvider(provider.id, {
        base_url: input.value ?? "",
      });
      return `Base URL updated for ${provider.name}.`;
    }
    return `Unknown key: ${input.key}`;
  }

  return `Unknown action: ${input.action}`;
}

async function handleAssistant(input: SettingsInput): Promise<string> {
  const assistants = useDataStore.getState().assistants;

  if (input.action === "list" || (input.action === "get" && !input.key)) {
    if (assistants.length === 0) return "No assistants configured.";
    const lines = assistants.map(
      (a) =>
        `- ${a.name} (model: ${a.model ?? "default"}, temperature: ${a.temperature}, tools: ${!!a.tools_enabled})`,
    );
    return `Assistants:\n${lines.join("\n")}`;
  }

  const assistant = input.assistant_name
    ? assistants.find(
        (a) => a.name.toLowerCase() === input.assistant_name?.toLowerCase(),
      )
    : null;

  if (input.action === "get") {
    if (!assistant) {
      return `Assistant not found: "${input.assistant_name}". Available: ${assistants.map((a) => a.name).join(", ")}`;
    }
    if (!input.key)
      return `${assistant.name}: model=${assistant.model ?? "default"}, temperature=${assistant.temperature}, top_p=${assistant.top_p}, max_tokens=${assistant.max_tokens ?? "default"}, tools=${!!assistant.tools_enabled}`;
    const val = assistant[input.key as keyof typeof assistant];
    if (val === undefined) return `Unknown key: ${input.key}`;
    return `${input.key}: ${val}`;
  }

  if (input.action === "set") {
    if (!assistant) {
      return `Assistant not found: "${input.assistant_name}". Available: ${assistants.map((a) => a.name).join(", ")}`;
    }
    if (!input.key || input.value === undefined)
      return "key and value are required.";
    return setAssistantKey(assistant.id, input.key, input.value);
  }

  return `Unknown action: ${input.action}`;
}

async function setAssistantKey(
  id: string,
  key: string,
  value: string,
): Promise<string> {
  const numericKeys = [
    "temperature",
    "top_p",
    "max_tokens",
    "frequency_penalty",
    "presence_penalty",
  ];
  const boolKeys = ["tools_enabled", "web_search_enabled"];

  if (numericKeys.includes(key)) {
    const n = parseFloat(value);
    if (isNaN(n)) return `Invalid number: ${value}`;
    await assistantRepo.update(id, { [key]: n });
    await useDataStore.getState().loadAssistants();
    return `${key} set to: ${n}`;
  }

  if (boolKeys.includes(key)) {
    const b = parseBool(value);
    if (b === null) return `Invalid boolean: ${value}`;
    await assistantRepo.update(id, { [key]: b ? 1 : 0 });
    await useDataStore.getState().loadAssistants();
    return `${key} set to: ${b}`;
  }

  if (key === "name" || key === "model" || key === "system_instruction") {
    await assistantRepo.update(id, { [key]: value });
    await useDataStore.getState().loadAssistants();
    return `${key} set to: ${value}`;
  }

  return `Unknown or read-only key: ${key}`;
}

function parseBool(value: string): boolean | null {
  const v = value.toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return null;
}

function parseNumber(value: string): number | null {
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function maskApiKey(key: string | undefined): string {
  if (!key) return "(not set)";
  return key.length <= 8 ? "****" : `${key.slice(0, 4)}...${key.slice(-4)}`;
}
