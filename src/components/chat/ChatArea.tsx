import { ChatInput } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";

interface ChatAreaProps {
  leftSidebarOpen: boolean;
  modelSelectorOpen?: boolean;
  onModelSelectorOpenChange?: (open: boolean) => void;
}

export function ChatArea({
  leftSidebarOpen,
  modelSelectorOpen,
  onModelSelectorOpenChange,
}: ChatAreaProps) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ChatHeader leftSidebarOpen={leftSidebarOpen} />
      <MessageList />
      <ChatInput
        modelSelectorOpen={modelSelectorOpen}
        onModelSelectorOpenChange={onModelSelectorOpenChange}
      />
    </div>
  );
}
