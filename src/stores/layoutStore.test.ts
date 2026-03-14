import { describe, it, expect, afterEach, vi } from "vitest";
import { createStoreReset } from "@/test-utils/mock-store";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn().mockResolvedValue({
    leftSidebarOpen: true,
    leftSidebarWidth: 260,
    chatWidth: 640,
    filePanelOpen: true,
    fileTreeOpen: true,
    filePreviewOpen: true,
    fileTreeWidth: 260,
    filePreviewWidth: 360,
    fileTreeShowHidden: true,
  }),
  writeConfig: vi.fn().mockResolvedValue(undefined),
}));

import { useLayoutStore } from "./layoutStore";
import { readConfig, writeConfig } from "@/lib/config";

const resetStore = createStoreReset(useLayoutStore);
afterEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("layoutStore", () => {
  describe("toggleLeftSidebar", () => {
    it("toggles from true to false", () => {
      expect(useLayoutStore.getState().leftSidebarOpen).toBe(true);
      useLayoutStore.getState().toggleLeftSidebar();
      expect(useLayoutStore.getState().leftSidebarOpen).toBe(false);
    });

    it("toggles from false to true", () => {
      useLayoutStore.setState({ leftSidebarOpen: false });
      useLayoutStore.getState().toggleLeftSidebar();
      expect(useLayoutStore.getState().leftSidebarOpen).toBe(true);
    });
  });

  describe("setLeftSidebarWidth", () => {
    it("sets width directly", () => {
      useLayoutStore.getState().setLeftSidebarWidth(300);
      expect(useLayoutStore.getState().leftSidebarWidth).toBe(300);
    });
  });

  describe("setChatWidth", () => {
    it("sets width within bounds", () => {
      useLayoutStore.getState().setChatWidth(800);
      expect(useLayoutStore.getState().chatWidth).toBe(800);
    });

    it("clamps to minimum 360", () => {
      useLayoutStore.getState().setChatWidth(100);
      expect(useLayoutStore.getState().chatWidth).toBe(360);
    });

    it("clamps to viewport-based maximum using actual sidebar width", () => {
      // Fallback viewport = 1440, default sidebar = 260 (open)
      // max = 1440 - 260 - 100 = 1080
      useLayoutStore.getState().setChatWidth(20000);
      expect(useLayoutStore.getState().chatWidth).toBe(1080);
    });

    it("uses SIDEBAR_MIN when sidebar is closed", () => {
      // Fallback viewport = 1440, sidebar closed -> uses SIDEBAR_MIN (200)
      // max = 1440 - 200 - 100 = 1140
      useLayoutStore.setState({ leftSidebarOpen: false });
      useLayoutStore.getState().setChatWidth(20000);
      expect(useLayoutStore.getState().chatWidth).toBe(1140);
    });
  });

  describe("toggleFilePanel", () => {
    it("starts closing animation when panel is open", () => {
      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
      useLayoutStore.getState().toggleFilePanel();
      const s = useLayoutStore.getState();
      expect(s.filePanelClosing).toBe(true);
      expect(s.filePanelOpen).toBe(true);
    });

    it("starts opening animation when panel is closed", () => {
      useLayoutStore.setState({ filePanelOpen: false });
      useLayoutStore.getState().toggleFilePanel();
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(true);
      expect(s.filePanelOpening).toBe(true);
    });
  });

  describe("confirmFilePanelClosed", () => {
    it("sets filePanelOpen to false and clears closing flag", () => {
      useLayoutStore.setState({ filePanelClosing: true });
      useLayoutStore.getState().confirmFilePanelClosed();
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(false);
      expect(s.filePanelClosing).toBe(false);
    });

    it("persists filePanelOpen=false to config", () => {
      useLayoutStore.setState({ filePanelClosing: true });
      useLayoutStore.getState().confirmFilePanelClosed();
      expect(writeConfig).toHaveBeenCalledWith(
        "layout",
        expect.objectContaining({ filePanelOpen: false }),
      );
    });
  });

  describe("confirmFilePanelOpened", () => {
    it("clears opening flag", () => {
      useLayoutStore.setState({ filePanelOpening: true });
      useLayoutStore.getState().confirmFilePanelOpened();
      expect(useLayoutStore.getState().filePanelOpening).toBe(false);
    });
  });

  describe("setFileTreeWidth", () => {
    it("sets width within bounds", () => {
      useLayoutStore.getState().setFileTreeWidth(300);
      expect(useLayoutStore.getState().fileTreeWidth).toBe(300);
    });

    it("clamps to minimum 200", () => {
      useLayoutStore.getState().setFileTreeWidth(50);
      expect(useLayoutStore.getState().fileTreeWidth).toBe(200);
    });

    it("clamps to maximum 480", () => {
      useLayoutStore.getState().setFileTreeWidth(999);
      expect(useLayoutStore.getState().fileTreeWidth).toBe(480);
    });
  });

  describe("setFilePreviewWidth", () => {
    it("sets width within bounds", () => {
      useLayoutStore.getState().setFilePreviewWidth(500);
      expect(useLayoutStore.getState().filePreviewWidth).toBe(500);
    });

    it("clamps to minimum 200", () => {
      useLayoutStore.getState().setFilePreviewWidth(50);
      expect(useLayoutStore.getState().filePreviewWidth).toBe(200);
    });

    it("clamps to maximum 800", () => {
      useLayoutStore.getState().setFilePreviewWidth(1500);
      expect(useLayoutStore.getState().filePreviewWidth).toBe(800);
    });
  });

  describe("setFileTreeShowHidden", () => {
    it("sets show hidden files flag", () => {
      useLayoutStore.getState().setFileTreeShowHidden(false);
      expect(useLayoutStore.getState().fileTreeShowHidden).toBe(false);
      useLayoutStore.getState().setFileTreeShowHidden(true);
      expect(useLayoutStore.getState().fileTreeShowHidden).toBe(true);
    });
  });

  describe("toggleFileTree", () => {
    it("toggles from true to false", () => {
      expect(useLayoutStore.getState().fileTreeOpen).toBe(true);
      useLayoutStore.getState().toggleFileTree();
      expect(useLayoutStore.getState().fileTreeOpen).toBe(false);
    });

    it("toggles from false to true", () => {
      useLayoutStore.setState({ fileTreeOpen: false });
      useLayoutStore.getState().toggleFileTree();
      expect(useLayoutStore.getState().fileTreeOpen).toBe(true);
    });

    it("persists to config", () => {
      useLayoutStore.getState().toggleFileTree();
      expect(writeConfig).toHaveBeenCalledWith(
        "layout",
        expect.objectContaining({ fileTreeOpen: false }),
      );
    });
  });

  describe("setFileTreeOpen", () => {
    it("sets fileTreeOpen directly", () => {
      useLayoutStore.getState().setFileTreeOpen(false);
      expect(useLayoutStore.getState().fileTreeOpen).toBe(false);
      useLayoutStore.getState().setFileTreeOpen(true);
      expect(useLayoutStore.getState().fileTreeOpen).toBe(true);
    });

    it("persists to config", () => {
      useLayoutStore.getState().setFileTreeOpen(false);
      expect(writeConfig).toHaveBeenCalledWith(
        "layout",
        expect.objectContaining({ fileTreeOpen: false }),
      );
    });
  });

  describe("toggleFilePreview", () => {
    it("toggles from true to false", () => {
      expect(useLayoutStore.getState().filePreviewOpen).toBe(true);
      useLayoutStore.getState().toggleFilePreview();
      expect(useLayoutStore.getState().filePreviewOpen).toBe(false);
    });

    it("toggles from false to true", () => {
      useLayoutStore.setState({ filePreviewOpen: false });
      useLayoutStore.getState().toggleFilePreview();
      expect(useLayoutStore.getState().filePreviewOpen).toBe(true);
    });

    it("auto-closes panel when both sub-panels closed", () => {
      useLayoutStore.setState({ fileTreeOpen: false });
      useLayoutStore.getState().toggleFilePreview();
      expect(useLayoutStore.getState().filePreviewOpen).toBe(false);
      expect(useLayoutStore.getState().filePanelClosing).toBe(true);
    });

    it("does not auto-close when fileTree is still open", () => {
      useLayoutStore.setState({ fileTreeOpen: true });
      useLayoutStore.getState().toggleFilePreview();
      expect(useLayoutStore.getState().filePreviewOpen).toBe(false);
      expect(useLayoutStore.getState().filePanelClosing).toBe(false);
    });
  });

  describe("setFilePreviewOpen", () => {
    it("sets filePreviewOpen directly", () => {
      useLayoutStore.getState().setFilePreviewOpen(false);
      expect(useLayoutStore.getState().filePreviewOpen).toBe(false);
      useLayoutStore.getState().setFilePreviewOpen(true);
      expect(useLayoutStore.getState().filePreviewOpen).toBe(true);
    });

    it("auto-closes panel when both sub-panels closed", () => {
      useLayoutStore.setState({ fileTreeOpen: false });
      useLayoutStore.getState().setFilePreviewOpen(false);
      expect(useLayoutStore.getState().filePanelClosing).toBe(true);
    });
  });

  describe("toggleFileTree auto-close", () => {
    it("auto-closes panel when preview is also closed", () => {
      useLayoutStore.setState({ filePreviewOpen: false });
      useLayoutStore.getState().toggleFileTree();
      expect(useLayoutStore.getState().fileTreeOpen).toBe(false);
      expect(useLayoutStore.getState().filePanelClosing).toBe(true);
    });
  });

  describe("toggleFilePanel re-open guarantee", () => {
    it("opens file tree but does not force preview open", () => {
      useLayoutStore.setState({ filePanelOpen: false, fileTreeOpen: false, filePreviewOpen: false });
      useLayoutStore.getState().toggleFilePanel();
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(true);
      expect(s.fileTreeOpen).toBe(true);
      expect(s.filePreviewOpen).toBe(false);
    });

    it("preserves filePreviewOpen state when re-opening", () => {
      useLayoutStore.setState({ filePanelOpen: false, fileTreeOpen: false, filePreviewOpen: true });
      useLayoutStore.getState().toggleFilePanel();
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(true);
      expect(s.fileTreeOpen).toBe(true);
      expect(s.filePreviewOpen).toBe(true);
    });
  });

  describe("setFilePanelOpen re-open guarantee", () => {
    it("opens file tree but does not force preview open", () => {
      useLayoutStore.setState({ filePanelOpen: false, fileTreeOpen: false, filePreviewOpen: false });
      useLayoutStore.getState().setFilePanelOpen(true);
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(true);
      expect(s.fileTreeOpen).toBe(true);
      expect(s.filePreviewOpen).toBe(false);
    });

    it("preserves filePreviewOpen state when opening", () => {
      useLayoutStore.setState({ filePanelOpen: false, fileTreeOpen: false, filePreviewOpen: true });
      useLayoutStore.getState().setFilePanelOpen(true);
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(true);
      expect(s.fileTreeOpen).toBe(true);
      expect(s.filePreviewOpen).toBe(true);
    });
  });

  describe("setFilePanelOpen", () => {
    it("directly sets filePanelOpen", () => {
      useLayoutStore.getState().setFilePanelOpen(false);
      expect(useLayoutStore.getState().filePanelOpen).toBe(false);
      useLayoutStore.getState().setFilePanelOpen(true);
      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
    });
  });

  describe("init", () => {
    it("loads state from config", async () => {
      vi.mocked(readConfig).mockResolvedValue({
        leftSidebarOpen: false,
        leftSidebarWidth: 200,
        chatWidth: 500,
        filePanelOpen: false,
        fileTreeOpen: false,
        filePreviewOpen: false,
        fileTreeWidth: 300,
        filePreviewWidth: 400,
        fileTreeShowHidden: false,
      });
      await useLayoutStore.getState().init();
      const s = useLayoutStore.getState();
      expect(s.leftSidebarOpen).toBe(false);
      expect(s.leftSidebarWidth).toBe(200);
      expect(s.chatWidth).toBe(500);
      expect(s.filePanelOpen).toBe(false);
      expect(s.fileTreeOpen).toBe(false);
      expect(s.filePreviewOpen).toBe(false);
      expect(s.fileTreeWidth).toBe(300);
      expect(s.filePreviewWidth).toBe(400);
      expect(s.fileTreeShowHidden).toBe(false);
    });

    it("clamps oversized persisted widths to viewport on load", async () => {
      // Fallback viewport = 1440 in Node test env
      vi.mocked(readConfig).mockResolvedValue({
        leftSidebarOpen: true,
        leftSidebarWidth: 5000,
        chatWidth: 5000,
        filePanelOpen: true,
        fileTreeOpen: true,
        filePreviewOpen: true,
        fileTreeWidth: 260,
        filePreviewWidth: 360,
        fileTreeShowHidden: true,
      });
      await useLayoutStore.getState().init();
      const s = useLayoutStore.getState();
      // sidebar max = floor(1440 * 0.5) = 720
      expect(s.leftSidebarWidth).toBe(720);
      // chat max = 1440 - 720 (clamped sidebar) - 100 = 620
      expect(s.chatWidth).toBe(620);
    });

    it("ensures file tree open when panel is open, preserves preview state", async () => {
      vi.mocked(readConfig).mockResolvedValue({
        leftSidebarOpen: true,
        leftSidebarWidth: 260,
        chatWidth: 640,
        filePanelOpen: true,
        fileTreeOpen: false,
        filePreviewOpen: false,
        fileTreeWidth: 260,
        filePreviewWidth: 360,
        fileTreeShowHidden: true,
      });
      await useLayoutStore.getState().init();
      const s = useLayoutStore.getState();
      expect(s.filePanelOpen).toBe(true);
      expect(s.fileTreeOpen).toBe(true);
      expect(s.filePreviewOpen).toBe(false);
    });
  });
});
