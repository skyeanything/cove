import { invoke } from "@tauri-apps/api/core";

interface DetectResult {
  available: boolean;
  version: string | null;
  path: string | null;
  bundled: boolean;
}

let cached: DetectResult | null = null;

/** 检测 office sidecar 是否可用（结果在进程生命周期内缓存） */
export async function isOfficeAvailable(): Promise<boolean> {
  if (cached !== null) return cached.available;
  try {
    await invoke("officellm_init");
    cached = await invoke<DetectResult>("officellm_detect");
    return cached.available;
  } catch {
    cached = { available: false, version: null, path: null, bundled: false };
    return false;
  }
}

/** 清除缓存（设置页安装后可调用） */
export function clearOfficeCache(): void {
  cached = null;
}
