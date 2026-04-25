import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DEFAULT_MODEL_ROUTES } from "../domain";
import { closeDatabase, getDatabase } from "../db";
import { PLAN22_STAGE_PROMPT_DEFINITIONS } from "../plan22-prompt-catalog";
import { getPromptVersions } from "../repositories";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

test("getPromptVersions seeds default plan17 prompt scenes on a fresh database", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huoziwriter-plan17-prompts-"));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  await closeDatabase();

  try {
    await runPendingMigrations();
    const prompts = await getPromptVersions();
    const promptIds = new Set(prompts.map((item) => item.prompt_id));

    assert.ok(prompts.length > 0);
    assert.equal(promptIds.has("topicFission.regularity"), true);
    assert.equal(promptIds.has("topicFission.contrast"), true);
    assert.equal(promptIds.has("topicFission.crossDomain"), true);
    assert.equal(promptIds.has("strategyCard.autoDraft"), true);
    assert.equal(promptIds.has("strategyCard.fourPointAggregate"), true);
    assert.equal(promptIds.has("strategyCard.strengthAudit"), true);
    assert.equal(promptIds.has("strategyCard.reverseWriteback"), true);
    assert.equal(promptIds.has("evidenceHookTagging"), true);
    assert.equal(promptIds.has("styleDna.crossCheck"), true);
    assert.equal(promptIds.has("publishGate.rhythmConsistency"), true);
    assert.equal(promptIds.has("opening_optimizer"), true);
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("fresh migrations include plan22 prompt matrix and model routes", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huoziwriter-plan22-prompts-"));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
  await closeDatabase();

  try {
    await runPendingMigrations();
    const db = getDatabase();
    const prompts = await getPromptVersions();
    const promptIds = new Set(prompts.map((item) => item.prompt_id));
    const defaultRouteSceneCodes = new Set(DEFAULT_MODEL_ROUTES.map((route) => route.sceneCode));

    for (const definition of PLAN22_STAGE_PROMPT_DEFINITIONS) {
      assert.equal(promptIds.has(definition.promptId), true, `missing prompt ${definition.promptId}`);
      assert.equal(defaultRouteSceneCodes.has(definition.sceneCode), true, `missing default route ${definition.sceneCode}`);

      const route = await db.queryOne<{ scene_code: string }>(
        "SELECT scene_code FROM ai_model_routes WHERE scene_code = ? LIMIT 1",
        [definition.sceneCode],
      );
      assert.equal(route?.scene_code, definition.sceneCode, `missing db route ${definition.sceneCode}`);
    }

    const researchPrompt = prompts.find((item) => item.prompt_id === "research_brief" && item.version === "v1.1.0");
    assert.ok(researchPrompt);
    assert.match(researchPrompt.prompt_content, /搜索摘要直接写成已验证事实/);
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
