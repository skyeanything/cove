/** 上下文用量环形指示器，0–100% */
export function ContextRing({ percent }: { percent: number }) {
  const size = 16;
  const r = 7;
  const stroke = 1.5;
  const circumference = 2 * Math.PI * (r - stroke / 2);
  const dashOffset = circumference - (percent / 100) * circumference;
  const c = size / 2;
  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden>
      <circle
        cx={c}
        cy={c}
        r={r - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-20"
      />
      <circle
        cx={c}
        cy={c}
        r={r - stroke / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-300"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
}
