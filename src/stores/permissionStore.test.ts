import { describe, it, expect, afterEach } from "vitest";
import { createStoreReset } from "@/test-utils";
import { usePermissionStore, getBashCommandPattern } from "./permissionStore";
import type { PermissionChoice } from "./permissionStore";

// --- setup ---

const resetStore = createStoreReset(usePermissionStore);
afterEach(() => resetStore());

// --- tests ---

describe("getBashCommandPattern", () => {
  it("extracts first word and lowercases", () => {
    expect(getBashCommandPattern("Curl https://example.com")).toBe("curl");
  });

  it("handles empty string", () => {
    expect(getBashCommandPattern("")).toBe("");
  });

  it("handles multi-word commands", () => {
    expect(getBashCommandPattern("git push origin main")).toBe("git");
  });

  it("trims leading whitespace", () => {
    expect(getBashCommandPattern("  npm install")).toBe("npm");
  });
});

describe("permissionStore — ask", () => {
  it("sets pendingAsk for first request", () => {
    usePermissionStore.getState().ask("conv-1", "bash", "ls -la");

    const state = usePermissionStore.getState();
    expect(state.pendingAsk).not.toBeNull();
    expect(state.pendingAsk!.conversationId).toBe("conv-1");
    expect(state.pendingAsk!.operation).toBe("bash");
    expect(state.pendingAsk!.pathOrCommand).toBe("ls -la");
    expect(state.pendingAsk!.bashPattern).toBe("ls");
  });

  it("queues second request when one is pending", () => {
    usePermissionStore.getState().ask("conv-1", "bash", "ls");
    usePermissionStore.getState().ask("conv-1", "bash", "cat file.txt");

    const state = usePermissionStore.getState();
    expect(state.pendingAsk).not.toBeNull();
    expect(state.pendingAsk!.pathOrCommand).toBe("ls");
    expect(state.pendingQueue).toHaveLength(1);
    expect(state.pendingQueue[0].pathOrCommand).toBe("cat file.txt");
  });

  it("resolves immediately for already-allowed bash pattern", async () => {
    // First: allow with always_allow to cache the pattern
    const p1 = usePermissionStore.getState().ask("conv-1", "bash", "curl http://x", {
      bashPattern: "curl",
    });
    usePermissionStore.getState().respond("always_allow");
    expect(await p1).toBe(true);

    // Second: same pattern should resolve immediately
    const p2 = usePermissionStore.getState().ask("conv-1", "bash", "curl http://y", {
      bashPattern: "curl",
    });
    expect(await p2).toBe(true);

    // No new pendingAsk should be created for the cached pattern
    expect(usePermissionStore.getState().pendingAsk).toBeNull();
  });

  it("derives bashPattern from command when not provided", () => {
    usePermissionStore.getState().ask("conv-1", "bash", "wget http://example.com");

    expect(usePermissionStore.getState().pendingAsk!.bashPattern).toBe("wget");
  });

  it("does not set bashPattern for non-bash operations", () => {
    usePermissionStore.getState().ask("conv-1", "write", "/path/to/file");

    expect(usePermissionStore.getState().pendingAsk!.bashPattern).toBeUndefined();
  });
});

describe("permissionStore — respond", () => {
  it("resolves allow -> true", async () => {
    const promise = usePermissionStore.getState().ask("conv-1", "bash", "ls");
    usePermissionStore.getState().respond("allow");
    expect(await promise).toBe(true);
  });

  it("resolves deny -> false", async () => {
    const promise = usePermissionStore.getState().ask("conv-1", "bash", "rm -rf /");
    usePermissionStore.getState().respond("deny");
    expect(await promise).toBe(false);
  });

  it("pops next from queue after respond", () => {
    usePermissionStore.getState().ask("conv-1", "bash", "ls");
    usePermissionStore.getState().ask("conv-1", "bash", "cat");
    usePermissionStore.getState().ask("conv-1", "bash", "grep");

    // Respond to first (ls) → cat becomes pendingAsk
    usePermissionStore.getState().respond("allow");
    expect(usePermissionStore.getState().pendingAsk!.pathOrCommand).toBe("cat");
    expect(usePermissionStore.getState().pendingQueue).toHaveLength(1);

    // Respond to second (cat) → grep becomes pendingAsk
    usePermissionStore.getState().respond("allow");
    expect(usePermissionStore.getState().pendingAsk!.pathOrCommand).toBe("grep");
    expect(usePermissionStore.getState().pendingQueue).toHaveLength(0);
  });

  it("clears pendingAsk when queue empty", () => {
    usePermissionStore.getState().ask("conv-1", "bash", "ls");
    usePermissionStore.getState().respond("allow");

    expect(usePermissionStore.getState().pendingAsk).toBeNull();
    expect(usePermissionStore.getState().pendingQueue).toEqual([]);
  });

  it("does nothing if no pendingAsk", () => {
    // Should not throw
    usePermissionStore.getState().respond("allow");
    expect(usePermissionStore.getState().pendingAsk).toBeNull();
  });

  it("always_allow caches bash pattern for conversation", async () => {
    const promise = usePermissionStore.getState().ask("conv-1", "bash", "npm install", {
      bashPattern: "npm",
    });
    usePermissionStore.getState().respond("always_allow");
    expect(await promise).toBe(true);

    const patterns = usePermissionStore.getState().allowedBashPatterns["conv-1"];
    expect(patterns).toBeDefined();
    expect(patterns!.has("npm")).toBe(true);
  });

  it("always_allow does not affect other conversations", async () => {
    const p = usePermissionStore.getState().ask("conv-1", "bash", "npm run", {
      bashPattern: "npm",
    });
    usePermissionStore.getState().respond("always_allow");
    await p;

    // conv-2 should NOT have the cached pattern
    const promise2 = usePermissionStore.getState().ask("conv-2", "bash", "npm test", {
      bashPattern: "npm",
    });
    // It should create a new pendingAsk, not auto-resolve
    expect(usePermissionStore.getState().pendingAsk!.conversationId).toBe("conv-2");
    usePermissionStore.getState().respond("allow");
    expect(await promise2).toBe(true);
  });
});

describe("permissionStore — multi-request flow", () => {
  it("FIFO ordering of queued requests", async () => {
    const results: string[] = [];
    const p1 = usePermissionStore.getState().ask("c", "bash", "first").then(() => results.push("first"));
    const p2 = usePermissionStore.getState().ask("c", "bash", "second").then(() => results.push("second"));
    const p3 = usePermissionStore.getState().ask("c", "bash", "third").then(() => results.push("third"));

    usePermissionStore.getState().respond("allow");
    usePermissionStore.getState().respond("allow");
    usePermissionStore.getState().respond("allow");

    await Promise.all([p1, p2, p3]);
    expect(results).toEqual(["first", "second", "third"]);
  });

  it("concurrent ask() promises all resolve correctly", async () => {
    const choices: PermissionChoice[] = ["allow", "deny", "allow"];
    const promises = [
      usePermissionStore.getState().ask("c", "bash", "cmd1"),
      usePermissionStore.getState().ask("c", "bash", "cmd2"),
      usePermissionStore.getState().ask("c", "bash", "cmd3"),
    ];

    for (const choice of choices) {
      usePermissionStore.getState().respond(choice);
    }

    const results = await Promise.all(promises);
    expect(results).toEqual([true, false, true]);
  });

  it("cached pattern auto-resolves subsequent asks without queuing", async () => {
    // Cache "git" pattern
    const p = usePermissionStore.getState().ask("c", "bash", "git status", { bashPattern: "git" });
    usePermissionStore.getState().respond("always_allow");
    await p;

    // Now ask again with same pattern — should resolve immediately
    const result = await usePermissionStore.getState().ask("c", "bash", "git push", {
      bashPattern: "git",
    });
    expect(result).toBe(true);
    expect(usePermissionStore.getState().pendingAsk).toBeNull();
  });
});
