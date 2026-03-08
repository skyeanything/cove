import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { SkillFields } from "./skill-utils";

// ─── Structured Skill Edit Dialog ───────────────────────────────────
export function SkillEditDialog({
  open,
  onOpenChange,
  fields,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: SkillFields;
  onSave: (fields: SkillFields) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState(fields.emoji);
  const [description, setDescription] = useState(fields.description);
  const [instructions, setInstructions] = useState(fields.instructions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setEmoji(fields.emoji);
      setDescription(fields.description);
      setInstructions(fields.instructions);
      setError("");
    }
  }, [open, fields]);

  const handleSave = async () => {
    if (!description.trim()) {
      setError(t("skills.descriptionPlaceholder"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: fields.name, emoji, description, instructions, extraFrontmatter: fields.extraFrontmatter });
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-2xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{t("skills.editSkill")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("skills.editSkill")}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0">
          <div className="flex flex-col gap-3">
            <div>
              <Label className="mb-1.5 block text-[12px]">{t("skills.nameLabel")}</Label>
              <Input
                value={fields.name}
                disabled
                className="font-mono text-[13px] opacity-60"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">{t("skills.emojiLabel")}</Label>
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder={t("skills.emojiPlaceholder")}
                className="text-[13px]"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">{t("skills.descriptionLabel")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("skills.descriptionPlaceholder")}
                rows={3}
                className="resize-none text-[13px] leading-relaxed"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[12px]">{t("skills.instructionsLabel")}</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={t("skills.instructionsPlaceholder")}
                rows={10}
                className="resize-none font-mono text-[12px] leading-relaxed"
              />
            </div>
            {error && (
              <p className="text-[12px] text-destructive">{error}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("skills.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {t("skills.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation ────────────────────────────────────────────
export function DeleteSkillDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("skills.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("skills.deleteConfirmDesc", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="px-1 text-[12px] text-destructive">{error}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("skills.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("skills.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
