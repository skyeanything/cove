import type { DraftAttachment } from "@/stores/chat-types";
import { isImageAttachment, isPdfAttachment } from "@/lib/attachment-utils";

export const SMALL_FILE_THRESHOLD = 8_000;

export interface InjectionOptions {
  modelSupportsVision: boolean;
  modelSupportsPdfNative: boolean;
  smallThreshold?: number;
}

/** Content part types matching Vercel AI SDK UserContent array elements */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "file"; data: string; mediaType: string };

export interface InjectionResult {
  textBlock: string;
  visionParts: ContentPart[];
  pdfParts: ContentPart[];
}

/**
 * Build attachment injection for user message context.
 *
 * Rules:
 * - Image + vision model -> vision content part + path text
 * - Image + no vision -> path + dimensions text only
 * - Doc <= threshold chars -> full parsed_content in fenced block
 * - Doc > threshold chars -> parsed_summary + path + "use `read`"
 * - Doc with no parsed content -> path + "use `read`"
 * - PDF + native model -> PDF content part + path text
 */
export function buildAttachmentInjection(
  attachments: DraftAttachment[],
  options: InjectionOptions,
): InjectionResult {
  const threshold = options.smallThreshold ?? SMALL_FILE_THRESHOLD;
  const textBlocks: string[] = [];
  const visionParts: ContentPart[] = [];
  const pdfParts: ContentPart[] = [];

  for (const a of attachments) {
    if (isImageAttachment(a)) {
      handleImage(a, options, textBlocks, visionParts);
    } else if (isPdfAttachment(a)) {
      handlePdf(a, options, threshold, textBlocks, pdfParts);
    } else {
      handleDocument(a, threshold, textBlocks);
    }
  }

  return {
    textBlock: textBlocks.length > 0 ? "\n\n" + textBlocks.join("\n\n") : "",
    visionParts,
    pdfParts,
  };
}

function handleImage(
  a: DraftAttachment,
  options: InjectionOptions,
  textBlocks: string[],
  visionParts: ContentPart[],
): void {
  const pathInfo = a.workspace_path ?? a.path ?? a.name ?? "unknown";
  const dims = a.parsed_summary;
  const label = `[Image: ${a.name ?? "image"} at ${pathInfo}${dims ? ` (${dims})` : ""}]`;

  if (options.modelSupportsVision && a.content?.startsWith("data:image/")) {
    visionParts.push({ type: "image", image: a.content });
    textBlocks.push(label + "\nImage attached as multimodal content. If you cannot view it, tell the user this model may not support image input.");
  } else {
    textBlocks.push(label + "\nThis is an image file. You cannot extract text from images. Describe available metadata to the user, or suggest a vision-capable model.");
  }
}

function handlePdf(
  a: DraftAttachment,
  options: InjectionOptions,
  threshold: number,
  textBlocks: string[],
  pdfParts: ContentPart[],
): void {
  const pathInfo = a.workspace_path ?? a.path ?? a.name ?? "unknown";

  if (options.modelSupportsPdfNative) {
    const dataUrl = a.content?.startsWith("data:") && a.content.includes("application/pdf")
      ? a.content
      : undefined;
    if (dataUrl) {
      pdfParts.push({ type: "file", data: dataUrl, mediaType: "application/pdf" });
      let block = `[PDF: ${a.name ?? "document"} at ${pathInfo}]`;
      if (a.parsed_content) {
        const preview = a.parsed_content.length <= threshold
          ? a.parsed_content
          : (a.parsed_summary ?? a.parsed_content.slice(0, 800));
        block += `\nExtracted text preview:\n\`\`\`\n${preview}\n\`\`\``;
      }
      block += "\nPDF attached natively. If you cannot process it, use the extracted text above or the parse_document tool.";
      textBlocks.push(block);
      return;
    }
    // No PDF data URL available -- fall through to text-based injection
  }

  handleDocument(a, threshold, textBlocks);
}

function handleDocument(
  a: DraftAttachment,
  threshold: number,
  textBlocks: string[],
): void {
  const pathInfo = a.workspace_path ?? a.path ?? a.name ?? "unknown";
  const name = a.name ?? "document";

  if (!a.parsed_content) {
    textBlocks.push(`[Attachment: ${name} at ${pathInfo} -- use \`read\` tool to view content]`);
    return;
  }

  const charCount = a.parsed_content.length;
  if (charCount <= threshold) {
    textBlocks.push(
      `[Attachment: ${name} at ${pathInfo}]\n` +
      "```\n" +
      a.parsed_content +
      "\n```",
    );
  } else {
    const summary = a.parsed_summary ?? a.parsed_content.slice(0, 800);
    textBlocks.push(
      `[Attachment: ${name} at ${pathInfo} (${charCount} chars, truncated)]\n` +
      "```\n" +
      summary +
      "\n```\n" +
      `Full content available via \`read\` tool at: ${pathInfo}`,
    );
  }
}
