import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSkillsStore } from "@/stores/skillsStore";
import { listSkills } from "@/lib/ai/skills/loader";
import { ExtensionCard } from "../ExtensionCard";
import type { ExtensionBadge } from "../ExtensionCard";

type CategoryFilter = "all" | ExtensionBadge;
type StatusFilter = "all" | "installed" | "notInstalled";

interface SkillItem {
  key: string;
  icon: string;
  name: string;
  description: string;
  badge: ExtensionBadge;
}

export function SkillsTabContent() {
  const { t } = useTranslation();
  const externalSkills = useSkillsStore((s) => s.externalSkills);
  const enabledNames = useSkillsStore((s) => s.enabledSkillNames);
  const toggleSkillEnabled = useSkillsStore((s) => s.toggleSkillEnabled);
  const loaded = useSkillsStore((s) => s.loaded);

const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const builtInSkills = useMemo(() => listSkills(), []);

  const allSkills = useMemo<SkillItem[]>(() => {
    const items: SkillItem[] = builtInSkills.map((skill) => ({
      key: `builtin-${skill.name}`,
      icon: skill.emoji ?? "🛠️",
      name: skill.name,
      description: skill.description ?? t("skills.builtIn"),
      badge: "built-in" as ExtensionBadge,
    }));

    for (const ext of externalSkills) {
      if (ext.source === "office-bundled") continue;
      const meta = ext.skill.meta;
      const badge: ExtensionBadge = ext.source === "cove" ? "public" : "personal";
      items.push({
        key: `ext-${ext.folderName}`,
        icon: meta.emoji ?? "📦",
        name: meta.name,
        description: meta.description ?? "",
        badge,
      });
    }
    return items;
  }, [builtInSkills, externalSkills, t]);

  const filteredSkills = useMemo(() => {
    return allSkills.filter((item) => {
      if (categoryFilter !== "all" && item.badge !== categoryFilter) return false;
      if (statusFilter === "installed" && !enabledNames.includes(item.name)) return false;
      if (statusFilter === "notInstalled" && enabledNames.includes(item.name)) return false;
      return true;
    });
  }, [allSkills, categoryFilter, statusFilter, enabledNames]);

  if (!loaded) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        {t("skills.scanning")}
      </div>
    );
  }

  const categoryOptions: { value: CategoryFilter; labelKey: string }[] = [
    { value: "all", labelKey: "extensions.filter.all" },
    { value: "built-in", labelKey: "extensions.filter.builtIn" },
    { value: "public", labelKey: "extensions.filter.public" },
    { value: "personal", labelKey: "extensions.filter.personal" },
  ];

  const statusOptions: { value: StatusFilter; labelKey: string }[] = [
    { value: "all", labelKey: "extensions.filter.all" },
    { value: "installed", labelKey: "extensions.filter.installed" },
    { value: "notInstalled", labelKey: "extensions.filter.notInstalled" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Category filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">{t("extensions.filter.category")}</span>
          <div className="flex gap-0.5">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCategoryFilter(opt.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                  categoryFilter === opt.value
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">{t("extensions.filter.status")}</span>
          <div className="flex gap-0.5">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                  statusFilter === opt.value
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Skills grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSkills.map((item) => (
          <ExtensionCard
            key={item.key}
            icon={item.icon}
            name={item.name}
            description={item.description}
            badge={item.badge}
            badgeLabel={t(`extensions.badge.${item.badge}`)}
            enabled={enabledNames.includes(item.name)}
            onToggle={() => void toggleSkillEnabled(item.name)}
          />
        ))}
        {filteredSkills.length === 0 && (
          <div className="col-span-full py-12 text-center text-[13px] text-muted-foreground">
            {t("skills.noSkills")}
          </div>
        )}
      </div>
    </div>
  );
}
