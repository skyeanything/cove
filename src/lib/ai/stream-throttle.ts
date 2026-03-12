import type { StreamUpdate } from "./stream-types";

/**
 * Throttle stream updates to requestAnimationFrame rate (~60/sec).
 * Instead of firing onUpdate on every text-delta, we batch: mark dirty,
 * then flush once per animation frame with the latest state snapshot.
 */
export function createStreamThrottle(
  getState: () => StreamUpdate,
  onUpdate: (state: StreamUpdate) => void,
): { markDirty(): void; flushSync(): void } {
  let dirty = false;
  let rafId: number | null = null;

  function flush() {
    rafId = null;
    if (!dirty) return;
    dirty = false;
    onUpdate(getState());
  }

  function markDirty() {
    dirty = true;
    if (rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  }

  function flushSync() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (dirty) {
      dirty = false;
      onUpdate(getState());
    }
  }

  return { markDirty, flushSync };
}
