import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type PromptLoadContext = {
  userId?: number | null;
  role?: string | null;
  planCode?: string | null;
};

export type PromptLoadMeta = {
  promptId: string;
  content: string;
  version: string;
  ref: string;
  resolutionMode: "active" | "rollout";
  resolutionReason: string;
};

const cache = new Map<string, PromptLoadMeta & { at: number }>();
const CACHE_TTL = 5 * 60 * 1000;

type PromptRow = {
  prompt_content: string;
  version: string;
  is_active: number | boolean;
  rollout_observe_only: number | boolean;
  rollout_percentage: number;
  rollout_plan_codes_json: string | null;
};

type PromptResolution = {
  row: PromptRow;
  resolutionMode: "active" | "rollout";
  resolutionReason: string;
};

function parsePlanCodes(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildCacheKey(promptId: string, context?: PromptLoadContext) {
  if (!context?.userId && !context?.role && !context?.planCode) {
    return `${promptId}:stable`;
  }
  const bucket = typeof context.userId === "number" ? Math.abs(context.userId) % 100 : "na";
  return `${promptId}:role=${context.role || "user"}:plan=${context.planCode || "free"}:bucket=${bucket}`;
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function classifyResolutionReason(reason: string) {
  if (reason.startsWith("observe")) return "observe";
  if (reason.startsWith("plan:")) return "plan";
  if (reason.startsWith("percentage:")) return "percentage";
  return "stable";
}

function isRolloutCandidate(row: {
  rollout_observe_only: number | boolean;
  rollout_percentage: number;
  rollout_plan_codes_json: string | null;
}) {
  const planCodes = parsePlanCodes(row.rollout_plan_codes_json);
  return Boolean(row.rollout_observe_only) || Number(row.rollout_percentage || 0) > 0 || planCodes.length > 0;
}

function getRolloutMatchReason(
  row: {
    rollout_observe_only: number | boolean;
    rollout_percentage: number;
    rollout_plan_codes_json: string | null;
  },
  context?: PromptLoadContext,
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

async function recordPromptObservation(input: {
  promptId: string;
  version: string;
  context?: PromptLoadContext;
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
    `INSERT INTO prompt_rollout_observations (
      prompt_id, version, user_id, role, plan_code, resolution_mode, resolution_reason, user_bucket, hit_count, first_hit_at, last_hit_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prompt_id, version, user_id)
    DO UPDATE SET
      role = excluded.role,
      plan_code = excluded.plan_code,
      resolution_mode = excluded.resolution_mode,
      resolution_reason = excluded.resolution_reason,
      user_bucket = excluded.user_bucket,
      hit_count = prompt_rollout_observations.hit_count + 1,
      last_hit_at = excluded.last_hit_at,
      updated_at = excluded.updated_at`,
    [
      input.promptId,
      input.version,
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
    `INSERT INTO prompt_rollout_daily_metrics (
      prompt_id, version, metric_date, total_hit_count, observe_hit_count, plan_hit_count, percentage_hit_count, stable_hit_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prompt_id, version, metric_date)
    DO UPDATE SET
      total_hit_count = prompt_rollout_daily_metrics.total_hit_count + 1,
      observe_hit_count = prompt_rollout_daily_metrics.observe_hit_count + ?,
      plan_hit_count = prompt_rollout_daily_metrics.plan_hit_count + ?,
      percentage_hit_count = prompt_rollout_daily_metrics.percentage_hit_count + ?,
      stable_hit_count = prompt_rollout_daily_metrics.stable_hit_count + ?,
      updated_at = ?`,
    [
      input.promptId,
      input.version,
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

function resolvePromptRow(promptRows: PromptRow[], context?: PromptLoadContext): PromptResolution | null {
  const activePrompt = promptRows.find((row) => Boolean(row.is_active)) ?? null;
  const rolloutPrompt =
    promptRows
      .map((row) => ({
        row,
        reason: !Boolean(row.is_active) && isRolloutCandidate(row) ? getRolloutMatchReason(row, context) : false,
      }))
      .find((item) => Boolean(item.reason)) ?? null;
  if (rolloutPrompt) {
    return {
      row: rolloutPrompt.row,
      resolutionMode: "rollout",
      resolutionReason: String(rolloutPrompt.reason),
    };
  }
  if (activePrompt) {
    return {
      row: activePrompt,
      resolutionMode: "active",
      resolutionReason: "stable",
    };
  }
  return null;
}

export async function loadPromptWithMeta(promptId: string, context?: PromptLoadContext): Promise<PromptLoadMeta> {
  await ensureExtendedProductSchema();
  const cacheKey = buildCacheKey(promptId, context);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    await recordPromptObservation({
      promptId,
      version: cached.version,
      context,
      resolutionMode: cached.resolutionMode,
      resolutionReason: cached.resolutionReason === "stable" ? "stable" : `${cached.resolutionReason}:cache`,
    });
    return {
      promptId: cached.promptId,
      content: cached.content,
      version: cached.version,
      ref: cached.ref,
      resolutionMode: cached.resolutionMode,
      resolutionReason: cached.resolutionReason,
    };
  }

  const db = getDatabase();
  const promptRows = await db.query<PromptRow>(
    `SELECT prompt_content, version, is_active, rollout_observe_only, rollout_percentage, rollout_plan_codes_json
     FROM prompt_versions
     WHERE prompt_id = ?
     ORDER BY is_active DESC, created_at DESC, id DESC`,
    [promptId],
  );

  const resolved = resolvePromptRow(promptRows, context);
  if (!resolved) {
    throw new Error(`Prompt not found: ${promptId}`);
  }

  cache.set(cacheKey, {
    promptId,
    content: resolved.row.prompt_content,
    version: resolved.row.version,
    ref: `${promptId}@${resolved.row.version}`,
    resolutionMode: resolved.resolutionMode,
    resolutionReason: resolved.resolutionReason,
    at: Date.now(),
  });
  await recordPromptObservation({
    promptId,
    version: resolved.row.version,
    context,
    resolutionMode: resolved.resolutionMode,
    resolutionReason: resolved.resolutionReason,
  });
  return {
    promptId,
    content: resolved.row.prompt_content,
    version: resolved.row.version,
    ref: `${promptId}@${resolved.row.version}`,
    resolutionMode: resolved.resolutionMode,
    resolutionReason: resolved.resolutionReason,
  };
}

export async function loadPrompt(promptId: string, context?: PromptLoadContext) {
  return (await loadPromptWithMeta(promptId, context)).content;
}

export function clearPromptCache(promptId?: string) {
  if (promptId) {
    for (const key of cache.keys()) {
      if (key === promptId || key.startsWith(`${promptId}:`)) {
        cache.delete(key);
      }
    }
    return;
  }
  cache.clear();
}
