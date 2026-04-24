import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const databasePath = path.resolve(process.cwd(), "apps/web/data/e2e-huoziwriter.db");
const e2eAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "E2E#Admin42";
const hasLocalChrome = fs.existsSync("/Applications/Google Chrome.app");
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || (hasLocalChrome ? "chrome" : "chromium");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel: browserChannel,
  },
  webServer: {
    command:
      "zsh -lc 'set -euo pipefail && pnpm db:init && cd apps/web && pnpm build && PORT=3101 HOSTNAME=127.0.0.1 pnpm start'",
    url: "http://127.0.0.1:3101/login",
    reuseExistingServer: false,
    timeout: 900_000,
    env: {
      ...process.env,
      PORT: "3101",
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_PATH: databasePath,
      DEFAULT_ADMIN_PASSWORD: e2eAdminPassword,
      IMA_OPENAPI_BASE_URL: "http://127.0.0.1:3101/api/tools/mock-ima",
    },
  },
});
