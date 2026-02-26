import type { Provider } from "@/db/types";
import type { ModelMessage } from "ai";
import { getModel } from "@/lib/ai/provider-factory";
import { getModelOption } from "@/lib/ai/model-service";
import { runAgent } from "@/lib/ai/agent";
import { reportAgentRunMetrics, trackAgentPart } from "@/lib/ai/agent-metrics";
import type { AgentRunMetrics } from "@/lib/ai/agent-metrics";
import { handleAgentStream, type StreamResult } from "@/lib/ai/stream-handler";
import { buildSystemPrompt } from "@/lib/ai/context";
import { isOfficellmAvailable } from "@/lib/ai/officellm-detect";
import { getAgentTools } from "@/lib/ai/tools";
import { getEnabledSkillNames } from "./skillsStore";
import type { StreamUpdate } from "@/lib/ai/stream-types";
import { isRateLimitErrorMessage, backoffDelayMs, sleep, RETRYABLE_ATTEMPTS } from "./chat-retry-utils";

export interface StreamRunOptions {
  provider: Provider;
  modelId: string;
  modelMessages: ModelMessage[];
  workspacePath: string | undefined;
  abortSignal: AbortSignal;
  runMetrics: AgentRunMetrics;
  labelBase: string;
}

export interface StreamRunCallbacks {
  onUpdate: (state: StreamUpdate) => void;
  onRateLimitRetry: (attempt: number) => void;
}

export interface StreamRunResult {
  streamResult: StreamResult;
  /** 最终错误消息（rate limit 已转换为用户友好文案） */
  finalError?: string;
}

/**
 * 执行带重试的流式 agent 调用。
 * 返回 streamResult；如有 rate-limit 错误会自动重试并通过 callbacks 通知进度。
 * 非 AbortError 的异常会重新抛出。
 */
export async function runStreamLoop(
  opts: StreamRunOptions,
  callbacks: StreamRunCallbacks,
): Promise<StreamRunResult> {
  const { provider, modelId, modelMessages, workspacePath, abortSignal, runMetrics, labelBase } = opts;
  const model = getModel(provider, modelId);
  const modelOption = getModelOption(provider, modelId);
  const enabledSkillNames = await getEnabledSkillNames();
  const tools = getAgentTools(enabledSkillNames);
  const officellmAvailable = await isOfficellmAvailable();

  let streamResult: StreamResult | null = null;
  for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
    const attemptResult = runAgent({
      model,
      messages: modelMessages,
      system: buildSystemPrompt({ workspacePath, officellmAvailable }),
      tools,
      abortSignal,
      maxOutputTokens: modelOption?.max_output_tokens,
    });
    const current = await handleAgentStream(
      attemptResult,
      callbacks.onUpdate,
      (partType) => trackAgentPart(runMetrics, partType),
      { label: `${labelBase}:try${attempt}` },
    );
    streamResult = current;
    if (!current.error || !isRateLimitErrorMessage(current.error) || attempt >= RETRYABLE_ATTEMPTS) break;
    callbacks.onRateLimitRetry(attempt);
    await sleep(backoffDelayMs(attempt, current.error));
  }

  if (!streamResult) throw new Error("Stream result unavailable");

  if (streamResult.error) {
    const finalError = isRateLimitErrorMessage(streamResult.error)
      ? "请求过于频繁（429），请稍后重试，或切换到 DeepSeek。"
      : streamResult.error;
    reportAgentRunMetrics(runMetrics, { error: streamResult.error });
    return { streamResult, finalError };
  }

  reportAgentRunMetrics(runMetrics, {
    inputTokens: streamResult.inputTokens,
    outputTokens: streamResult.outputTokens,
  });
  return { streamResult };
}
