import { describe, it, expect } from "vitest";
import { getPreviewKind, getPrismLanguage } from "./preview-types";

describe("getPreviewKind", () => {
  // ── CSV ────────────────────────────────────────────────────────────
  describe("csv", () => {
    it("maps .csv to 'csv'", () => {
      expect(getPreviewKind("data.csv")).toBe("csv");
    });

    it("maps .csv with directory prefix", () => {
      expect(getPreviewKind("src/data/report.csv")).toBe("csv");
    });
  });

  // ── HTML ───────────────────────────────────────────────────────────
  describe("html", () => {
    it("maps .html to 'html'", () => {
      expect(getPreviewKind("index.html")).toBe("html");
    });

    it("maps .htm to 'html'", () => {
      expect(getPreviewKind("page.htm")).toBe("html");
    });

    it("maps .HTML (uppercase) to 'html'", () => {
      expect(getPreviewKind("INDEX.HTML")).toBe("html");
    });

    it("maps .HTM (uppercase) to 'html'", () => {
      expect(getPreviewKind("page.HTM")).toBe("html");
    });
  });

  // ── PDF ────────────────────────────────────────────────────────────
  describe("pdf", () => {
    it("maps .pdf to 'pdf'", () => {
      expect(getPreviewKind("document.pdf")).toBe("pdf");
    });

    it("maps .PDF (uppercase) to 'pdf'", () => {
      expect(getPreviewKind("DOC.PDF")).toBe("pdf");
    });
  });

  // ── Image ──────────────────────────────────────────────────────────
  describe("image", () => {
    it("maps .png to 'image'", () => {
      expect(getPreviewKind("photo.png")).toBe("image");
    });

    it("maps .jpg to 'image'", () => {
      expect(getPreviewKind("shot.jpg")).toBe("image");
    });

    it("maps .gif to 'image'", () => {
      expect(getPreviewKind("anim.gif")).toBe("image");
    });

    it("maps .webp to 'image'", () => {
      expect(getPreviewKind("hero.webp")).toBe("image");
    });

    it("maps .svg to 'image'", () => {
      expect(getPreviewKind("icon.svg")).toBe("image");
    });

    it("maps .jpeg to 'image'", () => {
      expect(getPreviewKind("img.jpeg")).toBe("image");
    });

    it("maps .ico to 'image'", () => {
      expect(getPreviewKind("favicon.ico")).toBe("image");
    });

    it("maps .bmp to 'image'", () => {
      expect(getPreviewKind("bitmap.bmp")).toBe("image");
    });
  });

  // ── Office ─────────────────────────────────────────────────────────
  describe("office", () => {
    it("maps .docx to 'office'", () => {
      expect(getPreviewKind("report.docx")).toBe("office");
    });

    it("maps .xlsx to 'office'", () => {
      expect(getPreviewKind("sheet.xlsx")).toBe("office");
    });

    it("maps .pptx to 'office'", () => {
      expect(getPreviewKind("slides.pptx")).toBe("office");
    });
  });

  // ── Code ───────────────────────────────────────────────────────────
  describe("code", () => {
    it("maps .js to 'code'", () => {
      expect(getPreviewKind("app.js")).toBe("code");
    });

    it("maps .ts to 'code'", () => {
      expect(getPreviewKind("types.ts")).toBe("code");
    });

    it("maps .tsx to 'code'", () => {
      expect(getPreviewKind("Component.tsx")).toBe("code");
    });

    it("maps .py to 'code'", () => {
      expect(getPreviewKind("script.py")).toBe("code");
    });

    it("maps .rs to 'code'", () => {
      expect(getPreviewKind("main.rs")).toBe("code");
    });

    it("maps .go to 'code'", () => {
      expect(getPreviewKind("server.go")).toBe("code");
    });

    it("maps .css to 'code'", () => {
      expect(getPreviewKind("styles.css")).toBe("code");
    });

    it("maps .json to 'code'", () => {
      expect(getPreviewKind("config.json")).toBe("code");
    });

    it("maps .yaml to 'code'", () => {
      expect(getPreviewKind("config.yaml")).toBe("code");
    });

    it("maps .sql to 'code'", () => {
      expect(getPreviewKind("query.sql")).toBe("code");
    });

    it("maps .vue to 'code'", () => {
      expect(getPreviewKind("App.vue")).toBe("code");
    });

    it("maps .lua to 'code'", () => {
      expect(getPreviewKind("script.lua")).toBe("code");
    });
  });

  // ── Plain text ─────────────────────────────────────────────────────
  describe("txt", () => {
    it("maps .txt to 'txt'", () => {
      expect(getPreviewKind("readme.txt")).toBe("txt");
    });

    it("maps .log to 'txt'", () => {
      expect(getPreviewKind("app.log")).toBe("txt");
    });
  });

  // ── Markdown ───────────────────────────────────────────────────────
  describe("md", () => {
    it("maps .md to 'md'", () => {
      expect(getPreviewKind("README.md")).toBe("md");
    });

    it("maps .markdown to 'md'", () => {
      expect(getPreviewKind("notes.markdown")).toBe("md");
    });

    it("maps .qmd to 'md'", () => {
      expect(getPreviewKind("report.qmd")).toBe("md");
    });
  });

  // ── Unsupported ────────────────────────────────────────────────────
  describe("unsupported", () => {
    it("maps .zip to 'unsupported'", () => {
      expect(getPreviewKind("archive.zip")).toBe("unsupported");
    });

    it("maps .mp4 to 'unsupported'", () => {
      expect(getPreviewKind("video.mp4")).toBe("unsupported");
    });

    it("maps .exe to 'unsupported'", () => {
      expect(getPreviewKind("setup.exe")).toBe("unsupported");
    });

    it("maps .tar.gz to 'unsupported'", () => {
      // ext extracted as "gz"
      expect(getPreviewKind("archive.tar.gz")).toBe("unsupported");
    });
  });

  // ── Dotfiles ───────────────────────────────────────────────────────
  describe("dotfiles", () => {
    it("maps .gitignore (dotfile) to 'txt'", () => {
      expect(getPreviewKind(".gitignore")).toBe("txt");
    });

    it("maps .env (dotfile) to 'txt'", () => {
      expect(getPreviewKind(".env")).toBe("txt");
    });

    it("maps dotfile in directory to 'txt'", () => {
      expect(getPreviewKind("project/.editorconfig")).toBe("txt");
    });
  });

  // ── No extension ───────────────────────────────────────────────────
  // Files with no dot in the basename (e.g. Makefile, Dockerfile) have the
  // regex /^.*\./ fail to strip anything, so ext equals the full basename.
  // Since that string matches no known extension set, the function returns
  // "unsupported" (not "txt") for extension-less filenames.
  describe("no extension", () => {
    it("maps file with no extension to 'unsupported'", () => {
      expect(getPreviewKind("Makefile")).toBe("unsupported");
    });

    it("maps bare filename in directory to 'unsupported'", () => {
      expect(getPreviewKind("src/Dockerfile")).toBe("unsupported");
    });
  });

  // ── html/htm NOT in code ───────────────────────────────────────────
  describe("html is not code", () => {
    it(".html returns 'html' not 'code'", () => {
      expect(getPreviewKind("page.html")).not.toBe("code");
    });

    it(".htm returns 'html' not 'code'", () => {
      expect(getPreviewKind("page.htm")).not.toBe("code");
    });
  });

  // ── txt/log are not csv ────────────────────────────────────────────
  describe("txt files are not csv", () => {
    it(".txt returns 'txt' not 'csv'", () => {
      expect(getPreviewKind("notes.txt")).not.toBe("csv");
    });

    it(".log returns 'txt' not 'csv'", () => {
      expect(getPreviewKind("app.log")).not.toBe("csv");
    });
  });
});

// ── getPrismLanguage ───────────────────────────────────────────────────
describe("getPrismLanguage", () => {
  it("returns 'markup' for .html", () => {
    expect(getPrismLanguage("index.html")).toBe("markup");
  });

  it("returns 'markup' for .htm", () => {
    expect(getPrismLanguage("page.htm")).toBe("markup");
  });

  it("returns 'typescript' for .ts", () => {
    expect(getPrismLanguage("types.ts")).toBe("typescript");
  });

  it("returns 'javascript' for .js", () => {
    expect(getPrismLanguage("app.js")).toBe("javascript");
  });

  it("returns 'javascript' for .mjs", () => {
    expect(getPrismLanguage("module.mjs")).toBe("javascript");
  });

  it("returns 'python' for .py", () => {
    expect(getPrismLanguage("script.py")).toBe("python");
  });

  it("returns 'bash' for .sh", () => {
    expect(getPrismLanguage("run.sh")).toBe("bash");
  });

  it("returns 'bash' for .zsh", () => {
    expect(getPrismLanguage("run.zsh")).toBe("bash");
  });

  it("returns 'yaml' for .yml", () => {
    expect(getPrismLanguage("config.yml")).toBe("yaml");
  });

  it("returns 'markdown' for .md", () => {
    expect(getPrismLanguage("README.md")).toBe("markdown");
  });

  it("returns 'lua' for .lua", () => {
    expect(getPrismLanguage("script.lua")).toBe("lua");
  });

  it("returns 'plaintext' for unknown extension", () => {
    expect(getPrismLanguage("archive.zip")).toBe("plaintext");
  });

  it("returns 'plaintext' for no extension", () => {
    expect(getPrismLanguage("Makefile")).toBe("plaintext");
  });
});
