import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExtensionStore } from "@/stores/extensionStore";

interface ToolRow {
  key: string;
  icon: string;
  name: string;
  description: string;
  enabled: boolean;
}

function CategorySection({
  title,
  children,
  count,
}: {
  title: string;
  children: React.ReactNode;
  count: number;
}) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] font-medium text-foreground-secondary transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn("size-3 transition-transform duration-150", open && "rotate-90")}
          strokeWidth={2}
        />
        {title}
      </button>
      {open && <div className="flex flex-col">{children}</div>}
    </div>
  );
}

// Built-in tool/plugin entries
const PRESET_TOOLS: ToolRow[] = [
  {
    key: "tool:word",
    icon: "📝",
    name: "Word",
    description: "Embed AI assistant into Microsoft Word",
    enabled: true,
  },
];

export function ToolsListContent() {
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);

  return (
    <div className="flex flex-col gap-1 p-2">
      <CategorySection title="预设" count={PRESET_TOOLS.length}>
        {PRESET_TOOLS.map((tool) => {
          const isSelected = selectedKey === tool.key;
          return (
            <div
              key={tool.key}
              onClick={() => setSelectedKey(tool.key)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                isSelected ? "bg-background-tertiary" : "hover:bg-background-tertiary/60",
              )}
            >
              <span className="w-4 shrink-0" />
              <Wrench className="size-[14px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  tool.enabled ? "text-foreground" : "text-foreground-secondary",
                )}
              >
                {tool.name}
              </span>
            </div>
          );
        })}
      </CategorySection>
    </div>
  );
}
