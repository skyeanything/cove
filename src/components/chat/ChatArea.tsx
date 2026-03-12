import { ChatInput } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { PermissionOverlay } from "./PermissionOverlay";
import { usePermissionStore } from "@/stores/permissionStore";
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
  const hasPendingPermission = usePermissionStore((s) => s.pendingAsk !== null);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ChatHeader />
      <MessageList />
      {aboveInput}
      {hasPendingPermission
        ? <PermissionOverlay />
        : (
          <ChatInput
            modelSelectorOpen={modelSelectorOpen}
            onModelSelectorOpenChange={onModelSelectorOpenChange}
          />
        )
      }
    </div>
  );
}
