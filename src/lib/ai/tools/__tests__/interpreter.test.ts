// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { setupTauriMocks } from "@/test-utils";

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

import { interpreterTool } from "../interpreter";

type ExecInput = Parameters<NonNullable<typeof interpreterTool.execute>>[0];
type ExecOptions = Parameters<NonNullable<typeof interpreterTool.execute>>[1];

async function exec(input: ExecInput) {
  return interpreterTool.execute!(input, {} as ExecOptions);
}

const luaResult = (result: string, output = "") => ({
  output,
  result,
  error: null,
  executionMs: 5,
});

beforeEach(() => {
  vi.clearAllMocks();
  withWorkspace("/workspace");
});

describe("interpreterTool", () => {
  it("requires workspace", async () => {
    withNoWorkspace();
    const result = await exec({ code: "return 1" });
    expect(result).toContain("workspace");
  });

  it("requires code or file", async () => {
    const result = await exec({});
    expect(result).toContain("Either");
  });

  it("rejects both code and file", async () => {
    const result = await exec({ code: "return 1", file: "test.lua" });
    expect(result).toContain("mutually exclusive");
  });

  it("invokes run_lua with code", async () => {
    let capturedArgs: Record<string, unknown> = {};
    setupTauriMocks({
      run_lua: (payload) => {
        capturedArgs = (payload as { args: Record<string, unknown> }).args;
        return luaResult("42");
      },
    });
    const result = await exec({ code: "return 42" });
    expect(capturedArgs.workspaceRoot).toBe("/workspace");
    expect(capturedArgs.code).toBe("return 42");
    expect(result).toContain("-> 42");
  });

  it("invokes run_lua with file", async () => {
    let capturedArgs: Record<string, unknown> = {};
    setupTauriMocks({
      run_lua: (payload) => {
        capturedArgs = (payload as { args: Record<string, unknown> }).args;
        return luaResult("50");
      },
    });
    const result = await exec({ file: "test.lua" });
    expect(capturedArgs.file).toBe("test.lua");
    expect(capturedArgs.code).toBeNull();
    expect(result).toContain("-> 50");
  });

  it("formats output with print and result", async () => {
    setupTauriMocks({
      run_lua: () => ({ output: "hello", result: "42", error: null, executionMs: 10 }),
    });
    const result = await exec({ code: "print('hello'); return 42" });
    expect(result).toContain("hello");
    expect(result).toContain("-> 42");
    expect(result).toContain("(10ms)");
  });

  it("shows error in output", async () => {
    setupTauriMocks({
      run_lua: () => ({ output: "", result: "", error: "attempt to index nil", executionMs: 5 }),
    });
    const result = await exec({ code: "x.y" });
    expect(result).toContain("[error]");
    expect(result).toContain("attempt to index nil");
  });

  it("omits nil result", async () => {
    setupTauriMocks({
      run_lua: () => luaResult("nil", "printed"),
    });
    const result = await exec({ code: "print('printed')" });
    expect(result).not.toContain("-> nil");
    expect(result).toContain("printed");
  });

  it("handles invoke error", async () => {
    setupTauriMocks({
      run_lua: () => { throw new Error("backend crash"); },
    });
    const result = await exec({ code: "return 1" });
    expect(result).toContain("Execution failed");
    expect(result).toContain("backend crash");
  });
});
