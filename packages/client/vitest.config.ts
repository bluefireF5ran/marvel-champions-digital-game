import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // The store tests build and play real games (2 to 3 s each on a quiet machine); the 5 s default times out on a
    // four-core CI runner and whenever several suites run at once. Same headroom as `@mc/cards`.
    testTimeout: 30_000,
  },
});
