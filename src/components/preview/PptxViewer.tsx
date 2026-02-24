import { OfficePdfViewer } from "./OfficePdfViewer";

interface PptxViewerProps {
  dataUrl: string;
  className?: string;
}

export function PptxViewer({ dataUrl, className }: PptxViewerProps) {
  return (
    <OfficePdfViewer
      dataUrl={dataUrl}
      command="pptx_to_pdf"
      convertingLabel="正在使用 Keynote 转换幻灯片…"
      className={className}
    />
  );
}
