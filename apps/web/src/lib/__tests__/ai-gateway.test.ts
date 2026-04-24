import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GatewayProviderError,
  classifyGatewayError,
  executeWithRetry,
  generateSceneText,
  getRetryDelayMs,
  shouldRunShadowTraffic,
} from "../ai-gateway";
import { closeDatabase, getDatabase } from "../db";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-ai-gateway-${name}-`));
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
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
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

async function seedOpenAiRoute(
  sceneCode: "outlinePlan" | "deepWrite",
  primaryModel: string,
  fallbackModel: string | null,
  shadowModel: string | null = null,
  shadowTrafficPercent = 0,
) {
  const db = getDatabase();
  const now = "2026-04-23T12:00:00.000Z";
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ai_model_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_code TEXT NOT NULL UNIQUE,
      primary_model TEXT NOT NULL,
      fallback_model TEXT,
      shadow_model TEXT,
      shadow_traffic_percent INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ai_call_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_code TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      call_mode TEXT NOT NULL DEFAULT 'primary',
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_creation_tokens INTEGER,
      cache_read_tokens INTEGER,
      latency_ms INTEGER,
      status TEXT NOT NULL,
      error_class TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  await db.exec("DELETE FROM ai_call_observations");
  await db.exec("DELETE FROM ai_model_routes WHERE scene_code = ?", [sceneCode]);
  await db.exec(
    `INSERT INTO ai_model_routes (
      scene_code, primary_model, fallback_model, shadow_model, shadow_traffic_percent, description, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sceneCode, primaryModel, fallbackModel, shadowModel, shadowTrafficPercent, "test route", now, now],
  );
}

test("classifyGatewayError marks rate limit, 5xx and timeout as retryable", () => {
  assert.equal(
    classifyGatewayError(
      new GatewayProviderError({
        provider: "openai",
        model: "gpt-4o-mini",
        status: 429,
        message: "rate limited",
      }),
    ),
    "retryable",
  );
  assert.equal(
    classifyGatewayError(
      new GatewayProviderError({
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        status: 503,
        message: "unavailable",
      }),
    ),
    "retryable",
  );
  assert.equal(classifyGatewayError(new DOMException("timed out", "TimeoutError")), "retryable");
});

test("classifyGatewayError marks auth errors as fatal and unknown errors as fallback", () => {
  assert.equal(
    classifyGatewayError(
      new GatewayProviderError({
        provider: "gemini",
        model: "gemini-2.5-flash",
        status: 401,
        message: "unauthorized",
      }),
    ),
    "fatal",
  );
  assert.equal(classifyGatewayError(new Error("missing api key")), "fallback");
});

test("getRetryDelayMs prefers retry-after over exponential backoff", () => {
  const rateLimitError = new GatewayProviderError({
    provider: "openai",
    model: "gpt-4o-mini",
    status: 429,
    retryAfterMs: 5_000,
    message: "rate limited",
  });
  assert.equal(getRetryDelayMs(1, rateLimitError), 5_000);
  assert.equal(
    getRetryDelayMs(
      2,
      new GatewayProviderError({
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        status: 500,
        message: "server error",
      }),
    ),
    1_500,
  );
});

test("executeWithRetry waits retry-after once and succeeds on the second attempt", async () => {
  let callCount = 0;
  const delays: number[] = [];
  const result = await executeWithRetry(
    async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new GatewayProviderError({
          provider: "openai",
          model: "gpt-4o-mini",
          status: 429,
          retryAfterMs: 5_000,
          message: "rate limited",
        });
      }
      return "ok";
    },
    {
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result.value, "ok");
  assert.equal(result.attemptCount, 2);
  assert.deepEqual(delays, [5_000]);
});

test("executeWithRetry stops immediately on fatal auth errors", async () => {
  let callCount = 0;
  const delays: number[] = [];
  await assert.rejects(
    executeWithRetry(
      async () => {
        callCount += 1;
        throw new GatewayProviderError({
          provider: "openai",
          model: "gpt-4o-mini",
          status: 401,
          message: "unauthorized",
        });
      },
      {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      },
    ),
  );

  assert.equal(callCount, 1);
  assert.deepEqual(delays, []);
});

test("generateSceneText falls back to the next model after five consecutive 429 responses", async () => {
  await withTempDatabase("fallback-after-429", async () => {
    await seedOpenAiRoute("outlinePlan", "gpt-4o-mini", "gpt-4.1-mini");

    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";

    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    const delays: number[] = [];
    const modelAttempts = new Map<string, number>();

    globalThis.setTimeout = (((callback: (...args: unknown[]) => void, delay?: number) => {
      delays.push(Number(delay ?? 0));
      callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}")) as { model?: string };
      const model = String(payload.model || "");
      const attempt = (modelAttempts.get(model) ?? 0) + 1;
      modelAttempts.set(model, attempt);

      if (model === "gpt-4o-mini" && attempt <= 3) {
        return new Response(JSON.stringify({ error: { message: `primary rate limited #${attempt}` } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      }
      if (model === "gpt-4.1-mini" && attempt <= 2) {
        return new Response(JSON.stringify({ error: { message: `fallback rate limited #${attempt}` } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ output_text: "fallback success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await generateSceneText({
        sceneCode: "outlinePlan",
        systemPrompt: "system",
        userPrompt: "user",
      });

      assert.equal(result.model, "gpt-4.1-mini");
      assert.equal(result.provider, "openai");
      assert.equal(result.text, "fallback success");
      assert.equal(modelAttempts.get("gpt-4o-mini"), 3);
      assert.equal(modelAttempts.get("gpt-4.1-mini"), 3);
      assert.deepEqual(delays, [200, 1500, 200, 1500]);
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
      if (previousApiKey == null) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });
});

test("generateSceneText keeps using the Anthropic fetch path when system segments are not provided", async () => {
  await withTempDatabase("anthropic-fetch-fallback", async () => {
    await seedOpenAiRoute("outlinePlan", "claude-3-5-sonnet-latest", null);

    const previousApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      calls.push({ url, body });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "anthropic fetch ok" }],
          usage: {
            input_tokens: 120,
            output_tokens: 45,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    try {
      const result = await generateSceneText({
        sceneCode: "outlinePlan",
        systemPrompt: "legacy system prompt",
        userPrompt: "legacy user prompt",
      });

      assert.equal(result.model, "claude-3-5-sonnet-latest");
      assert.equal(result.provider, "anthropic");
      assert.equal(result.text, "anthropic fetch ok");
      assert.equal(calls.length, 1);
      assert.match(calls[0]?.url || "", /api\.anthropic\.com\/v1\/messages/);
      assert.equal(calls[0]?.body.system, "legacy system prompt");
      assert.deepEqual(calls[0]?.body.messages, [{ role: "user", content: "legacy user prompt" }]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiKey == null) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previousApiKey;
      }
    }
  });
});

test("generateSceneText supports env base urls and model route overrides", async () => {
  await withTempDatabase("env-route-overrides", async () => {
    await seedOpenAiRoute("outlinePlan", "gpt-4o-mini", null);

    const previousApiKey = process.env.OPENAI_API_KEY;
    const previousBaseUrl = process.env.OPENAI_BASE_URL;
    const previousModelRoutesJson = process.env.AI_MODEL_ROUTES_JSON;
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_BASE_URL = "https://ai-gateway.local/openai/v1/";
    process.env.AI_MODEL_ROUTES_JSON = JSON.stringify({
      outlinePlan: {
        primaryModel: "gpt-4.1-mini",
      },
    });

    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; model: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}")) as { model?: string };
      calls.push({ url: String(input), model: String(payload.model || "") });
      return new Response(JSON.stringify({ output_text: "env route ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await generateSceneText({
        sceneCode: "outlinePlan",
        systemPrompt: "system",
        userPrompt: "user",
      });

      assert.equal(result.model, "gpt-4.1-mini");
      assert.equal(result.text, "env route ok");
      assert.deepEqual(calls, [{ url: "https://ai-gateway.local/openai/v1/responses", model: "gpt-4.1-mini" }]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiKey == null) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousApiKey;
      if (previousBaseUrl == null) delete process.env.OPENAI_BASE_URL;
      else process.env.OPENAI_BASE_URL = previousBaseUrl;
      if (previousModelRoutesJson == null) delete process.env.AI_MODEL_ROUTES_JSON;
      else process.env.AI_MODEL_ROUTES_JSON = previousModelRoutesJson;
    }
  });
});

test("shouldRunShadowTraffic buckets users by userId and percentage", () => {
  assert.equal(shouldRunShadowTraffic(null, 10), false);
  assert.equal(shouldRunShadowTraffic(42, 0), false);
  assert.equal(shouldRunShadowTraffic(9, 10), true);
  assert.equal(shouldRunShadowTraffic(10, 10), false);
  assert.equal(shouldRunShadowTraffic(109, 10), true);
});

test("generateSceneText sends eligible shadow traffic without changing the primary result", async () => {
  await withTempDatabase("shadow-traffic", async () => {
    await seedOpenAiRoute("outlinePlan", "gpt-4o-mini", null, "gpt-4.1-mini", 10);

    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";

    const originalFetch = globalThis.fetch;
    const calledModels: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body || "{}")) as { model?: string };
      const model = String(payload.model || "");
      calledModels.push(model);
      return new Response(JSON.stringify({ output_text: model === "gpt-4.1-mini" ? "shadow output" : "primary output" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await generateSceneText({
        sceneCode: "outlinePlan",
        systemPrompt: "system",
        userPrompt: "user",
        rolloutUserId: 9,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.equal(result.model, "gpt-4o-mini");
      assert.equal(result.text, "primary output");
      assert.deepEqual(calledModels.sort(), ["gpt-4.1-mini", "gpt-4o-mini"].sort());

      const observations = await getDatabase().query<{ model: string; call_mode: string; status: string }>(
        "SELECT model, call_mode, status FROM ai_call_observations ORDER BY id ASC",
      );
      assert.deepEqual(
        observations
          .filter((item) => item.model === "gpt-4o-mini" || item.model === "gpt-4.1-mini")
          .map((item) => [item.model, item.call_mode, item.status]),
        [
          ["gpt-4o-mini", "primary", "success"],
          ["gpt-4.1-mini", "shadow", "success"],
        ],
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousApiKey == null) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
    }
  });
});
