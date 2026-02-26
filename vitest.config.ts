import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-utils/setup.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 5,
        branches: 5,
        functions: 5,
        lines: 5,
      },
      exclude: [
        "src/components/ui/**",
        "src/test-utils/**",
        "src/i18n/**",
        "node_modules/**",
      ],
    },
  },
});
