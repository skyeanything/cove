import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Global hook that makes all elements with `data-tauri-drag-region`
 * trigger window dragging on mousedown (Tauri 2 API).
 */
export function useTauriDrag() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Walk up from the event target to find a drag region
      let el = e.target as HTMLElement | null;
      while (el) {
        // Stop if we hit an interactive element — don't drag
        if (
          el.tagName === "BUTTON" ||
          el.tagName === "A" ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT"
        ) {
          return;
        }
        // Found a drag region — start dragging
        if (el.hasAttribute("data-tauri-drag-region")) {
          e.preventDefault();
          getCurrentWindow().startDragging();
          return;
        }
        el = el.parentElement;
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
}
