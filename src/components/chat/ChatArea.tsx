import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { ChatHeader } from "./ChatHeader";

interface ChatAreaProps {
  leftSidebarOpen: boolean;
  onOpenModelSelector: () => void;
}

export function ChatArea({
  leftSidebarOpen,
  onOpenModelSelector,
}: ChatAreaProps) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ChatHeader leftSidebarOpen={leftSidebarOpen} />
      <MessageList />
      <ChatInput onOpenModelSelector={onOpenModelSelector} />
    </div>
  );
}
