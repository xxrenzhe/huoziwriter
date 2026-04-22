import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase } from "../db";
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
