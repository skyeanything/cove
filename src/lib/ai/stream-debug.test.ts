import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStreamDebugLogger, parseErrorLike } from "./stream-debug";

// ---------- parseErrorLike ----------

describe("parseErrorLike", () => {
  it("returns undefined for undefined", () => {
    expect(parseErrorLike(undefined)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(parseErrorLike(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseErrorLike("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(parseErrorLike("   ")).toBeUndefined();
  });

  it("returns trimmed plain string", () => {
    expect(parseErrorLike("  some error  ")).toBe("some error");
  });

  it("recursively parses JSON string with message", () => {
    const json = JSON.stringify({ message: "inner error" });
    expect(parseErrorLike(json)).toBe("inner error");
  });

  it("returns original string if JSON has no message-like field", () => {
    const json = JSON.stringify({ code: 500 });
    // parseErrorLike on object → JSON.stringify fallback → returns the JSON string
    // but the outer call gets the parsed object's stringify, which is the same
    expect(parseErrorLike(json)).toBe(json);
  });

  it("returns error.message from Error instance", () => {
    expect(parseErrorLike(new Error("boom"))).toBe("boom");
  });

  it("handles Error with empty message", () => {
    const err = new Error("");
    // empty message → String(err) = "Error"
    expect(parseErrorLike(err)).toBe("Error");
  });

  it("extracts message from object", () => {
    expect(parseErrorLike({ message: "top-level" })).toBe("top-level");
  });

  it("extracts error.message from object", () => {
    expect(parseErrorLike({ error: { message: "nested" } })).toBe("nested");
  });

  it("extracts cause.message from object", () => {
    expect(parseErrorLike({ cause: { message: "cause msg" } })).toBe("cause msg");
  });

  it("extracts data.message from object", () => {
    expect(parseErrorLike({ data: { message: "data msg" } })).toBe("data msg");
  });

  it("extracts responseBody.message from object", () => {
    expect(parseErrorLike({ responseBody: { message: "body msg" } })).toBe("body msg");
  });

  it("respects priority: message > error.message", () => {
    expect(
      parseErrorLike({ message: "first", error: { message: "second" } }),
    ).toBe("first");
  });

  it("falls back to JSON.stringify for object with no message", () => {
    const obj = { code: 42, status: "fail" };
    expect(parseErrorLike(obj)).toBe(JSON.stringify(obj));
  });

  it("converts number to string", () => {
    expect(parseErrorLike(42)).toBe("42");
  });

  it("converts boolean to string", () => {
    expect(parseErrorLike(true)).toBe("true");
  });
});

// ---------- createStreamDebugLogger ----------

describe("createStreamDebugLogger", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("disabled mode", () => {
    it("does not log when enabled is false", () => {
      const logger = createStreamDebugLogger({ enabled: false });
      logger.start();
      logger.event({ type: "text-delta", text: "hi" });
      logger.finish();

      expect(debugSpy).not.toHaveBeenCalled();
    });
  });

  describe("localStorage fallback", () => {
    it("enables when localStorage has cove.streamDebug=1", () => {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => (key === "cove.streamDebug" ? "1" : null),
      });

      const logger = createStreamDebugLogger();
      logger.start();

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("[stream-debug]"),
      );
    });

    it("stays disabled when localStorage has no flag", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => null,
      });

      const logger = createStreamDebugLogger();
      logger.start();

      expect(debugSpy).not.toHaveBeenCalled();
    });

    it("stays disabled when localStorage throws", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("no storage");
        },
      });

      const logger = createStreamDebugLogger();
      logger.start();

      expect(debugSpy).not.toHaveBeenCalled();
    });
  });

  describe("start", () => {
    it("logs start message with label", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "test" });
      logger.start();

      expect(debugSpy).toHaveBeenCalledWith("[stream-debug][test] start");
    });

    it("uses default label 'stream'", () => {
      const logger = createStreamDebugLogger({ enabled: true });
      logger.start();

      expect(debugSpy).toHaveBeenCalledWith("[stream-debug][stream] start");
    });
  });

  describe("event — text-delta", () => {
    it("accumulates text delta stats", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "t" });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "text-delta", text: "hello" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][t] text-delta",
        expect.objectContaining({
          event: 1,
          chunk_chars: 5,
          text_delta_events: 1,
          text_chars_total: 5,
        }),
      );

      logger.event({ type: "text-delta", text: " world" });

      expect(debugSpy).toHaveBeenLastCalledWith(
        "[stream-debug][t] text-delta",
        expect.objectContaining({
          event: 2,
          chunk_chars: 6,
          text_delta_events: 2,
          text_chars_total: 11,
        }),
      );
    });

    it("includes chunk_preview with newlines escaped", () => {
      const logger = createStreamDebugLogger({
        enabled: true,
        label: "t",
        previewChars: 10,
      });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "text-delta", text: "line1\nline2\nline3" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][t] text-delta",
        expect.objectContaining({
          chunk_preview: "line1\\nlin",
        }),
      );
    });

    it("handles missing text as empty string", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "t" });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "text-delta" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][t] text-delta",
        expect.objectContaining({
          chunk_chars: 0,
          text_chars_total: 0,
        }),
      );
    });
  });

  describe("event — reasoning-delta / reasoning", () => {
    it("accumulates reasoning delta stats via text field", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "r" });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "reasoning-delta", text: "think" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][r] reasoning-delta",
        expect.objectContaining({
          event: 1,
          chunk_chars: 5,
          reasoning_delta_events: 1,
          reasoning_chars_total: 5,
        }),
      );
    });

    it("uses delta field when text is absent", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "r" });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "reasoning", delta: "reason" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][r] reasoning-delta",
        expect.objectContaining({
          chunk_chars: 6,
          reasoning_chars_total: 6,
        }),
      );
    });

    it("handles 'reasoning' type same as 'reasoning-delta'", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "r" });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "reasoning", text: "abc" });
      logger.event({ type: "reasoning-delta", text: "de" });

      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenLastCalledWith(
        "[stream-debug][r] reasoning-delta",
        expect.objectContaining({
          reasoning_delta_events: 2,
          reasoning_chars_total: 5,
        }),
      );
    });
  });

  describe("event — other types", () => {
    it("logs event number and dt_ms for unknown types", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "x" });
      logger.start();
      debugSpy.mockClear();

      logger.event({ type: "tool-call" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][x] tool-call",
        expect.objectContaining({
          event: 1,
          dt_ms: expect.any(Number),
        }),
      );
    });
  });

  describe("finish", () => {
    it("outputs summary with all counters", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "f" });
      logger.start();
      logger.event({ type: "text-delta", text: "hi" });
      logger.event({ type: "reasoning-delta", text: "ok" });
      logger.event({ type: "tool-call" });
      debugSpy.mockClear();

      logger.finish();

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][f] finish",
        expect.objectContaining({
          elapsed_ms: expect.any(Number),
          total_events: 3,
          text_delta_events: 1,
          reasoning_delta_events: 1,
          text_chars_total: 2,
          reasoning_chars_total: 2,
        }),
      );
    });

    it("includes extra params when provided", () => {
      const logger = createStreamDebugLogger({ enabled: true, label: "f" });
      logger.start();
      debugSpy.mockClear();

      logger.finish({ contentChars: 100, reasoningChars: 50, error: "oops" });

      expect(debugSpy).toHaveBeenCalledWith(
        "[stream-debug][f] finish",
        expect.objectContaining({
          content_chars_final: 100,
          reasoning_chars_final: 50,
          error: "oops",
        }),
      );
    });

    it("does not log when disabled", () => {
      const logger = createStreamDebugLogger({ enabled: false });
      logger.start();
      logger.finish();

      expect(debugSpy).not.toHaveBeenCalled();
    });
  });
});
