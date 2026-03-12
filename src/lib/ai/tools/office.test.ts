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

const jsResult = (output: string) => ({
  output, result: "", error: null, executionMs: 5,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  withWorkspace("/workspace");
});

// ── detect ────────────────────────────────────────────────────────────────────

describe("officeTool – detect", () => {
  it("returns version and path when available", async () => {
    setupTauriMocks({
      officellm_detect: () => ({
        available: true, version: "2.1.0", path: "/usr/bin/officellm", bundled: false,
      }),
    });
    const result = await exec({ command: "detect" });
    expect(result).toContain("available");
    expect(result).toContain("2.1.0");
    expect(result).toContain("/usr/bin/officellm");
    expect(result).toContain("bundled=false");
  });

  it("returns not-installed message when unavailable", async () => {
    setupTauriMocks({
      officellm_detect: () => ({
        available: false, version: null, path: null, bundled: false,
      }),
    });
    const result = await exec({ command: "detect" });
    expect(result).toContain("not installed");
  });

  it("handles detect invoke error", async () => {
    setupTauriMocks({
      officellm_detect: () => { throw new Error("IPC error"); },
    });
    const result = await exec({ command: "detect" });
    expect(result).toContain("detect failed");
    expect(result).toContain("IPC error");
  });

  it("does not require workspace for detect", async () => {
    withNoWorkspace();
    setupTauriMocks({
      officellm_detect: () => ({
        available: true, version: "1.0", path: "/bin/officellm", bundled: true,
      }),
    });
    const result = await exec({ command: "detect" });
    expect(result).toContain("available");
  });
});

// ── doctor ────────────────────────────────────────────────────────────────────

describe("officeTool – doctor", () => {
  it("returns JSON data on success", async () => {
    const data = {
      visual_pipeline_ready: true,
      dependencies: [
        { name: "libreoffice", available: true, required: true },
      ],
    };
    setupTauriMocks({
      officellm_doctor: () => ({ status: "success", data, error: null, metrics: null }),
    });
    const result = await exec({ command: "doctor" });
    expect(result).toBe(JSON.stringify(data));
  });

  it("returns error when doctor status is error", async () => {
    setupTauriMocks({
      officellm_doctor: () => ({
        status: "error", data: null, error: "binary not found", metrics: null,
      }),
    });
    const result = await exec({ command: "doctor" });
    expect(result).toContain("Error");
    expect(result).toContain("binary not found");
  });

  it("returns 'unknown' when error field is null", async () => {
    setupTauriMocks({
      officellm_doctor: () => ({
        status: "error", data: null, error: null, metrics: null,
      }),
    });
    const result = await exec({ command: "doctor" });
    expect(result).toContain("Error");
    expect(result).toContain("unknown");
  });

  it("handles doctor invoke error", async () => {
    setupTauriMocks({
      officellm_doctor: () => { throw new Error("timeout"); },
    });
    const result = await exec({ command: "doctor" });
    expect(result).toContain("doctor failed");
    expect(result).toContain("timeout");
  });
});

// ── Lua-routed commands ──────────────────────────────────────────────────────

describe("officeTool – Lua commands", () => {
  it("requires workspace for non-detect/doctor commands", async () => {
    withNoWorkspace();
    const result = await exec({ command: "open", args: { path: "doc.docx" } });
    expect(result).toContain("Error");
    expect(result).toContain("workspace");
  });

  it("generates Lua code and invokes run_lua for open", async () => {
    let capturedArgs: Record<string, unknown> = {};
    setupTauriMocks({
      run_lua: (payload) => {
        capturedArgs = (payload as { args: Record<string, unknown> }).args;
        return jsResult('{"status":"success"}');
      },
    });
    const result = await exec({ command: "open", args: { path: "doc.docx" } });
    expect(capturedArgs.workspaceRoot).toBe("/workspace");
    expect(capturedArgs.code).toContain('workspace.officellm("open"');
    expect(capturedArgs.code).toContain('"path"');
    expect(capturedArgs.code).toContain('"doc.docx"');
    expect(result).toBe("open: success");
  });

  it("returns no-session message for status with null data", async () => {
    setupTauriMocks({
      run_lua: () => jsResult('{"status":"success","data":null}'),
    });
    const result = await exec({ command: "status" });
    expect(result).toBe("No active document session.");
  });

  it("returns session info for status with data", async () => {
    setupTauriMocks({
      run_lua: () => jsResult('{"status":"success","data":{"path":"doc.docx","modified":false}}'),
    });
    const result = await exec({ command: "status" });
    expect(result).toBe('{"path":"doc.docx","modified":false}');
  });

  it("formats save result with file path for UI extraction", async () => {
    setupTauriMocks({
      run_lua: () => jsResult('{"status":"success","data":"/workspace/report.docx"}'),
    });
    const result = await exec({ command: "save" });
    expect(result).toBe("Document saved to: /workspace/report.docx");
  });

  it("passes args correctly for command calls", async () => {
    let capturedCode = "";
    setupTauriMocks({
      run_lua: (payload) => {
        capturedCode = ((payload as { args: { code: string } }).args).code;
        return jsResult('{"status":"success","data":{"modified":true}}');
      },
    });
    const result = await exec({
      command: "replace-text", args: { find: "old", replace: "new" },
    });
    expect(capturedCode).toContain('"replace-text"');
    expect(capturedCode).toContain('"find"');
    expect(capturedCode).toContain('"old"');
    expect(capturedCode).toContain('"replace"');
    expect(capturedCode).toContain('"new"');
    expect(result).toBe('{"modified":true}');
  });

  it("returns formatted data from successful command", async () => {
    setupTauriMocks({
      run_lua: () => jsResult('{"status":"success","data":{"slides":5}}'),
    });
    const result = await exec({ command: "get-info" });
    expect(result).toBe('{"slides":5}');
  });

  it("returns string data directly", async () => {
    setupTauriMocks({
      run_lua: () => jsResult('{"status":"success","data":"extracted text content"}'),
    });
    const result = await exec({ command: "extract-text", args: { i: "doc.docx" } });
    expect(result).toBe("extracted text content");
  });

  it("returns error from officellm", async () => {
    setupTauriMocks({
      run_lua: () => jsResult('{"status":"error","error":"no active session"}'),
    });
    const result = await exec({ command: "save" });
    expect(result).toContain("Error");
    expect(result).toContain("no active session");
  });

  it("returns JS execution error", async () => {
    setupTauriMocks({
      run_lua: () => ({
        output: "", result: "", error: "officellm not installed", executionMs: 5,
      }),
    });
    const result = await exec({ command: "open", args: { path: "doc.docx" } });
    expect(result).toContain("Error");
    expect(result).toContain("officellm not installed");
  });

  it("handles Lua invoke error", async () => {
    setupTauriMocks({
      run_lua: () => { throw new Error("backend unreachable"); },
    });
    const result = await exec({ command: "open", args: { path: "doc.docx" } });
    expect(result).toContain("office error");
    expect(result).toContain("backend unreachable");
  });

  it("uses empty args when none provided", async () => {
    let capturedCode = "";
    setupTauriMocks({
      run_lua: (payload) => {
        capturedCode = ((payload as { args: { code: string } }).args).code;
        return jsResult('{"status":"success"}');
      },
    });
    await exec({ command: "close" });
    expect(capturedCode).toContain("{}");
  });

  it("sets 30s timeout for run_lua invocation", async () => {
    let capturedTimeout: unknown;
    setupTauriMocks({
      run_lua: (payload) => {
        capturedTimeout = ((payload as { args: { timeoutMs: number } }).args).timeoutMs;
        return jsResult('{"status":"success"}');
      },
    });
    await exec({ command: "status" });
    expect(capturedTimeout).toBe(30_000);
  });

  it("handles non-JSON output gracefully", async () => {
    setupTauriMocks({
      run_lua: () => jsResult("plain text output"),
    });
    const result = await exec({ command: "some-cmd" });
    expect(result).toBe("plain text output");
  });

  it("returns fallback when output is empty", async () => {
    setupTauriMocks({
      run_lua: () => jsResult(""),
    });
    const result = await exec({ command: "some-cmd" });
    expect(result).toBe("some-cmd: done");
  });
});
