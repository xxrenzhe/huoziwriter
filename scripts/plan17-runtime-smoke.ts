import { syncUserSubscription } from "../apps/web/src/lib/auth";
import { createArticle } from "../apps/web/src/lib/repositories";
import { createPersona, getPersonas } from "../apps/web/src/lib/personas";
import { getDatabase } from "../apps/web/src/lib/db";
import { getPlan17AcceptanceReport } from "../apps/web/src/lib/plan17-acceptance";
import { ensureExtendedProductSchema } from "../apps/web/src/lib/schema-bootstrap";
import { createSeries, getSeries } from "../apps/web/src/lib/series";
import { runStrategyAuditForArticle } from "../apps/web/src/lib/strategy-audit-runtime";
import { createTopicFissionSseResponse } from "../apps/web/src/lib/topic-fission-sse";
import { createTopicBacklog, createTopicBacklogItem, executeTopicBacklogGenerationJob, generateArticlesFromTopicBacklog } from "../apps/web/src/lib/topic-backlogs";
import { ensureUsageCounterSchema } from "../apps/web/src/lib/usage";

const SMOKE_PERSONA_NAME = "Plan17 Smoke Persona";
const SMOKE_SERIES_NAME = "Plan17 Smoke Series";
const SMOKE_TOPIC_TITLE = "Plan17 Smoke Topic Fission";
const SMOKE_BACKLOG_NAME = "Plan17 Smoke Backlog";
const STRATEGY_AUDIT_SAMPLE_COUNT = 120;
const DAILY_GENERATION_COUNTER_KEY = "daily_generation";

async function getPrimaryUserId() {
  const db = getDatabase();
  const user = await db.queryOne<{ id: number }>("SELECT id FROM users ORDER BY id ASC LIMIT 1");
  if (!user?.id) {
    throw new Error("当前数据库没有用户，无法执行 plan17 smoke");
  }
  return Number(user.id);
}

async function getLatestSubscriptionPlanCode(userId: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ plan_code: string | null }>(
    "SELECT plan_code FROM subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [userId],
  );
  if (row?.plan_code) {
    return String(row.plan_code);
  }
  const user = await db.queryOne<{ plan_code: string | null }>("SELECT plan_code FROM users WHERE id = ?", [userId]);
  return String(user?.plan_code || "free");
}

async function getDailyGenerationUsageValue(userId: number) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const row = await db.queryOne<{ value: number }>(
    "SELECT value FROM usage_counters WHERE user_id = ? AND counter_key = ? AND counter_date = ?",
    [userId, DAILY_GENERATION_COUNTER_KEY, new Date().toISOString().slice(0, 10)],
  );
  return Number(row?.value || 0);
}

async function setDailyGenerationUsageValue(userId: number, value: number) {
  await ensureUsageCounterSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const dateKey = now.slice(0, 10);
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM usage_counters WHERE user_id = ? AND counter_key = ? AND counter_date = ?",
    [userId, DAILY_GENERATION_COUNTER_KEY, dateKey],
  );
  if (existing?.id) {
    await db.exec("UPDATE usage_counters SET value = ?, updated_at = ? WHERE id = ?", [value, now, existing.id]);
    return;
  }
  await db.exec(
    `INSERT INTO usage_counters (user_id, counter_key, counter_date, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, DAILY_GENERATION_COUNTER_KEY, dateKey, value, now, now],
  );
}

async function ensureSmokePersona(userId: number) {
  const existing = (await getPersonas(userId)).find((item) => item.name === SMOKE_PERSONA_NAME);
  if (existing) {
    return existing;
  }
  return createPersona({
    userId,
    name: SMOKE_PERSONA_NAME,
    identityTags: ["AI 产品经理"],
    writingStyleTags: ["案例拆解"],
    summary: "用于 plan17 非功能验收 smoke 的最小人设",
    domainKeywords: ["AI", "工作流", "内容系统"],
    argumentPreferences: ["先给判断，再给证据"],
    toneConstraints: ["避免空话"],
    audienceHints: ["已有内容生产经验的操盘者"],
    isDefault: false,
  });
}

async function ensureSmokeSeries(userId: number, personaId: number) {
  const existing = (await getSeries(userId)).find((item) => item.name === SMOKE_SERIES_NAME);
  if (existing) {
    return existing;
  }
  return createSeries({
    userId,
    personaId,
    name: SMOKE_SERIES_NAME,
    thesis: "结构化写作系统应该把选题、策略和执行拆成可验证的三层。",
    targetAudience: "正在搭建内容生产流水线的创作者和产品团队",
    activeStatus: "active",
    defaultArchetype: "opinion",
    targetPackHint: "先翻判断，再给动作",
  });
}

async function upsertSmokeTopicRecommendation(input: {
  userId: number;
  personaId: number;
  personaName: string;
}) {
  const db = getDatabase();
  const now = new Date();
  const recommendationDate = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  await db.exec(
    "DELETE FROM topic_recommendations WHERE user_id = ? AND recommendation_date = ? AND topic_dedup_key = ?",
    [input.userId, recommendationDate, "plan17-smoke-topic-fission"],
  );
  const result = await db.exec(
    `INSERT INTO topic_recommendations (
      user_id, recommendation_date, rank_index, topic_dedup_key, source_topic_id, source_owner_user_id,
      source_name, source_type, source_priority, title, summary, emotion_labels_json, angle_options_json,
      source_url, related_source_names_json, related_source_urls_json, published_at, recommendation_type,
      recommendation_reason, matched_persona_id, matched_persona_name, freshness_score, relevance_score,
      priority_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      recommendationDate,
      1,
      "plan17-smoke-topic-fission",
      null,
      input.userId,
      "Plan17 Smoke Source",
      "news",
      100,
      SMOKE_TOPIC_TITLE,
      "用最小真实样本验证 topic fission 的时延和结构一致性。",
      JSON.stringify(["判断失效", "结构重排"]),
      JSON.stringify(["先拆旧流程为什么失效", "再写新判断如何落地"]),
      "https://example.com/plan17-smoke-topic",
      JSON.stringify(["Plan17 Smoke Source"]),
      JSON.stringify(["https://example.com/plan17-smoke-topic"]),
      nowIso,
      "hybrid",
      "这是用于验证 plan17 非功能验收链路的最小裂变样本。",
      input.personaId,
      input.personaName,
      88,
      91,
      95,
      nowIso,
      nowIso,
    ],
  );
  return Number(result.lastInsertRowid!);
}

async function consumeSse(response: Response) {
  if (!response.body) {
    throw new Error("topic fission SSE 缺少响应体");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += typeof value === "string" ? value : decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      const line = event.split("\n").find((item) => item.startsWith("data:"));
      if (!line) {
        continue;
      }
      const payload = JSON.parse(line.slice(5).trim()) as {
        status: string;
        result?: Record<string, unknown>;
        error?: string;
      };
      if (payload.status === "error") {
        throw new Error(payload.error || "topic fission SSE 失败");
      }
      if (payload.status === "done" && payload.result) {
        finalResult = payload.result;
      }
    }
  }

  if (!finalResult) {
    throw new Error("topic fission SSE 未返回最终结果");
  }
  return finalResult;
}

async function runSmoke() {
  await ensureExtendedProductSchema();
  const userId = await getPrimaryUserId();
  const persona = await ensureSmokePersona(userId);
  const series = await ensureSmokeSeries(userId, persona.id);

  const article = await createArticle(userId, `Plan17 Smoke Strategy Audit ${Date.now()}`, series.id);
  if (!article?.id) {
    throw new Error("创建 smoke 稿件失败");
  }
  for (let index = 0; index < STRATEGY_AUDIT_SAMPLE_COUNT; index += 1) {
    await runStrategyAuditForArticle({
      userId,
      articleId: Number(article.id),
      body: {
        archetype: "opinion",
        targetReader: `内容系统负责人样本 ${index + 1}`,
        coreAssertion: `第 ${index + 1} 次策略自检：先把选题、策略、执行拆开，再谈爆点。`,
        mainstreamBelief: "大家以为多堆功能就等于写作系统升级。",
        whyNow: "因为当前验收需要真实运行样本，而不是停留在方案文档。",
      },
    });
  }

  const topicId = await upsertSmokeTopicRecommendation({
    userId,
    personaId: persona.id,
    personaName: persona.name,
  });
  for (const mode of ["regularity", "contrast", "cross-domain"] as const) {
    const response = await createTopicFissionSseResponse({
      userId,
      topicId,
      mode,
      engine: "local",
    });
    await consumeSse(response);
  }

  const backlog = await createTopicBacklog({
    userId,
    name: `${SMOKE_BACKLOG_NAME} ${Date.now()}`,
    description: "用于 plan17 11.4 批量生成验收 smoke",
    seriesId: series.id,
  });
  const itemA = await createTopicBacklogItem({
    userId,
    backlogId: backlog.id,
    sourceType: "manual",
    theme: "Plan17 Smoke Batch Item A",
    archetype: "opinion",
    targetAudience: "内容系统负责人",
    readerSnapshotHint: "需要验证批量生成链路的成功样本",
    strategyDraft: {
      targetReader: "内容系统负责人",
      coreAssertion: "批量生成的观测必须来自真实任务执行。",
      whyNow: "当前需要让 11.4 从 blocked 进入 partial/passed。",
      mainstreamBelief: "大家以为埋点接上就等于验收完成。",
    },
    status: "ready",
  });
  const itemB = await createTopicBacklogItem({
    userId,
    backlogId: backlog.id,
    sourceType: "manual",
    theme: "Plan17 Smoke Batch Item B",
    archetype: "case",
    targetAudience: "内容系统负责人",
    readerSnapshotHint: "需要第二个条目证明同一批次成功运行",
    strategyDraft: {
      targetReader: "内容系统负责人",
      coreAssertion: "同一 batch 中至少两个条目成功，才能形成批量运行样本。",
      whyNow: "当前 acceptance 需要非零 batchCount。",
      mainstreamBelief: "大家以为只跑一个任务就够了。",
    },
    status: "ready",
  });
  const previousPlanCode = await getLatestSubscriptionPlanCode(userId);
  const previousGenerationUsage = await getDailyGenerationUsageValue(userId);
  try {
    await syncUserSubscription(userId, "free", true);
    await setDailyGenerationUsageValue(userId, 0);
    const generation = await generateArticlesFromTopicBacklog({
      userId,
      backlogId: backlog.id,
      itemIds: [itemA.id, itemB.id],
      seriesId: series.id,
      concurrency: 2,
    });
    await executeTopicBacklogGenerationJob({
      userId,
      backlogId: backlog.id,
      itemId: generation.jobs[0]?.itemId ?? itemA.id,
      seriesId: series.id,
      batchId: generation.batchId,
    });
    let secondJobFailed = false;
    try {
      await executeTopicBacklogGenerationJob({
        userId,
        backlogId: backlog.id,
        itemId: generation.jobs[1]?.itemId ?? itemB.id,
        seriesId: series.id,
        batchId: generation.batchId,
      });
    } catch {
      secondJobFailed = true;
    }
    if (!secondJobFailed) {
      throw new Error("batch isolation smoke 未能触发第二条任务失败");
    }
  } finally {
    await syncUserSubscription(userId, previousPlanCode, true);
    await setDailyGenerationUsageValue(userId, previousGenerationUsage);
  }

  const report = await getPlan17AcceptanceReport();
  const nonFunctional = report.sections.find((item) => item.key === "nonFunctional");
  console.log(JSON.stringify({
    userId,
    articleId: article.id,
    topicId,
    backlogId: backlog.id,
    nonFunctional,
  }, null, 2));
}

void runSmoke().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
