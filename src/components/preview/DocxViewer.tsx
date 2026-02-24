import { OfficePdfViewer } from "./OfficePdfViewer";

interface DocxViewerProps {
  dataUrl: string;
  className?: string;
}

export function DocxViewer({ dataUrl, className }: DocxViewerProps) {
  return (
    <OfficePdfViewer
      dataUrl={dataUrl}
      command="docx_to_pdf"
      convertingLabel="正在转换文档…"
      className={className}
    />
  );
}
