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
import { subAgentRepo } from "@/db/repos/subAgentRepo";
import { useExtensionStore } from "@/stores/extensionStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSubAgentDialog({ open, onOpenChange }: Props) {
  const bumpSubagents = useExtensionStore((s) => s.bumpSubagents);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(""); setIcon(""); setDescription(""); setSystemPrompt(""); setError("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim()) { setError("名称不能为空"); return; }
    setSaving(true);
    setError("");
    try {
      await subAgentRepo.create({
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || undefined,
        system_prompt: systemPrompt.trim(),
        skill_names: "[]",
        tool_ids: "[]",
        enabled: 1,
      });
      bumpSubagents();
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
          <DialogTitle>新建 SubAgent</DialogTitle>
          <DialogDescription className="sr-only">新建 SubAgent</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name + Icon on same row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="agent-name" className="mb-1.5 block text-[12px]">
                名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="research-agent"
                className="text-[13px]"
                autoFocus
              />
            </div>
            <div className="w-[72px]">
              <Label htmlFor="agent-icon" className="mb-1.5 block text-[12px]">
                图标
              </Label>
              <Input
                id="agent-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🤖"
                className="text-center text-base"
                maxLength={4}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="agent-description" className="mb-1.5 block text-[12px]">
              描述
            </Label>
            <Textarea
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简明描述此 Agent 的专长，例如：负责深度研究并整理信息"
              rows={2}
              className="resize-none text-[13px] leading-relaxed"
            />
          </div>

          {/* System Prompt */}
          <div>
            <Label htmlFor="agent-prompt" className="mb-1.5 block text-[12px]">
              System Prompt
            </Label>
            <Textarea
              id="agent-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={"你是一个专注于深度研究的 AI 助手。\n\n你的职责：\n- 检索并整理相关信息\n- 提供有来源依据的分析\n- 以结构化方式输出结论"}
              rows={8}
              className="resize-none font-mono text-[12px] leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-foreground-tertiary">
              技能与工具绑定可在创建后通过编辑配置
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
