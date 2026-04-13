import path from "node:path";
import { defineConfig } from "@playwright/test";

const databasePath = path.resolve(process.cwd(), "apps/web/data/e2e-huoziwriter.db");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3101",
  },
  webServer: {
    command: "pnpm db:init && node apps/web/.next/standalone/apps/web/server.js",
    url: "http://127.0.0.1:3101/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: "3101",
      HOSTNAME: "127.0.0.1",
      DATABASE_PATH: databasePath,
      DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || "REDACTED_ADMIN_PASSWORD",
    },
  },
});
