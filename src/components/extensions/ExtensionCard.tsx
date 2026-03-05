import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

export type ExtensionBadge = "built-in" | "public" | "personal";

export interface ExtensionCardProps {
  icon: string;
  name: string;
  description: string;
  badge: ExtensionBadge;
  /** Override the displayed badge text (for i18n). Falls back to badge value. */
  badgeLabel?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const BADGE_STYLES: Record<ExtensionBadge, string> = {
  "built-in": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  public: "bg-green-500/10 text-green-600 dark:text-green-400",
  personal: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
};

export function ExtensionCard({
  icon,
  name,
  description,
  badge,
  badgeLabel,
  enabled,
  onToggle,
  onEdit,
  onDelete,
}: ExtensionCardProps) {
  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-xl border p-4 transition-colors",
        enabled
          ? "border-border bg-background"
          : "border-border/60 bg-background-secondary/50 opacity-70",
      )}
    >
      {/* Header: icon + name + badge */}
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">
              {name}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                BADGE_STYLES[badge],
              )}
            >
              {badgeLabel ?? badge}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {/* Footer: actions + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onEdit && (
            <Button variant="ghost" size="icon-sm" onClick={onEdit} className="size-6">
              <Pencil className="size-3.5" strokeWidth={1.5} />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="size-6 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}
