/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_API_TARGET = "http://127.0.0.1:8000";

/**
 * Dev/preview proxy for the FastAPI backend. The target can be moved when port
 * 8000 is taken by another service:
 *
 *   # backend on another port
 *   VITE_API_TARGET=http://127.0.0.1:8001 npm run dev
 *
 * Or bypass the proxy entirely with an absolute base URL:
 *
 *   VITE_API_URL=http://127.0.0.1:8001/api npm run dev
 *
 * (VITE_API_URL also works for `vite preview` and static hosting.)
 */
function apiProxy(env: Record<string, string>) {
  const target = env.VITE_API_TARGET?.trim() || DEFAULT_API_TARGET;
  return {
    "/api": {
      target,
      changeOrigin: true,
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = apiProxy(env);
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      // Interaction-heavy tests type into several fields; give them room on
      // loaded machines instead of failing at the 5s default.
      testTimeout: 20000,
    },
  };
});
