import { describe, it, expect, afterEach } from "vitest";
import { useLayoutStore } from "./layoutStore";
import { createStoreReset } from "@/test-utils/mock-store";

const resetStore = createStoreReset(useLayoutStore);
afterEach(() => resetStore());

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

    it("clamps to maximum 1200", () => {
      useLayoutStore.getState().setChatWidth(2000);
      expect(useLayoutStore.getState().chatWidth).toBe(1200);
    });
  });

  describe("toggleFilePanel", () => {
    it("starts closing animation when panel is open", () => {
      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
      useLayoutStore.getState().toggleFilePanel();
      const s = useLayoutStore.getState();
      expect(s.filePanelClosing).toBe(true);
      expect(s.filePanelOpen).toBe(true); // still open during animation
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

  describe("setFilePanelOpen", () => {
    it("directly sets filePanelOpen", () => {
      useLayoutStore.getState().setFilePanelOpen(false);
      expect(useLayoutStore.getState().filePanelOpen).toBe(false);
      useLayoutStore.getState().setFilePanelOpen(true);
      expect(useLayoutStore.getState().filePanelOpen).toBe(true);
    });
  });
});
