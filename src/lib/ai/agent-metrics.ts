export type AgentRunAction = "send" | "regenerate" | "edit_resend";

interface AgentRunMetricsInit {
  action: AgentRunAction;
  conversationId: string;
  modelId: string;
}

export interface AgentRunMetrics {
  action: AgentRunAction;
  conversationId: string;
  modelId: string;
  startedAtMs: number;
  firstTokenAtMs?: number;
  stepCount: number;
  toolCallCount: number;
  toolResultCount: number;
}

interface AgentRunMetricsResult {
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  aborted?: boolean;
}

export function createAgentRunMetrics(init: AgentRunMetricsInit): AgentRunMetrics {
  return {
    action: init.action,
    conversationId: init.conversationId,
    modelId: init.modelId,
    startedAtMs: Date.now(),
    stepCount: 0,
    toolCallCount: 0,
    toolResultCount: 0,
  };
}

export function trackAgentPart(
  metrics: AgentRunMetrics,
  partType: "text-delta" | "reasoning-delta" | "tool-call" | "tool-result",
): void {
  if (!metrics.firstTokenAtMs) {
    metrics.firstTokenAtMs = Date.now();
  }
  if (partType === "tool-call") {
    metrics.stepCount += 1;
    metrics.toolCallCount += 1;
  } else if ((partType === "text-delta" || partType === "reasoning-delta") && metrics.stepCount === 0) {
    // 没有工具调用时，至少记为 1 个 step（纯文本回复场景）
    metrics.stepCount = 1;
  } else if (partType === "tool-result") {
    metrics.toolResultCount += 1;
  }
}

export function reportAgentRunMetrics(
  metrics: AgentRunMetrics,
  result: AgentRunMetricsResult = {},
): void {
  if (!import.meta.env.DEV) return;

  const finishedAtMs = Date.now();
  const totalDurationMs = finishedAtMs - metrics.startedAtMs;
  const firstTokenLatencyMs = metrics.firstTokenAtMs
    ? metrics.firstTokenAtMs - metrics.startedAtMs
    : undefined;

  console.info("[agent-metrics]", {
    action: metrics.action,
    conversationId: metrics.conversationId,
    modelId: metrics.modelId,
    stepCount: metrics.stepCount,
    toolCallCount: metrics.toolCallCount,
    toolResultCount: metrics.toolResultCount,
    firstTokenLatencyMs,
    totalDurationMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    aborted: result.aborted ?? false,
    error: result.error,
    finishedAt: new Date(finishedAtMs).toISOString(),
  });
}

