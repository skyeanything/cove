import { useState, useEffect } from "react";
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
  const saveSkill = useSkillsStore((s) => s.saveSkill);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(""); setEmoji(""); setDescription(""); setInstructions(""); setError("");
    }
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("名称不能为空"); return; }
    if (!description.trim()) { setError("描述不能为空"); return; }
    setSaving(true);
    setError("");
    try {
      const content = buildSkillMd({
        name: trimmed,
        emoji,
        description,
        instructions,
        extraFrontmatter: [],
      });
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
          <DialogTitle>新建 Skill</DialogTitle>
          <DialogDescription className="sr-only">新建 Skill</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name + Emoji on same row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="skill-name" className="mb-1.5 block text-[12px]">
                名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-skill"
                className="font-mono text-[13px]"
                autoFocus
              />
            </div>
            <div className="w-[72px]">
              <Label htmlFor="skill-emoji" className="mb-1.5 block text-[12px]">
                图标
              </Label>
              <Input
                id="skill-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🔧"
                className="text-center text-base"
                maxLength={4}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="skill-description" className="mb-1.5 block text-[12px]">
              描述 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简明描述此 Skill 的用途，例如：帮助分析数据并生成图表"
              rows={2}
              className="resize-none text-[13px] leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-foreground-tertiary">
              模型通过描述判断何时调用此 Skill
            </p>
          </div>

          {/* Instructions */}
          <div>
            <Label htmlFor="skill-instructions" className="mb-1.5 block text-[12px]">
              指令内容
            </Label>
            <Textarea
              id="skill-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={"# 技能说明\n\n描述 Claude 应该如何执行此 Skill 的具体步骤和规则..."}
              rows={8}
              className="resize-none font-mono text-[12px] leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-foreground-tertiary">
              支持 Markdown，将作为 system prompt 的一部分注入
            </p>
          </div>

          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
