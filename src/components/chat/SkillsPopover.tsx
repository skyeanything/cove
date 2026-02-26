import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Wand2, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { listSkills } from "@/lib/ai/skills/loader";
import { cn } from "@/lib/utils";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { SkillMeta } from "@/lib/ai/skills/types";

/** 来源优先级：cove(0) > claude(1) > 其他含内置(2) */
function sourcePriority(source: string): number {
  const s = source.toLowerCase();
  if (s === "cove") return 0;
  if (s === "claude") return 1;
  return 2;
}

/** 合并内置与外部 skill，按优先级去重：cove > claude > 内置/其他 */
function useMergedSkills(): { meta: SkillMeta; source?: string }[] {
  const bundled = listSkills();
  const externalSkills = useSkillsStore((s) => s.externalSkills);

  const all: { meta: SkillMeta; source: string; priority: number }[] = [
    ...externalSkills.map(({ skill, source }) => ({
      meta: skill.meta,
      source,
      priority: sourcePriority(source),
    })),
    ...bundled.map((m) => ({ meta: m, source: "app", priority: sourcePriority("app") })),
  ];

  all.sort((a, b) => a.priority - b.priority);

  const seen = new Set<string>();
  const result: { meta: SkillMeta; source?: string }[] = [];
  for (const { meta, source } of all) {
    if (!seen.has(meta.name)) {
      seen.add(meta.name);
      result.push({ meta, source });
    }
  }
  return result;
}

/** 来源标签显示名：内置用 App，其余用来源名 */
function sourceLabel(source: string): string {
  const lower = source.toLowerCase();
  if (lower === "app") return "App";
  if (lower === "claude" || lower === "cursor" || lower === "opencode" || lower === "agents") return lower;
  return source;
}

export function SkillsPopover({
  trigger,
}: {
  trigger?: React.ReactElement;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const loadExternalSkills = useSkillsStore((s) => s.loadExternalSkills);
  const loadEnabledSkillNames = useSkillsStore((s) => s.loadEnabledSkillNames);
  const loading = useSkillsStore((s) => s.loading);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path);
  const enabledSkillNames = useSkillsStore((s) => s.enabledSkillNames);
  const skills = useMergedSkills();

  useEffect(() => {
    loadEnabledSkillNames();
  }, [loadEnabledSkillNames]);

  useEffect(() => {
    if (open) {
      if (workspacePath !== undefined) loadExternalSkills(workspacePath ?? null);
      loadEnabledSkillNames();
    }
  }, [open, workspacePath, loadExternalSkills, loadEnabledSkillNames]);

  const visibleNames = new Set(skills.map((s) => s.meta.name));
  const enabledCount = enabledSkillNames.filter((n) => visibleNames.has(n)).length;
  const defaultTrigger = (
    <button
      type="button"
      className={cn(
      "relative flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-background-tertiary",
      enabledCount > 0 ? "text-brand hover:text-brand-hover" : "text-muted-foreground hover:text-foreground",
    )}
      title={enabledCount > 0 ? t("skills.tooltipEnabled", { count: enabledCount }) : t("skills.title")}
    >
      <Wand2 className="size-4" strokeWidth={1.5} />
      {enabledCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[11px] items-center justify-center rounded-full bg-brand px-0.5 py-0.5 text-[8px] font-medium leading-none text-brand-foreground">
          {enabledCount > 99 ? "99+" : enabledCount}
        </span>
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? defaultTrigger}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[320px] rounded-xl border border-border bg-popover p-0 shadow-lg"
      >
        {/* Header：标题 + Auto 标签 */}
        <div className="flex items-center justify-between px-4 py-3 pb-0">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold">{t("skills.title")}</h3>
          </div>
        </div>

        <p className="flex items-center gap-1.5 px-4 py-2 text-[12px] text-muted-foreground">
          {t("skills.autoSelectHint")}
        </p>

        {/* 技能列表：固定高度 + 内部滚动 */}
        <div className="h-[280px] shrink-0 overflow-hidden border-t border-border/50">
          <ScrollArea className="h-full w-full">
            <div className="px-3 py-2">
              {loading && skills.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                  {t("skills.scanning")}
                </p>
              ) : skills.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  {t("skills.noSkills")}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {skills.map((s) => (
                    <SkillItem
                      key={s.meta.name}
                      meta={s.meta}
                      source={s.source}
                      enabled={enabledSkillNames.includes(s.meta.name)}
                      onToggle={() => useSkillsStore.getState().toggleSkillEnabled(s.meta.name)}
                      sourceAppLabel={t("skills.sourceApp")}
                    />
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SkillItem({
  meta,
  source,
  enabled,
  onToggle,
  sourceAppLabel,
}: {
  meta: SkillMeta;
  source?: string;
  enabled: boolean;
  onToggle: () => void;
  sourceAppLabel: string;
}) {
  const displaySource = source != null && source !== "" ? (source.toLowerCase() === "app" ? sourceAppLabel : sourceLabel(source)) : null;
  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-background-tertiary/80">
      <Checkbox
        checked={enabled}
        onCheckedChange={() => onToggle()}
        className="mt-0.5 shrink-0"
        aria-label={meta.name}
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-medium text-foreground">{meta.name}</span>
          {displaySource != null && (
            <span
              className="shrink-0 rounded bg-brand/15 px-1 py-0.4 text-[10px] font-medium capitalize text-brand"
              title={source ?? ""}
            >
              {displaySource}
            </span>
          )}
        </div>
        {meta.description ? (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
            {meta.description}
          </p>
        ) : null}
      </div>
    </li>
  );
}
