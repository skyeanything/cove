import { useRef } from "react";
import { Search, Plus, MessageSquare, PenLine, Upload } from "lucide-react";
import { useExtensionStore } from "@/stores/extensionStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { parseSkillFields } from "@/components/settings/skill-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SkillsListContent } from "./list/SkillsListContent";
import { ConnectorsListContent } from "./list/ConnectorsListContent";
import { ToolsListContent } from "./list/ToolsListContent";
import { SubAgentListContent } from "./list/SubAgentListContent";

const NAV_LABELS: Record<string, string> = {
  skills: "Skills",
  tools: "Tools",
  connectors: "Connectors",
  subagent: "SubAgents",
};

// Connectors and SubAgents support direct creation; Tools do not.
const DIRECT_CREATE = new Set(["connectors", "subagent"]);

export function ExtListPanel() {
  const activeNav = useExtensionStore((s) => s.activeNav);
  const setCreateDialogType = useExtensionStore((s) => s.setCreateDialogType);
  const setActivePage = useLayoutStore((s) => s.setActivePage);
  const saveSkill = useSkillsStore((s) => s.saveSkill);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path ?? null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDirectCreate = () => {
    if (activeNav === "connectors") setCreateDialogType("mcp");
    else if (activeNav === "subagent") setCreateDialogType("subagent");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const fields = parseSkillFields(content);
      const name = fields.name.trim() || file.name.replace(/\.md$/i, "");
      if (!name) return;
      void saveSkill(name, content, workspacePath, name);
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-background">
      {/* Header */}
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[13px] font-semibold text-foreground">
          {NAV_LABELS[activeNav] ?? activeNav}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
            title="搜索"
          >
            <Search className="size-3.5" strokeWidth={1.5} />
          </button>

          {/* Skills: 3-option dropdown */}
          {activeNav === "skills" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
                    title="新建"
                  >
                    <Plus className="size-3.5" strokeWidth={1.5} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setActivePage("chat")}>
                    <MessageSquare className="mr-2 size-3.5" strokeWidth={1.5} />
                    对话创建
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateDialogType("skill")}>
                    <PenLine className="mr-2 size-3.5" strokeWidth={1.5} />
                    手动创建
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 size-3.5" strokeWidth={1.5} />
                    导入文件
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt"
                className="hidden"
                onChange={handleImportFile}
              />
            </>
          )}

          {/* Connectors / SubAgents: direct create */}
          {DIRECT_CREATE.has(activeNav) && (
            <button
              onClick={handleDirectCreate}
              className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
              title="新建"
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeNav === "skills" && <SkillsListContent />}
        {activeNav === "connectors" && <ConnectorsListContent />}
        {activeNav === "tools" && <ToolsListContent />}
        {activeNav === "subagent" && <SubAgentListContent />}
      </div>
    </div>
  );
}
