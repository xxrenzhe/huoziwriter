import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { suggestArticleHistoryReferences } from "../article-history-references";
import { closeDatabase, getDatabase } from "../db";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-history-references-${name}-`));
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

test("suggestArticleHistoryReferences prefers relevant published history", async () => {
  await withTempDatabase("ranking", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "history-ranking@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    const currentArticleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        "AI 写作 workflow 的判断成本",
        "这篇文章讨论 AI 写作 workflow 中谁负责判断、何时回收人工审稿权。",
        "",
        "draft",
        null,
        null,
        now,
        now,
      ],
    );
    const currentArticleId = Number(currentArticleInsert.lastInsertRowid);

    await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        "周末徒步装备清单",
        "这篇文章讨论帐篷、背包、睡袋和周末轻徒步路线。",
        "",
        "published",
        null,
        null,
        now,
        now,
      ],
    );

    const relevantInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1,
        "AI 写作 workflow 里的责任回收点",
        "AI 写作 workflow 不只是提效，而是把判断责任前移；团队要明确什么节点收回人工判断权。",
        "",
        "published",
        null,
        null,
        now,
        now,
      ],
    );

    const suggestions = await suggestArticleHistoryReferences({
      userId: 1,
      articleId: currentArticleId,
      currentTitle: "AI 写作 workflow 的判断成本",
      currentMarkdown: "这篇文章讨论 AI 写作 workflow 中谁负责判断、何时回收人工审稿权。",
    });

    assert.equal(suggestions.length > 0, true);
    assert.equal(suggestions[0]?.referencedArticleId, Number(relevantInsert.lastInsertRowid));
    assert.match(suggestions[0]?.relationReason ?? "", /语义相近|主题重叠/);
  });
});
