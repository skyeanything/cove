import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./soul", () => ({
  readSoul: vi.fn(),
  writeSoulPrivate: vi.fn(),
  findPrivateFile: vi.fn(),
}));

import { readSoul, writeSoulPrivate, findPrivateFile } from "./soul";
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
      private: [{ name: "observations.md", content: "### 2026-03-03\n- old obs\n" }],
    });
    vi.mocked(findPrivateFile).mockReturnValue({
      name: "observations.md",
      content: "### 2026-03-03\n- old obs\n",
    });
    vi.mocked(writeSoulPrivate).mockResolvedValue(undefined);
  });

  it("skips when fewer than 2 user turns", async () => {
    const messages = [makeMsg("user", "hi")];
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(generateFn).not.toHaveBeenCalled();
  });

  it("triggers after 2 user turns", async () => {
    const messages = [
      makeMsg("user", "hello"),
      makeMsg("assistant", "hi"),
      makeMsg("user", "question"),
      makeMsg("assistant", "answer"),
    ];
    generateFn.mockResolvedValue("nothing");
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(generateFn).toHaveBeenCalled();
  });

  it("skips when LLM responds with nothing", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue("nothing");
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(writeSoulPrivate).not.toHaveBeenCalled();
  });

  it("appends observations to observations.md", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue(
      "- He prefers concise answers\n- Values directness",
    );
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(writeSoulPrivate).toHaveBeenCalledWith(
      "observations.md",
      expect.stringContaining("- He prefers concise answers"),
    );
  });

  it("adds date header when not present", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockResolvedValue("- New observation");
    await maybeRecordObservation("conv-1", messages, generateFn);
    const writeCall = vi.mocked(writeSoulPrivate).mock.calls[0];
    const content = writeCall?.[1] ?? "";
    expect(content).toMatch(/### \d{4}-\d{2}-\d{2}/);
  });

  it("handles errors gracefully", async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMsg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`),
    );
    generateFn.mockRejectedValue(new Error("fail"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await maybeRecordObservation("conv-1", messages, generateFn);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
