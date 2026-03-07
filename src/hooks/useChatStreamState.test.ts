// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/stores/dataStore", () => ({
  useDataStore: vi.fn(),
}));

vi.mock("@/stores/streamStore", () => ({
  useStreamStore: vi.fn(),
}));

import { useDataStore } from "@/stores/dataStore";
import { useStreamStore } from "@/stores/streamStore";
import { useChatStreamState } from "./useChatStreamState";

function mockStores(activeId: string | null, streams: Record<string, unknown>) {
  vi.mocked(useDataStore).mockImplementation((sel: (s: Record<string, unknown>) => unknown) =>
    sel({ activeConversationId: activeId }) as never,
  );
  vi.mocked(useStreamStore).mockImplementation((sel: (s: Record<string, unknown>) => unknown) =>
    sel({ streams }) as never,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("useChatStreamState", () => {
  it("returns defaults when no active conversation", () => {
    mockStores(null, {});
    const { result } = renderHook(() => useChatStreamState());
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingContent).toBe("");
    expect(result.current.streamingReasoning).toBe("");
    expect(result.current.streamingToolCalls).toEqual([]);
    expect(result.current.streamingParts).toEqual([]);
    expect(result.current.isCompressing).toBe(false);
    expect(result.current.compressionNotice).toBeNull();
  });

  it("returns defaults when active conversation has no stream", () => {
    mockStores("conv-1", {});
    const { result } = renderHook(() => useChatStreamState());
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingContent).toBe("");
  });

  it("returns stream state for active conversation", () => {
    mockStores("conv-1", {
      "conv-1": {
        isStreaming: true,
        streamingContent: "hello",
        streamingReasoning: "thinking",
        streamingToolCalls: [{ id: "tc1", toolName: "test", args: {}, isLoading: true }],
        streamingParts: [{ type: "text", text: "hello" }],
        isCompressing: true,
        compressionNotice: "compressed",
      },
    });
    const { result } = renderHook(() => useChatStreamState());
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.streamingContent).toBe("hello");
    expect(result.current.streamingReasoning).toBe("thinking");
    expect(result.current.streamingToolCalls).toHaveLength(1);
    expect(result.current.streamingParts).toHaveLength(1);
    expect(result.current.isCompressing).toBe(true);
    expect(result.current.compressionNotice).toBe("compressed");
  });

  it("does not return stream from a different conversation", () => {
    mockStores("conv-1", {
      "conv-2": { isStreaming: true, streamingContent: "other" },
    });
    const { result } = renderHook(() => useChatStreamState());
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.streamingContent).toBe("");
  });
});
