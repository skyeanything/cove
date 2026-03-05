const READABLE_OFFICE_EXTENSIONS = new Set(["docx", "xlsx", "pptx", "pdf"]);
const WRITABLE_OFFICE_EXTENSIONS = new Set(["docx"]);

function getExtension(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1 || dot === filePath.length - 1) return "";
  return filePath.slice(dot + 1).toLowerCase();
}

export function isOfficeReadable(filePath: string): boolean {
  return READABLE_OFFICE_EXTENSIONS.has(getExtension(filePath));
}

export function isOfficeWritable(filePath: string): boolean {
  return WRITABLE_OFFICE_EXTENSIONS.has(getExtension(filePath));
}
