import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getDatabase } from "../db";
import { closeDatabase } from "../db";
import { generateCoverImage, generateCoverImageCandidates } from "../image-generation";
import { encryptSecret } from "../security";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { getGlobalCoverImageEngine, getGlobalCoverImageEngineSecret, upsertGlobalCoverImageEngine } from "../image-engine";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-image-generation-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousCoverImageProvider = process.env.COVER_IMAGE_PROVIDER;
  const previousCoverImageBaseUrl = process.env.COVER_IMAGE_BASE_URL;
  const previousCoverImageModel = process.env.COVER_IMAGE_MODEL;
  const previousCoverImageApiKey = process.env.COVER_IMAGE_API_KEY;
  const previousCoverImageEnabled = process.env.COVER_IMAGE_ENABLED;
  const previousOpenAiBaseUrl = process.env.OPENAI_BASE_URL;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;

  process.env.DATABASE_PATH = tempDbPath;
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
    if (previousCoverImageProvider == null) delete process.env.COVER_IMAGE_PROVIDER;
    else process.env.COVER_IMAGE_PROVIDER = previousCoverImageProvider;
    if (previousCoverImageBaseUrl == null) delete process.env.COVER_IMAGE_BASE_URL;
    else process.env.COVER_IMAGE_BASE_URL = previousCoverImageBaseUrl;
    if (previousCoverImageModel == null) delete process.env.COVER_IMAGE_MODEL;
    else process.env.COVER_IMAGE_MODEL = previousCoverImageModel;
    if (previousCoverImageApiKey == null) delete process.env.COVER_IMAGE_API_KEY;
    else process.env.COVER_IMAGE_API_KEY = previousCoverImageApiKey;
    if (previousCoverImageEnabled == null) delete process.env.COVER_IMAGE_ENABLED;
    else process.env.COVER_IMAGE_ENABLED = previousCoverImageEnabled;
    if (previousOpenAiBaseUrl == null) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousOpenAiBaseUrl;
    if (previousOpenAiApiKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function seedImageEngine(input?: {
  baseUrl?: string;
  model?: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("DELETE FROM global_ai_engines WHERE engine_code = ?", ["coverImage"]);
  await db.exec(
    `INSERT INTO global_ai_engines (
      engine_code, provider_name, base_url, api_key_encrypted, model, is_enabled, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "coverImage",
      "openai",
      input?.baseUrl || "https://api.openai.com/v1",
      encryptSecret("test-openai-key"),
      input?.model || "gpt-image-2",
      1,
      null,
      now,
      now,
    ],
  );
}

async function seedBrokenImageEngine(input?: {
  baseUrl?: string;
  model?: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("DELETE FROM global_ai_engines WHERE engine_code = ?", ["coverImage"]);
  await db.exec(
    `INSERT INTO global_ai_engines (
      engine_code, provider_name, base_url, api_key_encrypted, model, is_enabled, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "coverImage",
      "openai",
      input?.baseUrl || "https://api.openai.com/v1",
      Buffer.from("broken-image-secret", "utf8").toString("base64"),
      input?.model || "gpt-image-2",
      1,
      null,
      now,
      now,
    ],
  );
}

const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pNCXl8AAAAASUVORK5CYII=";

test("generateCoverImage uses OpenAI generations endpoint for gpt-image models", async () => {
  await withTempDatabase("openai-generations", async () => {
    await seedImageEngine();

    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("mock-image", "utf8").toString("base64") }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await generateCoverImage({ title: "OpenAI 封面" });
      assert.equal(requestUrl, "https://api.openai.com/v1/images/generations");
      assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer test-openai-key");
      const payload = JSON.parse(String(requestInit?.body || "{}"));
      assert.equal(payload.model, "gpt-image-2");
      assert.equal(payload.size, "1024x1024");
      assert.equal(payload.output_format, "png");
      assert.equal(payload.n, 1);
      assert.match(String(payload.prompt || ""), /OpenAI 封面/);
      assert.equal(result.size, "1024x1024");
      assert.match(result.imageUrl, /^data:image\/png;base64,/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("generateCoverImage retries OpenAI image endpoint with /v1 when root endpoint returns html shell", async () => {
  await withTempDatabase("openai-generations-v1-retry", async () => {
    await seedImageEngine({
      baseUrl: "https://gateway.example.com",
    });

    const originalFetch = globalThis.fetch;
    const requestUrls: string[] = [];

    globalThis.fetch = (async (input) => {
      requestUrls.push(String(input));
      if (String(input) === "https://gateway.example.com/images/generations") {
        return new Response("<!doctype html><html><body>app shell</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("mock-image", "utf8").toString("base64") }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await generateCoverImage({ title: "OpenAI 网关根路径封面" });
      assert.deepEqual(requestUrls, [
        "https://gateway.example.com/images/generations",
        "https://gateway.example.com/v1/images/generations",
      ]);
      assert.match(result.imageUrl, /^data:image\/png;base64,/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("generateCoverImage surfaces unsupported custom OpenAI image gateway clearly", async () => {
  await withTempDatabase("openai-generations-unsupported-gateway", async () => {
    await seedImageEngine({
      baseUrl: "https://gateway.example.com",
    });

    const originalFetch = globalThis.fetch;
    const requestUrls: string[] = [];

    globalThis.fetch = (async (input) => {
      requestUrls.push(String(input));
      if (String(input) === "https://gateway.example.com/images/generations") {
        return new Response("<!doctype html><html><body>app shell</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("404 page not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => generateCoverImage({ title: "自定义网关封面" }),
        /不支持 OpenAI 图片接口|COVER_IMAGE_BASE_URL/,
      );
      assert.deepEqual(requestUrls, [
        "https://gateway.example.com/images/generations",
        "https://gateway.example.com/v1/images/generations",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("generateCoverImageCandidates switches gpt-image reference calls to OpenAI edits endpoint", async () => {
  await withTempDatabase("openai-edits", async () => {
    await seedImageEngine({
      baseUrl: "https://api.openai.com/v1/images/generations",
    });

    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; body: FormData | null }> = [];

    globalThis.fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        body: init?.body instanceof FormData ? init.body : null,
      });
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("mock-edit-image", "utf8").toString("base64") }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const results = await generateCoverImageCandidates({
        title: "参考图封面",
        referenceImageDataUrl: ONE_PIXEL_PNG_DATA_URL,
      });
      assert.equal(results.length, 2);
      assert.equal(requests.length, 2);
      for (const request of requests) {
        assert.equal(request.url, "https://api.openai.com/v1/images/edits");
        assert(request.body instanceof FormData);
        assert.equal(request.body.get("model"), "gpt-image-2");
        assert.equal(request.body.get("size"), "1024x1024");
        assert.equal(request.body.get("output_format"), "png");
        const imagePart = request.body.get("image");
        assert(imagePart instanceof File);
        assert.equal(imagePart.type, "image/png");
        assert.equal(imagePart.name, "reference.png");
      }
      assert(results.every((item) => /^data:image\/png;base64,/.test(item.imageUrl)));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("generateCoverImage supports explicit output resolution override", async () => {
  await withTempDatabase("openai-resolution-override", async () => {
    await seedImageEngine();

    const originalFetch = globalThis.fetch;
    let payload: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_input, init) => {
      payload = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("mock-image", "utf8").toString("base64") }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await generateCoverImage({
        title: "高分辨率封面",
        outputResolution: "1536x1024",
      });
      assert.equal(payload?.size, "1536x1024");
      assert.equal(result.size, "1536x1024");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("cover image engine prefers .env override over database config", async () => {
  await withTempDatabase("env-override-config", async () => {
    await seedImageEngine({
      baseUrl: "https://db.example.com/v1",
      model: "db-image-model",
    });

    process.env.COVER_IMAGE_PROVIDER = "openai";
    process.env.COVER_IMAGE_BASE_URL = "https://api.openai.com/v1";
    process.env.COVER_IMAGE_MODEL = "gpt-image-2";
    process.env.COVER_IMAGE_API_KEY = "env-image-key";
    process.env.COVER_IMAGE_ENABLED = "true";

    const config = await getGlobalCoverImageEngine();
    const secret = await getGlobalCoverImageEngineSecret();

    assert.equal(config.configSource, "env");
    assert.equal(config.providerName, "openai");
    assert.equal(config.baseUrl, "https://api.openai.com/v1");
    assert.equal(config.model, "gpt-image-2");
    assert.equal(config.hasApiKey, true);
    assert.equal(secret?.configSource, "env");
    assert.equal(secret?.apiKey, "env-image-key");
  });
});

test("cover image engine no longer inherits OPENAI_* defaults implicitly", async () => {
  await withTempDatabase("env-override-no-openai-fallback", async () => {
    await seedImageEngine({
      baseUrl: "https://db.example.com/v1",
      model: "db-image-model",
    });

    process.env.COVER_IMAGE_MODEL = "gpt-image-2";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_API_KEY = "shared-openai-key";

    const config = await getGlobalCoverImageEngine();
    const secret = await getGlobalCoverImageEngineSecret();

    assert.equal(config.configSource, "env");
    assert.equal(config.providerName, "openai");
    assert.equal(config.baseUrl, "");
    assert.equal(config.hasApiKey, false);
    assert.equal(secret?.configSource, "env");
    assert.equal(secret?.baseUrl, "");
    assert.equal(secret?.apiKey, "");
  });
});

test("cover image engine tolerates unreadable database fallback secret", async () => {
  await withTempDatabase("broken-db-secret", async () => {
    await seedBrokenImageEngine({
      baseUrl: "https://db.example.com/v1",
      model: "db-image-model",
    });

    const databaseConfig = await getGlobalCoverImageEngine();
    const databaseSecret = await getGlobalCoverImageEngineSecret();

    assert.equal(databaseConfig.configSource, "database");
    assert.equal(databaseConfig.hasApiKey, false);
    assert.match(databaseConfig.secretWarning || "", /无法在当前环境解密/);
    assert.equal(databaseSecret?.apiKey, "");
    assert.equal(databaseSecret?.secretWarning, databaseConfig.secretWarning);

    process.env.COVER_IMAGE_PROVIDER = "openai";
    process.env.COVER_IMAGE_MODEL = "gpt-image-2";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_API_KEY = "shared-openai-key";

    const envConfig = await getGlobalCoverImageEngine();
    const envSecret = await getGlobalCoverImageEngineSecret();

    assert.equal(envConfig.configSource, "env");
    assert.equal(envConfig.providerName, "openai");
    assert.equal(envConfig.baseUrl, "");
    assert.equal(envConfig.hasApiKey, false);
    assert.match(envConfig.secretWarning || "", /重新输入并保存一次/);
    assert.equal(envSecret?.apiKey, "");
    assert.equal(envSecret?.configSource, "env");
  });
});

test("upsertGlobalCoverImageEngine requires re-entering api key when stored fallback secret is unreadable", async () => {
  await withTempDatabase("broken-db-secret-upsert", async () => {
    await seedBrokenImageEngine();

    await assert.rejects(
      () => upsertGlobalCoverImageEngine({
        operatorUserId: 1,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-2",
      }),
      /数据库兜底 API Key 无法在当前环境解密/,
    );
  });
});
