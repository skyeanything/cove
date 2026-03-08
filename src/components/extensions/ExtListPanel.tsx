import { useRef, useState, useEffect } from "react";
import { Search, Plus, MessageSquare, PenLine, Upload, FolderOpen, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useExtensionStore } from "@/stores/extensionStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { useSkillsStore } from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { parseSkillFields } from "@/components/settings/skill-utils";
import {
  importFromZip,
  validateSkillContent,
} from "@/lib/skill-import";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkillsListContent } from "./list/SkillsListContent";
import { ConnectorsListContent } from "./list/ConnectorsListContent";
import { ToolsListContent } from "./list/ToolsListContent";
import { SubAgentListContent } from "./list/SubAgentListContent";

const NAV_LABELS: Record<string, string> = {
  skills: "Skills",
  tools: "Tools",
  connectors: "Connectors",
  subagent: "Agents",
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Reset search when switching tabs
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, [activeNav]);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const handleOpenSearch = () => {
    setSearchOpen(true);
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const handleDirectCreate = () => {
    if (activeNav === "connectors") setCreateDialogType("mcp");
    else if (activeNav === "subagent") setCreateDialogType("subagent");
  };

  /** Finish import after content is extracted: validate then save. */
  const finishImport = async (content: string, folderName: string) => {
    const error = validateSkillContent(content);
    if (error) {
      setImportError(error);
      return;
    }
    const fields = parseSkillFields(content);
    const name = fields.name.trim() || folderName;
    try {
      await saveSkill(name, content, workspacePath, name);
    } catch (err) {
      setImportError(String(err));
    }
  };

  /** Handle .md / .zip file import */
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.name.toLowerCase().endsWith(".zip")) {
      void importFromZip(file)
        .then((result) => {
          if ("error" in result) {
            setImportError(result.error);
          } else {
            void finishImport(result.content, result.folderName);
          }
        })
        .catch((err: unknown) => {
          setImportError(String(err));
        });
      return;
    }

    // .md / .txt: read as text
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const folderName = file.name.replace(/\.(md|txt)$/i, "");
      void finishImport(content, folderName);
    };
    reader.onerror = () => setImportError("读取文件失败");
    reader.readAsText(file);
  };

  /** Handle folder import via Tauri native dialog + backend read */
  const handleImportFolder = async () => {
    let folderPath: string | null;
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      folderPath = typeof selected === "string" ? selected : null;
    } catch (err) {
      setImportError(String(err));
      return;
    }
    if (!folderPath) return; // user cancelled

    try {
      const content = await invoke<string>("read_skill_from_path", { folderPath });
      const folderName = folderPath.split(/[\\/]/).pop() ?? "imported-skill";
      await finishImport(content, folderName);
    } catch (err) {
      setImportError(String(err));
    }
  };

  return (
    <div className="flex w-[260px] shrink-0 flex-col border-r border-border bg-background">
      {/* Header */}
      <div className="flex h-[46px] shrink-0 items-center border-b border-border px-3">
        {searchOpen ? (
          /* Search mode: input + close */
          <div className="flex flex-1 items-center gap-1.5">
            <Search className="size-3.5 shrink-0 text-foreground-tertiary" strokeWidth={1.5} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索..."
              onKeyDown={(e) => e.key === "Escape" && handleCloseSearch()}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-foreground-tertiary focus:outline-none"
            />
            <button
              onClick={handleCloseSearch}
              className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
              title="关闭搜索"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          /* Normal mode: title + action buttons */
          <>
            <span className="flex-1 text-[13px] font-semibold text-foreground">
              {NAV_LABELS[activeNav] ?? activeNav}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleOpenSearch}
                className="rounded-md p-1 text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
                title="搜索"
              >
                <Search className="size-3.5" strokeWidth={1.5} />
              </button>

              {/* Skills: 4-option dropdown */}
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
                      <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                        <Upload className="mr-2 size-3.5" strokeWidth={1.5} />
                        导入文件
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* .md and .zip file picker */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,.zip"
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
          </>
        )}
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeNav === "skills" && <SkillsListContent searchQuery={searchQuery} />}
        {activeNav === "connectors" && <ConnectorsListContent searchQuery={searchQuery} />}
        {activeNav === "tools" && <ToolsListContent searchQuery={searchQuery} />}
        {activeNav === "subagent" && <SubAgentListContent searchQuery={searchQuery} />}
      </div>

      {/* Import source picker dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[280px]">
          <DialogHeader>
            <DialogTitle className="text-[14px]">导入 Skill</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => { setImportDialogOpen(false); fileInputRef.current?.click(); }}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-background-tertiary"
            >
              <Upload className="size-4 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
              <div>
                <div className="font-medium">选择文件</div>
                <div className="text-[11px] text-foreground-tertiary">.md、.txt 或 .zip</div>
              </div>
            </button>
            <button
              onClick={() => { setImportDialogOpen(false); void handleImportFolder(); }}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-background-tertiary"
            >
              <FolderOpen className="size-4 shrink-0 text-foreground-secondary" strokeWidth={1.5} />
              <div>
                <div className="font-medium">选择文件夹</div>
                <div className="text-[11px] text-foreground-tertiary">包含 SKILL.md 的文件夹</div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import validation error dialog */}
      <AlertDialog open={importError !== null} onOpenChange={(open) => !open && setImportError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入失败</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {importError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportError(null)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
