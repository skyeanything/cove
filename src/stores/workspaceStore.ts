import { create } from "zustand";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { workspaceRepo } from "@/db/repos/workspaceRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { messageRepo } from "@/db/repos/messageRepo";
import { appDataDir } from "@tauri-apps/api/path";
import type { Workspace } from "@/db/types";

const ACTIVE_WORKSPACE_KEY = "active_workspace_id";

export function extractName(path: string): string {
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}

/** 返回一组绝对路径的最近公共祖先目录。 */
export function findCommonAncestor(paths: string[]): string {
  if (!paths.length) return "";
  const split = paths.map((p) => p.split("/"));
  const minLen = Math.min(...split.map((p) => p.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = split[0]![i];
    if (split.every((p) => p[i] === seg)) common.push(seg!);
    else break;
  }
  return common.join("/") || "/";
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
  /** Rename a workspace */
  rename: (id: string, name: string) => Promise<void>;
  /** Set a workspace as the default */
  setDefault: (id: string) => Promise<void>;
  /** Check if a target path is inside the active workspace */
  containsPath: (target: string) => boolean;
  /**
   * Auto-detect and activate the workspace from a list of absolute file paths.
   * Single folder → that folder. Multi-folder → LCA of all parent dirs.
   * Creates a new workspace entry if the path is not yet registered.
   */
  autoDetectFromPaths: (
    filePaths: string[],
    conversationId?: string | null,
  ) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  workspaces: [],
  activeWorkspace: null,
  initialized: false,

  async init() {
    // Ensure default workspace exists
    let defaultWs = await workspaceRepo.getDefault();
    if (!defaultWs) {
      let defaultPath: string;
      try {
        defaultPath = await appDataDir();
      } catch (e) {
        console.warn("[workspaceStore] appDataDir() failed, using fallback:", e);
        defaultPath = "~/Documents";
      }
      // Check if a workspace with this path already exists (but isn't marked as default)
      const existing = await workspaceRepo.getByPath(defaultPath);
      if (existing) {
        await workspaceRepo.setDefault(existing.id);
        defaultWs = { ...existing, is_default: 1 };
      } else {
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
    }

    const workspaces = await workspaceRepo.getAll();

    // Load last active workspace from settings
    const activeId = await settingsRepo.get(ACTIVE_WORKSPACE_KEY);
    const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? defaultWs;

    set({ workspaces, activeWorkspace, initialized: true });
  },

  async reload() {
    const workspaces = await workspaceRepo.getAll();
    const currentActive = get().activeWorkspace;
    const activeWorkspace = currentActive
      ? workspaces.find((w) => w.id === currentActive.id) ?? workspaces.find((w) => w.is_default) ?? null
      : null;
    set({ workspaces, activeWorkspace });
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

    // Delete all conversations (and their messages) associated with this workspace
    const relatedConvs = await conversationRepo.getByWorkspacePath(ws.path);
    for (const conv of relatedConvs) {
      await messageRepo.deleteByConversation(conv.id);
      await conversationRepo.delete(conv.id);
    }

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

  async rename(id, name) {
    await workspaceRepo.updateName(id, name);
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
      activeWorkspace:
        s.activeWorkspace?.id === id ? { ...s.activeWorkspace, name } : s.activeWorkspace,
    }));
  },

  async setDefault(id) {
    await workspaceRepo.setDefault(id);
    set((s) => ({
      workspaces: s.workspaces.map((w) => ({
        ...w,
        is_default: w.id === id ? 1 : 0,
      })) as Workspace[],
    }));
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

  async autoDetectFromPaths(filePaths, conversationId) {
    if (!filePaths.length) return;

    // Derive unique parent directories from selected file paths
    const parentDirs = [
      ...new Set(filePaths.map((p) => p.substring(0, p.lastIndexOf("/")))),
    ].filter(Boolean);

    if (!parentDirs.length) return;

    // Compute target workspace: single folder or LCA of multiple
    const targetDir =
      parentDirs.length === 1 ? parentDirs[0]! : findCommonAncestor(parentDirs);

    if (!targetDir) return;

    // Reuse an already-registered workspace if path matches exactly
    let ws = get().workspaces.find((w) => w.path === targetDir);
    if (!ws) {
      ws = await get().add(targetDir);
    }

    // Skip if already active
    if (get().activeWorkspace?.id === ws.id) return;

    await get().select(ws.id, conversationId ?? null);
  },
}));
