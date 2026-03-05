import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { DraftAttachment } from "@/stores/chatStore";
import { isSupportedUploadFile } from "@/lib/attachment-utils";
import { processAttachment } from "@/lib/attachment-pipeline";

export async function pickAndSaveAttachments(
  addDraftAttachments: (attachments: DraftAttachment[]) => void,
  setAttachError: (err: string | null) => void,
  workspacePath?: string,
) {
  const selected = await openDialog({ directory: false, multiple: true });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  const supportedPaths = paths.filter((path) => isSupportedUploadFile(path));
  const rejectedCount = paths.length - supportedPaths.length;
  if (supportedPaths.length === 0) {
    setAttachError("仅支持图片与文档文件（pdf/txt/md/docx/xlsx/pptx/代码文件等）。");
    return;
  }
  const attachments = (
    await Promise.all(
      supportedPaths.map(async (sourcePath): Promise<DraftAttachment | null> => {
        try {
          return await processAttachment(sourcePath, workspacePath);
        } catch {
          return null;
        }
      }),
    )
  ).filter((item): item is DraftAttachment => item !== null);
  if (attachments.length > 0) {
    addDraftAttachments(attachments);
    setAttachError(
      rejectedCount > 0
        ? `已添加 ${attachments.length} 个文件，忽略 ${rejectedCount} 个不支持类型。`
        : null,
    );
  } else {
    setAttachError("文件添加失败，请重试。");
  }
}
