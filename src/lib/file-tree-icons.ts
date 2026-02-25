import {
  File,
  FileCode,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideoCamera,
  FileMusic,
  FileArchive,
  FileBraces,
  type LucideIcon,
} from "lucide-react";
import React from "react";

/** 按扩展名映射到 Lucide 文件图标，统一使用 foreground-secondary 风格 */
export const FILE_ICON_MAP: Record<string, LucideIcon> = {
  // 代码
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  py: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  kt: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
  vue: FileCode,
  svelte: FileCode,
  swift: FileCode,
  sh: FileCode,
  bash: FileCode,
  zsh: FileCode,
  // 文档
  txt: FileText,
  md: FileText,
  mdx: FileText,
  doc: FileText,
  docx: FileText,
  rtf: FileText,
  pdf: FileText,
  // 表格
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  // 图片
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  svg: FileImage,
  ico: FileImage,
  bmp: FileImage,
  // 视频 / 音频
  mp4: FileVideoCamera,
  webm: FileVideoCamera,
  mov: FileVideoCamera,
  mkv: FileVideoCamera,
  mp3: FileMusic,
  wav: FileMusic,
  ogg: FileMusic,
  m4a: FileMusic,
  // 压缩包
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  "7z": FileArchive,
  rar: FileArchive,
  // 数据 / 配置
  json: FileBraces,
  yaml: FileBraces,
  yml: FileBraces,
};

export function getFileIcon(path: string, className: string, strokeWidth: number): React.ReactNode {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const Icon = FILE_ICON_MAP[ext] ?? File;
  return React.createElement(Icon, { className, strokeWidth });
}
