// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/db/repos/workspaceRepo", () => ({
  workspaceRepo: {
    getDefault: vi.fn(),
    create: vi.fn(),
    getAll: vi.fn(),
    getByPath: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/db/repos/settingsRepo", () => ({
  settingsRepo: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));
vi.mock("@/db/repos/conversationRepo", () => ({
  conversationRepo: {
    getById: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn().mockResolvedValue("/Users/test/.local/share/cove"),
}));

import { useWorkspaceStore, extractName } from "./workspaceStore";
import { workspaceRepo } from "@/db/repos/workspaceRepo";
import { settingsRepo } from "@/db/repos/settingsRepo";
import { conversationRepo } from "@/db/repos/conversationRepo";
import { appDataDir } from "@tauri-apps/api/path";
import { createStoreReset } from "@/test-utils/mock-store";
import type { Workspace } from "@/db/types";

const resetStore = createStoreReset(useWorkspaceStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

// Helper to create a Workspace fixture
function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "My Project",
    path: "/Users/test/projects/my-project",
    is_default: 0,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDefaultWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return makeWorkspace({
    id: "default",
    name: "Default",
    path: "/Users/test/.local/share/cove",
    is_default: 1,
    ...overrides,
  });
}

describe("workspaceStore", () => {
  describe("extractName", () => {
    it("extracts the last path segment", () => {
      expect(extractName("/a/b/project")).toBe("project");
    });

    it("handles trailing slash", () => {
      expect(extractName("/a/b/project/")).toBe("project");
    });

    it("handles root-level path", () => {
      expect(extractName("/project")).toBe("project");
    });

    it("falls back to full path for root slash", () => {
      // "/" → segments[""] last = "" → fallback to path
      expect(extractName("/")).toBe("/");
    });

    it("handles multiple trailing slashes", () => {
      expect(extractName("/a/b/project//")).toBe("project");
    });
  });

  describe("init", () => {
    it("uses existing default workspace if already in DB", async () => {
      const defaultWs = makeDefaultWorkspace();
      vi.mocked(workspaceRepo.getDefault).mockResolvedValue(defaultWs);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([defaultWs]);
      vi.mocked(settingsRepo.get).mockResolvedValue(undefined);

      await useWorkspaceStore.getState().init();

      expect(workspaceRepo.create).not.toHaveBeenCalled();
      expect(useWorkspaceStore.getState().workspaces).toEqual([defaultWs]);
      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(defaultWs);
      expect(useWorkspaceStore.getState().initialized).toBe(true);
    });

    it("creates default workspace when none exists in DB", async () => {
      vi.mocked(workspaceRepo.getDefault).mockResolvedValue(null);
      vi.mocked(workspaceRepo.create).mockResolvedValue(undefined);
      vi.mocked(appDataDir).mockResolvedValue(
        "/Users/test/.local/share/cove",
      );
      const createdWs = makeDefaultWorkspace();
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([createdWs]);
      vi.mocked(settingsRepo.get).mockResolvedValue(undefined);

      await useWorkspaceStore.getState().init();

      expect(workspaceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "default",
          name: "Default",
          path: "/Users/test/.local/share/cove",
          is_default: 1,
        }),
      );
      expect(useWorkspaceStore.getState().initialized).toBe(true);
    });

    it("restores active workspace from settingsRepo", async () => {
      const ws1 = makeWorkspace({ id: "ws-1" });
      const ws2 = makeWorkspace({ id: "ws-2", name: "Other" });
      vi.mocked(workspaceRepo.getDefault).mockResolvedValue(ws1);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([ws1, ws2]);
      vi.mocked(settingsRepo.get).mockResolvedValue("ws-2");

      await useWorkspaceStore.getState().init();

      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(ws2);
    });

    it("falls back to default when saved active id points to deleted workspace", async () => {
      const defaultWs = makeDefaultWorkspace();
      vi.mocked(workspaceRepo.getDefault).mockResolvedValue(defaultWs);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([defaultWs]);
      vi.mocked(settingsRepo.get).mockResolvedValue("ws-deleted");

      await useWorkspaceStore.getState().init();

      // "ws-deleted" not in workspaces → fallback to defaultWs
      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(defaultWs);
    });
  });

  describe("reload", () => {
    it("reloads workspaces list from DB", async () => {
      const ws1 = makeWorkspace({ id: "ws-1" });
      const ws2 = makeWorkspace({ id: "ws-2", name: "Another" });
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([ws1, ws2]);

      await useWorkspaceStore.getState().reload();

      expect(useWorkspaceStore.getState().workspaces).toEqual([ws1, ws2]);
    });
  });

  describe("select", () => {
    it("sets activeWorkspace and persists to settingsRepo", async () => {
      const ws = makeWorkspace({ id: "ws-1" });
      useWorkspaceStore.setState({ workspaces: [ws] });
      vi.mocked(settingsRepo.set).mockResolvedValue(undefined);

      await useWorkspaceStore.getState().select("ws-1", null);

      expect(settingsRepo.set).toHaveBeenCalledWith(
        "active_workspace_id",
        "ws-1",
      );
      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(ws);
    });

    it("updates conversation workspace_path when conversationId is provided", async () => {
      const ws = makeWorkspace({ id: "ws-1", path: "/proj" });
      useWorkspaceStore.setState({ workspaces: [ws] });
      vi.mocked(settingsRepo.set).mockResolvedValue(undefined);
      vi.mocked(conversationRepo.update).mockResolvedValue(undefined);

      await useWorkspaceStore.getState().select("ws-1", "conv-1");

      expect(conversationRepo.update).toHaveBeenCalledWith("conv-1", {
        workspace_path: "/proj",
      });
    });

    it("does not call conversationRepo.update when conversationId is null", async () => {
      const ws = makeWorkspace({ id: "ws-1" });
      useWorkspaceStore.setState({ workspaces: [ws] });
      vi.mocked(settingsRepo.set).mockResolvedValue(undefined);

      await useWorkspaceStore.getState().select("ws-1", null);

      expect(conversationRepo.update).not.toHaveBeenCalled();
    });

    it("does nothing when workspace does not exist", async () => {
      useWorkspaceStore.setState({ workspaces: [] });

      await useWorkspaceStore.getState().select("non-existent", null);

      expect(settingsRepo.set).not.toHaveBeenCalled();
    });
  });

  describe("add", () => {
    it("creates a new workspace and returns it", async () => {
      const path = "/Users/test/projects/new-project";
      vi.mocked(workspaceRepo.getByPath).mockResolvedValue(null);
      vi.mocked(workspaceRepo.create).mockResolvedValue(undefined);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([]);

      const ws = await useWorkspaceStore.getState().add(path);

      expect(ws.path).toBe(path);
      expect(ws.name).toBe("new-project");
      expect(workspaceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ path, name: "new-project", is_default: 0 }),
      );
    });

    it("returns existing workspace when path already exists", async () => {
      const existing = makeWorkspace({ path: "/existing-path" });
      vi.mocked(workspaceRepo.getByPath).mockResolvedValue(existing);

      const ws = await useWorkspaceStore.getState().add("/existing-path");

      expect(ws).toEqual(existing);
      expect(workspaceRepo.create).not.toHaveBeenCalled();
    });

    it("uses extractName to derive workspace name from path", async () => {
      vi.mocked(workspaceRepo.getByPath).mockResolvedValue(null);
      vi.mocked(workspaceRepo.create).mockResolvedValue(undefined);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([]);

      const ws = await useWorkspaceStore.getState().add("/a/b/my-repo/");

      expect(ws.name).toBe("my-repo");
    });
  });

  describe("remove", () => {
    it("removes a non-active, non-default workspace", async () => {
      const ws = makeWorkspace({ id: "ws-1" });
      const defaultWs = makeDefaultWorkspace();
      useWorkspaceStore.setState({
        workspaces: [ws, defaultWs],
        activeWorkspace: defaultWs,
      });
      vi.mocked(workspaceRepo.delete).mockResolvedValue(undefined);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([defaultWs]);

      await useWorkspaceStore.getState().remove("ws-1");

      expect(workspaceRepo.delete).toHaveBeenCalledWith("ws-1");
      expect(useWorkspaceStore.getState().workspaces).toEqual([defaultWs]);
    });

    it("falls back to default workspace when removing active workspace", async () => {
      const ws = makeWorkspace({ id: "ws-active" });
      const defaultWs = makeDefaultWorkspace();
      useWorkspaceStore.setState({
        workspaces: [ws, defaultWs],
        activeWorkspace: ws,
      });
      vi.mocked(workspaceRepo.delete).mockResolvedValue(undefined);
      vi.mocked(settingsRepo.set).mockResolvedValue(undefined);
      vi.mocked(workspaceRepo.getAll).mockResolvedValue([defaultWs]);

      await useWorkspaceStore.getState().remove("ws-active");

      expect(settingsRepo.set).toHaveBeenCalledWith(
        "active_workspace_id",
        "default",
      );
      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(defaultWs);
    });

    it("does not remove the default workspace", async () => {
      const defaultWs = makeDefaultWorkspace();
      useWorkspaceStore.setState({ workspaces: [defaultWs] });

      await useWorkspaceStore.getState().remove("default");

      expect(workspaceRepo.delete).not.toHaveBeenCalled();
    });

    it("does nothing when workspace does not exist", async () => {
      useWorkspaceStore.setState({ workspaces: [] });

      await useWorkspaceStore.getState().remove("non-existent");

      expect(workspaceRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe("loadFromConversation", () => {
    it("sets activeWorkspace based on conversation workspace_path", async () => {
      const ws = makeWorkspace({ path: "/proj" });
      useWorkspaceStore.setState({ workspaces: [ws] });
      vi.mocked(conversationRepo.getById).mockResolvedValue({
        id: "conv-1",
        assistant_id: "a-1",
        title: "Test",
        pinned: 0,
        workspace_path: "/proj",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      });

      await useWorkspaceStore.getState().loadFromConversation("conv-1");

      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(ws);
    });

    it("keeps current active workspace when conversation has no workspace_path", async () => {
      const currentActive = makeWorkspace({ id: "ws-current" });
      useWorkspaceStore.setState({ activeWorkspace: currentActive, workspaces: [currentActive] });
      vi.mocked(conversationRepo.getById).mockResolvedValue({
        id: "conv-2",
        assistant_id: "a-1",
        title: "No Workspace",
        pinned: 0,
        workspace_path: undefined,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      });

      await useWorkspaceStore.getState().loadFromConversation("conv-2");

      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(currentActive);
    });

    it("keeps current active when workspace_path does not match any workspace", async () => {
      const currentActive = makeWorkspace({ id: "ws-current", path: "/current" });
      useWorkspaceStore.setState({ activeWorkspace: currentActive, workspaces: [currentActive] });
      vi.mocked(conversationRepo.getById).mockResolvedValue({
        id: "conv-3",
        assistant_id: "a-1",
        title: "Unknown Path",
        pinned: 0,
        workspace_path: "/unknown/path",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      });

      await useWorkspaceStore.getState().loadFromConversation("conv-3");

      expect(useWorkspaceStore.getState().activeWorkspace).toEqual(currentActive);
    });
  });

  describe("containsPath", () => {
    it("returns true when target equals workspace path", () => {
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ path: "/ws" }),
      });
      expect(useWorkspaceStore.getState().containsPath("/ws")).toBe(true);
    });

    it("returns true when target is inside workspace path", () => {
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ path: "/ws" }),
      });
      expect(useWorkspaceStore.getState().containsPath("/ws/subdir/file.ts")).toBe(true);
    });

    it("returns false when target is not inside workspace path", () => {
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ path: "/ws" }),
      });
      expect(useWorkspaceStore.getState().containsPath("/other/path")).toBe(false);
    });

    it("returns false when activeWorkspace is null", () => {
      useWorkspaceStore.setState({ activeWorkspace: null });
      expect(useWorkspaceStore.getState().containsPath("/ws")).toBe(false);
    });

    it("treats trailing slash on workspace path as equivalent", () => {
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ path: "/ws/" }),
      });
      expect(useWorkspaceStore.getState().containsPath("/ws/file.ts")).toBe(true);
    });

    it("does not match path prefixes incorrectly (/ws vs /ws-2)", () => {
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ path: "/ws" }),
      });
      expect(useWorkspaceStore.getState().containsPath("/ws-2/file.ts")).toBe(false);
    });

    it("direct child is inside workspace", () => {
      useWorkspaceStore.setState({
        activeWorkspace: makeWorkspace({ path: "/home/user/project" }),
      });
      expect(
        useWorkspaceStore.getState().containsPath("/home/user/project/src"),
      ).toBe(true);
    });
  });
});
