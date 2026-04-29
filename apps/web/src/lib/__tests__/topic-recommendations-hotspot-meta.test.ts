import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { getVisibleTopicRecommendationsForUser } from "../topic-recommendations";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-topic-recommendations-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousDatabaseUrl == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("topic recommendations preserve chinese hotspot source metadata and scoring", async () => {
  await withTempDatabase("hotspot-meta", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();

    await db.exec(
      `INSERT OR IGNORE INTO plans (
        code, name, price_cny, daily_generation_limit, fragment_limit, language_guard_rule_limit,
        max_wechat_connections, can_generate_cover_image, can_export_pdf, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["ultra", "Ultra", 0, null, null, null, null, true, true, now, now],
    );
    await db.exec(
      "INSERT INTO users (id, username, email, password_hash, role, plan_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [1, "hotspot-user", "hotspot-user@example.com", "test-hash", "admin", "ultra", now, now],
    );
    await db.exec(
      `INSERT INTO personas (
        user_id, name, identity_tags_json, writing_style_tags_json, source_mode, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "AI 产品经理", JSON.stringify(["AI 产品经理"]), JSON.stringify(["案例拆解"]), "manual", true, now, now],
    );
    await db.exec(
      `INSERT INTO topic_sources (owner_user_id, name, homepage_url, source_type, priority, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [null, "百度热点", "https://top.baidu.com/board?tab=realtime", "chinese-hotspot", 96, true, now, now],
    );
    await db.exec(
      `INSERT INTO topic_items (
        owner_user_id, source_name, title, summary, emotion_labels_json, angle_options_json,
        topic_verticals_json, source_meta_json, source_url, published_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        null,
        "百度热点",
        "AI 搜索投放突然升温",
        "AI 搜索产品开始改变广告投放和内容获客的入口。",
        JSON.stringify(["机会窗口", "判断更新"]),
        JSON.stringify(["从投放人的预算变化切入", "从搜索入口重排切入"]),
        JSON.stringify(["ai_products", "search_marketing"]),
        JSON.stringify({
          sourceKind: "chinese_hotspot",
          provider: "baidu",
          providerLabel: "百度热点",
          rank: 2,
          heatValue: 260000,
          capturedAt: now,
        }),
        "https://top.baidu.com/item/ai-search-ads",
        now,
        now,
      ],
    );

    const recommendations = await getVisibleTopicRecommendationsForUser(1);
    const recommendation = recommendations.find((item) => item.title === "AI 搜索投放突然升温");
    assert(recommendation);
    assert.equal(recommendation.sourceType, "chinese-hotspot");
    assert.equal(recommendation.sourceMeta?.provider, "baidu");
    assert.equal(typeof recommendation.sourceMeta?.hotspotScore, "object");
    assert.match(recommendation.recommendationReason, /热点信号/);

    const stored = await db.queryOne<{ source_meta_json: string; source_type: string }>(
      "SELECT source_meta_json, source_type FROM topic_recommendations WHERE title = ?",
      ["AI 搜索投放突然升温"],
    );
    const storedMeta = JSON.parse(stored?.source_meta_json || "{}") as Record<string, unknown>;
    assert.equal(stored?.source_type, "chinese-hotspot");
    assert.equal(storedMeta.provider, "baidu");
    assert.equal(typeof storedMeta.hotspotScore, "object");
  });
});
