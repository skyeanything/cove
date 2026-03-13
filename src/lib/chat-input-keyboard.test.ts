// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  GLOBAL_CHAT_HISTORY_LIMIT,
  canNavigateHistoryBoundary,
  isEditableTarget,
  isTargetInTransientOverlay,
} from "./chat-input-keyboard";

describe("chat-input-keyboard", () => {
  it("exports the capped global history limit", () => {
    expect(GLOBAL_CHAT_HISTORY_LIMIT).toBe(30);
  });

  it("detects editable targets", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);

    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isEditableTarget(div)).toBe(true);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
  });

  it("detects dialog and popover content ancestry", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("data-slot", "dialog-content");
    const button = document.createElement("button");
    dialog.append(button);
    expect(isTargetInTransientOverlay(button)).toBe(true);
    expect(isTargetInTransientOverlay(document.createElement("button"))).toBe(false);
  });

  it("allows ArrowUp only from the first logical line", () => {
    expect(canNavigateHistoryBoundary("single line", 5, 5, "up")).toBe(true);
    expect(canNavigateHistoryBoundary("first\nsecond", 2, 2, "up")).toBe(true);
    expect(canNavigateHistoryBoundary("first\nsecond", 8, 8, "up")).toBe(false);
  });

  it("allows ArrowDown only from the last logical line", () => {
    expect(canNavigateHistoryBoundary("single line", 5, 5, "down")).toBe(true);
    expect(canNavigateHistoryBoundary("first\nsecond", 8, 8, "down")).toBe(true);
    expect(canNavigateHistoryBoundary("first\nsecond", 2, 2, "down")).toBe(false);
  });

  it("disables history navigation when text is selected", () => {
    expect(canNavigateHistoryBoundary("hello", 1, 3, "up")).toBe(false);
    expect(canNavigateHistoryBoundary("hello", 1, 3, "down")).toBe(false);
  });
});
