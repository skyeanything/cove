// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";

// ── Store mocks ───────────────────────────────────────────────────────────────

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: vi.fn(),
  },
}));

import { useWorkspaceStore } from "@/stores/workspaceStore";

const mockWorkspace = vi.mocked(useWorkspaceStore.getState);

function withWorkspace(path = "/workspace") {
  mockWorkspace.mockReturnValue({
    activeWorkspace: { id: "ws-1", path, name: "ws", is_default: 1, created_at: "" },
  } as ReturnType<typeof mockWorkspace>);
}

function withNoWorkspace() {
  mockWorkspace.mockReturnValue({
    activeWorkspace: null,
  } as ReturnType<typeof mockWorkspace>);
}

// ── Import tool after mocks ───────────────────────────────────────────────────
import { officeTool } from "./office";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ExecInput = Parameters<NonNullable<typeof officeTool.execute>>[0];
type ExecOptions = Parameters<NonNullable<typeof officeTool.execute>>[1];

async function exec(input: ExecInput) {
  return officeTool.execute!(input, {} as ExecOptions);
}

const OK_RESULT = { status: "success", data: "ok", error: null, metrics: null };

/** Setup mock that captures a specific field from the invoke payload. */
function captureCallField<T>(field: string): { get: () => T } {
  let value: T;
  setupTauriMocks({
    officellm_call: (payload) => {
      value = (payload as Record<string, T>)?.[field];
      return OK_RESULT;
    },
  });
  return { get: () => value };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  withWorkspace("/workspace");
});

// ── detect ────────────────────────────────────────────────────────────────────

describe("officeTool – detect", () => {
  it("returns version and path when office tool is available", async () => {
    setupTauriMocks({
      officellm_detect: () => ({ available: true, version: "2.1.0", path: "/usr/bin/officellm", bundled: false }),
    });

    const result = await exec({ action: "detect" });
    expect(result).toContain("available");
    expect(result).toContain("2.1.0");
    expect(result).toContain("/usr/bin/officellm");
    expect(result).toContain("bundled=false");
  });

  it("returns not-installed message when available is false", async () => {
    setupTauriMocks({
      officellm_detect: () => ({ available: false, version: null, path: null, bundled: false }),
    });

    const result = await exec({ action: "detect" });
    expect(result).toContain("not installed");
  });
});

// ── doctor ────────────────────────────────────────────────────────────────────

describe("officeTool – doctor", () => {
  it("returns JSON stringified data on success", async () => {
    const data = {
      visual_pipeline_ready: true,
      dependencies: [
        { name: "libreoffice", available: true, required: true, path: "/usr/bin/libreoffice" },
        { name: "pdftoppm", available: true, required: true, path: "/usr/bin/pdftoppm" },
        { name: "quarto", available: false, required: false },
      ],
    };
    setupTauriMocks({
      officellm_doctor: () => ({ status: "success", data, error: null, metrics: null }),
    });

    const result = await exec({ action: "doctor" });
    expect(result).toBe(JSON.stringify(data));
  });

  it("returns enhanced error message when doctor status is error", async () => {
    setupTauriMocks({
      officellm_doctor: () => ({
        status: "error",
        data: null,
        error: "officellm binary not found",
        metrics: null,
      }),
    });

    const result = await exec({ action: "doctor" });
    expect(result).toContain("Error running doctor");
    expect(result).toContain("officellm binary not found");
    expect(result).toContain("[Hint]");
  });

  it("returns 'unknown' when error field is null", async () => {
    setupTauriMocks({
      officellm_doctor: () => ({
        status: "error",
        data: null,
        error: null,
        metrics: null,
      }),
    });

    const result = await exec({ action: "doctor" });
    expect(result).toContain("Error running doctor");
    expect(result).toContain("unknown");
  });
});

// ── open ──────────────────────────────────────────────────────────────────────

describe("officeTool – open", () => {
  it("returns error when path is not provided", async () => {
    setupTauriMocks({ officellm_open: () => undefined });
    const result = await exec({ action: "open" });
    expect(result).toContain("Error");
    expect(result).toContain("path");
  });

  it("prepends workspace root for relative paths", async () => {
    let capturedPath: string | undefined;
    setupTauriMocks({
      officellm_open: (payload) => {
        capturedPath = (payload as { path?: string })?.path;
        return undefined;
      },
    });

    const result = await exec({ action: "open", path: "docs/report.docx" });
    expect(capturedPath).toBe("/workspace/docs/report.docx");
    expect(result).toContain("/workspace/docs/report.docx");
  });

  it("uses absolute path as-is without prepending workspace", async () => {
    let capturedPath: string | undefined;
    setupTauriMocks({
      officellm_open: (payload) => {
        capturedPath = (payload as { path?: string })?.path;
        return undefined;
      },
    });

    const result = await exec({ action: "open", path: "/absolute/path/doc.docx" });
    expect(capturedPath).toBe("/absolute/path/doc.docx");
    expect(result).toContain("/absolute/path/doc.docx");
  });

  it("treats Windows drive-letter paths as absolute", async () => {
    let capturedPath: string | undefined;
    setupTauriMocks({
      officellm_open: (payload) => {
        capturedPath = (payload as { path?: string })?.path;
        return undefined;
      },
    });

    await exec({ action: "open", path: "C:\\docs\\report.docx" });
    expect(capturedPath).toBe("C:\\docs\\report.docx");
  });

  it("treats UNC paths as absolute", async () => {
    let capturedPath: string | undefined;
    setupTauriMocks({
      officellm_open: (payload) => {
        capturedPath = (payload as { path?: string })?.path;
        return undefined;
      },
    });

    await exec({ action: "open", path: "\\\\server\\share\\doc.docx" });
    expect(capturedPath).toBe("\\\\server\\share\\doc.docx");
  });

  it("uses path as-is when workspace is null and path is relative", async () => {
    withNoWorkspace();
    let capturedPath: string | undefined;
    setupTauriMocks({
      officellm_open: (payload) => {
        capturedPath = (payload as { path?: string })?.path;
        return undefined;
      },
    });

    await exec({ action: "open", path: "relative/doc.docx" });
    expect(capturedPath).toBe("relative/doc.docx");
  });

  it("rejects open when a session is already active", async () => {
    setupTauriMocks({
      officellm_status: () => ({
        documentPath: "/workspace/existing.docx",
        pid: 9999,
        uptimeSecs: 120,
      }),
      officellm_open: () => undefined,
    });

    const result = await exec({ action: "open", path: "new.docx" });
    expect(result).toContain("Error");
    expect(result).toContain("session is already active");
    expect(result).toContain("existing.docx");
    expect(result).toContain("action:'close'");
  });
});

// ── call ──────────────────────────────────────────────────────────────────────

describe("officeTool – call", () => {
  it("returns error when command is not provided", async () => {
    setupTauriMocks({ officellm_call: () => ({ status: "success", data: null, error: null, metrics: null }) });
    const result = await exec({ action: "call" });
    expect(result).toContain("Error");
    expect(result).toContain("command");
  });

  it("returns enhanced error message when status is error", async () => {
    setupTauriMocks({
      officellm_call: () => ({
        status: "error",
        data: null,
        error: "command not recognized",
        metrics: null,
      }),
    });

    const result = await exec({ action: "call", command: "unknownCmd" });
    expect(result).toContain("Error");
    expect(result).toContain("command not recognized");
    expect(result).toContain("[Hint]");
  });

  it("returns JSON stringified data on success", async () => {
    const data = { slides: 5, title: "My Presentation" };
    setupTauriMocks({
      officellm_call: () => ({
        status: "success",
        data,
        error: null,
        metrics: null,
      }),
    });

    const result = await exec({ action: "call", command: "getInfo", args: [] });
    expect(result).toContain(JSON.stringify(data));
  });

  it("passes legacy array args to invoke", async () => {
    const cap = captureCallField<unknown>("args");
    await exec({ action: "call", command: "addSlide", args: ["--position", "2"] });
    expect(cap.get()).toEqual(["--position", "2"]);
  });

  it("converts object args to CLI-style array", async () => {
    const cap = captureCallField<unknown>("args");
    await exec({ action: "call", command: "addSlide", args: { title: "New", position: "2" } });
    expect(cap.get()).toEqual(["--title", "New", "--position", "2"]);
  });

  it("converts single-char keys to short flags and resolves path args", async () => {
    const cap = captureCallField<unknown>("args");
    await exec({ action: "call", command: "extract-text", args: { i: "doc.docx" } });
    expect(cap.get()).toEqual(["-i", "/workspace/doc.docx"]);
  });

  it("resolves relative path args to workspace root", async () => {
    const cap = captureCallField<unknown>("args");
    await exec({ action: "call", command: "convert", args: { input: "report.docx", output: "out.pdf" } });
    expect(cap.get()).toEqual(["--input", "/workspace/report.docx", "--output", "/workspace/out.pdf"]);
  });

  it("does not resolve absolute path args (Unix or Windows)", async () => {
    const cap = captureCallField<unknown>("args");
    await exec({ action: "call", command: "convert", args: { input: "/abs/report.docx" } });
    expect(cap.get()).toEqual(["--input", "/abs/report.docx"]);

    const cap2 = captureCallField<unknown>("args");
    await exec({ action: "call", command: "convert", args: { input: "D:\\files\\report.docx" } });
    expect(cap2.get()).toEqual(["--input", "D:\\files\\report.docx"]);
  });

  it("does not resolve non-path arg keys", async () => {
    const cap = captureCallField<unknown>("args");
    await exec({ action: "call", command: "addSlide", args: { title: "New Slide" } });
    expect(cap.get()).toEqual(["--title", "New Slide"]);
  });

  it("passes workdir to invoke", async () => {
    const cap = captureCallField<unknown>("workdir");
    await exec({ action: "call", command: "test", args: [] });
    expect(cap.get()).toBe("/workspace");
  });

  it("passes '/' as workdir when no workspace", async () => {
    withNoWorkspace();
    const cap = captureCallField<unknown>("workdir");
    await exec({ action: "call", command: "test", args: [] });
    expect(cap.get()).toBe("/");
  });
});

// ── save ──────────────────────────────────────────────────────────────────────

describe("officeTool – save", () => {
  it("returns 'Document saved.' when no path is provided", async () => {
    setupTauriMocks({
      officellm_save: () => ({ status: "success", data: null, error: null, metrics: null }),
    });

    const result = await exec({ action: "save" });
    expect(result).toBe("Document saved.");
  });

  it("returns 'Document saved to: {path}' when path is provided", async () => {
    setupTauriMocks({
      officellm_save: () => ({ status: "success", data: null, error: null, metrics: null }),
    });

    const result = await exec({ action: "save", path: "/output/result.docx" });
    expect(result).toBe("Document saved to: /output/result.docx");
  });

  it("returns error message when save status is error", async () => {
    setupTauriMocks({
      officellm_save: () => ({
        status: "error",
        data: null,
        error: "disk full",
        metrics: null,
      }),
    });

    const result = await exec({ action: "save", path: "/output/fail.docx" });
    expect(result).toContain("Error");
    expect(result).toContain("disk full");
  });

  it("resolves relative save-as path to workspace root", async () => {
    let capturedPath: unknown;
    setupTauriMocks({
      officellm_save: (payload) => {
        capturedPath = (payload as { path?: unknown })?.path;
        return { status: "success", data: null, error: null, metrics: null };
      },
    });
    const result = await exec({ action: "save", path: "output/result.docx" });
    expect(capturedPath).toBe("/workspace/output/result.docx");
    expect(result).toContain("/workspace/output/result.docx");
  });

  it("does not resolve absolute save-as paths (Unix or Windows)", async () => {
    let capturedPath: unknown;
    const saveMock = (payload: unknown) => {
      capturedPath = (payload as { path?: unknown })?.path;
      return { status: "success" as const, data: null, error: null, metrics: null };
    };
    setupTauriMocks({ officellm_save: saveMock });
    await exec({ action: "save", path: "/abs/result.docx" });
    expect(capturedPath).toBe("/abs/result.docx");

    setupTauriMocks({ officellm_save: saveMock });
    await exec({ action: "save", path: "C:\\output\\result.docx" });
    expect(capturedPath).toBe("C:\\output\\result.docx");
  });
});

// ── close ─────────────────────────────────────────────────────────────────────

describe("officeTool – close", () => {
  it("returns 'Session closed.' on success", async () => {
    setupTauriMocks({
      officellm_close: () => undefined,
    });

    const result = await exec({ action: "close" });
    expect(result).toBe("Session closed.");
  });
});

// ── status ────────────────────────────────────────────────────────────────────

describe("officeTool – status", () => {
  it("returns no-session message when invoke returns null", async () => {
    setupTauriMocks({
      officellm_status: () => null,
    });

    const result = await exec({ action: "status" });
    expect(result).toContain("No active office session");
  });

  it("returns session info when active session exists", async () => {
    setupTauriMocks({
      officellm_status: () => ({
        documentPath: "/tmp/report.docx",
        pid: 12345,
        uptimeSecs: 42,
      }),
    });

    const result = await exec({ action: "status" });
    expect(result).toContain("/tmp/report.docx");
    expect(result).toContain("12345");
    expect(result).toContain("42");
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe("officeTool – invoke error handling", () => {
  it("catches Error thrown by invoke and returns enhanced error", async () => {
    setupTauriMocks({
      officellm_detect: () => {
        throw new Error("IPC channel closed");
      },
    });

    const result = await exec({ action: "detect" });
    expect(result).toContain("Office tool error");
    expect(result).toContain("IPC channel closed");
    expect(result).toContain("[Hint]");
  });

  it("handles non-Error thrown values with hint", async () => {
    setupTauriMocks({
      officellm_close: () => {
        throw "unexpected failure";
      },
    });

    const result = await exec({ action: "close" });
    expect(result).toContain("Office tool error");
    expect(result).toContain("unexpected failure");
    expect(result).toContain("[Hint]");
  });
});
