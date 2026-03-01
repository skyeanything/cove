import { describe, it, expect, vi, beforeEach } from "vitest";

// --- vi.mock declarations (hoisted) ---

vi.mock("@/lib/ai/provider-factory", () => ({ getModel: vi.fn() }));
vi.mock("@/lib/ai/model-service", () => ({ getModelOption: vi.fn() }));
vi.mock("@/lib/ai/agent", () => ({ runAgent: vi.fn() }));
vi.mock("@/lib/ai/agent-metrics", () => ({
  reportAgentRunMetrics: vi.fn(),
  trackAgentPart: vi.fn(),
}));
vi.mock("@/lib/ai/stream-handler", () => ({ handleAgentStream: vi.fn() }));
vi.mock("@/lib/ai/context", () => ({ buildSystemPrompt: vi.fn().mockReturnValue("system-prompt") }));
vi.mock("@/lib/ai/office-detect", () => ({ isOfficeAvailable: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/ai/tools", () => ({ getAgentTools: vi.fn().mockReturnValue({}) }));
vi.mock("./skillsStore", () => ({ getEnabledSkillNames: vi.fn().mockResolvedValue([]) }));
vi.mock("./chat-retry-utils", () => ({
  isRateLimitErrorMessage: vi.fn().mockReturnValue(false),
  backoffDelayMs: vi.fn().mockReturnValue(100),
  sleep: vi.fn().mockResolvedValue(undefined),
  RETRYABLE_ATTEMPTS: 3,
}));

// --- imports after mocks ---

import { getModel } from "@/lib/ai/provider-factory";
import { getModelOption } from "@/lib/ai/model-service";
import { runAgent } from "@/lib/ai/agent";
import { reportAgentRunMetrics, trackAgentPart } from "@/lib/ai/agent-metrics";
import { handleAgentStream } from "@/lib/ai/stream-handler";
import { buildSystemPrompt } from "@/lib/ai/context";
import { isOfficeAvailable } from "@/lib/ai/office-detect";
import { getAgentTools } from "@/lib/ai/tools";
import { getEnabledSkillNames } from "./skillsStore";
import { isRateLimitErrorMessage, backoffDelayMs, sleep } from "./chat-retry-utils";
import { runStreamLoop } from "./chat-stream-runner";
import type { StreamRunOptions, StreamRunCallbacks } from "./chat-stream-runner";
import type { StreamResult } from "@/lib/ai/stream-handler";
import { makeProvider } from "@/test-utils";

// --- setup ---

beforeEach(() => vi.clearAllMocks());

// --- helpers ---

function makeStreamResult(overrides: Partial<StreamResult> = {}): StreamResult {
  return {
    content: "Hello",
    reasoning: "",
    parts: [],
    toolCalls: [],
    inputTokens: 100,
    outputTokens: 50,
    ...overrides,
  };
}

function makeOpts(overrides: Partial<StreamRunOptions> = {}): StreamRunOptions {
  return {
    provider: makeProvider(),
    modelId: "gpt-4o",
    modelMessages: [],
    workspacePath: "/workspace",
    abortSignal: new AbortController().signal,
    runMetrics: {} as StreamRunOptions["runMetrics"],
    labelBase: "test",
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<StreamRunCallbacks> = {}): StreamRunCallbacks {
  return {
    onUpdate: vi.fn(),
    onRateLimitRetry: vi.fn(),
    ...overrides,
  };
}

// --- tests ---

describe("runStreamLoop", () => {
  describe("successful run", () => {
    it("calls getModel, getModelOption, getEnabledSkillNames, isOfficeAvailable, getAgentTools", async () => {
      const result = makeStreamResult();
      vi.mocked(getModel).mockReturnValue("model" as never);
      vi.mocked(getModelOption).mockReturnValue({ max_output_tokens: 4096 });
      vi.mocked(runAgent).mockReturnValue("stream" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      await runStreamLoop(makeOpts(), makeCallbacks());

      expect(getModel).toHaveBeenCalled();
      expect(getModelOption).toHaveBeenCalled();
      expect(getEnabledSkillNames).toHaveBeenCalled();
      expect(isOfficeAvailable).toHaveBeenCalled();
      expect(getAgentTools).toHaveBeenCalled();
    });

    it("calls runAgent with correct params", async () => {
      const result = makeStreamResult();
      vi.mocked(getModel).mockReturnValue("model-obj" as never);
      vi.mocked(getModelOption).mockReturnValue({ max_output_tokens: 8192 });
      vi.mocked(buildSystemPrompt).mockReturnValue("sys-prompt");
      vi.mocked(getAgentTools).mockReturnValue({ tool1: {} } as never);
      vi.mocked(runAgent).mockReturnValue("stream" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      const opts = makeOpts();
      await runStreamLoop(opts, makeCallbacks());

      expect(runAgent).toHaveBeenCalledWith({
        model: "model-obj",
        messages: opts.modelMessages,
        system: "sys-prompt",
        tools: { tool1: {} },
        abortSignal: opts.abortSignal,
        maxOutputTokens: 8192,
      });
    });

    it("calls handleAgentStream with attemptResult and callbacks", async () => {
      const result = makeStreamResult();
      vi.mocked(runAgent).mockReturnValue("the-stream" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      const cbs = makeCallbacks();
      await runStreamLoop(makeOpts(), cbs);

      expect(handleAgentStream).toHaveBeenCalledWith(
        "the-stream",
        cbs.onUpdate,
        expect.any(Function),
        { label: "test:try1" },
      );
    });

    it("returns { streamResult } without finalError on success", async () => {
      const result = makeStreamResult();
      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      const out = await runStreamLoop(makeOpts(), makeCallbacks());

      expect(out.streamResult).toBe(result);
      expect(out.finalError).toBeUndefined();
    });

    it("reports metrics with inputTokens/outputTokens", async () => {
      const result = makeStreamResult({ inputTokens: 200, outputTokens: 100 });
      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      const opts = makeOpts();
      await runStreamLoop(opts, makeCallbacks());

      expect(reportAgentRunMetrics).toHaveBeenCalledWith(opts.runMetrics, {
        inputTokens: 200,
        outputTokens: 100,
      });
    });
  });

  describe("rate-limit retry", () => {
    it("retries on rate-limit error up to RETRYABLE_ATTEMPTS", async () => {
      const errorResult = makeStreamResult({ error: "429 rate limit" });
      const successResult = makeStreamResult();

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream)
        .mockResolvedValueOnce(errorResult)
        .mockResolvedValueOnce(errorResult)
        .mockResolvedValueOnce(successResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(true);

      const cbs = makeCallbacks();
      const out = await runStreamLoop(makeOpts(), cbs);

      expect(handleAgentStream).toHaveBeenCalledTimes(3);
      expect(out.streamResult).toBe(successResult);
      expect(out.finalError).toBeUndefined();
    });

    it("calls onRateLimitRetry callback on each retry", async () => {
      const errorResult = makeStreamResult({ error: "429" });
      const successResult = makeStreamResult();

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream)
        .mockResolvedValueOnce(errorResult)
        .mockResolvedValueOnce(successResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(true);

      const cbs = makeCallbacks();
      await runStreamLoop(makeOpts(), cbs);

      expect(cbs.onRateLimitRetry).toHaveBeenCalledWith(1);
      expect(cbs.onRateLimitRetry).toHaveBeenCalledTimes(1);
    });

    it("calls sleep with backoffDelayMs between retries", async () => {
      const errorResult = makeStreamResult({ error: "429" });
      const successResult = makeStreamResult();

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream)
        .mockResolvedValueOnce(errorResult)
        .mockResolvedValueOnce(successResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(true);
      vi.mocked(backoffDelayMs).mockReturnValue(2000);

      await runStreamLoop(makeOpts(), makeCallbacks());

      expect(backoffDelayMs).toHaveBeenCalledWith(1, "429");
      expect(sleep).toHaveBeenCalledWith(2000);
    });

    it("stops retrying after max attempts and returns user-friendly error", async () => {
      const errorResult = makeStreamResult({ error: "429 rate limit" });

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(errorResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(true);

      const out = await runStreamLoop(makeOpts(), makeCallbacks());

      // RETRYABLE_ATTEMPTS = 3, so 3 attempts total
      expect(handleAgentStream).toHaveBeenCalledTimes(3);
      expect(out.finalError).toContain("429");
    });

    it("reports error metrics on final failure", async () => {
      const errorResult = makeStreamResult({ error: "429 rate limit" });

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(errorResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(true);

      const opts = makeOpts();
      await runStreamLoop(opts, makeCallbacks());

      expect(reportAgentRunMetrics).toHaveBeenCalledWith(opts.runMetrics, {
        error: "429 rate limit",
      });
    });
  });

  describe("non-retryable errors", () => {
    it("returns finalError for non-rate-limit errors without retry", async () => {
      const errorResult = makeStreamResult({ error: "API key invalid" });

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(errorResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(false);

      const out = await runStreamLoop(makeOpts(), makeCallbacks());

      expect(handleAgentStream).toHaveBeenCalledTimes(1);
      expect(out.finalError).toBe("API key invalid");
    });

    it("reports error metrics", async () => {
      const errorResult = makeStreamResult({ error: "Server error" });

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(errorResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValue(false);

      const opts = makeOpts();
      await runStreamLoop(opts, makeCallbacks());

      expect(reportAgentRunMetrics).toHaveBeenCalledWith(opts.runMetrics, {
        error: "Server error",
      });
    });
  });

  describe("edge cases", () => {
    it("trackAgentPart callback is wired correctly", async () => {
      const result = makeStreamResult();
      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      const opts = makeOpts();
      await runStreamLoop(opts, makeCallbacks());

      // Extract the onPartType callback passed to handleAgentStream
      const onPartType = vi.mocked(handleAgentStream).mock.calls[0][2]!;
      onPartType("text-delta");

      expect(trackAgentPart).toHaveBeenCalledWith(opts.runMetrics, "text-delta");
    });

    it("passes correct label with attempt number", async () => {
      const errorResult = makeStreamResult({ error: "429" });
      const successResult = makeStreamResult();

      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream)
        .mockResolvedValueOnce(errorResult)
        .mockResolvedValueOnce(successResult);
      vi.mocked(isRateLimitErrorMessage).mockReturnValueOnce(true).mockReturnValueOnce(false);

      await runStreamLoop(makeOpts({ labelBase: "chat" }), makeCallbacks());

      expect(handleAgentStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { label: "chat:try1" },
      );
      expect(handleAgentStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { label: "chat:try2" },
      );
    });

    it("passes null workspacePath as undefined", async () => {
      const result = makeStreamResult();
      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      await runStreamLoop(makeOpts({ workspacePath: undefined }), makeCallbacks());

      expect(buildSystemPrompt).toHaveBeenCalledWith({
        workspacePath: undefined,
        officeAvailable: false,
      });
    });

    it("uses modelOption.max_output_tokens when available", async () => {
      const result = makeStreamResult();
      vi.mocked(getModel).mockReturnValue("m" as never);
      vi.mocked(getModelOption).mockReturnValue({ max_output_tokens: 16384 });
      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      await runStreamLoop(makeOpts(), makeCallbacks());

      expect(runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ maxOutputTokens: 16384 }),
      );
    });

    it("passes undefined maxOutputTokens when modelOption is null", async () => {
      const result = makeStreamResult();
      vi.mocked(getModel).mockReturnValue("m" as never);
      vi.mocked(getModelOption).mockReturnValue(null);
      vi.mocked(runAgent).mockReturnValue("s" as never);
      vi.mocked(handleAgentStream).mockResolvedValue(result);

      await runStreamLoop(makeOpts(), makeCallbacks());

      expect(runAgent).toHaveBeenCalledWith(
        expect.objectContaining({ maxOutputTokens: undefined }),
      );
    });
  });
});
