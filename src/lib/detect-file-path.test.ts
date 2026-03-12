import { describe, expect, it } from "vitest";
import { detectPreviewableFilePath } from "./detect-file-path";

describe("detectPreviewableFilePath", () => {
  it("returns a previewable code file path unchanged", () => {
    expect(detectPreviewableFilePath("src/main.tsx")).toBe("src/main.tsx");
  });

  it("returns a TypeScript file path", () => {
    expect(detectPreviewableFilePath("src/lib/utils.ts")).toBe("src/lib/utils.ts");
  });

  it("accepts a relative path starting with ./", () => {
    expect(detectPreviewableFilePath("./src/index.ts")).toBe("./src/index.ts");
  });

  it("accepts a deep nested path", () => {
    expect(detectPreviewableFilePath("src/components/App.tsx")).toBe("src/components/App.tsx");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(detectPreviewableFilePath("  src/main.tsx  ")).toBe("src/main.tsx");
  });

  it("returns null for unsupported file extension", () => {
    // .xyz is not in any supported extension set -> getPreviewKind returns 'unsupported'
    expect(detectPreviewableFilePath("src/file.xyz")).toBeNull();
  });

  it("returns bare filename with allowed extension", () => {
    expect(detectPreviewableFilePath("report.docx")).toBe("report.docx");
    expect(detectPreviewableFilePath("data.csv")).toBe("data.csv");
    expect(detectPreviewableFilePath("config.json")).toBe("config.json");
    expect(detectPreviewableFilePath("notes.md")).toBe("notes.md");
    expect(detectPreviewableFilePath("photo.png")).toBe("photo.png");
    expect(detectPreviewableFilePath("readme.txt")).toBe("readme.txt");
    expect(detectPreviewableFilePath("page.html")).toBe("page.html");
    expect(detectPreviewableFilePath("schema.yaml")).toBe("schema.yaml");
    expect(detectPreviewableFilePath("icon.svg")).toBe("icon.svg");
    expect(detectPreviewableFilePath("doc.pdf")).toBe("doc.pdf");
  });

  it("accepts bare code filenames (existence check handles false positives)", () => {
    expect(detectPreviewableFilePath("hello.js")).toBe("hello.js");
    expect(detectPreviewableFilePath("main.ts")).toBe("main.ts");
    expect(detectPreviewableFilePath("script.py")).toBe("script.py");
    expect(detectPreviewableFilePath("style.css")).toBe("style.css");
    expect(detectPreviewableFilePath("lib.rs")).toBe("lib.rs");
    expect(detectPreviewableFilePath("main.go")).toBe("main.go");
  });

  it("rejects blocklisted bare filenames that are common prose terms", () => {
    expect(detectPreviewableFilePath("console.log")).toBeNull();
    expect(detectPreviewableFilePath("node.js")).toBeNull();
    expect(detectPreviewableFilePath("vue.js")).toBeNull();
    expect(detectPreviewableFilePath("next.js")).toBeNull();
  });

  it("rejects bare filename with unsupported extension", () => {
    expect(detectPreviewableFilePath("data.xyz")).toBeNull();
    expect(detectPreviewableFilePath("file.abc")).toBeNull();
  });

  it("rejects bare filename with single-char extension", () => {
    expect(detectPreviewableFilePath("file.a")).toBeNull();
  });

  it("rejects bare filename starting with dot", () => {
    expect(detectPreviewableFilePath(".gitignore")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectPreviewableFilePath("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(detectPreviewableFilePath("   ")).toBeNull();
  });

  it("detects file paths with Chinese characters", () => {
    expect(
      detectPreviewableFilePath("/Users/lizc/Downloads/shihui/李继刚研究文档.docx"),
    ).toBe("/Users/lizc/Downloads/shihui/李继刚研究文档.docx");
  });

  it("detects bare filename with Chinese characters", () => {
    expect(detectPreviewableFilePath("报告.pdf")).toBe("报告.pdf");
  });

  it("detects path with Chinese directory and filename", () => {
    expect(detectPreviewableFilePath("文档/报告.docx")).toBe("文档/报告.docx");
  });

  it("returns an image file path", () => {
    // .png -> getPreviewKind returns 'image', which is supported
    expect(detectPreviewableFilePath("assets/images/logo.png")).toBe("assets/images/logo.png");
  });

  it("returns a markdown file path", () => {
    expect(detectPreviewableFilePath("docs/README.md")).toBe("docs/README.md");
  });

  it("returns null for a plain word with no extension or separator", () => {
    expect(detectPreviewableFilePath("justAWord")).toBeNull();
  });
});

