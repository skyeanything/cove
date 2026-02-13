import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 粗略去掉 Markdown 语法，得到近似纯文本（用于「复制为纯文本」） */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```\w*\n?|```$/g, "").trim() + "\n")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ")
    .trim();
}
