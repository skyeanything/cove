import { OfficePdfViewer } from "./OfficePdfViewer";

interface QmdViewerProps {
  dataUrl: string;
  className?: string;
}

export function QmdViewer({ dataUrl, className }: QmdViewerProps) {
  return (
    <OfficePdfViewer
      dataUrl={dataUrl}
      command="qmd_to_pdf"
      convertingLabel="正在使用 Quarto 渲染文档…"
      className={className}
    />
  );
}
