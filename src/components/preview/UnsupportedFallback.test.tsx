// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- vi.mock declarations (hoisted) ---

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("file-icons-js", () => ({
  getClassWithColor: () => "test-icon-class",
}));

// --- imports after mocks ---

import { invoke } from "@tauri-apps/api/core";
import { UnsupportedFallback } from "./UnsupportedFallback";

// --- helpers ---

const STAT_RESULT = {
  size: 1024,
  mtimeSecs: 1700000000,
  isDir: false,
  isBinary: true,
};

function renderFallback(
  path: string,
  workspaceRoot: string | null,
  onOpenExternal = vi.fn(),
) {
  return render(
    <UnsupportedFallback
      path={path}
      workspaceRoot={workspaceRoot}
      onOpenExternal={onOpenExternal}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: invoke resolves with stat result
  vi.mocked(invoke).mockResolvedValue(STAT_RESULT);
});

afterEach(cleanup);

// ── Filename display ──────────────────────────────────────────────────────
describe("UnsupportedFallback filename display", () => {
  it("shows filename extracted from path", () => {
    renderFallback("src/assets/archive.zip", "/workspace");
    expect(screen.getByText("archive.zip")).toBeDefined();
  });

  it("shows filename for deeply nested path", () => {
    renderFallback("a/b/c/d/video.mp4", "/workspace");
    expect(screen.getByText("video.mp4")).toBeDefined();
  });

  it("shows bare filename when no directory component", () => {
    renderFallback("binary.exe", "/workspace");
    expect(screen.getByText("binary.exe")).toBeDefined();
  });
});

// ── Extension badge ───────────────────────────────────────────────────────
describe("UnsupportedFallback extension badge", () => {
  it("shows extension badge for file with extension", () => {
    renderFallback("archive.zip", "/workspace");
    expect(screen.getByText("zip")).toBeDefined();
  });

  it("shows extension in lowercase", () => {
    renderFallback("VIDEO.MP4", "/workspace");
    // filename = "VIDEO.MP4", ext = "mp4"
    expect(screen.getByText("mp4")).toBeDefined();
  });

  it("does not show extension badge for file with no extension", () => {
    renderFallback("Makefile", "/workspace");
    // No extension badge — ext is empty so span is not rendered
    // The filename itself should be shown
    expect(screen.getByText("Makefile")).toBeDefined();
    // Verify there's no separate extension badge (no text that is just a lowercase ext)
    const spans = document.querySelectorAll("span");
    const hasBadge = Array.from(spans).some(
      (s) => s.className.includes("uppercase") && s.textContent === "",
    );
    expect(hasBadge).toBe(false);
  });
});

// ── Open with default app button ──────────────────────────────────────────
describe("UnsupportedFallback open button", () => {
  it("shows 'Open with default app' button", () => {
    renderFallback("archive.zip", "/workspace");
    expect(screen.getByText("preview.openDefault")).toBeDefined();
  });

  it("clicking the open button calls onOpenExternal", async () => {
    const user = userEvent.setup();
    const onOpenExternal = vi.fn();
    renderFallback("archive.zip", "/workspace", onOpenExternal);

    await user.click(screen.getByText("preview.openDefault"));

    expect(onOpenExternal).toHaveBeenCalledTimes(1);
  });

  it("button is a button element with type=button", () => {
    renderFallback("archive.zip", "/workspace");
    const btn = screen.getByText("preview.openDefault").closest("button");
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute("type")).toBe("button");
  });
});

// ── File size display via stat_file ───────────────────────────────────────
describe("UnsupportedFallback file stat display", () => {
  it("shows formatted file size when stat_file resolves (1024 bytes = 1.0 KB)", async () => {
    renderFallback("archive.zip", "/workspace");

    await waitFor(() => {
      expect(screen.getByText("1.0 KB")).toBeDefined();
    });
  });

  it("does not show file size when workspaceRoot is null", async () => {
    vi.mocked(invoke).mockResolvedValue(STAT_RESULT);
    renderFallback("archive.zip", null);

    // Give time for any async effect
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText("1.0 KB")).toBeNull();
  });

  it("calls invoke with stat_file command", async () => {
    renderFallback("archive.zip", "/workspace");

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("stat_file", {
        args: { workspaceRoot: "/workspace", path: "archive.zip" },
      });
    });
  });

  it("does not call invoke when workspaceRoot is null", async () => {
    renderFallback("archive.zip", null);

    await new Promise((r) => setTimeout(r, 20));

    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });

  it("does not call stat_file for absolute paths", async () => {
    renderFallback("/Users/data/attachments/archive.zip", "/workspace");

    await new Promise((r) => setTimeout(r, 20));

    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });

  it("does not crash when invoke rejects", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Permission denied"));

    expect(() =>
      renderFallback("archive.zip", "/workspace"),
    ).not.toThrow();

    // Component should still render the open button
    await waitFor(() => {
      expect(screen.getByText("preview.openDefault")).toBeDefined();
    });
  });

  it("shows size in bytes for files under 1024 bytes", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...STAT_RESULT, size: 512 });
    renderFallback("small.bin", "/workspace");

    await waitFor(() => {
      expect(screen.getByText("512 B")).toBeDefined();
    });
  });

  it("shows size in MB for files over 1MB", async () => {
    vi.mocked(invoke).mockResolvedValue({
      ...STAT_RESULT,
      size: 2 * 1024 * 1024,
    });
    renderFallback("large.bin", "/workspace");

    await waitFor(() => {
      expect(screen.getByText("2.0 MB")).toBeDefined();
    });
  });
});

// ── Stat with mtimeSecs ───────────────────────────────────────────────────
describe("UnsupportedFallback modification time", () => {
  it("shows formatted date when mtimeSecs is non-zero", async () => {
    renderFallback("archive.zip", "/workspace");

    await waitFor(() => {
      // The date is rendered via toLocaleString(); just confirm a non-empty string appears
      const statDiv = document.querySelector(".space-y-0\\.5");
      expect(statDiv).not.toBeNull();
      const paragraphs = statDiv!.querySelectorAll("p");
      // First p = size, second p = date (if mtimeSecs > 0)
      expect(paragraphs.length).toBe(2);
    });
  });

  it("does not show date when mtimeSecs is 0", async () => {
    vi.mocked(invoke).mockResolvedValue({ ...STAT_RESULT, mtimeSecs: 0 });
    renderFallback("archive.zip", "/workspace");

    await waitFor(() => {
      const statDiv = document.querySelector(".space-y-0\\.5");
      expect(statDiv).not.toBeNull();
      const paragraphs = statDiv!.querySelectorAll("p");
      // Only size is shown, no date paragraph
      expect(paragraphs.length).toBe(1);
    });
  });
});
