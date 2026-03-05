import { invoke } from "@tauri-apps/api/core";
import { CONFIG_DEFAULTS } from "./types";

type ConfigName = keyof typeof CONFIG_DEFAULTS;

export async function readConfig<T>(name: ConfigName): Promise<T> {
  const raw = await invoke<string>("read_config", { name });
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const defaults = CONFIG_DEFAULTS[name] as unknown as Record<string, unknown>;
  // Merge defaults for missing keys
  return { ...defaults, ...parsed } as T;
}

export async function writeConfig<T>(name: ConfigName, data: T): Promise<void> {
  await invoke("write_config", {
    name,
    content: JSON.stringify(data, null, 2),
  });
}

export async function updateConfig<T>(
  name: ConfigName,
  updater: (current: T) => T,
): Promise<T> {
  const current = await readConfig<T>(name);
  const next = updater(current);
  await writeConfig(name, next);
  return next;
}
