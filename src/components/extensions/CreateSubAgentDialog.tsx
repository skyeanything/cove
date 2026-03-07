import { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { subAgentRepo } from "@/db/repos/subAgentRepo";
import { mcpServerRepo } from "@/db/repos/mcpServerRepo";
import { providerRepo } from "@/db/repos/providerRepo";
import { getModelsForProviders } from "@/lib/ai/model-service";
import type { SubAgentDef, McpServer, ModelInfo } from "@/db/types";
import { useExtensionStore } from "@/stores/extensionStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { listSkills } from "@/lib/ai/skills/loader";
import { sourcePriority } from "@/lib/ai/tools/skill";
import { USER_VISIBLE_TOOLS } from "@/lib/ai/tools/tool-meta";
import { cn } from "@/lib/utils";

const PRESET_ICONS = [
  "🤖", "🧠", "📋", "🔍", "💡", "✍️", "📊", "🎯",
  "🔧", "📚", "💬", "🌐", "🚀", "⚡", "🎨", "🗃️",
  "🔬", "🛡️", "📝", "🏷️",
];

function MultiSelect({
  options,
  selected,
  onToggle,
  placeholder,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedNames = options.filter((o) => selected.includes(o.id)).map((o) => o.name);
  const display =
    selected.length === 0
      ? (placeholder ?? "选择...")
      : selected.length <= 2
        ? selectedNames.join(", ")
        : `已选 ${selected.length} 项`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center rounded-lg border border-border bg-background px-3 text-left text-[13px]",
          selected.length === 0 ? "text-foreground-tertiary" : "text-foreground",
          open && "rounded-b-none",
        )}
      >
        <span className="flex-1 truncate">{display}</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 text-foreground-tertiary transition-transform duration-150", open && "rotate-180")}
          strokeWidth={1.5}
        />
      </button>
      {open && (
        <div className="rounded-b-lg border border-t border-border bg-background shadow-sm">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-foreground-tertiary">暂无可用项</p>
          ) : (
            <div className="max-h-[160px] overflow-y-auto">
              <div className="p-1">
                {options.map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => onToggle(opt.id)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-background-tertiary"
                  >
                    <Checkbox
                      checked={selected.includes(opt.id)}
                      onCheckedChange={() => onToggle(opt.id)}
                    />
                    <span className="text-[13px] text-foreground">{opt.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
            <span className="text-[11px] text-foreground-tertiary">
              {selected.length > 0 ? `已选 ${selected.length} 项` : "未选择"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[12px] text-accent hover:bg-background-tertiary"
            >
              <Check className="size-3" strokeWidth={2} />
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelPicker({ value, providerId, onChange }: {
  value: string; providerId: string;
  onChange: (modelId: string, pid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => {
    void providerRepo.getAll().then((rows) => setModels(getModelsForProviders(rows)));
  }, []);
  const sel = models.find((m) => m.id === value && m.provider_id === providerId);
  const label = sel ? `${sel.provider_name} / ${sel.id}` : "不指定（继承当前模型）";
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={cn("flex h-9 w-full items-center rounded-lg border border-border bg-background px-3 text-left text-[13px]",
          !value ? "text-foreground-tertiary" : "text-foreground", open && "rounded-b-none")}>
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-foreground-tertiary transition-transform duration-150", open && "rotate-180")} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="max-h-[200px] overflow-y-auto rounded-b-lg border border-t border-border bg-background p-1 shadow-sm">
          <div onClick={() => { onChange("", ""); setOpen(false); }}
            className="flex cursor-pointer items-center rounded px-2 py-1.5 hover:bg-background-tertiary">
            <span className="text-[13px] text-foreground-tertiary">不指定（继承当前模型）</span>
          </div>
          {models.map((m) => (
            <div key={`${m.provider_id}:${m.id}`}
              onClick={() => { onChange(m.id, m.provider_id); setOpen(false); }}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-background-tertiary">
              <span className="flex-1 truncate text-[13px] text-foreground">{m.id}</span>
              <span className="shrink-0 text-[11px] text-foreground-tertiary">{m.provider_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAgent?: SubAgentDef;
}

export function CreateSubAgentDialog({ open, onOpenChange, initialAgent }: Props) {
  const bumpSubagents = useExtensionStore((s) => s.bumpSubagents);
  const externalSkills = useSkillsStore((s) => s.externalSkills);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [iconOpen, setIconOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [connectors, setConnectors] = useState<McpServer[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!initialAgent;

  const bundled = listSkills();
  const allEntries = [
    ...externalSkills
      .filter(({ source }) => source !== "office-bundled")
      .map(({ skill, source }) => ({ name: skill.meta.name, dedup: sourcePriority(source) })),
    ...bundled.map((m) => ({ name: m.name, dedup: sourcePriority("app") })),
  ];
  allEntries.sort((a, b) => a.dedup - b.dedup);
  const seen = new Set<string>();
  const skillOptions: { id: string; name: string }[] = [];
  for (const { name: n } of allEntries) {
    if (!seen.has(n)) { seen.add(n); skillOptions.push({ id: n, name: n }); }
  }

  const toolOptions = USER_VISIBLE_TOOLS.map((t) => ({ id: t.id, name: t.name }));

  useEffect(() => {
    if (open) void mcpServerRepo.getAll().then(setConnectors);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initialAgent) {
      setName(initialAgent.name);
      setIcon(initialAgent.icon ?? "");
      setDescription(initialAgent.description);
      setSystemPrompt(initialAgent.system_prompt);
      try { setSelectedSkills(JSON.parse(initialAgent.skill_names) as string[]); } catch { setSelectedSkills([]); }
      try { setSelectedTools(JSON.parse(initialAgent.tool_ids) as string[]); } catch { setSelectedTools([]); }
      try { setSelectedConnectors(JSON.parse(initialAgent.connector_ids) as string[]); } catch { setSelectedConnectors([]); }
      setSelectedModel(initialAgent.model_id ?? "");
      setSelectedProviderId(initialAgent.provider_id ?? "");
    } else {
      setName(""); setIcon(""); setDescription(""); setSystemPrompt("");
      setSelectedSkills([]); setSelectedTools([]); setSelectedConnectors([]);
      setSelectedModel(""); setSelectedProviderId("");
    }
    setError("");
  }, [open, initialAgent]);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    setter((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSave = async () => {
    if (!name.trim()) { setError("名称不能为空"); return; }
    setSaving(true);
    setError("");
    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || undefined,
        system_prompt: systemPrompt.trim(),
        skill_names: JSON.stringify(selectedSkills),
        tool_ids: JSON.stringify(selectedTools),
        connector_ids: JSON.stringify(selectedConnectors),
        model_id: selectedModel || undefined,
        provider_id: selectedProviderId || undefined,
      };
      if (isEdit && initialAgent) {
        await subAgentRepo.update(initialAgent.id, data);
      } else {
        await subAgentRepo.create({ id: crypto.randomUUID(), ...data, enabled: 1 });
      }
      bumpSubagents();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const connectorOptions = connectors.map((c) => ({ id: c.id, name: c.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 sm:max-w-2xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{isEdit ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "编辑 Agent" : "新建 Agent"}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0">
          <div className="flex flex-col gap-4">
            {/* Name + Icon */}
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
                <Label className="mb-1.5 block text-[12px]">图标</Label>
                <Popover open={iconOpen} onOpenChange={setIconOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex h-9 w-full items-center justify-center rounded-lg border border-border bg-background text-lg hover:bg-background-tertiary">
                      {icon || "🤖"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-2" align="end">
                    <div className="grid grid-cols-5 gap-1">
                      {PRESET_ICONS.map((e) => (
                        <button
                          key={e}
                          onClick={() => { setIcon(e); setIconOpen(false); }}
                          className={cn(
                            "flex h-9 w-full items-center justify-center rounded text-lg hover:bg-background-tertiary",
                            icon === e && "bg-background-tertiary ring-1 ring-accent",
                          )}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="agent-description" className="mb-1.5 block text-[12px]">描述</Label>
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
              <Label htmlFor="agent-prompt" className="mb-1.5 block text-[12px]">System Prompt</Label>
              <Textarea
                id="agent-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={"你是一个专注于深度研究的 AI 助手。\n\n你的职责：\n- 检索并整理相关信息\n- 提供有来源依据的分析\n- 以结构化方式输出结论"}
                rows={5}
                className="resize-none font-mono text-[12px] leading-relaxed"
              />
            </div>

            {/* Skills */}
            <div>
              <Label className="mb-1.5 block text-[12px]">Skills</Label>
              <MultiSelect
                options={skillOptions}
                selected={selectedSkills}
                onToggle={toggle(setSelectedSkills)}
                placeholder="选择技能..."
              />
            </div>

            {/* Tools */}
            <div>
              <Label className="mb-1.5 block text-[12px]">Tools</Label>
              <MultiSelect
                options={toolOptions}
                selected={selectedTools}
                onToggle={toggle(setSelectedTools)}
                placeholder="选择工具..."
              />
            </div>

            {/* Connectors */}
            <div>
              <Label className="mb-1.5 block text-[12px]">Connectors</Label>
              <MultiSelect
                options={connectorOptions}
                selected={selectedConnectors}
                onToggle={toggle(setSelectedConnectors)}
                placeholder="选择 MCP 连接器..."
              />
            </div>

            {/* Model */}
            <div className="pb-2">
              <Label className="mb-1.5 block text-[12px]">大模型</Label>
              <ModelPicker
                value={selectedModel}
                providerId={selectedProviderId}
                onChange={(modelId, pid) => { setSelectedModel(modelId); setSelectedProviderId(pid); }}
              />
            </div>

            {error && <p className="text-[12px] text-destructive">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (isEdit ? "保存中..." : "创建中...") : (isEdit ? "保存" : "创建")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
