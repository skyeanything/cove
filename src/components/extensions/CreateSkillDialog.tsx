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
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { buildSkillMd } from "@/components/settings/skill-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSkillDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const saveSkill = useSkillsStore((s) => s.saveSkill);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setName(""); setEmoji(""); setDescription(""); setInstructions(""); setError(""); }
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t("skills.nameHint")); return; }
    if (!description.trim()) { setError(t("skills.descriptionRequired", "Description is required")); return; }
    setSaving(true);
    setError("");
    try {
      const content = buildSkillMd({ name: trimmed, emoji, description, instructions, extraFrontmatter: [] });
      await saveSkill(trimmed, content, workspacePath, trimmed);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("skills.newSkill")}</DialogTitle>
          <DialogDescription className="sr-only">{t("skills.newSkill")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <Label htmlFor="skill-name" className="mb-1.5 text-[12px]">{t("skills.nameLabel")}</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("skills.namePlaceholder")}
              className="font-mono text-[13px]"
            />
          </div>
          <div>
            <Label htmlFor="skill-emoji" className="mb-1.5 text-[12px]">{t("skills.emojiLabel")}</Label>
            <Input id="skill-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder={t("skills.emojiPlaceholder")} className="text-[13px]" />
          </div>
          <div>
            <Label htmlFor="skill-description" className="mb-1.5 text-[12px]">{t("skills.descriptionLabel")}</Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("skills.descriptionPlaceholder")}
              rows={3}
              className="resize-none text-[13px] leading-relaxed"
            />
          </div>
          <div>
            <Label htmlFor="skill-instructions" className="mb-1.5 text-[12px]">{t("skills.instructionsLabel")}</Label>
            <Textarea
              id="skill-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t("skills.instructionsPlaceholder")}
              rows={8}
              className="resize-none font-mono text-[12px] leading-relaxed"
            />
          </div>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("skills.cancel")}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{t("skills.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
