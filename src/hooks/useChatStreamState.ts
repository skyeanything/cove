import { useStreamStore } from "@/stores/streamStore";
import { useDataStore } from "@/stores/dataStore";

export function useChatStreamState() {
  const activeId = useDataStore((s) => s.activeConversationId);
  const stream = useStreamStore((s) => activeId ? s.streams[activeId] : undefined);
  return {
    isStreaming: stream?.isStreaming ?? false,
    streamingContent: stream?.streamingContent ?? "",
    streamingReasoning: stream?.streamingReasoning ?? "",
    streamingToolCalls: stream?.streamingToolCalls ?? [],
    streamingParts: stream?.streamingParts ?? [],
    isCompressing: stream?.isCompressing ?? false,
    compressionNotice: stream?.compressionNotice ?? null,
  };
}
