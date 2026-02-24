import { OfficePdfViewer } from "./OfficePdfViewer";

interface DocxViewerProps {
  dataUrl: string;
  className?: string;
}

export function DocxViewer({ dataUrl, className }: DocxViewerProps) {
  return (
    <OfficePdfViewer
      dataUrl={dataUrl}
      command="docx_to_pdf_via_pages"
      convertingLabel="正在使用 Pages 转换文档…"
      className={className}
    />
  );
}
