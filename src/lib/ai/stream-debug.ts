import type { StreamDebugOptions } from "./stream-types";

export function parseErrorLike(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const nested = parseErrorLike(parsed);
      return nested ?? trimmed;
    } catch {
      return trimmed;
    }
  }
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [
      obj.message,
      (obj.error as Record<string, unknown> | undefined)?.message,
      (obj.cause as Record<string, unknown> | undefined)?.message,
      (obj.data as Record<string, unknown> | undefined)?.message,
      (obj.responseBody as Record<string, unknown> | undefined)?.message,
    ];
    for (const candidate of candidates) {
      const text = parseErrorLike(candidate);
      if (text) return text;
    }
    try {
      return JSON.stringify(obj);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isStreamDebugEnabled(explicitEnabled?: boolean): boolean {
  if (typeof explicitEnabled === "boolean") return explicitEnabled;
  try {
    return globalThis.localStorage?.getItem("cove.streamDebug") === "1";
  } catch {
    return false;
  }
}

export function createStreamDebugLogger(options?: StreamDebugOptions) {
  const enabled = isStreamDebugEnabled(options?.enabled);
  const label = options?.label ?? "stream";
  const previewChars = options?.previewChars ?? 24;

  let startedAt = 0;
  let lastAt = 0;
  let totalEvents = 0;
  let textDeltaEvents = 0;
  let reasoningDeltaEvents = 0;
  let textChars = 0;
  let reasoningChars = 0;

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const safePreview = (s: string) => s.replace(/\n/g, "\\n").slice(0, previewChars);

  const log = (message: string, payload?: Record<string, unknown>) => {
    if (!enabled) return;
    if (payload) console.debug(`[stream-debug][${label}] ${message}`, payload);
    else console.debug(`[stream-debug][${label}] ${message}`);
  };

  return {
    start() {
      if (!enabled) return;
      startedAt = now();
      lastAt = startedAt;
      log("start");
    },
    event(part: { type: string; text?: string; delta?: string }) {
      if (!enabled) return;
      const t = now();
      const dt = Math.round(t - lastAt);
      lastAt = t;
      totalEvents += 1;

      if (part.type === "text-delta") {
        const text = part.text ?? "";
        textDeltaEvents += 1;
        textChars += text.length;
        log("text-delta", {
          event: totalEvents, dt_ms: dt, chunk_chars: text.length,
          chunk_preview: safePreview(text), text_delta_events: textDeltaEvents,
          text_chars_total: textChars,
        });
        return;
      }

      if (part.type === "reasoning-delta" || part.type === "reasoning") {
        const text = part.text ?? part.delta ?? "";
        reasoningDeltaEvents += 1;
        reasoningChars += text.length;
        log("reasoning-delta", {
          event: totalEvents, dt_ms: dt, chunk_chars: text.length,
          chunk_preview: safePreview(text), reasoning_delta_events: reasoningDeltaEvents,
          reasoning_chars_total: reasoningChars,
        });
        return;
      }

      log(part.type, { event: totalEvents, dt_ms: dt });
    },
    finish(extra?: { contentChars?: number; reasoningChars?: number; error?: string }) {
      if (!enabled) return;
      const elapsed = Math.round(now() - startedAt);
      log("finish", {
        elapsed_ms: elapsed, total_events: totalEvents,
        text_delta_events: textDeltaEvents, reasoning_delta_events: reasoningDeltaEvents,
        text_chars_total: textChars, reasoning_chars_total: reasoningChars,
        content_chars_final: extra?.contentChars, reasoning_chars_final: extra?.reasoningChars,
        error: extra?.error,
      });
    },
  };
}
