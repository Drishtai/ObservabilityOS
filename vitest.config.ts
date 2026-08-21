import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/**/*.test.ts",
      "packages/sdk/src/**/*.test.ts",
      "packages/shipper/src/**/*.test.ts",
      "packages/ai/src/**/*.test.ts",
      "packages/db/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.yarn/**",
      "**/e2e/**",
    ],
    fileParallelism: false,
    isolate: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./apps/web/src"),
    },
  },
});
