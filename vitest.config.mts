import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /*
      Money and business-rule tests are plain logic - no browser needed, and a
      DOM for all of them would slow every run down. A test that has to mount a
      screen asks for one itself with a `@vitest-environment jsdom` docblock.
    */
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
