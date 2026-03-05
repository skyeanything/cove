import { ChatArea } from "@/components/chat/ChatArea";
import { useState } from "react";

/**
 * Conversation mode content: full-width ChatArea.
 * Shown when activePage === "chat".
 */
export function ConversationContent() {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ChatArea
        modelSelectorOpen={modelSelectorOpen}
        onModelSelectorOpenChange={setModelSelectorOpen}
      />
    </div>
  );
}
