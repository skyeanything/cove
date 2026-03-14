import { describe, it, expect } from "vitest";
import {
  SIDEBAR_MIN, CHAT_MIN,
  computeSidebarMax, computeChatMax,
} from "./layout-utils";

describe("computeSidebarMax", () => {
  it("returns 50% of viewport width", () => {
    expect(computeSidebarMax(1440)).toBe(720);
    expect(computeSidebarMax(1920)).toBe(960);
  });

  it("never goes below SIDEBAR_MIN", () => {
    expect(computeSidebarMax(300)).toBe(SIDEBAR_MIN);
    expect(computeSidebarMax(0)).toBe(SIDEBAR_MIN);
  });
});

describe("computeChatMax", () => {
  it("subtracts actual sidebar width when open", () => {
    // 1440 - 300 (sidebar) - 100 (buffer) = 1040
    expect(computeChatMax(1440, true, 300)).toBe(1040);
  });

  it("uses SIDEBAR_MIN when sidebar closed", () => {
    // 1440 - 200 (SIDEBAR_MIN) - 100 = 1140
    expect(computeChatMax(1440, false, 300)).toBe(1140);
  });

  it("never goes below CHAT_MIN", () => {
    // 600 - 400 - 100 = 100, clamped to CHAT_MIN (480)
    expect(computeChatMax(600, true, 400)).toBe(CHAT_MIN);
  });

  it("sidebar + chat max never exceeds viewport", () => {
    const viewport = 1440;
    const sidebarWidth = 500;
    const chatMax = computeChatMax(viewport, true, sidebarWidth);
    // sidebar + chatMax + buffer should not exceed viewport
    expect(sidebarWidth + chatMax + 100).toBeLessThanOrEqual(viewport);
  });

  it("works with wide sidebar", () => {
    // 1440 - 720 - 100 = 620
    expect(computeChatMax(1440, true, 720)).toBe(620);
  });
});
