import { tool } from "ai";
import { z } from "zod/v4";
import { invoke } from "@tauri-apps/api/core";
import { renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/** Map user-facing theme names to beautiful-mermaid built-in themes. */
const THEME_MAP: Record<string, string> = {
  default: "zinc-light",
  dark: "zinc-dark",
  forest: "nord-light",
  neutral: "github-light",
};

/**
 * Convert an SVG string to a PNG base64 string (without the data URL prefix).
 * Uses a data URI instead of blob URL to avoid WKWebView canvas taint.
 */
async function svgToPngBase64(svgStr: string, scale: number): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgStr, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) throw new Error("Invalid SVG output from beautiful-mermaid");

  let width = 0;
  let height = 0;
  const viewBox = svgEl.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] !== undefined && parts[3] !== undefined) {
      width = parts[2];
      height = parts[3];
    }
  }
  if (!width) width = parseFloat(svgEl.getAttribute("width") || "800");
  if (!height) height = parseFloat(svgEl.getAttribute("height") || "600");

  const canvasW = Math.ceil(width * scale);
  const canvasH = Math.ceil(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create canvas 2d context");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Data URI avoids WKWebView canvas taint (unlike blob URLs)
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
  const img = new Image();
  img.width = canvasW;
  img.height = canvasH;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load SVG as image"));
    img.src = svgDataUrl;
  });
  ctx.drawImage(img, 0, 0, canvasW, canvasH);

  const dataUrl = canvas.toDataURL("image/png");
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Unexpected canvas data URL format");
  return dataUrl.slice(prefix.length);
}

export const renderMermaidTool = tool({
  description:
    "Render a Mermaid diagram to a PNG image file in the workspace. " +
    "Accepts mermaid code and saves the rendered PNG. " +
    "Use this before officellm addImage to insert diagrams into documents.",
  inputSchema: z.object({
    code: z.string().describe("Mermaid diagram code"),
    filename: z
      .string()
      .optional()
      .describe("Output filename (default: mermaid-{timestamp}.png)"),
    scale: z
      .number()
      .min(1)
      .max(4)
      .optional()
      .describe("Resolution multiplier 1-4 (default: 2)"),
    theme: z
      .enum(["default", "dark", "forest", "neutral"])
      .optional()
      .describe("Mermaid theme (default: 'default')"),
  }),
  execute: async ({ code, filename, scale, theme }) => {
    const activeWorkspace = useWorkspaceStore.getState().activeWorkspace;
    if (!activeWorkspace) {
      return "请先在输入框上方选择工作区目录，再使用 render_mermaid 工具。";
    }
    const workspaceRoot = activeWorkspace.path;
    const resolvedScale = scale ?? 2;
    let outputName = filename || `mermaid-${Date.now()}.png`;
    if (!outputName.toLowerCase().endsWith(".png")) {
      outputName += ".png";
    }

    try {
      const themeKey = THEME_MAP[theme ?? "default"] ?? "zinc-light";
      const colors = THEMES[themeKey];
      const svg = renderMermaidSVG(code, { ...colors });

      const pngBase64 = await svgToPngBase64(svg, resolvedScale);

      const absPath = await invoke<string>("write_binary_file", {
        args: {
          workspaceRoot,
          path: outputName,
          contentBase64: pngBase64,
        },
      });

      return `Mermaid diagram saved to: ${absPath}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `render_mermaid failed: ${msg}`;
    }
  },
});
