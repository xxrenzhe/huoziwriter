import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import { AdminWritingEvalVersionsClient } from "@/components/admin-writing-eval-versions-client";
import { getWritingEvalRolloutAuditLogs } from "@/lib/audit";
import { getAdminWritingEvalHref } from "@/lib/admin-writing-eval-links";
import { requireAdminSession } from "@/lib/page-auth";
import { getPromptRolloutAssessments } from "@/lib/prompt-rollout";
import { getPromptRolloutStats, getPromptVersions } from "@/lib/repositories";
import { getArticleOutcomeVersionSummaries, getWritingEvalApplyCommandTemplates, getWritingEvalFeedbackSummaries, getWritingEvalLayoutStrategies, getWritingEvalRuns, getWritingEvalScoringProfiles, getWritingEvalVersions } from "@/lib/writing-eval";
import { listWritingAssetRollouts, type WritingRolloutAssetType } from "@/lib/writing-rollout";
import { cn, surfaceCardStyles } from "@huoziwriter/ui";

type RolloutManagedVersionType = WritingRolloutAssetType | "prompt_version";
type WritingEvalVersionSummaryCard = {
  label: string;
  value: number;
  detail: string;
};

const ROLLOUT_MANAGED_VERSION_TYPES: readonly RolloutManagedVersionType[] = ["prompt_version", "layout_strategy", "apply_command_template", "scoring_profile"];
const adminWritingEvalVersionsPanelBaseClassName = cn(surfaceCardStyles(), "border-stone-800 bg-[#171718] shadow-none");
const adminWritingEvalVersionsHeroClassName = cn(adminWritingEvalVersionsPanelBaseClassName, "bg-stone-950 p-6 md:p-8");
const adminWritingEvalVersionsMetricCardClassName = cn(adminWritingEvalVersionsPanelBaseClassName, "p-5");
const adminWritingEvalVersionsNavClassName = "flex flex-wrap gap-3";

function parsePromptRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) return null;
  const [promptId, version] = trimmed.split("@", 2);
  return promptId && version ? { promptId, version } : null;
}

function isPromptBackedVersionType(value: string) {
  return value === "prompt_version" || value === "fact_check" || value === "title_template" || value === "lead_template";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getScoreSummaryRunId(scoreSummary: Record<string, unknown>) {
  const runId = scoreSummary.runId;
  return typeof runId === "number" && Number.isInteger(runId) && runId > 0 ? runId : null;
}

function isRolloutManagedVersionType(value: string): value is RolloutManagedVersionType {
  return ROLLOUT_MANAGED_VERSION_TYPES.includes(value as RolloutManagedVersionType);
}

export default async function AdminWritingEvalVersionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ assetType?: string; assetRef?: string; versionId?: string }>;
}) {
  await requireAdminSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const [versions, rolloutStats, promptVersions, scoringProfiles, layoutStrategies, applyCommandTemplates, assetRollouts, rolloutAudits] = await Promise.all([
    getWritingEvalVersions(),
    getPromptRolloutStats(),
    getPromptVersions(),
    getWritingEvalScoringProfiles(),
    getWritingEvalLayoutStrategies(),
    getWritingEvalApplyCommandTemplates(),
    listWritingAssetRollouts(),
    getWritingEvalRolloutAuditLogs(180),
  ]);
  const { rolloutAuditLogs, promptRolloutAuditLogs } = rolloutAudits;
  const runs = await getWritingEvalRuns();
  const runIds = versions
    .map((item) => getScoreSummaryRunId(item.scoreSummary))
    .filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item > 0);
  const [feedbackSummaries, outcomeSummaries] = await Promise.all([
    getWritingEvalFeedbackSummaries(runIds),
    getArticleOutcomeVersionSummaries(
      versions.map((item) => ({
        versionType: item.versionType,
        candidateContent: item.candidateContent,
      })),
    ),
  ]);

  const rolloutMap = new Map(
    rolloutStats.map((item) => [
      `${item.prompt_id}@${item.version}`,
      {
        uniqueUserCount: item.unique_user_count,
        totalHitCount: item.total_hit_count,
        lastHitAt: item.last_hit_at,
        observeUserCount: item.observe_user_count,
        planUserCount: item.plan_user_count,
        percentageUserCount: item.percentage_user_count,
        stableUserCount: item.stable_user_count,
      },
    ]),
  );
  const assetRolloutMap = new Map(
    assetRollouts.map((item) => [
      `${item.assetType}@@${item.assetRef}`,
      {
        assetType: item.assetType,
        assetRef: item.assetRef,
        autoMode: item.autoMode,
        rolloutObserveOnly: item.rolloutObserveOnly,
        rolloutPercentage: item.rolloutPercentage,
        rolloutPlanCodes: item.rolloutPlanCodes,
        isEnabled: item.isEnabled,
        notes: item.notes,
        stats: item.stats
          ? {
              uniqueUserCount: item.stats.unique_user_count,
              totalHitCount: item.stats.total_hit_count,
              lastHitAt: item.stats.last_hit_at,
              observeUserCount: item.stats.observe_user_count,
              planUserCount: item.stats.plan_user_count,
              percentageUserCount: item.stats.percentage_user_count,
              stableUserCount: item.stats.stable_user_count,
            }
          : null,
      },
    ]),
  );
  const activePromptMap = new Map(
    promptVersions.filter((item) => Boolean(item.is_active)).map((item) => [item.prompt_id, `${item.prompt_id}@${item.version}`]),
  );
  const activeScoringProfileCode = scoringProfiles.find((item) => item.isActive)?.code || null;
  const feedbackMap = new Map(feedbackSummaries.map((item) => [item.runId, item]));
  const outcomeSummaryMap = new Map(outcomeSummaries.map((item) => [`${item.versionType}@@${item.candidateContent}`, item]));
  const runMap = new Map(runs.map((item) => [item.id, item]));
  const rolloutAuditMap = rolloutAuditLogs.reduce((map, item) => {
    const payload = getRecord(item.payload);
    const assetType = String(payload.assetType || "").trim();
    const assetRef = String(payload.assetRef || "").trim();
    if (!assetType || !assetRef) {
      return map;
    }
    const current = map.get(`${assetType}@@${assetRef}`) ?? [];
    current.push({
      id: item.id,
      action: item.action,
      managementAction: String(payload.managementAction || "").trim() || "apply",
      createdAt: item.createdAt,
      username: item.username,
      reason: String(payload.reason || "").trim() || null,
      riskLevel: String(payload.riskLevel || "").trim() || "stone",
      cooldownSkipped: Boolean(payload.cooldownSkipped),
      changes: Array.isArray(payload.changes) ? payload.changes.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
      previousConfig: getRecord(payload.previousConfig),
      nextConfig: getRecord(payload.nextConfig),
      signals: {
        feedbackCount: getNumber(getRecord(payload.signals).feedbackCount),
        uniqueUsers: getNumber(getRecord(payload.signals).uniqueUsers),
        totalHitCount: getNumber(getRecord(payload.signals).totalHitCount),
        deltaTotalScore: getNumber(getRecord(payload.signals).deltaTotalScore),
        observedViralScore: getNumber(getRecord(payload.signals).observedViralScore),
        openRate: getNumber(getRecord(payload.signals).openRate),
        readCompletionRate: getNumber(getRecord(payload.signals).readCompletionRate),
      },
    });
    map.set(`${assetType}@@${assetRef}`, current);
    return map;
  }, new Map<string, Array<{
    id: number;
    action: string;
    managementAction: string;
    createdAt: string;
    username: string | null;
    reason: string | null;
    riskLevel: string;
    cooldownSkipped: boolean;
    changes: string[];
    previousConfig: Record<string, unknown>;
    nextConfig: Record<string, unknown>;
    signals: {
      feedbackCount: number | null;
      uniqueUsers: number | null;
      totalHitCount: number | null;
      deltaTotalScore: number | null;
      observedViralScore: number | null;
      openRate: number | null;
      readCompletionRate: number | null;
    };
  }>>());
  const promptContentMap = new Map(promptVersions.map((item) => [`${item.prompt_id}@${item.version}`, item.prompt_content]));
  const promptRolloutConfigMap = new Map(
    promptVersions.map((item) => {
      const promptRef = `${item.prompt_id}@${item.version}`;
      const rolloutStatsForPrompt = rolloutMap.get(promptRef) ?? null;
      const rolloutPlanCodes = (() => {
        try {
          const parsed = JSON.parse(item.rollout_plan_codes_json || "[]") as unknown;
          return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
        } catch {
          return [];
        }
      })();
      const rolloutObserveOnly = Boolean(item.rollout_observe_only);
      const rolloutPercentage = Number(item.rollout_percentage || 0);
      const isEnabled = rolloutObserveOnly || rolloutPercentage > 0 || rolloutPlanCodes.length > 0;
      return [
        promptRef,
        {
          assetType: "prompt_version" as const,
          assetRef: promptRef,
          autoMode: (String(item.auto_mode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual") as "manual" | "recommendation",
          rolloutObserveOnly,
          rolloutPercentage,
          rolloutPlanCodes,
          isEnabled,
          notes: null,
          stats: rolloutStatsForPrompt,
        },
      ];
    }),
  );
  const promptVersionRefs = Array.from(
    new Set(
      versions
        .filter((item) => item.versionType === "prompt_version")
        .map((item) => String(item.candidateContent || "").trim())
        .filter(Boolean),
    ),
  );
  const promptRolloutAssessmentMap = new Map(
    (await getPromptRolloutAssessments({ refs: promptVersionRefs })).map((item) => [item.ref, item]),
  );
  const scoringProfileMap = new Map(
    scoringProfiles.map((item) => [
      item.code,
      JSON.stringify(
        {
          code: item.code,
          name: item.name,
          description: item.description,
          config: item.config,
        },
        null,
        2,
      ),
    ]),
  );
  const layoutStrategyMap = new Map(
    layoutStrategies.map((item) => [
      String(item.id),
      JSON.stringify(
        {
          id: item.id,
          code: item.code,
          name: item.name,
          description: item.description,
          meta: item.meta,
          config: item.config,
        },
        null,
        2,
      ),
    ]),
  );
  const applyCommandTemplateMap = new Map(
    applyCommandTemplates.map((item) => [
      item.code,
      JSON.stringify(
        {
          code: item.code,
          name: item.name,
          description: item.description,
          config: item.config,
        },
        null,
        2,
      ),
    ]),
  );
  const promptRolloutAuditMap = promptRolloutAuditLogs.reduce((map, item) => {
    const payload = getRecord(item.payload);
    const promptId = String(payload.promptId || "").trim();
    const version = String(payload.version || "").trim();
    if (!promptId || !version) {
      return map;
    }
    const current = map.get(`${promptId}@${version}`) ?? [];
    current.push({
      id: item.id,
      action: item.action,
      managementAction: String(payload.managementAction || "").trim() || "apply",
      createdAt: item.createdAt,
      username: item.username,
      reason: String(payload.reason || "").trim() || null,
      riskLevel: String(payload.riskLevel || "").trim() || "stone",
      cooldownSkipped: Boolean(payload.cooldownSkipped),
      changes: Array.isArray(payload.changes) ? payload.changes.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
      previousConfig: getRecord(payload.previousConfig),
      nextConfig: getRecord(payload.nextConfig),
      signals: {
        feedbackCount: getNumber(getRecord(payload.signals).feedbackCount),
        uniqueUsers: getNumber(getRecord(payload.signals).uniqueUsers),
        totalHitCount: getNumber(getRecord(payload.signals).totalHitCount),
        deltaTotalScore: getNumber(getRecord(payload.signals).deltaTotalScore),
        observedViralScore: getNumber(getRecord(payload.signals).observedViralScore),
        openRate: getNumber(getRecord(payload.signals).openRate),
        readCompletionRate: getNumber(getRecord(payload.signals).readCompletionRate),
      },
    });
    map.set(`${promptId}@${version}`, current);
    return map;
  }, new Map<string, Array<{
    id: number;
    action: string;
    managementAction: string;
    createdAt: string;
    username: string | null;
    reason: string | null;
    riskLevel: string;
    cooldownSkipped: boolean;
    changes: string[];
    previousConfig: Record<string, unknown>;
    nextConfig: Record<string, unknown>;
    signals: {
      feedbackCount: number | null;
      uniqueUsers: number | null;
      totalHitCount: number | null;
      deltaTotalScore: number | null;
      observedViralScore: number | null;
      openRate: number | null;
      readCompletionRate: number | null;
    };
  }>>());
  const requestedAssetType = String(resolvedSearchParams.assetType || "").trim();
  const requestedAssetRef = String(resolvedSearchParams.assetRef || "").trim();
  const requestedVersionId = Number(resolvedSearchParams.versionId);
  const focusedVersions = requestedAssetType && requestedAssetRef
    ? versions.filter((item) => item.versionType === requestedAssetType && item.candidateContent === requestedAssetRef)
    : versions;
  const initialSelectedVersionId =
    (Number.isInteger(requestedVersionId) && requestedVersionId > 0 ? focusedVersions.find((item) => item.id === requestedVersionId)?.id ?? null : null)
    ?? (requestedAssetType && requestedAssetRef
      ? focusedVersions[0]?.id ?? null
      : null)
    ?? versions[0]?.id
    ?? null;
  const keepCount = versions.filter((item) => item.decision === "keep").length;
  const discardCount = versions.filter((item) => item.decision === "discard").length;
  const promptBackedVersionCount = versions.filter((item) => isPromptBackedVersionType(item.versionType)).length;
  const rolloutManagedVersionCount = versions.filter((item) => isRolloutManagedVersionType(item.versionType)).length;
  const enabledPromptRolloutCount = Array.from(promptRolloutConfigMap.values()).filter((item) => item.isEnabled).length;
  const rolloutManagedConfigs = [...promptRolloutConfigMap.values(), ...assetRolloutMap.values()];
  const enabledRolloutManagedConfigCount = rolloutManagedConfigs.filter((item) => item.isEnabled).length;
  const recommendationManagedConfigCount = rolloutManagedConfigs.filter((item) => item.autoMode === "recommendation").length;
  const linkedRunCount = versions.filter((item) => {
    const runId = getScoreSummaryRunId(item.scoreSummary);
    return runId !== null && runMap.has(runId);
  }).length;
  const feedbackLinkedCount = versions.filter((item) => {
    const runId = getScoreSummaryRunId(item.scoreSummary);
    return runId !== null && feedbackMap.has(runId);
  }).length;
  const outcomeLinkedCount = versions.filter((item) => outcomeSummaryMap.has(`${item.versionType}@@${item.candidateContent}`)).length;
  const summaryCards: WritingEvalVersionSummaryCard[] = [
    {
      label: "账本记录",
      value: versions.length,
      detail: `keep ${keepCount} · discard ${discardCount}`,
    },
    {
      label: "Prompt 版本",
      value: promptBackedVersionCount,
      detail: `当前激活 ${activePromptMap.size} · 已挂灰度 ${enabledPromptRolloutCount}`,
    },
    {
      label: "可治理版本",
      value: rolloutManagedVersionCount,
      detail: `已挂灰度 ${enabledRolloutManagedConfigCount} · recommendation ${recommendationManagedConfigCount}`,
    },
    requestedAssetType && requestedAssetRef
      ? {
          label: "当前聚焦",
          value: focusedVersions.length,
          detail: `${requestedAssetType} · 账本命中`,
        }
      : {
          label: "实验关联",
          value: linkedRunCount,
          detail: `回流 ${feedbackLinkedCount} · 实际结果 ${outcomeLinkedCount}`,
        },
  ];

  return (
    <div className="space-y-6">
      <section className={adminWritingEvalVersionsHeroClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Versions</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100 text-balance">保留与回滚账本</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-400">
              在同一页核对写作评测版本的实验来源、账本决策和灰度治理状态，再决定是继续放量、保持观察，还是回滚到上一版资产。
            </p>
          </div>
          <AdminWritingEvalNav sections={["overview", "datasets", "runs"]} className={adminWritingEvalVersionsNavClassName} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <article key={item.label} className={adminWritingEvalVersionsMetricCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
            <div className="mt-3 text-3xl text-stone-100 text-balance">{item.value}</div>
            <div className="mt-3 text-sm text-stone-500">{item.detail}</div>
          </article>
        ))}
      </section>

      <AdminWritingEvalVersionsClient
        focusAsset={
          requestedAssetType && requestedAssetRef
            ? {
                assetType: requestedAssetType,
                assetRef: requestedAssetRef,
                matchedCount: focusedVersions.length,
                clearHref: getAdminWritingEvalHref("versions"),
              }
            : null
        }
        initialSelectedVersionId={initialSelectedVersionId}
        initialVersions={versions.map((item) => {
          const runId = getScoreSummaryRunId(item.scoreSummary);
          const relatedRun = runId ? runMap.get(runId) ?? null : null;
          const isRolloutManagedVersion = isRolloutManagedVersionType(item.versionType);
          const rolloutAssetType = isRolloutManagedVersion ? (item.versionType as RolloutManagedVersionType) : null;
          const rolloutConfig =
            rolloutAssetType
              ? rolloutAssetType === "prompt_version"
                ? promptRolloutConfigMap.get(item.candidateContent) ?? {
                    assetType: "prompt_version" as const,
                    assetRef: item.candidateContent,
                    autoMode: "manual",
                    rolloutObserveOnly: false,
                    rolloutPercentage: 0,
                    rolloutPlanCodes: [],
                    isEnabled: false,
                    notes: null,
                    stats: null,
                  }
                : assetRolloutMap.get(`${rolloutAssetType}@@${item.candidateContent}`) ?? {
                    assetType: rolloutAssetType,
                    assetRef: item.candidateContent,
                    autoMode: "manual",
                    rolloutObserveOnly: false,
                    rolloutPercentage: 0,
                    rolloutPlanCodes: [],
                    isEnabled: false,
                    notes: null,
                    stats: null,
                  }
              : null;
          return {
            ...item,
            sourcePreview:
              isPromptBackedVersionType(item.versionType)
                ? promptContentMap.get(item.sourceVersion) ?? null
                : item.versionType === "scoring_profile"
                  ? scoringProfileMap.get(item.sourceVersion) ?? null
                  : item.versionType === "layout_strategy"
                    ? layoutStrategyMap.get(item.sourceVersion) ?? null
                    : item.versionType === "apply_command_template"
                      ? applyCommandTemplateMap.get(item.sourceVersion) ?? null
                      : null,
            candidatePreview:
              isPromptBackedVersionType(item.versionType)
                ? promptContentMap.get(item.candidateContent) ?? null
                : item.versionType === "scoring_profile"
                  ? scoringProfileMap.get(item.candidateContent) ?? null
                  : item.versionType === "layout_strategy"
                    ? layoutStrategyMap.get(item.candidateContent) ?? null
                    : item.versionType === "apply_command_template"
                      ? applyCommandTemplateMap.get(item.candidateContent) ?? null
                      : null,
            sourceLabel:
              isPromptBackedVersionType(item.versionType)
                ? parsePromptRef(item.sourceVersion)?.version || item.sourceVersion
                : item.sourceVersion,
            candidateLabel:
              isPromptBackedVersionType(item.versionType)
                ? parsePromptRef(item.candidateContent)?.version || item.candidateContent
                : item.candidateContent,
            rolloutStats:
              item.versionType === "prompt_version"
                ? rolloutMap.get(item.candidateContent) ?? {
                    uniqueUserCount: 0,
                    totalHitCount: 0,
                    lastHitAt: null,
                    observeUserCount: 0,
                    planUserCount: 0,
                    percentageUserCount: 0,
                    stableUserCount: 0,
                  }
                : rolloutConfig?.stats ?? (isRolloutManagedVersion
                    ? {
                        uniqueUserCount: 0,
                        totalHitCount: 0,
                        lastHitAt: null,
                        observeUserCount: 0,
                        planUserCount: 0,
                        percentageUserCount: 0,
                        stableUserCount: 0,
                      }
                    : null),
            rolloutConfig,
            rolloutAuditLogs:
              rolloutAssetType
                ? rolloutAssetType === "prompt_version"
                  ? promptRolloutAuditMap.get(item.candidateContent) ?? []
                  : rolloutAuditMap.get(`${rolloutAssetType}@@${item.candidateContent}`) ?? []
                : [],
            promptRolloutConfig:
              item.versionType === "prompt_version"
                ? promptRolloutConfigMap.get(item.candidateContent) ?? {
                    assetType: "prompt_version" as const,
                    assetRef: item.candidateContent,
                    autoMode: "manual",
                    rolloutObserveOnly: false,
                    rolloutPercentage: 0,
                    rolloutPlanCodes: [],
                    isEnabled: false,
                    notes: null,
                    stats: null,
                  }
                : null,
            promptRolloutAssessment:
              item.versionType === "prompt_version"
                ? promptRolloutAssessmentMap.get(item.candidateContent) ?? {
                    promptId: parsePromptRef(item.candidateContent)?.promptId ?? item.targetKey,
                    version: parsePromptRef(item.candidateContent)?.version ?? item.candidateContent,
                    ref: item.candidateContent,
                    hasLedger: false,
                    ledgerDecision: null,
                    sourceVersion: null,
                    runId: null,
                    deltaTotalScore: null,
                    failedCaseCount: 0,
                    feedbackCount: 0,
                    observedViralScore: null,
                    openRate: null,
                    readCompletionRate: null,
                    shareRate: null,
                    favoriteRate: null,
                    uniqueUsers: 0,
                    totalHitCount: 0,
                    lastHitAt: null,
                  }
                : null,
            promptRolloutAuditLogs: item.versionType === "prompt_version" ? promptRolloutAuditMap.get(item.candidateContent) ?? [] : [],
            feedbackSummary: runId ? feedbackMap.get(runId) ?? null : null,
            realOutcomeSummary: outcomeSummaryMap.get(`${item.versionType}@@${item.candidateContent}`) ?? null,
            experimentSource:
              runId || relatedRun
                ? {
                    runId,
                    runCode:
                      relatedRun?.runCode ||
                      (typeof item.scoreSummary.runCode === "string" && item.scoreSummary.runCode.trim()
                        ? item.scoreSummary.runCode.trim()
                        : null),
                    datasetId: relatedRun?.datasetId ?? null,
                    datasetName: relatedRun?.datasetName ?? null,
                    status: relatedRun?.status ?? null,
                    createdAt: relatedRun?.createdAt ?? null,
                    baseVersionRef: relatedRun?.baseVersionRef ?? null,
                    candidateVersionRef: relatedRun?.candidateVersionRef ?? null,
                    recommendation:
                      relatedRun?.recommendation ||
                      (typeof item.scoreSummary.recommendation === "string" && item.scoreSummary.recommendation.trim()
                        ? item.scoreSummary.recommendation.trim()
                        : null),
                    recommendationReason: relatedRun?.recommendationReason ?? null,
                  }
                : null,
            isCurrentActive:
              isPromptBackedVersionType(item.versionType)
                ? activePromptMap.get(item.targetKey) === item.candidateContent
                : item.versionType === "scoring_profile"
                  ? activeScoringProfileCode === item.candidateContent
                  : null,
          };
        })}
      />
    </div>
  );
}
