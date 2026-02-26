import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ChevronRight, Pencil, Trash2, MessageSquarePlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getAllBundledSkills } from "@/lib/ai/skills/loader";
import {
  useSkillsStore,
  getSkillDirPaths,
  setSkillDirPaths,
} from "@/stores/skillsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { Skill } from "@/lib/ai/skills/types";
import type { ExternalSkillWithSource } from "@/stores/skillsStore";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

// ─── Frontmatter helpers ────────────────────────────────────────────

interface SkillFields {
  name: string;
  emoji: string;
  description: string;
  instructions: string;
  /** Frontmatter lines not recognised as known fields — preserved on round-trip */
  extraFrontmatter: string[];
}

const KNOWN_FRONTMATTER_KEYS = new Set(["name", "emoji", "description"]);

function parseSkillFields(content: string): SkillFields {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { name: "", emoji: "", description: "", instructions: content, extraFrontmatter: [] };
  const block = match[1]!;
  const body = match[2]!.trim();
  const get = (key: string) => {
    const m = block.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "m"));
    return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : "";
  };
  const extra: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const keyMatch = line.match(/^(\w[\w-]*)\s*:/);
    if (keyMatch && KNOWN_FRONTMATTER_KEYS.has(keyMatch[1]!)) continue;
    if (line.trim()) extra.push(line);
  }
  return { name: get("name"), emoji: get("emoji"), description: get("description"), instructions: body, extraFrontmatter: extra };
}

function buildSkillMd({ name, emoji, description, instructions, extraFrontmatter }: SkillFields): string {
  const lines = ["---", `name: ${name}`];
  if (emoji.trim()) lines.push(`emoji: ${emoji.trim()}`);
  lines.push(`description: ${description}`);
  for (const line of extraFrontmatter) lines.push(line);
  lines.push("---", "", instructions);
  return lines.join("\n");
}

// ─── Section heading ────────────────────────────────────────────────
function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 pb-1.5 pt-5">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {children}
      </h3>
      {action}
    </div>
  );
}

// ─── Built-in skill row (read-only) ────────────────────────────────
function BuiltInSkillRow({
  skill,
  enabled,
  onToggle,
}: {
  skill: Skill;
  enabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { meta, content, resources } = skill;
  const version = meta.metadata?.version;
  const author = meta.metadata?.author;

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {meta.emoji && <span className="text-sm">{meta.emoji}</span>}
            <span className="text-[13px] font-medium text-foreground">
              {meta.name}
            </span>
            {version && (
              <span className="text-[11px] text-muted-foreground">
                {t("skills.version", { version })}
              </span>
            )}
          </div>
          {meta.description && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {meta.description}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
            {author && <span>{author}</span>}
            {resources && resources.length > 0 && (
              <span>
                {t("skills.resources", { count: resources.length })}
              </span>
            )}
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} size="sm" />
      </div>
      {/* Expandable content */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-1.5 flex cursor-pointer items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-150",
            expanded && "rotate-90",
          )}
          strokeWidth={1.5}
        />
        {expanded ? t("skills.hideContent") : t("skills.viewContent")}
      </button>
      {expanded && (
        <div className="mt-2 max-h-[300px] overflow-auto rounded-lg bg-background-tertiary p-3">
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/80">
            {content.slice(0, 3000)}
            {content.length > 3000 && "\n\n… (truncated)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── External/User skill row (with edit/delete) ────────────────────
function ExternalSkillRow({
  ext,
  enabled,
  onToggle,
  isCoveSkill,
  onEdit,
  onDelete,
}: {
  ext: ExternalSkillWithSource;
  enabled: boolean;
  onToggle: () => void;
  isCoveSkill: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { meta, content } = ext.skill;

  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {meta.emoji && <span className="text-sm">{meta.emoji}</span>}
            <span className="text-[13px] font-medium text-foreground">
              {meta.name}
            </span>
            <span className="shrink-0 rounded bg-brand/15 px-1 py-px text-[10px] font-medium capitalize text-brand">
              {ext.source}
            </span>
          </div>
          {meta.description && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {meta.description}
            </p>
          )}
          <p
            className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60"
            title={ext.path}
          >
            {ext.path}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isCoveSkill && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background-tertiary hover:text-foreground"
                title={t("skills.editSkill")}
              >
                <Pencil className="size-3" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title={t("skills.deleteSkill")}
              >
                <Trash2 className="size-3" strokeWidth={1.5} />
              </button>
            </>
          )}
          <Switch checked={enabled} onCheckedChange={onToggle} size="sm" />
        </div>
      </div>
      {/* Expandable content */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-1.5 flex cursor-pointer items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-150",
            expanded && "rotate-90",
          )}
          strokeWidth={1.5}
        />
        {expanded ? t("skills.hideContent") : t("skills.viewContent")}
      </button>
      {expanded && (
        <div className="mt-2 max-h-[300px] overflow-auto rounded-lg bg-background-tertiary p-3">
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/80">
            {content.slice(0, 3000)}
            {content.length > 3000 && "\n\n… (truncated)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Structured Skill Edit Dialog ───────────────────────────────────
function SkillEditDialog({
  open,
  onOpenChange,
  fields,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: SkillFields;
  onSave: (fields: SkillFields) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState(fields.emoji);
  const [description, setDescription] = useState(fields.description);
  const [instructions, setInstructions] = useState(fields.instructions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setEmoji(fields.emoji);
      setDescription(fields.description);
      setInstructions(fields.instructions);
      setError("");
    }
  }, [open, fields]);

  const handleSave = async () => {
    if (!description.trim()) {
      setError(t("skills.descriptionPlaceholder"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: fields.name, emoji, description, instructions, extraFrontmatter: fields.extraFrontmatter });
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
          <DialogTitle>{t("skills.editSkill")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("skills.editSkill")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <Label className="mb-1.5 text-[12px]">{t("skills.nameLabel")}</Label>
            <Input
              value={fields.name}
              disabled
              className="font-mono text-[13px] opacity-60"
            />
          </div>
          <div>
            <Label className="mb-1.5 text-[12px]">{t("skills.emojiLabel")}</Label>
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder={t("skills.emojiPlaceholder")}
              className="text-[13px]"
            />
          </div>
          <div>
            <Label className="mb-1.5 text-[12px]">{t("skills.descriptionLabel")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("skills.descriptionPlaceholder")}
              rows={3}
              className="resize-none text-[13px] leading-relaxed"
            />
          </div>
          <div>
            <Label className="mb-1.5 text-[12px]">{t("skills.instructionsLabel")}</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t("skills.instructionsPlaceholder")}
              rows={10}
              className="resize-none font-mono text-[12px] leading-relaxed"
            />
          </div>
          {error && (
            <p className="text-[12px] text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t("skills.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {t("skills.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation ────────────────────────────────────────────
function DeleteSkillDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("skills.deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("skills.deleteConfirmDesc", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("skills.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("skills.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
// FILE_SIZE_EXCEPTION — single-file page with dialog components
export function SkillsPage() {
  const { t } = useTranslation();
  const loadExternalSkills = useSkillsStore((s) => s.loadExternalSkills);
  const loadEnabledSkillNames = useSkillsStore((s) => s.loadEnabledSkillNames);
  const externalSkills = useSkillsStore((s) => s.externalSkills);
  const enabledSkillNames = useSkillsStore((s) => s.enabledSkillNames);
  const loading = useSkillsStore((s) => s.loading);
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
    await saveSkill(editFolderName, content, workspacePath ?? null);
  };

  const handleConfirmDelete = async () => {
    await deleteSkillAction(deleteFolderName, workspacePath ?? null);
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
        {discoveredSkills.length === 0 ? (
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
