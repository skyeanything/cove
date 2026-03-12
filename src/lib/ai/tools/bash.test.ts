// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";

// ── Store mocks ───────────────────────────────────────────────────────────────

vi.mock("@/stores/workspaceStore", () => ({
  useWorkspaceStore: {
    getState: vi.fn(),
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
import { usePermissionStore } from "@/stores/permissionStore";

const mockWorkspace = vi.mocked(useWorkspaceStore.getState);
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
import { createBashTool, cancelAllActiveCommands, cancelCommandsForConversation } from "./bash";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONV_ID = "conv-1";

function createTool(conversationId = CONV_ID) {
  return createBashTool(conversationId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExecOptions = Parameters<NonNullable<ReturnType<typeof createBashTool>["execute"]>>[1];

async function exec(command: string, opts: { timeout?: number } = {}, conversationId = CONV_ID) {
  const tool = createTool(conversationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool.execute!({ command, ...opts } as any, {} as ExecOptions);
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

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  withWorkspace();
  withPermission(true);
});

describe("createBashTool – no active workspace", () => {
  it("returns Chinese prompt when workspace is null", async () => {
    withNoWorkspace();
    const result = await exec("ls");
    expect(result).toContain("请先");
    expect(result).toContain("工作区");
  });
});

describe("createBashTool – BLOCK commands", () => {
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

describe("createBashTool – SAFE commands (no permission prompt)", () => {
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

describe("createBashTool – CONFIRM commands (permission prompt)", () => {
  it("calls permission ask with bound conversationId and executes when allowed", async () => {
    const mockAsk = vi.fn().mockResolvedValue(true);
    mockPermission.mockReturnValue({ ask: mockAsk } as unknown as ReturnType<typeof mockPermission>);

    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "curl response" }),
    });

    const result = await exec("curl https://example.com");
    expect(mockAsk).toHaveBeenCalledWith("conv-1", "bash", "curl https://example.com", expect.any(Object));
    expect(result).toContain("curl response");
  });

  it("uses the conversationId from factory, not from a global store", async () => {
    const mockAsk = vi.fn().mockResolvedValue(true);
    mockPermission.mockReturnValue({ ask: mockAsk } as unknown as ReturnType<typeof mockPermission>);

    setupTauriMocks({
      run_command: () => defaultRunResult({ stdout: "ok" }),
    });

    await exec("curl https://example.com", {}, "conv-other");
    expect(mockAsk).toHaveBeenCalledWith("conv-other", "bash", "curl https://example.com", expect.any(Object));
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

describe("createBashTool – output formatting", () => {
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
    expect(result).toContain("exit code: 0");
    expect(result).toContain("clean output");
  });
});

describe("createBashTool – output truncation", () => {
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

describe("createBashTool – timeout clamping", () => {
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

describe("createBashTool – invoke error handling", () => {
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

describe("createBashTool – cancel support", () => {
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

  it("cancelAllActiveCommands invokes cancel_command for active tokens", async () => {
    let cancelledToken: string | undefined;
    let runResolve: ((v: unknown) => void) | undefined;

    setupTauriMocks({
      run_command: () => new Promise((resolve) => { runResolve = resolve; }),
      cancel_command: (payload) => {
        cancelledToken = (payload as { token: string }).token;
        return true;
      },
    });

    const execPromise = exec("ls");
    await new Promise((r) => setTimeout(r, 0));
    cancelAllActiveCommands();
    expect(cancelledToken).toBeDefined();
    runResolve!(defaultRunResult({ cancelled: true }));
    const result = await execPromise;
    expect(result).toBe("[命令已被取消]");
  });

  it("cancelCommandsForConversation only cancels commands for that conversation", async () => {
    const cancelledTokens: string[] = [];
    let runResolveA: ((v: unknown) => void) | undefined;
    let runResolveB: ((v: unknown) => void) | undefined;
    let callCount = 0;

    setupTauriMocks({
      run_command: () => new Promise((resolve) => {
        callCount++;
        if (callCount === 1) runResolveA = resolve;
        else runResolveB = resolve;
      }),
      cancel_command: (payload) => {
        cancelledTokens.push((payload as { token: string }).token);
        return true;
      },
    });

    const execA = exec("ls", {}, "conv-A");
    const execB = exec("ls", {}, "conv-B");
    await new Promise((r) => setTimeout(r, 0));

    // Cancel only conv-A
    cancelCommandsForConversation("conv-A");
    // Only one cancel should have been issued
    expect(cancelledTokens).toHaveLength(1);

    runResolveA!(defaultRunResult({ cancelled: true }));
    runResolveB!(defaultRunResult());
    await execA;
    await execB;
  });

  it("cleans up token from active set after execution", async () => {
    setupTauriMocks({
      run_command: () => defaultRunResult(),
      cancel_command: () => true,
    });

    await exec("ls");
    let cancelCalled = false;
    setupTauriMocks({
      cancel_command: () => { cancelCalled = true; return true; },
    });
    cancelAllActiveCommands();
    expect(cancelCalled).toBe(false);
  });
});
