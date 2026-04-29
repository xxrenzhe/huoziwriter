import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { attachFragmentToArticleNode, ensureDefaultArticleNodes, getArticleNodes } from "../article-outline";
import { getArticleWritingContext } from "../article-writing-context";
import { closeDatabase, getDatabase } from "../db";
import { createFragment } from "../repositories";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-writing-context-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("getArticleWritingContext carries source localization metadata into evidence fragments", async () => {
  await withTempDatabase("localized-source-meta", async () => {
    const db = getDatabase();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "writing-context@example.com", "test-hash", "admin", new Date().toISOString(), new Date().toISOString()],
    );
    await ensureExtendedProductSchema();

    const now = new Date().toISOString();
    const articleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "测试中文化信源进入写作上下文", "", "", "draft", null, null, now, now],
    );
    const articleId = Number(articleInsert.lastInsertRowid);
    await ensureDefaultArticleNodes(articleId);

    const fragment = await createFragment({
      userId: 1,
      sourceType: "url",
      title: "如何建立不受地域限制的职业收入系统",
      rawContent: "How to build a location-independent career...",
      distilledContent: "这篇材料强调，远程工作和自由职业的价值，不只是多赚一份钱，而是获得收入与地点的双重选择权。",
      sourceUrl: "https://example.com/remote-income",
      sourceMeta: {
        localization: {
          sourceLanguage: "en",
          localizationStatus: "localized",
          originalTitle: "How to build a location-independent career",
          factPointsZh: ["作者把路径拆成远程工作、自由职业和可复用数字资产三层。"],
          translationRisk: "原文以经验口吻为主，涉及收入效果时不能外推到所有人。",
        },
      },
    });
    assert.ok(fragment?.id);

    const nodes = await getArticleNodes(articleId);
    assert.ok(nodes[0]?.id);
    await attachFragmentToArticleNode({
      articleId,
      nodeId: nodes[0]!.id,
      fragmentId: Number(fragment!.id),
      usageMode: "rewrite",
    });

    const context = await getArticleWritingContext({
      userId: 1,
      articleId,
      title: "测试中文化信源进入写作上下文",
      markdownContent: "",
    });

    assert.equal(context.evidenceFragments.length > 0, true);
    const localized = context.evidenceFragments[0]?.sourceMeta?.localization as Record<string, unknown> | undefined;
    assert.equal(localized?.originalTitle, "How to build a location-independent career");
    assert.deepEqual(localized?.factPointsZh, ["作者把路径拆成远程工作、自由职业和可复用数字资产三层。"]);
  });
});

test("getArticleWritingContext fallback fragments prefer relevance over recency order", async () => {
  await withTempDatabase("fallback-retrieval-ranking", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "fallback-ranking@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    const articleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        "AI 写作 workflow 的判断成本",
        "这篇文章要讨论 AI 写作 workflow 里真正贵的不是生成速度，而是判断成本和取舍责任。",
        "",
        "draft",
        null,
        null,
        now,
        now,
      ],
    );
    const articleId = Number(articleInsert.lastInsertRowid);
    await ensureDefaultArticleNodes(articleId);

    await createFragment({
      userId: 1,
      sourceType: "url",
      title: "AI 写作 workflow 的判断成本",
      distilledContent: "AI 写作 workflow 的核心不是提效，而是把判断成本和责任前移给操作者。",
    });

    for (const index of Array.from({ length: 7 }, (_, value) => value + 1)) {
      await createFragment({
        userId: 1,
        sourceType: "url",
        title: `无关素材 ${index}`,
        distilledContent: `这是第 ${index} 条无关素材，讨论旅行装备、早餐选择和天气变化。`,
      });
    }

    const context = await getArticleWritingContext({
      userId: 1,
      articleId,
      title: "AI 写作 workflow 的判断成本",
      markdownContent: "这篇文章要讨论 AI 写作 workflow 里真正贵的不是生成速度，而是判断成本和取舍责任。",
    });

    assert.ok(context.fragments.some((fragment) => fragment.includes("判断成本和责任前移")));
    assert.ok(context.evidenceFragments.some((fragment) => fragment.title === "AI 写作 workflow 的判断成本"));
  });
});
