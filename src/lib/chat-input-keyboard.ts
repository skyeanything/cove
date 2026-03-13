export const GLOBAL_CHAT_HISTORY_LIMIT = 30;

export function isEditableTarget(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

export function isTargetInTransientOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(
    '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="popover-content"]',
  ) !== null;
}

export function canNavigateHistoryBoundary(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: "up" | "down",
): boolean {
  if (selectionStart !== selectionEnd) return false;
  if (direction === "up") return !value.slice(0, selectionStart).includes("\n");
  return !value.slice(selectionStart).includes("\n");
}
