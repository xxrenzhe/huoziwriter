#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { updateArticleStageArtifactPayload } from "../apps/web/src/lib/article-stage-artifacts";
import { buildFourPointAudit } from "../apps/web/src/lib/article-strategy";
import { upsertArticleVisualBrief } from "../apps/web/src/lib/article-visual-repository";
import { findUserByUsername } from "../apps/web/src/lib/auth";
import { getDatabase } from "../apps/web/src/lib/db";
import { createPersona, getDefaultPersona } from "../apps/web/src/lib/personas";
import { createArticle, createFragment, ensureBootstrapData, replaceArticleEvidenceItems, saveArticle, upsertArticleStrategyCard } from "../apps/web/src/lib/repositories";
import { jpegThumbBuffer } from "../apps/web/src/lib/security";
import { createSeries, getDefaultSeries, getSeries } from "../apps/web/src/lib/series";
import { ensureWechatEnvConnectionForUser } from "../apps/web/src/lib/wechat-env-connection";
import { WechatPublishError, publishArticleToWechat } from "../apps/web/src/lib/wechat-publish";
import { evaluatePublishGuard } from "../apps/web/src/lib/publish-guard";
import { runPendingMigrations } from "./db-flow";

const SMOKE_IMAGE_URL = `data:image/jpeg;base64,${jpegThumbBuffer().toString("base64")}`;

function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function readOption(name: string) {
  const inline = process.argv.find((item) => item.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1).trim();
  }
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      return String(process.argv[index + 1]).trim();
    }
  }
  return "";
}

function nowIso() {
  return new Date().toISOString();
}

function buildSmokeTitle(dateLabel: string) {
  return `AI 写作发布变慢，你真正该先查哪 3 个地方？`;
}

function buildSmokeOpening() {
  return "如果你等了半小时才看到公众号草稿，真正的问题通常不是模型，而是图片、素材和微信接口挤在了一条路上。";
}

function buildSmokeMarkdown() {
  const opening = buildSmokeOpening();
  return [
    opening,
    "我上周盯过一次后台日志，最卡的不是正文生成，而是封面重做、文中图排队、微信接口失败后又从头准备素材。那一刻很别扭：用户以为是在等文章，其实是在等一堆本来可以提前准备的发布零件。",
    "这件事可以先拆成三个动作。第一，研究和证据要在写作前收口，别等终稿后再补来源。第二，图片要有资产复用和失败兜底，不能每次发布都重新抽签。第三，微信草稿发布必须有幂等键和可读错误码，否则一次白名单错误就会把人拖回猜谜。",
    "有两个反例也要留住。短消息、灵感札记没必要上完整链路；临时热点如果只追速度，也不能把所有配图都设成强依赖。真正要优化的是长文生产线，不是把每篇内容都塞进同一个重流程。",
    "所以这次冒烟验证只看一件事：一篇已经具备标题、开头、证据、封面和阶段产物的稿件，能不能稳定走完微信草稿箱发布。可以先把真实发布链路跑通，再去扩自动生成的质量上限。",
  ].join("\n\n");
}

async function ensureSmokeSeries(userId: number) {
  const defaultSeries = await getDefaultSeries(userId);
  if (defaultSeries) {
    return defaultSeries;
  }
  const series = await getSeries(userId);
  if (series[0]) {
    return series[0];
  }
  const defaultPersona = await getDefaultPersona(userId);
  const persona = defaultPersona ?? await createPersona({
    userId,
    name: "微信发布冒烟默认人设",
    identityTags: ["公众号作者"],
    writingStyleTags: ["实操记录"],
    summary: "用于真实微信发布冒烟验收的人设",
    domainKeywords: ["AI", "公众号", "自动化发布"],
    argumentPreferences: ["先抛问题再拆路径"],
    toneConstraints: ["具体", "克制"],
    audienceHints: ["公众号运营者", "自动化工具使用者"],
    sourceMode: "manual",
    isDefault: true,
  });
  return createSeries({
    userId,
    name: "微信发布冒烟默认系列",
    personaId: persona.id,
    thesis: "验证自动化文章能够稳定进入微信公众号草稿箱。",
    targetAudience: "需要稳定发布公众号文章的内容团队",
  });
}

async function insertSmokeCover(input: {
  userId: number;
  articleId: number;
  title: string;
}) {
  const db = getDatabase();
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM cover_images WHERE user_id = ? AND article_id = ? ORDER BY id DESC LIMIT 1",
    [input.userId, input.articleId],
  );
  if (existing) {
    return existing.id;
  }
  const createdAt = nowIso();
  const result = await db.exec(
    "INSERT INTO cover_images (user_id, article_id, prompt, image_url, created_at) VALUES (?, ?, ?, ?, ?)",
    [input.userId, input.articleId, `微信真实发布冒烟封面：${input.title}`, SMOKE_IMAGE_URL, createdAt],
  );
  return Number(result.lastInsertRowid || 0);
}

async function attachSmokeMaterial(input: {
  userId: number;
  articleId: number;
}) {
  const db = getDatabase();
  const nodes = await db.query<{ id: number }>(
    "SELECT id FROM article_nodes WHERE article_id = ? ORDER BY sort_order ASC, id ASC LIMIT 3",
    [input.articleId],
  );
  const nodeId = nodes[0]?.id;
  if (!nodeId) {
    return;
  }
  const fragments = await Promise.all([
    createFragment({
      userId: input.userId,
      sourceType: "official",
      title: "微信草稿接口",
      rawContent: "微信草稿箱同步需要图文草稿接口与素材上传链路配合。",
      distilledContent: "微信草稿箱同步不是单次正文提交，还依赖封面、正文图片、access token 和图文草稿接口。",
      sourceUrl: "https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html",
    }),
    createFragment({
      userId: input.userId,
      sourceType: "screenshot",
      title: "发布链路日志截图",
      rawContent: "一次真实发布卡在封面和素材上传等待。",
      distilledContent: "系统日志显示，正文生成完成后，发布仍可能被封面准备、正文图片和微信素材上传拖慢。",
      screenshotPath: "/tmp/huoziwriter-wechat-smoke-log.png",
    }),
    createFragment({
      userId: input.userId,
      sourceType: "manual",
      title: "短内容轻链路反例",
      rawContent: "短消息和灵感札记不需要完整长文发布链路。",
      distilledContent: "短内容应允许轻链路，不能为了完整性牺牲所有场景的速度。",
    }),
  ]);
  const now = nowIso();
  for (const fragment of fragments) {
    const fragmentId = Number((fragment as { id?: number } | null)?.id || 0);
    if (!fragmentId) {
      continue;
    }
    const existing = await db.queryOne<{ id: number }>(
      "SELECT id FROM article_fragment_refs WHERE article_node_id = ? AND fragment_id = ?",
      [nodeId, fragmentId],
    );
    if (!existing) {
      await db.exec(
        "INSERT INTO article_fragment_refs (article_id, article_node_id, fragment_id, usage_mode, created_at) VALUES (?, ?, ?, ?, ?)",
        [input.articleId, nodeId, fragmentId, "evidence", now],
      );
    }
  }
}

async function insertSmokeVisualAsset(input: {
  userId: number;
  articleId: number;
  briefId: number;
}) {
  const db = getDatabase();
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM asset_files
     WHERE user_id = ? AND article_id = ? AND asset_scope = ? AND visual_brief_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [input.userId, input.articleId, "visual_brief", input.briefId],
  );
  if (existing) {
    return existing.id;
  }
  const createdAt = nowIso();
  const manifest = {
    promptHash: "wechat-real-publish-smoke",
    baoyu: {
      skill: "baoyu-article-illustrator",
      source: "local-smoke",
    },
    original: {
      publicUrl: SMOKE_IMAGE_URL,
      contentType: "image/jpeg",
      width: 1,
      height: 1,
    },
    compressed: {
      publicUrl: SMOKE_IMAGE_URL,
      contentType: "image/jpeg",
      width: 1,
      height: 1,
    },
  };
  const result = await db.exec(
    `INSERT INTO asset_files (
      user_id, article_id, asset_scope, asset_type, source_record_id, batch_token, variant_label,
      storage_provider, public_url, visual_brief_id, insert_anchor, alt_text, caption, mime_type,
      byte_length, status, manifest_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.articleId,
      "visual_brief",
      "inline_image",
      input.briefId,
      `wechat-smoke-${input.articleId}`,
      "冒烟占位图",
      "data-url",
      SMOKE_IMAGE_URL,
      input.briefId,
      "这件事可以先拆成三个动作",
      "微信草稿发布链路三段式检查图",
      "发布链路三段式检查",
      "image/jpeg",
      jpegThumbBuffer().byteLength,
      "ready",
      JSON.stringify(manifest),
      createdAt,
      createdAt,
    ],
  );
  return Number(result.lastInsertRowid || 0);
}

async function seedSmokeArticle(input: {
  userId: number;
  title: string;
}) {
  const series = await ensureSmokeSeries(input.userId);
  const created = await createArticle(input.userId, input.title, series.id);
  if (!created) {
    throw new Error("创建冒烟稿件失败");
  }
  const article = await saveArticle({
    articleId: created.id,
    userId: input.userId,
    title: input.title,
    markdownContent: buildSmokeMarkdown(),
    status: "draft",
  });
  if (!article) {
    throw new Error("保存冒烟稿件失败");
  }

  const opening = buildSmokeOpening();
  const auditAt = nowIso();
  const strategyCard = {
    archetype: "howto" as const,
    mainstreamBelief: "很多团队以为发布慢就是模型生成慢。",
    targetReader: "正在把公众号生产线自动化、又被发布速度和草稿箱失败卡住的内容团队",
    coreAssertion: "真正该先查研究收口、图片准备和微信发布幂等这 3 个地方。",
    whyNow: "自动写作开始进入真实发布环节，慢和不稳定会直接变成用户不信任。",
    researchHypothesis: "发布链路稳定性主要受证据、图片和微信接口边界影响。",
    marketPositionInsight: "能稳定进草稿箱的系统，比只会生成正文的系统更接近可用产品。",
    historicalTurningPoint: "从只看生成效果，转向看完整发布闭环。",
    targetPackage: "一套能当天排查发布慢问题的三段式检查框架",
    publishWindow: "上线前真实冒烟验收阶段",
    endingAction: "先跑真实微信草稿冒烟，再扩大完整自动生成验收范围。",
    firstHandObservation: "我上周在后台看到一次发布卡住，正文早就好了，队列还在等封面和微信素材上传。",
    feltMoment: "那一刻我心里很别扭，因为用户看到的是等待，系统记录里却是几个小步骤在反复重试。",
    whyThisHitMe: "这事打到我，是因为它说明自动写作真正的短板不在会不会写，而在能不能稳定交付。",
    realSceneOrDialogue: "复盘会上有人问：为什么文章已经生成了，公众号草稿箱里还是没有？",
    wantToComplain: "最想吐槽的是，很多链路把失败都写成发布失败，完全不给人判断下一步该查哪里。",
    nonDelegableTruth: "我更愿意先承认链路慢，再把每个慢点拆出来，而不是用更花的文案遮住工程问题。",
  };
  await upsertArticleStrategyCard({
    articleId: article.id,
    userId: input.userId,
    ...strategyCard,
    fourPointAudit: buildFourPointAudit(strategyCard),
    strategyLockedAt: auditAt,
    strategyOverride: false,
  });

  await replaceArticleEvidenceItems({
    articleId: article.id,
    userId: input.userId,
    items: [
      {
        title: "微信草稿发布需要上传封面和正文素材",
        excerpt: "公众号草稿接口依赖素材上传和图文内容提交，封面、正文图片和 token 都会影响最终发布结果。",
        sourceType: "official",
        sourceUrl: "https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html",
        researchTag: "official",
        hookTags: ["risk", "specific"],
        hookStrength: 4,
      },
      {
        title: "真实发布慢通常来自多步骤串行",
        excerpt: "研究、配图、渲染、素材上传和草稿提交任何一段失败，都会放大用户感知到的等待时间。",
        sourceType: "system_log",
        screenshotPath: "/tmp/huoziwriter-wechat-smoke-log.png",
        researchTag: "timeline",
        hookTags: ["scene", "cost"],
        hookStrength: 4,
      },
      {
        title: "短内容不适合强行走完整长文链路",
        excerpt: "并不是所有文章都需要完整证据、图片和发布修复链路，短内容应允许更轻的路径。",
        sourceType: "manual",
        researchTag: "contradiction",
        evidenceRole: "counterEvidence",
        hookTags: ["counterexample", "boundary"],
        hookStrength: 3,
      },
    ],
  });
  await attachSmokeMaterial({
    userId: input.userId,
    articleId: article.id,
  });

  const referenceFusion = {
    mode: "inspiration",
    sourceUrls: [],
    avoidanceList: ["不复述来源文章", "不借用来源结构", "不把用户操作写成文章主题"],
    differentiationStrategy: "把真实发布链路冒烟作为作者视角，只写工程可用性和排查顺序。",
  };
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: "researchBrief",
    payloadPatch: {
      summary: "真实发布冒烟稿的研究底座已准备。",
      sourceCoverage: {
        official: ["微信草稿接口文档"],
        industry: ["自动化发布链路复盘"],
        comparison: ["完整长文链路与短内容轻链路对比"],
        userVoice: ["草稿箱迟迟不同步的用户反馈"],
        timeline: ["正文生成、图片准备、素材上传、草稿提交"],
        sufficiency: "ready",
        missingCategories: [],
      },
      timelineCards: [
        { title: "正文生成完成", summary: "内容先完成，但发布零件仍可能排队。" },
        { title: "图片与素材准备", summary: "封面和正文图决定微信上传前置耗时。" },
        { title: "草稿提交", summary: "微信接口错误需要可分类、可重试、可定位。" },
      ],
      comparisonCards: [
        { title: "完整长文链路 vs 短内容轻链路", summary: "前者重稳定，后者重速度，不能混成一条路。" },
      ],
      intersectionInsights: [
        { title: "发布速度不是单点性能", summary: "它由研究、图片、渲染、上传和错误恢复共同决定。" },
      ],
      referenceFusion,
    },
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: "outlinePlanning",
    payloadPatch: {
      summary: "标题、开头和结构已锁定。",
      workingTitle: input.title,
      selectedTitle: input.title,
      titleOptions: [
        {
          title: input.title,
          styleLabel: "读者问题",
          angle: "从慢发布切入排查顺序",
          reason: "具体、有问题、有读者视角。",
          riskHint: "",
          openRateScore: 42,
          elementsHit: { specific: true, curiosityGap: true, readerView: true },
          forbiddenHits: [],
          isRecommended: true,
          recommendReason: "三要素命中完整。",
        },
      ],
      openingHook: opening,
      selectedOpeningHook: opening,
      openingOptions: [
        {
          opening,
          patternCode: "misjudgment_cost",
          patternLabel: "误判代价先抛",
          qualityCeiling: "A",
          hookScore: 82,
          recommendReason: "直接指出误判和代价。",
          diagnose: {
            abstractLevel: "pass",
            paddingLevel: "pass",
            hookDensity: "pass",
            informationFrontLoading: "pass",
          },
          forbiddenHits: [],
          isRecommended: true,
        },
      ],
      selection: {
        selectedTitle: input.title,
        selectedOpeningHook: opening,
      },
      titleAuditedAt: auditAt,
      openingAuditedAt: auditAt,
      outlineUpdatedAt: auditAt,
      materialGapHints: [],
      referenceFusion,
    },
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: "deepWriting",
    payloadPatch: {
      summary: "深度写作执行卡已准备。",
      articlePrototype: "methodology",
      articlePrototypeLabel: "方法拆解",
      stateVariantLabel: "现场复盘",
      stateChecklist: ["先给读者一个等待场景", "每段只解释一个慢点", "结尾回到可执行动作"],
      openingMove: "先别急着怪模型，先把发布慢拆成研究、图片、微信接口三段。",
      sectionRhythm: "按原理、动作、边界推进，每段都落到可执行排查动作。",
      evidenceMode: "用官方接口、系统日志和反例边界组织证据。",
      mustUseFacts: ["微信草稿发布依赖素材上传", "封面和正文图会影响发布耗时", "短内容应允许轻链路"],
      sectionBlueprint: [
        { title: "等待半小时的真实感", revealRole: "铺垫", summary: "先让读者看到发布慢的现场。" },
        { title: "三段式排查", revealRole: "加码", summary: "把慢点拆到研究、图片和接口。" },
        { title: "轻重链路分流", revealRole: "最强发现", summary: "说明不是所有内容都要走重流程。" },
      ],
      progressiveRevealEnabled: true,
      progressiveRevealSteps: [
        { step: "先承认慢", detail: "不把慢归咎给模型。" },
        { step: "再拆链路", detail: "把慢点拆成可查对象。" },
        { step: "最后分流", detail: "保留短内容轻链路。" },
      ],
      historyReferencePlan: ["承接发布链路稳定性复盘"],
      referenceFusion,
    },
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: "factCheck",
    payloadPatch: {
      summary: "事实核查通过。",
      missingEvidence: [],
      overallRisk: "low",
      personaAlignment: "面向公众号自动化运营者，口径一致。",
      topicAlignment: "聚焦发布链路稳定性，没有偏离冒烟验收主题。",
      evidenceCards: [
        {
          claim: "微信草稿发布依赖素材上传和接口提交。",
          counterEvidence: ["短内容可走轻链路，不必总是完整长文流程。"],
        },
      ],
      checks: [
        { claim: "微信草稿发布依赖素材上传和接口提交。", status: "verified" },
      ],
    },
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: "prosePolish",
    payloadPatch: {
      summary: "表达润色完成。",
      languageGuardHits: [],
      aiNoise: {
        score: 18,
        level: "low",
        findings: [],
        suggestions: [],
      },
    },
  });

  await insertSmokeCover({ userId: input.userId, articleId: article.id, title: input.title });
  const briefId = await upsertArticleVisualBrief({
    userId: input.userId,
    articleId: article.id,
    articleNodeId: null,
    visualScope: "inline",
    targetAnchor: "这件事可以先拆成三个动作",
    baoyuSkill: "baoyu-article-illustrator",
    visualType: "framework",
    layoutCode: "three-part-check",
    styleCode: "editorial",
    paletteCode: "cool",
    renderingCode: "flat-vector",
    textLevel: "title-only",
    moodCode: "balanced",
    fontCode: "clean",
    aspectRatio: "1:1",
    outputResolution: "1K",
    title: "发布链路三段式检查",
    purpose: "帮助读者把发布慢拆成研究、图片、微信接口三段。",
    altText: "微信草稿发布链路三段式检查图",
    caption: "发布链路三段式检查",
    labels: ["研究收口", "图片准备", "微信提交"],
    sourceFacts: ["发布速度由多步骤共同决定", "图片和接口失败会放大等待时间"],
    promptText: "Create a clean editorial three-part checklist for WeChat publishing pipeline.",
    negativePrompt: "no internal article structure labels",
    promptHash: "wechat-real-publish-smoke",
    promptManifest: { skill: "baoyu-article-illustrator", source: "local-smoke" },
    status: "inserted",
    errorMessage: null,
    generatedAssetFileId: null,
  });
  const visualAssetId = await insertSmokeVisualAsset({ userId: input.userId, articleId: article.id, briefId });
  await getDatabase().exec(
    "UPDATE article_visual_briefs SET generated_asset_file_id = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [visualAssetId, "inserted", nowIso(), briefId, input.userId],
  );

  return article;
}

async function main() {
  loadDotenv();
  await runPendingMigrations();
  await ensureBootstrapData();

  const username = readOption("--user") || "huozi";
  const dateLabel = new Date().toISOString().slice(0, 10);
  const title = readOption("--title") || buildSmokeTitle(dateLabel);
  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error(`未找到用户 ${username}，请先运行 pnpm db:init 或指定 --user`);
  }

  const connection = await ensureWechatEnvConnectionForUser(user.id, { throwOnError: true });
  if (!connection?.id) {
    throw new Error("未检测到 WECHAT_APP_ID / WECHAT_APP_SECRET，无法执行真实微信草稿冒烟。");
  }

  const article = await seedSmokeArticle({ userId: user.id, title });
  const guard = await evaluatePublishGuard({
    articleId: article.id,
    userId: user.id,
    wechatConnectionId: connection.id,
  });
  if (!guard.canPublish) {
    console.error(JSON.stringify({
      ok: false,
      stage: "publish_guard",
      articleId: article.id,
      blockers: guard.blockers,
      warnings: guard.warnings,
      connectionHealth: guard.connectionHealth,
    }, null, 2));
    process.exit(1);
  }

  try {
    const result = await publishArticleToWechat({
      userId: user.id,
      articleId: article.id,
      wechatConnectionId: connection.id,
    });
    console.log(JSON.stringify({
      ok: true,
      articleId: article.id,
      title,
      wechatConnectionId: connection.id,
      mediaId: result.mediaId,
      reused: result.reused,
      articleVersionHash: result.articleVersionHash,
      idempotencyKey: result.idempotencyKey,
      warnings: guard.warnings,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      stage: "publish",
      articleId: article.id,
      title,
      code: error instanceof WechatPublishError ? error.code : "unknown",
      retryable: error instanceof WechatPublishError ? error.retryable : false,
      message: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    stage: "bootstrap",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exit(1);
});
