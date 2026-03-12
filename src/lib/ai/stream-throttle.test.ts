// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StreamUpdate } from "./stream-types";
import { createStreamThrottle } from "./stream-throttle";

let rafCallbacks: Array<FrameRequestCallback>;
let rafIdCounter: number;

beforeEach(() => {
  rafCallbacks = [];
  rafIdCounter = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafIdCounter;
    rafCallbacks.push(cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushRaf() {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach((cb) => cb(performance.now()));
}

function makeState(content: string): StreamUpdate {
  return {
    streamingContent: content,
    streamingReasoning: "",
    streamingToolCalls: [],
    streamingParts: [],
  };
}

describe("createStreamThrottle", () => {
  it("markDirty schedules RAF and delivers state on tick", () => {
    const state = makeState("hello");
    const onUpdate = vi.fn();
    const throttle = createStreamThrottle(() => state, onUpdate);

    throttle.markDirty();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(rafCallbacks).toHaveLength(1);

    flushRaf();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(state);
  });

  it("multiple markDirty before tick results in single onUpdate with latest state", () => {
    let current = makeState("a");
    const onUpdate = vi.fn();
    const throttle = createStreamThrottle(() => current, onUpdate);

    throttle.markDirty();
    current = makeState("b");
    throttle.markDirty();
    current = makeState("c");
    throttle.markDirty();

    expect(rafCallbacks).toHaveLength(1);
    flushRaf();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(makeState("c"));
  });

  it("flushSync delivers pending update synchronously", () => {
    const state = makeState("sync");
    const onUpdate = vi.fn();
    const throttle = createStreamThrottle(() => state, onUpdate);

    throttle.markDirty();
    throttle.flushSync();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(state);
  });

  it("flushSync with no pending is a no-op", () => {
    const onUpdate = vi.fn();
    const throttle = createStreamThrottle(() => makeState(""), onUpdate);

    throttle.flushSync();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("flushSync cancels pending RAF", () => {
    const onUpdate = vi.fn();
    const throttle = createStreamThrottle(() => makeState("x"), onUpdate);

    throttle.markDirty();
    expect(rafCallbacks).toHaveLength(1);

    throttle.flushSync();
    expect(cancelAnimationFrame).toHaveBeenCalled();

    // RAF tick after flushSync should not trigger another update
    flushRaf();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("returns fresh state snapshot on each flush", () => {
    let callCount = 0;
    const onUpdate = vi.fn();
    const throttle = createStreamThrottle(() => {
      callCount++;
      return makeState(`call-${callCount}`);
    }, onUpdate);

    throttle.markDirty();
    flushRaf();

    throttle.markDirty();
    flushRaf();

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[0]![0]).toEqual(makeState("call-1"));
    expect(onUpdate.mock.calls[1]![0]).toEqual(makeState("call-2"));
  });
});
