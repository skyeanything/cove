// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMentionDetect } from "./useMentionDetect";

describe("useMentionDetect", () => {
  describe("updateMention", () => {
    it("detects @ at start of input", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@foo", 4));
      expect(result.current.mentionState).toEqual({
        open: true,
        query: "foo",
        triggerIndex: 0,
      });
    });

    it("detects @ preceded by whitespace", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("hello @ba", 9));
      expect(result.current.mentionState).toEqual({
        open: true,
        query: "ba",
        triggerIndex: 6,
      });
    });

    it("does not detect @ preceded by non-whitespace", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("hello@foo", 9));
      expect(result.current.mentionState.open).toBe(false);
    });

    it("returns empty query when cursor is right after @", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@", 1));
      expect(result.current.mentionState).toEqual({
        open: true,
        query: "",
        triggerIndex: 0,
      });
    });

    it("closes when query contains whitespace", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@foo bar", 8));
      expect(result.current.mentionState.open).toBe(false);
    });

    it("closes when no @ found before cursor", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("hello world", 11));
      expect(result.current.mentionState.open).toBe(false);
    });

    it("detects @ after newline", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("line1\n@test", 11));
      expect(result.current.mentionState).toEqual({
        open: true,
        query: "test",
        triggerIndex: 6,
      });
    });

    it("detects @ after tab", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("x\t@ab", 5));
      expect(result.current.mentionState).toEqual({
        open: true,
        query: "ab",
        triggerIndex: 2,
      });
    });

    it("closes previously open mention when text changes", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@foo", 4));
      expect(result.current.mentionState.open).toBe(true);

      act(() => result.current.updateMention("no mention", 10));
      expect(result.current.mentionState.open).toBe(false);
    });
  });

  describe("closeMention", () => {
    it("closes an open mention", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@foo", 4));
      expect(result.current.mentionState.open).toBe(true);

      act(() => result.current.closeMention());
      expect(result.current.mentionState.open).toBe(false);
    });
  });

  describe("insertMention", () => {
    it("replaces @query with @type:id and trailing space", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("hello @offi", 11));

      let inserted: { newMessage: string; newCursorPos: number } | undefined;
      act(() => {
        inserted = result.current.insertMention("hello @offi", 11, "tool", "officellm");
      });

      expect(inserted!.newMessage).toBe("hello @tool:officellm ");
      expect(inserted!.newCursorPos).toBe("hello @tool:officellm ".length);
    });

    it("preserves text after cursor", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@ba more text", 3));

      let inserted: { newMessage: string; newCursorPos: number } | undefined;
      act(() => {
        inserted = result.current.insertMention("@ba more text", 3, "tool", "bash");
      });

      expect(inserted!.newMessage).toBe("@tool:bash  more text");
      expect(inserted!.newCursorPos).toBe("@tool:bash ".length);
    });

    it("closes mention state after insertion", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@x", 2));
      act(() => {
        result.current.insertMention("@x", 2, "skill", "my-skill");
      });
      expect(result.current.mentionState.open).toBe(false);
    });

    it("returns unchanged message when triggerIndex is invalid", () => {
      const { result } = renderHook(() => useMentionDetect());
      // Don't open a mention first
      let inserted: { newMessage: string; newCursorPos: number } | undefined;
      act(() => {
        inserted = result.current.insertMention("hello", 5, "tool", "bash");
      });
      expect(inserted!.newMessage).toBe("hello");
      expect(inserted!.newCursorPos).toBe(5);
    });

    it("handles file type mentions", () => {
      const { result } = renderHook(() => useMentionDetect());
      act(() => result.current.updateMention("@pack", 5));

      let inserted: { newMessage: string; newCursorPos: number } | undefined;
      act(() => {
        inserted = result.current.insertMention("@pack", 5, "file", "package.json");
      });

      expect(inserted!.newMessage).toBe("@file:package.json ");
      expect(inserted!.newCursorPos).toBe("@file:package.json ".length);
    });
  });
});
