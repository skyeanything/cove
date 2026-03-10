import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { subAgentRepo } from "@/db/repos/subAgentRepo";
import { ExtensionCard } from "../ExtensionCard";
import type { SubAgentDef } from "@/db/types";

export function SubAgentTabContent() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<SubAgentDef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadAgents = () => {
    let cancelled = false;
    subAgentRepo.getAll().then((list) => {
      if (!cancelled) {
        setAgents(list);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  };

  useEffect(() => { const cleanup = loadAgents(); return cleanup; }, []);

  const handleToggle = async (agent: SubAgentDef) => {
    const next = agent.enabled ? 0 : 1;
    await subAgentRepo.update(agent.id, { enabled: next });
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, enabled: next } : a)));
  };

  const handleDelete = async (id: string) => {
    await subAgentRepo.delete(id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  if (!loaded) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        {t("preview.loading")}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        {t("extensions.noSubAgents", "No sub-agents created yet. Click Create to add one.")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <ExtensionCard
          key={agent.id}
          icon={agent.icon || "🤖"}
          name={agent.name}
          description={agent.description}
          badge="personal"
          enabled={!!agent.enabled}
          onToggle={() => void handleToggle(agent)}
          onDelete={() => void handleDelete(agent.id)}
        />
      ))}
    </div>
  );
}
