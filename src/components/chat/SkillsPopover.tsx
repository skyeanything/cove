import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Wand2, Loader2, Lock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { listSkills } from "@/lib/ai/skills/loader";
import { sourcePriority } from "@/lib/ai/tools/skill";
import { cn } from "@/lib/utils";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { SkillMeta } from "@/lib/ai/skills/types";

/** 展示排序：内置(app) 排最前(0)，cove 其次(1)，其他最后(2) */
function displayOrder(source: string): number {
  const s = source.toLowerCase();
  if (s === "app") return 0;
  if (s === "cove") return 1;
  return 2;
}

/** 合并内置与外部 skill：去重时 cove > claude > 内置/其他，展示时内置排最前 */
function useMergedSkills(): { meta: SkillMeta; source?: string }[] {
  const bundled = listSkills();
  const externalSkills = useSkillsStore((s) => s.externalSkills);

  const all: { meta: SkillMeta; source: string; dedup: number }[] = [
    ...externalSkills.map(({ skill, source }) => ({
      meta: skill.meta,
      source,
      dedup: sourcePriority(source),
    })),
    ...bundled.map((m) => ({ meta: m, source: "app", dedup: sourcePriority("app") })),
  ];

  // 去重：优先级高的先入 seen，同名低优先级丢弃
  all.sort((a, b) => a.dedup - b.dedup);
  const seen = new Set<string>();
  const deduped: { meta: SkillMeta; source: string }[] = [];
  for (const { meta, source } of all) {
    if (!seen.has(meta.name)) {
      seen.add(meta.name);
      deduped.push({ meta, source });
    }
  }

  // 展示排序：内置最前
  deduped.sort((a, b) => displayOrder(a.source) - displayOrder(b.source));
  return deduped;
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
}: {
  meta: SkillMeta;
  source?: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  function getSourceLabel(s: string): string {
    const lower = s.toLowerCase();
    if (lower === "app") return t("skills.sourceApp");
    if (lower === "cove") return t("skills.sourceCove");
    return s;
  }
  const displaySource = source != null && source !== "" ? getSourceLabel(source) : null;
  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-background-tertiary/80">
      {meta.always ? (
        <Lock
          className="mt-0.5 h-4 w-4 shrink-0 text-foreground-tertiary"
          strokeWidth={1.5}
          aria-label="always enabled"
        />
      ) : (
        <Checkbox
          checked={enabled}
          onCheckedChange={() => onToggle()}
          className="mt-0.5 shrink-0"
          aria-label={meta.name}
        />
      )}
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
          {meta.always && (
            <span className="shrink-0 rounded bg-success/15 px-1 py-0.5 text-[10px] font-medium text-success">
              always on
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
