import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { getLayoutStrategyById } from "./marketplace";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { WRITING_EVAL_APPLY_COMMAND_TEMPLATES } from "./writing-eval-assets";
import { getArticleOutcomeVersionSummaries } from "./writing-eval";

export type WritingRolloutContext = {
  userId?: number | null;
  role?: string | null;
  planCode?: string | null;
};

export type WritingRolloutAssetType = "layout_strategy" | "apply_command_template" | "scoring_profile";
export type WritingRolloutAutoMode = "manual" | "recommendation";

type WritingAssetRolloutRow = {
  id: number;
  asset_type: WritingRolloutAssetType;
  asset_ref: string;
  auto_mode: string | null;
  rollout_observe_only: number | boolean;
  rollout_percentage: number;
  rollout_plan_codes_json: string | null;
  is_enabled: number | boolean;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type WritingActiveAssetRow = {
  id: number;
  asset_type: "layout_strategy" | "apply_command_template";
  asset_ref: string;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

type WritingAssetRolloutObservationRow = {
  asset_type: WritingRolloutAssetType;
  asset_ref: string;
  unique_user_count: number;
  total_hit_count: number;
  last_hit_at: string | null;
  observe_user_count: number;
  plan_user_count: number;
  percentage_user_count: number;
  stable_user_count: number;
};

type WritingOptimizationVersionAdmissionRow = {
  id: number;
  version_type: string;
  source_version?: string | null;
  candidate_content: string;
  decision: string;
  score_summary_json: string | Record<string, unknown>;
  created_at: string;
};

type WritingRolloutSummary = {
  feedbackCount: number;
  averageObservedViralScore: number | null;
  averageOpenRate: number | null;
  averageReadCompletionRate: number | null;
  averageShareRate: number | null;
  averageFavoriteRate: number | null;
};

type WritingRolloutAssessment = {
  version: WritingOptimizationVersionAdmissionRow | null;
  scoreSummary: Record<string, unknown>;
  outcomeSummary: WritingRolloutSummary | null;
  rolloutStats: WritingAssetRolloutObservationRow | null;
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
};

type WritingRolloutAutoPlan = {
  status: "noop" | "apply";
  reason: string;
  riskLevel: "stone" | "amber" | "emerald" | "cinnabar";
  config: {
    isEnabled: boolean;
    rolloutObserveOnly: boolean;
    rolloutPercentage: number;
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

const WRITING_ROLLOUT_AUTO_MANAGE_COOLDOWN_HOURS = 12;
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

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeWritingRolloutAutoMode(value: unknown, fallback: WritingRolloutAutoMode = "manual"): WritingRolloutAutoMode {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "recommendation" ? "recommendation" : fallback;
}

function parseIsoTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function classifyResolutionReason(reason: string) {
  if (reason.startsWith("observe")) return "observe";
  if (reason.startsWith("plan:")) return "plan";
  if (reason.startsWith("percentage:")) return "percentage";
  return "stable";
}

function getRolloutMatchReason(
  row: {
    rollout_observe_only: number | boolean;
    rollout_percentage: number;
    rollout_plan_codes_json: string | null;
  },
  context?: WritingRolloutContext,
) {
  if (!context) return false;
  const planCodes = parsePlanCodes(row.rollout_plan_codes_json);
  if (Boolean(row.rollout_observe_only) && context.role === "ops") {
    return "observe";
  }
  if (context.planCode && planCodes.includes(context.planCode)) {
    return `plan:${context.planCode}`;
  }
  const rolloutPercentage = Number(row.rollout_percentage || 0);
  if (rolloutPercentage > 0 && typeof context.userId === "number") {
    return Math.abs(context.userId) % 100 < rolloutPercentage ? `percentage:${rolloutPercentage}` : false;
  }
  return false;
}

async function recordWritingAssetObservation(input: {
  assetType: WritingRolloutAssetType;
  assetRef: string;
  context?: WritingRolloutContext;
  resolutionMode: "active" | "rollout";
  resolutionReason: string;
}) {
  if (typeof input.context?.userId !== "number") {
    return;
  }
  const db = getDatabase();
  const now = new Date().toISOString();
  const bucket = Math.abs(input.context.userId) % 100;
  const reasonGroup = classifyResolutionReason(input.resolutionReason);
  const metricDate = currentUtcDate();
  await db.exec(
    `INSERT INTO writing_asset_rollout_observations (
      asset_type, asset_ref, user_id, role, plan_code, resolution_mode, resolution_reason, user_bucket, hit_count, first_hit_at, last_hit_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_type, asset_ref, user_id)
    DO UPDATE SET
      role = excluded.role,
      plan_code = excluded.plan_code,
      resolution_mode = excluded.resolution_mode,
      resolution_reason = excluded.resolution_reason,
      user_bucket = excluded.user_bucket,
      hit_count = writing_asset_rollout_observations.hit_count + 1,
      last_hit_at = excluded.last_hit_at,
      updated_at = excluded.updated_at`,
    [
      input.assetType,
      input.assetRef,
      input.context.userId,
      input.context.role ?? null,
      input.context.planCode ?? null,
      input.resolutionMode,
      input.resolutionReason,
      bucket,
      1,
      now,
      now,
      now,
      now,
    ],
  );
  await db.exec(
    `INSERT INTO writing_asset_rollout_daily_metrics (
      asset_type, asset_ref, metric_date, total_hit_count, observe_hit_count, plan_hit_count, percentage_hit_count, stable_hit_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_type, asset_ref, metric_date)
    DO UPDATE SET
      total_hit_count = writing_asset_rollout_daily_metrics.total_hit_count + 1,
      observe_hit_count = writing_asset_rollout_daily_metrics.observe_hit_count + ?,
      plan_hit_count = writing_asset_rollout_daily_metrics.plan_hit_count + ?,
      percentage_hit_count = writing_asset_rollout_daily_metrics.percentage_hit_count + ?,
      stable_hit_count = writing_asset_rollout_daily_metrics.stable_hit_count + ?,
      updated_at = ?`,
    [
      input.assetType,
      input.assetRef,
      metricDate,
      1,
      reasonGroup === "observe" ? 1 : 0,
      reasonGroup === "plan" ? 1 : 0,
      reasonGroup === "percentage" ? 1 : 0,
      reasonGroup === "stable" ? 1 : 0,
      now,
      now,
      reasonGroup === "observe" ? 1 : 0,
      reasonGroup === "plan" ? 1 : 0,
      reasonGroup === "percentage" ? 1 : 0,
      reasonGroup === "stable" ? 1 : 0,
      now,
    ],
  );
}

async function getEnabledWritingAssetRollout(assetType: WritingRolloutAssetType) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<WritingAssetRolloutRow>(
    `SELECT id, asset_type, asset_ref, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json,
            is_enabled, notes, created_by, created_at, updated_at
     FROM writing_asset_rollouts
     WHERE asset_type = ? AND is_enabled = ?
     ORDER BY updated_at DESC, id DESC`,
    [assetType, true],
  );
}

async function getActiveWritingAsset(assetType: "layout_strategy" | "apply_command_template") {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.queryOne<WritingActiveAssetRow>(
    `SELECT id, asset_type, asset_ref, updated_by, created_at, updated_at
     FROM writing_active_assets
     WHERE asset_type = ?
     LIMIT 1`,
    [assetType],
  );
}

export async function getActiveWritingAssetRef(assetType: "layout_strategy" | "apply_command_template") {
  const active = await getActiveWritingAsset(assetType);
  return active?.asset_ref ?? null;
}

async function assertWritingActiveAssetRef(input: {
  assetType: "layout_strategy" | "apply_command_template";
  assetRef: string;
}) {
  const assetRef = String(input.assetRef || "").trim();
  if (!assetRef) {
    throw new Error("活跃写作资产引用不能为空");
  }
  if (input.assetType === "layout_strategy") {
    const layoutStrategyId = Number(assetRef);
    if (!Number.isInteger(layoutStrategyId) || layoutStrategyId <= 0) {
      throw new Error("写作风格资产引用无效");
    }
    const layoutStrategy = await getLayoutStrategyById(layoutStrategyId);
    if (!layoutStrategy) {
      throw new Error("写作风格资产不存在");
    }
    return assetRef;
  }
  if (!WRITING_EVAL_APPLY_COMMAND_TEMPLATES.some((item) => item.code === assetRef)) {
    throw new Error("apply_command_template 不存在");
  }
  return assetRef;
}

export async function activateWritingActiveAsset(input: {
  assetType: "layout_strategy" | "apply_command_template";
  assetRef: string;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const assetRef = await assertWritingActiveAssetRef(input);
  const now = new Date().toISOString();
  const existing = await getActiveWritingAsset(input.assetType);
  if (existing) {
    await db.exec(
      `UPDATE writing_active_assets
       SET asset_ref = ?, updated_by = ?, updated_at = ?
       WHERE asset_type = ?`,
      [assetRef, input.operatorUserId ?? null, now, input.assetType],
    );
  } else {
    await db.exec(
      `INSERT INTO writing_active_assets (asset_type, asset_ref, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [input.assetType, assetRef, input.operatorUserId ?? null, now, now],
    );
  }
  return { assetType: input.assetType, assetRef };
}

async function resolveWritingAssetRollout(assetType: WritingRolloutAssetType, context?: WritingRolloutContext) {
  const rows = await getEnabledWritingAssetRollout(assetType);
  const matched =
    rows
      .map((row) => ({
        row,
        reason: getRolloutMatchReason(row, context),
      }))
      .find((item) => Boolean(item.reason)) ?? null;
  if (!matched) return null;
  return {
    row: matched.row,
    resolutionMode: "rollout" as const,
    resolutionReason: String(matched.reason),
  };
}

export async function loadRolledOutLayoutStrategy(context?: WritingRolloutContext) {
  const resolved = await resolveWritingAssetRollout("layout_strategy", context);
  const assetRef = resolved?.row.asset_ref ?? (await getActiveWritingAssetRef("layout_strategy"));
  const resolutionMode: "active" | "rollout" = resolved?.resolutionMode ?? "active";
  const resolutionReason = resolved?.resolutionReason ?? "stable";
  if (!assetRef) return null;
  const layoutStrategyId = Number(assetRef);
  if (!Number.isInteger(layoutStrategyId) || layoutStrategyId <= 0) return null;
  const layoutStrategy = await getLayoutStrategyById(layoutStrategyId);
  if (!layoutStrategy) return null;
  await recordWritingAssetObservation({
    assetType: "layout_strategy",
    assetRef,
    context,
    resolutionMode,
    resolutionReason,
  });
  return {
    id: layoutStrategy.id,
    code: layoutStrategy.code,
    name: layoutStrategy.name,
    config: JSON.parse(layoutStrategy.config_json) as Record<string, unknown>,
    resolutionMode,
    resolutionReason,
  };
}

export async function loadRolledOutApplyCommandTemplate(context?: WritingRolloutContext) {
  const resolved = await resolveWritingAssetRollout("apply_command_template", context);
  const assetRef = resolved?.row.asset_ref ?? (await getActiveWritingAssetRef("apply_command_template")) ?? "deep_default_v1";
  const resolutionMode: "active" | "rollout" = resolved?.resolutionMode ?? "active";
  const resolutionReason = resolved?.resolutionReason ?? "stable";
  const template = WRITING_EVAL_APPLY_COMMAND_TEMPLATES.find((item) => item.code === assetRef);
  if (!template) return null;
  await recordWritingAssetObservation({
    assetType: "apply_command_template",
    assetRef,
    context,
    resolutionMode,
    resolutionReason,
  });
  return {
    ...template,
    resolutionMode,
    resolutionReason,
  };
}

export async function listWritingAssetRollouts() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [rows, stats, activeRows] = await Promise.all([
    db.query<WritingAssetRolloutRow>(
      `SELECT id, asset_type, asset_ref, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json,
              is_enabled, notes, created_by, created_at, updated_at
       FROM writing_asset_rollouts
       ORDER BY updated_at DESC, id DESC`,
    ),
    db.query<WritingAssetRolloutObservationRow>(
      `SELECT asset_type, asset_ref,
              COUNT(DISTINCT user_id) AS unique_user_count,
              COALESCE(SUM(hit_count), 0) AS total_hit_count,
              MAX(last_hit_at) AS last_hit_at,
              COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'observe%' THEN user_id END) AS observe_user_count,
              COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'plan:%' THEN user_id END) AS plan_user_count,
              COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'percentage:%' THEN user_id END) AS percentage_user_count,
              COUNT(DISTINCT CASE WHEN resolution_reason = 'stable' THEN user_id END) AS stable_user_count
       FROM writing_asset_rollout_observations
       GROUP BY asset_type, asset_ref`,
    ),
    db.query<WritingActiveAssetRow>(
      `SELECT id, asset_type, asset_ref, updated_by, created_at, updated_at
       FROM writing_active_assets`,
    ),
  ]);
  const statMap = new Map(stats.map((item) => [`${item.asset_type}@@${item.asset_ref}`, item]));
  const activeMap = new Map(activeRows.map((item) => [item.asset_type, item.asset_ref]));
  return rows.map((row) => ({
    id: row.id,
    assetType: row.asset_type,
    assetRef: row.asset_ref,
    autoMode: normalizeWritingRolloutAutoMode(row.auto_mode),
    rolloutObserveOnly: Boolean(row.rollout_observe_only),
    rolloutPercentage: row.rollout_percentage,
    rolloutPlanCodes: parsePlanCodes(row.rollout_plan_codes_json),
    isEnabled: Boolean(row.is_enabled),
    isActive: activeMap.get(row.asset_type as "layout_strategy" | "apply_command_template") === row.asset_ref,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stats: statMap.get(`${row.asset_type}@@${row.asset_ref}`) ?? null,
  }));
}

export async function getWritingAssetRollout(assetType: WritingRolloutAssetType, assetRef: string) {
  await ensureExtendedProductSchema();
  const all = await listWritingAssetRollouts();
  return all.find((item) => item.assetType === assetType && item.assetRef === assetRef) ?? null;
}

async function validateWritingAssetRolloutAdmission(input: {
  assetType: WritingRolloutAssetType;
  assetRef: string;
  isEnabled: boolean;
  rolloutObserveOnly: boolean;
  rolloutPercentage: number;
}) {
  if (!input.isEnabled) {
    return { canEnable: true, blockers: [] as string[] };
  }

  await ensureExtendedProductSchema();
  const db = getDatabase();
  const version = await db.queryOne<WritingOptimizationVersionAdmissionRow>(
    `SELECT id, version_type, candidate_content, decision, score_summary_json, created_at
     FROM writing_optimization_versions
     WHERE version_type = ? AND candidate_content = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [input.assetType, input.assetRef],
  );
  if (!version) {
    return {
      canEnable: false,
      blockers: ["当前灰度对象没有对应的写作实验账本，不能直接启用灰度。"],
    };
  }

  const blockers: string[] = [];
  if (version.decision !== "keep") {
    blockers.push(`当前版本账本决策为 ${version.decision}，仅 keep 版本允许启用灰度。`);
  }

  const scoreSummary = parseJsonObject(version.score_summary_json);
  const deltaTotalScore = getNumber(scoreSummary.deltaTotalScore);
  const failedCaseCount = getNumber(scoreSummary.failedCaseCount) ?? 0;

  if ((deltaTotalScore ?? 0) < 0) {
    blockers.push(`离线总分 Delta 为 ${deltaTotalScore?.toFixed(2) ?? "--"}，候选版本尚未稳定优于基线。`);
  }
  if (failedCaseCount >= 3) {
    blockers.push(`离线失败样本 ${failedCaseCount} 条，需先处理退化问题再启用灰度。`);
  }

  const outcomeSummary = (await getArticleOutcomeVersionSummaries([{ versionType: input.assetType, candidateContent: input.assetRef }]))[0] ?? null;
  const rolloutStats = await db.queryOne<WritingAssetRolloutObservationRow>(
    `SELECT asset_type, asset_ref,
            COUNT(DISTINCT user_id) AS unique_user_count,
            COALESCE(SUM(hit_count), 0) AS total_hit_count,
            MAX(last_hit_at) AS last_hit_at,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'observe%' THEN user_id END) AS observe_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'plan:%' THEN user_id END) AS plan_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'percentage:%' THEN user_id END) AS percentage_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason = 'stable' THEN user_id END) AS stable_user_count
     FROM writing_asset_rollout_observations
     WHERE asset_type = ? AND asset_ref = ?
     GROUP BY asset_type, asset_ref`,
    [input.assetType, input.assetRef],
  );
  const feedbackCount = outcomeSummary?.feedbackCount ?? 0;
  const averageObservedViralScore = outcomeSummary?.averageObservedViralScore ?? null;
  const averageOpenRate = outcomeSummary?.averageOpenRate ?? null;
  const averageReadCompletionRate = outcomeSummary?.averageReadCompletionRate ?? null;
  const uniqueUsers = rolloutStats?.unique_user_count ?? 0;
  const totalHitCount = rolloutStats?.total_hit_count ?? 0;

  if (feedbackCount >= 3 && averageObservedViralScore !== null && averageObservedViralScore < 55) {
    blockers.push(`线上爆款潜力均值仅 ${averageObservedViralScore.toFixed(2)}，当前不允许继续启用放量。`);
  }
  if (feedbackCount >= 3 && averageOpenRate !== null && averageOpenRate < 10) {
    blockers.push(`平均打开率 ${averageOpenRate.toFixed(1)}% 偏低，需先回到实验侧继续优化。`);
  }
  if (feedbackCount >= 3 && averageReadCompletionRate !== null && averageReadCompletionRate < 18) {
    blockers.push(`平均读完率 ${averageReadCompletionRate.toFixed(1)}% 偏低，当前不满足灰度放量门槛。`);
  }

  if (feedbackCount === 0 && !input.rolloutObserveOnly && input.rolloutPercentage > 5) {
    blockers.push("尚未经过首轮线上观察时，首次灰度只允许观察优先或不超过 5% 的试水流量。");
  }
  if (feedbackCount < 3 && !input.rolloutObserveOnly && input.rolloutPercentage > 10) {
    blockers.push("真实回流不足 3 条前，灰度比例不能超过 10%。");
  }
  if ((uniqueUsers < 20 || totalHitCount < 50) && !input.rolloutObserveOnly && input.rolloutPercentage > 20) {
    blockers.push("样本覆盖不足 20 人 / 50 次命中前，不允许把灰度比例提升到 20% 以上。");
  }

  return {
    canEnable: blockers.length === 0,
    blockers,
  };
}

export async function upsertWritingAssetRollout(input: {
  assetType: WritingRolloutAssetType;
  assetRef: string;
  autoMode?: WritingRolloutAutoMode | string | null;
  rolloutObserveOnly?: boolean;
  rolloutPercentage?: number;
  rolloutPlanCodes?: string[];
  isEnabled?: boolean;
  notes?: string | null;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const assetType = input.assetType;
  const assetRef = String(input.assetRef || "").trim();
  if (!assetRef) {
    throw new Error("灰度对象引用不能为空");
  }
  const autoMode = normalizeWritingRolloutAutoMode(input.autoMode);
  const rolloutPercentage = toRoundedPercentage(input.rolloutPercentage ?? 0);
  const rolloutPlanCodes = Array.from(new Set((input.rolloutPlanCodes ?? []).map((item) => String(item || "").trim()).filter(Boolean)));
  const admission = await validateWritingAssetRolloutAdmission({
    assetType,
    assetRef,
    isEnabled: input.isEnabled ?? true,
    rolloutObserveOnly: input.rolloutObserveOnly ?? false,
    rolloutPercentage,
  });
  if (!admission.canEnable) {
    throw new Error(admission.blockers[0] || "当前灰度配置未通过服务端准入校验");
  }
  const exists = await db.queryOne<{ id: number }>(
    `SELECT id FROM writing_asset_rollouts WHERE asset_type = ? AND asset_ref = ?`,
    [assetType, assetRef],
  );
  if (exists) {
    await db.exec(
      `UPDATE writing_asset_rollouts
       SET auto_mode = ?, rollout_observe_only = ?, rollout_percentage = ?, rollout_plan_codes_json = ?, is_enabled = ?, notes = ?, created_by = ?, updated_at = ?
       WHERE id = ?`,
      [
        autoMode,
        input.rolloutObserveOnly ?? false,
        rolloutPercentage,
        rolloutPlanCodes,
        input.isEnabled ?? true,
        String(input.notes || "").trim() || null,
        input.operatorUserId ?? null,
        now,
        exists.id,
      ],
    );
  } else {
    await db.exec(
      `INSERT INTO writing_asset_rollouts (
        asset_type, asset_ref, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json, is_enabled, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assetType,
        assetRef,
        autoMode,
        input.rolloutObserveOnly ?? false,
        rolloutPercentage,
        rolloutPlanCodes,
        input.isEnabled ?? true,
        String(input.notes || "").trim() || null,
        input.operatorUserId ?? null,
        now,
        now,
      ],
    );
  }
  return getWritingAssetRollout(assetType, assetRef);
}

async function getWritingAssetRolloutStats(assetType: WritingRolloutAssetType, assetRef: string) {
  const db = getDatabase();
  return db.queryOne<WritingAssetRolloutObservationRow>(
    `SELECT asset_type, asset_ref,
            COUNT(DISTINCT user_id) AS unique_user_count,
            COALESCE(SUM(hit_count), 0) AS total_hit_count,
            MAX(last_hit_at) AS last_hit_at,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'observe%' THEN user_id END) AS observe_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'plan:%' THEN user_id END) AS plan_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'percentage:%' THEN user_id END) AS percentage_user_count,
            COUNT(DISTINCT CASE WHEN resolution_reason = 'stable' THEN user_id END) AS stable_user_count
     FROM writing_asset_rollout_observations
     WHERE asset_type = ? AND asset_ref = ?
     GROUP BY asset_type, asset_ref`,
    [assetType, assetRef],
  );
}

async function getLatestWritingOptimizationVersion(assetType: WritingRolloutAssetType, assetRef: string) {
  const db = getDatabase();
  return db.queryOne<WritingOptimizationVersionAdmissionRow>(
    `SELECT id, version_type, source_version, candidate_content, decision, score_summary_json, created_at
     FROM writing_optimization_versions
     WHERE version_type = ? AND candidate_content = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [assetType, assetRef],
  );
}

async function getWritingAssetRolloutAssessment(assetType: WritingRolloutAssetType, assetRef: string): Promise<WritingRolloutAssessment> {
  const version = await getLatestWritingOptimizationVersion(assetType, assetRef);
  const scoreSummary = parseJsonObject(version?.score_summary_json);
  const [outcomeSummary, rolloutStats] = await Promise.all([
    (await getArticleOutcomeVersionSummaries([{ versionType: assetType, candidateContent: assetRef }]))[0] ?? null,
    getWritingAssetRolloutStats(assetType, assetRef),
  ]);
  return {
    version: version ?? null,
    scoreSummary,
    outcomeSummary,
    rolloutStats: rolloutStats ?? null,
    deltaTotalScore: getNumber(scoreSummary.deltaTotalScore),
    failedCaseCount: getNumber(scoreSummary.failedCaseCount) ?? 0,
    feedbackCount: outcomeSummary?.feedbackCount ?? 0,
    observedViralScore: outcomeSummary?.averageObservedViralScore ?? null,
    openRate: outcomeSummary?.averageOpenRate ?? null,
    readCompletionRate: outcomeSummary?.averageReadCompletionRate ?? null,
    shareRate: outcomeSummary?.averageShareRate ?? null,
    favoriteRate: outcomeSummary?.averageFavoriteRate ?? null,
    uniqueUsers: rolloutStats?.unique_user_count ?? 0,
    totalHitCount: rolloutStats?.total_hit_count ?? 0,
  };
}

function buildWritingAssetRolloutAutoPlan(input: {
  rollout: Awaited<ReturnType<typeof getWritingAssetRollout>>;
  assessment: WritingRolloutAssessment;
}): WritingRolloutAutoPlan {
  const rollout = input.rollout;
  const assessment = input.assessment;
  const currentConfig = {
    isEnabled: Boolean(rollout?.isEnabled),
    rolloutObserveOnly: Boolean(rollout?.rolloutObserveOnly),
    rolloutPercentage: toRoundedPercentage(rollout?.rolloutPercentage ?? 0),
  };
  const signals = {
    feedbackCount: assessment.feedbackCount,
    uniqueUsers: assessment.uniqueUsers,
    totalHitCount: assessment.totalHitCount,
    deltaTotalScore: assessment.deltaTotalScore,
    observedViralScore: assessment.observedViralScore,
    openRate: assessment.openRate,
    readCompletionRate: assessment.readCompletionRate,
  };

  if (!rollout) {
    return {
      status: "noop",
      reason: "当前资产还没有灰度配置，不自动创建新放量规则。",
      riskLevel: "stone",
      config: currentConfig,
      changes: [],
      signals,
    };
  }

  if (!currentConfig.isEnabled) {
    return {
      status: "noop",
      reason: "当前灰度配置未启用，自动模式不会擅自恢复放量。",
      riskLevel: "stone",
      config: currentConfig,
      changes: [],
      signals,
    };
  }

  const version = assessment.version;
  if (!version) {
    return {
      status: "noop",
      reason: "当前资产缺少对应实验账本，自动放量不会继续推进。",
      riskLevel: "cinnabar",
      config: currentConfig,
      changes: [],
      signals,
    };
  }

  const riskReasons: string[] = [];
  if (version.decision !== "keep") {
    riskReasons.push(`账本决策为 ${version.decision}`);
  }
  if ((assessment.deltaTotalScore ?? 0) < 0) {
    riskReasons.push(`离线总分 Delta ${assessment.deltaTotalScore?.toFixed(2) ?? "--"}`);
  }
  if (assessment.failedCaseCount >= 3) {
    riskReasons.push(`失败样本 ${assessment.failedCaseCount} 条`);
  }
  if (assessment.feedbackCount >= 3 && assessment.observedViralScore !== null && assessment.observedViralScore < 55) {
    riskReasons.push(`爆款潜力 ${assessment.observedViralScore.toFixed(2)}`);
  }
  if (assessment.feedbackCount >= 3 && assessment.openRate !== null && assessment.openRate < 10) {
    riskReasons.push(`打开率 ${assessment.openRate.toFixed(1)}%`);
  }
  if (assessment.feedbackCount >= 3 && assessment.readCompletionRate !== null && assessment.readCompletionRate < 18) {
    riskReasons.push(`读完率 ${assessment.readCompletionRate.toFixed(1)}%`);
  }
  if (riskReasons.length > 0) {
    const nextConfig = {
      isEnabled: true,
      rolloutObserveOnly: true,
      rolloutPercentage: 0,
    };
    const changes: string[] = [];
    if (!currentConfig.rolloutObserveOnly) changes.push("收回到观察优先");
    if (currentConfig.rolloutPercentage !== 0) changes.push("命中比例归零");
    return {
      status:
        currentConfig.rolloutObserveOnly === nextConfig.rolloutObserveOnly
        && currentConfig.rolloutPercentage === nextConfig.rolloutPercentage
          ? "noop"
          : "apply",
      reason: `检测到明显风险信号：${riskReasons.join("、")}。`,
      riskLevel: "cinnabar",
      config: nextConfig,
      changes,
      signals,
    };
  }

  if (assessment.feedbackCount === 0) {
    const nextConfig = currentConfig.rolloutObserveOnly
      ? currentConfig
      : {
          ...currentConfig,
          rolloutPercentage: Math.min(currentConfig.rolloutPercentage, 5),
        };
    const changes = currentConfig.rolloutObserveOnly
      ? []
      : currentConfig.rolloutPercentage > 5
        ? ["首轮观察阶段把比例上限收回到 5%"]
        : [];
    return {
      status: changes.length > 0 ? "apply" : "noop",
      reason: "尚无真实回流，当前只允许观察优先或最多 5% 的首轮试水。",
      riskLevel: "amber",
      config: nextConfig,
      changes,
      signals,
    };
  }

  if (assessment.feedbackCount < 3) {
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

  if (assessment.uniqueUsers < 20 || assessment.totalHitCount < 50) {
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
    (assessment.deltaTotalScore ?? 0) >= 0
    && (assessment.observedViralScore ?? 0) >= STRONG_ROLLOUT_SIGNAL_THRESHOLD.observedViralScore
    && (assessment.openRate ?? 0) >= STRONG_ROLLOUT_SIGNAL_THRESHOLD.openRate
    && (assessment.readCompletionRate ?? 0) >= STRONG_ROLLOUT_SIGNAL_THRESHOLD.readCompletionRate;
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
  if (currentConfig.rolloutObserveOnly) {
    nextConfig = {
      isEnabled: true,
      rolloutObserveOnly: false,
      rolloutPercentage: 5,
    };
    changes.push("从观察优先放开到 5% 试水");
  } else if (currentConfig.rolloutPercentage < 5) {
    nextConfig = {
      ...currentConfig,
      rolloutPercentage: 5,
    };
    changes.push("补齐到 5% 起始灰度");
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
    && assessment.feedbackCount >= 8
    && assessment.uniqueUsers >= 50
    && assessment.totalHitCount >= 120
    && (assessment.observedViralScore ?? 0) >= 72
    && (assessment.openRate ?? 0) >= 16
    && (assessment.readCompletionRate ?? 0) >= 26
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

export async function autoManageWritingAssetRollouts(input?: {
  assetType?: WritingRolloutAssetType | string | null;
  force?: boolean;
  cooldownHours?: number;
  limit?: number;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const limit = Math.min(50, Math.max(1, Math.round(Number(input?.limit ?? 24))));
  const cooldownHours = Math.max(0, Number(input?.cooldownHours ?? WRITING_ROLLOUT_AUTO_MANAGE_COOLDOWN_HOURS) || WRITING_ROLLOUT_AUTO_MANAGE_COOLDOWN_HOURS);
  const force = Boolean(input?.force);
  const assetType = input?.assetType ? (String(input.assetType).trim() as WritingRolloutAssetType) : null;
  const rows = await db.query<WritingAssetRolloutRow>(
    `SELECT id, asset_type, asset_ref, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json,
            is_enabled, notes, created_by, created_at, updated_at
     FROM writing_asset_rollouts
     WHERE auto_mode = ? ${assetType ? "AND asset_type = ?" : ""}
     ORDER BY updated_at ASC, id ASC
     LIMIT ${limit}`,
    assetType ? ["recommendation", assetType] : ["recommendation"],
  );

  const items = [] as Array<{
    id: number;
    assetType: WritingRolloutAssetType;
    assetRef: string;
    action: "applied" | "noop";
    autoMode: WritingRolloutAutoMode;
    reason: string;
    riskLevel: "stone" | "amber" | "emerald" | "cinnabar";
    cooldownSkipped: boolean;
    previousConfig: {
      isEnabled: boolean;
      rolloutObserveOnly: boolean;
      rolloutPercentage: number;
    };
    nextConfig: {
      isEnabled: boolean;
      rolloutObserveOnly: boolean;
      rolloutPercentage: number;
    };
    changes: string[];
    signals: WritingRolloutAutoPlan["signals"];
  }>;
  let appliedCount = 0;

  for (const row of rows) {
    const updatedAtMs = parseIsoTime(row.updated_at);
    const cooldownSkipped = !force && updatedAtMs !== null && Date.now() - updatedAtMs < cooldownHours * 60 * 60 * 1000;
    const rollout = {
      id: row.id,
      assetType: row.asset_type,
      assetRef: row.asset_ref,
      autoMode: normalizeWritingRolloutAutoMode(row.auto_mode),
      rolloutObserveOnly: Boolean(row.rollout_observe_only),
      rolloutPercentage: row.rollout_percentage,
      rolloutPlanCodes: parsePlanCodes(row.rollout_plan_codes_json),
      isEnabled: Boolean(row.is_enabled),
      isActive: false,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stats: null,
    };
    const previousConfig = {
      isEnabled: rollout.isEnabled,
      rolloutObserveOnly: rollout.rolloutObserveOnly,
      rolloutPercentage: toRoundedPercentage(rollout.rolloutPercentage),
    };
    if (cooldownSkipped) {
      await appendAuditLog({
        action: "writing_asset_rollout_auto_manage",
        targetType: "writing_asset_rollout",
        targetId: row.id,
        payload: {
          assetType: row.asset_type,
          assetRef: row.asset_ref,
          autoMode: rollout.autoMode,
          managementAction: "cooldown_skip",
          reason: `距离上次配置变更不足 ${cooldownHours} 小时，跳过本轮自动放量。`,
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
        assetType: row.asset_type,
        assetRef: row.asset_ref,
        action: "noop",
        autoMode: rollout.autoMode,
        reason: `距离上次配置变更不足 ${cooldownHours} 小时，跳过本轮自动放量。`,
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

    const assessment = await getWritingAssetRolloutAssessment(row.asset_type, row.asset_ref);
    const plan = buildWritingAssetRolloutAutoPlan({
      rollout,
      assessment,
    });
    const nextConfig = {
      isEnabled: plan.config.isEnabled,
      rolloutObserveOnly: plan.config.rolloutObserveOnly,
      rolloutPercentage: toRoundedPercentage(plan.config.rolloutPercentage),
    };
    if (plan.status === "apply") {
      await upsertWritingAssetRollout({
        assetType: row.asset_type,
        assetRef: row.asset_ref,
        autoMode: rollout.autoMode,
        rolloutObserveOnly: nextConfig.rolloutObserveOnly,
        rolloutPercentage: nextConfig.rolloutPercentage,
        rolloutPlanCodes: rollout.rolloutPlanCodes,
        isEnabled: nextConfig.isEnabled,
        notes: [
          String(row.notes || "").trim(),
          `[auto-rollout ${new Date().toISOString()}] ${plan.reason}`,
        ]
          .filter(Boolean)
          .join("\n"),
        operatorUserId: null,
      });
      await appendAuditLog({
        action: "writing_asset_rollout_auto_manage",
        targetType: "writing_asset_rollout",
        targetId: row.id,
        payload: {
          assetType: row.asset_type,
          assetRef: row.asset_ref,
          autoMode: rollout.autoMode,
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
        action: "writing_asset_rollout_auto_manage",
        targetType: "writing_asset_rollout",
        targetId: row.id,
        payload: {
          assetType: row.asset_type,
          assetRef: row.asset_ref,
          autoMode: rollout.autoMode,
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
      assetType: row.asset_type,
      assetRef: row.asset_ref,
      action: plan.status === "apply" ? "applied" : "noop",
      autoMode: rollout.autoMode,
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
    scannedCount: rows.length,
    appliedCount,
    noopCount: items.length - appliedCount,
    cooldownHours,
    force,
    items,
  };
}
