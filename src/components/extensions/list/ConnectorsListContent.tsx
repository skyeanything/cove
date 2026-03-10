import { useEffect, useState } from "react";
import { ChevronRight, Blocks } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useExtensionStore } from "@/stores/extensionStore";
import { mcpServerRepo } from "@/db/repos/mcpServerRepo";
import type { McpServer } from "@/db/types";

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

export function ConnectorsListContent() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);
  const connectorsVersion = useExtensionStore((s) => s.connectorsVersion);

  useEffect(() => {
    let cancelled = false;
    mcpServerRepo.getAll().then((list) => {
      if (!cancelled) { setServers(list); setLoaded(true); }
    });
    return () => { cancelled = true; };
  }, [connectorsVersion]);

  const handleToggle = async (server: McpServer) => {
    const next = server.enabled ? 0 : 1;
    await mcpServerRepo.update(server.id, { enabled: next });
    setServers((prev) => prev.map((s) => s.id === server.id ? { ...s, enabled: next } : s));
  };

  if (!loaded) {
    return (
      <div className="px-3 py-4 text-[12px] text-foreground-tertiary">加载中...</div>
    );
  }

  const myServers = servers;

  return (
    <div className="flex flex-col gap-1 p-2">
      <CategorySection title="我的" count={myServers.length}>
        {myServers.map((server) => {
          const key = `connector:${server.id}`;
          const isSelected = selectedKey === key;
          return (
            <div
              key={server.id}
              onClick={() => setSelectedKey(key)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
                isSelected ? "bg-background-tertiary" : "hover:bg-background-tertiary/60",
              )}
            >
              <Blocks className="size-[14px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  server.enabled ? "text-foreground" : "text-foreground-secondary",
                )}
              >
                {server.name}
              </span>
              <div onClick={(e) => { e.stopPropagation(); void handleToggle(server); }}>
                <Switch
                  checked={!!server.enabled}
                  onCheckedChange={() => {}}
                  className="h-[18px] w-[30px] data-[state=checked]:[&>span]:translate-x-[14px] [&>span]:size-[14px]"
                />
              </div>
            </div>
          );
        })}
      </CategorySection>

      {servers.length === 0 && (
        <div className="px-2 py-3 text-[12px] text-foreground-tertiary">
          暂无 Connector，点击 + 新建
        </div>
      )}
    </div>
  );
}
