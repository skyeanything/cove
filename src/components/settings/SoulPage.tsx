import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  exportSoul,
  importSoul,
  getSoulHealth,
  type SoulHealth,
} from "@/lib/ai/soul-backup";
import { Download, Upload, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

export function SoulPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<SoulHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setHealth(await getSoulHealth());
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const result = await exportSoul();
      if (result) {
        showMessage(t("soul.exportSuccess", { count: result.file_count }));
      }
    } catch (e) {
      showMessage(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const result = await importSoul();
      if (result) {
        showMessage(t("soul.importSuccess", { count: result.files_restored }));
        await refresh();
      }
    } catch (e) {
      showMessage(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      await invoke("reset_soul");
      showMessage(t("soul.resetSuccess"));
      await refresh();
    } catch (e) {
      showMessage(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="divide-y divide-border">
        {/* Status */}
        <div className="px-5 py-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("soul.status")}
          </h3>
          {health ? <HealthDisplay health={health} /> : (
            <p className="text-sm text-muted-foreground">{t("soul.loading")}</p>
          )}
        </div>

        {/* Export */}
        <ActionRow
          label={t("soul.exportLabel")}
          description={t("soul.exportDesc")}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading}
          >
            <Download className="mr-1.5 size-3.5" strokeWidth={1.5} />
            {t("soul.export")}
          </Button>
        </ActionRow>

        {/* Import */}
        <ActionRow
          label={t("soul.importLabel")}
          description={t("soul.importDesc")}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={loading}
          >
            <Upload className="mr-1.5 size-3.5" strokeWidth={1.5} />
            {t("soul.import")}
          </Button>
        </ActionRow>

        {/* Reset */}
        <ActionRow
          label={t("soul.resetLabel")}
          description={t("soul.resetDesc")}
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading} className="text-destructive">
                <RotateCcw className="mr-1.5 size-3.5" strokeWidth={1.5} />
                {t("soul.reset")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("soul.resetConfirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("soul.resetConfirmDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("soul.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>{t("soul.reset")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ActionRow>
      </div>

      {/* Toast-like message */}
      {message && (
        <div className="fixed bottom-4 right-4 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
          {message}
        </div>
      )}
    </div>
  );
}

function HealthDisplay({ health }: { health: SoulHealth }) {
  const { t } = useTranslation();
  const StatusIcon = health.has_corruption ? AlertTriangle : CheckCircle2;
  const statusColor = health.has_corruption ? "text-destructive" : "text-emerald-500";

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
      <span className="text-muted-foreground">{t("soul.statusField")}</span>
      <span className={`flex items-center gap-1.5 ${statusColor}`}>
        <StatusIcon className="size-3.5" strokeWidth={1.5} />
        {health.has_corruption ? t("soul.corrupted") : t("soul.healthy")}
      </span>

      <span className="text-muted-foreground">{t("soul.formatVersion")}</span>
      <span>{health.format_version ?? t("soul.none")}</span>

      <span className="text-muted-foreground">{t("soul.lastMeditation")}</span>
      <span>{health.last_meditation ? formatDate(health.last_meditation) : t("soul.never")}</span>

      <span className="text-muted-foreground">{t("soul.privateFiles")}</span>
      <span>{health.private_file_count}</span>

      <span className="text-muted-foreground">{t("soul.snapshots")}</span>
      <span>{health.snapshot_count}</span>

      {health.corruption_detail && (
        <>
          <span className="text-muted-foreground">{t("soul.detail")}</span>
          <span className="text-destructive text-xs">{health.corruption_detail}</span>
        </>
      )}
    </div>
  );
}

function ActionRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="mr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}
