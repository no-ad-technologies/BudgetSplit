import { defineConfig } from "vitest/config";

// Unit tests for plain TypeScript logic only (no React Native rendering).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
