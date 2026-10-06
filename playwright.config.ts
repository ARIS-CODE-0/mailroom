import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3036",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/test/browser-fixture.mjs",
    url: "http://127.0.0.1:3036/health",
    reuseExistingServer: false,
  },
  reporter: "list",
});
