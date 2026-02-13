import { Button } from "@/components/ui/button";
import { PanelLeft, SquarePen } from "lucide-react";

interface WindowControlsProps {
  onToggleSidebar: () => void;
  onNewChat?: () => void;
}

/**
 * Sidebar toggle + New chat buttons.
 * Always pinned to the top-left of the window, right after macOS traffic lights.
 * These never move regardless of sidebar state.
 */
export function WindowControls({ onToggleSidebar, onNewChat }: WindowControlsProps) {
  return (
    <div
      className="no-select pointer-events-none fixed left-0 top-0 z-50 flex h-[52px] items-center"
    >
      {/* Space for macOS traffic lights */}
      <div className="w-[96px] shrink-0" />

      {/* Buttons — re-enable pointer events */}
      <div className="pointer-events-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
          title="Toggle sidebar"
        >
          <PanelLeft className="size-[18px]" strokeWidth={1.5} />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNewChat}
          className="text-muted-foreground hover:text-foreground"
          title="New chat"
        >
          <SquarePen className="size-[18px]" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
