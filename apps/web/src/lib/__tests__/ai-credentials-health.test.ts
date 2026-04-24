import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { clearAiCredentialHealthCache, getCredentialHealthMatrix } from "../ai-credentials-health";
import { closeDatabase, getDatabase } from "../db";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-ai-credentials-health-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  const previousAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const previousGeminiBaseUrl = process.env.GEMINI_BASE_URL;
  const previousModelRoutesJson = process.env.AI_MODEL_ROUTES_JSON;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.GEMINI_BASE_URL;
  delete process.env.AI_MODEL_ROUTES_JSON;
  clearAiCredentialHealthCache();
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    clearAiCredentialHealthCache();
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    if (previousOpenAiBaseUrl == null) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousOpenAiBaseUrl;
    if (previousAnthropicBaseUrl == null) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previousAnthropicBaseUrl;
    if (previousGeminiBaseUrl == null) delete process.env.GEMINI_BASE_URL;
    else process.env.GEMINI_BASE_URL = previousGeminiBaseUrl;
    if (previousModelRoutesJson == null) delete process.env.AI_MODEL_ROUTES_JSON;
    else process.env.AI_MODEL_ROUTES_JSON = previousModelRoutesJson;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function seedRoutes() {
  const db = getDatabase();
  const now = "2026-04-21T12:00:00.000Z";
  await db.exec("DELETE FROM ai_model_routes");
  for (const row of [
    {
      sceneCode: "outlinePlan",
      primaryModel: "gpt-4o-mini",
      fallbackModel: "claude-3-5-sonnet-latest",
    },
    {
      sceneCode: "deepWrite",
      primaryModel: "gpt-4o-mini",
      fallbackModel: null,
    },
    {
      sceneCode: "factCheck",
      primaryModel: "gemini-2.0-flash",
      fallbackModel: "claude-3-5-sonnet-latest",
    },
  ]) {
    await db.exec(
      `INSERT INTO ai_model_routes (
        scene_code, primary_model, fallback_model, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.sceneCode,
        row.primaryModel,
        row.fallbackModel,
        "test route",
        now,
        now,
      ],
    );
  }
}

function setProviderEnv(values: Partial<Record<"OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GEMINI_API_KEY" | "GOOGLE_API_KEY", string | undefined>>) {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

test("getCredentialHealthMatrix groups deduped routes by provider and skips probe when env is missing", async () => {
  await withTempDatabase("grouping", async () => {
    await seedRoutes();
    const restoreEnv = setProviderEnv({
      OPENAI_API_KEY: "openai-test-key",
      ANTHROPIC_API_KEY: undefined,
      GEMINI_API_KEY: "gemini-test-key",
      GOOGLE_API_KEY: undefined,
    });
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("openai.com")) {
        return new Response(JSON.stringify({ output_text: "ok" }), { status: 200 });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected provider" } }), { status: 500 });
    }) as typeof fetch;

    try {
      const matrix = await getCredentialHealthMatrix();
      const openai = matrix.providers.find((item) => item.provider === "openai");
      const anthropic = matrix.providers.find((item) => item.provider === "anthropic");
      const gemini = matrix.providers.find((item) => item.provider === "gemini");

      assert.equal(matrix.providers.length, 3);
      assert.equal(openai?.status, "healthy");
      assert.deepEqual(openai?.models, ["gpt-4o-mini"]);
      assert.deepEqual(openai?.sceneCodes, ["outlinePlan", "deepWrite"]);

      assert.equal(anthropic?.status, "missing_env");
      assert.equal(anthropic?.lastProbeAt, null);
      assert.deepEqual(anthropic?.models, ["claude-3-5-sonnet-latest"]);
      assert.deepEqual(anthropic?.sceneCodes, ["outlinePlan", "factCheck"]);
      assert.match(anthropic?.error || "", /ANTHROPIC_API_KEY/);

      assert.equal(gemini?.status, "healthy");
      assert.deepEqual(gemini?.models, ["gemini-2.0-flash"]);
      assert.deepEqual(gemini?.sceneCodes, ["factCheck"]);

      assert.equal(calls.length, 2);
      assert(calls.some((url) => url.includes("openai.com")));
      assert(calls.some((url) => url.includes("generativelanguage.googleapis.com")));
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv();
    }
  });
});

test("getCredentialHealthMatrix probes provider-specific env base urls", async () => {
  await withTempDatabase("env-base-urls", async () => {
    await seedRoutes();
    const restoreEnv = setProviderEnv({
      OPENAI_API_KEY: "openai-test-key",
      ANTHROPIC_API_KEY: "anthropic-test-key",
      GEMINI_API_KEY: "gemini-test-key",
      GOOGLE_API_KEY: undefined,
    });
    process.env.OPENAI_BASE_URL = "https://ai-gateway.local/openai/v1/";
    process.env.ANTHROPIC_BASE_URL = "https://ai-gateway.local/anthropic/v1/";
    process.env.GEMINI_BASE_URL = "https://ai-gateway.local/gemini/v1beta/";
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/openai/")) {
        return new Response(JSON.stringify({ output_text: "ok" }), { status: 200 });
      }
      if (url.includes("/anthropic/")) {
        return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 });
      }
      if (url.includes("/gemini/")) {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected provider" } }), { status: 500 });
    }) as typeof fetch;

    try {
      const matrix = await getCredentialHealthMatrix();

      assert.deepEqual(matrix.providers.map((item) => item.status), ["healthy", "healthy", "healthy"]);
      assert(calls.includes("https://ai-gateway.local/openai/v1/responses"));
      assert(calls.includes("https://ai-gateway.local/anthropic/v1/messages"));
      assert(calls.some((url) => url.startsWith("https://ai-gateway.local/gemini/v1beta/models/gemini-2.0-flash:generateContent?key=")));
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv();
    }
  });
});

test("getCredentialHealthMatrix caches provider probes for 60 seconds", async () => {
  await withTempDatabase("cache", async () => {
    await seedRoutes();
    const restoreEnv = setProviderEnv({
      OPENAI_API_KEY: "openai-test-key",
      ANTHROPIC_API_KEY: "anthropic-test-key",
      GEMINI_API_KEY: "gemini-test-key",
      GOOGLE_API_KEY: undefined,
    });
    const originalFetch = globalThis.fetch;
    let callCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      callCount += 1;
      const url = String(input);
      if (url.includes("openai.com")) {
        return new Response(JSON.stringify({ output_text: "ok" }), { status: 200 });
      }
      if (url.includes("api.anthropic.com")) {
        return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
    }) as typeof fetch;

    try {
      const first = await getCredentialHealthMatrix();
      const second = await getCredentialHealthMatrix();

      assert.equal(callCount, 3);
      assert.equal(second.generatedAt, first.generatedAt);
      assert.deepEqual(second.providers.map((item) => item.status), ["healthy", "healthy", "healthy"]);
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv();
    }
  });
});
