// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";
import { isOfficellmAvailable, clearOfficellmCache } from "./officellm-detect";

describe("officellm-detect", () => {
  beforeEach(() => {
    clearOfficellmCache();
  });

  it("returns true when officellm is detected", async () => {
    setupTauriMocks({
      officellm_detect: () => ({
        available: true,
        version: "1.0.0",
        path: "/usr/local/bin/officellm",
      }),
    });

    expect(await isOfficellmAvailable()).toBe(true);
  });

  it("returns false when officellm is not detected", async () => {
    setupTauriMocks({
      officellm_detect: () => ({
        available: false,
        version: null,
        path: null,
      }),
    });

    expect(await isOfficellmAvailable()).toBe(false);
  });

  it("returns false when invoke throws an error", async () => {
    setupTauriMocks({
      officellm_detect: () => {
        throw new Error("IPC failure");
      },
    });

    expect(await isOfficellmAvailable()).toBe(false);
  });

  it("caches result on subsequent calls", async () => {
    let callCount = 0;
    setupTauriMocks({
      officellm_detect: () => {
        callCount += 1;
        return { available: true, version: "1.0", path: "/bin" };
      },
    });

    await isOfficellmAvailable();
    await isOfficellmAvailable();
    await isOfficellmAvailable();

    expect(callCount).toBe(1);
  });

  it("clearOfficellmCache allows re-detection", async () => {
    let callCount = 0;
    setupTauriMocks({
      officellm_detect: () => {
        callCount += 1;
        return { available: true, version: "1.0", path: "/bin" };
      },
    });

    await isOfficellmAvailable();
    expect(callCount).toBe(1);

    clearOfficellmCache();
    await isOfficellmAvailable();
    expect(callCount).toBe(2);
  });
});
