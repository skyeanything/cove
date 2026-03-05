import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExtensionStore, type ExtensionTab } from "@/stores/extensionStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { SkillsTabContent } from "./tabs/SkillsTabContent";
import { McpTabContent } from "./tabs/McpTabContent";
import { PluginTabContent } from "./tabs/PluginTabContent";
import { SubAgentTabContent } from "./tabs/SubAgentTabContent";
import { CreateSkillDialog } from "./CreateSkillDialog";
import { CreateMcpDialog } from "./CreateMcpDialog";
import { CreateSubAgentDialog } from "./CreateSubAgentDialog";

const TABS: { id: ExtensionTab; labelKey: string }[] = [
  { id: "skills", labelKey: "extensions.tabs.skills" },
  { id: "mcp", labelKey: "extensions.tabs.mcp" },
  { id: "plugin", labelKey: "extensions.tabs.plugin" },
  { id: "subagent", labelKey: "extensions.tabs.subagent" },
];

export default function ExtensionMarketPage() {
  const { t } = useTranslation();
  const activeTab = useExtensionStore((s) => s.activeTab);
  const setActiveTab = useExtensionStore((s) => s.setActiveTab);
  const createDialogType = useExtensionStore((s) => s.createDialogType);
  const setCreateDialogType = useExtensionStore((s) => s.setCreateDialogType);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);

  // Load skills + enabled names on mount
  const loadExternalSkills = useSkillsStore((s) => s.loadExternalSkills);
  const loadEnabledSkillNames = useSkillsStore((s) => s.loadEnabledSkillNames);
  useEffect(() => {
    void loadExternalSkills(workspacePath);
    void loadEnabledSkillNames();
  }, [loadExternalSkills, loadEnabledSkillNames, workspacePath]);

  const canCreate = activeTab !== "plugin";

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Page header */}
      <div className="flex h-8 shrink-0 items-center border-b border-border px-6">
        <h1 className="text-[13px] font-semibold text-foreground">
          {t("extensions.title", "Extension Market")}
        </h1>
      </div>

      {/* Tab bar + Create button */}
      <div className="flex items-center justify-between border-b px-6 pb-0">
        <div className="flex gap-0.5" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative px-3 py-2 text-[13px] font-medium transition-colors",
                activeTab === tab.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.labelKey)}
              {activeTab === tab.id && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
              )}
            </button>
          ))}
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="h-7 gap-1.5 text-[12px]"
            disabled
            onClick={() => setCreateDialogType(activeTab === "subagent" ? "subagent" : activeTab === "mcp" ? "mcp" : "skill")}
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
            {t("extensions.create", "Create")}
          </Button>
        )}
      </div>

      {/* Tab content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6" role="tabpanel" id={`tabpanel-${activeTab}`}>
          {activeTab === "skills" && <SkillsTabContent />}
          {activeTab === "mcp" && <McpTabContent />}
          {activeTab === "plugin" && <PluginTabContent />}
          {activeTab === "subagent" && <SubAgentTabContent />}
        </div>
      </ScrollArea>

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
