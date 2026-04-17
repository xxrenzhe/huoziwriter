import { PromptManagerClient } from "@/components/ops-client";
import { getOpsAuditLogs } from "@/lib/audit";
import { requireOpsSession } from "@/lib/page-auth";
import { getPromptRolloutAssessments } from "@/lib/prompt-rollout";
import { getPromptRolloutDailyMetrics, getPromptRolloutSamples, getPromptRolloutStats, getPromptVersions } from "@/lib/repositories";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function OpsPromptsPage({
  searchParams,
}: {
  searchParams?: Promise<{ promptId?: string; version?: string }>;
}) {
  await requireOpsSession();
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedPromptId = String(resolvedSearchParams?.promptId || "").trim();
  const requestedVersion = String(resolvedSearchParams?.version || "").trim();
  const [prompts, rolloutStats, rolloutDailyMetrics, rolloutSamples, rolloutAuditLogs] = await Promise.all([
    getPromptVersions(),
    getPromptRolloutStats(),
    getPromptRolloutDailyMetrics(),
    getPromptRolloutSamples(),
    getOpsAuditLogs({
      action: "prompt_rollout_auto_manage",
      targetType: "prompt_version",
      limit: 180,
    }),
  ]);
  const focusedPrompts = requestedPromptId
    ? prompts.filter((prompt) => prompt.prompt_id === requestedPromptId && (!requestedVersion || prompt.version === requestedVersion))
    : prompts;
  const rolloutAssessments = await getPromptRolloutAssessments({
    refs: focusedPrompts.map((prompt) => `${prompt.prompt_id}@${prompt.version}`),
  });
  const statsMap = new Map(
    rolloutStats.map((item) => [
      `${item.prompt_id}@@${item.version}`,
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
  const trendMap = new Map<string, Array<{
    date: string;
    totalHitCount: number;
    observeHitCount: number;
    planHitCount: number;
    percentageHitCount: number;
    stableHitCount: number;
  }>>();
  for (const item of rolloutDailyMetrics) {
    const key = `${item.prompt_id}@@${item.version}`;
    const current = trendMap.get(key) ?? [];
    current.push({
      date: item.metric_date,
      totalHitCount: item.total_hit_count,
      observeHitCount: item.observe_hit_count,
      planHitCount: item.plan_hit_count,
      percentageHitCount: item.percentage_hit_count,
      stableHitCount: item.stable_hit_count,
    });
    trendMap.set(key, current);
  }
  const sampleMap = new Map<string, Array<{
    userId: number;
    username: string | null;
    role: string | null;
    planCode: string | null;
    resolutionMode: string;
    resolutionReason: string;
    userBucket: number | null;
    hitCount: number;
    firstHitAt: string;
    lastHitAt: string;
  }>>();
  for (const item of rolloutSamples) {
    const key = `${item.prompt_id}@@${item.version}`;
    const current = sampleMap.get(key) ?? [];
    current.push({
      userId: item.user_id,
      username: item.username,
      role: item.role,
      planCode: item.plan_code,
      resolutionMode: item.resolution_mode,
      resolutionReason: item.resolution_reason,
      userBucket: item.user_bucket,
      hitCount: item.hit_count,
      firstHitAt: item.first_hit_at,
      lastHitAt: item.last_hit_at,
    });
    sampleMap.set(key, current);
  }
  const assessmentMap = new Map(rolloutAssessments.map((item) => [item.ref, item]));
  const auditMap = rolloutAuditLogs.reduce((map, item) => {
    const payload = getRecord(item.payload);
    const promptId = String(payload.promptId || "").trim();
    const version = String(payload.version || "").trim();
    if (!promptId || !version) {
      return map;
    }
    const current = map.get(`${promptId}@@${version}`) ?? [];
    current.push({
      id: item.id,
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
    map.set(`${promptId}@@${version}`, current);
    return map;
  }, new Map<string, Array<{
    id: number;
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
  return (
    <PromptManagerClient
      focusPrompt={
        requestedPromptId
          ? {
              promptId: requestedPromptId,
              version: requestedVersion || null,
              matchedCount: focusedPrompts.length,
              clearHref: "/ops/prompts",
            }
          : null
      }
      prompts={focusedPrompts.map((prompt) => ({
        id: prompt.id,
        promptId: prompt.prompt_id,
        version: prompt.version,
        category: prompt.category,
        name: prompt.name,
        isActive: Boolean(prompt.is_active),
        promptContent: prompt.prompt_content,
        autoMode: String(prompt.auto_mode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual",
        updatedAt: prompt.updated_at,
        rolloutObserveOnly: Boolean(prompt.rollout_observe_only),
        rolloutPercentage: prompt.rollout_percentage,
        rolloutPlanCodes: (() => {
          try {
            const parsed = JSON.parse(prompt.rollout_plan_codes_json || "[]") as unknown;
            return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
          } catch {
            return [];
          }
        })(),
        rolloutAssessment:
          assessmentMap.get(`${prompt.prompt_id}@${prompt.version}`) ?? {
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
            uniqueUsers: 0,
            totalHitCount: 0,
            lastHitAt: null,
          },
        rolloutAuditTrail: auditMap.get(`${prompt.prompt_id}@@${prompt.version}`) ?? [],
        rolloutStats:
          statsMap.get(`${prompt.prompt_id}@@${prompt.version}`) ?? {
            uniqueUserCount: 0,
            totalHitCount: 0,
            lastHitAt: null,
            observeUserCount: 0,
            planUserCount: 0,
            percentageUserCount: 0,
            stableUserCount: 0,
          },
        rolloutTrend: trendMap.get(`${prompt.prompt_id}@@${prompt.version}`) ?? [],
        rolloutSamples: sampleMap.get(`${prompt.prompt_id}@@${prompt.version}`) ?? [],
      }))}
    />
  );
}
