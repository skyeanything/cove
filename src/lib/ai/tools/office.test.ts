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

  it("returns error message when doctor status is error", async () => {
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
});

// ── call ──────────────────────────────────────────────────────────────────────

describe("officeTool – call", () => {
  it("returns error when command is not provided", async () => {
    setupTauriMocks({ officellm_call: () => ({ status: "success", data: null, error: null, metrics: null }) });
    const result = await exec({ action: "call" });
    expect(result).toContain("Error");
    expect(result).toContain("command");
  });

  it("returns error message when status is error", async () => {
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

  it("passes args to invoke", async () => {
    let capturedArgs: unknown;
    setupTauriMocks({
      officellm_call: (payload) => {
        capturedArgs = (payload as { args?: unknown })?.args;
        return { status: "success", data: "ok", error: null, metrics: null };
      },
    });

    await exec({ action: "call", command: "addSlide", args: ["--position", "2"] });
    expect(capturedArgs).toEqual(["--position", "2"]);
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
  it("catches Error thrown by invoke and returns error message", async () => {
    setupTauriMocks({
      officellm_detect: () => {
        throw new Error("IPC channel closed");
      },
    });

    const result = await exec({ action: "detect" });
    expect(result).toContain("Office tool error");
    expect(result).toContain("IPC channel closed");
  });

  it("handles non-Error thrown values", async () => {
    setupTauriMocks({
      officellm_close: () => {
        throw "unexpected failure";
      },
    });

    const result = await exec({ action: "close" });
    expect(result).toContain("Office tool error");
    expect(result).toContain("unexpected failure");
  });
});
