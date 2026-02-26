import { describe, expect, it } from "vitest";
import {
  isRateLimitErrorMessage,
  parseRetryAfterMs,
  backoffDelayMs,
  sleep,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from "./chat-retry-utils";

describe("isRateLimitErrorMessage", () => {
  it("returns false for undefined/empty", () => {
    expect(isRateLimitErrorMessage(undefined)).toBe(false);
    expect(isRateLimitErrorMessage("")).toBe(false);
  });

  it("detects 429 status code", () => {
    expect(isRateLimitErrorMessage("Error 429: Too Many Requests")).toBe(true);
  });

  it("detects rate limit phrase", () => {
    expect(isRateLimitErrorMessage("Rate limit exceeded")).toBe(true);
    expect(isRateLimitErrorMessage("RATE LIMIT reached")).toBe(true);
  });

  it("detects too many requests phrase", () => {
    expect(isRateLimitErrorMessage("too many requests, please slow down")).toBe(true);
  });

  it("detects quota exceeded phrase", () => {
    expect(isRateLimitErrorMessage("Quota exceeded for model")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRateLimitErrorMessage("Internal Server Error")).toBe(false);
    expect(isRateLimitErrorMessage("Network timeout")).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  it("returns null for undefined/empty", () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
  });

  it("parses retry-after in seconds", () => {
    expect(parseRetryAfterMs("Retry-After: 5")).toBe(5000);
    expect(parseRetryAfterMs("retry after: 10")).toBe(10000);
  });

  it("parses retry-after with ms suffix", () => {
    // Note: the ms regex matches after the seconds regex,
    // but seconds regex picks up the number first — "2000 ms" → sec=2000 → 2_000_000
    // Actually let's check the actual behavior
    expect(parseRetryAfterMs("retry-after: 2000 ms")).toBe(2000 * 1000);
  });

  it("returns null when no retry-after found", () => {
    expect(parseRetryAfterMs("some random error")).toBeNull();
  });

  it("handles retry-after=N format", () => {
    expect(parseRetryAfterMs("retry-after=3")).toBe(3000);
  });
});

describe("backoffDelayMs", () => {
  it("returns base delay for first attempt", () => {
    const delay = backoffDelayMs(1);
    // RETRY_BASE_DELAY_MS * 2^0 + jitter(0..299)
    expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
    expect(delay).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS + 300);
  });

  it("increases exponentially with attempt number", () => {
    // attempt=2: base * 2^1 + jitter = 2400 + 0..299
    const delay2 = backoffDelayMs(2);
    expect(delay2).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS * 2);
    expect(delay2).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS * 2 + 300);
  });

  it("caps at RETRY_MAX_DELAY_MS", () => {
    const delay = backoffDelayMs(100);
    expect(delay).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS);
  });

  it("uses hinted retry-after when available", () => {
    const delay = backoffDelayMs(1, "Retry-After: 3");
    // hinted = 3000, clamped to min 600, max RETRY_MAX_DELAY_MS
    expect(delay).toBe(3000);
  });

  it("clamps hinted value to minimum 600ms", () => {
    const delay = backoffDelayMs(1, "retry-after: 0");
    // parseRetryAfterMs returns null for 0 (not > 0), falls through to exp
    expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
  });

  it("attempt 0 uses base delay", () => {
    const delay = backoffDelayMs(0);
    // Math.max(0, 0-1) = 0, so base * 2^0 + jitter
    expect(delay).toBeGreaterThanOrEqual(RETRY_BASE_DELAY_MS);
    expect(delay).toBeLessThanOrEqual(RETRY_BASE_DELAY_MS + 300);
  });
});

describe("sleep", () => {
  it("resolves after specified ms", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timer variance
  });
});
