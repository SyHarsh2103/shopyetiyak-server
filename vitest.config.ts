import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/test-env.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: { reporter: ["text", "html"] }
  }
});
