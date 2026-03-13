import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDataStore } from "@/stores/dataStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { usePermissionStore } from "@/stores/permissionStore";

// The header already has 24px of left offset (px-3 + ml-3). Add 184px more
// when the sidebar is hidden so the title starts to the right of WindowControls.
const HIDDEN_SIDEBAR_TITLE_PADDING_LEFT = 184;

function TrustModeToggle({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const active = usePermissionStore((s) => s.trustModeConversations.has(conversationId));
  const enableTrustMode = usePermissionStore((s) => s.enableTrustMode);
  const disableTrustMode = usePermissionStore((s) => s.disableTrustMode);
  const pendingReq = usePermissionStore((s) => s.pendingTrustModeRequest);
  const resolveTrustModeRequest = usePermissionStore((s) => s.resolveTrustModeRequest);

  // AI requested trust mode for this conversation
  const aiRequested = pendingReq?.conversationId === conversationId;
  const dialogOpen = confirmOpen || aiRequested;

  const handleClick = () => {
    if (active) {
      disableTrustMode(conversationId);
    } else {
      setConfirmOpen(true);
    }
  };

  const handleConfirm = () => {
    enableTrustMode(conversationId);
    if (aiRequested) resolveTrustModeRequest(true);
    setConfirmOpen(false);
  };

  const handleCancel = () => {
    if (aiRequested) resolveTrustModeRequest(false);
    setConfirmOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleClick}
        className={`size-6 ${
          active
            ? "text-amber-500 hover:text-amber-600"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title={active ? t("trustMode.disableTooltip") : t("trustMode.enableTooltip")}
        data-testid="trust-mode-toggle"
      >
        <ShieldCheck className="size-[16px]" strokeWidth={1.5} />
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("trustMode.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("trustMode.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>{t("trustMode.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {t("trustMode.enable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ChatHeader() {
  const { t } = useTranslation();
  const leftSidebarOpen = useLayoutStore((s) => s.leftSidebarOpen);
  const activeConversationId = useDataStore((s) => s.activeConversationId);
  const conversations = useDataStore((s) => s.conversations);
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)
    : null;
  const title = activeConversation?.title ?? t("sidebar.untitled");

  return (
    <div className="shrink-0">
      <div
        className="no-select flex h-8 items-center px-3"
      >
        <div
          className="ml-3 flex min-w-0 max-w-[50%] items-center transition-[padding] duration-300 ease-out"
          style={{ paddingLeft: leftSidebarOpen ? 0 : HIDDEN_SIDEBAR_TITLE_PADDING_LEFT }}
        >
          <span className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </span>
        </div>

        <div className="min-w-0 flex-1" />

        {/* Trust mode toggle */}
        {activeConversationId && (
          <TrustModeToggle conversationId={activeConversationId} />
        )}

      </div>
      <Separator />
    </div>
  );
}
