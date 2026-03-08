import { unzipSync } from "fflate";
import { parseSkillFields } from "@/components/settings/skill-utils";

export interface SkillImportResult {
  content: string;
  /** Suggested folder name: from frontmatter `name`, ZIP filename, or folder name */
  folderName: string;
}

export interface SkillImportError {
  error: string;
}

/** Validate SKILL.md content against the Skills spec. Returns an error string or null. */
export function validateSkillContent(content: string): string | null {
  const fields = parseSkillFields(content);

  if (!fields.name.trim()) {
    return "SKILL.md 缺少 name 字段，请在 frontmatter 中添加：name: your-skill-name";
  }
  if (fields.name.length > 64) {
    return "name 字段不能超过 64 个字符";
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(fields.name)) {
    return "name 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾";
  }
  if (!fields.description.trim()) {
    return "SKILL.md 缺少 description 字段，请在 frontmatter 中添加描述";
  }

  return null;
}

/** Extract SKILL.md from a ZIP file. */
export async function importFromZip(
  file: File,
): Promise<SkillImportResult | SkillImportError> {
  let zipFiles: Record<string, Uint8Array>;
  try {
    const buffer = await file.arrayBuffer();
    zipFiles = unzipSync(new Uint8Array(buffer));
  } catch {
    return { error: "ZIP 文件损坏或格式不正确，无法解析" };
  }

  // Accept SKILL.md at root or one level deep (e.g. skill-name/SKILL.md)
  const skillEntry = Object.keys(zipFiles).find(
    (p) => p === "SKILL.md" || (p.split("/").length === 2 && p.endsWith("/SKILL.md")),
  );

  if (!skillEntry) {
    return {
      error: "ZIP 中未找到 SKILL.md 文件。\n请确保 SKILL.md 位于 ZIP 根目录或一级子目录中。",
    };
  }

  const content = new TextDecoder().decode(zipFiles[skillEntry]);
  const fields = parseSkillFields(content);
  const folderName =
    fields.name.trim() ||
    (skillEntry.includes("/") ? skillEntry.split("/")[0]! : file.name.replace(/\.zip$/i, ""));

  return { content, folderName };
}

/** Extract SKILL.md from a webkitdirectory FileList. */
export async function importFromFolder(
  files: FileList,
): Promise<SkillImportResult | SkillImportError> {
  // webkitRelativePath format: "folderName/SKILL.md" or "folderName/sub/file"
  // In Tauri WKWebView, webkitRelativePath may be empty — fall back to filename check.
  const skillFile = Array.from(files).find((f) => {
    if (f.name !== "SKILL.md") return false;
    if (f.webkitRelativePath) {
      const parts = f.webkitRelativePath.split("/");
      return parts.length === 2;
    }
    return true;
  });

  if (!skillFile) {
    return {
      error: "文件夹根目录中未找到 SKILL.md 文件。\n请确保所选文件夹直接包含 SKILL.md。",
    };
  }

  const content = await skillFile.text();
  const fields = parseSkillFields(content);
  const folderName =
    fields.name.trim() ||
    (skillFile.webkitRelativePath ? skillFile.webkitRelativePath.split("/")[0]! : "imported-skill");

  return { content, folderName };
}
