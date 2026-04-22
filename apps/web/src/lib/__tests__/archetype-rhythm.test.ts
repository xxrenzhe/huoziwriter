import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  activateArchetypeRhythmTemplate,
  clearArchetypeRhythmTemplateCache,
  createArchetypeRhythmTemplate,
  getActiveArchetypeRhythmTemplate,
  getMergedActiveArchetypeRhythmHints,
  listArchetypeRhythmTemplates,
} from "../archetype-rhythm";
import { closeDatabase, getDatabase } from "../db";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-archetype-rhythm-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  clearArchetypeRhythmTemplateCache();
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    clearArchetypeRhythmTemplateCache();
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("active archetype rhythm templates are seeded on first load", async () => {
  await withTempDatabase("seed", async () => {
    const template = await getActiveArchetypeRhythmTemplate("opinion");

    assert.equal(template.archetypeKey, "opinion");
    assert.equal(template.version, "v1");
    assert.equal(template.isActive, true);
    assert.equal(template.hints.narrativeStance, "笃定、略高半级");
    assert.equal(template.hints.judgmentStrength, "high");
  });
});

test("merged active archetype rhythm hints prefer active template and still allow series overrides", async () => {
  await withTempDatabase("override", async () => {
    const db = getDatabase();
    await getActiveArchetypeRhythmTemplate("opinion");
    const now = "2026-04-21T12:00:00.000Z";
    await db.exec(
      `UPDATE archetype_rhythm_templates
       SET is_active = ?, updated_at = ?
       WHERE archetype_key = ?`,
      [false, now, "opinion"],
    );
    await db.exec(
      `INSERT INTO archetype_rhythm_templates (
        archetype_key, version, name, description, hints_json, is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "opinion",
        "v2",
        "opinion tuned rhythm",
        "Custom active rhythm for tests",
        JSON.stringify({
          narrativeStance: "先冷后热",
          energyCurve: "先压低，再把冲突逐层推高。",
          discoveryMode: "先交代代价，再回到判断。",
          offTopicTolerance: "med",
          closureMode: "最后落成一句可复述结论。",
          judgmentStrength: "med",
        }),
        true,
        null,
        now,
        now,
      ],
    );
    clearArchetypeRhythmTemplateCache();

    const merged = await getMergedActiveArchetypeRhythmHints({
      archetype: "opinion",
      override: {
        closureMode: "结尾补一个动作提醒。",
      },
    });

    assert.equal(merged.narrativeStance, "先冷后热");
    assert.equal(merged.energyCurve, "先压低，再把冲突逐层推高。");
    assert.equal(merged.discoveryMode, "先交代代价，再回到判断。");
    assert.equal(merged.offTopicTolerance, "med");
    assert.equal(merged.closureMode, "结尾补一个动作提醒。");
    assert.equal(merged.judgmentStrength, "med");
  });
});

test("listArchetypeRhythmTemplates returns seeded active templates for all five archetypes", async () => {
  await withTempDatabase("list", async () => {
    const templates = await listArchetypeRhythmTemplates();

    assert.equal(new Set(templates.map((item) => item.archetypeKey)).size, 5);
    assert.equal(templates.filter((item) => item.isActive).length, 5);
  });
});

test("createArchetypeRhythmTemplate can add and activate a new version", async () => {
  await withTempDatabase("create-activate", async () => {
    const created = await createArchetypeRhythmTemplate({
      archetypeKey: "howto",
      version: "v2",
      name: "howto tuned rhythm",
      description: "test",
      activate: true,
      hints: {
        narrativeStance: "先拉齐，再推进",
        energyCurve: "稳态推进，中段收紧动作。",
        discoveryMode: "先给路径，再补边界。",
        offTopicTolerance: "low",
        closureMode: "落成一条能执行的提醒。",
        judgmentStrength: "med",
      },
    });

    assert.equal(created.archetypeKey, "howto");
    assert.equal(created.version, "v2");
    assert.equal(created.isActive, true);

    const active = await getActiveArchetypeRhythmTemplate("howto");
    assert.equal(active.version, "v2");

    const templates = await listArchetypeRhythmTemplates();
    assert.equal(templates.filter((item) => item.archetypeKey === "howto" && item.isActive).length, 1);
  });
});

test("activateArchetypeRhythmTemplate switches active version within the same archetype", async () => {
  await withTempDatabase("activate-existing", async () => {
    await createArchetypeRhythmTemplate({
      archetypeKey: "case",
      version: "v2",
      name: "case tuned rhythm",
      activate: false,
      hints: {
        narrativeStance: "贴地推进",
        energyCurve: "先铺场景，再收转折。",
        discoveryMode: "边讲边露出结构变化。",
        offTopicTolerance: "med",
        closureMode: "停在动作上。",
        judgmentStrength: "med",
      },
    });

    const activated = await activateArchetypeRhythmTemplate({
      archetypeKey: "case",
      version: "v2",
    });

    assert.equal(activated.version, "v2");
    assert.equal(activated.isActive, true);

    const templates = await listArchetypeRhythmTemplates();
    assert.equal(templates.filter((item) => item.archetypeKey === "case" && item.isActive).length, 1);
  });
});
