import { useEffect, useRef, useCallback, useState } from "react";

interface UseAutoScrollOptions {
  isStreaming: boolean;
  contentDeps: unknown[];
}

interface UseAutoScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isDetached: boolean;
  scrollToBottom: () => void;
}

/** Distance from bottom (px) at which we consider the user "at the bottom". */
const FOLLOW_AT_BOTTOM_PX = 50;

/**
 * Manages auto-scroll-to-bottom during streaming with two guards that
 * prevent the race condition where RAF-driven scrollTop changes re-enable
 * following after the user has scrolled up:
 *
 * A. `isRafScrollingRef` — set true around programmatic scrollTop writes so
 *    the scroll handler can ignore those events.
 * B. `userScrolledUpRef` — sticky flag set by wheel-up; only cleared by
 *    explicit user actions (click ↓ button, wheel back to bottom) or when
 *    a new streaming session starts.
 */
export function useAutoScroll({
  isStreaming,
  contentDeps,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const rafLastTsRef = useRef<number | null>(null);
  const shouldFollowRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const prevIsStreamingRef = useRef(false);

  // Guard A: true while RAF is writing scrollTop
  const isRafScrollingRef = useRef(false);
  // Guard B: sticky flag — user explicitly scrolled up
  const userScrolledUpRef = useRef(false);

  const [isDetached, setIsDetached] = useState(false);

  const stopRaf = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    rafLastTsRef.current = null;
  }, []);

  const startRaf = useCallback(
    (viewport: HTMLElement) => {
      if (rafIdRef.current != null) return;

      const step = (now: number) => {
        if (!shouldFollowRef.current) {
          rafIdRef.current = null;
          rafLastTsRef.current = null;
          return;
        }
        const targetTop = viewport.scrollHeight - viewport.clientHeight;
        const distance = targetTop - viewport.scrollTop;

        if (distance <= 0.8) {
          isRafScrollingRef.current = true;
          viewport.scrollTop = targetTop;
          isRafScrollingRef.current = false;
          rafIdRef.current = null;
          rafLastTsRef.current = null;
          return;
        }

        const prevTs = rafLastTsRef.current ?? now;
        const dt = Math.min(40, Math.max(8, now - prevTs));
        rafLastTsRef.current = now;

        const easing = 1 - Math.exp((-dt / 16) * 0.12);
        const stepPx = Math.min(14, Math.max(0.25, distance * easing));

        // Guard A: mark programmatic scroll
        isRafScrollingRef.current = true;
        viewport.scrollTop += stepPx;
        isRafScrollingRef.current = false;

        rafIdRef.current = requestAnimationFrame(step);
      };

      rafIdRef.current = requestAnimationFrame(step);
    },
    [],
  );

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolledUpRef.current = false;
    shouldFollowRef.current = true;
    setIsDetached(false);
    el.scrollTop = el.scrollHeight - el.clientHeight;
    if (isStreaming) startRaf(el);
  }, [isStreaming, startRaf]);

  // Scroll & wheel listeners
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      // Guard A: ignore scroll events caused by RAF
      if (isRafScrollingRef.current) return;

      const prevTop = lastScrollTopRef.current;
      const currTop = el.scrollTop;
      const scrolledUp = currTop < prevTop - 0.5;
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;

      if (scrolledUp) {
        shouldFollowRef.current = false;
        setIsDetached(true);
      } else if (
        !userScrolledUpRef.current &&
        distanceFromBottom <= FOLLOW_AT_BOTTOM_PX
      ) {
        // Only re-enable if user hasn't explicitly scrolled up
        shouldFollowRef.current = true;
        setIsDetached(false);
        startRaf(el);
      }

      lastScrollTopRef.current = currTop;
      if (!shouldFollowRef.current) stopRaf();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // Guard B: user scrolled up — set sticky flag
        userScrolledUpRef.current = true;
        shouldFollowRef.current = false;
        setIsDetached(true);
        stopRaf();
      } else if (e.deltaY > 0) {
        // User scrolling down — check if they've reached the bottom
        const distFromBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom <= FOLLOW_AT_BOTTOM_PX) {
          userScrolledUpRef.current = false;
          shouldFollowRef.current = true;
          setIsDetached(false);
          if (isStreaming) startRaf(el);
        }
      }
    };

    lastScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel, { capture: true });
      stopRaf();
    };
  }, [stopRaf, startRaf, isStreaming]);

  // Streaming state management
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!isStreaming) {
      prevIsStreamingRef.current = false;
      return;
    }

    // Streaming just started (false → true): reset sticky flag & evaluate
    if (!prevIsStreamingRef.current) {
      userScrolledUpRef.current = false;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom <= FOLLOW_AT_BOTTOM_PX) {
        shouldFollowRef.current = true;
        setIsDetached(false);
      }
      prevIsStreamingRef.current = true;
    }

    if (!shouldFollowRef.current) return;
    startRaf(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, ...contentDeps, startRaf]);

  return { scrollRef, isDetached, scrollToBottom };
}
