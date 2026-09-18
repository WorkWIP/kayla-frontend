import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Unit-test runner for kayla-frontend (agents.md §3.2: Vitest for unit, Playwright for E2E —
 * Playwright arrives with the first real screen in P1).
 *
 * `NODE_OPTIONS=--no-experimental-webstorage` on the `test` npm script (not here — it has to be
 * set before Node starts, so a config value read after startup is too late) is load-bearing, not
 * cosmetic. Node 22 ships its OWN experimental `localStorage`/`sessionStorage` globals, which can
 * collide with jsdom's implementation of the same globals in one of Vitest's worker processes and
 * leave `window.localStorage` as `undefined` there — reproduced directly by forcing the feature on
 * with `NODE_OPTIONS=--experimental-webstorage`, which turns the race into an outright throw
 * ("--localstorage-file is an invalid localStorage location"). Confirmed present without a forced
 * flag too, and only inside a real `tools/ci.sh` run — never once reproduced by invoking `npm run
 * test` directly, which is what makes it dangerous: it looks like flakiness in the test file, and
 * the fix (`--no-experimental-webstorage`, so jsdom's implementation is the only one in play) has
 * nothing to do with test code. If a login-form test ever again fails with "Cannot read properties
 * of undefined (reading 'clear')" only inside the full gate, check this flag survived first.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json. Keep the two in step.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // src/env.ts validates at module load and throws when a variable is missing, so the test
    // run has to supply the same three variables a build does. These are the placeholders from
    // .env.example (agents.md §7.4) — never real values, and never a secret (R6).
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_ENVIRONMENT: "development",
    },
  },
});
