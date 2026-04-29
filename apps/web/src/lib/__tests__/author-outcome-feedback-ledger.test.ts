import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPersonalEffectiveWritingProfile, computeAuthorOutcomeFeedbackLedger, getAuthorOutcomeFeedbackLedger, refreshAuthorOutcomeFeedbackLedger } from "../author-outcome-feedback-ledger";
import { getArticleWritingContext } from "../article-writing-context";
import { closeDatabase, getDatabase } from "../db";
import { upsertArticleOutcome, upsertArticleOutcomeSnapshot } from "../repositories";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-author-feedback-${name}-`));
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

async function seedArticle(input: {
  db: ReturnType<typeof getDatabase>;
  articleId: number;
  userId: number;
  title: string;
  status?: string;
  hitStatus: "pending" | "hit" | "near_miss" | "miss";
  expressionFeedback?: {
    likeMe?: boolean;
    unlikeMe?: boolean;
    tooHard?: boolean;
    tooSoft?: boolean;
    tooTutorial?: boolean;
    tooCommentary?: boolean;
  } | null;
  deepWritingPayload?: Record<string, unknown> | null;
  snapshot?: {
    windowCode: "24h" | "72h" | "7d";
    readCount: number;
    shareCount: number;
    likeCount: number;
    writingStateFeedback?: Record<string, unknown> | null;
  } | null;
}) {
  const now = new Date().toISOString();
  await input.db.exec(
    `INSERT INTO articles (id, user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.articleId, input.userId, input.title, "", "", input.status ?? "published", null, null, now, now],
  );
  if (input.deepWritingPayload) {
    await input.db.exec(
      `INSERT INTO article_stage_artifacts (
        article_id, stage_code, status, summary, payload_json, model, provider, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.articleId,
        "deepWriting",
        "ready",
        "deepWriting",
        JSON.stringify(input.deepWritingPayload),
        null,
        null,
        null,
        now,
        now,
      ],
    );
  }
  await upsertArticleOutcome({
    articleId: input.articleId,
    userId: input.userId,
    hitStatus: input.hitStatus,
    expressionFeedback: input.expressionFeedback
      ? {
          likeMe: Boolean(input.expressionFeedback.likeMe),
          unlikeMe: Boolean(input.expressionFeedback.unlikeMe),
          tooHard: Boolean(input.expressionFeedback.tooHard),
          tooSoft: Boolean(input.expressionFeedback.tooSoft),
          tooTutorial: Boolean(input.expressionFeedback.tooTutorial),
          tooCommentary: Boolean(input.expressionFeedback.tooCommentary),
        }
      : null,
    scorecard: {},
    attribution: null,
  });
  if (input.snapshot) {
    await upsertArticleOutcomeSnapshot({
      articleId: input.articleId,
      userId: input.userId,
      windowCode: input.snapshot.windowCode,
      readCount: input.snapshot.readCount,
      shareCount: input.snapshot.shareCount,
      likeCount: input.snapshot.likeCount,
      writingStateFeedback: input.snapshot.writingStateFeedback ?? null,
    });
  }
}

test("refreshAuthorOutcomeFeedbackLedger aggregates and persists author-level outcome signals", async () => {
  await withTempDatabase("aggregate-and-persist", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "ledger@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    await seedArticle({
      db,
      articleId: 101,
      userId: 1,
      title: "高命中文章",
      hitStatus: "hit",
      deepWritingPayload: {
        articlePrototype: "opinion",
        articlePrototypeLabel: "观点判断",
        stateVariantCode: "sharp_judgement",
        stateVariantLabel: "尖锐判断",
        creativeLensCode: "sharp_opinion",
        creativeLensLabel: "锐评判断镜头",
        openingPatternLabel: "冲突起手",
        sectionRhythm: "短段推进",
      },
      snapshot: {
        windowCode: "7d",
        readCount: 1200,
        shareCount: 5,
        likeCount: 23,
        writingStateFeedback: {
          adoptedPrototypeCode: "opinion",
          followedPrototypeRecommendation: true,
          adoptedVariantCode: "sharp_judgement",
          followedRecommendation: true,
          adoptedCreativeLensCode: "sharp_opinion",
          adoptedCreativeLensLabel: "锐评判断镜头",
          followedCreativeLensRecommendation: true,
          adoptedOpeningPatternLabel: "冲突起手",
          recommendedOpeningPatternLabel: "冲突起手",
        },
      },
    });

    await seedArticle({
      db,
      articleId: 102,
      userId: 1,
      title: "低命中文章",
      hitStatus: "miss",
      deepWritingPayload: {
        articlePrototype: "howto",
        articlePrototypeLabel: "教程拆解",
        stateVariantCode: "calm_explainer",
        stateVariantLabel: "平稳解释",
        creativeLensCode: "tool_operator",
        creativeLensLabel: "工具操盘镜头",
        openingPatternLabel: "背景铺垫",
        sectionRhythm: "平铺直叙",
      },
      snapshot: {
        windowCode: "72h",
        readCount: 90,
        shareCount: 0,
        likeCount: 1,
        writingStateFeedback: {
          adoptedPrototypeCode: "howto",
          followedPrototypeRecommendation: false,
          adoptedVariantCode: "calm_explainer",
          followedRecommendation: false,
          adoptedCreativeLensCode: "tool_operator",
          adoptedCreativeLensLabel: "工具操盘镜头",
          followedCreativeLensRecommendation: false,
          adoptedOpeningPatternLabel: "背景铺垫",
          recommendedOpeningPatternLabel: "冲突起手",
        },
      },
    });

    const computed = await computeAuthorOutcomeFeedbackLedger({ userId: 1 });
    assert.ok(computed);
    assert.equal(computed?.sampleCount, 2);
    assert.equal(computed?.positiveSampleCount, 1);
    assert.equal(computed?.recommendations.prototype?.key, "opinion");
    assert.equal(computed?.recommendations.stateVariant?.key, "sharp_judgement");
    assert.equal(computed?.recommendations.creativeLens?.key, "sharp_opinion");
    assert.equal(computed?.recommendations.openingPattern?.key, "冲突起手");
    assert.equal(computed?.recommendations.sectionRhythm?.key, "短段推进");
    assert.equal(computed?.expressionFeedbackSummary, null);

    const persisted = await refreshAuthorOutcomeFeedbackLedger({ userId: 1 });
    assert.equal(persisted?.recommendations.prototype?.key, "opinion");

    const loaded = await getAuthorOutcomeFeedbackLedger({ userId: 1 });
    assert.equal(loaded?.recommendations.prototype?.key, "opinion");
    assert.equal(loaded?.recommendations.creativeLens?.key, "sharp_opinion");
    assert.equal(loaded?.prototypeSignals[0]?.key, "opinion");
    assert.equal(loaded?.creativeLensSignals[0]?.key, "sharp_opinion");
    assert.equal(loaded?.expressionFeedbackSummary, null);
  });
});

test("computeAuthorOutcomeFeedbackLedger absorbs light expression feedback into recommendations", async () => {
  await withTempDatabase("expression-feedback-weights", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [9, "feedback-weights@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    await seedArticle({
      db,
      articleId: 201,
      userId: 9,
      title: "数据不错但不像我",
      hitStatus: "hit",
      expressionFeedback: {
        unlikeMe: true,
        tooTutorial: true,
      },
      deepWritingPayload: {
        articlePrototype: "howto",
        articlePrototypeLabel: "教程拆解",
        stateVariantCode: "soft_explainer",
        stateVariantLabel: "温和讲解",
        creativeLensCode: "tool_operator",
        creativeLensLabel: "工具操盘镜头",
        openingPatternLabel: "背景铺垫",
        openingStrategy: "先定义 AI 写作是什么，再拆三步方法。",
        sectionRhythm: "平铺展开",
        voiceChecklist: ["先讲概念，再给步骤", "语气温和但判断靠后"],
        viralGenomePack: {
          readerSceneAnchors: ["团队会议上逐条过需求"],
          openingMicroScenes: ["先从工具界面讲起"],
          emotionVectors: ["稳定解释"],
        },
      },
      snapshot: {
        windowCode: "7d",
        readCount: 1200,
        shareCount: 8,
        likeCount: 30,
      },
    });

    await seedArticle({
      db,
      articleId: 202,
      userId: 9,
      title: "数据略弱但更像作者",
      hitStatus: "near_miss",
      expressionFeedback: {
        likeMe: true,
      },
      deepWritingPayload: {
        articlePrototype: "opinion",
        articlePrototypeLabel: "观点判断",
        stateVariantCode: "sharp_judgement",
        stateVariantLabel: "尖锐判断",
        creativeLensCode: "field_observation",
        creativeLensLabel: "现场观察镜头",
        openingPatternLabel: "冲突起手",
        openingStrategy: "先抛出第七版标题还没拍板的现场，再落到判断成本。",
        sectionRhythm: "短段推进",
        voiceChecklist: ["先落判断，再补事实", "每段只推进一个判断"],
        viralGenomePack: {
          readerSceneAnchors: ["内容团队负责人盯着第七版标题"],
          openingMicroScenes: ["周三晚上还在改标题"],
          emotionVectors: ["烦躁但克制"],
          authorPosture: "站在内容负责人旁边拆判断成本",
        },
      },
      snapshot: {
        windowCode: "7d",
        readCount: 700,
        shareCount: 4,
        likeCount: 12,
      },
    });

    const ledger = await computeAuthorOutcomeFeedbackLedger({ userId: 9 });

    assert.ok(ledger);
    assert.equal(ledger?.recommendations.prototype?.label, "观点判断");
    assert.equal(ledger?.recommendations.stateVariant?.label, "尖锐判断");
    assert.equal(ledger?.recommendations.creativeLens?.label, "现场观察镜头");
    assert.equal(ledger?.recommendations.openingPattern?.label, "冲突起手");
    assert.equal(ledger?.recommendations.sectionRhythm?.label, "短段推进");
    assert.equal(ledger?.expressionFeedbackSummary?.feedbackSampleCount, 2);
    assert.equal(ledger?.expressionFeedbackSummary?.likeMeCount, 1);
    assert.equal(ledger?.expressionFeedbackSummary?.unlikeMeCount, 1);
    assert.equal(ledger?.expressionFeedbackSummary?.tooTutorialCount, 1);
    assert.ok(ledger?.expressionExemplarProfile?.positiveExamples.some((item) => item.text.includes("第七版标题还没拍板")));
    assert.ok(ledger?.expressionExemplarProfile?.positiveExamples.some((item) => item.text.includes("先落判断")));
    assert.ok(ledger?.expressionExemplarProfile?.negativeExamples.some((item) => item.text.includes("先定义 AI 写作")));
    assert.ok(ledger?.expressionExemplarProfile?.negativeExamples.some((item) => item.text.includes("先讲概念")));
  });
});

test("getArticleWritingContext exposes ledger while excluding the current article", async () => {
  await withTempDatabase("context-excludes-current", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "context-ledger@example.com", "test-hash", "admin", now, now],
    );
    await ensureExtendedProductSchema();

    await seedArticle({
      db,
      articleId: 201,
      userId: 1,
      title: "当前稿件",
      status: "draft",
      hitStatus: "pending",
      deepWritingPayload: {
        articlePrototype: "case",
        articlePrototypeLabel: "案例推进",
        stateVariantCode: "steady_case",
        stateVariantLabel: "案例平推",
        creativeLensCode: "case_dissection",
        creativeLensLabel: "案例拆解镜头",
        openingPatternLabel: "案例起手",
        sectionRhythm: "双段推进",
      },
      snapshot: null,
    });

    await seedArticle({
      db,
      articleId: 202,
      userId: 1,
      title: "历史高命中",
      hitStatus: "hit",
      deepWritingPayload: {
        articlePrototype: "opinion",
        articlePrototypeLabel: "观点判断",
        stateVariantCode: "sharp_judgement",
        stateVariantLabel: "尖锐判断",
        creativeLensCode: "sharp_opinion",
        creativeLensLabel: "锐评判断镜头",
        openingPatternLabel: "冲突起手",
        sectionRhythm: "短段推进",
      },
      snapshot: {
        windowCode: "7d",
        readCount: 900,
        shareCount: 4,
        likeCount: 18,
        writingStateFeedback: {
          adoptedPrototypeCode: "opinion",
          followedPrototypeRecommendation: true,
          adoptedVariantCode: "sharp_judgement",
          followedRecommendation: true,
          adoptedCreativeLensCode: "sharp_opinion",
          adoptedCreativeLensLabel: "锐评判断镜头",
          followedCreativeLensRecommendation: true,
          adoptedOpeningPatternLabel: "冲突起手",
          recommendedOpeningPatternLabel: "冲突起手",
        },
      },
    });

    const context = await getArticleWritingContext({
      userId: 1,
      articleId: 201,
      title: "当前稿件",
      markdownContent: "",
    });

    assert.equal(context.authorOutcomeFeedbackLedger?.recommendations.prototype?.key, "opinion");
    assert.equal(context.authorOutcomeFeedbackLedger?.sampleCount, 1);
  });
});

test("buildPersonalEffectiveWritingProfile converts recommendations into explicit user-facing guidance", () => {
  const profile = buildPersonalEffectiveWritingProfile({
    sampleCount: 5,
    positiveSampleCount: 3,
    recommendations: {
      prototype: {
        key: "opinion",
        label: "观点判断",
        sampleCount: 3,
        positiveSampleCount: 2,
        rankingAdjustment: -6,
        reason: "历史表现更稳。",
      },
      stateVariant: {
        key: "sharp_judgement",
        label: "尖锐判断",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "判断更稳。",
      },
      creativeLens: {
        key: "sharp_opinion",
        label: "锐评判断镜头",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "镜头更稳。",
      },
      openingPattern: {
        key: "冲突起手",
        label: "冲突起手",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "开头更稳。",
      },
      sectionRhythm: {
        key: "短段推进",
        label: "短段推进",
        sampleCount: 2,
        positiveSampleCount: 1,
        rankingAdjustment: -4,
        reason: "节奏更稳。",
      },
    },
    updatedAt: new Date().toISOString(),
  });

  assert.ok(profile);
  assert.match(profile?.summary ?? "", /当前已累计 5 篇结果样本/);
  assert.match(profile?.opening?.summary ?? "", /更适合用「冲突起手」起手/);
  assert.match(profile?.judgement?.summary ?? "", /判断更可信/);
  assert.equal(profile?.rhythm?.confidence, "medium");
  assert.equal(profile?.prototype?.label, "观点判断");
});
