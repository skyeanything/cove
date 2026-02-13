import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Check if a target path is within the given workspace directory.
 */
export function containsPath(
  workspacePath: string,
  target: string,
): boolean {
  const normalized = workspacePath.endsWith("/")
    ? workspacePath
    : workspacePath + "/";
  return target === workspacePath || target.startsWith(normalized);
}

/**
 * Assert that a target path is within the active workspace.
 * Throws if no workspace is set or the path is outside it.
 */
export function assertWorkspacePath(target: string): void {
  const ws = useWorkspaceStore.getState().activeWorkspace;
  if (!ws) {
    throw new Error("No workspace set. Please configure a workspace first.");
  }
  if (!containsPath(ws.path, target)) {
    throw new Error(
      `Path "${target}" is outside the workspace "${ws.path}".`,
    );
  }
}
