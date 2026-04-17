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
    command: "pnpm db:init && cd apps/web && rm -rf .next-e2e && pnpm build && pnpm start --port 3101 --hostname 127.0.0.1",
    url: "http://127.0.0.1:3101/login",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...process.env,
      PORT: "3101",
      HOSTNAME: "127.0.0.1",
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_PATH: databasePath,
      DEFAULT_OPS_PASSWORD: process.env.DEFAULT_OPS_PASSWORD || "REDACTED_ADMIN_PASSWORD",
    },
  },
});
