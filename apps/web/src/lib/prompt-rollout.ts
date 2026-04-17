import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { updatePromptVersionRolloutConfig } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getArticleOutcomeVersionSummaries } from "./writing-eval";

export type PromptRolloutAutoMode = "manual" | "recommendation";

type PromptVersionRolloutRow = {
  id: number;
  prompt_id: string;
  version: string;
  name: string;
  is_active: number | boolean;
  auto_mode: string | null;
  rollout_observe_only: number | boolean;
  rollout_percentage: number;
  rollout_plan_codes_json: string | null;
  created_at: string;
  updated_at: string;
};

type PromptRolloutObservationRow = {
  prompt_id: string;
  version: string;
  unique_user_count: number;
  total_hit_count: number;
  last_hit_at: string | null;
  observe_user_count: number;
  plan_user_count: number;
  percentage_user_count: number;
  stable_user_count: number;
};

type WritingOptimizationVersionRow = {
  id: number;
  source_version: string | null;
  candidate_content: string;
  decision: string;
  score_summary_json: string | Record<string, unknown>;
  created_at: string;
};

type PromptRolloutSummary = {
  feedbackCount: number;
  averageObservedViralScore: number | null;
  averageOpenRate: number | null;
  averageReadCompletionRate: number | null;
  averageShareRate: number | null;
  averageFavoriteRate: number | null;
};

export type PromptRolloutAssessment = {
  promptId: string;
  version: string;
  ref: string;
  hasLedger: boolean;
  ledgerDecision: string | null;
  sourceVersion: string | null;
  runId: number | null;
  deltaTotalScore: number | null;
  failedCaseCount: number;
  feedbackCount: number;
  observedViralScore: number | null;
  openRate: number | null;
  readCompletionRate: number | null;
  shareRate: number | null;
  favoriteRate: number | null;
  uniqueUsers: number;
  totalHitCount: number;
  lastHitAt: string | null;
};

type PromptRolloutAutoPlan = {
  status: "noop" | "apply";
  reason: string;
  riskLevel: "stone" | "amber" | "emerald" | "cinnabar";
  config: {
    rolloutObserveOnly: boolean;
    rolloutPercentage: number;
    rolloutPlanCodes: string[];
  };
  changes: string[];
  signals: {
    feedbackCount: number;
    uniqueUsers: number;
    totalHitCount: number;
    deltaTotalScore: number | null;
    observedViralScore: number | null;
    openRate: number | null;
    readCompletionRate: number | null;
  };
};

const PROMPT_ROLLOUT_AUTO_MANAGE_COOLDOWN_HOURS = 12;
const STRONG_ROLLOUT_SIGNAL_THRESHOLD = {
  observedViralScore: 68,
  openRate: 15,
  readCompletionRate: 25,
};

function parseJsonObject(value: string | Record<string, unknown> | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toRoundedPercentage(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function parsePlanCodes(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseIsoTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function normalizePromptRolloutAutoMode(value: unknown, fallback: PromptRolloutAutoMode = "manual"): PromptRolloutAutoMode {
  return String(value || "").trim().toLowerCase() === "recommendation" ? "recommendation" : fallback;
}

function parsePromptRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) return null;
  const [promptId, version] = trimmed.split("@", 2);
  return promptId && version ? { promptId, version } : null;
}

function buildPromptPairCondition(pairs: Array<{ promptId: string; version: string }>) {
  return {
    sql: pairs.map(() => "(prompt_id = ? AND version = ?)").join(" OR "),
    params: pairs.flatMap((item) => [item.promptId, item.version]),
  };
}

async function getPromptRolloutStatsMap(pairs: Array<{ promptId: string; version: string }>) {
  if (pairs.length === 0) {
    return new Map<string, PromptRolloutObservationRow>();
  }
  const db = getDatabase();
  const condition = buildPromptPairCondition(pairs);
  const rows = await db.query<PromptRolloutObservationRow>(
    `SELECT prompt_id, version,
            COUNT(DISTINCT user_id) AS unique_user_count,
            COALESCE(SUM(hit_count), 0) AS total_hit_count,
            MAX(last_hit_at) AS last_hit_at,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'observe%' THEN user_id END) AS observe_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'plan:%' THEN user_id END) AS plan_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'percentage:%' THEN user_id END) AS percentage_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason = 'stable' THEN user_id END) AS stable_user_count
     FROM prompt_rollout_observations
     WHERE ${condition.sql}
     GROUP BY prompt_id, version`,
    condition.params,
  );
  return new Map(rows.map((item) => [`${item.prompt_id}@${item.version}`, item]));
}

async function getLatestPromptOptimizationVersionMap(refs: string[]) {
  if (refs.length === 0) {
    return new Map<string, WritingOptimizationVersionRow>();
  }
  const db = getDatabase();
  const rows = await db.query<WritingOptimizationVersionRow>(
    `SELECT id, source_version, candidate_content, decision, score_summary_json, created_at
     FROM writing_optimization_versions
     WHERE version_type = ? AND (${refs.map(() => "candidate_content = ?").join(" OR ")})
     ORDER BY created_at DESC, id DESC`,
    ["prompt_version", ...refs],
  );
  const latest = new Map<string, WritingOptimizationVersionRow>();
  for (const row of rows) {
    if (!latest.has(row.candidate_content)) {
      latest.set(row.candidate_content, row);
    }
  }
  return latest;
}

export async function getPromptRolloutAssessments(input?: { refs?: string[] }) {
  await ensureExtendedProductSchema();
  const refs = Array.from(new Set((input?.refs ?? []).map((item) => String(item || "").trim()).filter(Boolean)));
  const pairs = refs
    .map((item) => {
      const parsed = parsePromptRef(item);
      return parsed ? { ref: item, ...parsed } : null;
    })
    .filter(Boolean) as Array<{ ref: string; promptId: string; version: string }>;
  if (pairs.length === 0) {
    return [] as PromptRolloutAssessment[];
  }

  const [statsMap, versionMap, outcomeSummaries] = await Promise.all([
    getPromptRolloutStatsMap(pairs),
    getLatestPromptOptimizationVersionMap(pairs.map((item) => item.ref)),
    getArticleOutcomeVersionSummaries(pairs.map((item) => ({ versionType: "prompt_version", candidateContent: item.ref }))),
  ]);
  const outcomeMap = new Map(outcomeSummaries.map((item) => [item.candidateContent, item]));

  return pairs.map((item) => {
    const latestVersion = versionMap.get(item.ref) ?? null;
    const scoreSummary = parseJsonObject(latestVersion?.score_summary_json);
    const runId = getNumber(scoreSummary.runId);
    const outcomeSummary = outcomeMap.get(item.ref) ?? null;
    const stats = statsMap.get(item.ref) ?? null;
    return {
      promptId: item.promptId,
      version: item.version,
      ref: item.ref,
      hasLedger: Boolean(latestVersion),
      ledgerDecision: latestVersion?.decision ?? null,
      sourceVersion: latestVersion?.source_version ?? null,
      runId,
      deltaTotalScore: getNumber(scoreSummary.deltaTotalScore),
      failedCaseCount: getNumber(scoreSummary.failedCaseCount) ?? 0,
      feedbackCount: outcomeSummary?.feedbackCount ?? 0,
      observedViralScore: outcomeSummary?.averageObservedViralScore ?? null,
      openRate: outcomeSummary?.averageOpenRate ?? null,
      readCompletionRate: outcomeSummary?.averageReadCompletionRate ?? null,
      shareRate: outcomeSummary?.averageShareRate ?? null,
      favoriteRate: outcomeSummary?.averageFavoriteRate ?? null,
      uniqueUsers: stats?.unique_user_count ?? 0,
      totalHitCount: stats?.total_hit_count ?? 0,
      lastHitAt: stats?.last_hit_at ?? null,
    };
  });
}

function buildPromptRolloutAutoPlan(input: {
  prompt: {
    isActive: boolean;
    rolloutObserveOnly: boolean;
    rolloutPercentage: number;
    rolloutPlanCodes: string[];
  };
  assessment: PromptRolloutAssessment;
}): PromptRolloutAutoPlan {
  const currentConfig = {
    rolloutObserveOnly: Boolean(input.prompt.rolloutObserveOnly),
    rolloutPercentage: toRoundedPercentage(input.prompt.rolloutPercentage),
    rolloutPlanCodes: input.prompt.rolloutPlanCodes,
  };
  const signals = {
    feedbackCount: input.assessment.feedbackCount,
    uniqueUsers: input.assessment.uniqueUsers,
    totalHitCount: input.assessment.totalHitCount,
    deltaTotalScore: input.assessment.deltaTotalScore,
    observedViralScore: input.assessment.observedViralScore,
    openRate: input.assessment.openRate,
    readCompletionRate: input.assessment.readCompletionRate,
  };

  if (input.prompt.isActive) {
    return {
      status: "noop",
      reason: "当前版本已经全量生效，不再进入自动灰度治理。",
      riskLevel: "stone",
      config: currentConfig,
      changes: [],
      signals,
    };
  }

  if (!input.assessment.hasLedger) {
    return {
      status: "noop",
      reason: "当前 Prompt 版本缺少实验账本，自动放量不会擅自启动灰度。",
      riskLevel: "cinnabar",
      config: currentConfig,
      changes: [],
      signals,
    };
  }

  const riskReasons: string[] = [];
  if (input.assessment.ledgerDecision && input.assessment.ledgerDecision !== "keep") {
    riskReasons.push(`账本决策为 ${input.assessment.ledgerDecision}`);
  }
  if ((input.assessment.deltaTotalScore ?? 0) < 0) {
    riskReasons.push(`离线总分 Delta ${input.assessment.deltaTotalScore?.toFixed(2) ?? "--"}`);
  }
  if (input.assessment.failedCaseCount >= 3) {
    riskReasons.push(`失败样本 ${input.assessment.failedCaseCount} 条`);
  }
  if (input.assessment.feedbackCount >= 3 && input.assessment.observedViralScore !== null && input.assessment.observedViralScore < 55) {
    riskReasons.push(`爆款潜力 ${input.assessment.observedViralScore.toFixed(2)}`);
  }
  if (input.assessment.feedbackCount >= 3 && input.assessment.openRate !== null && input.assessment.openRate < 10) {
    riskReasons.push(`打开率 ${input.assessment.openRate.toFixed(1)}%`);
  }
  if (input.assessment.feedbackCount >= 3 && input.assessment.readCompletionRate !== null && input.assessment.readCompletionRate < 18) {
    riskReasons.push(`读完率 ${input.assessment.readCompletionRate.toFixed(1)}%`);
  }
  if (riskReasons.length > 0) {
    const nextConfig = {
      ...currentConfig,
      rolloutObserveOnly: true,
      rolloutPercentage: 0,
    };
    const changes: string[] = [];
    if (!currentConfig.rolloutObserveOnly) changes.push("收回到观察优先");
    if (currentConfig.rolloutPercentage !== 0) changes.push("命中比例归零");
    return {
      status:
        nextConfig.rolloutObserveOnly === currentConfig.rolloutObserveOnly
        && nextConfig.rolloutPercentage === currentConfig.rolloutPercentage
          ? "noop"
          : "apply",
      reason: `检测到明显风险信号：${riskReasons.join("、")}。`,
      riskLevel: "cinnabar",
      config: nextConfig,
      changes,
      signals,
    };
  }

  if (input.assessment.feedbackCount === 0) {
    if (!currentConfig.rolloutObserveOnly && currentConfig.rolloutPercentage === 0 && currentConfig.rolloutPlanCodes.length === 0) {
      return {
        status: "apply",
        reason: "账本已保留但尚无真实回流，先从观察优先开始首轮观察。",
        riskLevel: "amber",
        config: {
          ...currentConfig,
          rolloutObserveOnly: true,
          rolloutPercentage: 0,
        },
        changes: ["首轮观察切到观察优先"],
        signals,
      };
    }
    const cappedPercentage = Math.min(currentConfig.rolloutPercentage, 5);
    return {
      status: cappedPercentage !== currentConfig.rolloutPercentage ? "apply" : "noop",
      reason: "尚无真实回流，当前只允许观察优先或最多 5% 的首轮试水。",
      riskLevel: "amber",
      config: {
        ...currentConfig,
        rolloutPercentage: cappedPercentage,
      },
      changes: cappedPercentage !== currentConfig.rolloutPercentage ? ["首轮观察阶段把比例上限收回到 5%"] : [],
      signals,
    };
  }

  if (input.assessment.feedbackCount < 3) {
    const cappedPercentage = Math.min(currentConfig.rolloutPercentage, 10);
    return {
      status: cappedPercentage !== currentConfig.rolloutPercentage ? "apply" : "noop",
      reason: "真实回流不足 3 条，灰度比例维持在 10% 以内更稳妥。",
      riskLevel: "amber",
      config: {
        ...currentConfig,
        rolloutPercentage: cappedPercentage,
      },
      changes: cappedPercentage !== currentConfig.rolloutPercentage ? ["回流样本不足 3 条，比例回收到 10%"] : [],
      signals,
    };
  }

  if (input.assessment.uniqueUsers < 20 || input.assessment.totalHitCount < 50) {
    const cappedPercentage = Math.min(currentConfig.rolloutPercentage, 20);
    return {
      status: cappedPercentage !== currentConfig.rolloutPercentage ? "apply" : "noop",
      reason: "当前覆盖用户或命中量仍偏少，先把比例上限控制在 20%。",
      riskLevel: "amber",
      config: {
        ...currentConfig,
        rolloutPercentage: cappedPercentage,
      },
      changes: cappedPercentage !== currentConfig.rolloutPercentage ? ["样本覆盖不足，比例回收到 20%"] : [],
      signals,
    };
  }

  const strongEnough =
    (input.assessment.deltaTotalScore ?? 0) >= 0
    && (input.assessment.observedViralScore ?? 0) >= STRONG_ROLLOUT_SIGNAL_THRESHOLD.observedViralScore
    && (input.assessment.openRate ?? 0) >= STRONG_ROLLOUT_SIGNAL_THRESHOLD.openRate
    && (input.assessment.readCompletionRate ?? 0) >= STRONG_ROLLOUT_SIGNAL_THRESHOLD.readCompletionRate;
  if (!strongEnough) {
    return {
      status: "noop",
      reason: "线上结果尚未达到自动扩量阈值，继续维持当前灰度窗口。",
      riskLevel: "amber",
      config: currentConfig,
      changes: [],
      signals,
    };
  }

  let nextConfig = currentConfig;
  const changes: string[] = [];
  if (currentConfig.rolloutObserveOnly || currentConfig.rolloutPercentage < 5) {
    nextConfig = {
      ...currentConfig,
      rolloutObserveOnly: false,
      rolloutPercentage: 5,
    };
    changes.push(currentConfig.rolloutObserveOnly ? "从观察优先放开到 5% 试水" : "补齐到 5% 起始灰度");
  } else if (currentConfig.rolloutPercentage < 15) {
    nextConfig = {
      ...currentConfig,
      rolloutPercentage: 15,
    };
    changes.push("放量到 15%");
  } else if (currentConfig.rolloutPercentage < 25) {
    nextConfig = {
      ...currentConfig,
      rolloutPercentage: 25,
    };
    changes.push("放量到 25%");
  } else if (
    currentConfig.rolloutPercentage < 35
    && input.assessment.feedbackCount >= 8
    && input.assessment.uniqueUsers >= 50
    && input.assessment.totalHitCount >= 120
    && (input.assessment.observedViralScore ?? 0) >= 72
    && (input.assessment.openRate ?? 0) >= 16
    && (input.assessment.readCompletionRate ?? 0) >= 26
  ) {
    nextConfig = {
      ...currentConfig,
      rolloutPercentage: 35,
    };
    changes.push("二次验证通过，放量到 35%");
  }

  return {
    status:
      nextConfig.rolloutObserveOnly === currentConfig.rolloutObserveOnly
      && nextConfig.rolloutPercentage === currentConfig.rolloutPercentage
        ? "noop"
        : "apply",
    reason: "离线分数与线上打开/留存均已通过谨慎放量阈值，可按小步进策略自动扩量。",
    riskLevel: "emerald",
    config: nextConfig,
    changes,
    signals,
  };
}

export async function autoManagePromptRollouts(input?: {
  promptId?: string | null;
  force?: boolean;
  cooldownHours?: number;
  limit?: number;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const limit = Math.min(50, Math.max(1, Math.round(Number(input?.limit ?? 24))));
  const cooldownHours = Math.max(0, Number(input?.cooldownHours ?? PROMPT_ROLLOUT_AUTO_MANAGE_COOLDOWN_HOURS) || PROMPT_ROLLOUT_AUTO_MANAGE_COOLDOWN_HOURS);
  const force = Boolean(input?.force);
  const promptId = String(input?.promptId || "").trim();
  const rows = await db.query<PromptVersionRolloutRow>(
    `SELECT id, prompt_id, version, name, is_active, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json, created_at, updated_at
     FROM prompt_versions
     WHERE auto_mode = ? AND is_active = ? ${promptId ? "AND prompt_id = ?" : ""}
     ORDER BY updated_at ASC, id ASC
     LIMIT ${limit}`,
    promptId ? ["recommendation", false, promptId] : ["recommendation", false],
  );
  const assessments = await getPromptRolloutAssessments({
    refs: rows.map((item) => `${item.prompt_id}@${item.version}`),
  });
  const assessmentMap = new Map(assessments.map((item) => [item.ref, item]));

  const items = [] as Array<{
    id: number;
    promptId: string;
    version: string;
    action: "applied" | "noop";
    autoMode: PromptRolloutAutoMode;
    reason: string;
    riskLevel: "stone" | "amber" | "emerald" | "cinnabar";
    cooldownSkipped: boolean;
    previousConfig: {
      rolloutObserveOnly: boolean;
      rolloutPercentage: number;
      rolloutPlanCodes: string[];
    };
    nextConfig: {
      rolloutObserveOnly: boolean;
      rolloutPercentage: number;
      rolloutPlanCodes: string[];
    };
    changes: string[];
    signals: PromptRolloutAutoPlan["signals"];
  }>;
  let appliedCount = 0;

  for (const row of rows) {
    const ref = `${row.prompt_id}@${row.version}`;
    const rolloutPlanCodes = parsePlanCodes(row.rollout_plan_codes_json);
    const previousConfig = {
      rolloutObserveOnly: Boolean(row.rollout_observe_only),
      rolloutPercentage: toRoundedPercentage(row.rollout_percentage),
      rolloutPlanCodes,
    };
    const autoMode = normalizePromptRolloutAutoMode(row.auto_mode);
    const updatedAtMs = parseIsoTime(row.updated_at || row.created_at);
    const cooldownSkipped = !force && updatedAtMs !== null && Date.now() - updatedAtMs < cooldownHours * 60 * 60 * 1000;
    if (cooldownSkipped) {
      const reason = `距离上次配置变更不足 ${cooldownHours} 小时，跳过本轮自动放量。`;
      await appendAuditLog({
        action: "prompt_rollout_auto_manage",
        targetType: "prompt_version",
        targetId: row.id,
        payload: {
          promptId: row.prompt_id,
          version: row.version,
          name: row.name,
          autoMode,
          managementAction: "cooldown_skip",
          reason,
          riskLevel: "stone",
          cooldownSkipped: true,
          changes: [],
          previousConfig,
          nextConfig: previousConfig,
          signals: {
            feedbackCount: 0,
            uniqueUsers: 0,
            totalHitCount: 0,
            deltaTotalScore: null,
            observedViralScore: null,
            openRate: null,
            readCompletionRate: null,
          },
        },
      });
      items.push({
        id: row.id,
        promptId: row.prompt_id,
        version: row.version,
        action: "noop",
        autoMode,
        reason,
        riskLevel: "stone",
        cooldownSkipped: true,
        previousConfig,
        nextConfig: previousConfig,
        changes: [],
        signals: {
          feedbackCount: 0,
          uniqueUsers: 0,
          totalHitCount: 0,
          deltaTotalScore: null,
          observedViralScore: null,
          openRate: null,
          readCompletionRate: null,
        },
      });
      continue;
    }

    const assessment = assessmentMap.get(ref) ?? {
      promptId: row.prompt_id,
      version: row.version,
      ref,
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
    };
    const plan = buildPromptRolloutAutoPlan({
      prompt: {
        isActive: Boolean(row.is_active),
        rolloutObserveOnly: Boolean(row.rollout_observe_only),
        rolloutPercentage: row.rollout_percentage,
        rolloutPlanCodes,
      },
      assessment,
    });
    const nextConfig = {
      rolloutObserveOnly: plan.config.rolloutObserveOnly,
      rolloutPercentage: toRoundedPercentage(plan.config.rolloutPercentage),
      rolloutPlanCodes: plan.config.rolloutPlanCodes,
    };
    if (plan.status === "apply") {
      await updatePromptVersionRolloutConfig({
        promptId: row.prompt_id,
        version: row.version,
        autoMode,
        rolloutObserveOnly: nextConfig.rolloutObserveOnly,
        rolloutPercentage: nextConfig.rolloutPercentage,
        rolloutPlanCodes: nextConfig.rolloutPlanCodes,
      });
      await appendAuditLog({
        action: "prompt_rollout_auto_manage",
        targetType: "prompt_version",
        targetId: row.id,
        payload: {
          promptId: row.prompt_id,
          version: row.version,
          name: row.name,
          autoMode,
          managementAction: "apply",
          reason: plan.reason,
          riskLevel: plan.riskLevel,
          cooldownSkipped: false,
          changes: plan.changes,
          previousConfig,
          nextConfig,
          signals: plan.signals,
        },
      });
      appliedCount += 1;
    } else {
      await appendAuditLog({
        action: "prompt_rollout_auto_manage",
        targetType: "prompt_version",
        targetId: row.id,
        payload: {
          promptId: row.prompt_id,
          version: row.version,
          name: row.name,
          autoMode,
          managementAction: "noop",
          reason: plan.reason,
          riskLevel: plan.riskLevel,
          cooldownSkipped: false,
          changes: plan.changes,
          previousConfig,
          nextConfig,
          signals: plan.signals,
        },
      });
    }

    items.push({
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      action: plan.status === "apply" ? "applied" : "noop",
      autoMode,
      reason: plan.reason,
      riskLevel: plan.riskLevel,
      cooldownSkipped: false,
      previousConfig,
      nextConfig,
      changes: plan.changes,
      signals: plan.signals,
    });
  }

  return {
    total: rows.length,
    appliedCount,
    items,
  };
}
