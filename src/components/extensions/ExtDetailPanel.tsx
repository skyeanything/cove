// FILE_SIZE_EXCEPTION: 4 type-specific detail panels (Skill/Tool/Connector/SubAgent) + shared utilities in one dispatcher
import { useState, useEffect, useMemo } from "react";
import { MoreHorizontal, Wand2, Wrench, Blocks, Bot, MessageSquare, Pencil, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useExtensionStore } from "@/stores/extensionStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getAllBundledSkills } from "@/lib/ai/skills/loader";
import { mcpServerRepo } from "@/db/repos/mcpServerRepo";
import { subAgentRepo } from "@/db/repos/subAgentRepo";
import type { McpServer, SubAgentDef } from "@/db/types";

// ── Shared primitives ─────────────────────────────────────────────────────────

function MoreActionsMenu({
  onUse,
  onDelete,
}: {
  onUse: () => void;
  onDelete?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-md p-1 text-foreground-secondary hover:bg-background-tertiary hover:text-foreground">
          <MoreHorizontal className="size-4" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-28">
        <DropdownMenuItem onClick={onUse}>
          <MessageSquare className="mr-2 size-3.5" strokeWidth={1.5} />
          使用
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Pencil className="mr-2 size-3.5" strokeWidth={1.5} />
          编辑
        </DropdownMenuItem>
        {onDelete && (
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} />
            删除
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteDialog({
  open,
  name,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{name}」吗？此操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailHeader({
  icon: Icon,
  name,
  enabled,
  onToggle,
  onUse,
  onDelete,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  name: string;
  enabled?: boolean;
  onToggle?: () => void;
  onUse: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <Icon className="size-[18px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
        {name}
      </h2>
      <div className="flex items-center gap-2">
        {onToggle !== undefined && enabled !== undefined && (
          <Switch checked={enabled} onCheckedChange={onToggle} />
        )}
        <MoreActionsMenu onUse={onUse} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ── Skill detail ──────────────────────────────────────────────────────────────

function SkillDetailContent({
  name,
  description,
  content,
  addedBy,
  enabled,
  onToggle,
  onUse,
  onDelete,
}: {
  name: string;
  description: string;
  content: string;
  addedBy: string;
  enabled: boolean;
  onToggle: () => void;
  onUse: () => void;
  onDelete?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        icon={Wand2}
        name={name}
        enabled={enabled}
        onToggle={onToggle}
        onUse={onUse}
        onDelete={onDelete ? () => setConfirmOpen(true) : undefined}
      />

      <div className="flex gap-8 text-[12px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground-tertiary">添加者</span>
          <span className="text-foreground-secondary">{addedBy}</span>
        </div>
      </div>

      {description && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
            描述
          </span>
          <p className="text-[13px] leading-relaxed text-foreground-secondary">{description}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-background-secondary">
        <pre className="min-h-0 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground-secondary">
          {content || "(无内容)"}
        </pre>
      </div>

      {onDelete && (
        <DeleteDialog
          open={confirmOpen}
          name={name}
          onConfirm={() => { onDelete(); setConfirmOpen(false); }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// ── Tool detail ───────────────────────────────────────────────────────────────

const PRESET_TOOL_INFO: Record<string, { name: string; description: string }> = {
  "tool:word": { name: "Word", description: "Embed AI assistant into Microsoft Word" },
};

function ToolDetailContent({ toolKey }: { toolKey: string }) {
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const info = PRESET_TOOL_INFO[toolKey];
  if (!info) return null;

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        icon={Wrench}
        name={info.name}
        onUse={() => setActivePage("chat")}
      />
      {info.description && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
            描述
          </span>
          <p className="text-[13px] leading-relaxed text-foreground-secondary">{info.description}</p>
        </div>
      )}
    </div>
  );
}

// ── Connector detail ──────────────────────────────────────────────────────────

function ConnectorDetailContent({ serverId }: { serverId: string }) {
  const [server, setServer] = useState<McpServer | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);
  const bumpConnectors = useExtensionStore((s) => s.bumpConnectors);
  const setActivePage = useLayoutStore((s) => s.setActivePage);

  useEffect(() => {
    mcpServerRepo.getById(serverId).then((s) => setServer(s ?? null));
  }, [serverId]);

  const handleToggle = async () => {
    if (!server) return;
    const next = server.enabled ? 0 : 1;
    await mcpServerRepo.update(server.id, { enabled: next });
    setServer({ ...server, enabled: next });
  };

  const handleDelete = async () => {
    setConfirmOpen(false);
    await mcpServerRepo.delete(serverId);
    bumpConnectors();
    setSelectedKey(null);
  };

  if (!server) {
    return <div className="text-[13px] text-foreground-tertiary">加载中...</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        icon={Blocks}
        name={server.name}
        enabled={!!server.enabled}
        onToggle={() => void handleToggle()}
        onUse={() => setActivePage("chat")}
        onDelete={() => setConfirmOpen(true)}
      />

      <div className="flex gap-8 text-[12px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground-tertiary">类型</span>
          <span className="text-foreground-secondary">{server.type}</span>
        </div>
        {!!server.auto_run && (
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground-tertiary">自动启动</span>
            <span className="text-foreground-secondary">是</span>
          </div>
        )}
      </div>

      {(server.command ?? server.url) && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
            {server.command ? "命令" : "URL"}
          </span>
          <code className="break-all font-mono text-[12px] text-foreground-secondary">
            {server.command ?? server.url}
          </code>
        </div>
      )}

      <DeleteDialog
        open={confirmOpen}
        name={server.name}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── SubAgent detail ───────────────────────────────────────────────────────────

function SubAgentDetailContent({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<SubAgentDef | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);
  const bumpSubagents = useExtensionStore((s) => s.bumpSubagents);
  const setActivePage = useLayoutStore((s) => s.setActivePage);

  useEffect(() => {
    subAgentRepo.getById(agentId).then((a) => setAgent(a ?? null));
  }, [agentId]);

  const handleToggle = async () => {
    if (!agent) return;
    const next = agent.enabled ? 0 : 1;
    await subAgentRepo.update(agent.id, { enabled: next });
    setAgent({ ...agent, enabled: next });
  };

  const handleDelete = async () => {
    setConfirmOpen(false);
    await subAgentRepo.delete(agentId);
    bumpSubagents();
    setSelectedKey(null);
  };

  if (!agent) {
    return <div className="text-[13px] text-foreground-tertiary">加载中...</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        icon={Bot}
        name={agent.name}
        enabled={!!agent.enabled}
        onToggle={() => void handleToggle()}
        onUse={() => setActivePage("chat")}
        onDelete={() => setConfirmOpen(true)}
      />

      {agent.description && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
            描述
          </span>
          <p className="text-[13px] leading-relaxed text-foreground-secondary">{agent.description}</p>
        </div>
      )}

      {agent.system_prompt && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
            System Prompt
          </span>
          <pre className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background-secondary px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground-secondary">
            {agent.system_prompt}
          </pre>
        </div>
      )}

      <DeleteDialog
        open={confirmOpen}
        name={agent.name}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-[13px] text-foreground-tertiary">选择一个项目查看详情</p>
    </div>
  );
}

// ── Root dispatcher ───────────────────────────────────────────────────────────

export function ExtDetailPanel() {
  const selectedKey = useExtensionStore((s) => s.selectedKey);
  const setSelectedKey = useExtensionStore((s) => s.setSelectedKey);
  const externalSkills = useSkillsStore((s) => s.externalSkills);
  const enabledNames = useSkillsStore((s) => s.enabledSkillNames);
  const toggleSkillEnabled = useSkillsStore((s) => s.toggleSkillEnabled);
  const deleteSkill = useSkillsStore((s) => s.deleteSkill);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);

  const bundledSkills = useMemo(() => getAllBundledSkills(), []);

  const content = useMemo(() => {
    if (!selectedKey) return null;

    if (selectedKey.startsWith("builtin:")) {
      const name = selectedKey.slice("builtin:".length);
      const skill = bundledSkills.find((s) => s.meta.name === name);
      if (!skill) return null;
      return (
        <SkillDetailContent
          name={skill.meta.name}
          description={skill.meta.description}
          content={skill.content}
          addedBy="内置"
          enabled={enabledNames.includes(skill.meta.name)}
          onToggle={() => void toggleSkillEnabled(skill.meta.name)}
          onUse={() => setActivePage("chat")}
        />
      );
    }

    if (selectedKey.startsWith("ext:")) {
      const folderName = selectedKey.slice("ext:".length);
      const entry = externalSkills.find((s) => s.folderName === folderName);
      if (!entry) return null;
      const { meta, content: skillContent } = entry.skill;
      return (
        <SkillDetailContent
          name={meta.name}
          description={meta.description}
          content={skillContent}
          addedBy="用户"
          enabled={enabledNames.includes(meta.name)}
          onToggle={() => void toggleSkillEnabled(meta.name)}
          onUse={() => setActivePage("chat")}
          onDelete={() => void deleteSkill(folderName, workspacePath).then(() => setSelectedKey(null))}
        />
      );
    }

    if (selectedKey.startsWith("file:")) {
      return (
        <div className="text-[13px] text-foreground-secondary">文件预览功能即将推出</div>
      );
    }

    if (selectedKey.startsWith("tool:")) {
      return <ToolDetailContent toolKey={selectedKey} />;
    }

    if (selectedKey.startsWith("connector:")) {
      const id = selectedKey.slice("connector:".length);
      return <ConnectorDetailContent serverId={id} />;
    }

    if (selectedKey.startsWith("subagent:")) {
      const id = selectedKey.slice("subagent:".length);
      return <SubAgentDetailContent agentId={id} />;
    }

    return null;
  }, [selectedKey, bundledSkills, externalSkills, enabledNames, toggleSkillEnabled, deleteSkill, setActivePage, setSelectedKey]);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden",
        selectedKey ? "bg-background" : "bg-background-secondary",
      )}
    >
      {selectedKey ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{content}</div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
