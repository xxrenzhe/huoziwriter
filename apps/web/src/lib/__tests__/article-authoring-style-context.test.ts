import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { getArticleAuthoringStyleContext } from "../article-authoring-style-context";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { ensureAutoWritingStyleProfile, getWritingStyleProfiles } from "../writing-style-profiles";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-authoring-style-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function seedUser(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO users (
      id, username, email, password_hash, display_name, role, plan_code, must_change_password, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      `authoring_style_user_${userId}`,
      null,
      null,
      null,
      "user",
      "ultra",
      0,
      1,
      now,
      now,
    ],
  );
}

async function seedDefaultPersona(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO personas (
      user_id, name, identity_tags_json, writing_style_tags_json, summary,
      domain_keywords_json, argument_preferences_json, tone_constraints_json,
      audience_hints_json, source_mode, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      "自动沉淀作者",
      JSON.stringify(["深度写作"]),
      JSON.stringify(["清晰", "克制"]),
      "默认作者人设",
      JSON.stringify(["AI", "副业"]),
      JSON.stringify(["先判断后论证"]),
      JSON.stringify(["避免空话"]),
      JSON.stringify(["公众号读者"]),
      "manual",
      true,
      now,
      now,
    ],
  );
}

function buildLongMarkdown(seed: string) {
  return Array.from({ length: 12 }, (_, index) =>
    `${seed} 第 ${index + 1} 段：先给判断，再给例子，再把行动建议落回真实场景。很多人会先盯着工具，但真正拉开差距的是判断顺序、表达节奏和证据密度。`,
  ).join("\n\n");
}

async function seedArticle(input: {
  userId: number;
  title: string;
  markdownContent: string;
  status?: string;
  createdAt: string;
  updatedAt?: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const updatedAt = input.updatedAt ?? input.createdAt;
  await db.exec(
    `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.title,
      input.markdownContent,
      null,
      input.status ?? "published",
      null,
      null,
      input.createdAt,
      updatedAt,
    ],
  );
}

test("ensureAutoWritingStyleProfile creates a multi-sample profile from recent long-form articles", async () => {
  await withTempDatabase("auto-create", async () => {
    const userId = 21;
    await seedUser(userId);
    await seedArticle({
      userId,
      title: "第一篇",
      markdownContent: buildLongMarkdown("第一篇"),
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "第二篇",
      markdownContent: buildLongMarkdown("第二篇"),
      createdAt: "2026-04-21T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "第三篇",
      markdownContent: buildLongMarkdown("第三篇"),
      createdAt: "2026-04-22T00:00:00.000Z",
    });

    const profile = await ensureAutoWritingStyleProfile(userId);
    const profiles = await getWritingStyleProfiles(userId);

    assert.ok(profile);
    assert.equal(profiles.length, 1);
    assert.equal(profile?.sampleCount, 3);
    assert.match(profile?.name ?? "", /自动沉淀文风/);
  });
});

test("getArticleAuthoringStyleContext auto-selects best available style profile when persona is unbound", async () => {
  await withTempDatabase("auto-select", async () => {
    const userId = 22;
    await seedUser(userId);
    await seedDefaultPersona(userId);
    await seedArticle({
      userId,
      title: "A",
      markdownContent: buildLongMarkdown("A"),
      createdAt: "2026-04-20T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "B",
      markdownContent: buildLongMarkdown("B"),
      createdAt: "2026-04-21T00:00:00.000Z",
    });
    await seedArticle({
      userId,
      title: "C",
      markdownContent: buildLongMarkdown("C"),
      createdAt: "2026-04-22T00:00:00.000Z",
    });

    const context = await getArticleAuthoringStyleContext(userId);

    assert.ok(context.writingStyleProfile);
    assert.equal(context.writingStyleProfile?.sampleCount, 3);
    assert.equal(context.writingStyleProfile?.bindingSource, "auto.bestAvailableWritingStyleProfile");
    assert.equal(context.persona?.boundWritingStyleProfileName, context.writingStyleProfile?.name);
  });
});
