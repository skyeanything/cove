import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  side: "left" | "right";
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  currentWidth: number;
}

export function ResizeHandle({
  side,
  onResize,
  minWidth = 200,
  maxWidth = 480,
  currentWidth,
}: ResizeHandleProps) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = currentWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [currentWidth],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = side === "left"
        ? e.clientX - startX.current
        : startX.current - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [side, onResize, minWidth, maxWidth]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "absolute top-0 bottom-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-ring/30",
        side === "left" ? "right-0" : "left-0",
      )}
    />
  );
}
