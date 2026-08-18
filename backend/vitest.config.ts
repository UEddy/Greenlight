import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Loads backend/.env so the live tests can find a key. Everything else in
    // the suite runs offline and ignores it.
    setupFiles: ["./test/setup.ts"],
  },
});
