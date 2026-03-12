import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./soul", () => ({
  readSoul: vi.fn(),
  writeSoul: vi.fn(),
  writeSoulPrivate: vi.fn(),
  deleteSoulPrivate: vi.fn(),
  snapshotSoul: vi.fn(),
  findPrivateFile: vi.fn(),
  SOUL_SIZE_LIMITS: { "SOUL.md": 4000, "observations.md": 6000, "patterns.md": 4000 },
  DEFAULT_PRIVATE_LIMIT: 3000,
}));

import {
  readSoul,
  writeSoul,
  writeSoulPrivate,
  deleteSoulPrivate,
  snapshotSoul,
  findPrivateFile,
} from "./soul";
import { maybeMeditate, forceMeditate, type MeditateGenResult } from "./soul-meditate";

const DNA = "## My DNA\n\nThese are the things I don't negotiate on:\n\nI pursue understanding.";
const DISPOSITION = "## My Disposition\n\nHigh inertia.\n\n- I lean toward directness\n- I'd rather push back";
const STYLE = "## My Style\n\nLow inertia.\n\n- I default to concise";
const GROWTH = "## Where I'm Growing\n\nLearning judgment.";
const PUBLIC_SOUL = `# Who I Am\n\n${DNA}\n\n${DISPOSITION}\n\n${STYLE}\n\n${GROWTH}`;

describe("maybeMeditate", () => {
  const generateFn = vi.fn<(p: string) => Promise<MeditateGenResult>>();

  function genResult(text: string, finishReason = "stop"): MeditateGenResult {
    return { text, finishReason };
  }

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
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- distilled\n`,
    ));
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
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- remaining\n\n=== PRIVATE:patterns.md ===\n# Patterns\n- p1\n`,
    ));
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
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${soulWithOldMarker}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    ));
    await maybeMeditate(generateFn);
    const written = vi.mocked(writeSoul).mock.calls[0]?.[0] ?? "";
    const markers = written.match(/<!-- last-meditation:/g) ?? [];
    expect(markers.length).toBe(1);
    expect(written).not.toContain("2020-01-01");
  });

  it("handles DELETE markers", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- kept\n\n=== DELETE:old.md ===\n`,
    ));
    await maybeMeditate(generateFn);
    expect(deleteSoulPrivate).toHaveBeenCalledWith("old.md");
  });

  it("aborts when DNA integrity check fails", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n# Who I Am\n\n## My DNA\n\nMODIFIED DNA\n\n${DISPOSITION}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    ));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("DNA integrity check failed"),
    );
    spy.mockRestore();
  });

  it("aborts when Disposition entries are modified", async () => {
    mockSoul("- a\n- b\n- c");
    const badDisposition = DISPOSITION.replace(
      "- I lean toward directness",
      "- I lean toward kindness",
    );
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n# Who I Am\n\n${DNA}\n\n${badDisposition}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    ));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Disposition integrity check failed"),
    );
    spy.mockRestore();
  });

  it("allows Disposition annotations to be added", async () => {
    mockSoul("- a\n- b\n- c");
    const annotatedDisposition = DISPOSITION.replace(
      "- I lean toward directness",
      "- I lean toward directness (user responds well to bluntness)",
    );
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n# Who I Am\n\n${DNA}\n\n${annotatedDisposition}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- distilled\n`,
    ));
    await maybeMeditate(generateFn);
    expect(writeSoul).toHaveBeenCalled();
  });

  it("preserves soul-format marker through meditation", async () => {
    mockSoul("- a\n- b\n- c");
    const soulWithFormat = PUBLIC_SOUL + "\n<!-- soul-format:1 -->";
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${soulWithFormat}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    ));
    await maybeMeditate(generateFn);
    const written = vi.mocked(writeSoul).mock.calls[0]?.[0] ?? "";
    expect(written).toContain("<!-- soul-format:1 -->");
    // Only one format marker
    const markers = written.match(/<!-- soul-format:\d+ -->/g) ?? [];
    expect(markers.length).toBe(1);
  });

  it("aborts without writing when parse fails", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(genResult("Rambling text without markers"));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Parse failed"),
    );
    spy.mockRestore();
  });

  it("carries forward existing private files omitted by model", async () => {
    const obsFile = { name: "observations.md", content: "- a\n- b\n- c" };
    const patternsFile = { name: "patterns.md", content: "# Patterns\n- old pattern\n" };
    vi.mocked(readSoul).mockResolvedValue({
      public: PUBLIC_SOUL,
      private: [obsFile, patternsFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
    // Model output omits patterns.md entirely
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- remaining\n`,
    ));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    // patterns.md should be carried forward with original content
    expect(writeSoulPrivate).toHaveBeenCalledWith(
      "patterns.md",
      "# Patterns\n- old pattern\n",
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("model omitted patterns.md"),
    );
    spy.mockRestore();
  });

  it("aborts when section heading is missing", async () => {
    mockSoul("- a\n- b\n- c");
    // Output missing "## Where I'm Growing"
    const incomplete = `# Who I Am\n\n${DNA}\n\n${DISPOSITION}\n\n${STYLE}`;
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${incomplete}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    ));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Missing sections"),
    );
    spy.mockRestore();
  });

  it("includes size budget in meditation prompt", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- obs\n`,
    ));
    await maybeMeditate(generateFn);
    const prompt = generateFn.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("Size budgets");
    expect(prompt).toContain("~4000 chars");
    expect(prompt).toContain("~6000 chars");
    expect(prompt).toContain("budget:");
  });

  it("aborts when output is truncated (finishReason=length)", async () => {
    mockSoul("- a\n- b\n- c");
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- obs`,
      "length",
    ));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("truncated"),
    );
    spy.mockRestore();
  });

  it("does not carry forward files explicitly deleted by model", async () => {
    const obsFile = { name: "observations.md", content: "- a\n- b\n- c" };
    const oldFile = { name: "old.md", content: "outdated content\n" };
    vi.mocked(readSoul).mockResolvedValue({
      public: PUBLIC_SOUL,
      private: [obsFile, oldFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
    // Model explicitly deletes old.md
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- obs\n\n=== DELETE:old.md ===\n`,
    ));
    await maybeMeditate(generateFn);
    expect(deleteSoulPrivate).toHaveBeenCalledWith("old.md");
    // Should NOT carry forward a deleted file
    const writePrivateCalls = vi.mocked(writeSoulPrivate).mock.calls;
    const wroteOld = writePrivateCalls.some(([name]) => name === "old.md");
    expect(wroteOld).toBe(false);
  });
});

describe("forceMeditate", () => {
  const generateFn = vi.fn<(p: string) => Promise<MeditateGenResult>>();

  function genResult(text: string, finishReason = "stop"): MeditateGenResult {
    return { text, finishReason };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(snapshotSoul).mockResolvedValue("2026-03-09T12-00-00Z");
    vi.mocked(writeSoul).mockResolvedValue(undefined);
    vi.mocked(writeSoulPrivate).mockResolvedValue(undefined);
    vi.mocked(deleteSoulPrivate).mockResolvedValue(undefined);
  });

  function mockSoulForForce(obsContent: string) {
    const obsFile = { name: "observations.md", content: obsContent };
    vi.mocked(readSoul).mockResolvedValue({
      public: PUBLIC_SOUL,
      private: [obsFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
  }

  it("bypasses threshold and cooldown", async () => {
    // Only 1 observation + recent meditation marker -- maybeMeditate would skip
    const obsFile = { name: "observations.md", content: "- one" };
    vi.mocked(readSoul).mockResolvedValue({
      public: PUBLIC_SOUL + `\n<!-- last-meditation:${new Date().toISOString()} -->`,
      private: [obsFile],
    });
    vi.mocked(findPrivateFile).mockReturnValue(obsFile);
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- processed\n`,
    ));
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(true);
    expect(generateFn).toHaveBeenCalled();
  });

  it("returns structured outcome on success", async () => {
    mockSoulForForce("- a\n- b\n- c");
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- kept\n\n=== PRIVATE:patterns.md ===\n- p1\n`,
    ));
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(true);
    expect(outcome.snapshotTimestamp).toBe("2026-03-09T12-00-00Z");
    expect(outcome.updatedFiles).toContain("SOUL.md");
    expect(outcome.updatedFiles).toContain("observations.md");
    expect(outcome.updatedFiles).toContain("patterns.md");
  });

  it("returns error when no observations", async () => {
    vi.mocked(readSoul).mockResolvedValue({ public: PUBLIC_SOUL, private: [] });
    vi.mocked(findPrivateFile).mockReturnValue(undefined);
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe("No observations");
  });

  it("returns error on parse failure", async () => {
    mockSoulForForce("- a\n- b");
    generateFn.mockResolvedValue(genResult("no markers at all"));
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe("Parse failed");
    expect(outcome.snapshotTimestamp).toBe("2026-03-09T12-00-00Z");
  });

  it("returns error on DNA integrity failure", async () => {
    mockSoulForForce("- a");
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n# Who I Am\n\n## My DNA\n\nMODIFIED\n\n${DISPOSITION}\n\n${STYLE}\n\n${GROWTH}\n\n=== PRIVATE:observations.md ===\n- a\n`,
    ));
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("DNA");
  });

  it("returns error on missing section headings", async () => {
    mockSoulForForce("- a");
    const incomplete = `# Who I Am\n\n${DNA}\n\n${DISPOSITION}\n\n${STYLE}`;
    generateFn.mockResolvedValue(genResult(
      `=== SOUL.md ===\n${incomplete}\n\n=== PRIVATE:observations.md ===\n- a\n`,
    ));
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("Missing sections");
  });

  it("returns structured error when snapshotSoul fails", async () => {
    mockSoulForForce("- a\n- b");
    vi.mocked(snapshotSoul).mockRejectedValue(new Error("disk full"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await forceMeditate(generateFn);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("disk full");
    expect(outcome.snapshotTimestamp).toBeUndefined();
    expect(generateFn).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("serializes concurrent calls", async () => {
    mockSoulForForce("- a\n- b");
    let callCount = 0;
    generateFn.mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
      return genResult(`=== SOUL.md ===\n${PUBLIC_SOUL}\n\n=== PRIVATE:observations.md ===\n- done\n`);
    });
    const [r1, r2] = await Promise.all([
      forceMeditate(generateFn),
      forceMeditate(generateFn),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(callCount).toBe(2);
  });
});
