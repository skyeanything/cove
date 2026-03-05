import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mcpServerRepo } from "@/db/repos/mcpServerRepo";
import { ExtensionCard } from "../ExtensionCard";
import type { McpServer } from "@/db/types";

export function McpTabContent() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    mcpServerRepo.getAll().then((list) => {
      if (!cancelled) {
        setServers(list);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (server: McpServer) => {
    const next = server.enabled ? 0 : 1;
    await mcpServerRepo.update(server.id, { enabled: next });
    setServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, enabled: next } : s)));
  };

  const handleDelete = async (id: string) => {
    await mcpServerRepo.delete(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  if (!loaded) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        {t("preview.loading")}
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        {t("extensions.noMcp", "No MCP servers configured yet.")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {servers.map((server) => (
        <ExtensionCard
          key={server.id}
          icon="🔌"
          name={server.name}
          description={`${server.type}${server.url ? ` · ${server.url}` : ""}${server.command ? ` · ${server.command}` : ""}`}
          badge="personal"
          enabled={!!server.enabled}
          onToggle={() => void handleToggle(server)}
          onDelete={() => void handleDelete(server.id)}
        />
      ))}
    </div>
  );
}
