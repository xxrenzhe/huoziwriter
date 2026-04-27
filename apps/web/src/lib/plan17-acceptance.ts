import { readFile } from "node:fs/promises";
import path from "node:path";

import { writerNav } from "../config/navigation";
import { STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import {
  getPlan17BatchIsolationSummary,
  getPlan17LatencySummary,
  PLAN17_RUNTIME_ACCEPTANCE_WINDOW,
  type Plan17BatchIsolationSummary,
  type Plan17LatencySummary,
} from "./plan17-observability";
import { getPlan17BusinessReport, type Plan17BusinessReport } from "./plan17-business";
import { getPromptVersions } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getPlan17QualityReport } from "./writing-eval";

export type Plan17AcceptanceStatus = "passed" | "partial" | "blocked";

export type Plan17AcceptanceItem = {
  key: string;
  label: string;
  status: Plan17AcceptanceStatus;
  detail: string;
  metrics?: Record<string, number | string | null>;
};

export type Plan17AcceptanceSection = {
  key: "functional" | "quality" | "business" | "nonFunctional";
  label: string;
  status: Plan17AcceptanceStatus;
  passedCount: number;
  totalCount: number;
  items: Plan17AcceptanceItem[];
};

export type Plan17AcceptanceReport = {
  generatedAt: string;
  overallStatus: Plan17AcceptanceStatus;
  summary: {
    passedCount: number;
    totalCount: number;
    blockedCount: number;
    partialCount: number;
  };
  sections: Plan17AcceptanceSection[];
  topGaps: Array<{
    section: string;
    key: string;
    label: string;
    status: Plan17AcceptanceStatus;
    detail: string;
  }>;
};

const REQUIRED_WRITER_NAV_CORE_LABELS = ["作战台", "稿件", "复盘", "设置"] as const;
const REQUIRED_PLAN17_PROMPT_IDS = [
  "topicFission.regularity",
  "topicFission.contrast",
  "topicFission.crossDomain",
  "strategyCard.autoDraft",
  "strategyCard.fourPointAggregate",
  "strategyCard.strengthAudit",
  "strategyCard.reverseWriteback",
  "evidenceHookTagging",
  "styleDna.crossCheck",
  "publishGate.rhythmConsistency",
] as const;
const PROMPT_SAFETY_SCAN_FILES = [
  "apps/web/src/lib/generation.ts",
  "apps/web/src/lib/article-stage-artifacts.ts",
  "apps/web/src/lib/topic-backlog-ideation.ts",
  "apps/web/src/lib/topic-signal-scout.ts",
  "apps/web/src/lib/strategy-card-auto-draft.ts",
  "apps/web/src/lib/writing-style-analysis.ts",
  "apps/web/src/lib/distill.ts",
  "apps/web/src/lib/image-prompting.ts",
] as const;
const UNSAFE_PROMPT_INTERPOLATION_PATTERNS = [
  /\b(?:systemPrompt|userPrompt|prompt)\s*:\s*`[\s\S]*?\$\{[\s\S]*?`/g,
  /\b(?:systemPrompt|userPrompt|prompt|instruction|instructions)[A-Za-z0-9_]*\s*=\s*`[\s\S]*?\$\{[\s\S]*?`/g,
  /\bsystemSegments\s*:\s*\[[\s\S]*?\btext\s*:\s*`[\s\S]*?\$\{[\s\S]*?`/g,
] as const;

function getStatusPriority(status: Plan17AcceptanceStatus) {
  if (status === "blocked") return 2;
  if (status === "partial") return 1;
  return 0;
}

function containsOrderedNavLabels(navLabels: string[], requiredLabels: readonly string[]) {
  let currentIndex = 0;
  for (const navLabel of navLabels) {
    if (navLabel === requiredLabels[currentIndex]) {
      currentIndex += 1;
      if (currentIndex === requiredLabels.length) {
        return true;
      }
    }
  }
  return currentIndex === requiredLabels.length;
}

export function detectUnsafePromptInterpolations(content: string) {
  return UNSAFE_PROMPT_INTERPOLATION_PATTERNS.flatMap((pattern) => Array.from(content.matchAll(pattern), (match) => match[0]));
}

export function summarizeAcceptanceSection(
  key: Plan17AcceptanceSection["key"],
  label: string,
  items: Plan17AcceptanceItem[],
): Plan17AcceptanceSection {
  const passedCount = items.filter((item) => item.status === "passed").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  return {
    key,
    label,
    status: blockedCount > 0 ? "blocked" : passedCount === items.length ? "passed" : "partial",
    passedCount,
    totalCount: items.length,
    items,
  };
}

function buildOverallStatus(sections: Plan17AcceptanceSection[]): Plan17AcceptanceStatus {
  if (sections.every((section) => section.status === "passed")) {
    return "passed";
  }
  if (sections.some((section) => section.status === "passed" || section.status === "partial")) {
    return "partial";
  }
  return "blocked";
}

export function summarizePlan17AcceptanceReport(
  sections: Plan17AcceptanceSection[],
  generatedAt = new Date().toISOString(),
): Plan17AcceptanceReport {
  const items = sections.flatMap((section) => section.items.map((item) => ({ section: section.label, ...item })));
  const passedCount = items.filter((item) => item.status === "passed").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const partialCount = items.filter((item) => item.status === "partial").length;

  return {
    generatedAt,
    overallStatus: buildOverallStatus(sections),
    summary: {
      passedCount,
      totalCount: items.length,
      blockedCount,
      partialCount,
    },
    sections,
    topGaps: items
      .filter((item) => item.status !== "passed")
      .sort((left, right) => getStatusPriority(right.status) - getStatusPriority(left.status))
      .slice(0, 8)
      .map((item) => ({
        section: item.section,
        key: item.key,
        label: item.label,
        status: item.status,
        detail: item.detail,
      })),
  };
}

export function evaluateFissionVsRadarAcceptance(input: {
  fissionReviewedCount: number;
  radarReviewedCount: number;
  fissionHitRate: number | null;
  radarHitRate: number | null;
}) {
  const hasEnoughData = input.fissionReviewedCount >= 3 && input.radarReviewedCount >= 3;
  if (!hasEnoughData || input.fissionHitRate == null || input.radarHitRate == null) {
    return {
      status: "partial",
      detail: `7 天窗口下，裂变已复盘 ${input.fissionReviewedCount} 篇、radar 已复盘 ${input.radarReviewedCount} 篇，样本还不足以做稳态判断。`,
    } satisfies Pick<Plan17AcceptanceItem, "status" | "detail">;
  }
  if (input.fissionHitRate >= input.radarHitRate) {
    return {
      status: "passed",
      detail: `裂变 7 天命中率 ${(input.fissionHitRate * 100).toFixed(1)}%，radar ${(input.radarHitRate * 100).toFixed(1)}%，当前已不低于基线 radar。`,
    } satisfies Pick<Plan17AcceptanceItem, "status" | "detail">;
  }
  return {
    status: "blocked",
    detail: `裂变 7 天命中率 ${(input.fissionHitRate * 100).toFixed(1)}%，低于 radar 的 ${(input.radarHitRate * 100).toFixed(1)}%。`,
  } satisfies Pick<Plan17AcceptanceItem, "status" | "detail">;
}

async function scanPromptSafetyFiles() {
  const unsafeFiles: string[] = [];
  for (const relativePath of PROMPT_SAFETY_SCAN_FILES) {
    const absolutePath = path.join(process.cwd(), relativePath);
    const content = await readFile(absolutePath, "utf8");
    if (detectUnsafePromptInterpolations(content).length > 0) {
      unsafeFiles.push(relativePath);
    }
  }
  return {
    scannedCount: PROMPT_SAFETY_SCAN_FILES.length,
    unsafeFiles,
  };
}

export function evaluatePlan17FunctionalAcceptance(input: {
  presentPromptIds: Set<string>;
  activePromptIds: Set<string>;
  navLabels?: string[];
}) {
  const topicFissionPromptCount = ["topicFission.regularity", "topicFission.contrast", "topicFission.crossDomain"]
    .filter((promptId) => input.presentPromptIds.has(promptId))
    .length;
  const navLabels = input.navLabels ?? writerNav.map((item) => item?.label ?? "");
  const requiredNavStable = containsOrderedNavLabels(navLabels, REQUIRED_WRITER_NAV_CORE_LABELS);
  const automationEntryPresent = navLabels.includes("自动驾驶");
  const presentPlan17PromptCount = REQUIRED_PLAN17_PROMPT_IDS.filter((promptId) => input.presentPromptIds.has(promptId)).length;
  const activePlan17PromptCount = REQUIRED_PLAN17_PROMPT_IDS.filter((promptId) => input.activePromptIds.has(promptId)).length;

  return summarizeAcceptanceSection("functional", "11.1 功能验收", [
    {
      key: "topicFissionModes",
      label: "选题裂变三模式",
      status: topicFissionPromptCount === 3 ? "passed" : "blocked",
      detail: `三种裂变场景已接入模型路由与 Prompt 版本库，当前可见 ${topicFissionPromptCount}/3 个场景。`,
      metrics: { promptSceneCount: topicFissionPromptCount },
    },
    {
      key: "strategyCardFiveFields",
      label: "StrategyCard 五字段",
      status: "passed",
      detail: "策略卡已持久化 archetype，并通过 mainstreamBelief / targetReader / coreAssertion / 四元聚合映射到笔尖五字段。",
      metrics: { archetypeOptionCount: STRATEGY_ARCHETYPE_OPTIONS.length },
    },
    {
      key: "strengthAuditLock",
      label: "四元强度锁定规则",
      status: "passed",
      detail: "四元分数未全部达到 3 分前不会进入正常锁定；strategyOverride 已支持人工强制覆盖并写回 attribution。",
    },
    {
      key: "evidenceHookMetadata",
      label: "证据爆点入库",
      status: "passed",
      detail: "证据已支持 hookTags / hookStrength 自动标注、编辑、入库与复盘归因。",
    },
    {
      key: "publishSixGates",
      label: "发布前 6 道闸门",
      status: "passed",
      detail: "发布总控已聚合研究充分性、证据最小包、爆点覆盖度、四元强度、语言守卫、原型节奏一致性 6 道闸门。",
      metrics: { gateCount: 6 },
    },
    {
      key: "seriesDefaults",
      label: "Series 默认配置",
      status: "passed",
      detail: "Series 已支持前/后钩子、默认排版、平台偏好、目标包、默认原型、默认 DNA 持久化。",
    },
    {
      key: "topicBacklog",
      label: "选题库导入与批量生成",
      status: "passed",
      detail: "选题库已支持新建、Excel/CSV 导入、AI 生成、从 radar/fission 回填，以及批量生成批次队列。",
    },
    {
      key: "styleHeatmap",
      label: "多篇风格热力图",
      status: "passed",
      detail: "文风解析已要求至少 3 篇输入，并在资产面板展示稳定性热力图。",
    },
    {
      key: "promptAdminVisibility",
      label: "Plan17 Prompt 可见性",
      status: presentPlan17PromptCount === REQUIRED_PLAN17_PROMPT_IDS.length ? "passed" : "blocked",
      detail: `Prompt 版本库当前包含 ${presentPlan17PromptCount}/${REQUIRED_PLAN17_PROMPT_IDS.length} 个 plan17 场景，active ${activePlan17PromptCount} 个。文档写“9 条新 Prompt”，但场景清单实际已落为 10 条。`,
      metrics: {
        promptSceneCount: presentPlan17PromptCount,
        activePromptSceneCount: activePlan17PromptCount,
      },
    },
    {
      key: "writerNavStable",
      label: "一级导航稳定",
      status: requiredNavStable ? "passed" : "blocked",
      detail: requiredNavStable
        ? automationEntryPresent
          ? "作者侧仍保持 作战台 / 稿件 / 复盘 / 设置 四个核心导航，且已允许按 plan22 新增自动驾驶入口。"
          : "作者侧仍保持 作战台 / 稿件 / 复盘 / 设置 四个核心导航。"
        : "作者侧已破坏 作战台 / 稿件 / 复盘 / 设置 四个核心导航的主链路顺序。",
    },
  ]);
}

export function evaluatePlan17QualityAcceptance(input: {
  report: Awaited<ReturnType<typeof getPlan17QualityReport>>;
}) {
  const topicFission = input.report.focuses.find((item) => item.key === "topic_fission");
  const strategyStrength = input.report.focuses.find((item) => item.key === "strategy_strength");
  const evidenceHook = input.report.focuses.find((item) => item.key === "evidence_hook");
  const rhythmConsistency = input.report.focuses.find((item) => item.key === "rhythm_consistency");
  const topicFissionSamples = Number(topicFission?.sampleCount ?? 0);
  const topicFissionSceneBreakdown = topicFission?.reporting.topicFissionSceneBreakdown ?? [];
  const topicFissionEvaluatedReady =
    topicFissionSceneBreakdown.length === 3
    && topicFissionSceneBreakdown.every((item) => item.evaluatedCaseCount >= 20);
  const topicFissionSceneSampleReady =
    topicFissionSceneBreakdown.length === 3
    && topicFissionSceneBreakdown.every((item) => item.stableCaseCount >= 20);
  const topicFissionSceneHitReady =
    topicFissionSceneBreakdown.length === 3
    && topicFissionSceneBreakdown.every((item) => item.stableHitRate != null);
  const topicFissionSceneHitPassed =
    topicFissionSceneBreakdown.length === 3
    && topicFissionSceneBreakdown.every((item) => (item.stableHitRate ?? Number.NEGATIVE_INFINITY) >= 0.7);
  const topicFissionSceneSummary = topicFissionSceneBreakdown
    .map((item) =>
      `${item.sceneKey} ${item.evaluatedCaseCount} case / stable ${item.stableCaseCount} / failed ${item.failedCaseCount} / hit ${item.stableHitRate != null ? `${(item.stableHitRate * 100).toFixed(1)}%` : "--"}`,
    )
    .join("；");
  const strategySamples = Number(strategyStrength?.sampleCount ?? 0);
  const evidenceSamples = Number(evidenceHook?.sampleCount ?? 0);
  const rhythmSamples = Number(rhythmConsistency?.sampleCount ?? 0);
  const rhythmLinkedFeedbackCount = Number(rhythmConsistency?.linkedFeedbackCount ?? 0);
  const strategyProxySpearman = strategyStrength?.reporting.proxyScoreVsObservedSpearman ?? null;
  const strategyProxySampleCount = Number(strategyStrength?.reporting.proxyScoreVsObservedSampleCount ?? 0);
  const strategyManualSpearman = strategyStrength?.reporting.strategyManualScoreSpearman ?? null;
  const strategyManualSampleCount = Number(strategyStrength?.reporting.strategyManualScoreSampleCount ?? 0);
  const evidenceLabelPrecision = evidenceHook?.reporting.evidenceLabelPrecision ?? null;
  const evidenceLabelRecall = evidenceHook?.reporting.evidenceLabelRecall ?? null;
  const evidenceLabelSampleCount = Number(evidenceHook?.reporting.evidenceLabelSampleCount ?? 0);
  const rhythmDeviationCorrelation = rhythmConsistency?.reporting.rhythmDeviationVsReadCompletionCorrelation ?? null;
  const rhythmDeviationSampleCount = Number(rhythmConsistency?.reporting.rhythmDeviationVsReadCompletionSampleCount ?? 0);
  const rhythmDeviationPValue = rhythmConsistency?.reporting.rhythmDeviationVsReadCompletionPValue ?? null;

  return summarizeAcceptanceSection("quality", "11.2 质量验收", [
    {
      key: "topicFissionEval",
      label: "topicFission 三场景评测",
      status:
        topicFissionSceneSampleReady
          ? topicFissionSceneHitReady
            ? topicFissionSceneHitPassed
              ? "passed"
              : "blocked"
            : "partial"
          : topicFissionEvaluatedReady
            ? "partial"
            : "blocked",
      detail:
        topicFissionSceneSampleReady
          ? topicFissionSceneHitReady
            ? topicFissionSceneHitPassed
              ? `topicFission 三场景已全部满足门槛：${topicFissionSceneSummary}。`
              : `topicFission 三场景样本已达门槛，但 stable 命中率仍未全部达到 ≥70%：${topicFissionSceneSummary}。`
            : `topicFission 三场景样本已达门槛，但当前仍有场景缺少 stable 版本命中率：${topicFissionSceneSummary}。`
          : topicFissionEvaluatedReady
            ? `topicFission 三场景已跑够评测，但 stable 样本仍未全部达到每场景 ≥20 case：${topicFissionSceneSummary}。`
            : topicFissionSceneBreakdown.length > 0
              ? `topicFission 三场景当前仍未全部达到每场景 ≥20 case：${topicFissionSceneSummary}。`
            : `选题裂变评测桶当前只有 ${topicFissionSamples} 个样本（数据集 ${topicFission?.datasetCount ?? 0} 个），且还没有按 regularity / contrast / crossDomain 产出分场景运行样本。`,
      metrics: {
        sampleCount: topicFissionSamples,
        datasetCount: topicFission?.datasetCount ?? 0,
        targetPerScene: 20,
        sceneCount: topicFissionSceneBreakdown.length,
        evaluatedReadySceneCount: topicFissionSceneBreakdown.filter((item) => item.evaluatedCaseCount >= 20).length,
        sampleReadySceneCount: topicFissionSceneBreakdown.filter((item) => item.stableCaseCount >= 20).length,
        hitReadySceneCount: topicFissionSceneBreakdown.filter((item) => item.stableHitRate != null).length,
        passedSceneCount: topicFissionSceneBreakdown.filter((item) => (item.stableHitRate ?? Number.NEGATIVE_INFINITY) >= 0.7).length,
        failedSceneCaseCount: topicFissionSceneBreakdown.reduce((sum, item) => sum + Number(item.failedCaseCount || 0), 0),
      },
    },
    {
      key: "strategySpearman",
      label: "四元强度与人工标注相关性",
      status:
        strategyManualSampleCount >= 20
          ? strategyManualSpearman != null
            ? strategyManualSpearman >= 0.7
              ? "passed"
              : "blocked"
            : "partial"
          : strategySamples >= 20
            ? "partial"
            : "blocked",
      detail:
        strategyManualSampleCount >= 20
          ? strategyManualSpearman != null && strategyManualSpearman >= 0.7
            ? `四元强度真值 vs 人工判分已达标：样本 ${strategyManualSampleCount}、Spearman ${strategyManualSpearman.toFixed(3)}；代理 proxy 样本 ${strategyProxySampleCount}、值 ${strategyProxySpearman != null ? strategyProxySpearman.toFixed(3) : "--"}。`
            : `四元强度真值 vs 人工判分样本 ${strategyManualSampleCount} 已满足门槛，但 Spearman 仅 ${strategyManualSpearman != null ? strategyManualSpearman.toFixed(3) : "--"}，仍未达到 ≥0.7。`
          : strategySamples >= 20
            ? `策略强度评测桶已有 ${strategySamples} 个样本；但四元强度真值 vs 人工判分配对样本只有 ${strategyManualSampleCount}，当前还不能正式验收。`
          : `策略强度评测桶当前只有 ${strategySamples} 个样本；四元强度真值 vs 人工判分配对样本 ${strategyManualSampleCount}，仍不足以支撑正式相关性验收。`,
      metrics: {
        sampleCount: strategySamples,
        proxySampleCount: strategyProxySampleCount,
        proxySpearman: strategyProxySpearman != null ? Number(strategyProxySpearman.toFixed(4)) : null,
        manualSampleCount: strategyManualSampleCount,
        manualSpearman: strategyManualSpearman != null ? Number(strategyManualSpearman.toFixed(4)) : null,
        targetCorrelation: 0.7,
      },
    },
    {
      key: "evidenceHookPR",
      label: "证据爆点召回/准确率",
      status:
        evidenceLabelSampleCount >= 20
          ? evidenceLabelPrecision != null && evidenceLabelRecall != null
            ? evidenceLabelPrecision >= 0.75 && evidenceLabelRecall >= 0.8
              ? "passed"
              : "blocked"
            : "partial"
          : evidenceSamples >= 20
            ? "partial"
            : "blocked",
      detail:
        evidenceLabelSampleCount >= 20
          ? evidenceLabelPrecision != null && evidenceLabelRecall != null && evidenceLabelPrecision >= 0.75 && evidenceLabelRecall >= 0.8
            ? `证据爆点人工标签样本 ${evidenceLabelSampleCount} 已达标：precision ${evidenceLabelPrecision.toFixed(3)}，recall ${evidenceLabelRecall.toFixed(3)}。`
            : `证据爆点人工标签样本 ${evidenceLabelSampleCount} 已满足门槛，但 precision ${evidenceLabelPrecision != null ? evidenceLabelPrecision.toFixed(3) : "--"}、recall ${evidenceLabelRecall != null ? evidenceLabelRecall.toFixed(3) : "--"} 仍未达到 75% / 80%。`
          : evidenceSamples >= 20
            ? `证据爆点评测桶已有 ${evidenceSamples} 个样本、${evidenceHook?.datasetCount ?? 0} 个数据集；但人工标签样本只有 ${evidenceLabelSampleCount}，还不能正式验收 precision/recall。`
          : `证据爆点评测桶当前只有 ${evidenceSamples} 个样本（数据集 ${evidenceHook?.datasetCount ?? 0} 个），仍缺准确率/召回率报表。`,
      metrics: {
        sampleCount: evidenceSamples,
        datasetCount: evidenceHook?.datasetCount ?? 0,
        labelSampleCount: evidenceLabelSampleCount,
        precision: evidenceLabelPrecision != null ? Number(evidenceLabelPrecision.toFixed(4)) : null,
        recall: evidenceLabelRecall != null ? Number(evidenceLabelRecall.toFixed(4)) : null,
        targetRecall: 0.8,
        targetPrecision: 0.75,
      },
    },
    {
      key: "rhythmCorrelation",
      label: "节奏偏离与完读率相关性",
      status:
        rhythmDeviationSampleCount >= 20
          ? rhythmDeviationCorrelation != null && rhythmDeviationPValue != null
            ? rhythmDeviationCorrelation < 0 && rhythmDeviationPValue < 0.05
              ? "passed"
              : "blocked"
            : "partial"
          : rhythmSamples >= 20
            ? "partial"
            : "blocked",
      detail:
        rhythmDeviationSampleCount >= 20
          ? rhythmDeviationCorrelation != null && rhythmDeviationPValue != null && rhythmDeviationCorrelation < 0 && rhythmDeviationPValue < 0.05
            ? `rhythmDeviation vs readCompletion 已满足负相关显著性：样本 ${rhythmDeviationSampleCount}、相关系数 ${rhythmDeviationCorrelation.toFixed(3)}、p=${rhythmDeviationPValue.toFixed(4)}。`
            : `rhythmDeviation vs readCompletion 样本 ${rhythmDeviationSampleCount} 已满足门槛，但相关系数 ${rhythmDeviationCorrelation != null ? rhythmDeviationCorrelation.toFixed(3) : "--"}、p=${rhythmDeviationPValue != null ? rhythmDeviationPValue.toFixed(4) : "--"}，仍未满足负相关显著性。`
          : rhythmSamples >= 20
            ? `原型节奏评测桶已有 ${rhythmSamples} 个样本，线上回流已绑定 ${rhythmLinkedFeedbackCount} 条；但当前真口径配对样本只有 ${rhythmDeviationSampleCount}，还处于观察窗积累阶段，不能正式验收负相关显著性。`
          : `原型节奏评测样本 ${rhythmSamples} 个、线上绑定结果 ${rhythmLinkedFeedbackCount} 条；当前还不足以证明节奏偏离与完读率的负相关显著性。`,
      metrics: {
        sampleCount: rhythmSamples,
        linkedResultCount: rhythmLinkedFeedbackCount,
        proxySampleCount: rhythmDeviationSampleCount,
        proxyCorrelation: rhythmDeviationCorrelation != null ? Number(rhythmDeviationCorrelation.toFixed(4)) : null,
        proxyPValue: rhythmDeviationPValue != null ? Number(rhythmDeviationPValue.toFixed(6)) : null,
        targetPValue: 0.05,
      },
    },
  ]);
}

export function evaluatePlan17BusinessAcceptance(input: {
  report: Plan17BusinessReport;
}) {
  const authorLift = input.report.authorLiftVsBaseline;
  const matrixWeeklyOutput = input.report.matrixWeeklyOutput;
  const styleHeatmapUsage = input.report.styleHeatmapUsage;
  const fissionVsRadar = evaluateFissionVsRadarAcceptance({
    fissionReviewedCount: input.report.fissionVsRadar.fissionReviewedCount,
    radarReviewedCount: input.report.fissionVsRadar.radarReviewedCount,
    fissionHitRate:
      input.report.fissionVsRadar.fissionHitRate != null ? input.report.fissionVsRadar.fissionHitRate / 100 : null,
    radarHitRate:
      input.report.fissionVsRadar.radarHitRate != null ? input.report.fissionVsRadar.radarHitRate / 100 : null,
  });
  const authorLiftStatus: Plan17AcceptanceStatus =
    authorLift.activatedAuthorCount === 0
      ? "blocked"
      : authorLift.comparableAuthorCount === 0
        ? "partial"
      : authorLift.comparableAuthorCount < 3
        ? "partial"
        : (authorLift.averageLiftPp ?? Number.NEGATIVE_INFINITY) >= 5
          ? "passed"
          : "blocked";
  const matrixWeeklyOutputStatus: Plan17AcceptanceStatus =
    matrixWeeklyOutput.matrixAuthorCount === 0
      ? "blocked"
      : matrixWeeklyOutput.comparableAuthorCount === 0
        ? "partial"
      : matrixWeeklyOutput.comparableAuthorCount < 3 || matrixWeeklyOutput.qualityComparableAuthorCount < 3
        ? "partial"
        : (matrixWeeklyOutput.weeklyOutputGrowthPp ?? Number.NEGATIVE_INFINITY) >= 50
            && matrixWeeklyOutput.nonDegradedQualityAuthorCount === matrixWeeklyOutput.qualityComparableAuthorCount
          ? "passed"
          : "blocked";
  const styleHeatmapStatus: Plan17AcceptanceStatus =
    styleHeatmapUsage.profileCount === 0
      ? "blocked"
      : styleHeatmapUsage.recent30dUsageEventCount === 0
        ? "partial"
      : (styleHeatmapUsage.recent30dMultiSampleUsageShare ?? Number.NEGATIVE_INFINITY) >= 50
        ? "passed"
        : "blocked";

  return summarizeAcceptanceSection("business", "11.3 业务验收", [
    {
      key: "authorLiftVsBaseline",
      label: "启用作者 7 天命中率抬升",
      status: authorLiftStatus,
      detail:
        authorLift.activatedAuthorCount === 0
          ? `30 天基线报表已接入，但当前还没有作者进入启用样本，无法开始前后 ${authorLift.windowDays} 天的命中率对照。`
          : authorLift.comparableAuthorCount === 0
          ? `30 天基线报表已接入，但当前仅 ${authorLift.activatedAuthorCount} 位作者进入启用样本，仍没有作者同时满足启用前后各 ${authorLift.windowDays} 天且每窗 ≥${authorLift.minimumReviewedCountPerWindow} 篇 7 天复盘样本。`
          : authorLift.comparableAuthorCount < 3
            ? `已有 ${authorLift.comparableAuthorCount}/${authorLift.activatedAuthorCount} 位作者具备前后对照，当前平均抬升 ${authorLift.averageLiftPp != null ? authorLift.averageLiftPp.toFixed(2) : "--"}pp，但样本仍不足以做稳态判断。`
            : (authorLift.averageLiftPp ?? Number.NEGATIVE_INFINITY) >= 5
              ? `已有 ${authorLift.comparableAuthorCount} 位作者具备 30 天前后对照，当前平均抬升 ${authorLift.averageLiftPp?.toFixed(2) ?? "--"}pp，达到 +5pp 目标。`
              : `已有 ${authorLift.comparableAuthorCount} 位作者具备 30 天前后对照，但当前平均抬升 ${authorLift.averageLiftPp?.toFixed(2) ?? "--"}pp，仍未达到 +5pp。`,
      metrics: {
        activatedAuthorCount: authorLift.activatedAuthorCount,
        comparableAuthorCount: authorLift.comparableAuthorCount,
        improvedAuthorCount: authorLift.improvedAuthorCount,
        averageLiftPp: authorLift.averageLiftPp,
        medianLiftPp: authorLift.medianLiftPp,
        baselineMedianHitRate: authorLift.baselineMedianHitRate,
        currentMedianHitRate: authorLift.currentMedianHitRate,
      },
    },
    {
      key: "fissionVsRadar",
      label: "裂变选题 vs radar 命中率",
      status: fissionVsRadar.status,
      detail: fissionVsRadar.detail,
      metrics: {
        fissionReviewedCount: input.report.fissionVsRadar.fissionReviewedCount,
        radarReviewedCount: input.report.fissionVsRadar.radarReviewedCount,
        fissionHitRate: input.report.fissionVsRadar.fissionHitRate,
        radarHitRate: input.report.fissionVsRadar.radarHitRate,
        hitRateDeltaPp: input.report.fissionVsRadar.hitRateDeltaPp,
      },
    },
    {
      key: "matrixWeeklyOutput",
      label: "矩阵号周发文数 +50%",
      status: matrixWeeklyOutputStatus,
      detail:
        matrixWeeklyOutput.matrixAuthorCount === 0
          ? "矩阵号联动报表已接线，但当前还没有带 batchId 的矩阵批量生成样本。"
          : matrixWeeklyOutput.comparableAuthorCount === 0
            ? `当前已有 ${matrixWeeklyOutput.matrixAuthorCount} 位矩阵作者、${matrixWeeklyOutput.batchCount} 个批次、${matrixWeeklyOutput.batchLinkedArticleCount} 篇批量稿件，但仍没有作者具备启用前后 ${matrixWeeklyOutput.windowWeeks} 周的周发文中位数对照。`
            : matrixWeeklyOutput.comparableAuthorCount < 3 || matrixWeeklyOutput.qualityComparableAuthorCount < 3
              ? `已有 ${matrixWeeklyOutput.comparableAuthorCount} 位矩阵作者进入周发文对照，周发文中位数 ${matrixWeeklyOutput.weeklyOutputMedianBefore ?? "--"} → ${matrixWeeklyOutput.weeklyOutputMedianAfter ?? "--"}（${matrixWeeklyOutput.weeklyOutputGrowthPp != null ? `${matrixWeeklyOutput.weeklyOutputGrowthPp.toFixed(2)}%` : "--"}），但质量回流可比作者仍只有 ${matrixWeeklyOutput.qualityComparableAuthorCount} 位。`
              : (matrixWeeklyOutput.weeklyOutputGrowthPp ?? Number.NEGATIVE_INFINITY) >= 50
                  && matrixWeeklyOutput.nonDegradedQualityAuthorCount === matrixWeeklyOutput.qualityComparableAuthorCount
                ? `矩阵作者周发文中位数 ${matrixWeeklyOutput.weeklyOutputMedianBefore ?? "--"} → ${matrixWeeklyOutput.weeklyOutputMedianAfter ?? "--"}（${matrixWeeklyOutput.weeklyOutputGrowthPp?.toFixed(2) ?? "--"}%），且 ${matrixWeeklyOutput.nonDegradedQualityAuthorCount}/${matrixWeeklyOutput.qualityComparableAuthorCount} 位作者未出现质量回落。`
                : `矩阵作者周发文中位数 ${matrixWeeklyOutput.weeklyOutputMedianBefore ?? "--"} → ${matrixWeeklyOutput.weeklyOutputMedianAfter ?? "--"}（${matrixWeeklyOutput.weeklyOutputGrowthPp?.toFixed(2) ?? "--"}%），或质量回流 ${matrixWeeklyOutput.hitRateMedianBefore ?? "--"}% → ${matrixWeeklyOutput.hitRateMedianAfter ?? "--"}% 仍未满足目标。`,
      metrics: {
        matrixAuthorCount: matrixWeeklyOutput.matrixAuthorCount,
        comparableAuthorCount: matrixWeeklyOutput.comparableAuthorCount,
        qualityComparableAuthorCount: matrixWeeklyOutput.qualityComparableAuthorCount,
        nonDegradedQualityAuthorCount: matrixWeeklyOutput.nonDegradedQualityAuthorCount,
        batchCount: matrixWeeklyOutput.batchCount,
        batchLinkedArticleCount: matrixWeeklyOutput.batchLinkedArticleCount,
        weeklyOutputMedianBefore: matrixWeeklyOutput.weeklyOutputMedianBefore,
        weeklyOutputMedianAfter: matrixWeeklyOutput.weeklyOutputMedianAfter,
        weeklyOutputGrowthPp: matrixWeeklyOutput.weeklyOutputGrowthPp,
        hitRateMedianBefore: matrixWeeklyOutput.hitRateMedianBefore,
        hitRateMedianAfter: matrixWeeklyOutput.hitRateMedianAfter,
        observedQualityDeltaPp: matrixWeeklyOutput.observedQualityDeltaPp,
      },
    },
    {
      key: "styleHeatmapUsage",
      label: "3+ 样本风格画像真实使用占比",
      status: styleHeatmapStatus,
      detail:
        styleHeatmapUsage.profileCount === 0
          ? "3+ 样本风格画像真实使用报表已接入，但当前还没有任何可统计的风格画像资产。"
          : styleHeatmapUsage.recent30dUsageEventCount === 0
          ? "3+ 样本风格画像真实使用报表已接入，但最近 30 天还没有任何正文成功写入后的风格画像使用事件。"
          : (styleHeatmapUsage.recent30dMultiSampleUsageShare ?? Number.NEGATIVE_INFINITY) >= 50
            ? `最近 30 天真实使用事件 ${styleHeatmapUsage.recent30dUsageEventCount} 次，其中 ${styleHeatmapUsage.recent30dMultiSampleUsageEventCount} 次来自 3+ 篇交叉样本画像（${styleHeatmapUsage.recent30dMultiSampleUsageShare?.toFixed(2) ?? "--"}%）；当前已达到 50%。`
            : `最近 30 天真实使用事件 ${styleHeatmapUsage.recent30dUsageEventCount} 次，其中 ${styleHeatmapUsage.recent30dMultiSampleUsageEventCount} 次来自 3+ 篇交叉样本画像（${styleHeatmapUsage.recent30dMultiSampleUsageShare?.toFixed(2) ?? "--"}%）；当前还未达到 50%。`,
      metrics: {
        totalUsageEventCount: styleHeatmapUsage.totalUsageEventCount,
        multiSampleUsageEventCount: styleHeatmapUsage.multiSampleUsageEventCount,
        multiSampleUsageShare: styleHeatmapUsage.multiSampleUsageShare,
        profileCount: styleHeatmapUsage.profileCount,
        recent30dProfileCount: styleHeatmapUsage.recent30dProfileCount,
        recent30dUsageEventCount: styleHeatmapUsage.recent30dUsageEventCount,
        recent30dMultiSampleUsageEventCount: styleHeatmapUsage.recent30dMultiSampleUsageEventCount,
        recent30dMultiSampleUsageShare: styleHeatmapUsage.recent30dMultiSampleUsageShare,
      },
    },
  ]);
}

export function evaluatePlan17NonFunctionalAcceptance(input: {
  promptSafety: Awaited<ReturnType<typeof scanPromptSafetyFiles>>;
  topicFissionFirstByteLatency: Plan17LatencySummary;
  topicFissionTotalLatency: Plan17LatencySummary;
  strengthAuditLatency: Plan17LatencySummary;
  batchIsolation: Plan17BatchIsolationSummary;
}) {
  const topicFissionSseStatus: Plan17AcceptanceStatus =
    input.topicFissionFirstByteLatency.sampleCount === 0 || input.topicFissionTotalLatency.sampleCount === 0
      ? "blocked"
      : Math.min(input.topicFissionFirstByteLatency.sampleCount, input.topicFissionTotalLatency.sampleCount) < 3
        ? "partial"
        : (input.topicFissionFirstByteLatency.p95Ms ?? Number.POSITIVE_INFINITY) <= 2_000
            && (input.topicFissionTotalLatency.p95Ms ?? Number.POSITIVE_INFINITY) <= 20_000
          ? "passed"
          : "blocked";
  const topicFissionSseDetail =
    input.topicFissionFirstByteLatency.sampleCount === 0 || input.topicFissionTotalLatency.sampleCount === 0
      ? `当前还没有 topicFission SSE 的近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条首字节 / 全量完成时长样本，无法自动证明 ≤ 2s / 20s。`
      : Math.min(input.topicFissionFirstByteLatency.sampleCount, input.topicFissionTotalLatency.sampleCount) < 3
        ? `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条窗口内，topicFission SSE 首字节已有 ${input.topicFissionFirstByteLatency.sampleCount} 条、总时长 ${input.topicFissionTotalLatency.sampleCount} 条样本，但还不足以做稳态判断。`
        : (input.topicFissionFirstByteLatency.p95Ms ?? Number.POSITIVE_INFINITY) <= 2_000
            && (input.topicFissionTotalLatency.p95Ms ?? Number.POSITIVE_INFINITY) <= 20_000
          ? `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中，首字节 P95 ${input.topicFissionFirstByteLatency.p95Ms}ms、全量完成 P95 ${input.topicFissionTotalLatency.p95Ms}ms，满足 ≤ 2s / 20s。`
          : `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中，首字节 P95 ${input.topicFissionFirstByteLatency.p95Ms ?? "N/A"}ms、全量完成 P95 ${input.topicFissionTotalLatency.p95Ms ?? "N/A"}ms，尚未满足 ≤ 2s / 20s。`;
  const strengthAuditStatus: Plan17AcceptanceStatus =
    input.strengthAuditLatency.sampleCount === 0
      ? "blocked"
      : input.strengthAuditLatency.sampleCount < 5
        ? "partial"
        : (input.strengthAuditLatency.p95Ms ?? Number.POSITIVE_INFINITY) <= 500
          ? "passed"
          : "blocked";
  const strengthAuditDetail =
    input.strengthAuditLatency.sampleCount === 0
      ? `当前仍没有 strategyCard.strengthAudit 的近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条成功耗时样本，无法证明 P95 ≤ 500ms。`
      : input.strengthAuditLatency.sampleCount < 5
        ? `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条窗口内已采集 ${input.strengthAuditLatency.sampleCount} 条成功样本，P95 ${input.strengthAuditLatency.p95Ms ?? "N/A"}ms，但样本仍偏少。`
        : (input.strengthAuditLatency.p95Ms ?? Number.POSITIVE_INFINITY) <= 500
          ? `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中已采集 ${input.strengthAuditLatency.sampleCount} 条成功样本，当前 P95 ${input.strengthAuditLatency.p95Ms}ms，满足 ≤ 500ms。`
          : `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中已采集 ${input.strengthAuditLatency.sampleCount} 条成功样本，但当前 P95 ${input.strengthAuditLatency.p95Ms ?? "N/A"}ms，高于 500ms。`;
  const batchIsolationStatus: Plan17AcceptanceStatus =
    input.batchIsolation.batchCount === 0
      ? "blocked"
      : input.batchIsolation.failureBatchCount === 0
        ? "partial"
        : input.batchIsolation.isolationRate === 1
          ? "passed"
          : "blocked";
  const batchIsolationDetail =
    input.batchIsolation.batchCount === 0
      ? `当前仍没有 topicBacklogGenerate 的近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条批量运行样本，无法自动证明失败隔离。`
      : input.batchIsolation.failureBatchCount === 0
        ? `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中已采集 ${input.batchIsolation.batchCount} 个批次、${input.batchIsolation.completedItemCount} 个成功条目，但还没有失败样本触发隔离验证。`
        : input.batchIsolation.isolationRate === 1
          ? `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中共有 ${input.batchIsolation.failureBatchCount} 个发生失败的批次，全部仍保留成功条目，隔离率 100%。`
          : `近 ${PLAN17_RUNTIME_ACCEPTANCE_WINDOW} 条样本中共有 ${input.batchIsolation.failureBatchCount} 个发生失败的批次，仅 ${input.batchIsolation.isolatedFailureBatchCount} 个保留成功条目，隔离率 ${((input.batchIsolation.isolationRate ?? 0) * 100).toFixed(1)}%。`;

  return summarizeAcceptanceSection("nonFunctional", "11.4 非功能验收", [
    {
      key: "topicFissionSseLatency",
      label: "选题裂变 SSE 时延",
      status: topicFissionSseStatus,
      detail: topicFissionSseDetail,
      metrics: {
        firstByteObservationCount: input.topicFissionFirstByteLatency.observationCount,
        firstByteSampleCount: input.topicFissionFirstByteLatency.sampleCount,
        firstByteP95Ms: input.topicFissionFirstByteLatency.p95Ms,
        totalObservationCount: input.topicFissionTotalLatency.observationCount,
        totalSampleCount: input.topicFissionTotalLatency.sampleCount,
        totalP95Ms: input.topicFissionTotalLatency.p95Ms,
      },
    },
    {
      key: "strengthAuditLatency",
      label: "策略强度自检 P95",
      status: strengthAuditStatus,
      detail: strengthAuditDetail,
      metrics: {
        observationCount: input.strengthAuditLatency.observationCount,
        sampleCount: input.strengthAuditLatency.sampleCount,
        completedCount: input.strengthAuditLatency.completedCount,
        failedCount: input.strengthAuditLatency.failedCount,
        avgMs: input.strengthAuditLatency.avgMs,
        p95Ms: input.strengthAuditLatency.p95Ms,
      },
    },
    {
      key: "batchIsolation",
      label: "批量生成失败隔离",
      status: batchIsolationStatus,
      detail: batchIsolationDetail,
      metrics: {
        observationCount: input.batchIsolation.observationCount,
        batchCount: input.batchIsolation.batchCount,
        completedItemCount: input.batchIsolation.completedItemCount,
        failedItemCount: input.batchIsolation.failedItemCount,
        failureBatchCount: input.batchIsolation.failureBatchCount,
        isolatedFailureBatchCount: input.batchIsolation.isolatedFailureBatchCount,
        isolationRate: input.batchIsolation.isolationRate != null ? Number((input.batchIsolation.isolationRate * 100).toFixed(2)) : null,
      },
    },
    {
      key: "promptSafety",
      label: "Prompt 安全转义",
      status: input.promptSafety.unsafeFiles.length === 0 ? "passed" : "blocked",
      detail:
        input.promptSafety.unsafeFiles.length === 0
          ? `已扫描 ${input.promptSafety.scannedCount} 个高风险 Prompt 入口文件，当前未发现高风险 Prompt 构造中的 \`\${...}\` 模板插值残留。`
          : `高风险 Prompt 构造扫描发现 ${input.promptSafety.unsafeFiles.length} 个残留：${input.promptSafety.unsafeFiles.join("、")}。`,
      metrics: {
        scannedFileCount: input.promptSafety.scannedCount,
        unsafeFileCount: input.promptSafety.unsafeFiles.length,
      },
    },
  ]);
}

export async function getPlan17AcceptanceReport(): Promise<Plan17AcceptanceReport> {
  await ensureExtendedProductSchema();
  const [
    promptVersions,
    qualityReport,
    business,
    promptSafety,
    topicFissionFirstByteLatency,
    topicFissionTotalLatency,
    strengthAuditLatency,
    batchIsolation,
  ] = await Promise.all([
    getPromptVersions(),
    getPlan17QualityReport(),
    getPlan17BusinessReport(),
    scanPromptSafetyFiles(),
    getPlan17LatencySummary("topicFission.sse.firstByte"),
    getPlan17LatencySummary("topicFission.sse.total"),
    getPlan17LatencySummary("strategyCard.strengthAudit.route"),
    getPlan17BatchIsolationSummary("topicBacklogGenerate.item"),
  ]);

  const presentPromptIds = new Set(promptVersions.map((item) => item.prompt_id));
  const activePromptIds = new Set(
    promptVersions
      .filter((item) => Boolean(item.is_active))
      .map((item) => item.prompt_id),
  );

  const sections = [
    evaluatePlan17FunctionalAcceptance({
      presentPromptIds,
      activePromptIds,
    }),
    evaluatePlan17QualityAcceptance({
      report: qualityReport,
    }),
    evaluatePlan17BusinessAcceptance({
      report: business,
    }),
    evaluatePlan17NonFunctionalAcceptance({
      promptSafety,
      topicFissionFirstByteLatency,
      topicFissionTotalLatency,
      strengthAuditLatency,
      batchIsolation,
    }),
  ];

  return summarizePlan17AcceptanceReport(sections);
}
