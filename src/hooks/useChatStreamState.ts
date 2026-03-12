import { useStreamStore } from "@/stores/streamStore";
import { useDataStore } from "@/stores/dataStore";
import { useShallow } from "zustand/react/shallow";
import type { ToolCallInfo, MessagePart } from "@/stores/chat-types";

const EMPTY_TOOL_CALLS: ToolCallInfo[] = [];
const EMPTY_PARTS: MessagePart[] = [];

/** Full stream state with shallow equality (prevents re-render when values are unchanged) */
export function useChatStreamState() {
  const activeId = useDataStore((s) => s.activeConversationId);
  return useStreamStore(useShallow((s) => {
    const stream = activeId ? s.streams[activeId] : undefined;
    return {
      isStreaming: stream?.isStreaming ?? false,
      streamingContent: stream?.streamingContent ?? "",
      streamingReasoning: stream?.streamingReasoning ?? "",
      streamingToolCalls: stream?.streamingToolCalls ?? EMPTY_TOOL_CALLS,
      streamingParts: stream?.streamingParts ?? EMPTY_PARTS,
      isCompressing: stream?.isCompressing ?? false,
      compressionNotice: stream?.compressionNotice ?? null,
    };
  }));
}

/** Lightweight selector: only the isStreaming boolean (for components that just need to know if streaming) */
export function useIsStreaming(): boolean {
  const activeId = useDataStore((s) => s.activeConversationId);
  return useStreamStore((s) =>
    activeId ? (s.streams[activeId]?.isStreaming ?? false) : false,
  );
}
