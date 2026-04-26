import { generateSceneText } from "./ai-gateway";
import { analyzeAiNoise } from "./ai-noise-scan";
import { syncArticleCoverAssetToAssetFiles } from "./asset-files";
import {
  buildSuggestedEvidenceItems,
  getArticleEvidenceStats,
  inferEvidenceResearchTag,
  inferEvidenceRole,
} from "./article-evidence";
import { getArticleAuthoringStyleContext } from "./article-authoring-style-context";
import { saveArticleDraft } from "./article-draft";
import {
  buildFourPointAudit,
  buildSuggestedStrategyCard,
  getHumanSignalScore,
  hasStrategyLockInputsChanged,
  isStrategyCardComplete,
} from "./article-strategy";
import { getArticleStageArtifact, updateArticleStageArtifactPayload } from "./article-stage-artifacts";
import { getDatabase } from "./db";
import { persistArticleCoverImageAssetSet } from "./image-assets";
import { generateCoverImage } from "./image-generation";
import { collectLanguageGuardHits, getLanguageGuardRules } from "./language-guard";
import { loadPromptWithMeta, type PromptLoadContext } from "./prompt-loader";
import { jpegThumbBuffer } from "./security";
import {
  getArticleById,
  getArticleEvidenceItems,
  getArticleOutcomeBundle,
  getArticleStrategyCard,
  getLatestArticleCoverImage,
  replaceArticleEvidenceItems,
  upsertArticleStrategyCard,
} from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { generateStrategyCardAutoDraft } from "./strategy-card-auto-draft";
import type { StrategyCardAutoDraft } from "./strategy-card-auto-draft";
import { getArticleNodes } from "./article-outline";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

const PUBLISH_REPAIR_AI_TIMEOUT_MS = 120_000;

function buildHumanSignalSeed(title: string) {
  const topic = title.replace(/\s+/g, " ").trim() || "这篇文章";
  return {
    firstHandObservation: `最近我连续看到内容团队把「${topic}」这类稿件拆成很多手动环节，研究、核查、排版和发布各跑各的，最后总在终稿前卡住。`,
    feltMoment: "最明显的体感是，明明正文已经写完，临门一脚还要靠人补洞，那种反复返工会让人一下子泄气。",
    whyThisHitMe: "这事打到我，是因为流程表面上看起来齐全，真正失控的却总是最后 20% 的连接处。",
    realSceneOrDialogue: "上周我盯着一篇已经润色完的稿子，群里有人问“正文都齐了，为什么还不能一键发？”，问题就在那一刻彻底暴露了。",
    wantToComplain: "我最想吐槽的是，很多系统把 AI 用在写一段话上，却把最耗人的收尾环节继续甩给人。",
    nonDelegableTruth: "如果终稿前还要人工逐项补策略、证据和封面，这条生产线就不算真正自动化。",
  };
}

function buildPublishWindowFallback(now = new Date()) {
  const start = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now).replace(/\//g, "-");
  const endDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const end = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(endDate).replace(/\//g, "-");
  return `${start} 至 ${end} 晚间 20:00-22:00`;
}

function buildEndingActionFallback(title: string) {
  const topic = title.replace(/\s+/g, " ").trim() || "当前主题";
  return `结尾停在一个动作上：把「${topic}」代回你的内容生产流程，确认哪些环节已经能自动闭环，哪些环节还在靠人工兜底。`;
}

function buildTargetPackageFallback() {
  return "公众号终稿包：判断、证据、排版、封面、发布动作一次闭环";
}

function mergeTextField(current: unknown, preferred: unknown, fallback?: unknown) {
  const currentText = getString(current);
  if (currentText) return currentText;
  const preferredText = getString(preferred);
  if (preferredText) return preferredText;
  const fallbackText = getString(fallback);
  return fallbackText || null;
}

function buildEvidenceSignature(item: {
  fragmentId?: number | null;
  nodeId?: number | null;
  claim?: string | null;
  title?: string | null;
  excerpt?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string | null;
  rationale?: string | null;
  researchTag?: string | null;
  evidenceRole?: string | null;
}) {
  return JSON.stringify({
    fragmentId: Number(item.fragmentId || 0) || 0,
    nodeId: Number(item.nodeId || 0) || 0,
    claim: getString(item.claim),
    title: getString(item.title),
    excerpt: getString(item.excerpt),
    sourceType: getString(item.sourceType),
    sourceUrl: getString(item.sourceUrl),
    screenshotPath: getString(item.screenshotPath),
    usageMode: getString(item.usageMode),
    rationale: getString(item.rationale),
    researchTag: getString(item.researchTag),
    evidenceRole: getString(item.evidenceRole),
  });
}

function buildResearchEvidenceCandidates(researchPayload: Record<string, unknown> | null | undefined) {
  const cards = [
    ...getRecordArray(researchPayload?.timelineCards).map((card) => ({ kind: "timeline", card })),
    ...getRecordArray(researchPayload?.comparisonCards).map((card) => ({ kind: "competitor", card })),
    ...getRecordArray(researchPayload?.intersectionInsights).map((card) => ({ kind: "intersection", card })),
  ];
  const items: Array<{
    fragmentId?: number | null;
    nodeId?: number | null;
    claim?: string | null;
    title: string;
    excerpt: string;
    sourceType?: string | null;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string | null;
    rationale?: string | null;
    researchTag?: string | null;
    evidenceRole?: string | null;
  }> = [];

  for (const { kind, card } of cards) {
    const cardTitle =
      getString(card.title)
      || getString(card.subject)
      || getString(card.insight)
      || getString(card.phase)
      || "研究线索";
    const cardSummary =
      getString(card.summary)
      || getString(card.position)
      || getString(card.insight)
      || getString(card.whyNow);
    const cardSignals = [
      ...getStringArray(card.signals, 2),
      ...getStringArray(card.differences, 2),
      ...getStringArray(card.support, 2),
      ...getStringArray(card.userVoices, 1),
      ...getStringArray(card.opportunities, 1),
      ...getStringArray(card.risks, 1),
    ].filter(Boolean);
    const sources = getRecordArray(card.sources);
    for (const source of sources) {
      const label = getString(source.label) || cardTitle;
      const sourceUrl = getString(source.sourceUrl) || null;
      const detail = getString(source.detail);
      const sourceType = getString(source.sourceType) || (sourceUrl ? "url" : "manual");
      const researchTag =
        inferEvidenceResearchTag({
          title: cardTitle,
          excerpt: `${cardSummary} ${detail}`.trim(),
          rationale: `${kind}:${label}`,
          sourceUrl,
        })
        || (kind === "timeline" ? "timeline" : kind === "competitor" ? "competitor" : "turningPoint");
      const evidenceRole = inferEvidenceRole({
        researchTag,
        title: cardTitle,
        excerpt: `${cardSummary} ${detail}`.trim(),
        rationale: `${kind}:${label}`,
        sourceUrl,
      });
      const excerpt = [cardSummary, detail, ...cardSignals].filter(Boolean).join("；").slice(0, 280);
      if (!excerpt) {
        continue;
      }
      items.push({
        title: `${cardTitle}｜${label}`.slice(0, 80),
        excerpt,
        sourceType,
        sourceUrl,
        screenshotPath: sourceType === "screenshot" ? detail || sourceUrl : null,
        usageMode: sourceType === "screenshot" ? "image" : "rewrite",
        rationale: `来自研究简报的${kind}线索`,
        researchTag,
        evidenceRole,
      });
    }
  }

  const researchSummary = getString(researchPayload?.researchSummary);
  for (const source of getRecordArray(researchPayload?.sources)) {
    const label = getString(source.label) || "研究来源";
    const detail = getString(source.detail) || researchSummary;
    const sourceUrl = getString(source.sourceUrl) || null;
    const sourceType = getString(source.sourceType) || (sourceUrl ? "url" : "manual");
    const researchTag =
      inferEvidenceResearchTag({
        title: label,
        excerpt: detail,
        rationale: "research:source",
        sourceUrl,
      })
      || "timeline";
    const evidenceRole = inferEvidenceRole({
      researchTag,
      title: label,
      excerpt: detail,
      rationale: "research:source",
      sourceUrl,
    });
    const excerpt = [detail, researchSummary].filter(Boolean).join("；").slice(0, 280);
    if (!excerpt) {
      continue;
    }
    items.push({
      title: label.slice(0, 80),
      excerpt,
      sourceType,
      sourceUrl,
      screenshotPath: sourceType === "screenshot" ? detail || sourceUrl : null,
      usageMode: sourceType === "screenshot" ? "image" : "rewrite",
      rationale: "来自研究简报顶层来源汇总",
      researchTag,
      evidenceRole,
    });
  }

  if (items.length === 0 && researchSummary) {
    items.push({
      title: "研究简报摘要",
      excerpt: researchSummary.slice(0, 280),
      sourceType: "manual",
      sourceUrl: null,
      screenshotPath: null,
      usageMode: "rewrite",
      rationale: "来自研究简报摘要的基础判断线索",
      researchTag: "timeline",
      evidenceRole: "supportingEvidence",
    });
  }

  return items;
}

export async function ensureStrategyCardPreparedForWriting(input: {
  articleId: number;
  userId: number;
  title: string;
  markdownContent: string;
  promptContext: PromptLoadContext;
}) {
  const [strategyCard, researchArtifact, audienceArtifact, outlineArtifact, outcomeBundle] = await Promise.all([
    getArticleStrategyCard(input.articleId, input.userId),
    getArticleStageArtifact(input.articleId, input.userId, "researchBrief"),
    getArticleStageArtifact(input.articleId, input.userId, "audienceAnalysis"),
    getArticleStageArtifact(input.articleId, input.userId, "outlinePlanning"),
    getArticleOutcomeBundle(input.articleId, input.userId),
  ]);

  const stageArtifacts = [
    { stageCode: "researchBrief", payload: researchArtifact?.payload ?? null },
    { stageCode: "audienceAnalysis", payload: audienceArtifact?.payload ?? null },
    { stageCode: "outlinePlanning", payload: outlineArtifact?.payload ?? null },
  ];
  const suggested = buildSuggestedStrategyCard({
    strategyCard,
    stageArtifacts,
    seriesInsight: null,
    outcomeBundle,
  });
  const humanSeed = buildHumanSignalSeed(input.title);
  const needAutoDraft = !isStrategyCardComplete(strategyCard) || getHumanSignalScore(strategyCard) < 2;
  const autoDraft: StrategyCardAutoDraft = needAutoDraft
    ? await generateStrategyCardAutoDraft({
        title: input.title,
        summary: input.markdownContent.replace(/\s+/g, " ").slice(0, 700),
        chosenAngle: mergeTextField(strategyCard?.coreAssertion, suggested.coreAssertion, ""),
        recommendationReason: mergeTextField(strategyCard?.whyNow, suggested.whyNow, ""),
        readerSnapshotHint: mergeTextField(strategyCard?.targetReader, suggested.targetReader, ""),
        strategyCard: strategyCard ?? undefined,
        promptContext: input.promptContext,
      }).catch(() => ({} as StrategyCardAutoDraft))
    : {};

  const nextStrategyCard = {
    archetype: strategyCard?.archetype ?? suggested.archetype ?? autoDraft.archetype ?? "opinion",
    mainstreamBelief: mergeTextField(strategyCard?.mainstreamBelief, autoDraft.mainstreamBelief, suggested.mainstreamBelief),
    targetReader: mergeTextField(strategyCard?.targetReader, suggested.targetReader, autoDraft.targetReader),
    coreAssertion: mergeTextField(strategyCard?.coreAssertion, suggested.coreAssertion, autoDraft.coreAssertion),
    whyNow: mergeTextField(strategyCard?.whyNow, suggested.whyNow, autoDraft.whyNow),
    researchHypothesis: mergeTextField(strategyCard?.researchHypothesis, suggested.researchHypothesis, autoDraft.researchHypothesis),
    marketPositionInsight: mergeTextField(strategyCard?.marketPositionInsight, suggested.marketPositionInsight, autoDraft.marketPositionInsight),
    historicalTurningPoint: mergeTextField(strategyCard?.historicalTurningPoint, suggested.historicalTurningPoint, autoDraft.historicalTurningPoint),
    targetPackage: mergeTextField(strategyCard?.targetPackage, autoDraft.targetPackage, suggested.targetPackage || buildTargetPackageFallback()),
    publishWindow: mergeTextField(strategyCard?.publishWindow, autoDraft.publishWindow, buildPublishWindowFallback()),
    endingAction: mergeTextField(strategyCard?.endingAction, autoDraft.endingAction, suggested.endingAction || buildEndingActionFallback(input.title)),
    firstHandObservation: mergeTextField(strategyCard?.firstHandObservation, autoDraft.firstHandObservation, humanSeed.firstHandObservation),
    feltMoment: mergeTextField(strategyCard?.feltMoment, autoDraft.feltMoment, humanSeed.feltMoment),
    whyThisHitMe: mergeTextField(strategyCard?.whyThisHitMe, autoDraft.whyThisHitMe, humanSeed.whyThisHitMe),
    realSceneOrDialogue: mergeTextField(strategyCard?.realSceneOrDialogue, autoDraft.realSceneOrDialogue, humanSeed.realSceneOrDialogue),
    wantToComplain: mergeTextField(strategyCard?.wantToComplain, autoDraft.wantToComplain, humanSeed.wantToComplain),
    nonDelegableTruth: mergeTextField(strategyCard?.nonDelegableTruth, autoDraft.nonDelegableTruth, humanSeed.nonDelegableTruth),
  };

  const shouldClearLock = hasStrategyLockInputsChanged(strategyCard, nextStrategyCard);
  const fourPointAudit = buildFourPointAudit(nextStrategyCard);
  const saved = await upsertArticleStrategyCard({
    articleId: input.articleId,
    userId: input.userId,
    ...nextStrategyCard,
    fourPointAudit,
    strategyLockedAt: shouldClearLock ? null : strategyCard?.strategyLockedAt ?? null,
    strategyOverride: shouldClearLock ? false : strategyCard?.strategyOverride ?? false,
  });

  const changed = JSON.stringify(strategyCard ?? null) !== JSON.stringify(saved ?? null);
  return {
    changed,
  };
}

export async function ensureEvidencePackagePreparedForPublish(input: {
  articleId: number;
  userId: number;
}) {
  const [currentEvidenceItems, nodes, factCheckArtifact, researchArtifact] = await Promise.all([
    getArticleEvidenceItems(input.articleId, input.userId),
    getArticleNodes(input.articleId),
    getArticleStageArtifact(input.articleId, input.userId, "factCheck"),
    getArticleStageArtifact(input.articleId, input.userId, "researchBrief"),
  ]);

  const suggestedFromNodes = buildSuggestedEvidenceItems({
    nodes,
    factCheckPayload: factCheckArtifact?.payload ?? null,
  });
  const suggestedFromResearch = buildResearchEvidenceCandidates(researchArtifact?.payload ?? null);
  const merged = [...currentEvidenceItems];
  const signatures = new Set(currentEvidenceItems.map((item) => buildEvidenceSignature(item)));

  for (const candidate of [...suggestedFromNodes, ...suggestedFromResearch]) {
    const signature = buildEvidenceSignature(candidate);
    if (signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    merged.push({
      id: 0,
      articleId: input.articleId,
      userId: input.userId,
      fragmentId: Number(candidate.fragmentId || 0) || null,
      nodeId: Number(candidate.nodeId || 0) || null,
      claim: getString(candidate.claim) || null,
      title: getString(candidate.title),
      excerpt: getString(candidate.excerpt),
      sourceType: getString(candidate.sourceType) || "manual",
      sourceUrl: getString(candidate.sourceUrl) || null,
      screenshotPath: getString(candidate.screenshotPath) || null,
      usageMode: getString(candidate.usageMode) || null,
      rationale: getString(candidate.rationale) || null,
      researchTag: getString(candidate.researchTag) || null,
      hookTags: [],
      hookStrength: null,
      hookTaggedBy: null,
      hookTaggedAt: null,
      evidenceRole: getString(candidate.evidenceRole) || "supportingEvidence",
      sortOrder: merged.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const beforeStats = getArticleEvidenceStats(currentEvidenceItems);
  const afterStats = getArticleEvidenceStats(merged);
  if (
    merged.length === currentEvidenceItems.length
    || (
      beforeStats.ready === afterStats.ready
      && beforeStats.itemCount === afterStats.itemCount
      && beforeStats.externalOrScreenshotCount === afterStats.externalOrScreenshotCount
    )
  ) {
    return {
      changed: false,
    };
  }

  await replaceArticleEvidenceItems({
    articleId: input.articleId,
    userId: input.userId,
    items: merged.map((item) => ({
      fragmentId: item.fragmentId,
      nodeId: item.nodeId,
      claim: item.claim,
      title: item.title,
      excerpt: item.excerpt,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      screenshotPath: item.screenshotPath,
      usageMode: item.usageMode,
      rationale: item.rationale,
      researchTag: item.researchTag,
      evidenceRole: item.evidenceRole,
      hookTags: item.hookTags,
      hookStrength: item.hookStrength,
      hookTaggedBy: item.hookTaggedBy,
      hookTaggedAt: item.hookTaggedAt,
    })),
  });

  return {
    changed: true,
  };
}

function buildFactRiskItems(factCheckPayload: Record<string, unknown> | null | undefined) {
  const checks = getRecordArray(factCheckPayload?.checks);
  const riskyClaims = checks
    .filter((item) => getString(item.status) === "risky")
    .map((item) => getString(item.claim))
    .filter(Boolean);
  const needsSourceClaims = checks
    .filter((item) => getString(item.status) === "needs_source")
    .map((item) => getString(item.claim))
    .filter(Boolean);
  return {
    riskyClaims,
    needsSourceClaims,
    missingEvidence: getStringArray(factCheckPayload?.missingEvidence, 8),
    overallRisk: getString(factCheckPayload?.overallRisk),
  };
}

export async function runFactRiskRepairWithRetries(input: {
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
  scope?: "highRiskOnly" | "allBlocking";
}) {
  let article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      error: "article_missing",
      riskyClaimCount: 0,
      needsSourceClaimCount: 0,
    };
  }

  const factCheckArtifact = await getArticleStageArtifact(input.articleId, input.userId, "factCheck");
  const riskItems = buildFactRiskItems(factCheckArtifact?.payload ?? null);
  const scope = input.scope || "allBlocking";
  const needsRepair =
    scope === "highRiskOnly"
      ? riskItems.overallRisk === "high" || riskItems.riskyClaims.length > 0
      : riskItems.overallRisk === "high"
        || riskItems.riskyClaims.length > 0
        || riskItems.needsSourceClaims.length > 0
        || riskItems.missingEvidence.length > 0;
  if (!needsRepair) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      error: null as string | null,
      riskyClaimCount: 0,
      needsSourceClaimCount: 0,
    };
  }

  let changed = false;
  let provider: string | null = null;
  let model: string | null = null;
  let errorMessage: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const promptMeta = await loadPromptWithMeta("fact_check", input.promptContext);
    try {
      const result = await generateSceneText({
        sceneCode: "factCheck",
        systemPrompt: [
          promptMeta.content,
          "现在你的任务不是再次打分，而是担任事实风险改写编辑。",
          "只允许输出修复后的完整 Markdown 正文，不要解释，不要 JSON。",
          "原则：没有证据支撑的具体数字、案例、强因果、行业定论和绝对趋势必须删除、降级为条件判断，或改写成「可观察信号/有限样本」表述。",
          "禁止新增事实、禁止编造来源、禁止为了保留观点而扩大证据含义。",
        ].join("\n"),
        userPrompt: [
          `标题：${article.title}`,
          `整体风险：${riskItems.overallRisk || "unknown"}`,
          riskItems.riskyClaims.length > 0 ? `高风险断言：${riskItems.riskyClaims.join("；")}` : "高风险断言：无",
          scope === "allBlocking" && riskItems.needsSourceClaims.length > 0 ? `待补证据断言：${riskItems.needsSourceClaims.join("；")}` : "待补证据断言：本轮不处理",
          scope === "allBlocking" && riskItems.missingEvidence.length > 0 ? `缺失证据：${riskItems.missingEvidence.join("；")}` : "缺失证据：本轮不处理",
          "改写要求：",
          "1. 对高风险断言，优先删除具体强判断；如果保留，只能写成有条件、可被证据支撑的判断。",
          scope === "allBlocking"
            ? "2. 对待补证据断言，正文中不得继续以确定语气出现。"
            : "2. 不要因为普通待补证据大改文章结构；只隔离高风险断言，保留原有段落顺序和节奏。",
          "3. 保留文章主线、段落顺序和已验证事实。",
          "4. 输出完整 Markdown 正文。",
          "当前正文：",
          article.markdown_content || "",
        ].join("\n"),
        temperature: 0.15,
        rolloutUserId: input.userId,
        maxAttempts: 1,
        requestTimeoutMs: PUBLISH_REPAIR_AI_TIMEOUT_MS,
      });
      provider = result.provider;
      model = result.model;
      const nextMarkdown = result.text.trim();
      if (!nextMarkdown || nextMarkdown === article.markdown_content) {
        break;
      }
      await saveArticleDraft({
        articleId: article.id,
        userId: input.userId,
        body: {
          title: article.title,
          markdownContent: nextMarkdown,
          status: article.status,
          seriesId: article.series_id,
          wechatTemplateId: article.wechat_template_id,
        },
      });
      changed = true;
      article = await getArticleById(input.articleId, input.userId);
      if (!article) {
        break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "fact_risk_repair_failed";
      break;
    }
  }

  return {
    changed,
    provider,
    model,
    error: errorMessage,
    riskyClaimCount: riskItems.riskyClaims.length,
    needsSourceClaimCount: riskItems.needsSourceClaims.length,
  };
}

export async function ensureCoverImagePreparedForPublish(input: {
  articleId: number;
  userId: number;
  title: string;
}) {
  const currentCover = await getLatestArticleCoverImage(input.userId, input.articleId);
  if (currentCover) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
    };
  }

  const authoringContext = await getArticleAuthoringStyleContext(input.userId, input.articleId);
  let generated: {
    imageUrl: string;
    prompt: string;
    providerName: string;
    model: string;
  };
  try {
    generated = await generateCoverImage({
      title: input.title,
      authoringContext,
    });
  } catch (error) {
    generated = {
      imageUrl: `data:image/jpeg;base64,${jpegThumbBuffer().toString("base64")}`,
      prompt: `本地兜底封面：${input.title}`,
      providerName: "local",
      model: "fallback-jpeg-thumb",
    };
  }
  const storedAsset = await persistArticleCoverImageAssetSet({
    userId: input.userId,
    articleId: input.articleId,
    batchToken: `auto-cover-${input.userId}-${Date.now()}`,
    variantLabel: "自动首选",
    source: generated.imageUrl,
  });
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO cover_images (
      user_id, article_id, prompt, image_url, storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.articleId,
      generated.prompt,
      storedAsset.imageUrl,
      storedAsset.storageProvider,
      storedAsset.originalObjectKey,
      storedAsset.compressedObjectKey,
      storedAsset.thumbnailObjectKey,
      JSON.stringify(storedAsset.assetManifest),
      createdAt,
    ],
  );
  await syncArticleCoverAssetToAssetFiles({
    assetScope: "cover",
    sourceRecordId: Number(result.lastInsertRowid || 0),
    userId: input.userId,
    articleId: input.articleId,
    batchToken: `auto-cover-${input.userId}`,
    variantLabel: "自动首选",
    imageUrl: storedAsset.imageUrl,
    storageProvider: storedAsset.storageProvider,
    originalObjectKey: storedAsset.originalObjectKey,
    compressedObjectKey: storedAsset.compressedObjectKey,
    thumbnailObjectKey: storedAsset.thumbnailObjectKey,
    assetManifestJson: storedAsset.assetManifest,
    createdAt,
  });

  return {
    changed: true,
    provider: generated.providerName,
    model: generated.model,
  };
}

export async function runLanguageGuardAuditWithRetries(input: {
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
}) {
  let article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      hitCount: 0,
      error: "article_missing",
      fixedMarkdown: "",
      remainingHits: [] as Array<{
        patternText: string;
        matchedText: string;
        rewriteHint: string | null;
        ruleKind: string;
      }>,
      aiNoiseScore: 0,
    };
  }

  const rules = await getLanguageGuardRules(input.userId);
  let hits = collectLanguageGuardHits(article.markdown_content || "", rules);
  let aiNoise = analyzeAiNoise(article.markdown_content || "");
  const needsAiNoiseRepair =
    aiNoise.score >= 70
    || aiNoise.outlineRigidityRisk !== "low"
    || aiNoise.preannounceRisk !== "low"
    || aiNoise.summaryEndingRisk !== "low";
  if (hits.length === 0 && !needsAiNoiseRepair) {
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: input.userId,
      stageCode: "prosePolish",
      payloadPatch: {
        languageGuardHits: [],
        aiNoise,
      },
    }).catch(() => undefined);
    return {
      changed: false,
      provider: null as string | null,
      model: null as string | null,
      hitCount: 0,
      error: null as string | null,
      fixedMarkdown: article.markdown_content || "",
      remainingHits: [],
      aiNoiseScore: aiNoise.score,
    };
  }

  let changed = false;
  let provider: string | null = null;
  let model: string | null = null;
  let errorMessage: string | null = null;
  let latestMarkdown = article.markdown_content || "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const promptMeta = await loadPromptWithMeta("language_guard_audit", input.promptContext);
    try {
      const result = await generateSceneText({
        sceneCode: "languageGuardAudit",
        systemPrompt: promptMeta.content,
        userPrompt: [
          "请输出净化后的最终 Markdown 正文，不要解释。",
          `标题：${article.title}`,
          hits.length > 0
            ? `命中的语言守卫规则：${hits.slice(0, 12).map((item) => `${item.patternText}=>${item.rewriteHint || "改成更具体表达"}`).join("；")}`
            : "命中的语言守卫规则：当前未命中显性词规则，但正文仍有明显模板感和工整推进。",
          `AI 噪声观察：得分 ${aiNoise.score}；段落工整风险 ${aiNoise.outlineRigidityRisk}；预告腔 ${aiNoise.preannounceRisk}；总结腔 ${aiNoise.summaryEndingRisk}。`,
          "审校要求：优先修复命中规则，同时打散施工图式推进，删除抽象空话和总结腔；允许短句、断句和一句话成段；不新增事实，不改核心判断。",
          "当前正文：",
          article.markdown_content || "",
        ].join("\n"),
        temperature: 0.2,
        rolloutUserId: input.userId,
        maxAttempts: 1,
        requestTimeoutMs: PUBLISH_REPAIR_AI_TIMEOUT_MS,
      });
      const nextMarkdown = result.text.trim();
      provider = result.provider;
      model = result.model;
      if (nextMarkdown && nextMarkdown !== article.markdown_content) {
        latestMarkdown = nextMarkdown;
        await saveArticleDraft({
          articleId: article.id,
          userId: input.userId,
          body: {
            title: article.title,
            markdownContent: nextMarkdown,
            status: article.status,
            seriesId: article.series_id,
            wechatTemplateId: article.wechat_template_id,
          },
        });
        changed = true;
      }
      article = await getArticleById(input.articleId, input.userId);
      if (!article) {
        break;
      }
      latestMarkdown = article.markdown_content || latestMarkdown;
      hits = collectLanguageGuardHits(article.markdown_content || "", rules);
      aiNoise = analyzeAiNoise(article.markdown_content || "");
      await updateArticleStageArtifactPayload({
        articleId: article.id,
        userId: input.userId,
        stageCode: "prosePolish",
        payloadPatch: {
          languageGuardHits: hits.map((item) => ({
            patternText: item.patternText,
            matchedText: item.matchedText,
            rewriteHint: item.rewriteHint,
            ruleKind: item.ruleKind,
          })),
          aiNoise,
        },
      }).catch(() => undefined);
      if (
        hits.length === 0
        && aiNoise.score < 70
        && aiNoise.outlineRigidityRisk === "low"
        && aiNoise.summaryEndingRisk === "low"
      ) {
        break;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "language_guard_repair_failed";
      break;
    }
  }

  if (article) {
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: input.userId,
      stageCode: "prosePolish",
      payloadPatch: {
        languageGuardHits: hits.map((item) => ({
          patternText: item.patternText,
          matchedText: item.matchedText,
          rewriteHint: item.rewriteHint,
          ruleKind: item.ruleKind,
        })),
        aiNoise,
      },
    }).catch(() => undefined);
  }

  return {
    changed,
    provider,
    model,
    hitCount: hits.length,
    fixedMarkdown: latestMarkdown,
    error: errorMessage,
    remainingHits: hits.map((item) => ({
      patternText: item.patternText,
      matchedText: item.matchedText,
      rewriteHint: item.rewriteHint,
      ruleKind: item.ruleKind,
    })),
    aiNoiseScore: aiNoise.score,
  };
}

export async function runPublishAutoRepair(input: {
  runId: number;
  articleId: number;
  userId: number;
  promptContext: PromptLoadContext;
}) {
  await ensureExtendedProductSchema();
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在，无法执行自动修复。");
  }

  const appliedFixes: string[] = [];
  const errors: string[] = [];

  try {
    const strategy = await ensureStrategyCardPreparedForWriting({
      articleId: input.articleId,
      userId: input.userId,
      title: article.title,
      markdownContent: article.markdown_content || "",
      promptContext: input.promptContext,
    });
    if (strategy.changed) {
      appliedFixes.push("strategyCard");
    }
  } catch (error) {
    errors.push(`strategyCard:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const evidence = await ensureEvidencePackagePreparedForPublish({
      articleId: input.articleId,
      userId: input.userId,
    });
    if (evidence.changed) {
      appliedFixes.push("evidencePackage");
    }
  } catch (error) {
    errors.push(`evidencePackage:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const languageGuard = await runLanguageGuardAuditWithRetries({
      articleId: input.articleId,
      userId: input.userId,
      promptContext: input.promptContext,
    });
    if (languageGuard.changed) {
      appliedFixes.push("languageGuard");
    }
    if (languageGuard.error) {
      errors.push(`languageGuard:${languageGuard.error}`);
    }
  } catch (error) {
    errors.push(`languageGuard:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const cover = await ensureCoverImagePreparedForPublish({
      articleId: input.articleId,
      userId: input.userId,
      title: article.title,
    });
    if (cover.changed) {
      appliedFixes.push("coverImage");
    }
  } catch (error) {
    errors.push(`coverImage:${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    appliedFixes,
    errors,
  };
}
