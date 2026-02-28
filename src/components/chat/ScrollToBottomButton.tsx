import { ArrowDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

export function ScrollToBottomButton({
  visible,
  onClick,
}: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to bottom"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className="absolute bottom-2 left-1/2 z-10 flex size-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-background shadow-md transition-all duration-150 hover:bg-background-tertiary"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) translateY(${visible ? "0" : "8px"})`,
        pointerEvents: visible ? "auto" : "none",
        transitionTimingFunction: visible ? "ease-out" : "ease-in",
      }}
    >
      <ArrowDown className="size-4 text-foreground-secondary" strokeWidth={1.5} />
    </button>
  );
}
