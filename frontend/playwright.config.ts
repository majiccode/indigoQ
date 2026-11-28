import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:8897", viewport: { width: 1280, height: 1000 }, trace: "retain-on-failure" },
  webServer: {
    command: "uv run --directory ../backend python ../frontend/tests/browser/server.py",
    url: "http://127.0.0.1:8897/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
