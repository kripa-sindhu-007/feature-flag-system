import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the tsconfig `@/*` path alias so tests can import app modules the same
// way the app does (e.g. `@/sdk/FeatureFlagClient`). Without this vitest can't
// resolve `@/` and any test that imports a module which uses it fails.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
