import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // Failure messages show whole objects: the agents of a run read them, and chai's default elides properties ("…(1)").
    chaiConfig: { truncateThreshold: 0 },
  },
});
