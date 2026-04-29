import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { attachFragmentToArticleNode, createArticleNode } from "../article-outline";
import { updateArticleStageArtifactPayload } from "../article-stage-artifacts";
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

test("planArticleVisualBriefs prefers outline cover intent signals for cover briefs", async () => {
  await withTempDatabase("cover-intent-signals", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "cover-intent@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    const articleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "AI 写作发布变慢，你真正该先查哪 3 个地方？", "", "", "draft", null, null, now, now],
    );
    const articleId = Number(articleInsert.lastInsertRowid);

    await updateArticleStageArtifactPayload({
      articleId,
      userId: 1,
      stageCode: "outlinePlanning",
      payloadPatch: {
        workingTitle: "AI 写作发布变慢，你真正该先查哪 3 个地方？",
        centralThesis: "真正拖慢发布的不是模型，而是图片、素材和微信接口被挤在一条路上。",
        openingHook: "如果你等了半小时才看到公众号草稿，真正的问题通常不是模型。",
        targetEmotion: "紧迫但克制",
        coverPromise: "先别怪模型，真正拖慢发布的是后半程链路。",
        coverSceneSeed: "开场方式：误判代价先抛；半小时还没进草稿箱的等待感。",
        coverVisualAngle: "把发布慢拆成图片、素材和微信接口三段，而不是泛谈效率。",
        coverTargetEmotion: "紧迫但克制",
        selection: {
          selectedOpeningHook: "如果你等了半小时才看到公众号草稿，真正的问题通常不是模型。",
          selectedTargetEmotion: "紧迫但克制",
        },
      },
    });

    const briefs = await planArticleVisualBriefs({
      userId: 1,
      articleId,
      title: "AI 写作发布变慢，你真正该先查哪 3 个地方？",
      markdown: "正文先讲等待感，再拆发布链路。",
      includeCover: true,
      includeInline: false,
    });

    assert.equal(briefs.length, 1);
    assert.equal(briefs[0]?.visualScope, "cover");
    assert.equal(briefs[0]?.coverHook, "先别怪模型，真正拖慢发布的是后半程链路。");
    assert.equal(briefs[0]?.visualAngle, "把发布慢拆成图片、素材和微信接口三段，而不是泛谈效率。");
    assert.equal(briefs[0]?.targetEmotionHint, "紧迫但克制");
    assert.match(String(briefs[0]?.promptText || ""), /封面优先兑现的点击钩子：先别怪模型/);
    assert.match(String(briefs[0]?.promptText || ""), /封面应传达的主题角度：把发布慢拆成图片、素材和微信接口三段/);
  });
});

test("planArticleVisualBriefs gives power-shift cover and inline briefs capital-battle purposes", async () => {
  await withTempDatabase("power-shift-visual-purpose", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "power-shift-visual@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    const articleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI", "", "", "draft", null, null, now, now],
    );
    const articleId = Number(articleInsert.lastInsertRowid);

    const nodeInputs = [
      { title: "胜负先看数字", body: "Anthropic 300 亿美元，OpenAI 240 亿美元，数字已经先把胜负摆到了台面上。" },
      { title: "输家的伤口，已经从外部打到内部", body: "CFO 对账单担忧，CEO 继续扩张，董事会和投资者开始看这条路还跑不跑得通。" },
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

    const briefs = await planArticleVisualBriefs({
      userId: 1,
      articleId,
      title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
      markdown: [
        "# 刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
        "刚刚，Anthropic 年化营收冲到 300 亿美元，正式压过 OpenAI 的 240 亿。",
        "CFO、CEO 与董事会围绕算力账单和扩张路线出现裂痕。",
      ].join("\n\n"),
      includeCover: true,
      includeInline: true,
    });

    assert.equal(briefs[0]?.visualScope, "cover");
    assert.match(briefs[0]?.purpose ?? "", /王座更替\/资本战点击心智/);
    assert(briefs.some((brief) => brief.visualScope === "infographic" && /胜负数字|成本差|时间差|看板式信息图/.test(brief.purpose)));
    assert(briefs.some((brief) => brief.visualScope === "comic" && /路线分歧|组织裂痕|资本压力/.test(brief.purpose)));
  });
});

test("planArticleVisualBriefs prefers explicit deep-writing viral mode over softened title copy", async () => {
  await withTempDatabase("power-shift-explicit-mode", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "power-shift-explicit@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    const articleInsert = await db.exec(
      `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "AI 公司下半场怎么走", "", "", "draft", null, null, now, now],
    );
    const articleId = Number(articleInsert.lastInsertRowid);

    const node = await createArticleNode({
      articleId,
      title: "胜负先看数字",
      description: "真正关键的是谁拿走营收，谁开始扛成本压力。",
    });
    assert.ok(node?.id);
    const fragment = await createFragment({
      userId: 1,
      sourceType: "manual",
      title: "胜负先看数字",
      rawContent: "真正关键的是谁拿走营收，谁开始扛成本压力。",
      distilledContent: "真正关键的是谁拿走营收，谁开始扛成本压力。",
    });
    assert.ok(fragment?.id);
    await attachFragmentToArticleNode({
      articleId,
      nodeId: node!.id,
      fragmentId: Number(fragment!.id),
      usageMode: "rewrite",
    });

    await updateArticleStageArtifactPayload({
      articleId,
      userId: 1,
      stageCode: "deepWriting",
      payloadPatch: {
        centralThesis: "表面是路线讨论，实质是营收、成本和权力重排。",
        viralGenomePack: {
          mode: "power_shift_breaking",
          firstScreenPromise: "先看谁赢了、谁先扛不住。",
          businessQuestions: ["钱从哪里来", "为什么这个变化是现在"],
        },
      },
    });

    const briefs = await planArticleVisualBriefs({
      userId: 1,
      articleId,
      title: "AI 公司下半场怎么走",
      markdown: "这篇文章表面很克制，但上游已经明确它属于王座更替和资本战题型。",
      includeCover: true,
      includeInline: true,
    });

    assert.equal(briefs[0]?.viralMode, "power_shift_breaking");
    assert.match(briefs[0]?.purpose ?? "", /王座更替\/资本战点击心智/);
    assert(briefs.some((brief) => brief.viralMode === "power_shift_breaking" && brief.visualScope === "infographic"));
  });
});
