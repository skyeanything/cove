import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, MessageSquarePlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { getAllBundledSkills } from "@/lib/ai/skills/loader";
import {
  useSkillsStore,
  getSkillDirPaths,
  setSkillDirPaths,
} from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { ExternalSkillWithSource } from "@/stores/skillsStore";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { parseSkillFields, buildSkillMd } from "./skill-utils";
import type { SkillFields } from "./skill-utils";
import { SkillEditDialog, DeleteSkillDialog } from "./SkillEditDialog";
import { SectionHeading, BuiltInSkillRow, ExternalSkillRow } from "./SkillRow";

// ─── Skill Directories Editor ───────────────────────────────────────
function SkillDirectoriesSection() {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSkillDirPaths().then((paths) => {
      setValue(paths.join("\n"));
      setLoaded(true);
    });
  }, []);

  const handleBlur = async () => {
    if (!loaded) return;
    const paths = value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await setSkillDirPaths(paths);
  };

  return (
    <div className="px-5 pb-5">
      <p className="mb-2 text-[12px] text-muted-foreground">
        {t("skills.skillDirsDesc")}
      </p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={t("skills.skillDirsPlaceholder")}
        rows={3}
        className="resize-none font-mono text-[12px]"
      />
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        {t("skills.skillDirsHint")}
      </p>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export function SkillsPage() {
  const { t } = useTranslation();
  const loadExternalSkills = useSkillsStore((s) => s.loadExternalSkills);
  const loadEnabledSkillNames = useSkillsStore((s) => s.loadEnabledSkillNames);
  const externalSkills = useSkillsStore((s) => s.externalSkills);
  const enabledSkillNames = useSkillsStore((s) => s.enabledSkillNames);
  const loading = useSkillsStore((s) => s.loading);
  const scanError = useSkillsStore((s) => s.scanError);
  const toggleSkillEnabled = useSkillsStore((s) => s.toggleSkillEnabled);
  const saveSkill = useSkillsStore((s) => s.saveSkill);
  const deleteSkillAction = useSkillsStore((s) => s.deleteSkill);
  const workspacePath = useWorkspaceStore((s) => s.activeWorkspace?.path);

  const bundledSkills = getAllBundledSkills();

  // Separate user skills (cove source) from other discovered skills
  const userSkills = externalSkills.filter((e) => e.source === "cove");
  const discoveredSkills = externalSkills.filter((e) => e.source !== "cove");

  const totalCount =
    bundledSkills.length + userSkills.length + discoveredSkills.length;

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFields, setEditFields] = useState<SkillFields>({
    name: "",
    emoji: "",
    description: "",
    instructions: "",
    extraFrontmatter: [],
  });

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleteFolderName, setDeleteFolderName] = useState("");

  useEffect(() => {
    loadEnabledSkillNames();
    loadExternalSkills(workspacePath ?? null);
  }, [loadEnabledSkillNames, loadExternalSkills, workspacePath]);

  const handleRefresh = useCallback(() => {
    loadExternalSkills(workspacePath ?? null);
  }, [loadExternalSkills, workspacePath]);

  const handleEdit = async (ext: ExternalSkillWithSource) => {
    setEditFolderName(ext.folderName);
    try {
      const raw = await invoke<string>("read_skill", { name: ext.folderName });
      setEditFields(parseSkillFields(raw));
    } catch {
      // Fallback: reconstruct from parsed meta (loses extra frontmatter)
      const { meta, content } = ext.skill;
      setEditFields({
        name: meta.name,
        emoji: meta.emoji ?? "",
        description: meta.description ?? "",
        instructions: content,
        extraFrontmatter: [],
      });
    }
    setEditOpen(true);
  };

  const handleDelete = (ext: ExternalSkillWithSource) => {
    setDeleteName(ext.skill.meta.name);
    setDeleteFolderName(ext.folderName);
    setDeleteOpen(true);
  };

  const handleSaveEdit = async (fields: SkillFields) => {
    const content = buildSkillMd(fields);
    await saveSkill(editFolderName, content, workspacePath ?? null, fields.name);
  };

  const handleConfirmDelete = async () => {
    await deleteSkillAction(deleteFolderName, workspacePath ?? null, deleteName);
  };

  return (
    <>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[12px] text-muted-foreground">
            {t("skills.available", { count: totalCount })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-background-tertiary hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3", loading && "animate-spin")}
                strokeWidth={1.5}
              />
              {t("skills.refresh")}
            </button>
          </div>
        </div>

        {/* ── Built-in section ── */}
        <SectionHeading>{t("skills.builtIn")}</SectionHeading>
        <div className="mx-5 divide-y divide-border rounded-xl border border-border bg-background-secondary">
          {bundledSkills.map((skill) => (
            <BuiltInSkillRow
              key={`builtin:${skill.meta.name}`}
              skill={skill}
              enabled={enabledSkillNames.includes(skill.meta.name)}
              onToggle={() => toggleSkillEnabled(skill.meta.name)}
            />
          ))}
        </div>

        {/* ── User skills section (cove) ── */}
        <SectionHeading>{t("skills.userSkills")}</SectionHeading>
        {userSkills.length === 0 ? (
          <div className="mx-5 flex flex-col gap-2 rounded-xl border border-dashed border-border px-4 py-5">
            <p className="text-center text-[12px] text-muted-foreground/60">
              ~/.cove/skills
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground/50">
              <MessageSquarePlus className="size-3.5" strokeWidth={1.5} />
              {t("skills.createViaChat")}
            </p>
          </div>
        ) : (
          <div className="mx-5 divide-y divide-border rounded-xl border border-border bg-background-secondary">
            {userSkills.map((ext) => (
              <ExternalSkillRow
                key={ext.path}
                ext={ext}
                enabled={enabledSkillNames.includes(ext.skill.meta.name)}
                onToggle={() => toggleSkillEnabled(ext.skill.meta.name)}
                isCoveSkill
                onEdit={() => handleEdit(ext)}
                onDelete={() => handleDelete(ext)}
              />
            ))}
          </div>
        )}

        {/* ── Discovered skills (claude, cursor, etc.) ── */}
        <SectionHeading>{t("skills.discoveredSkills")}</SectionHeading>
        {scanError && (
          <p className="mx-5 mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {scanError}
          </p>
        )}
        {discoveredSkills.length === 0 && !scanError ? (
          <p className="mx-5 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground/60">
            {t("skills.noExternal")}
          </p>
        ) : (
          <div className="mx-5 divide-y divide-border rounded-xl border border-border">
            {discoveredSkills.map((ext) => (
              <ExternalSkillRow
                key={ext.path}
                ext={ext}
                enabled={enabledSkillNames.includes(ext.skill.meta.name)}
                onToggle={() => toggleSkillEnabled(ext.skill.meta.name)}
                isCoveSkill={false}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            ))}
          </div>
        )}

        {/* ── Skill directories ── */}
        <SectionHeading>{t("skills.skillDirs")}</SectionHeading>
        <SkillDirectoriesSection />
      </div>

      {/* Dialogs */}
      <SkillEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        fields={editFields}
        onSave={handleSaveEdit}
      />
      <DeleteSkillDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        name={deleteName}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
