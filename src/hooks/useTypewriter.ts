import { useEffect, useRef, useState } from "react";

/**
 * Smooth typewriter hook — reveals a growing target string at a constant,
 * adaptive rate so that streaming text appears at uniform speed regardless
 * of how chunks arrive from the model.
 *
 * Algorithm: each animation frame, reveal `buffer × dt / TARGET_DELAY_MS`
 * characters.  This means we aim to stay ~TARGET_DELAY_MS behind the real
 * content.  Large bursts get spread over that window; steady streams flow
 * through with almost no added latency.
 *
 * @param target  The full accumulated string (grows as stream chunks arrive)
 * @param active  `true` while streaming; when `false`, returns `target` immediately
 */
export function useTypewriter(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState("");
  const lenRef = useRef(0);
  const targetRef = useRef(target);
  const activeRef = useRef(active);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Keep refs in sync so the animation loop always sees latest values
  targetRef.current = target;
  activeRef.current = active;

  // Reset when target clears (new streaming session)
  useEffect(() => {
    if (!target) {
      lenRef.current = 0;
      lastTimeRef.current = 0;
      setDisplayed("");
    }
  }, [target]);

  // Flush immediately when streaming ends
  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      if (target) {
        lenRef.current = target.length;
        setDisplayed(target);
      }
    }
  }, [active, target]);

  // Main animation loop — runs for the entire streaming session
  useEffect(() => {
    if (!active) return;

    // Target delay in ms — the typewriter aims to be roughly this far behind
    // the real content. Lower → more responsive; higher → smoother.
    const TARGET_DELAY_MS = 150;

    const tick = (now: number) => {
      if (!activeRef.current) return;

      const dt = lastTimeRef.current ? now - lastTimeRef.current : 16;
      lastTimeRef.current = now;

      const t = targetRef.current;
      const cur = lenRef.current;

      // Safety: if target somehow shrank, clamp
      if (cur > t.length) {
        lenRef.current = t.length;
        setDisplayed(t);
      } else if (cur < t.length) {
        const buffer = t.length - cur;
        const step = Math.max(1, Math.round((buffer * dt) / TARGET_DELAY_MS));
        const newLen = Math.min(cur + step, t.length);
        lenRef.current = newLen;
        setDisplayed(t.slice(0, newLen));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
    };
  }, [active]);

  return active ? displayed : target;
}
