import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./soul", () => ({
  readSoul: vi.fn(),
  writeSoul: vi.fn(),
}));

import { readSoul, writeSoul } from "./soul";
import { maybeRecordObservation } from "./soul-observe";
import type { Message } from "@/db/types";

function makeMsg(role: "user" | "assistant", content: string): Message {
  return {
    id: crypto.randomUUID(),
    conversation_id: "conv-1",
    role,
    content,
    created_at: new Date().toISOString(),
  };
}

describe("maybeRecordObservation", () => {
  const generateFn = vi.fn<(p: string) => Promise<string>>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSoul).mockResolvedValue({
      public: "# Who I Am",
      private: "# Private\n\n## Observations\n",
    });
    vi.mocked(writeSoul).mockResolvedValue(undefined);
  });

  it("skips when fewer than 3 user turns", async () => {
    const messages = [makeMsg("user", "hi"), makeMsg("assistant", "hello")];
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("skips when LLM responds with nothing", async () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue("nothing");
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(writeSoul).not.toHaveBeenCalled();
  });

  it("appends observations to SOUL.private.md", async () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue(
      "- He prefers concise answers\n- Values directness",
    );
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(writeSoul).toHaveBeenCalledWith(
      "SOUL.private.md",
      expect.stringContaining("- He prefers concise answers"),
    );
  });

  it("adds date header when not present", async () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue("- New observation");
    await maybeRecordObservation("conv-1", messages, generateFn);
    const writeCall = vi.mocked(writeSoul).mock.calls[0];
    const content = writeCall?.[1] ?? "";
    // Should contain a date header in YYYY-MM-DD format
    expect(content).toMatch(/### \d{4}-\d{2}-\d{2}/);
  });

  it("handles errors gracefully", async () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockRejectedValue(new Error("fail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
