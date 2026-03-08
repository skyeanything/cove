import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExtensionStore } from "@/stores/extensionStore";
import { ALL_TOOL_INFOS, type ToolInfo } from "@/lib/ai/tools/tool-meta";

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

export function ToolsListContent({ searchQuery = "" }: { searchQuery?: string }) {
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);

  const q = searchQuery.trim().toLowerCase();
  const builtIn = ALL_TOOL_INFOS.filter(
    (i) => i.category === "built-in" && (!q || i.name.toLowerCase().includes(q)),
  );
  const skillBundled = ALL_TOOL_INFOS.filter(
    (i) => i.category === "skill-bundled" && (!q || i.name.toLowerCase().includes(q)),
  );

  const renderRow = (info: ToolInfo) => {
    const key = `tool:${info.id}`;
    const isSelected = selectedKey === key;
    return (
      <div
        key={key}
        onClick={() => setSelectedKey(key)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
          isSelected ? "bg-background-tertiary" : "hover:bg-background-tertiary/60",
        )}
      >
        <span className="w-4 shrink-0" />
        <Wrench className="size-[14px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {info.name}
        </span>
      </div>
    );
  };

  const isEmpty = builtIn.length === 0 && skillBundled.length === 0;

  return (
    <div className="flex flex-col gap-1 p-2">
      <CategorySection title="内置" count={builtIn.length}>
        {builtIn.map(renderRow)}
      </CategorySection>
      <CategorySection title="技能工具" count={skillBundled.length}>
        {skillBundled.map(renderRow)}
      </CategorySection>
      {q && isEmpty && (
        <div className="px-2 py-3 text-[12px] text-foreground-tertiary">无匹配结果</div>
      )}
    </div>
  );
}
