import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentRunMetrics,
  reportAgentRunMetrics,
  trackAgentPart,
} from "./agent-metrics";

describe("createAgentRunMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes all fields from init object", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "conv-1",
      modelId: "gpt-4",
    });

    expect(metrics.action).toBe("send");
    expect(metrics.conversationId).toBe("conv-1");
    expect(metrics.modelId).toBe("gpt-4");
  });

  it("sets startedAtMs to Date.now()", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c1",
      modelId: "m1",
    });
    expect(metrics.startedAtMs).toBe(Date.now());
  });

  it("initializes counters to 0 and firstTokenAtMs to undefined", () => {
    const metrics = createAgentRunMetrics({
      action: "regenerate",
      conversationId: "c2",
      modelId: "m2",
    });

    expect(metrics.stepCount).toBe(0);
    expect(metrics.toolCallCount).toBe(0);
    expect(metrics.toolResultCount).toBe(0);
    expect(metrics.firstTokenAtMs).toBeUndefined();
  });
});

describe("trackAgentPart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets firstTokenAtMs on first call", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });
    expect(metrics.firstTokenAtMs).toBeUndefined();

    vi.advanceTimersByTime(100);
    trackAgentPart(metrics, "text-delta");

    expect(metrics.firstTokenAtMs).toBe(Date.now());
  });

  it("does not overwrite firstTokenAtMs on subsequent calls", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    vi.advanceTimersByTime(50);
    trackAgentPart(metrics, "text-delta");
    const firstToken = metrics.firstTokenAtMs;

    vi.advanceTimersByTime(100);
    trackAgentPart(metrics, "tool-call");

    expect(metrics.firstTokenAtMs).toBe(firstToken);
  });

  it("increments stepCount and toolCallCount on tool-call", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "tool-call");
    expect(metrics.stepCount).toBe(1);
    expect(metrics.toolCallCount).toBe(1);

    trackAgentPart(metrics, "tool-call");
    expect(metrics.stepCount).toBe(2);
    expect(metrics.toolCallCount).toBe(2);
  });

  it("sets stepCount to 1 on text-delta when stepCount is 0", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "text-delta");
    expect(metrics.stepCount).toBe(1);
  });

  it("does not increment stepCount on text-delta when stepCount > 0", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "tool-call"); // stepCount = 1
    trackAgentPart(metrics, "text-delta");
    expect(metrics.stepCount).toBe(1); // unchanged
  });

  it("sets stepCount to 1 on reasoning-delta when stepCount is 0", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "reasoning-delta");
    expect(metrics.stepCount).toBe(1);
  });

  it("does not increment stepCount on reasoning-delta when stepCount > 0", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "tool-call"); // stepCount = 1
    trackAgentPart(metrics, "reasoning-delta");
    expect(metrics.stepCount).toBe(1);
  });

  it("increments toolResultCount on tool-result", () => {
    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "tool-result");
    expect(metrics.toolResultCount).toBe(1);

    trackAgentPart(metrics, "tool-result");
    expect(metrics.toolResultCount).toBe(2);
  });

  it("accumulates correctly across mixed part types", () => {
    const metrics = createAgentRunMetrics({
      action: "edit_resend",
      conversationId: "c",
      modelId: "m",
    });

    trackAgentPart(metrics, "text-delta"); // stepCount → 1
    trackAgentPart(metrics, "tool-call"); // stepCount → 2, toolCallCount → 1
    trackAgentPart(metrics, "tool-result"); // toolResultCount → 1
    trackAgentPart(metrics, "tool-call"); // stepCount → 3, toolCallCount → 2
    trackAgentPart(metrics, "tool-result"); // toolResultCount → 2
    trackAgentPart(metrics, "text-delta"); // no change to stepCount

    expect(metrics.stepCount).toBe(3);
    expect(metrics.toolCallCount).toBe(2);
    expect(metrics.toolResultCount).toBe(2);
  });
});

describe("reportAgentRunMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs structured info in DEV mode", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c1",
      modelId: "m1",
    });

    vi.advanceTimersByTime(50);
    trackAgentPart(metrics, "text-delta");

    vi.advanceTimersByTime(200);
    reportAgentRunMetrics(metrics, { inputTokens: 100, outputTokens: 50 });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("[agent-metrics]", expect.objectContaining({
      action: "send",
      conversationId: "c1",
      modelId: "m1",
      totalDurationMs: 250,
      firstTokenLatencyMs: 50,
      inputTokens: 100,
      outputTokens: 50,
      aborted: false,
    }));
  });

  it("computes firstTokenLatencyMs as undefined when no token tracked", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    vi.advanceTimersByTime(100);
    reportAgentRunMetrics(metrics);

    expect(spy).toHaveBeenCalledWith(
      "[agent-metrics]",
      expect.objectContaining({ firstTokenLatencyMs: undefined }),
    );
  });

  it("defaults aborted to false when result is empty", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    reportAgentRunMetrics(metrics);

    expect(spy).toHaveBeenCalledWith(
      "[agent-metrics]",
      expect.objectContaining({ aborted: false }),
    );
  });

  it("passes error and aborted from result", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    reportAgentRunMetrics(metrics, { error: "timeout", aborted: true });

    expect(spy).toHaveBeenCalledWith(
      "[agent-metrics]",
      expect.objectContaining({ error: "timeout", aborted: true }),
    );
  });

  it("includes finishedAt as ISO string", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    const metrics = createAgentRunMetrics({
      action: "send",
      conversationId: "c",
      modelId: "m",
    });

    vi.advanceTimersByTime(500);
    reportAgentRunMetrics(metrics);

    expect(spy).toHaveBeenCalledWith(
      "[agent-metrics]",
      expect.objectContaining({
        finishedAt: new Date(Date.now()).toISOString(),
      }),
    );
  });
});
