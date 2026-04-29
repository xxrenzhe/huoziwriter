import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { attachFragmentToArticleNode, createArticleNode } from "../article-outline";
import { closeDatabase, getDatabase } from "../db";
import { planArticleVisualBriefs } from "../article-visual-planner";
import { createFragment } from "../repositories";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-visual-planner-${name}-`));
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

test("planArticleVisualBriefs uses viral rhythm slots for inline brief purposes", async () => {
  await withTempDatabase("viral-rhythm-slots", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "visual-planner@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    const articleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "团队写得更快之后，为什么还是发得更慢", "", "", "draft", null, null, now, now],
    );
    const articleId = Number(articleInsert.lastInsertRowid);

    const nodeInputs = [
      { title: "返工不是偶然", body: "同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。这个现场先承担可信度，不先上方法论。" },
      { title: "表面提速", body: "写作速度上来了，但组织对事实、判断和发布时间的要求没有同步前移。" },
      { title: "断点在后半程", body: "真正变慢的地方，在核查、判断和发布收口。这里最适合承担中段换气和结构比较。" },
      { title: "角色开始分化", body: "作者、编辑和发布同事感受到的压力并不一样，流程问题会在不同角色身上变形。" },
      { title: "最后留下的判断", body: "真正需要前移的是责任，而不是更多提示词。这一节适合承担后段强化和保存转发。" },
    ];

    for (const [index, nodeInput] of nodeInputs.entries()) {
      const node = await createArticleNode({
        articleId,
        title: nodeInput.title,
        description: nodeInput.body,
      });
      assert.ok(node?.id, `node ${index} should exist`);
      const fragment = await createFragment({
        userId: 1,
        sourceType: "manual",
        title: nodeInput.title,
        rawContent: nodeInput.body,
        distilledContent: nodeInput.body,
      });
      assert.ok(fragment?.id, `fragment ${index} should exist`);
      await attachFragmentToArticleNode({
        articleId,
        nodeId: node!.id,
        fragmentId: Number(fragment!.id),
        usageMode: "rewrite",
      });
    }

    const markdown = [
      "# 团队写得更快之后，为什么还是发得更慢",
      "文档越写越快，稿子却还是卡在发布前一晚。",
      "真正卡住流程的，不是写作速度，而是事实、判断和发布之间的断点。",
      "同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。",
      "写作速度解决了前半程的问题，但组织收口的责任仍然停在后半程。",
    ].join("\n\n") + "\n\n" + "补充段落。".repeat(700);

    const briefs = await planArticleVisualBriefs({
      userId: 1,
      articleId,
      title: "团队写得更快之后，为什么还是发得更慢",
      markdown,
      includeCover: false,
      includeInline: true,
    });

    assert.equal(briefs.length, 3);
    assert.deepEqual(briefs.slice(0, 2).map((brief) => brief.title), ["返工不是偶然", "断点在后半程"]);
    assert.match(briefs[0]!.purpose, /可信证据图/);
    assert.match(briefs[1]!.purpose, /信息密度上升处/);
    assert.match(briefs[2]!.purpose, /强化结论、代价或角色分化/);
  });
});
