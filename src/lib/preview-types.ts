/** 根据扩展名判断预览类型 */
export type PreviewKind = "txt" | "md" | "code" | "image" | "pdf" | "office" | "unsupported";

const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rs", "go", "html", "htm", "css", "scss", "less",
  "json", "yaml", "yml", "xml", "md", "sh", "bash", "zsh",
  "sql", "graphql", "vue", "svelte",
]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"]);
const OFFICE_EXTS = new Set(["docx", "xlsx", "pptx", "qmd"]);

export function getPreviewKind(path: string): PreviewKind {
  const basename = path.split("/").pop() ?? path;
  if (basename.startsWith(".")) return "txt";
  const ext = path.replace(/^.*\./, "").toLowerCase();
  if (!ext) return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "pdf") return "pdf";
  if (OFFICE_EXTS.has(ext)) return "office";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (CODE_EXTS.has(ext)) return "code";
  if (ext === "txt" || ext === "log" || ext === "csv") return "txt";
  return "unsupported";
}

/** 扩展名 -> Prism 语言（需与 MarkdownContent 已加载的 components 一致） */
export const EXT_TO_PRISM_LANG: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  html: "markup",
  htm: "markup",
  css: "css",
  scss: "css",
  less: "css",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  qmd: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
};

export function getPrismLanguage(path: string): string {
  const ext = path.replace(/^.*\./, "").toLowerCase();
  return EXT_TO_PRISM_LANG[ext] ?? "plaintext";
}
