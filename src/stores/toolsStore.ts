import { create } from "zustand";
import { settingsRepo } from "@/db/repos/settingsRepo";

const DISABLED_TOOL_IDS_KEY = "disabledToolIds";

/** Read disabled tool IDs from settings DB */
export async function getDisabledToolIds(): Promise<string[]> {
  const raw = await settingsRepo.get(DISABLED_TOOL_IDS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function setDisabledToolIds(ids: string[]): Promise<void> {
  await settingsRepo.set(DISABLED_TOOL_IDS_KEY, JSON.stringify(ids));
}

interface ToolsState {
  disabledToolIds: string[];
  loadDisabledToolIds: () => Promise<void>;
  toggleTool: (toolId: string) => Promise<void>;
}

export const useToolsStore = create<ToolsState>()((set, get) => ({
  disabledToolIds: [],

  loadDisabledToolIds: async () => {
    const ids = await getDisabledToolIds();
    set({ disabledToolIds: ids });
  },

  toggleTool: async (toolId: string) => {
    const prev = get().disabledToolIds;
    const next = prev.includes(toolId)
      ? prev.filter((id) => id !== toolId)
      : [...prev, toolId];
    await setDisabledToolIds(next);
    set({ disabledToolIds: next });
  },
}));
