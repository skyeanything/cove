import { describe, expect, it, beforeEach } from "vitest";
import { recordRead, getReadTime, assertReadBeforeWrite } from "./file-time";

describe("file-time", () => {
  // Use unique session IDs per test to avoid cross-test state pollution
  let sessionId: string;
  let counter = 0;

  beforeEach(() => {
    counter += 1;
    sessionId = `session-${counter}-${Date.now()}`;
  });

  describe("recordRead / getReadTime", () => {
    it("returns undefined for files not yet read", () => {
      expect(getReadTime(sessionId, "/foo.ts")).toBeUndefined();
    });

    it("returns a timestamp after recordRead", () => {
      const before = Date.now();
      recordRead(sessionId, "/foo.ts");
      const after = Date.now();

      const ts = getReadTime(sessionId, "/foo.ts");
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("isolates different sessions", () => {
      recordRead("session-a", "/bar.ts");
      expect(getReadTime("session-a", "/bar.ts")).toBeDefined();
      expect(getReadTime("session-b", "/bar.ts")).toBeUndefined();
    });

    it("overwrites timestamp on re-read", () => {
      recordRead(sessionId, "/x.ts");
      const first = getReadTime(sessionId, "/x.ts")!;

      recordRead(sessionId, "/x.ts");
      const second = getReadTime(sessionId, "/x.ts")!;

      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe("assertReadBeforeWrite", () => {
    it("fails when file was never read", () => {
      const result = assertReadBeforeWrite(sessionId, "/unread.ts", 100);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("尚未在本会话中读取");
    });

    it("succeeds when mtime <= readAt", () => {
      recordRead(sessionId, "/ok.ts");
      const readAt = getReadTime(sessionId, "/ok.ts")!;
      // mtime in seconds, same or before read time
      const mtimeSecs = Math.floor(readAt / 1000);
      const result = assertReadBeforeWrite(sessionId, "/ok.ts", mtimeSecs);
      expect(result.ok).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it("fails when file was modified after read", () => {
      recordRead(sessionId, "/modified.ts");
      // Simulate external modification: mtime far in the future
      const futureMtime = Math.floor(Date.now() / 1000) + 3600;
      const result = assertReadBeforeWrite(sessionId, "/modified.ts", futureMtime);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("已被修改");
    });
  });
});
