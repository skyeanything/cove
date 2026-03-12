import { usePermissionStore } from "@/stores/permissionStore";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

const OPERATION_DESC_KEYS: Record<string, string> = {
  bash: "permission.bash",
  write: "permission.write",
  edit: "permission.edit",
};

export function PermissionOverlay() {
  const { t } = useTranslation();
  const pendingAsk = usePermissionStore((s) => s.pendingAsk);
  const respond = usePermissionStore((s) => s.respond);

  if (!pendingAsk) return null;

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3 shadow-[0_-4px_12px_0_rgba(0,0,0,0.06)]">
      {/* 操作描述 + 命令/路径预览 */}
      <div className="mb-3 flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">
            {t(OPERATION_DESC_KEYS[pendingAsk.operation] ?? "permission.title")}
          </p>
          <p className="mt-1 truncate rounded-md bg-background-tertiary px-2 py-0.5 font-mono text-[11px] text-foreground-secondary">
            {pendingAsk.pathOrCommand}
          </p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => respond("deny")}
          className="h-8 rounded-lg px-3 text-[13px] text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors cursor-pointer"
        >
          {t("permission.deny")}
        </button>
        <button
          type="button"
          onClick={() => respond("allow")}
          className="h-8 rounded-lg px-4 text-[13px] font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors cursor-pointer"
        >
          {t("permission.allow")}
        </button>
        <button
          type="button"
          onClick={() => respond("always_allow")}
          className="h-8 rounded-lg px-3 text-[13px] font-medium bg-accent/75 text-accent-foreground hover:bg-accent/90 transition-colors cursor-pointer"
        >
          {t("permission.alwaysAllow")}
        </button>
      </div>
    </div>
  );
}
