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
  // 当前已显示长度（浮点，便于平滑推进）
  const lenRef = useRef(0);
  const targetRef = useRef(target);
  const activeRef = useRef(active);
  const rafRef = useRef(0);
  // 统一保存播放状态，避免新增 hook 数量导致热更新时 hook 链抖动
  const runtimeRef = useRef({
    lastFrameTs: 0,
    lastArrivalTs: 0,
    prevTargetLen: 0,
    emaGapMs: 48,
    emaGapDevMs: 8,
    emaRateCps: 28,
  });

  // Keep refs in sync so the animation loop always sees latest values
  targetRef.current = target;
  activeRef.current = active;

  // Reset when target clears (new streaming session)
  useEffect(() => {
    const rt = runtimeRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextLen = target.length;
    const prevLen = rt.prevTargetLen;

    if (!target) {
      lenRef.current = 0;
      runtimeRef.current = {
        ...rt,
        lastFrameTs: 0,
        lastArrivalTs: 0,
        prevTargetLen: 0,
        emaGapMs: 48,
        emaGapDevMs: 8,
        emaRateCps: 28,
      };
      setDisplayed("");
      return;
    }

    // 记录到达节奏：用 EWMA 估计 provider 的“发包间隔”和“瞬时产出速率”
    let nextGapMs = rt.emaGapMs;
    let nextGapDevMs = rt.emaGapDevMs;
    let nextRateCps = rt.emaRateCps;
    let nextArrivalTs = rt.lastArrivalTs;
    if (nextLen > prevLen) {
      const deltaChars = nextLen - prevLen;
      if (nextArrivalTs > 0) {
        const gapMs = Math.max(1, now - nextArrivalTs);
        nextGapMs = nextGapMs * 0.82 + gapMs * 0.18;
        nextGapDevMs = nextGapDevMs * 0.82 + Math.abs(gapMs - nextGapMs) * 0.18;
        const sampleRate = Math.min(220, (deltaChars * 1000) / gapMs);
        nextRateCps = nextRateCps * 0.78 + sampleRate * 0.22;
      }
      nextArrivalTs = now;
    }

    runtimeRef.current = {
      ...rt,
      lastArrivalTs: nextArrivalTs,
      prevTargetLen: nextLen,
      emaGapMs: nextGapMs,
      emaGapDevMs: nextGapDevMs,
      emaRateCps: nextRateCps,
    };
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

    // 观感优先参数：稳定匀速 + 适度缓存 + 快速追平
    const MIN_SPEED_CPS = 10;
    const CRUISE_SPEED_CPS = 22;
    const MAX_SPEED_CPS = 72;
    const CATCHUP_GAIN = 0.95;
    const SLOWDOWN_GAIN = 0.5;
    const BASE_TARGET_LAG_MS = 640;
    const MIN_TARGET_LAG_MS = 420;
    const MAX_TARGET_LAG_MS = 1800;
    const MIN_LAG_CHARS = 20;
    const MAX_LAG_CHARS = 180;
    const STALL_RECOVERY_MS = 980;
    const MAX_DT_MS = 40;
    const MIN_DT_MS = 8;

    const tick = (now: number) => {
      if (!activeRef.current) return;

      const rt = runtimeRef.current;
      const dt = rt.lastFrameTs ? Math.min(MAX_DT_MS, Math.max(MIN_DT_MS, now - rt.lastFrameTs)) : 16;
      runtimeRef.current = { ...rt, lastFrameTs: now };
      const t = targetRef.current;
      const cur = Math.floor(lenRef.current);
      const targetLen = t.length;

      // Safety: if target somehow shrank, clamp
      if (cur > targetLen) {
        lenRef.current = targetLen;
        setDisplayed(t);
      } else if (cur < targetLen) {
        const backlog = targetLen - lenRef.current;
        const sinceArrival = rt.lastArrivalTs > 0 ? now - rt.lastArrivalTs : 0;

        // provider 发包抖动越大，目标缓冲越大，能有效抹平 Moonshot 的长停顿
        const targetLagMs = Math.min(
          MAX_TARGET_LAG_MS,
          Math.max(MIN_TARGET_LAG_MS, BASE_TARGET_LAG_MS + rt.emaGapDevMs * 2.2),
        );
        let desiredLagChars = Math.min(
          MAX_LAG_CHARS,
          Math.max(MIN_LAG_CHARS, (rt.emaRateCps * targetLagMs) / 1000),
        );

        // 长时间无新包时，逐步释放缓冲，避免“尾巴拖太久”
        if (sinceArrival > STALL_RECOVERY_MS) {
          const release = Math.min(0.85, (sinceArrival - STALL_RECOVERY_MS) / 1800);
          desiredLagChars *= 1 - release;
        }

        const lagError = backlog - desiredLagChars;
        let speed = Math.min(CRUISE_SPEED_CPS, Math.max(MIN_SPEED_CPS, rt.emaRateCps * 0.72));
        if (lagError > 0) {
          speed += lagError * CATCHUP_GAIN;
        } else {
          speed += lagError * SLOWDOWN_GAIN;
        }

        // 缓冲过低时主动降速，避免追平过快后出现“停一下”
        if (backlog < desiredLagChars * 0.6) {
          speed *= 0.58;
        } else if (backlog < desiredLagChars * 0.8) {
          speed *= 0.78;
        }

        speed = Math.min(MAX_SPEED_CPS, Math.max(MIN_SPEED_CPS, speed));
        lenRef.current = Math.min(targetLen, lenRef.current + (speed * dt) / 1000);
        const newLen = Math.max(cur, Math.floor(lenRef.current));
        if (newLen !== cur) {
          setDisplayed(t.slice(0, newLen));
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      runtimeRef.current = { ...runtimeRef.current, lastFrameTs: 0 };
    };
  }, [active]);

  return active ? displayed : target;
}
