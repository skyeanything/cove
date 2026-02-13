import { create } from "zustand";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { workspaceRepo } from "@/db/repos/workspaceRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { appDataDir } from "@tauri-apps/api/path";
import type { Workspace } from "@/db/types";

const ACTIVE_WORKSPACE_KEY = "active_workspace_id";

export function extractName(path: string): string {
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}

interface WorkspaceState {
  /** All saved workspaces */
  workspaces: Workspace[];
  /** Currently active workspace */
  activeWorkspace: Workspace | null;
  initialized: boolean;

  /** Load workspaces from DB, ensure default exists */
  init: () => Promise<void>;
  /** Reload workspace list from DB */
  reload: () => Promise<void>;
  /** Select a workspace as active for the current conversation */
  select: (workspaceId: string, conversationId: string | null) => Promise<void>;
  /** Add a new workspace by path, returns the workspace */
  add: (path: string) => Promise<Workspace>;
  /** Remove a workspace (cannot remove default) */
  remove: (workspaceId: string) => Promise<void>;
  /** Load active workspace when switching conversations */
  loadFromConversation: (conversationId: string) => Promise<void>;
  /** Check if a target path is inside the active workspace */
  containsPath: (target: string) => boolean;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  initialized: false,

  async init() {
    // Ensure default workspace exists
    let defaultWs = await workspaceRepo.getDefault();
    if (!defaultWs) {
      const defaultPath = await appDataDir();
      defaultWs = {
        id: "default",
        name: "Default",
        path: defaultPath,
        is_default: 1,
        created_at: new Date().toISOString(),
      };
      await workspaceRepo.create({
        id: defaultWs.id,
        name: defaultWs.name,
        path: defaultWs.path,
        is_default: 1,
      });
    }

    const workspaces = await workspaceRepo.getAll();

    // Load last active workspace from settings
    const activeId = await settingsRepo.get(ACTIVE_WORKSPACE_KEY);
    const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? defaultWs;

    set({ workspaces, activeWorkspace, initialized: true });
  },

  async reload() {
    const workspaces = await workspaceRepo.getAll();
    set({ workspaces });
  },

  async select(workspaceId: string, conversationId: string | null) {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;

    await settingsRepo.set(ACTIVE_WORKSPACE_KEY, workspaceId);
    if (conversationId) {
      await conversationRepo.update(conversationId, { workspace_path: ws.path });
    }
    set({ activeWorkspace: ws });
  },

  async add(path: string) {
    // If already exists, return existing
    const existing = await workspaceRepo.getByPath(path);
    if (existing) return existing;

    const ws: Omit<Workspace, "created_at"> = {
      id: crypto.randomUUID(),
      name: extractName(path),
      path,
      is_default: 0,
    };
    await workspaceRepo.create(ws);
    await get().reload();
    return { ...ws, created_at: new Date().toISOString() };
  },

  async remove(workspaceId: string) {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws || ws.is_default) return; // Cannot remove default

    await workspaceRepo.delete(workspaceId);

    // If removing the active workspace, fall back to default
    if (get().activeWorkspace?.id === workspaceId) {
      const defaultWs = get().workspaces.find((w) => w.is_default);
      if (defaultWs) {
        await settingsRepo.set(ACTIVE_WORKSPACE_KEY, defaultWs.id);
        set({ activeWorkspace: defaultWs });
      }
    }

    await get().reload();
  },

  async loadFromConversation(conversationId: string) {
    const conv = await conversationRepo.getById(conversationId);
    const path = conv?.workspace_path;
    if (path) {
      const ws = get().workspaces.find((w) => w.path === path);
      if (ws) {
        set({ activeWorkspace: ws });
        return;
      }
    }
    // No workspace on conversation — keep current active
  },

  containsPath(target: string) {
    const ws = get().activeWorkspace;
    if (!ws) return false;
    const normalized = ws.path.endsWith("/") ? ws.path : ws.path + "/";
    return target === ws.path || target.startsWith(normalized);
  },
}));
