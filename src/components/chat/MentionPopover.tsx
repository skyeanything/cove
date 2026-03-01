import { useEffect, useRef } from "react";
import { Terminal, Wrench, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolInfo } from "@/lib/ai/tools/tool-meta";
import type { SkillMeta } from "@/lib/ai/skills/types";
import type { MentionFileEntry } from "@/hooks/useMentionFiles";

export interface MentionItem {
  type: "tool" | "skill" | "file";
  id: string;
  label: string;
  description?: string;
  emoji?: string;
  isDir?: boolean;
}

interface MentionPopoverProps {
  open: boolean;
  query: string;
  tools: ToolInfo[];
  skills: SkillMeta[];
  files: MentionFileEntry[];
  activeIndex: number;
  onSelect: (type: "tool" | "skill" | "file", id: string) => void;
  onClose: () => void;
}

/** Build a flat list of mention items from filtered tools, skills, and files. */
export function buildMentionItems(
  tools: ToolInfo[],
  skills: SkillMeta[],
  files: MentionFileEntry[],
): MentionItem[] {
  const items: MentionItem[] = [];
  for (const t of tools) {
    items.push({ type: "tool", id: t.id, label: t.id, description: t.name });
  }
  for (const s of skills) {
    items.push({ type: "skill", id: s.name, label: s.name, description: s.description, emoji: s.emoji });
  }
  for (const f of files) {
    items.push({ type: "file", id: f.path, label: f.name, isDir: f.isDir });
  }
  return items;
}

export function MentionPopover({
  open,
  tools,
  skills,
  files,
  activeIndex,
  onSelect,
}: MentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-mention-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  if (!open) return null;

  const items = buildMentionItems(tools, skills, files);
  if (items.length === 0) return null;

  // Group items by type for section headers
  const toolItems = items.filter((i) => i.type === "tool");
  const skillItems = items.filter((i) => i.type === "skill");
  const fileItems = items.filter((i) => i.type === "file");

  // Flat index offset for each section
  let flatIndex = 0;

  return (
    <div
      ref={listRef}
      className="max-h-60 overflow-auto border-t border-border bg-background-secondary/80"
    >
      {toolItems.length > 0 && (
        <MentionSection label="TOOLS">
          {toolItems.map((item) => {
            const idx = flatIndex++;
            return (
              <MentionRow
                key={`tool-${item.id}`}
                item={item}
                index={idx}
                active={idx === activeIndex}
                onSelect={onSelect}
                icon={<Wrench className="size-3.5 text-muted-foreground" strokeWidth={1.5} />}
              />
            );
          })}
        </MentionSection>
      )}
      {skillItems.length > 0 && (
        <MentionSection label="SKILLS">
          {skillItems.map((item) => {
            const idx = flatIndex++;
            return (
              <MentionRow
                key={`skill-${item.id}`}
                item={item}
                index={idx}
                active={idx === activeIndex}
                onSelect={onSelect}
                icon={
                  item.emoji ? (
                    <span className="text-sm leading-none">{item.emoji}</span>
                  ) : (
                    <Terminal className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                  )
                }
              />
            );
          })}
        </MentionSection>
      )}
      {fileItems.length > 0 && (
        <MentionSection label="FILES">
          {fileItems.map((item) => {
            const idx = flatIndex++;
            return (
              <MentionRow
                key={`file-${item.id}`}
                item={item}
                index={idx}
                active={idx === activeIndex}
                onSelect={onSelect}
                icon={
                  item.isDir ? (
                    <Folder className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                  ) : (
                    <FileText className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
                  )
                }
              />
            );
          })}
        </MentionSection>
      )}
    </div>
  );
}

function MentionSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function MentionRow({
  item,
  index,
  active,
  onSelect,
  icon,
}: {
  item: MentionItem;
  index: number;
  active: boolean;
  onSelect: (type: "tool" | "skill" | "file", id: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-mention-index={index}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-background-tertiary" : "hover:bg-background-tertiary",
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(item.type, item.id);
      }}
    >
      {icon}
      <span className="font-medium">{item.label}</span>
      {item.description && (
        <span className="truncate text-muted-foreground">{item.description}</span>
      )}
    </button>
  );
}
