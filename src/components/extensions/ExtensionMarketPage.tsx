import { useEffect } from "react";
import { useExtensionStore } from "@/stores/extensionStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { ExtNavPanel } from "./ExtNavPanel";
import { ExtListPanel } from "./ExtListPanel";
import { ExtDetailPanel } from "./ExtDetailPanel";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { CreateMcpDialog } from "./CreateMcpDialog";
import { CreateSubAgentDialog } from "./CreateSubAgentDialog";

export default function ExtensionMarketPage() {
  const createDialogType = useExtensionStore((s) => s.createDialogType);
  const setCreateDialogType = useExtensionStore((s) => s.setCreateDialogType);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);
  const loadExternalSkills = useSkillsStore((s) => s.loadExternalSkills);
  const loadEnabledSkillNames = useSkillsStore((s) => s.loadEnabledSkillNames);

  useEffect(() => {
    void loadExternalSkills(workspacePath);
    void loadEnabledSkillNames();
  }, [loadExternalSkills, loadEnabledSkillNames, workspacePath]);

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      {/* Layer 1 — left nav */}
      <ExtNavPanel />

      {/* Layer 2 — middle list */}
      <ExtListPanel />

      {/* Layer 3 — right detail */}
      <ExtDetailPanel />

      {/* Create dialogs */}
      <CreateSkillDialog
        open={createDialogType === "skill"}
        onOpenChange={(open) => { if (!open) setCreateDialogType(null); }}
      />
      <CreateMcpDialog
        open={createDialogType === "mcp"}
        onOpenChange={(open) => { if (!open) setCreateDialogType(null); }}
      />
      <CreateSubAgentDialog
        open={createDialogType === "subagent"}
        onOpenChange={(open) => { if (!open) setCreateDialogType(null); }}
      />
    </div>
  );
}
