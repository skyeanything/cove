import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof window !== "undefined") {
    const { clearMocks } = await import("@tauri-apps/api/mocks");
    clearMocks();
  }
});
