import { useEffect, useState } from "react";
import { ChevronRight, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useExtensionStore } from "@/stores/extensionStore";
import { subAgentRepo } from "@/db/repos/subAgentRepo";
import type { SubAgentDef } from "@/db/types";

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

export function SubAgentListContent({ searchQuery = "" }: { searchQuery?: string }) {
  const [agents, setAgents] = useState<SubAgentDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);
  const subagentsVersion = useExtensionStore((s) => s.subagentsVersion);

  useEffect(() => {
    let cancelled = false;
    subAgentRepo.getAll().then((list) => {
      if (!cancelled) { setAgents(list); setLoaded(true); }
    });
    return () => { cancelled = true; };
  }, [subagentsVersion]);

  const handleToggle = async (agent: SubAgentDef) => {
    const next = agent.enabled ? 0 : 1;
    await subAgentRepo.update(agent.id, { enabled: next });
    setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, enabled: next } : a));
  };

  if (!loaded) {
    return (
      <div className="px-3 py-4 text-[12px] text-foreground-tertiary">加载中...</div>
    );
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredAgents = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;

  return (
    <div className="flex flex-col gap-1 p-2">
      <CategorySection title="我的" count={filteredAgents.length}>
        {filteredAgents.map((agent) => {
          const key = `subagent:${agent.id}`;
          const isSelected = selectedKey === key;
          return (
            <div
              key={agent.id}
              onClick={() => setSelectedKey(key)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                isSelected ? "bg-background-tertiary" : "hover:bg-background-tertiary/60",
              )}
            >
              <span className="w-4 shrink-0" />
              <Bot className="size-[14px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  agent.enabled ? "text-foreground" : "text-foreground-secondary",
                )}
              >
                {agent.name}
              </span>
              <div onClick={(e) => { e.stopPropagation(); void handleToggle(agent); }}>
                <Switch
                  checked={!!agent.enabled}
                  onCheckedChange={() => {}}
                  className="h-[18px] w-[30px] data-[state=checked]:[&>span]:translate-x-[14px] [&>span]:size-[14px]"
                />
              </div>
            </div>
          );
        })}
      </CategorySection>

      {agents.length === 0 && !q && (
        <div className="px-2 py-3 text-[12px] text-foreground-tertiary">
          暂无 Agent，点击 + 新建
        </div>
      )}
      {q && filteredAgents.length === 0 && (
        <div className="px-2 py-3 text-[12px] text-foreground-tertiary">无匹配结果</div>
      )}
    </div>
  );
}
