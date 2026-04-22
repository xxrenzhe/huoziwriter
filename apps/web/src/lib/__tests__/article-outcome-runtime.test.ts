import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { saveArticleDraft } from "../article-draft";
import { recomputeAndPersistArticleOutcome } from "../article-outcome-runtime";
import { updateArticleStageArtifactPayload } from "../article-stage-artifacts";
import { createUser } from "../auth";
import { closeDatabase } from "../db";
import { createPersona } from "../personas";
import {
  createArticle,
  getArticleOutcome,
  replaceArticleEvidenceItems,
  upsertArticleOutcome,
  upsertArticleStrategyCard,
} from "../repositories";
import { createSeries } from "../series";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-article-outcome-runtime-${name}-`));
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

function getAttributionRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function createDefaultSeries(userId: number) {
  const persona = await createPersona({
    userId,
    name: "Plan17 Tester",
    identityTags: ["程序员"],
    writingStyleTags: ["社论评论"],
    isDefault: true,
  });
  return createSeries({
    userId,
    name: "Plan17 Test Series",
    personaId: persona.id,
    thesis: "先把判断链路理顺，再谈放大。",
    targetAudience: "正在用 AI 辅助写作的内容团队负责人",
    activeStatus: "active",
  });
}

test("recomputeAndPersistArticleOutcome refreshes strategy and evidence attribution without wiping review fields", async () => {
  await withTempDatabase("recompute", async () => {
    const user = await createUser({
      username: "plan17-runtime-user",
      password: "password123",
      mustChangePassword: false,
      planCode: "pro",
    });
    await createDefaultSeries(user.id);
    const article = await createArticle(user.id, "Plan17 runtime refresh");
    assert.ok(article);

    await saveArticleDraft({
      articleId: article.id,
      userId: user.id,
      body: {
        markdownContent: "很多人以为这只是常规更新，但真正的问题在于旧流程已经拖慢判断。",
        status: "ready",
      },
    });
    await upsertArticleStrategyCard({
      articleId: article.id,
      userId: user.id,
      archetype: "opinion",
      targetPackage: "高势能判断",
      mainstreamBelief: "增长主要靠加预算。",
      coreAssertion: "真正的效率差距来自判断链路，而不是投放规模。",
      whyNow: "组织开始把时间成本当成隐形预算。",
    });
    await replaceArticleEvidenceItems({
      articleId: article.id,
      userId: user.id,
      items: [
        {
          title: "凌晨 2 点的复盘消息",
          excerpt: "一个产品负责人凌晨两点还在群里说：我们不是没努力，是判断总慢半拍。",
          sourceType: "manual",
          hookTags: ["反常识", "情绪造句"],
          hookStrength: 5,
        },
      ],
    });
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: user.id,
      stageCode: "deepWriting",
      payloadPatch: {
        articlePrototype: "general",
        articlePrototypeLabel: "观点评论",
        stateVariantCode: "tension-first",
        stateVariantLabel: "张力先行",
      },
    });
    await upsertArticleOutcome({
      articleId: article.id,
      userId: user.id,
      hitStatus: "hit",
      reviewSummary: "人工复盘结论要保留",
      nextAction: "继续追踪",
      playbookTags: ["老标签"],
    });

    const refreshed = await recomputeAndPersistArticleOutcome({
      articleId: article.id,
      userId: user.id,
    });
    assert.ok(refreshed);

    const outcome = await getArticleOutcome(article.id, user.id);
    assert.ok(outcome);
    assert.equal(outcome.hitStatus, "hit");
    assert.equal(outcome.reviewSummary, "人工复盘结论要保留");
    assert.equal(outcome.nextAction, "继续追踪");
    assert.deepEqual(outcome.playbookTags, ["老标签"]);
    assert.equal(outcome.targetPackage, "高势能判断");

    const attribution = getAttributionRecord(outcome.attribution);
    const strategy = getAttributionRecord(attribution?.strategy);
    const evidence = getAttributionRecord(attribution?.evidence);
    const rhythm = getAttributionRecord(attribution?.rhythm);

    assert.equal(strategy?.archetype, "opinion");
    assert.equal(evidence?.hookTagCoverageCount, 2);
    assert.equal(evidence?.primaryHookComboLabel, "反常识 + 情绪造句");
    assert.equal(rhythm?.actualPrototypeCode, "general");
  });
});

test("saveArticleDraft auto-refreshes stored article outcome scorecard", async () => {
  await withTempDatabase("draft-save", async () => {
    const user = await createUser({
      username: "plan17-draft-user",
      password: "password123",
      mustChangePassword: false,
      planCode: "pro",
    });
    await createDefaultSeries(user.id);
    const article = await createArticle(user.id, "Draft outcome refresh");
    assert.ok(article);
    assert.equal(await getArticleOutcome(article.id, user.id), null);

    await saveArticleDraft({
      articleId: article.id,
      userId: user.id,
      body: {
        markdownContent: "这不是多做几轮就能解决的问题，而是判断顺序本身错了。\n\n先把冲突写出来，再谈动作。",
        status: "ready",
      },
    });

    const outcome = await getArticleOutcome(article.id, user.id);
    assert.ok(outcome);

    const scorecard = getAttributionRecord(outcome.scorecard);
    assert.equal(scorecard?.version, "v1");
    assert.equal(typeof scorecard?.qualityScore, "number");
    assert.equal(typeof scorecard?.predictedScore, "number");
    assert.equal(scorecard?.generatedAt != null, true);
  });
});
