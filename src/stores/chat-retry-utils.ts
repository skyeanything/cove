export const LAST_MODEL_KEY = "lastModel";
export const RETRYABLE_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1200;
export const RETRY_MAX_DELAY_MS = 8000;

export function isRateLimitErrorMessage(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("quota exceeded")
  );
}

export function parseRetryAfterMs(message: string | undefined): number | null {
  if (!message) return null;
  const secMatch = message.match(/retry[-\s]?after[:=\s]+(\d+)/i);
  if (secMatch?.[1]) {
    const sec = Number(secMatch[1]);
    if (!Number.isNaN(sec) && sec > 0) return sec * 1000;
  }
  const msMatch = message.match(/retry[-\s]?after[:=\s]+(\d+)\s*ms/i);
  if (msMatch?.[1]) {
    const ms = Number(msMatch[1]);
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  return null;
}

export function backoffDelayMs(attempt: number, errMessage?: string): number {
  const hinted = parseRetryAfterMs(errMessage);
  if (hinted != null) return Math.min(RETRY_MAX_DELAY_MS, Math.max(600, hinted));
  const exp = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(RETRY_MAX_DELAY_MS, exp + jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
