import { ChatInput } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import type { ReactNode } from "react";

interface ChatAreaProps {
  modelSelectorOpen?: boolean;
  onModelSelectorOpenChange?: (open: boolean) => void;
  aboveInput?: ReactNode;
}

export function ChatArea({
  modelSelectorOpen,
  onModelSelectorOpenChange,
  aboveInput,
}: ChatAreaProps) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ChatHeader />
      <MessageList />
      {aboveInput}
      <ChatInput
        modelSelectorOpen={modelSelectorOpen}
        onModelSelectorOpenChange={onModelSelectorOpenChange}
      />
    </div>
  );
}
