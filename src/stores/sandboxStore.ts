import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface SandboxPolicy {
  enabled: boolean;
  denyRead: string[];
  allowWrite: string[];
  denyWrite: string[];
  allowNetwork: boolean;
}

interface SandboxState {
  sandboxSupported: boolean;
  policy: SandboxPolicy;
  initialized: boolean;
  init(): Promise<void>;
  toggleEnabled(enabled: boolean): Promise<void>;
  updatePolicy(policy: SandboxPolicy): Promise<void>;
}

const DEFAULT_POLICY: SandboxPolicy = {
  enabled: true,
  denyRead: ["~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gcloud"],
  allowWrite: [],
  denyWrite: [],
  allowNetwork: false,
};

export const useSandboxStore = create<SandboxState>((set, get) => ({
  sandboxSupported: false,
  policy: DEFAULT_POLICY,
  initialized: false,

  async init() {
    if (get().initialized) return;
    try {
      const [supported, policy] = await Promise.all([
        invoke<boolean>("check_sandbox_supported"),
        invoke<SandboxPolicy>("get_sandbox_policy"),
      ]);
      set({ sandboxSupported: supported, policy, initialized: true });
    } catch {
      set({ initialized: true });
    }
  },

  async toggleEnabled(enabled: boolean) {
    const policy = { ...get().policy, enabled };
    await invoke("set_sandbox_policy", { policy });
    set({ policy });
  },

  async updatePolicy(policy: SandboxPolicy) {
    await invoke("set_sandbox_policy", { policy });
    set({ policy });
  },
}));
