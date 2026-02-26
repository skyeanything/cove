import { mockIPC } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";

type CommandHandler = (payload?: InvokeArgs) => unknown;

/**
 * Sets up Tauri IPC mocks that route by command name.
 *
 * Usage:
 * ```ts
 * setupTauriMocks({
 *   read_skill: (payload) => ({ name: "test" }),
 *   write_skill: () => true,
 * });
 * ```
 */
export function setupTauriMocks(
  commands: Record<string, CommandHandler>,
): void {
  mockIPC((cmd: string, payload?: InvokeArgs) => {
    const handler = commands[cmd];
    if (handler) {
      return handler(payload);
    }
    return undefined;
  });
}
