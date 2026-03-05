import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./soul", () => ({
  readSoul: vi.fn(),
  writeSoul: vi.fn(),
  writeSoulPrivate: vi.fn(),
  deleteSoulPrivate: vi.fn(),
  snapshotSoul: vi.fn(),
  findPrivateFile: vi.fn(),
}));

import {
  readSoul,
  writeSoul,
  writeSoulPrivate,
  deleteSoulPrivate,
  snapshotSoul,
  findPrivateFile,
} from "./soul";
import { maybeMeditate } from "./soul-meditate";

const DNA = "## My DNA\n\nThese are the things I don't negotiate on:\n\nI pursue understanding.";
const DISPOSITION = "## My Disposition\n\nHigh inertia.\n\n- I lean toward directness\n- I'd rather push back";
const STYLE = "## My Style\n\nLow inertia.\n\n- I default to concise";
const GROWTH = "## Where I'm Growing\n\nLearning judgment.";
const PUBLIC_SOUL = `# Who I Am\n\n${DNA}\n\n${DISPOSITION}\n\n${STYLE}\n\n${GROWTH}`;

describe("maybeMeditate", () => {
  const generateFn = vi.fn<(p: string) => Promise<string>>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(snapshotSoul).mockResolvedValue("2026-03-04T18-00-00Z");
    vi.mocked(writeSoul).mockResolvedValue(undefined);
    vi.mocked(writeSoulPrivate).mockResolvedValue(undefined);
    vi.mocked(deleteSoulPrivate).mockResolvedValue(undefined);
  });

  function mockSoul(obsContent: string, hasMeditationMarker = false) {
    const pub = hasMeditationMarker
      ? PUBLIC_SOUL + "\n<!-- last-meditation:2020-01-01T00:00:00Z -->"
      : PUBLIC_SOUL;
    const obsFile = { name: "observations.md", content: obsContent };
    vi.mocked(readSoul).mockResolvedValue({
      public: pub,
      private: [obsFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
  }

  it("skips when no observations file", async () => {
    vi.mocked(readSoul).mockResolvedValue({ public: PUBLIC_SOUL, private: [] });
    vi.mocked(findPrivateFile).mockReturnValue(undefined);
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when too few observations (first time, threshold=3)", async () => {
    mockSoul("- one\n- two");
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("triggers at 3 observations for first meditation", async () => {
    mockSoul("- one\n- two\n- three");
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- distilled\n`,
    );
    await maybeMeditate(generateFn);
    expect(generateFn).toHaveBeenCalled();
    expect(snapshotSoul).toHaveBeenCalled();
  });

  it("requires 5 observations for subsequent meditations", async () => {
    mockSoul("- one\n- two\n- three\n- four", true);
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when within cooldown period", async () => {
    const recentTs = new Date().toISOString();
    const obsFile = { name: "observations.md", content: "- a\n- b\n- c\n- d\n- e\n- f" };
    vi.mocked(readSoul).mockResolvedValue({
      public: PUBLIC_SOUL + `\n<!-- last-meditation:${recentTs} -->`,
      private: [obsFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("uses latest marker when SOUL.md has multiple (legacy files)", async () => {
    const recentTs = new Date().toISOString();
    const obsFile = { name: "observations.md", content: "- a\n- b\n- c\n- d\n- e\n- f" };
    vi.mocked(readSoul).mockResolvedValue({
      public: PUBLIC_SOUL
        + "\n<!-- last-meditation:2020-01-01T00:00:00Z -->"
        + `\n<!-- last-meditation:${recentTs} -->`,
      private: [obsFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
    await maybeMeditate(generateFn);
    // Should skip because the LATEST marker is recent (within cooldown)
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("writes SOUL.md and private files on success", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- remaining\n\n=== PRIVATE:patterns.md ===\n# Patterns\n- p1\n`,
    );
    await maybeMeditate(generateFn);
    expect(writeSoul).toHaveBeenCalledWith(
      expect.stringContaining("# Who I Am"),
    );
    expect(writeSoul).toHaveBeenCalledWith(
      expect.stringContaining("<!-- last-meditation:"),
    );
    expect(writeSoulPrivate).toHaveBeenCalledWith(
      "observations.md",
      expect.stringContaining("- remaining"),
    );
    expect(writeSoulPrivate).toHaveBeenCalledWith(
      "patterns.md",
      expect.stringContaining("# Patterns"),
    );
  });

  it("strips old meditation markers before writing new one", async () => {
    mockSoul("- a\n- b\n- c");
    // LLM output contains an old marker (e.g. echoed back from input)
    const soulWithOldMarker = PUBLIC_SOUL + "\n<!-- last-meditation:2020-01-01T00:00:00Z -->";
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n${soulWithOldMarker}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    );
    await maybeMeditate(generateFn);
    const written = vi.mocked(writeSoul).mock.calls[0]?.[0] ?? "";
    const markers = written.match(/<!-- last-meditation:/g) ?? [];
    expect(markers.length).toBe(1);
    expect(written).not.toContain("2020-01-01");
  });

  it("handles DELETE markers", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- kept\n\n=== DELETE:old.md ===\n`,
    );
    await maybeMeditate(generateFn);
    expect(deleteSoulPrivate).toHaveBeenCalledWith("old.md");
  });

  it("aborts when DNA integrity check fails", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n# Who I Am\n\n## My DNA\n\nMODIFIED DNA\n\n${DISPOSITION}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    );
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("DNA integrity check: FAIL"),
    );
    spy.mockRestore();
  });

  it("aborts when Disposition entries are modified", async () => {
    mockSoul("- a\n- b\n- c");
    const badDisposition = DISPOSITION.replace(
      "- I lean toward directness",
      "- I lean toward kindness",
    );
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n# Who I Am\n\n${DNA}\n\n${badDisposition}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    );
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Disposition integrity check: FAIL"),
    );
    spy.mockRestore();
  });

  it("allows Disposition annotations to be added", async () => {
    mockSoul("- a\n- b\n- c");
    const annotatedDisposition = DISPOSITION.replace(
      "- I lean toward directness",
      "- I lean toward directness (user responds well to bluntness)",
    );
    generateFn.mockResolvedValue(
      `=== SOUL.md ===\n# Who I Am\n\n${DNA}\n\n${annotatedDisposition}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- distilled\n`,
    );
    await maybeMeditate(generateFn);
    expect(writeSoul).toHaveBeenCalled();
  });

  it("aborts without writing when parse fails", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue("Rambling text without markers");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("meditation parse failed"),
    );
    spy.mockRestore();
  });
});
