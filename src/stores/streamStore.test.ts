import { describe, it, expect, vi, beforeEach } from "vitest";
import { useStreamStore } from "./streamStore";
import { createStoreReset } from "@/test-utils";

const resetStore = createStoreReset(useStreamStore);
beforeEach(() => { vi.clearAllMocks(); resetStore(); });

describe("streamStore", () => {
  describe("startStream", () => {
    it("creates a stream entry with initial state", () => {
      const ac = new AbortController();
      useStreamStore.getState().startStream("conv-1", ac);
      const stream = useStreamStore.getState().streams["conv-1"];
      expect(stream).toBeDefined();
      expect(stream!.isStreaming).toBe(true);
      expect(stream!.streamingContent).toBe("");
      expect(stream!.streamingReasoning).toBe("");
      expect(stream!.streamingToolCalls).toEqual([]);
      expect(stream!.streamingParts).toEqual([]);
      expect(stream!.abortController).toBe(ac);
      expect(stream!.isCompressing).toBe(false);
      expect(stream!.compressionNotice).toBeNull();
    });

    it("supports concurrent streams for different conversations", () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      useStreamStore.getState().startStream("conv-1", ac1);
      useStreamStore.getState().startStream("conv-2", ac2);
      expect(useStreamStore.getState().streams["conv-1"]).toBeDefined();
      expect(useStreamStore.getState().streams["conv-2"]).toBeDefined();
      expect(useStreamStore.getState().streams["conv-1"]!.abortController).toBe(ac1);
      expect(useStreamStore.getState().streams["conv-2"]!.abortController).toBe(ac2);
    });
  });

  describe("updateStream", () => {
    it("merges partial state into existing stream", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      useStreamStore.getState().updateStream("conv-1", { streamingContent: "hello" });
      expect(useStreamStore.getState().streams["conv-1"]!.streamingContent).toBe("hello");
      expect(useStreamStore.getState().streams["conv-1"]!.isStreaming).toBe(true);
    });

    it("no-ops when stream does not exist", () => {
      const before = useStreamStore.getState().streams;
      useStreamStore.getState().updateStream("nonexistent", { streamingContent: "test" });
      expect(useStreamStore.getState().streams).toBe(before);
    });

    it("does not affect other streams", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      useStreamStore.getState().startStream("conv-2", new AbortController());
      useStreamStore.getState().updateStream("conv-1", { streamingContent: "hello" });
      expect(useStreamStore.getState().streams["conv-2"]!.streamingContent).toBe("");
    });
  });

  describe("endStream", () => {
    it("removes the stream entry", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      useStreamStore.getState().endStream("conv-1");
      expect(useStreamStore.getState().streams["conv-1"]).toBeUndefined();
    });

    it("does not affect other streams", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      useStreamStore.getState().startStream("conv-2", new AbortController());
      useStreamStore.getState().endStream("conv-1");
      expect(useStreamStore.getState().streams["conv-1"]).toBeUndefined();
      expect(useStreamStore.getState().streams["conv-2"]).toBeDefined();
    });
  });

  describe("abortStream", () => {
    it("calls abort on the AbortController and removes entry", () => {
      const ac = new AbortController();
      const spy = vi.spyOn(ac, "abort");
      useStreamStore.getState().startStream("conv-1", ac);
      useStreamStore.getState().abortStream("conv-1");
      expect(spy).toHaveBeenCalled();
      expect(useStreamStore.getState().streams["conv-1"]).toBeUndefined();
    });

    it("does not throw for nonexistent stream", () => {
      expect(() => useStreamStore.getState().abortStream("nonexistent")).not.toThrow();
    });

    it("does not affect other streams", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      useStreamStore.getState().startStream("conv-2", new AbortController());
      useStreamStore.getState().abortStream("conv-1");
      expect(useStreamStore.getState().streams["conv-2"]!.isStreaming).toBe(true);
    });
  });

  describe("getStream", () => {
    it("returns stream state for existing conversation", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      const stream = useStreamStore.getState().getStream("conv-1");
      expect(stream?.isStreaming).toBe(true);
    });

    it("returns undefined for nonexistent conversation", () => {
      expect(useStreamStore.getState().getStream("nonexistent")).toBeUndefined();
    });
  });

  describe("isConversationStreaming", () => {
    it("returns true for active stream", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      expect(useStreamStore.getState().isConversationStreaming("conv-1")).toBe(true);
    });

    it("returns false after stream ends", () => {
      useStreamStore.getState().startStream("conv-1", new AbortController());
      useStreamStore.getState().endStream("conv-1");
      expect(useStreamStore.getState().isConversationStreaming("conv-1")).toBe(false);
    });

    it("returns false for nonexistent conversation", () => {
      expect(useStreamStore.getState().isConversationStreaming("nonexistent")).toBe(false);
    });
  });
});
