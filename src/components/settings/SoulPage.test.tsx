// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SoulPage } from "./SoulPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/ai/soul-backup", () => ({
  exportSoul: vi.fn(),
  importSoul: vi.fn(),
  getSoulHealth: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { exportSoul, importSoul, getSoulHealth } from "@/lib/ai/soul-backup";

const healthyState = {
  soul_exists: true,
  soul_readable: true,
  private_file_count: 2,
  snapshot_count: 5,
  format_version: 1,
  last_meditation: "2026-03-01T00:00:00Z",
  has_corruption: false,
  corruption_detail: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSoulHealth).mockResolvedValue(healthyState);
});

afterEach(cleanup);

describe("SoulPage", () => {
  it("renders health status on mount", async () => {
    render(<SoulPage />);
    await waitFor(() => {
      expect(screen.getByText("soul.healthy")).toBeTruthy();
    });
    expect(getSoulHealth).toHaveBeenCalled();
  });

  it("shows corruption status when SOUL is corrupted", async () => {
    vi.mocked(getSoulHealth).mockResolvedValue({
      ...healthyState,
      has_corruption: true,
      corruption_detail: "Missing sections: ## My DNA",
    });
    render(<SoulPage />);
    await waitFor(() => {
      expect(screen.getByText("soul.corrupted")).toBeTruthy();
    });
  });

  it("calls exportSoul on export button click", async () => {
    vi.mocked(exportSoul).mockResolvedValue({
      path: "/tmp/backup.zip",
      file_count: 3,
      includes_summaries: false,
      size_bytes: 1024,
    });
    render(<SoulPage />);
    await waitFor(() => {
      expect(screen.getByText("soul.healthy")).toBeTruthy();
    });
    const user = userEvent.setup();
    await user.click(screen.getByText("soul.export"));
    expect(exportSoul).toHaveBeenCalled();
  });

  it("calls importSoul on import button click", async () => {
    vi.mocked(importSoul).mockResolvedValue({
      files_restored: 2,
      summaries_json: null,
      backup_created: true,
    });
    render(<SoulPage />);
    await waitFor(() => {
      expect(screen.getByText("soul.healthy")).toBeTruthy();
    });
    const user = userEvent.setup();
    await user.click(screen.getByText("soul.import"));
    expect(importSoul).toHaveBeenCalled();
  });

  it("calls reset_soul on reset confirm", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    render(<SoulPage />);
    await waitFor(() => {
      expect(screen.getByText("soul.healthy")).toBeTruthy();
    });
    const user = userEvent.setup();
    // Click the reset trigger button to open AlertDialog
    await user.click(screen.getByText("soul.reset"));
    // Confirm in the dialog (AlertDialogAction also shows "soul.reset" text)
    const buttons = screen.getAllByText("soul.reset");
    await user.click(buttons[buttons.length - 1]);
    expect(invoke).toHaveBeenCalledWith("reset_soul");
  });

  it("displays format version and private file count", async () => {
    render(<SoulPage />);
    await waitFor(() => {
      expect(screen.getByText("soul.formatVersion")).toBeTruthy();
    });
    // format_version: 1, private_file_count: 2
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});
