import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const databasePath = path.resolve(process.cwd(), "apps/web/data/e2e-huoziwriter.db");
const e2eAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "E2E#Admin42";
const e2eSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hasLocalChrome = fs.existsSync("/Applications/Google Chrome.app");
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || (hasLocalChrome ? "chrome" : "chromium");

process.env.DATABASE_PATH = databasePath;
process.env.DEFAULT_ADMIN_PASSWORD = e2eAdminPassword;
process.env.JWT_SECRET = e2eSecret;
process.env.ENCRYPTION_KEY = e2eSecret;
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.GEMINI_API_KEY = "";
process.env.COVER_IMAGE_PROVIDER = "custom";
process.env.COVER_IMAGE_BASE_URL = "http://127.0.0.1:3101/api/tools/mock-image-engine";
process.env.COVER_IMAGE_MODEL = "mock-image-engine";
process.env.COVER_IMAGE_API_KEY = "mock-image-key";
process.env.COVER_IMAGE_ENABLED = "true";
process.env.IMA_OPENAPI_BASE_URL = "http://127.0.0.1:3101/api/tools/mock-ima";

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
      "zsh -lc 'set -euo pipefail && rm -f apps/web/data/e2e-huoziwriter.db apps/web/data/e2e-huoziwriter.db-wal apps/web/data/e2e-huoziwriter.db-shm && pnpm db:init && cd apps/web && pnpm build && PORT=3101 HOSTNAME=127.0.0.1 pnpm start'",
    url: "http://127.0.0.1:3101/login",
    reuseExistingServer: false,
    timeout: 900_000,
    env: {
      ...process.env,
      PORT: "3101",
      HOSTNAME: "127.0.0.1",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_PATH: databasePath,
      DEFAULT_ADMIN_PASSWORD: e2eAdminPassword,
      JWT_SECRET: e2eSecret,
      ENCRYPTION_KEY: e2eSecret,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      SCHEDULER_SERVICE_TOKEN: "change_me_to_a_random_64_char_secret",
      COVER_IMAGE_PROVIDER: "custom",
      COVER_IMAGE_BASE_URL: "http://127.0.0.1:3101/api/tools/mock-image-engine",
      COVER_IMAGE_MODEL: "mock-image-engine",
      COVER_IMAGE_API_KEY: "mock-image-key",
      COVER_IMAGE_ENABLED: "true",
      IMA_OPENAPI_BASE_URL: "http://127.0.0.1:3101/api/tools/mock-ima",
    },
  },
});
