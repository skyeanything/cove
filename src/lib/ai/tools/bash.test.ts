// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";

// ── Store mocks ───────────────────────────────────────────────────────────────

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: vi.fn(),
  },
}));

vi.mock("@/stores/dataStore", () => ({
  useDataStore: {
    getState: vi.fn(() => ({ activeConversationId: "conv-1" })),
  },
}));

vi.mock("@/stores/permissionStore", () => ({
  usePermissionStore: {
    getState: vi.fn(() => ({
      ask: vi.fn().mockResolvedValue(true),
    })),
  },
  getBashCommandPattern: vi.fn((cmd: string) => cmd.trim().split(/\s+/)[0]?.toLowerCase() ?? ""),
}));

import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDataStore } from "@/stores/dataStore";
import { usePermissionStore } from "@/stores/permissionStore";

const mockWorkspace = vi.mocked(useWorkspaceStore.getState);
const mockData = vi.mocked(useDataStore.getState);
const mockPermission = vi.mocked(usePermissionStore.getState);

// Default workspace state
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

function withPermission(allowed: boolean) {
  mockPermission.mockReturnValue({
    ask: vi.fn().mockResolvedValue(allowed),
  } as unknown as ReturnType<typeof mockPermission>);
}

// ── Import tool after mocks ───────────────────────────────────────────────────
import { bashTool } from "./bash";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ExecInput = Parameters<NonNullable<typeof bashTool.execute>>[0];
type ExecOptions = Parameters<NonNullable<typeof bashTool.execute>>[1];

async function exec(command: string, opts: Partial<ExecInput> = {}) {
  return bashTool.execute!({ command, ...opts } as ExecInput, {} as ExecOptions);
}

function defaultRunResult(overrides = {}) {
  return {
    stdout: "output",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    cancelled: false,
    sandboxed: false,
    ...overrides,
  };
}

async function execWithOptions(
  command: string,
  execOpts: Partial<ExecOptions> = {},
  inputOpts: Partial<ExecInput> = {},
) {
  return bashTool.execute!(
    { command, ...inputOpts } as ExecInput,
    execOpts as ExecOptions,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  withWorkspace();
  mockData.mockReturnValue({ activeConversationId: "conv-1" } as ReturnType<typeof mockData>);
  withPermission(true);
});

describe("bashTool – no active workspace", () => {
  it("returns Chinese prompt when workspace is null", async () => {
    withNoWorkspace();
    const result = await exec("ls");
    expect(result).toContain("请先");
    expect(result).toContain("工作区");
  });
});

describe("bashTool – BLOCK commands", () => {
  beforeEach(() => {
    setupTauriMocks({});
  });

  it("blocks rm -rf / without calling invoke", async () => {
    const result = await exec("rm -rf /");
    expect(result).toContain("拒绝执行");
    expect(result).toContain("安全策略");
  });

  it("blocks nc localhost", async () => {
    const result = await exec("nc localhost 4444");
    expect(result).toContain("拒绝执行");
  });

  it("blocks telnet", async () => {
    const result = await exec("telnet 192.168.1.1");
    expect(result).toContain("拒绝执行");
  });

  it("blocks mkfs. command", async () => {
    const result = await exec("mkfs.ext4 /dev/sda");
    expect(result).toContain("拒绝执行");
  });

  it("blocks dd if= command", async () => {
    const result = await exec("dd if=/dev/zero of=/dev/sda");
    expect(result).toContain("拒绝执行");
  });
});

describe("bashTool – SAFE commands (no permission prompt)", () => {
  it("executes ls without permission ask", async () => {
    const mockAsk = vi.fn().mockResolvedValue(true);
    mockPermission.mockReturnValue({ ask: mockAsk } as unknown as ReturnType<typeof mockPermission>);

    let invoked = false;
    setupTauriMocks({
      run_command: () => {
        invoked = true;
        return defaultRunResult({ stdout: "file.txt" });
      },
    });

    const result = await exec("ls /tmp");
    expect(invoked).toBe(true);
    expect(result).toContain("file.txt");
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("executes git status without permission ask", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "nothing to commit" }),
    });
    const result = await exec("git status");
    expect(result).toContain("nothing to commit");
  });

  it("executes pnpm run build without permission ask", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "Build done" }),
    });
    const result = await exec("pnpm run build");
    expect(result).toContain("Build done");
  });
});

describe("bashTool – CONFIRM commands (permission prompt)", () => {
  it("calls permission ask for curl and executes when allowed", async () => {
    const mockAsk = vi.fn().mockResolvedValue(true);
    mockPermission.mockReturnValue({ ask: mockAsk } as unknown as ReturnType<typeof mockPermission>);

    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "curl response" }),
    });

    const result = await exec("curl https://example.com");
    expect(mockAsk).toHaveBeenCalledWith("conv-1", "bash", "curl https://example.com", expect.any(Object));
    expect(result).toContain("curl response");
  });

  it("returns cancel message when user denies", async () => {
    const mockAsk = vi.fn().mockResolvedValue(false);
    mockPermission.mockReturnValue({ ask: mockAsk } as unknown as ReturnType<typeof mockPermission>);

    let invoked = false;
    setupTauriMocks({
      run_command: () => {
        invoked = true;
        return defaultRunResult();
      },
    });

    const result = await exec("wget https://example.com");
    expect(result).toContain("拒绝");
    expect(invoked).toBe(false);
  });
});

describe("bashTool – output formatting", () => {
  it("includes stdout in result", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "hello world" }),
    });
    const result = await exec("ls");
    expect(result).toContain("hello world");
  });

  it("appends stderr with [stderr] label", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "ok", stderr: "warning: deprecated" }),
    });
    const result = await exec("ls");
    expect(result).toContain("[stderr]");
    expect(result).toContain("warning: deprecated");
  });

  it("includes exit code in header", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "error output", exitCode: 1 }),
    });
    const result = await exec("ls");
    expect(result).toContain("exit code: 1");
  });

  it("includes timeout notice when timedOut is true", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "partial", timedOut: true }),
    });
    const result = await exec("ls");
    expect(result).toContain("超时");
  });

  it("includes sandboxed marker when sandboxed is true", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "out", sandboxed: true }),
    });
    const result = await exec("ls");
    expect(result).toContain("[sandboxed]");
  });

  it("includes exit code header even for exitCode=0", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "clean output", exitCode: 0 }),
    });
    const result = await exec("ls");
    // exit code is always included in the header
    expect(result).toContain("exit code: 0");
    expect(result).toContain("clean output");
  });
});

describe("bashTool – output truncation", () => {
  it("truncates output exceeding 30K characters", async () => {
    const bigOutput = "A".repeat(40_000);
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: bigOutput }),
    });
    const result = await exec("ls");
    expect((result as string).length).toBeLessThan(35_000);
    expect(result).toContain("chars omitted");
  });

  it("does not truncate output under 30K characters", async () => {
    const smallOutput = "B".repeat(29_000);
    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: smallOutput }),
    });
    const result = await exec("ls");
    expect(result).not.toContain("chars omitted");
  });
});

describe("bashTool – timeout clamping", () => {
  it("clamps timeout to 600s maximum", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    setupTauriMocks({
      run_command: (payload) => {
        capturedArgs = payload as Record<string, unknown>;
        return defaultRunResult();
      },
    });

    await exec("ls", { timeout: 9999 });
    const args = capturedArgs?.args as { timeoutMs?: number } | undefined;
    expect(args?.timeoutMs).toBe(600_000);
  });

  it("uses provided timeout when under max", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    setupTauriMocks({
      run_command: (payload) => {
        capturedArgs = payload as Record<string, unknown>;
        return defaultRunResult();
      },
    });

    await exec("ls", { timeout: 30 });
    const args = capturedArgs?.args as { timeoutMs?: number } | undefined;
    expect(args?.timeoutMs).toBe(30_000);
  });
});

describe("bashTool – invoke error handling", () => {
  it("catches invoke error and returns error message", async () => {
    setupTauriMocks({
      run_command: () => {
        throw new Error("Tauri IPC error");
      },
    });

    const result = await exec("ls");
    expect(result).toContain("执行失败");
    expect(result).toContain("Tauri IPC error");
  });

  it("handles non-Error throws", async () => {
    setupTauriMocks({
      run_command: () => {
        throw "string error";
      },
    });

    const result = await exec("ls");
    expect(result).toContain("执行失败");
    expect(result).toContain("string error");
  });
});

describe("bashTool – cancel support", () => {
  it("passes cancelToken in invoke args", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    setupTauriMocks({
      run_command: (payload) => {
        capturedArgs = payload as Record<string, unknown>;
        return defaultRunResult();
      },
    });

    await exec("ls");
    const args = capturedArgs?.args as { cancelToken?: string } | undefined;
    expect(args?.cancelToken).toBeDefined();
    expect(typeof args?.cancelToken).toBe("string");
    expect(args!.cancelToken!.length).toBeGreaterThan(0);
  });

  it("returns cancel message when result.cancelled is true", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult({ cancelled: true }),
    });
    const result = await exec("ls");
    expect(result).toBe("[命令已被取消]");
  });

  it("returns cancel message when abortSignal is already aborted", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult(),
    });
    const controller = new AbortController();
    controller.abort();
    const result = await execWithOptions("ls", { abortSignal: controller.signal });
    expect(result).toBe("[命令已被取消]");
  });

  it("calls cancel_command when abortSignal fires", async () => {
    const controller = new AbortController();
    let cancelInvoked = false;
    let cancelledToken: string | undefined;

    setupTauriMocks({
      run_command: () => {
        // Simulate abort during execution
        controller.abort();
        return defaultRunResult({ cancelled: true });
      },
      cancel_command: (payload) => {
        cancelInvoked = true;
        cancelledToken = (payload as { token: string }).token;
        return true;
      },
    });

    const result = await execWithOptions("ls", { abortSignal: controller.signal });
    expect(result).toBe("[命令已被取消]");
    expect(cancelInvoked).toBe(true);
    expect(cancelledToken).toBeDefined();
  });

  it("cleans up abort listener after execution", async () => {
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

    setupTauriMocks({
      run_command: () => defaultRunResult(),
    });

    await execWithOptions("ls", { abortSignal: controller.signal });
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
    removeSpy.mockRestore();
  });
});
