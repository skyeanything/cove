// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";
import { isOfficeAvailable, clearOfficeCache } from "./office-detect";

describe("office-detect", () => {
  beforeEach(() => {
    clearOfficeCache();
  });

  it("returns true when office sidecar is detected", async () => {
    setupTauriMocks({
      officellm_init: () => undefined,
      officellm_detect: () => ({
        available: true,
        version: "1.0.0",
        path: "/usr/local/bin/officellm",
        bundled: false,
      }),
    });

    expect(await isOfficeAvailable()).toBe(true);
  });

  it("returns false when office sidecar is not detected", async () => {
    setupTauriMocks({
      officellm_init: () => undefined,
      officellm_detect: () => ({
        available: false,
        version: null,
        path: null,
        bundled: false,
      }),
    });

    expect(await isOfficeAvailable()).toBe(false);
  });

  it("returns false when invoke throws an error", async () => {
    setupTauriMocks({
      officellm_init: () => {
        throw new Error("IPC failure");
      },
    });

    expect(await isOfficeAvailable()).toBe(false);
  });

  it("caches result on subsequent calls", async () => {
    let detectCount = 0;
    setupTauriMocks({
      officellm_init: () => undefined,
      officellm_detect: () => {
        detectCount += 1;
        return { available: true, version: "1.0", path: "/bin", bundled: false };
      },
    });

    await isOfficeAvailable();
    await isOfficeAvailable();
    await isOfficeAvailable();

    expect(detectCount).toBe(1);
  });

  it("clearOfficeCache allows re-detection", async () => {
    let detectCount = 0;
    setupTauriMocks({
      officellm_init: () => undefined,
      officellm_detect: () => {
        detectCount += 1;
        return { available: true, version: "1.0", path: "/bin", bundled: false };
      },
    });

    await isOfficeAvailable();
    expect(detectCount).toBe(1);

    clearOfficeCache();
    await isOfficeAvailable();
    expect(detectCount).toBe(2);
  });

  it("calls officellm_init before officellm_detect", async () => {
    const callOrder: string[] = [];
    setupTauriMocks({
      officellm_init: () => {
        callOrder.push("init");
        return undefined;
      },
      officellm_detect: () => {
        callOrder.push("detect");
        return { available: true, version: "1.0", path: "/bin", bundled: false };
      },
    });

    await isOfficeAvailable();
    expect(callOrder).toEqual(["init", "detect"]);
  });
});
