import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./soul", () => ({
  readSoul: vi.fn(),
  writeSoul: vi.fn(),
  snapshotSoul: vi.fn(),
}));

import { readSoul, writeSoul, snapshotSoul } from "./soul";
import { maybeMeditate } from "./soul-meditate";

describe("maybeMeditate", () => {
  const generateFn = vi.fn<(p: string) => Promise<string>>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(snapshotSoul).mockResolvedValue("2026-03-04T18-00-00Z");
    vi.mocked(writeSoul).mockResolvedValue(undefined);
  });

  it("skips when private soul is empty", async () => {
    vi.mocked(readSoul).mockResolvedValue({
      public: "# Who I Am\n\n## My DNA\nTest DNA\n\n## My Tendencies\nDirect",
      private: "",
    });
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when too few observations", async () => {
    vi.mocked(readSoul).mockResolvedValue({
      public: "# Who I Am\n\n## My DNA\nTest DNA\n\n## My Tendencies\nDirect",
      private: "# Private\n\n## Observations\n- one\n- two",
    });
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when within cooldown period", async () => {
    const recentTs = new Date().toISOString();
    vi.mocked(readSoul).mockResolvedValue({
      public: "# Who I Am\n\n## My DNA\nTest DNA\n\n## My Tendencies\nDirect",
      private: `# Private\n\n## Observations\n- a\n- b\n- c\n- d\n- e\n- f\n<!-- last-meditation:${recentTs} -->`,
    });
    await maybeMeditate(generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("triggers meditation when conditions are met", async () => {
    vi.mocked(readSoul).mockResolvedValue({
      public: "# Who I Am\n\n## My DNA\nTest DNA\n\n## My Tendencies\nDirect\n\n## Where I'm Growing\nLearning",
      private: "# Private\n\n## Observations\n- a\n- b\n- c\n- d\n- e\n- f",
    });
    generateFn.mockResolvedValue(
      "=== PUBLIC SOUL ===\n# Who I Am\n\n## My DNA\nTest DNA\n\n## My Tendencies\nUpdated\n\n## Where I'm Growing\nNew growth\n\n=== PRIVATE SOUL ===\n# Private\n\n## Observations\n- distilled\n<!-- last-meditation:2026-03-04T18:00:00Z -->",
    );
    await maybeMeditate(generateFn);
    expect(snapshotSoul).toHaveBeenCalled();
    expect(generateFn).toHaveBeenCalled();
    expect(writeSoul).toHaveBeenCalledTimes(2);
  });

  it("aborts when DNA integrity check fails", async () => {
    vi.mocked(readSoul).mockResolvedValue({
      public: "# Who I Am\n\n## My DNA\nOriginal DNA\n\n## My Tendencies\nDirect",
      private: "# Private\n\n## Observations\n- a\n- b\n- c\n- d\n- e\n- f",
    });
    generateFn.mockResolvedValue(
      "=== PUBLIC SOUL ===\n# Who I Am\n\n## My DNA\nMODIFIED DNA\n\n## My Tendencies\nDirect\n\n=== PRIVATE SOUL ===\n# Private\n\n## Observations\n",
    );
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeMeditate(generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("DNA integrity check: FAIL"),
    );
    spy.mockRestore();
  });
});
