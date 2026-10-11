import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8010;
const WEB_PORT = 4173;

/**
 * End-to-end configuration: boots the FastAPI backend and a production preview
 * build of the frontend (proxied to that backend), then runs the specs in e2e/.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Keeps headless Chromium stable on Windows under load.
          args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
        },
      },
    },
  ],
  webServer: [
    {
      command: `python -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Build once, then serve the production bundle with the API proxy.
      command: `npm run build && npx vite preview --port ${WEB_PORT} --host 127.0.0.1 --strictPort`,
      env: { VITE_API_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
