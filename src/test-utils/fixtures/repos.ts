import type { Prompt, Workspace, McpServer } from "@/db/types";

const DEFAULT_TIMESTAMP = "2025-01-01T00:00:00Z";

export function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: "prompt-1",
    name: "Test Prompt",
    content: "You are a helpful assistant.",
    builtin: 0,
    sort_order: 0,
    created_at: DEFAULT_TIMESTAMP,
    updated_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "ws-1",
    name: "Test Workspace",
    path: "/Users/test/project",
    is_default: 0,
    created_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

export function makeMcpServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "mcp-1",
    name: "Test MCP Server",
    type: "stdio",
    command: "node",
    args: '["server.js"]',
    env: undefined,
    url: undefined,
    auto_run: 0,
    long_running: 0,
    enabled: 1,
    created_at: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}
