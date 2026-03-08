import { Component, type ReactNode } from "react";
import Prism from "prismjs";
import { Highlight, themes } from "prism-react-renderer";
import { getPrismLanguage } from "@/lib/preview-types";
import { useThemeStore } from "@/stores/themeStore";

// 与 MarkdownContent 一致，确保语言已加载
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-markup";

interface CodeViewerProps {
  path: string;
  code: string;
  className?: string;
}

// ErrorBoundary catches render-phase errors from Highlight/Prism that
// the try/catch in the function component cannot intercept.
class CodeViewerBoundary extends Component<
  { code: string; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { code: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <pre className="m-0 overflow-auto pt-1 pb-1 text-[13px] leading-relaxed text-foreground">
          {this.props.code}
        </pre>
      );
    }
    return this.props.children;
  }
}

/** 只读代码预览：语法高亮 + 行号，主题随深色模式切换 */
export function CodeViewer({ path, code, className }: CodeViewerProps) {
  const themeMode = useThemeStore((s) => s.theme);
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = isDark ? themes.oneDark : themes.oneLight;

  const lang = getPrismLanguage(path);
  return (
    // key=path resets the boundary when the user navigates to a different file
    <CodeViewerBoundary key={path} code={code}>
      <div className={className}>
        <Highlight prism={Prism} language={lang} code={code} theme={theme}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="m-0 overflow-auto pt-1 pb-1 text-[13px] leading-relaxed">
              <code>
                {tokens.map((line, i) => (
                  <span key={i} {...getLineProps({ line })} className="block">
                    <span className="file-preview-line-num mr-3 inline-block w-6 select-none text-right">
                      {i + 1}
                    </span>
                    {line.map((token, k) => (
                      <span key={k} {...getTokenProps({ token })} />
                    ))}
                  </span>
                ))}
              </code>
            </pre>
          )}
        </Highlight>
      </div>
    </CodeViewerBoundary>
  );
}
