#!/usr/bin/env tsx

import fs from "node:fs";
import {
  getCredentialHealthMatrix,
} from "../apps/web/src/lib/ai-credentials-health";
import { analyzeAiNoise } from "../apps/web/src/lib/ai-noise-scan";
import {
  getArticleViralReadinessGateIssues,
  getGeneratedArticleViralQualityGateIssues,
} from "../apps/web/src/lib/article-automation-optimization-gates";
import { resumeArticleAutomationRun } from "../apps/web/src/lib/article-automation-orchestrator";
import { createArticleAutomationRun, getArticleAutomationRunById } from "../apps/web/src/lib/article-automation-runs";
import { getArticleStageArtifact } from "../apps/web/src/lib/article-stage-artifacts";
import { findUserByUsername } from "../apps/web/src/lib/auth";
import { closeDatabase } from "../apps/web/src/lib/db";
import { generateCoverImage } from "../apps/web/src/lib/image-generation";
import { getGlobalCoverImageEngineSecret } from "../apps/web/src/lib/image-engine";
import { createPersona, getDefaultPersona } from "../apps/web/src/lib/personas";
import { ensureBootstrapData, getModelRoutes, getWechatConnections } from "../apps/web/src/lib/repositories";
import { PLAN22_STAGE_PROMPT_DEFINITIONS } from "../apps/web/src/lib/plan22-prompt-catalog";
import { createSeries, getDefaultSeries, getSeries } from "../apps/web/src/lib/series";
import { getVisibleTopicRecommendationsForUser } from "../apps/web/src/lib/topic-recommendations";
import { ensureWechatEnvConnectionForUser, hasWechatEnvConnectionConfig } from "../apps/web/src/lib/wechat-env-connection";
import { runPendingMigrations } from "./db-flow";
import {
  ARTIFACT_DIR,
  asRecord,
  asRecordArray,
  asBooleanOrNull,
  asStringArray,
  buildEnvChecks,
  buildMarkdownReport,
  buildScenarioInputs,
  classifyProviderFailure,
  DEFAULT_BRIEF_INPUT,
  DEFAULT_URL,
  getDomain,
  getTimestampTag,
  getScenarioAcceptanceIssues,
  loadDotenv,
  normalizeString,
  readFlag,
  readOption,
  runSearchCheck,
  sanitizeDiagnosticText,
  summarizeAiUsage,
  type AcceptanceReport,
  type PrerequisiteCheck,
  type ScenarioCode,
  type ScenarioReport,
} from "./plan22-real-automation-support";

function asNumberOrNull(value: unknown) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function applyFastAutomationRouteDefaults() {
  if (normalizeString(process.env.PLAN22_REAL_AUTOMATION_FAST_ROUTES) === "0") {
    return;
  }
  if (!normalizeString(process.env.OPENAI_API_KEY)) {
    return;
  }

  const raw = normalizeString(process.env.AI_MODEL_ROUTES_JSON);
  if (!raw) {
    return;
  }

  let parsed: Record<string, Record<string, unknown>>;
  try {
    parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  } catch {
    return;
  }

  const fastScenes = [
    "topicAnalysis",
    "researchBrief",
    "audienceProfile",
    "outlinePlan",
    "languageGuardAudit",
    "sourceLocalization",
  ];
  let changed = false;
  for (const sceneCode of fastScenes) {
    const route = parsed[sceneCode];
    if (!route || typeof route !== "object") {
      continue;
    }
    const primaryModel = normalizeString(route.primaryModel ?? route.primary_model);
    if (primaryModel !== "gpt-5.4") {
      continue;
    }
    route.primaryModel = "gpt-5.4-mini";
    route.primary_model = "gpt-5.4-mini";
    route.fallbackModel = normalizeString(route.fallbackModel ?? route.fallback_model) || "gpt-5.4";
    route.fallback_model = normalizeString(route.fallback_model ?? route.fallbackModel) || "gpt-5.4";
    route.description = [
      normalizeString(route.description),
      "Plan22 真实验收默认快路由：结构化阶段优先低延迟模型，正文生成仍走原长文模型。",
    ].filter(Boolean).join("；");
    changed = true;
  }

  if (changed) {
    process.env.AI_MODEL_ROUTES_JSON = JSON.stringify(parsed);
  }
}

async function ensureSeries(userId: number) {
  const sourceGroundedSeries = (await getSeries(userId)).find((item) => item.name === "Plan22 来源重写系列");
  if (sourceGroundedSeries) {
    return sourceGroundedSeries;
  }

  let sourcePersona = (await getDefaultPersona(userId)) ?? null;
  if (!sourcePersona || /smoke|验收|工作流|内容系统|内容生产/i.test([sourcePersona.name, sourcePersona.summary, ...(sourcePersona.domainKeywords ?? [])].join(" "))) {
    sourcePersona = await createPersona({
      userId,
      name: "Plan22 来源重写作者",
      identityTags: ["商业顾问"],
      writingStyleTags: ["社论评论", "案例拆解"],
      summary: "围绕来源材料提炼冲突、事实边界和读者处境，不把无关系列经验带入正文。",
      domainKeywords: ["行业观察", "商业判断", "读者处境"],
      argumentPreferences: ["先给冲突，再给判断", "证据不足时保留边界"],
      toneConstraints: ["不说教", "不空泛", "不套流程"],
      audienceHints: ["关注商业判断和实战复盘的公众号读者"],
      sourceMode: "manual",
      isDefault: false,
    });
  }

  return await createSeries({
    userId,
    name: "Plan22 来源重写系列",
    personaId: sourcePersona.id,
    thesis: "从给定来源材料出发，重写为有冲突、有边界、有读者现场的公众号文章。",
    targetAudience: "需要基于原文形成新判断的公众号读者",
  });
}

async function ensureLegacyAutomationSeries(userId: number) {
  const existingDefault = await getDefaultSeries(userId);
  if (existingDefault) {
    return existingDefault;
  }
  const existingSeries = await getSeries(userId);
  if (existingSeries.length > 0) {
    return existingSeries[0];
  }

  let persona = await getDefaultPersona(userId);
  if (!persona) {
    persona = await createPersona({
      userId,
      name: "Plan22 自动化作者",
      identityTags: ["AI 产品经理"],
      writingStyleTags: ["案例拆解"],
      summary: "用于 plan22 自动化真实验收的默认作者人设",
      domainKeywords: ["AI", "内容生产", "公众号"],
      argumentPreferences: ["先判断后论证", "基于证据"],
      toneConstraints: ["克制", "不夸张"],
      audienceHints: ["公众号作者", "内容团队"],
      sourceMode: "manual",
      isDefault: true,
    });
  }

  return await createSeries({
    userId,
    name: "Plan22 自动化验收系列",
    personaId: persona.id,
    thesis: "用真实搜索、真实模型和真实校验把自动化文章生产线跑通。",
    targetAudience: "持续写公众号并关心质量与效率的内容创作者",
  });
}

async function probeCoverImage(): Promise<PrerequisiteCheck> {
  try {
    const result = await generateCoverImage({
      title: "Plan22 自动化验收封面探针",
    });
    return {
      code: "coverImageProbe",
      status: "passed",
      detail: `${result.providerName}/${result.model} -> ${sanitizeDiagnosticText(result.imageUrl)}`,
    };
  } catch (error) {
    const detail = sanitizeDiagnosticText(error instanceof Error ? error.message : "封面探针失败");
    return {
      code: "coverImageProbe",
      status: "failed",
      detail,
    };
  }
}

async function resolveCoverImageEnvCheck(): Promise<PrerequisiteCheck> {
  try {
    const engine = await getGlobalCoverImageEngineSecret();
    if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.apiKey) {
      return {
        code: "coverImage",
        status: "failed",
        detail: "未解析到可用的全局封面生图引擎",
      };
    }
    return {
      code: "coverImage",
      status: "passed",
      detail: `生图引擎：${engine.providerName}/${engine.model}`,
    };
  } catch (error) {
    return {
      code: "coverImage",
      status: "failed",
      detail: error instanceof Error ? error.message : "封面引擎配置检查失败",
    };
  }
}

function getPlan22SceneCodes() {
  return new Set(PLAN22_STAGE_PROMPT_DEFINITIONS.map((definition) => definition.sceneCode));
}

async function runScenario(input: {
  scenarioCode: ScenarioCode;
  userId: number;
  targetSeriesId: number;
  inputMode: "brief" | "url" | "recommendedTopic";
  inputText: string;
  sourceUrl: string | null;
  automationLevel: "draftPreview" | "wechatDraft" | "strategyOnly";
  targetWechatConnectionId: number | null;
}): Promise<ScenarioReport> {
  try {
    const created = await createArticleAutomationRun({
      userId: input.userId,
      inputMode: input.inputMode,
      inputText: input.inputText,
      sourceUrl: input.sourceUrl,
      automationLevel: input.automationLevel,
      targetSeriesId: input.targetSeriesId,
      targetWechatConnectionId: input.targetWechatConnectionId,
    });
    const resumed = await resumeArticleAutomationRun({
      runId: created.run.id,
      userId: input.userId,
    });
    const detail = await getArticleAutomationRunById(created.run.id, input.userId);
    if (!detail) {
      throw new Error("自动化运行详情不存在");
    }

    const stageMap = new Map(detail.stages.map((stage) => [stage.stageCode, stage] as const));
    const researchBrief = asRecord(stageMap.get("researchBrief")?.outputJson);
    const searchTrace = asRecord(stageMap.get("researchBrief")?.searchTraceJson);
    const factCheck = asRecord(stageMap.get("factCheck")?.outputJson);
    const titleOptimization = asRecord(stageMap.get("titleOptimization")?.outputJson);
    const openingOptimization = asRecord(stageMap.get("openingOptimization")?.outputJson);
    const coverImageBrief = asRecord(stageMap.get("coverImageBrief")?.outputJson);
    const layoutApply = asRecord(stageMap.get("layoutApply")?.outputJson);
    const publishGuard = asRecord(stageMap.get("publishGuard")?.outputJson);
    const deepWritingArtifact = detail.run.articleId
      ? await getArticleStageArtifact(detail.run.articleId, input.userId, "deepWriting")
      : null;
    const deepWriting = asRecord(deepWritingArtifact?.payload);
    const methodologyGates = asRecordArray(publishGuard.methodologyGates);
    const aiUsageSummary = await summarizeAiUsage(detail.run.articleId);
    const articleMarkdown = normalizeString(detail.article?.markdown_content);
    const articleHtml = normalizeString(detail.article?.html_content);
    const viralReadinessIssues = getArticleViralReadinessGateIssues({
      researchBrief,
      titleOptimization,
      openingOptimization,
      deepWriting,
    });
    const generatedArticleQualityIssues = getGeneratedArticleViralQualityGateIssues({
      markdownContent: articleMarkdown,
      htmlContent: articleHtml,
    });
    const aiNoise = analyzeAiNoise(articleMarkdown);
    const researchSources = asRecordArray(researchBrief.sources);
    const distinctDomains = new Set(
      researchSources
        .map((item) => getDomain(normalizeString(item.sourceUrl)))
        .filter((item): item is string => Boolean(item)),
    );

    return {
      scenarioCode: input.scenarioCode,
      inputMode: input.inputMode,
      automationLevel: input.automationLevel,
      inputText: input.inputText,
      sourceUrl: input.sourceUrl,
      status: resumed.run.status,
      blockedReason: resumed.run.blockedReason,
      runId: resumed.run.id,
      articleId: resumed.run.articleId,
      articleTitle: detail.article?.title ?? null,
      finalWechatMediaId: resumed.run.finalWechatMediaId,
      searchSummary: {
        queryCount: asRecordArray(researchBrief.queries).length,
        sourceCount: researchSources.length,
        distinctDomainCount: distinctDomains.size,
        searchUrl: normalizeString(searchTrace.searchUrl) || null,
        searchError: normalizeString(searchTrace.searchError) || null,
      },
      factCheckSummary: {
        overallRisk: normalizeString(factCheck.overallRisk) || null,
        verifiedClaimCount: asStringArray(factCheck.verifiedClaims).length,
        needsEvidenceCount: asStringArray(factCheck.needsEvidence).length,
        highRiskClaimCount: asStringArray(factCheck.highRiskClaims).length,
      },
      titleSummary: {
        recommendedTitle: normalizeString(titleOptimization.recommendedTitle) || null,
        optionCount: asRecordArray(titleOptimization.titleOptions).length,
        forbiddenHitCount: asStringArray(titleOptimization.forbiddenHits).length,
        recommendedOpenRateScore: asNumberOrNull(titleOptimization.recommendedTitleOpenRateScore),
        recommendedElementsHitCount: Number(titleOptimization.recommendedTitleElementsHitCount ?? 0) || 0,
        recommendedForbiddenHitCount: Number(titleOptimization.recommendedTitleForbiddenHitCount ?? 0) || 0,
      },
      openingSummary: {
        recommendedOpening: normalizeString(openingOptimization.recommendedOpening) || null,
        optionCount: asRecordArray(openingOptimization.openingOptions).length,
        recommendedHookScore: asNumberOrNull(openingOptimization.recommendedHookScore),
        recommendedQualityCeiling: normalizeString(openingOptimization.recommendedQualityCeiling) || null,
        recommendedForbiddenHitCount: Number(openingOptimization.recommendedOpeningForbiddenHitCount ?? 0) || 0,
        recommendedDangerCount: Number(openingOptimization.recommendedOpeningDangerCount ?? 0) || 0,
      },
      coverImageSummary: {
        prompt: normalizeString(coverImageBrief.prompt) || null,
        altText: normalizeString(coverImageBrief.altText) || null,
      },
      layoutSummary: {
        templateId: normalizeString(layoutApply.templateId) || null,
        htmlLength: normalizeString(layoutApply.html).length,
        htmlSyncedToArticle: normalizeString(layoutApply.html) !== "" && normalizeString(layoutApply.html) === normalizeString(detail.article?.html_content),
      },
      publishGuardSummary: {
        canPublish: asBooleanOrNull(publishGuard.canPublish),
        blockerCount: asStringArray(publishGuard.blockers).length,
        warningCount: asStringArray(publishGuard.warnings).length,
        blockers: asStringArray(publishGuard.blockers),
        methodologyBlockedCount: methodologyGates.filter((item) => normalizeString(item.status) === "blocked").length,
        methodologyWarningCount: methodologyGates.filter((item) => normalizeString(item.status) === "warning").length,
        methodologyGateStatuses: methodologyGates.map((item) => ({
          code: normalizeString(item.code),
          status:
            normalizeString(item.status) === "blocked"
              ? "blocked"
              : normalizeString(item.status) === "warning"
                ? "warning"
                : "passed",
        })),
      },
      viralReadinessSummary: {
        issueCount: viralReadinessIssues.length,
        issues: viralReadinessIssues.map((item) => ({
          code: item.code,
          detail: item.detail,
        })),
      },
      generatedArticleQualitySummary: {
        issueCount: generatedArticleQualityIssues.length,
        issues: generatedArticleQualityIssues.map((item) => ({
          code: item.code,
          detail: item.detail,
        })),
        aiNoise: {
          score: aiNoise.score,
          level: aiNoise.level,
          didacticToneRisk: aiNoise.didacticToneRisk,
          distantToneRisk: aiNoise.distantToneRisk,
          didacticCueCount: aiNoise.didacticCueCount,
          distantExpressionCount: aiNoise.distantExpressionCount,
          readerClosenessCueCount: aiNoise.readerClosenessCueCount,
          matchedDistantExpressionPhrases: aiNoise.matchedDistantExpressionPhrases,
        },
      },
      aiUsageSummary,
      stageStatuses: detail.stages.map((stage) => ({
        stageCode: stage.stageCode,
        status: stage.status,
        promptId: stage.promptId,
        promptVersion: stage.promptVersion,
        sceneCode: stage.sceneCode,
        provider: stage.provider,
        model: stage.model,
        startedAt: stage.startedAt,
        completedAt: stage.completedAt,
        errorCode: stage.errorCode,
        errorMessage: stage.errorMessage,
      })),
      error: null,
    };
  } catch (error) {
    return {
      scenarioCode: input.scenarioCode,
      inputMode: input.inputMode,
      automationLevel: input.automationLevel,
      inputText: input.inputText,
      sourceUrl: input.sourceUrl,
      status: "failed",
      blockedReason: null,
      runId: null,
      articleId: null,
      articleTitle: null,
      finalWechatMediaId: null,
      searchSummary: { queryCount: 0, sourceCount: 0, distinctDomainCount: 0, searchUrl: null, searchError: null },
      factCheckSummary: { overallRisk: null, verifiedClaimCount: 0, needsEvidenceCount: 0, highRiskClaimCount: 0 },
      titleSummary: { recommendedTitle: null, optionCount: 0, forbiddenHitCount: 0, recommendedOpenRateScore: null, recommendedElementsHitCount: 0, recommendedForbiddenHitCount: 0 },
      openingSummary: { recommendedOpening: null, optionCount: 0, recommendedHookScore: null, recommendedQualityCeiling: null, recommendedForbiddenHitCount: 0, recommendedDangerCount: 0 },
      coverImageSummary: { prompt: null, altText: null },
      layoutSummary: { templateId: null, htmlLength: 0, htmlSyncedToArticle: false },
      publishGuardSummary: { canPublish: null, blockerCount: 0, warningCount: 0, blockers: [], methodologyBlockedCount: 0, methodologyWarningCount: 0, methodologyGateStatuses: [] },
      viralReadinessSummary: { issueCount: 0, issues: [] },
      generatedArticleQualitySummary: {
        issueCount: 0,
        issues: [],
        aiNoise: {
          score: 0,
          level: "empty",
          didacticToneRisk: "low",
          distantToneRisk: "low",
          didacticCueCount: 0,
          distantExpressionCount: 0,
          readerClosenessCueCount: 0,
          matchedDistantExpressionPhrases: [],
        },
      },
      aiUsageSummary: { callCount: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalLatencyMs: 0 },
      stageStatuses: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  loadDotenv();
  applyFastAutomationRouteDefaults();
  await runPendingMigrations();
  await ensureBootstrapData();

  const username = readOption("--user") || "huozi";
  const briefInput = readOption("--input") || DEFAULT_BRIEF_INPUT;
  const modeOverride = readOption("--mode");
  const fullRun = readFlag("--full") || normalizeString(process.env.PLAN22_REAL_AUTOMATION_FULL) === "1";
  const effectiveModeOverride = modeOverride || (fullRun ? "" : "brief");
  const levelOverride = readOption("--level");
  const shouldProbeCoverImage =
    readFlag("--probe-cover") || normalizeString(process.env.PLAN22_REAL_AUTOMATION_PROBE_COVER) === "1";

  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error(`未找到用户 ${username}，请先运行 pnpm db:init 或指定 --user`);
  }

  if (hasWechatEnvConnectionConfig()) {
    await ensureWechatEnvConnectionForUser(user.id, { throwOnError: true });
  }

  const series = effectiveModeOverride === "brief"
    ? await ensureLegacyAutomationSeries(user.id)
    : await ensureSeries(user.id);
  const [credentialMatrixRaw, effectiveRoutes, wechatConnections, topicRecommendations] = await Promise.all([
    getCredentialHealthMatrix(),
    getModelRoutes(),
    getWechatConnections(user.id),
    getVisibleTopicRecommendationsForUser(user.id),
  ]);
  const selectedWechatConnectionId = Number(wechatConnections[0]?.id ?? 0) || 0;
  const selectedRecommendation = topicRecommendations[0] ?? null;
  const urlSource = readOption("--url") || selectedRecommendation?.sourceUrl || DEFAULT_URL;
  const urlInput = readOption("--url-input") || `基于这个真实网页提炼选题、证据与结构：${urlSource}`;
  const scenariosToRun = buildScenarioInputs({
    briefInput,
    urlInput,
    urlSource,
    recommendation: selectedRecommendation,
    wechatConnectionId: selectedWechatConnectionId,
    levelOverride,
    modeOverride: effectiveModeOverride,
  });
  const requiresWechatDraft = scenariosToRun.some(([, config]) => config.automationLevel === "wechatDraft");
  const runsRecommendedTopicScenario = scenariosToRun.some(([scenarioCode]) => scenarioCode === "recommendedTopic");
  const rawEnvChecks = buildEnvChecks();
  const coverImageEnvCheck = await resolveCoverImageEnvCheck();
  const envChecks = rawEnvChecks.map((item) => {
    const resolved = item.code === "coverImage" ? coverImageEnvCheck : item;
    return {
      ...resolved,
      blocking: resolved.code === "coverImage" ? requiresWechatDraft : true,
    };
  }) satisfies PrerequisiteCheck[];
  const plan22SceneCodes = getPlan22SceneCodes();
  const activePlan22SceneCodes = new Set(
    effectiveRoutes
      .map((route) => String(route.scene_code || "").trim())
      .filter((sceneCode) => plan22SceneCodes.has(sceneCode)),
  );
  const credentialMatrix = {
    ...credentialMatrixRaw,
    providers: credentialMatrixRaw.providers.filter((provider) =>
      provider.sceneCodes.some((sceneCode) => activePlan22SceneCodes.has(sceneCode)),
    ),
  };
  const providerChecks = credentialMatrix.providers
    .filter((provider) => provider.models.length > 0)
    .map((provider) => {
      if (provider.status === "healthy") {
        return {
          code: `provider:${provider.provider}`,
          status: "passed",
          detail: `${provider.probeModel} 可用，latency=${provider.latencyMs ?? 0}ms`,
          blocking: true,
        } satisfies PrerequisiteCheck;
      }
      const failure = classifyProviderFailure(provider.error || `${provider.provider} 凭据不可用`);
      return {
        code: `provider:${provider.provider}`,
        status: "failed",
        detail: failure.detail,
        failureKind: failure.failureKind,
        userMessage: failure.userMessage,
        operatorAction: failure.operatorAction,
        blocking: true,
      } satisfies PrerequisiteCheck;
    }) satisfies PrerequisiteCheck[];

  const searchCheck = await runSearchCheck(briefInput);
  const coverProbe =
    requiresWechatDraft || shouldProbeCoverImage
      ? await probeCoverImage()
      : {
          code: "coverImageProbe",
          status: "skipped",
          detail: "当前验收模式只要求文章终稿，跳过真实生图探针；如需验证封面链路，使用 --probe-cover 或 PLAN22_REAL_AUTOMATION_PROBE_COVER=1。",
        } satisfies PrerequisiteCheck;
  const prerequisiteChecks = [
    ...envChecks,
    ...providerChecks,
    {
      code: "wechatConnections",
      status: requiresWechatDraft ? (wechatConnections.length > 0 ? "passed" : "failed") : "passed",
      detail: requiresWechatDraft
        ? (wechatConnections.length > 0 ? `已找到 ${wechatConnections.length} 个公众号连接` : "未找到可用公众号连接")
        : "当前验收模式不要求推送公众号草稿",
      blocking: requiresWechatDraft,
    },
    {
      code: "topicRecommendations",
      status: topicRecommendations.length > 0 || !runsRecommendedTopicScenario ? "passed" : "failed",
      detail: runsRecommendedTopicScenario
        ? (topicRecommendations.length > 0 ? `已找到 ${topicRecommendations.length} 条今日推荐选题` : "未找到真实 topic recommendation")
        : "当前验收模式未运行 recommendedTopic，今日推荐选题降级为观察项",
      blocking: runsRecommendedTopicScenario,
    },
    {
      ...coverProbe,
      status:
        !requiresWechatDraft
        && coverProbe.status === "failed"
        && /不支持 OpenAI 图片接口|不支持图片接口|COVER_IMAGE_BASE_URL/i.test(coverProbe.detail)
          ? "skipped"
          : coverProbe.status,
      detail: requiresWechatDraft
        ? coverProbe.detail
        : /不支持 OpenAI 图片接口|不支持图片接口|COVER_IMAGE_BASE_URL/i.test(coverProbe.detail)
          ? `当前验收模式仅要求文章终稿，封面真实生图因网关不支持图片接口被跳过；原始结果：${coverProbe.detail}`
          : `当前验收模式仅要求文章终稿，真实生图探针降级为观察项；原始结果：${coverProbe.detail}`,
      blocking: requiresWechatDraft,
    },
  ] satisfies PrerequisiteCheck[];
  const effectiveSearchCheck = {
    ...searchCheck,
    blocking: false,
  };
  const blockingPrerequisiteChecks = prerequisiteChecks.filter((item) => item.blocking !== false);

  const scenarioReports: ScenarioReport[] = [];
  for (const [scenarioCode, config] of scenariosToRun) {
    scenarioReports.push(
      await runScenario({
        scenarioCode,
        userId: user.id,
        targetSeriesId: series.id,
        inputMode: config.inputMode,
        inputText: config.inputText,
        sourceUrl: config.sourceUrl,
        automationLevel: config.automationLevel,
        targetWechatConnectionId: config.targetWechatConnectionId,
      }),
    );
  }
  const scenarioAcceptanceIssues = scenarioReports.flatMap((scenario) =>
    getScenarioAcceptanceIssues({
      scenario,
      requiresWechatDraft: scenario.automationLevel === "wechatDraft",
    }),
  );
  const acceptanceIssues = [
    ...blockingPrerequisiteChecks
      .filter((item) => item.status !== "passed")
      .map((item) => `${item.code}: ${item.detail}`),
    ...scenarioAcceptanceIssues,
  ];

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const reportBaseName = `real-automation-run-${getTimestampTag()}`;
  const reportPathJson = `${ARTIFACT_DIR}/${reportBaseName}.json`;
  const reportPathMarkdown = `${ARTIFACT_DIR}/${reportBaseName}.md`;
  const report = {
    generatedAt: new Date().toISOString(),
    reportPathJson,
    reportPathMarkdown,
    user: { username, userId: user.id },
    prerequisites: {
      checks: prerequisiteChecks,
      search: effectiveSearchCheck,
      credentialMatrix,
      wechatConnectionCount: wechatConnections.length,
      topicRecommendationCount: topicRecommendations.length,
    },
    scenarios: scenarioReports,
    acceptanceIssues,
    status:
      blockingPrerequisiteChecks.every((item) => item.status === "passed")
      && scenarioReports.length > 0
      && scenarioReports.every((scenario) => scenario.status === "completed" && !scenario.error)
      && acceptanceIssues.length === 0
      && (!requiresWechatDraft || scenarioReports.some((scenario) => Boolean(scenario.finalWechatMediaId)))
        ? "passed"
        : "failed",
  } satisfies AcceptanceReport;

  fs.writeFileSync(reportPathJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPathMarkdown, buildMarkdownReport(report));

  if (readFlag("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Plan22 real automation run");
    console.log(`status=${report.status}`);
    console.log(`reportJson=${report.reportPathJson}`);
    console.log(`reportMarkdown=${report.reportPathMarkdown}`);
    console.log(`prerequisiteFailures=${report.prerequisites.checks.filter((item) => item.blocking !== false && item.status === "failed").length}`);
    console.log(`searchStatus=${report.prerequisites.search.status}`);
    for (const scenario of report.scenarios) {
      console.log(`- ${scenario.scenarioCode}: ${scenario.status} runId=${scenario.runId ?? "null"} mediaId=${scenario.finalWechatMediaId ?? "null"}`);
    }
  }

  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
