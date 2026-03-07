import { useLayoutStore, WS_FILE_TREE_MIN, WS_FILE_TREE_MAX, WS_CHAT_MIN, WS_CHAT_MAX } from "@/stores/layoutStore";
import { FileTreePanel } from "@/components/preview/FileTreePanel";
import { FilePreviewPanel } from "@/components/preview/FilePreviewPanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { ContextAnchorBanner } from "@/components/chat/ContextAnchorBanner";
import { ResizeHandle } from "./ResizeHandle";
import { useState } from "react";

/**
 * Workspace mode: 3 columns (FileTree | Preview/Edit | Chat).
 * Chat is on the right side, matching IDE-plugin conventions.
 */
export function WorkspaceContent() {
  const wsFileTreeWidth = useLayoutStore((s) => s.wsFileTreeWidth);
  const setWsFileTreeWidth = useLayoutStore((s) => s.setWsFileTreeWidth);
  const wsChatWidth = useLayoutStore((s) => s.wsChatWidth);
  const setWsChatWidth = useLayoutStore((s) => s.setWsChatWidth);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-1">
      {/* Column 1: File tree */}
      <div
        className="relative flex shrink-0 flex-col overflow-hidden border-r border-border"
        style={{ width: wsFileTreeWidth, minWidth: WS_FILE_TREE_MIN }}
      >
        <FileTreePanel />
        <ResizeHandle
          side="left"
          currentWidth={wsFileTreeWidth}
          onResize={setWsFileTreeWidth}
          minWidth={WS_FILE_TREE_MIN}
          maxWidth={WS_FILE_TREE_MAX}
        />
      </div>

      {/* Column 2: File preview / edit (auto-fill) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <FilePreviewPanel />
      </div>

      {/* Column 3: Chat area (right side) */}
      <div
        className="relative flex shrink-0 flex-col overflow-hidden border-l border-border"
        style={{ width: wsChatWidth, minWidth: WS_CHAT_MIN }}
      >
        <ChatArea
          modelSelectorOpen={modelSelectorOpen}
          onModelSelectorOpenChange={setModelSelectorOpen}
          aboveInput={<ContextAnchorBanner />}
        />
        <ResizeHandle
          side="right"
          currentWidth={wsChatWidth}
          onResize={setWsChatWidth}
          minWidth={WS_CHAT_MIN}
          maxWidth={WS_CHAT_MAX}
        />
      </div>
    </div>
  );
}
