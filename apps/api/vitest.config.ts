import "dotenv/config"; // picks up TEST_DATABASE_URL from apps/api/.env when present
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests share one test database, so test files run one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
