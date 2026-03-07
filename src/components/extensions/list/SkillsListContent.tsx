import { useMemo, useState } from "react";
import { ChevronRight, FileText, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useSkillsStore } from "@/stores/skillsStore";
import { useExtensionStore } from "@/stores/extensionStore";
import { listSkills } from "@/lib/ai/skills/loader";

interface SkillRow {
  key: string;
  icon: string;
  name: string;
  resourcePaths: string[];
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
          className={cn(
            "size-3 transition-transform duration-150",
            open && "rotate-90",
          )}
          strokeWidth={2}
        />
        {title}
      </button>
      {open && <div className="flex flex-col">{children}</div>}
    </div>
  );
}

function SkillItemRow({
  item,
  enabled,
  selected,
  expanded,
  onSelect,
  onToggle,
  onToggleExpand,
}: {
  item: SkillRow;
  enabled: boolean;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onToggleExpand: () => void;
}) {
  const hasFiles = item.resourcePaths.length > 0;
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);

  return (
    <div>
      {/* Main row */}
      <div
        onClick={onSelect}
        className={cn(
          "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors",
          selected ? "bg-background-tertiary" : "hover:bg-background-tertiary/60",
        )}
      >
        {/* Expand chevron */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasFiles) onToggleExpand();
          }}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded",
            hasFiles
              ? "cursor-pointer text-foreground-tertiary hover:text-foreground"
              : "cursor-default opacity-0 pointer-events-none",
          )}
        >
          {hasFiles && (
            <ChevronRight
              className={cn(
                "size-3 transition-transform duration-150",
                expanded && "rotate-90",
              )}
              strokeWidth={1.5}
            />
          )}
        </button>

        {/* Skill icon */}
        <Wand2 className="size-[14px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />

        {/* Name */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            enabled ? "text-foreground" : "text-foreground-secondary",
          )}
        >
          {item.name}
        </span>

        {/* Toggle */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <Switch
            checked={enabled}
            onCheckedChange={() => {}}
            className="h-[18px] w-[30px] data-[state=checked]:[&>span]:translate-x-[14px] [&>span]:size-[14px]"
          />
        </div>
      </div>

      {/* Expanded file list */}
      {expanded && hasFiles && (
        <div className="ml-7 mt-0.5 flex flex-col gap-0.5 pb-1">
          {item.resourcePaths.map((p) => {
            const fileName = p.split(/[\\/]/).pop() ?? p;
            const fileKey = `file:${item.key}:${fileName}`;
            const isFileSelected = selectedKey === fileKey;
            return (
              <button
                key={fileKey}
                onClick={() => setSelectedKey(fileKey)}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] transition-colors",
                  isFileSelected
                    ? "bg-background-tertiary text-foreground"
                    : "text-foreground-secondary hover:bg-background-tertiary/60 hover:text-foreground",
                )}
              >
                <FileText className="size-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{fileName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SkillsListContent() {
  const externalSkills = useSkillsStore((s) => s.externalSkills);
  const enabledNames = useSkillsStore((s) => s.enabledSkillNames);
  const toggleSkillEnabled = useSkillsStore((s) => s.toggleSkillEnabled);
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);
  const expandedKeys = useExtensionStore((s) => s.expandedKeys);
  const toggleExpanded = useExtensionStore((s) => s.toggleExpanded);

  const builtInMetas = useMemo(() => listSkills(), []);

  // "我的" — user-created (cove source)
  const mySkills = useMemo<SkillRow[]>(
    () =>
      externalSkills
        .filter((s) => s.source === "cove")
        .map((s) => ({
          key: `ext:${s.folderName}`,
          icon: s.skill.meta.emoji ?? "📦",
          name: s.skill.meta.name,
          resourcePaths: s.resourcePaths,
        })),
    [externalSkills],
  );

  // "公共" — discovered from other sources
  const publicSkills = useMemo<SkillRow[]>(
    () =>
      externalSkills
        .filter((s) => s.source !== "cove" && s.source !== "office-bundled")
        .map((s) => ({
          key: `ext:${s.folderName}`,
          icon: s.skill.meta.emoji ?? "📦",
          name: s.skill.meta.name,
          resourcePaths: s.resourcePaths,
        })),
    [externalSkills],
  );

  // "预设" — built-in
  const presetSkills = useMemo<SkillRow[]>(
    () =>
      builtInMetas.map((s) => ({
        key: `builtin:${s.name}`,
        icon: s.emoji ?? "🛠️",
        name: s.name,
        resourcePaths: [],
      })),
    [builtInMetas],
  );

  const renderRow = (item: SkillRow) => (
    <SkillItemRow
      key={item.key}
      item={item}
      enabled={enabledNames.includes(item.name)}
      selected={selectedKey === item.key}
      expanded={expandedKeys.includes(item.key)}
      onSelect={() => setSelectedKey(item.key)}
      onToggle={() => void toggleSkillEnabled(item.name)}
      onToggleExpand={() => toggleExpanded(item.key)}
    />
  );

  return (
    <div className="flex flex-col gap-1 p-2">
      <CategorySection title="我的" count={mySkills.length}>
        {mySkills.map(renderRow)}
      </CategorySection>
      <CategorySection title="公共" count={publicSkills.length}>
        {publicSkills.map(renderRow)}
      </CategorySection>
      <CategorySection title="预设" count={presetSkills.length}>
        {presetSkills.map(renderRow)}
      </CategorySection>
    </div>
  );
}
