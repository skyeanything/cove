import { DocxHtmlViewer } from "./DocxHtmlViewer";

interface DocxViewerProps {
  dataUrl: string;
  className?: string;
}

export function DocxViewer({ dataUrl, className }: DocxViewerProps) {
  return <DocxHtmlViewer dataUrl={dataUrl} className={className} />;
}
