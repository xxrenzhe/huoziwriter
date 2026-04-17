import { computeObservedOutcomeScore } from "./article-scorecard";
import { getDatabase } from "./db";
import { appendAuditLog } from "./audit";
import { activatePromptVersion } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { WRITING_EVAL_APPLY_COMMAND_TEMPLATES } from "./writing-eval-assets";
import { WRITING_EVAL_AGENT_STRATEGY_PRESETS, normalizeWritingEvalAgentStrategyCode } from "./writing-eval-config";
import { activateWritingActiveAsset, getActiveWritingAssetRef } from "./writing-rollout";

type WritingEvalDatasetRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sample_count: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type WritingEvalDatasetReadiness = {
  status: "ready" | "warning" | "blocked";
  enabledCaseCount: number;
  totalCaseCount: number;
  coverage: {
    readerProfile: number;
    targetEmotion: number;
    sourceFacts: number;
    knowledgeCards: number;
    historyReferences: number;
    titleGoal: number;
    hookGoal: number;
    shareTriggerGoal: number;
  };
  qualityTargets: {
    distinctTaskTypeCount: number;
    lightCount: number;
    mediumCount: number;
    hardCount: number;
    referenceGoodOutputCount: number;
    referenceBadPatternsCount: number;
    mustUseFactsCount: number;
  };
  blockers: string[];
  warnings: string[];
};

type WritingEvalCaseRow = {
  id: number;
  dataset_id: number;
  task_code: string;
  task_type: string;
  topic_title: string;
  input_payload_json: string | Record<string, unknown>;
  expected_constraints_json: string | Record<string, unknown>;
  viral_targets_json: string | Record<string, unknown>;
  stage_artifact_payloads_json: string | Record<string, unknown>;
  reference_good_output: string | null;
  reference_bad_patterns_json: string | unknown[];
  difficulty_level: string;
  is_enabled: number | boolean;
  created_at: string;
  updated_at: string;
};

type WritingOptimizationRunRow = {
  id: number;
  run_code: string;
  dataset_id: number;
  base_version_type: string;
  base_version_ref: string;
  candidate_version_type: string;
  candidate_version_ref: string;
  experiment_mode: string;
  trigger_mode: string;
  decision_mode: string;
  resolution_status: string;
  status: string;
  summary: string | null;
  score_summary_json: string | Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  resolved_at: string | null;
  created_by: number | null;
  created_at: string;
  dataset_name?: string;
};

type WritingEvalRunScheduleRow = {
  id: number;
  name: string;
  dataset_id: number;
  base_version_type: string;
  base_version_ref: string;
  candidate_version_type: string;
  candidate_version_ref: string;
  experiment_mode: string;
  trigger_mode: string;
  agent_strategy: string;
  decision_mode: string;
  priority: number;
  cadence_hours: number;
  next_run_at: string | null;
  last_dispatched_at: string | null;
  last_run_id: number | null;
  last_error: string | null;
  is_enabled: number | boolean;
  summary: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  dataset_name?: string | null;
  dataset_status?: string | null;
  last_run_code?: string | null;
  last_run_status?: string | null;
};

type WritingOptimizationResultRow = {
  id: number;
  run_id: number;
  case_id: number;
  generated_title: string | null;
  generated_lead: string | null;
  generated_markdown: string;
  style_score: number;
  language_score: number;
  density_score: number;
  emotion_score: number;
  structure_score: number;
  topic_momentum_score: number;
  headline_score: number;
  hook_score: number;
  shareability_score: number;
  reader_value_score: number;
  novelty_score: number;
  platform_fit_score: number;
  quality_score: number;
  viral_score: number;
  factual_risk_penalty: number;
  ai_noise_penalty: number;
  total_score: number;
  judge_payload_json: string | Record<string, unknown>;
  created_at: string;
  task_code?: string;
  task_type?: string;
  topic_title?: string;
  difficulty_level?: string;
};

type WritingOptimizationVersionRow = {
  id: number;
  version_type: string;
  target_key: string;
  source_version: string;
  candidate_content: string;
  score_summary_json: string | Record<string, unknown>;
  decision: string;
  decision_reason: string | null;
  approved_by: number | null;
  created_at: string;
};

type WritingEvalOnlineFeedbackRow = {
  id: number;
  run_id: number;
  result_id: number | null;
  case_id: number | null;
  article_id: number | null;
  wechat_sync_log_id: number | null;
  source_type: string;
  source_label: string | null;
  open_rate: number | null;
  read_completion_rate: number | null;
  share_rate: number | null;
  favorite_rate: number | null;
  read_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  notes: string | null;
  payload_json: string | Record<string, unknown>;
  created_by: number | null;
  captured_at: string;
  created_at: string;
  updated_at: string;
  task_code?: string | null;
  topic_title?: string | null;
  article_title?: string | null;
  sync_status?: string | null;
  media_id?: string | null;
  predicted_viral_score?: number | null;
  predicted_total_score?: number | null;
  topic_momentum_score?: number | null;
  headline_score?: number | null;
  hook_score?: number | null;
  shareability_score?: number | null;
  reader_value_score?: number | null;
  novelty_score?: number | null;
  platform_fit_score?: number | null;
};

type WritingEvalScoringProfileRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  config_json: string | Record<string, unknown>;
  is_active: number | boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

type WritingEvalLayoutStrategyRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  meta: string | null;
  config_json: string | Record<string, unknown>;
  is_official: number | boolean;
  owner_user_id: number | null;
  created_at: string;
  updated_at: string;
};

type WritingEvalFeedbackOptionResultRow = {
  id: number;
  case_id: number;
  task_code: string;
  topic_title: string;
  viral_score: number;
  total_score: number;
};

type WritingEvalFeedbackOptionDocumentRow = {
  id: number;
  user_id: number;
  title: string;
  status: string;
  updated_at: string;
};

type WritingEvalFeedbackOptionSyncLogRow = {
  id: number;
  article_id: number;
  title: string | null;
  status: string;
  media_id: string | null;
  created_at: string;
};

type ArticleOutcomeCalibrationRow = {
  id: number;
  article_id: number;
  target_package: string | null;
  scorecard_json: string | Record<string, unknown> | null;
  hit_status: string;
  review_summary: string | null;
  title: string | null;
  updated_at: string;
};

type ArticleOutcomeCalibrationSnapshotRow = {
  outcome_id: number;
  read_count: number;
  share_count: number;
  like_count: number;
};

function parseJsonObject(value: string | Record<string, unknown> | null | undefined) {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: string | unknown[] | null | undefined) {
  if (!value) return [] as unknown[];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMetricNumber(value: unknown, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getStringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function hasFilledString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeWritingEvalDatasetStatus(value: unknown) {
  const status = String(value || "").trim();
  return status === "archived" || status === "draft" ? status : "active";
}

function getWritingEvalDatasetReadiness(cases: WritingEvalCaseRow[], datasetStatusInput?: string | null): WritingEvalDatasetReadiness {
  const datasetStatus = normalizeWritingEvalDatasetStatus(datasetStatusInput);
  const enabledCases = cases.filter((item) => Boolean(item.is_enabled));
  const coverage = {
    readerProfile: 0,
    targetEmotion: 0,
    sourceFacts: 0,
    knowledgeCards: 0,
    historyReferences: 0,
    titleGoal: 0,
    hookGoal: 0,
    shareTriggerGoal: 0,
  };
  const qualityTargets = {
    distinctTaskTypeCount: 0,
    lightCount: 0,
    mediumCount: 0,
    hardCount: 0,
    referenceGoodOutputCount: 0,
    referenceBadPatternsCount: 0,
    mustUseFactsCount: 0,
  };
  const taskTypes = new Set<string>();

  for (const item of enabledCases) {
    const inputPayload = parseJsonObject(item.input_payload_json);
    const viralTargets = parseJsonObject(item.viral_targets_json);
    const stageArtifactPayloads = parseJsonObject(item.stage_artifact_payloads_json);
    const deepWritingPayload = getRecord(stageArtifactPayloads.deepWriting || stageArtifactPayloads.deep_writing);
    if (hasFilledString(inputPayload.readerProfile)) coverage.readerProfile += 1;
    if (hasFilledString(inputPayload.targetEmotion)) coverage.targetEmotion += 1;
    if (getStringArray(inputPayload.sourceFacts, 200).length > 0) coverage.sourceFacts += 1;
    if (getStringArray(inputPayload.knowledgeCards, 200).length > 0) coverage.knowledgeCards += 1;
    if (getStringArray(inputPayload.historyReferences, 200).length > 0) coverage.historyReferences += 1;
    if (hasFilledString(viralTargets.titleGoal)) coverage.titleGoal += 1;
    if (hasFilledString(viralTargets.hookGoal)) coverage.hookGoal += 1;
    if (hasFilledString(viralTargets.shareTriggerGoal)) coverage.shareTriggerGoal += 1;
    if (hasFilledString(item.task_type)) taskTypes.add(String(item.task_type).trim());
    if (String(item.difficulty_level || "").trim() === "light") qualityTargets.lightCount += 1;
    if (String(item.difficulty_level || "").trim() === "medium") qualityTargets.mediumCount += 1;
    if (String(item.difficulty_level || "").trim() === "hard") qualityTargets.hardCount += 1;
    if (hasFilledString(item.reference_good_output)) qualityTargets.referenceGoodOutputCount += 1;
    if (getStringArray(item.reference_bad_patterns_json, 50).length > 0) qualityTargets.referenceBadPatternsCount += 1;
    if (getStringArray(deepWritingPayload.mustUseFacts, 50).length > 0 || getStringArray(inputPayload.sourceFacts, 50).length >= 2) {
      qualityTargets.mustUseFactsCount += 1;
    }
  }

  const enabledCaseCount = enabledCases.length;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const coverageRatio = (value: number) => (enabledCaseCount > 0 ? value / enabledCaseCount : 0);
  qualityTargets.distinctTaskTypeCount = taskTypes.size;

  if (datasetStatus === "archived") {
    blockers.push("当前数据集已 archived");
  } else if (datasetStatus === "draft") {
    warnings.push("当前数据集仍是 draft，仅允许手动 + 人工审核实验");
  }

  if (enabledCaseCount === 0) {
    blockers.push("还没有启用样本");
  } else {
    if (enabledCaseCount < 5) blockers.push(`启用样本仅 ${enabledCaseCount} 条，低于自动实验最小门槛`);
    if (coverage.titleGoal === 0) blockers.push("没有样本填写 titleGoal");
    if (coverage.hookGoal === 0) blockers.push("没有样本填写 hookGoal");
    if (coverage.shareTriggerGoal === 0) blockers.push("没有样本填写 shareTriggerGoal");
    if (coverage.sourceFacts === 0) blockers.push("没有样本挂载 sourceFacts");
  }

  if (enabledCaseCount > 0) {
    if (enabledCaseCount < 12) warnings.push(`启用样本仅 ${enabledCaseCount} 条，建议至少补到 12 条再长期运行`);
    if (enabledCaseCount < 20) warnings.push(`启用样本仅 ${enabledCaseCount} 条，距离 20 条 MVP 样本质量目标仍有缺口`);
    if (coverageRatio(coverage.readerProfile) < 0.7) warnings.push("readerProfile 覆盖不足 70%");
    if (coverageRatio(coverage.targetEmotion) < 0.7) warnings.push("targetEmotion 覆盖不足 70%");
    if (coverageRatio(coverage.titleGoal) < 0.7) warnings.push("titleGoal 覆盖不足 70%");
    if (coverageRatio(coverage.hookGoal) < 0.7) warnings.push("hookGoal 覆盖不足 70%");
    if (coverageRatio(coverage.shareTriggerGoal) < 0.7) warnings.push("shareTriggerGoal 覆盖不足 70%");
    if (coverageRatio(coverage.sourceFacts) < 0.7) warnings.push("sourceFacts 覆盖不足 70%");
    if (coverageRatio(coverage.knowledgeCards) < 0.4) warnings.push("knowledgeCards 覆盖偏低");
    if (coverageRatio(coverage.historyReferences) < 0.3) warnings.push("historyReferences 覆盖偏低");
    if (qualityTargets.distinctTaskTypeCount < 4) warnings.push(`样本题型仅覆盖 ${qualityTargets.distinctTaskTypeCount}/4 类`);
    if (qualityTargets.lightCount === 0 || qualityTargets.mediumCount === 0 || qualityTargets.hardCount === 0) {
      warnings.push("难度分布未覆盖 light / medium / hard 全层级");
    }
    if (coverageRatio(qualityTargets.referenceGoodOutputCount) < 0.5) warnings.push("referenceGoodOutput 覆盖不足 50%");
    if (coverageRatio(qualityTargets.referenceBadPatternsCount) < 0.5) warnings.push("referenceBadPatterns 覆盖不足 50%");
    if (coverageRatio(qualityTargets.mustUseFactsCount) < 0.7) warnings.push("mustUseFacts 覆盖不足 70%");
  }

  return {
    status: blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    enabledCaseCount,
    totalCaseCount: cases.length,
    coverage,
    qualityTargets,
    blockers,
    warnings,
  };
}

async function getWritingEvalDatasetReadinessById(datasetId: number, datasetStatusInput?: string | null) {
  const db = getDatabase();
  let datasetStatus = datasetStatusInput;
  if (!datasetStatus) {
    const dataset = await db.queryOne<{ status: string }>("SELECT status FROM writing_eval_datasets WHERE id = ?", [datasetId]);
    datasetStatus = dataset?.status ?? "active";
  }
  const rows = await db.query<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE dataset_id = ?`,
    [datasetId],
  );
  return getWritingEvalDatasetReadiness(rows, datasetStatus);
}

async function getWritingEvalDatasetReadinessMap(datasets: Array<{ id: number; status?: string | null }>) {
  const safeDatasets = datasets.filter((item) => Number.isInteger(item.id) && item.id > 0);
  const safeDatasetIds = [...new Set(safeDatasets.map((item) => item.id))];
  const map = new Map<number, WritingEvalDatasetReadiness>();
  if (safeDatasetIds.length === 0) {
    return map;
  }
  const statusMap = new Map<number, string>();
  for (const item of safeDatasets) {
    statusMap.set(item.id, normalizeWritingEvalDatasetStatus(item.status));
  }
  const db = getDatabase();
  const placeholders = safeDatasetIds.map(() => "?").join(", ");
  const rows = await db.query<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE dataset_id IN (${placeholders})`,
    safeDatasetIds,
  );
  const grouped = new Map<number, WritingEvalCaseRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.dataset_id) ?? [];
    current.push(row);
    grouped.set(row.dataset_id, current);
  }
  for (const datasetId of safeDatasetIds) {
    map.set(datasetId, getWritingEvalDatasetReadiness(grouped.get(datasetId) ?? [], statusMap.get(datasetId)));
  }
  return map;
}

async function assertWritingEvalDatasetExecutionReadiness(input: {
  datasetId: number;
  datasetStatus?: string | null;
  triggerMode: string;
  decisionMode: string;
}) {
  const datasetStatus = normalizeWritingEvalDatasetStatus(input.datasetStatus);
  const readiness = await getWritingEvalDatasetReadinessById(input.datasetId, datasetStatus);
  const isAutomatedTrigger = input.triggerMode !== "manual";
  const usesAutomaticDecision = input.decisionMode !== "manual_review";
  if (datasetStatus === "archived") {
    throw new Error("当前评测集已 archived，不能继续用于实验或调度");
  }
  if (datasetStatus !== "active" && (isAutomatedTrigger || usesAutomaticDecision)) {
    throw new Error("当前评测集仍是 draft，仅 active 数据集允许自动实验、自动调度和自动决议");
  }
  if ((isAutomatedTrigger || usesAutomaticDecision) && readiness.status === "blocked") {
    throw new Error(`当前评测集未达到自动实验最低门槛：${readiness.blockers.slice(0, 2).join("；")}`);
  }
  if (usesAutomaticDecision && readiness.status !== "ready") {
    throw new Error(`当前评测集仍有覆盖告警，自动决议仅允许用于 ready 数据集：${[...readiness.blockers, ...readiness.warnings].slice(0, 2).join("；")}`);
  }
  return readiness;
}

function getPromptVersionRefsFromAttribution(attribution: Record<string, unknown>) {
  const refs = new Set<string>();
  for (const ref of getStringArray(attribution.promptVersionRefs, 24)) {
    refs.add(ref);
  }
  const promptVersion = getRecord(attribution.promptVersion);
  const fallbackRef =
    String(promptVersion.ref || "").trim()
    || (() => {
      const promptId = String(promptVersion.promptId || "").trim();
      const version = String(promptVersion.version || "").trim();
      return promptId && version ? `${promptId}@${version}` : "";
    })();
  if (fallbackRef) {
    refs.add(fallbackRef);
  }
  return Array.from(refs);
}

function normalizePercentage(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(100, Math.max(0, numeric));
}

function normalizeCount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric));
}

function computeObservedViralScore(input: {
  openRate?: number | null;
  readCompletionRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
}) {
  const weighted = [
    { value: input.openRate ?? null, weight: 0.3 },
    { value: input.readCompletionRate ?? null, weight: 0.3 },
    { value: input.shareRate ?? null, weight: 0.25 },
    { value: input.favoriteRate ?? null, weight: 0.15 },
  ].filter((item) => typeof item.value === "number");
  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;
  const total = weighted.reduce((sum, item) => sum + Number(item.value) * item.weight, 0);
  return total / totalWeight;
}

function averageNumbers(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computePearsonCorrelation(left: number[], right: number[]) {
  if (left.length < 2 || right.length < 2 || left.length !== right.length) return null;
  const leftAvg = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightAvg = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => sum + (value - leftAvg) * (right[index] - rightAvg), 0);
  const leftVariance = left.reduce((sum, value) => sum + (value - leftAvg) ** 2, 0);
  const rightVariance = right.reduce((sum, value) => sum + (value - rightAvg) ** 2, 0);
  const denominator = Math.sqrt(leftVariance * rightVariance);
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parsePromptVersionRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) {
    throw new Error("Prompt 版本引用格式错误");
  }
  const [promptId, version] = trimmed.split("@", 2);
  if (!promptId || !version) {
    throw new Error("Prompt 版本引用格式错误");
  }
  return { promptId, version };
}

function normalizeWritingEvalExperimentMode(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized === "title_only" || normalized === "lead_only" ? normalized : "full_article";
}

function normalizeWritingEvalTriggerMode(value: string | null | undefined, fallback = "manual") {
  const normalized = String(value || "").trim();
  return ["manual", "scheduled", "agent"].includes(normalized) ? normalized : fallback;
}

function normalizeWritingEvalDecisionMode(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return ["manual_review", "auto_keep", "auto_keep_or_discard"].includes(normalized) ? normalized : "manual_review";
}

function normalizeWritingEvalResolutionStatus(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return ["pending", "keep", "discard", "rollback"].includes(normalized) ? normalized : "pending";
}

function normalizeWritingEvalAgentStrategy(value: string | null | undefined) {
  return normalizeWritingEvalAgentStrategyCode(value);
}

function normalizeWritingEvalScheduleCadenceHours(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 24;
  return Math.min(24 * 30, Math.max(1, Math.round(numeric)));
}

function normalizeWritingEvalSchedulePriority(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(999, Math.max(0, Math.round(numeric)));
}

function normalizeScheduleNextRunAt(value: string | null | undefined, cadenceHours: number) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return new Date().toISOString();
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("下次执行时间格式无效");
  }
  return date.toISOString();
}

function addHoursToIso(baseIso: string, hours: number) {
  const next = new Date(baseIso);
  next.setHours(next.getHours() + hours);
  return next.toISOString();
}

function getRequiredPromptTargetIdForExperimentMode(experimentMode: string) {
  if (experimentMode === "title_only") return "outline_planning";
  if (experimentMode === "lead_only") return "prose_polish";
  return null;
}

const PROMOTION_QUALITY_SIGNAL_DEFINITIONS = [
  { label: "写作风格", deltaKey: "deltaStyleScore" },
  { label: "语言自然度", deltaKey: "deltaLanguageScore" },
  { label: "信息密度", deltaKey: "deltaDensityScore" },
  { label: "情绪推进", deltaKey: "deltaEmotionScore" },
  { label: "结构完成度", deltaKey: "deltaStructureScore" },
] as const;

const PROMOTION_VIRAL_SIGNAL_DEFINITIONS = [
  { label: "标题点击力", deltaKey: "deltaHeadlineScore" },
  { label: "开头留存力", deltaKey: "deltaHookScore" },
  { label: "社交传播性", deltaKey: "deltaShareabilityScore" },
  { label: "读者收益感", deltaKey: "deltaReaderValueScore" },
] as const;

const PROMOTION_NEGATIVE_SIGNAL_THRESHOLD = -0.5;
const PROMOTION_POSITIVE_SIGNAL_THRESHOLD = 0.5;

function formatDecisionSignal(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function buildPromotionDecision(scoreSummary: Record<string, unknown>) {
  const deltaTotal = getNumber(scoreSummary.deltaTotalScore) ?? 0;
  const deltaQuality = getNumber(scoreSummary.deltaQualityScore) ?? 0;
  const deltaViral = getNumber(scoreSummary.deltaViralScore) ?? 0;
  const deltaDensity = getNumber(scoreSummary.deltaDensityScore) ?? 0;
  const deltaEmotion = getNumber(scoreSummary.deltaEmotionScore) ?? 0;
  const deltaStructure = getNumber(scoreSummary.deltaStructureScore) ?? 0;
  const deltaHeadline = getNumber(scoreSummary.deltaHeadlineScore) ?? 0;
  const deltaHook = getNumber(scoreSummary.deltaHookScore) ?? 0;
  const deltaShareability = getNumber(scoreSummary.deltaShareabilityScore) ?? 0;
  const deltaReaderValue = getNumber(scoreSummary.deltaReaderValueScore) ?? 0;
  const failedCaseCount = getNumber(scoreSummary.failedCaseCount) ?? 0;
  const factualRiskPenalty = getNumber(scoreSummary.factualRiskPenalty) ?? 0;
  const baseFactualRiskPenalty = getNumber(scoreSummary.baseFactualRiskPenalty) ?? factualRiskPenalty;
  const aiNoisePenalty = getNumber(scoreSummary.aiNoisePenalty) ?? 0;
  const baseAiNoisePenalty = getNumber(scoreSummary.baseAiNoisePenalty) ?? aiNoisePenalty;
  const improvedCaseCount = getNumber(scoreSummary.improvedCaseCount) ?? 0;
  const regressedCaseCount = getNumber(scoreSummary.regressedCaseCount) ?? 0;
  const qualityRegressions = PROMOTION_QUALITY_SIGNAL_DEFINITIONS
    .map((item) => ({
      ...item,
      delta: getNumber(scoreSummary[item.deltaKey]) ?? 0,
    }))
    .filter((item) => item.delta <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD);
  const viralRegressions = PROMOTION_VIRAL_SIGNAL_DEFINITIONS
    .map((item) => ({
      ...item,
      delta: getNumber(scoreSummary[item.deltaKey]) ?? 0,
    }))
    .filter((item) => item.delta <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD);
  const signalHighlights = [...PROMOTION_QUALITY_SIGNAL_DEFINITIONS, ...PROMOTION_VIRAL_SIGNAL_DEFINITIONS]
    .map((item) => ({
      ...item,
      delta: getNumber(scoreSummary[item.deltaKey]) ?? 0,
    }))
    .filter((item) => item.delta >= PROMOTION_POSITIVE_SIGNAL_THRESHOLD)
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 3)
    .map((item) => `${item.label}${formatDecisionSignal(item.delta)}`);

  const blockers: string[] = [];
  if (deltaTotal < 2) blockers.push(`总分仅提升 ${deltaTotal.toFixed(2)}`);
  if (failedCaseCount > 0) blockers.push(`失败样本 ${failedCaseCount} 条`);
  if (deltaQuality < 0) blockers.push(`质量分 ${formatDecisionSignal(deltaQuality)}`);
  if (deltaViral < 0) blockers.push(`爆款分 ${formatDecisionSignal(deltaViral)}`);
  if (factualRiskPenalty > baseFactualRiskPenalty) blockers.push("事实风险上升");
  if (aiNoisePenalty > baseAiNoisePenalty) blockers.push("机器腔惩罚上升");
  if (improvedCaseCount < regressedCaseCount) blockers.push(`退化样本 ${regressedCaseCount} 条多于提分样本 ${improvedCaseCount} 条`);
  if (qualityRegressions.length > 0) blockers.push(`${qualityRegressions.map((item) => item.label).join("、")}退化`);
  if (viralRegressions.length > 0) blockers.push(`${viralRegressions.map((item) => item.label).join("、")}退化`);
  if (
    deltaHeadline >= PROMOTION_POSITIVE_SIGNAL_THRESHOLD
    && (deltaReaderValue <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD
      || deltaDensity <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD
      || deltaStructure <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD)
  ) {
    blockers.push("标题点击力提升但正文兑现度下降");
  }
  if (deltaHook >= PROMOTION_POSITIVE_SIGNAL_THRESHOLD && deltaDensity <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD) {
    blockers.push("开头留存力提升但后文信息密度下降");
  }
  if (
    deltaShareability >= PROMOTION_POSITIVE_SIGNAL_THRESHOLD
    && (deltaEmotion <= PROMOTION_NEGATIVE_SIGNAL_THRESHOLD || aiNoisePenalty > baseAiNoisePenalty)
  ) {
    blockers.push("社交传播性提升但情绪操纵或标题党风险上升");
  }

  const shouldKeep = blockers.length === 0;
  return {
    suggestion: shouldKeep ? "keep" : "discard",
    reason: shouldKeep
      ? `总分提升 ${deltaTotal.toFixed(2)}，提分样本 ${improvedCaseCount} 条；${signalHighlights.length ? `核心增益集中在 ${signalHighlights.join("、")}，` : ""}且事实风险、机器腔与组合风险守卫均未触发。`
      : `当前更适合 discard：${blockers.slice(0, 4).join("；")}。`,
  };
}

function mapDataset(row: WritingEvalDatasetRow, readiness: WritingEvalDatasetReadiness) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: row.status,
    sampleCount: row.sample_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readiness,
  };
}

function mapScoringProfile(row: WritingEvalScoringProfileRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    config: parseJsonObject(row.config_json),
    isActive: Boolean(row.is_active),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLayoutStrategy(row: WritingEvalLayoutStrategyRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    meta: row.meta,
    config: parseJsonObject(row.config_json),
    isOfficial: Boolean(row.is_official),
    ownerUserId: row.owner_user_id,
    scope: row.owner_user_id == null ? "official" : "private",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCase(row: WritingEvalCaseRow) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    taskCode: row.task_code,
    taskType: row.task_type,
    topicTitle: row.topic_title,
    inputPayload: parseJsonObject(row.input_payload_json),
    expectedConstraints: parseJsonObject(row.expected_constraints_json),
    viralTargets: parseJsonObject(row.viral_targets_json),
    stageArtifactPayloads: parseJsonObject(row.stage_artifact_payloads_json),
    referenceGoodOutput: row.reference_good_output,
    referenceBadPatterns: parseJsonArray(row.reference_bad_patterns_json),
    difficultyLevel: row.difficulty_level,
    isEnabled: Boolean(row.is_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: WritingOptimizationRunRow) {
  const scoreSummary = parseJsonObject(row.score_summary_json);
  const suggestion = buildPromotionDecision(scoreSummary);
  return {
    id: row.id,
    runCode: row.run_code,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name ?? null,
    baseVersionType: row.base_version_type,
    baseVersionRef: row.base_version_ref,
    candidateVersionType: row.candidate_version_type,
    candidateVersionRef: row.candidate_version_ref,
    experimentMode: normalizeWritingEvalExperimentMode(row.experiment_mode),
    triggerMode: row.trigger_mode,
    decisionMode: normalizeWritingEvalDecisionMode(row.decision_mode),
    resolutionStatus: normalizeWritingEvalResolutionStatus(row.resolution_status),
    status: row.status,
    summary: row.summary,
    scoreSummary,
    recommendation: suggestion.suggestion,
    recommendationReason: suggestion.reason,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    resolvedAt: row.resolved_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapRunSchedule(row: WritingEvalRunScheduleRow, readiness: WritingEvalDatasetReadiness) {
  return {
    id: row.id,
    name: row.name,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name ?? null,
    datasetStatus: normalizeWritingEvalDatasetStatus(row.dataset_status),
    baseVersionType: row.base_version_type,
    baseVersionRef: row.base_version_ref,
    candidateVersionType: row.candidate_version_type,
    candidateVersionRef: row.candidate_version_ref,
    experimentMode: normalizeWritingEvalExperimentMode(row.experiment_mode),
    triggerMode: normalizeWritingEvalTriggerMode(row.trigger_mode, "scheduled"),
    agentStrategy: normalizeWritingEvalAgentStrategy(row.agent_strategy),
    decisionMode: normalizeWritingEvalDecisionMode(row.decision_mode),
    priority: normalizeWritingEvalSchedulePriority(row.priority),
    cadenceHours: row.cadence_hours,
    nextRunAt: row.next_run_at,
    lastDispatchedAt: row.last_dispatched_at,
    lastRunId: row.last_run_id,
    lastRunCode: row.last_run_code ?? null,
    lastRunStatus: row.last_run_status ?? null,
    lastError: row.last_error,
    isEnabled: Boolean(row.is_enabled),
    summary: row.summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readiness,
  };
}

function isExecutableWritingEvalSchedule(
  schedule: Awaited<ReturnType<typeof getWritingEvalRunSchedules>>[number],
) {
  if (!schedule.isEnabled) return false;
  if (schedule.datasetStatus !== "active") return false;
  if (schedule.readiness.status === "blocked") return false;
  if (schedule.decisionMode !== "manual_review" && schedule.readiness.status !== "ready") return false;
  return true;
}

function mapRunResult(row: WritingOptimizationResultRow) {
  return {
    id: row.id,
    runId: row.run_id,
    caseId: row.case_id,
    taskCode: row.task_code ?? null,
    taskType: row.task_type ?? null,
    topicTitle: row.topic_title ?? null,
    difficultyLevel: row.difficulty_level ?? null,
    generatedTitle: row.generated_title,
    generatedLead: row.generated_lead,
    generatedMarkdown: row.generated_markdown,
    styleScore: row.style_score,
    languageScore: row.language_score,
    densityScore: row.density_score,
    emotionScore: row.emotion_score,
    structureScore: row.structure_score,
    topicMomentumScore: row.topic_momentum_score,
    headlineScore: row.headline_score,
    hookScore: row.hook_score,
    shareabilityScore: row.shareability_score,
    readerValueScore: row.reader_value_score,
    noveltyScore: row.novelty_score,
    platformFitScore: row.platform_fit_score,
    qualityScore: row.quality_score,
    viralScore: row.viral_score,
    factualRiskPenalty: row.factual_risk_penalty,
    aiNoisePenalty: row.ai_noise_penalty,
    totalScore: row.total_score,
    judgePayload: parseJsonObject(row.judge_payload_json),
    createdAt: row.created_at,
  };
}

function mapVersion(row: WritingOptimizationVersionRow) {
  return {
    id: row.id,
    versionType: row.version_type,
    targetKey: row.target_key,
    sourceVersion: row.source_version,
    candidateContent: row.candidate_content,
    scoreSummary: parseJsonObject(row.score_summary_json),
    decision: row.decision,
    decisionReason: row.decision_reason,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  };
}

function mapFeedback(row: WritingEvalOnlineFeedbackRow) {
  const observedViralScore = computeObservedViralScore({
    openRate: row.open_rate,
    readCompletionRate: row.read_completion_rate,
    shareRate: row.share_rate,
    favoriteRate: row.favorite_rate,
  });
  const predictedViralScore = getNumber(row.predicted_viral_score);
  const signalScores = {
    topicMomentumScore: getNumber(row.topic_momentum_score),
    headlineScore: getNumber(row.headline_score),
    hookScore: getNumber(row.hook_score),
    shareabilityScore: getNumber(row.shareability_score),
    readerValueScore: getNumber(row.reader_value_score),
    noveltyScore: getNumber(row.novelty_score),
    platformFitScore: getNumber(row.platform_fit_score),
  };
  return {
    id: row.id,
    runId: row.run_id,
    resultId: row.result_id,
    caseId: row.case_id,
    articleId: row.article_id,
    wechatSyncLogId: row.wechat_sync_log_id,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    openRate: row.open_rate,
    readCompletionRate: row.read_completion_rate,
    shareRate: row.share_rate,
    favoriteRate: row.favorite_rate,
    readCount: row.read_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    notes: row.notes,
    payload: parseJsonObject(row.payload_json),
    createdBy: row.created_by,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskCode: row.task_code ?? null,
    topicTitle: row.topic_title ?? null,
    articleTitle: row.article_title ?? null,
    syncStatus: row.sync_status ?? null,
    mediaId: row.media_id ?? null,
    predictedViralScore,
    predictedTotalScore: getNumber(row.predicted_total_score),
    signalScores,
    observedViralScore,
    calibrationGap:
      observedViralScore !== null && predictedViralScore !== null ? observedViralScore - predictedViralScore : null,
  };
}

type CalibrationInsightItem = {
  id: number;
  runId: number | null;
  resultId: number | null;
  caseId: number | null;
  articleId: number | null;
  wechatSyncLogId: number | null;
  sourceType: string;
  sourceLabel: string | null;
  openRate: number | null;
  readCompletionRate: number | null;
  shareRate: number | null;
  favoriteRate: number | null;
  readCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  notes: string | null;
  payload: Record<string, unknown>;
  createdBy: number | null;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  taskCode: string | null;
  topicTitle: string | null;
  articleTitle: string | null;
  syncStatus: string | null;
  mediaId: string | null;
  predictedViralScore: number | null;
  predictedTotalScore: number | null;
  signalScores: {
    topicMomentumScore: number | null;
    headlineScore: number | null;
    hookScore: number | null;
    shareabilityScore: number | null;
    readerValueScore: number | null;
    noveltyScore: number | null;
    platformFitScore: number | null;
  };
  observedViralScore: number | null;
  calibrationGap: number | null;
};

function mapArticleOutcomeCalibrationItem(
  row: ArticleOutcomeCalibrationRow,
  snapshots: ArticleOutcomeCalibrationSnapshotRow[],
): CalibrationInsightItem {
  const scorecard = parseJsonObject(row.scorecard_json);
  const signalScoresRecord = getRecord(scorecard.signalScores);
  const maxReadCount = snapshots.reduce((max, item) => Math.max(max, Number(item.read_count || 0)), 0);
  const maxLikeCount = snapshots.reduce((max, item) => Math.max(max, Number(item.like_count || 0)), 0);
  const maxShareCount = snapshots.reduce((max, item) => Math.max(max, Number(item.share_count || 0)), 0);
  const shareRate = maxReadCount > 0 ? Number(((maxShareCount / maxReadCount) * 100).toFixed(2)) : null;
  const favoriteRate = maxReadCount > 0 ? Number(((maxLikeCount / maxReadCount) * 100).toFixed(2)) : null;
  const observedViralScore = computeObservedOutcomeScore({
    hitStatus:
      row.hit_status === "hit" || row.hit_status === "near_miss" || row.hit_status === "miss" || row.hit_status === "pending"
        ? row.hit_status
        : null,
    snapshots: snapshots.map((item) => ({
      readCount: item.read_count,
      shareCount: item.share_count,
      likeCount: item.like_count,
    })),
  });
  const predictedViralScore = getNumber(scorecard.viralScore) ?? getNumber(scorecard.predictedScore);
  return {
    id: row.id,
    runId: null,
    resultId: null,
    caseId: null,
    articleId: row.article_id,
    wechatSyncLogId: null,
    sourceType: "article_outcome",
    sourceLabel: row.target_package ? `真实回流 · ${row.target_package}` : "真实回流",
    openRate: maxReadCount > 0 ? Number(Math.min(100, Math.log10(maxReadCount + 1) * 20).toFixed(2)) : null,
    readCompletionRate: null,
    shareRate,
    favoriteRate,
    readCount: maxReadCount || null,
    likeCount: maxLikeCount || null,
    commentCount: null,
    notes: row.review_summary,
    payload: { source: "article_outcome" },
    createdBy: null,
    capturedAt: row.updated_at,
    createdAt: row.updated_at,
    updatedAt: row.updated_at,
    taskCode: "article_outcome",
    topicTitle: row.target_package,
    articleTitle: row.title,
    syncStatus: null,
    mediaId: null,
    predictedViralScore,
    predictedTotalScore: getNumber(scorecard.predictedScore),
    signalScores: {
      topicMomentumScore: getNumber(signalScoresRecord.topicMomentumScore),
      headlineScore: getNumber(signalScoresRecord.headlineScore),
      hookScore: getNumber(signalScoresRecord.hookScore),
      shareabilityScore: getNumber(signalScoresRecord.shareabilityScore),
      readerValueScore: getNumber(signalScoresRecord.readerValueScore),
      noveltyScore: getNumber(signalScoresRecord.noveltyScore),
      platformFitScore: getNumber(signalScoresRecord.platformFitScore),
    },
    observedViralScore,
    calibrationGap:
      observedViralScore !== null && predictedViralScore !== null ? Number((observedViralScore - predictedViralScore).toFixed(2)) : null,
  };
}

function buildRunCode() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `wer-${stamp}-${suffix}`;
}

function getWritingEvalFeedbackSelectSql() {
  return `SELECT f.id, f.run_id, f.result_id, f.case_id, f.article_id AS article_id, f.wechat_sync_log_id, f.source_type, f.source_label,
                 f.open_rate, f.read_completion_rate, f.share_rate, f.favorite_rate, f.read_count, f.like_count,
                 f.comment_count, f.notes, f.payload_json, f.created_by, f.captured_at, f.created_at, f.updated_at,
                 c.task_code, c.topic_title, d.title AS article_title, l.status AS sync_status, l.media_id,
                 r.viral_score AS predicted_viral_score, r.total_score AS predicted_total_score,
                 r.topic_momentum_score, r.headline_score, r.hook_score, r.shareability_score, r.reader_value_score,
                 r.novelty_score, r.platform_fit_score
          FROM writing_eval_online_feedback f
          LEFT JOIN writing_optimization_results r ON r.id = f.result_id
          LEFT JOIN writing_eval_cases c ON c.id = COALESCE(f.case_id, r.case_id)
          LEFT JOIN articles d ON d.id = f.article_id
          LEFT JOIN wechat_sync_logs l ON l.id = f.wechat_sync_log_id`;
}

const VIRAL_SIGNAL_DEFINITIONS = [
  { key: "topicMomentumScore", label: "选题势能", field: "topic_momentum_score" },
  { key: "headlineScore", label: "标题点击力", field: "headline_score" },
  { key: "hookScore", label: "开头留存力", field: "hook_score" },
  { key: "shareabilityScore", label: "社交传播性", field: "shareability_score" },
  { key: "readerValueScore", label: "读者收益感", field: "reader_value_score" },
  { key: "noveltyScore", label: "新意反差感", field: "novelty_score" },
  { key: "platformFitScore", label: "平台适配度", field: "platform_fit_score" },
] as const;

const VIRAL_WEIGHT_KEY_BY_SIGNAL_KEY: Record<(typeof VIRAL_SIGNAL_DEFINITIONS)[number]["key"], string> = {
  topicMomentumScore: "topicMomentum",
  headlineScore: "headline",
  hookScore: "hook",
  shareabilityScore: "shareability",
  readerValueScore: "readerValue",
  noveltyScore: "novelty",
  platformFitScore: "platformFit",
};

const WRITING_EVAL_AUTO_CALIBRATION_MIN_LINKED_RESULTS = 6;
const WRITING_EVAL_AUTO_CALIBRATION_MIN_AVERAGE_GAP = 6;
const WRITING_EVAL_AUTO_CALIBRATION_MIN_MISJUDGED_CASES = 3;
const WRITING_EVAL_AUTO_CALIBRATION_MIN_CONFIDENCE = 0.35;
const WRITING_EVAL_AUTO_CALIBRATION_COOLDOWN_HOURS = 24;

function normalizeWeightMap(keys: string[], input: Record<string, unknown>) {
  const numericEntries = keys.map((key) => [key, Math.max(0, Number(input[key] ?? 0))] as const);
  const total = numericEntries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    const equalWeight = Number((1 / Math.max(1, keys.length)).toFixed(4));
    return Object.fromEntries(keys.map((key) => [key, equalWeight]));
  }
  return Object.fromEntries(numericEntries.map(([key, value]) => [key, Number((value / total).toFixed(4))]));
}

function getWritingEvalCalibrationMeta(value: unknown) {
  return getRecord(getRecord(value).calibrationMeta);
}

function buildOnlineCalibrationInsights(items: CalibrationInsightItem[]) {
  const aligned = items.filter(
    (item) =>
      item.observedViralScore !== null &&
      item.predictedViralScore !== null,
  );
  const equalWeight = Number((1 / VIRAL_SIGNAL_DEFINITIONS.length).toFixed(4));

  const recommendationBase = VIRAL_SIGNAL_DEFINITIONS.map((definition) => {
    const valid = aligned
      .map((item) => ({
        signal: item.signalScores[definition.key],
        observed: item.observedViralScore,
      }))
      .filter(
        (item): item is { signal: number; observed: number } =>
          typeof item.signal === "number" && Number.isFinite(item.signal) && typeof item.observed === "number" && Number.isFinite(item.observed),
      );
    const signals = valid.map((item) => item.signal);
    const observed = valid.map((item) => item.observed);
    const correlation = computePearsonCorrelation(signals, observed);
    const sorted = valid.slice().sort((left, right) => left.signal - right.signal);
    const bucketSize = Math.max(1, Math.floor(sorted.length / 3));
    const lowBucket = sorted.slice(0, bucketSize);
    const highBucket = sorted.slice(-bucketSize);
    const topObservedAvg = averageNumbers(highBucket.map((item) => item.observed));
    const bottomObservedAvg = averageNumbers(lowBucket.map((item) => item.observed));
    const lift =
      topObservedAvg !== null && bottomObservedAvg !== null ? topObservedAvg - bottomObservedAvg : null;
    const strength = Math.max(0, correlation ?? 0) * 0.75 + Math.max(0, (lift ?? 0) / 25) * 0.25;
    const sampleConfidence =
      sorted.length === 0
        ? 0
        : clampNumber(sorted.length / 12, 0, 1) * clampNumber(standardDeviation(signals) / 12, 0, 1);
    return {
      key: definition.key,
      label: definition.label,
      currentWeight: equalWeight,
      recommendedWeight: equalWeight,
      sampleCount: sorted.length,
      correlation,
      lift,
      confidence: Number(sampleConfidence.toFixed(2)),
      strength,
    };
  });

  const totalStrength = recommendationBase.reduce((sum, item) => sum + item.strength, 0);
  const normalizedRecommendations =
    totalStrength > 0
      ? recommendationBase.map((item) => ({
          ...item,
          recommendedWeight: Number((item.strength / totalStrength).toFixed(4)),
        }))
      : recommendationBase;

  const weightRecommendations = normalizedRecommendations.map((item) => {
    const deltaWeight = Number((item.recommendedWeight - item.currentWeight).toFixed(4));
    let recommendation = "保持观察";
    if (deltaWeight >= 0.03) recommendation = "建议加权";
    if (deltaWeight <= -0.03) recommendation = "建议降权";
    let reason = "样本不足，暂时不建议调整。";
    if (item.sampleCount >= 3) {
      if ((item.correlation ?? 0) > 0.2 && (item.lift ?? 0) > 4) {
        reason = `高分样本的线上表现更强，相关性 ${item.correlation?.toFixed(2) ?? "--"}。`;
      } else if ((item.correlation ?? 0) < -0.1) {
        reason = `离线高分与线上表现出现背离，相关性 ${item.correlation?.toFixed(2) ?? "--"}。`;
      } else {
        reason = `当前相关性偏弱，建议继续积累线上样本。`;
      }
    }
    return {
      key: item.key,
      label: item.label,
      currentWeight: item.currentWeight,
      recommendedWeight: item.recommendedWeight,
      deltaWeight,
      sampleCount: item.sampleCount,
      correlation: item.correlation,
      lift: item.lift,
      confidence: item.confidence,
      recommendation,
      reason,
    };
  });

  const falsePositiveCases = aligned
    .filter((item) => (item.predictedViralScore ?? 0) >= 65 && (item.calibrationGap ?? 0) <= -12)
    .sort((left, right) => Math.abs(right.calibrationGap ?? 0) - Math.abs(left.calibrationGap ?? 0))
    .slice(0, 8)
    .map((item) => ({
      feedbackId: item.id,
      runId: item.runId,
      resultId: item.resultId,
      sourceType: item.sourceType,
      sourceLabel: item.sourceLabel,
      taskCode: item.taskCode,
      topicTitle: item.topicTitle,
      articleTitle: item.articleTitle,
      predictedViralScore: item.predictedViralScore,
      observedViralScore: item.observedViralScore,
      calibrationGap: item.calibrationGap,
      openRate: item.openRate,
      readCompletionRate: item.readCompletionRate,
      shareRate: item.shareRate,
      favoriteRate: item.favoriteRate,
      notes: item.notes,
    }));

  const falseNegativeCases = aligned
    .filter((item) => (item.predictedViralScore ?? 0) <= 55 && (item.calibrationGap ?? 0) >= 12)
    .sort((left, right) => Math.abs(right.calibrationGap ?? 0) - Math.abs(left.calibrationGap ?? 0))
    .slice(0, 8)
    .map((item) => ({
      feedbackId: item.id,
      runId: item.runId,
      resultId: item.resultId,
      sourceType: item.sourceType,
      sourceLabel: item.sourceLabel,
      taskCode: item.taskCode,
      topicTitle: item.topicTitle,
      articleTitle: item.articleTitle,
      predictedViralScore: item.predictedViralScore,
      observedViralScore: item.observedViralScore,
      calibrationGap: item.calibrationGap,
      openRate: item.openRate,
      readCompletionRate: item.readCompletionRate,
      shareRate: item.shareRate,
      favoriteRate: item.favoriteRate,
      notes: item.notes,
    }));

  return {
    feedbackCount: items.length,
    linkedResultCount: aligned.length,
    averageObservedViralScore: averageNumbers(aligned.map((item) => item.observedViralScore)),
    averagePredictedViralScore: averageNumbers(aligned.map((item) => item.predictedViralScore)),
    averageCalibrationGap: averageNumbers(aligned.map((item) => item.calibrationGap)),
    weightRecommendations: weightRecommendations.sort((left, right) => right.recommendedWeight - left.recommendedWeight),
    falsePositiveCases,
    falseNegativeCases,
  };
}

function buildAgentStrategyRecommendations(input: {
  schedules: Awaited<ReturnType<typeof getWritingEvalRunSchedules>>;
  recentRuns: Awaited<ReturnType<typeof getWritingEvalRuns>>;
  topRegressionReasons: Array<{ label: string; count: number; runId: number; resultId: number; datasetId: number; caseId: number; taskCode: string }>;
  topImprovementReasons: Array<{ label: string; count: number; runId: number; resultId: number; datasetId: number; caseId: number; taskCode: string }>;
  onlineCalibration: ReturnType<typeof buildOnlineCalibrationInsights>;
}) {
  const recentRuns = input.recentRuns.slice(0, 12);
  const averageDeltaTotal = averageNumbers(recentRuns.map((run) => getNumber(run.scoreSummary.deltaTotalScore)));
  const averageFailedCaseCount = averageNumbers(recentRuns.map((run) => getNumber(run.scoreSummary.failedCaseCount)));
  const negativeRunCount = recentRuns.filter((run) => (getNumber(run.scoreSummary.deltaTotalScore) ?? 0) < 0).length;
  const falsePositiveCount = input.onlineCalibration.falsePositiveCases.length;
  const falseNegativeCount = input.onlineCalibration.falseNegativeCases.length;
  const averageCalibrationGap = input.onlineCalibration.averageCalibrationGap ?? 0;
  const linkedFeedbackCount = input.onlineCalibration.linkedResultCount ?? 0;
  const headlineWeightDelta =
    input.onlineCalibration.weightRecommendations.find((item) => item.key === "headlineScore")?.deltaWeight ?? 0;
  const hookWeightDelta =
    input.onlineCalibration.weightRecommendations.find((item) => item.key === "hookScore")?.deltaWeight ?? 0;
  const readerValueWeightDelta =
    input.onlineCalibration.weightRecommendations.find((item) => item.key === "readerValueScore")?.deltaWeight ?? 0;
  const scheduleGroups = input.schedules.reduce(
    (map, schedule) => {
      const key = normalizeWritingEvalAgentStrategyCode(schedule.agentStrategy);
      const existing = map.get(key) ?? [];
      existing.push(schedule);
      map.set(key, existing);
      return map;
    },
    new Map<string, Awaited<ReturnType<typeof getWritingEvalRunSchedules>>>(),
  );

  return WRITING_EVAL_AGENT_STRATEGY_PRESETS.map((preset) => {
    const schedules = scheduleGroups.get(preset.code) ?? [];
    const enabledSchedules = schedules.filter((schedule) => schedule.isEnabled);
    const executableSchedules = enabledSchedules.filter((schedule) => isExecutableWritingEvalSchedule(schedule));
    const blockedSchedules = enabledSchedules.filter((schedule) => !isExecutableWritingEvalSchedule(schedule));
    const primaryExecutableScheduleId = executableSchedules[0]?.id ?? null;
    const primaryScheduleId = primaryExecutableScheduleId ?? enabledSchedules[0]?.id ?? schedules[0]?.id ?? null;
    const currentPriority = enabledSchedules.length > 0 ? Math.max(...enabledSchedules.map((schedule) => schedule.priority)) : null;
    const currentCadenceHours = enabledSchedules.length > 0 ? Math.min(...enabledSchedules.map((schedule) => schedule.cadenceHours)) : null;
    const currentDecisionMode = enabledSchedules[0]?.decisionMode ?? null;
    const triggers: string[] = [];
    let urgencyScore = 0.15;
    let confidence = 0.45;
    let recommendedPriority = currentPriority ?? preset.recommendedPriority;
    let recommendedCadenceHours = currentCadenceHours ?? 24;
    let recommendedDecisionMode = currentDecisionMode ?? "manual_review";
    let recommendation = "保持当前节奏";
    let reason = "当前没有足够强的新信号，建议继续按现有节奏观察。";

    if (preset.code === "calibration") {
      urgencyScore += Math.min(0.45, linkedFeedbackCount / 24);
      if (Math.abs(averageCalibrationGap) >= 8) {
        urgencyScore += 0.22;
        triggers.push(`平均校准偏差 ${averageCalibrationGap >= 0 ? "+" : ""}${averageCalibrationGap.toFixed(2)}`);
      }
      if (falsePositiveCount + falseNegativeCount >= 3) {
        urgencyScore += 0.18;
        triggers.push(`误判样本 ${falsePositiveCount + falseNegativeCount} 条`);
      }
      confidence = clampNumber(0.35 + linkedFeedbackCount / 18, 0, 0.95);
      recommendedPriority = Math.max(currentPriority ?? 0, linkedFeedbackCount >= 8 ? 280 : 240, preset.recommendedPriority);
      recommendedCadenceHours = linkedFeedbackCount >= 8 ? 6 : linkedFeedbackCount >= 4 ? 12 : 24;
      recommendedDecisionMode = "manual_review";
      recommendation = linkedFeedbackCount >= 4 ? "提高优先级并加密校准节奏" : "先积累更多回流样本";
      reason =
        linkedFeedbackCount >= 4
          ? `线上回流已形成可用样本，适合优先处理评分偏差和误判修正，避免离线分数继续偏航。`
          : `当前回流样本仍偏少，先保持校准 lane 常开，但不建议抢占最高优先级。`;
    } else if (preset.code === "regression_guard") {
      if ((averageDeltaTotal ?? 0) < 0) {
        urgencyScore += 0.28;
        triggers.push(`近期平均 Delta ${averageDeltaTotal?.toFixed(2)}`);
      }
      if ((averageFailedCaseCount ?? 0) > 0.3) {
        urgencyScore += 0.22;
        triggers.push(`平均失败样本 ${averageFailedCaseCount?.toFixed(2)} 条`);
      }
      if (negativeRunCount >= 3) {
        urgencyScore += 0.15;
        triggers.push(`近 12 次实验中 ${negativeRunCount} 次退化`);
      }
      if (input.topRegressionReasons[0]) {
        urgencyScore += 0.1;
        triggers.push(`高频退化：${input.topRegressionReasons[0].label}`);
      }
      confidence = clampNumber(0.45 + negativeRunCount / 12, 0, 0.95);
      recommendedPriority = Math.max(currentPriority ?? 0, (averageDeltaTotal ?? 0) < 0 ? 320 : 280, preset.recommendedPriority);
      recommendedCadenceHours = (averageFailedCaseCount ?? 0) > 0.5 || negativeRunCount >= 4 ? 6 : 12;
      recommendedDecisionMode = "manual_review";
      recommendation = urgencyScore >= 0.5 ? "抬高守卫优先级，先止退化" : "保持守卫 lane 常驻";
      reason =
        urgencyScore >= 0.5
          ? `近期实验出现退化或失败抬头，应该优先做回归守卫，先确认质量和事实边界没有继续下滑。`
          : `当前回归风险可控，但仍建议保留守卫 lane，避免无人值守实验放大局部退化。`;
    } else if (preset.code === "title_lab") {
      if (headlineWeightDelta >= 0.02) {
        urgencyScore += 0.22;
        triggers.push(`标题权重建议上调 ${(headlineWeightDelta * 100).toFixed(1)}%`);
      }
      if (hookWeightDelta >= 0.02) {
        urgencyScore += 0.2;
        triggers.push(`Hook 权重建议上调 ${(hookWeightDelta * 100).toFixed(1)}%`);
      }
      if (falseNegativeCount > falsePositiveCount) {
        urgencyScore += 0.12;
        triggers.push("离线低估样本多于高估样本");
      }
      confidence = clampNumber(0.35 + Math.max(headlineWeightDelta, 0) * 6 + Math.max(hookWeightDelta, 0) * 6, 0, 0.9);
      recommendedPriority = Math.max(currentPriority ?? 0, urgencyScore >= 0.45 ? 240 : 180, preset.recommendedPriority);
      recommendedCadenceHours = urgencyScore >= 0.45 ? 6 : 12;
      recommendedDecisionMode = urgencyScore >= 0.5 ? "auto_keep_or_discard" : currentDecisionMode ?? "manual_review";
      recommendation = urgencyScore >= 0.45 ? "加快标题实验节奏" : "保持标题 lane 快速试验";
      reason =
        urgencyScore >= 0.45
          ? `线上反馈显示标题点击或开头留存仍有提效空间，适合把标题实验放到更高频的试验 lane。`
          : `标题与 hook 仍然值得持续快试，但当前还没到需要压过守卫和校准的程度。`;
    } else if (preset.code === "rollout_watch") {
      if (input.onlineCalibration.feedbackCount >= 3) {
        urgencyScore += 0.18;
        triggers.push(`灰度回流 ${input.onlineCalibration.feedbackCount} 条`);
      }
      if (falsePositiveCount > 0) {
        urgencyScore += 0.2;
        triggers.push(`离线高估 ${falsePositiveCount} 条`);
      }
      if (readerValueWeightDelta >= 0.02) {
        urgencyScore += 0.1;
        triggers.push(`读者收益感建议上调 ${(readerValueWeightDelta * 100).toFixed(1)}%`);
      }
      confidence = clampNumber(0.3 + input.onlineCalibration.feedbackCount / 18, 0, 0.9);
      recommendedPriority = Math.max(currentPriority ?? 0, falsePositiveCount > 0 ? 260 : 220, preset.recommendedPriority);
      recommendedCadenceHours = falsePositiveCount > 0 ? 12 : 24;
      recommendedDecisionMode = "manual_review";
      recommendation = input.onlineCalibration.feedbackCount >= 3 ? "围绕灰度结果持续复核" : "灰度观察先保持低频";
      reason =
        input.onlineCalibration.feedbackCount >= 3
          ? `已有真实发布反馈，适合围绕灰度版本持续做观测和复核，避免把偶然结果误判成稳定趋势。`
          : `当前灰度反馈还不够密，保持观察 lane 可用即可，不必过度调高资源占用。`;
    } else {
      if ((averageDeltaTotal ?? 0) >= 1.5) {
        urgencyScore += 0.12;
        triggers.push(`近期平均 Delta ${averageDeltaTotal?.toFixed(2)}`);
      }
      if (input.topImprovementReasons[0]) {
        urgencyScore += 0.08;
        triggers.push(`高频提分：${input.topImprovementReasons[0].label}`);
      }
      confidence = clampNumber(0.3 + recentRuns.length / 24, 0, 0.85);
      recommendedPriority = Math.max(currentPriority ?? 0, preset.recommendedPriority);
      recommendedCadenceHours = (averageDeltaTotal ?? 0) >= 1.5 ? 12 : 24;
      recommendedDecisionMode = currentDecisionMode ?? "manual_review";
      recommendation = (averageDeltaTotal ?? 0) >= 1.5 ? "可以维持常规巡检频率" : "保持基线巡检";
      reason = `常规巡检 lane 主要承担稳定对比和样本回归，不建议因为单次波动频繁改策略。`;
    }

    urgencyScore = clampNumber(Number(urgencyScore.toFixed(2)), 0, 0.99);
    confidence = clampNumber(Number(confidence.toFixed(2)), 0, 0.99);
    const executionState =
      executableSchedules.length > 0
        ? "executable"
        : blockedSchedules.length > 0
          ? "blocked"
          : "missing";
    const executionBlocker =
      executableSchedules.length > 0
        ? null
        : blockedSchedules[0]
          ? blockedSchedules[0].readiness.blockers[0]
            || blockedSchedules[0].readiness.warnings[0]
            || (blockedSchedules[0].datasetStatus !== "active" ? `dataset:${blockedSchedules[0].datasetStatus}` : "当前没有可执行规则")
          : "当前还没有启用规则";

    if (executionState === "missing") {
      recommendation = "先创建并启用该策略规则";
      reason = `当前 ${preset.label} 还没有启用中的调度规则，新的优先级或节奏建议无法实际执行。应先创建或启用对应 lane，再继续观察信号是否值得放大。`;
      recommendedDecisionMode = "manual_review";
      confidence = clampNumber(Math.max(confidence, 0.72), 0, 0.99);
    } else if (executionState === "blocked") {
      recommendation = "先修复数据集或规则可执行性";
      reason = `当前 ${preset.label} 已有启用规则，但全部被数据集状态或 readiness 守卫阻断。应先处理数据集状态、样本覆盖或规则配置，再决定是否继续加权、提频或自动决议。`;
      recommendedDecisionMode = "manual_review";
      confidence = clampNumber(Math.max(confidence, 0.78), 0, 0.99);
    }

    return {
      code: preset.code,
      label: preset.label,
      description: preset.description,
      primaryScheduleId,
      primaryExecutableScheduleId,
      scheduleIds: schedules.map((schedule) => schedule.id),
      enabledScheduleCount: enabledSchedules.length,
      executableScheduleCount: executableSchedules.length,
      blockedScheduleCount: blockedSchedules.length,
      currentPriority,
      currentCadenceHours,
      currentDecisionMode,
      recommendedPriority,
      recommendedCadenceHours,
      recommendedDecisionMode,
      urgencyScore,
      confidence,
      recommendation,
      reason:
        blockedSchedules.length > 0
          ? `${reason} 当前有 ${blockedSchedules.length} 条已启用规则因为数据集状态或 readiness 守卫不可执行。`
          : reason,
      triggers: triggers.slice(0, 3),
      executionState,
      executionBlocker,
    };
  }).sort((left, right) => right.urgencyScore - left.urgencyScore || right.recommendedPriority - left.recommendedPriority);
}

async function refreshDatasetSampleCount(datasetId: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM writing_eval_cases WHERE dataset_id = ?",
    [datasetId],
  );
  await db.exec(
    "UPDATE writing_eval_datasets SET sample_count = ?, updated_at = ? WHERE id = ?",
    [row?.count ?? 0, new Date().toISOString(), datasetId],
  );
}

async function enqueueWritingEvalRun(runId: number, runCode: string, datasetId: number, triggerMode: string) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO job_queue (job_type, status, payload_json, run_at, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      "writingEvalRun",
      "queued",
      {
        runId,
        runCode,
        datasetId,
        triggerMode,
        createdAt: now,
      },
      now,
      0,
      now,
      now,
    ],
  );
}

async function getArticleOutcomeCalibrationItems(limit = 240) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const outcomeRows = await db.query<ArticleOutcomeCalibrationRow>(
    `SELECT ao.id, ao.article_id AS article_id, ao.target_package, ao.scorecard_json, ao.hit_status, ao.review_summary, ao.updated_at, d.title
     FROM article_outcomes ao
     LEFT JOIN articles d ON d.id = ao.article_id
     ORDER BY ao.updated_at DESC, ao.id DESC
     LIMIT ?`,
    [limit],
  );
  if (outcomeRows.length === 0) {
    return [] as CalibrationInsightItem[];
  }
  const outcomeIds = outcomeRows.map((item) => item.id);
  const placeholders = outcomeIds.map(() => "?").join(", ");
  const snapshotRows = await db.query<ArticleOutcomeCalibrationSnapshotRow>(
    `SELECT outcome_id, read_count, share_count, like_count
     FROM article_outcome_snapshots
     WHERE outcome_id IN (${placeholders})`,
    outcomeIds,
  );
  const snapshotsByOutcomeId = new Map<number, ArticleOutcomeCalibrationSnapshotRow[]>();
  for (const snapshot of snapshotRows) {
    const current = snapshotsByOutcomeId.get(snapshot.outcome_id) ?? [];
    current.push(snapshot);
    snapshotsByOutcomeId.set(snapshot.outcome_id, current);
  }
  return outcomeRows
    .map((row) => mapArticleOutcomeCalibrationItem(row, snapshotsByOutcomeId.get(row.id) ?? []))
    .filter((item) => item.predictedViralScore !== null && item.observedViralScore !== null);
}

async function resolveWritingEvalRunDefinition(input: {
  datasetId: number;
  baseVersionType: string;
  baseVersionRef: string;
  candidateVersionType: string;
  candidateVersionRef: string;
  experimentMode?: string;
}) {
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  const baseVersionType = String(input.baseVersionType || "").trim();
  const baseVersionRef = String(input.baseVersionRef || "").trim();
  const candidateVersionType = String(input.candidateVersionType || "").trim();
  const candidateVersionRef = String(input.candidateVersionRef || "").trim();
  const experimentMode = normalizeWritingEvalExperimentMode(input.experimentMode);
  if (!baseVersionType || !baseVersionRef || !candidateVersionType || !candidateVersionRef) {
    throw new Error("实验版本信息不完整");
  }
  if (
    !["prompt_version", "scoring_profile", "layout_strategy", "apply_command_template"].includes(baseVersionType) ||
    !["prompt_version", "scoring_profile", "layout_strategy", "apply_command_template"].includes(candidateVersionType)
  ) {
    throw new Error("当前仅支持 prompt_version、scoring_profile、layout_strategy 与 apply_command_template 实验");
  }
  if (baseVersionType !== candidateVersionType) {
    throw new Error("一次实验只能比较同一类型的可变对象");
  }

  const db = getDatabase();
  const dataset = await db.queryOne<{ id: number; status: string }>("SELECT id, status FROM writing_eval_datasets WHERE id = ?", [input.datasetId]);
  if (!dataset) {
    throw new Error("评测集不存在");
  }
  if (baseVersionType === "prompt_version") {
    const basePromptRef = parsePromptVersionRef(baseVersionRef);
    const candidatePromptRef = parsePromptVersionRef(candidateVersionRef);
    if (basePromptRef.promptId !== candidatePromptRef.promptId) {
      throw new Error("Prompt 实验必须在同一个 prompt 对象内比较不同版本");
    }
    const requiredPromptTargetId = getRequiredPromptTargetIdForExperimentMode(experimentMode);
    if (requiredPromptTargetId && (basePromptRef.promptId !== requiredPromptTargetId || candidatePromptRef.promptId !== requiredPromptTargetId)) {
      throw new Error(
        experimentMode === "title_only"
          ? "标题专项实验只能比较 outline_planning Prompt 版本"
          : "开头专项实验只能比较 prose_polish Prompt 版本",
      );
    }
    const [basePrompt, candidatePrompt] = await Promise.all([
      db.queryOne<{ id: number }>("SELECT id FROM prompt_versions WHERE prompt_id = ? AND version = ?", [basePromptRef.promptId, basePromptRef.version]),
      db.queryOne<{ id: number }>("SELECT id FROM prompt_versions WHERE prompt_id = ? AND version = ?", [candidatePromptRef.promptId, candidatePromptRef.version]),
    ]);
    if (!basePrompt || !candidatePrompt) {
      throw new Error("所选 Prompt 版本不存在");
    }
  }
  if (baseVersionType === "scoring_profile") {
    if (experimentMode !== "full_article") {
      throw new Error("标题专项或开头专项实验当前仅支持 Prompt 版本对比");
    }
    const [baseProfile, candidateProfile] = await Promise.all([
      db.queryOne<{ id: number }>("SELECT id FROM writing_eval_scoring_profiles WHERE code = ?", [baseVersionRef]),
      db.queryOne<{ id: number }>("SELECT id FROM writing_eval_scoring_profiles WHERE code = ?", [candidateVersionRef]),
    ]);
    if (!baseProfile || !candidateProfile) {
      throw new Error("所选评分画像不存在");
    }
  }
  if (baseVersionType === "layout_strategy") {
    if (experimentMode !== "full_article") {
      throw new Error("写作风格资产实验当前仅支持全文实验");
    }
    const [baseLayoutStrategy, candidateLayoutStrategy] = await Promise.all([
      db.queryOne<{ id: number }>("SELECT id FROM layout_strategies WHERE id = ?", [Number(baseVersionRef)]),
      db.queryOne<{ id: number }>("SELECT id FROM layout_strategies WHERE id = ?", [Number(candidateVersionRef)]),
    ]);
    if (!baseLayoutStrategy || !candidateLayoutStrategy) {
      throw new Error("所选写作风格资产不存在");
    }
  }
  if (baseVersionType === "apply_command_template") {
    if (experimentMode !== "full_article") {
      throw new Error("apply command 模板实验当前仅支持全文实验");
    }
    const supportedCodes = new Set(WRITING_EVAL_APPLY_COMMAND_TEMPLATES.map((item) => item.code));
    if (!supportedCodes.has(baseVersionRef) || !supportedCodes.has(candidateVersionRef)) {
      throw new Error("所选 apply command 模板不存在");
    }
  }

  return {
    datasetId: input.datasetId,
    datasetStatus: normalizeWritingEvalDatasetStatus(dataset.status),
    baseVersionType,
    baseVersionRef,
    candidateVersionType,
    candidateVersionRef,
    experimentMode,
  };
}

export async function getWritingEvalDatasets() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     ORDER BY updated_at DESC, id DESC`,
  );
  const readinessMap = await getWritingEvalDatasetReadinessMap(rows.map((row) => ({ id: row.id, status: row.status })));
  return rows.map((row) => mapDataset(row, readinessMap.get(row.id) ?? getWritingEvalDatasetReadiness([], row.status)));
}

export async function getWritingEvalRunSchedules() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingEvalRunScheduleRow>(
    `SELECT s.id, s.name, s.dataset_id, s.base_version_type, s.base_version_ref, s.candidate_version_type, s.candidate_version_ref,
            s.experiment_mode, s.trigger_mode, s.agent_strategy, s.decision_mode, s.priority, s.cadence_hours, s.next_run_at, s.last_dispatched_at, s.last_run_id, s.last_error,
            s.is_enabled, s.summary, s.created_by, s.created_at, s.updated_at,
            d.name AS dataset_name, d.status AS dataset_status, r.run_code AS last_run_code, r.status AS last_run_status
     FROM writing_eval_run_schedules s
     INNER JOIN writing_eval_datasets d ON d.id = s.dataset_id
     LEFT JOIN writing_optimization_runs r ON r.id = s.last_run_id
     ORDER BY s.is_enabled DESC, s.priority DESC, s.next_run_at ASC, s.updated_at DESC, s.id DESC`,
  );
  const readinessMap = await getWritingEvalDatasetReadinessMap(rows.map((row) => ({ id: row.dataset_id, status: row.dataset_status })));
  return rows.map((row) => mapRunSchedule(row, readinessMap.get(row.dataset_id) ?? getWritingEvalDatasetReadiness([], row.dataset_status)));
}

export async function getWritingEvalRunScheduleById(scheduleId: number) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) throw new Error("调度规则无效");
  const db = getDatabase();
  const row = await db.queryOne<WritingEvalRunScheduleRow>(
    `SELECT s.id, s.name, s.dataset_id, s.base_version_type, s.base_version_ref, s.candidate_version_type, s.candidate_version_ref,
            s.experiment_mode, s.trigger_mode, s.agent_strategy, s.decision_mode, s.priority, s.cadence_hours, s.next_run_at, s.last_dispatched_at, s.last_run_id, s.last_error,
            s.is_enabled, s.summary, s.created_by, s.created_at, s.updated_at,
            d.name AS dataset_name, d.status AS dataset_status, r.run_code AS last_run_code, r.status AS last_run_status
     FROM writing_eval_run_schedules s
     INNER JOIN writing_eval_datasets d ON d.id = s.dataset_id
     LEFT JOIN writing_optimization_runs r ON r.id = s.last_run_id
     WHERE s.id = ?`,
    [scheduleId],
  );
  if (!row) {
    throw new Error("调度规则不存在");
  }
  return mapRunSchedule(row, await getWritingEvalDatasetReadinessById(row.dataset_id, row.dataset_status));
}

export async function createWritingEvalRunSchedule(input: {
  name: string;
  datasetId: number;
  baseVersionType: string;
  baseVersionRef: string;
  candidateVersionType: string;
  candidateVersionRef: string;
  experimentMode?: string;
  triggerMode?: string;
  agentStrategy?: string;
  decisionMode?: string;
  priority?: number;
  cadenceHours?: number;
  nextRunAt?: string | null;
  isEnabled?: boolean;
  summary?: string | null;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  const name = String(input.name || "").trim();
  if (!name) throw new Error("调度规则名称不能为空");
  const resolved = await resolveWritingEvalRunDefinition(input);
  const cadenceHours = normalizeWritingEvalScheduleCadenceHours(input.cadenceHours);
  const nextRunAt = normalizeScheduleNextRunAt(input.nextRunAt, cadenceHours);
  const triggerMode = normalizeWritingEvalTriggerMode(input.triggerMode, "scheduled");
  const agentStrategy = normalizeWritingEvalAgentStrategy(input.agentStrategy);
  const decisionMode = normalizeWritingEvalDecisionMode(input.decisionMode);
  const priority = normalizeWritingEvalSchedulePriority(input.priority);
  await assertWritingEvalDatasetExecutionReadiness({
    datasetId: resolved.datasetId,
    datasetStatus: resolved.datasetStatus,
    triggerMode,
    decisionMode,
  });
  const db = getDatabase();
  const now = new Date().toISOString();
  const inserted = await db.exec(
    `INSERT INTO writing_eval_run_schedules (
      name, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
      experiment_mode, trigger_mode, agent_strategy, decision_mode, priority, cadence_hours, next_run_at, last_dispatched_at, last_run_id, last_error,
      is_enabled, summary, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      resolved.datasetId,
      resolved.baseVersionType,
      resolved.baseVersionRef,
      resolved.candidateVersionType,
      resolved.candidateVersionRef,
      resolved.experimentMode,
      triggerMode,
      agentStrategy,
      decisionMode,
      priority,
      cadenceHours,
      nextRunAt,
      null,
      null,
      null,
      input.isEnabled ?? true,
      String(input.summary || "").trim() || null,
      input.createdBy ?? null,
      now,
      now,
    ],
  );
  const created = await getWritingEvalRunScheduleById(Number(inserted.lastInsertRowid || 0));
  await appendAuditLog({
    userId: input.createdBy ?? null,
    action: "writing_eval_schedule_create",
    targetType: "writing_eval_run_schedule",
    targetId: created.id,
      payload: {
        name: created.name,
        datasetId: created.datasetId,
        experimentMode: created.experimentMode,
        triggerMode: created.triggerMode,
        agentStrategy: created.agentStrategy,
        decisionMode: created.decisionMode,
        priority: created.priority,
        cadenceHours: created.cadenceHours,
        candidateVersionRef: created.candidateVersionRef,
      },
  });
  return created;
}

export async function updateWritingEvalRunSchedule(input: {
  scheduleId: number;
  operatorUserId?: number | null;
  name?: string;
  datasetId?: number;
  baseVersionType?: string;
  baseVersionRef?: string;
  candidateVersionType?: string;
  candidateVersionRef?: string;
  experimentMode?: string;
  triggerMode?: string;
  agentStrategy?: string;
  decisionMode?: string;
  priority?: number;
  cadenceHours?: number;
  nextRunAt?: string | null;
  isEnabled?: boolean;
  summary?: string | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.scheduleId) || input.scheduleId <= 0) throw new Error("调度规则无效");
  const db = getDatabase();
  const existing = await db.queryOne<WritingEvalRunScheduleRow>(
    `SELECT id, name, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
            experiment_mode, trigger_mode, agent_strategy, decision_mode, priority, cadence_hours, next_run_at, last_dispatched_at, last_run_id, last_error,
            is_enabled, summary, created_by, created_at, updated_at
     FROM writing_eval_run_schedules
     WHERE id = ?`,
    [input.scheduleId],
  );
  if (!existing) {
    throw new Error("调度规则不存在");
  }
  const name = input.name === undefined ? existing.name : String(input.name || "").trim();
  if (!name) throw new Error("调度规则名称不能为空");
  const resolved = await resolveWritingEvalRunDefinition({
    datasetId: input.datasetId ?? existing.dataset_id,
    baseVersionType: input.baseVersionType ?? existing.base_version_type,
    baseVersionRef: input.baseVersionRef ?? existing.base_version_ref,
    candidateVersionType: input.candidateVersionType ?? existing.candidate_version_type,
    candidateVersionRef: input.candidateVersionRef ?? existing.candidate_version_ref,
    experimentMode: input.experimentMode ?? existing.experiment_mode,
  });
  const cadenceHours = normalizeWritingEvalScheduleCadenceHours(input.cadenceHours ?? existing.cadence_hours);
  const nextRunAt = normalizeScheduleNextRunAt(input.nextRunAt ?? existing.next_run_at, cadenceHours);
  const triggerMode = normalizeWritingEvalTriggerMode(input.triggerMode ?? existing.trigger_mode, "scheduled");
  const agentStrategy = normalizeWritingEvalAgentStrategy(input.agentStrategy ?? existing.agent_strategy);
  const decisionMode = normalizeWritingEvalDecisionMode(input.decisionMode ?? existing.decision_mode);
  const priority = normalizeWritingEvalSchedulePriority(input.priority ?? existing.priority);
  const nextIsEnabled = input.isEnabled ?? Boolean(existing.is_enabled);
  if (nextIsEnabled) {
    await assertWritingEvalDatasetExecutionReadiness({
      datasetId: resolved.datasetId,
      datasetStatus: resolved.datasetStatus,
      triggerMode,
      decisionMode,
    });
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE writing_eval_run_schedules
     SET name = ?, dataset_id = ?, base_version_type = ?, base_version_ref = ?, candidate_version_type = ?, candidate_version_ref = ?,
         experiment_mode = ?, trigger_mode = ?, agent_strategy = ?, decision_mode = ?, priority = ?, cadence_hours = ?, next_run_at = ?, is_enabled = ?, summary = ?, updated_at = ?
     WHERE id = ?`,
    [
      name,
      resolved.datasetId,
      resolved.baseVersionType,
      resolved.baseVersionRef,
      resolved.candidateVersionType,
      resolved.candidateVersionRef,
      resolved.experimentMode,
      triggerMode,
      agentStrategy,
      decisionMode,
      priority,
      cadenceHours,
      nextRunAt,
      nextIsEnabled,
      input.summary === undefined ? existing.summary : String(input.summary || "").trim() || null,
      now,
      input.scheduleId,
    ],
  );
  const updated = await getWritingEvalRunScheduleById(input.scheduleId);
  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_schedule_update",
    targetType: "writing_eval_run_schedule",
    targetId: updated.id,
    payload: {
      name: updated.name,
      isEnabled: updated.isEnabled,
      nextRunAt: updated.nextRunAt,
      cadenceHours: updated.cadenceHours,
      triggerMode: updated.triggerMode,
      agentStrategy: updated.agentStrategy,
      decisionMode: updated.decisionMode,
      priority: updated.priority,
    },
  });
  return updated;
}

export async function dispatchWritingEvalRunSchedule(input: { scheduleId: number; operatorUserId?: number | null; force?: boolean }) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.scheduleId) || input.scheduleId <= 0) throw new Error("调度规则无效");
  const db = getDatabase();
  const schedule = await db.queryOne<WritingEvalRunScheduleRow>(
    `SELECT id, name, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
            experiment_mode, trigger_mode, agent_strategy, decision_mode, priority, cadence_hours, next_run_at, last_dispatched_at, last_run_id, last_error,
            is_enabled, summary, created_by, created_at, updated_at
     FROM writing_eval_run_schedules
     WHERE id = ?`,
    [input.scheduleId],
  );
  if (!schedule) {
    throw new Error("调度规则不存在");
  }
  if (!Boolean(schedule.is_enabled) && !input.force) {
    throw new Error("当前调度规则已停用");
  }
  const now = new Date().toISOString();
  if (!input.force && schedule.next_run_at && new Date(schedule.next_run_at).getTime() > Date.now()) {
    throw new Error("当前调度规则尚未到执行时间");
  }
  try {
    const run = await createWritingEvalRun({
      datasetId: schedule.dataset_id,
      baseVersionType: schedule.base_version_type,
      baseVersionRef: schedule.base_version_ref,
      candidateVersionType: schedule.candidate_version_type,
      candidateVersionRef: schedule.candidate_version_ref,
      experimentMode: schedule.experiment_mode,
      triggerMode: normalizeWritingEvalTriggerMode(schedule.trigger_mode, "scheduled"),
      decisionMode: normalizeWritingEvalDecisionMode(schedule.decision_mode),
      summary: [schedule.summary, `schedule:${schedule.name}#${schedule.id}`].filter(Boolean).join("\n"),
      createdBy: input.operatorUserId ?? schedule.created_by,
    });
    await db.exec(
      `UPDATE writing_eval_run_schedules
       SET last_dispatched_at = ?, next_run_at = ?, last_run_id = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`,
      [now, addHoursToIso(now, normalizeWritingEvalScheduleCadenceHours(schedule.cadence_hours)), run.id, now, schedule.id],
    );
    const updatedSchedule = await getWritingEvalRunScheduleById(schedule.id);
    await appendAuditLog({
      userId: input.operatorUserId ?? null,
      action: "writing_eval_schedule_dispatch",
      targetType: "writing_eval_run_schedule",
      targetId: schedule.id,
      payload: {
        force: Boolean(input.force),
        triggerMode: updatedSchedule.triggerMode,
        agentStrategy: updatedSchedule.agentStrategy,
        decisionMode: updatedSchedule.decisionMode,
        runId: run.id,
        runCode: run.runCode,
        nextRunAt: updatedSchedule.nextRunAt,
      },
    });
    return {
      schedule: updatedSchedule,
      run,
    };
  } catch (error) {
    await db.exec(
      `UPDATE writing_eval_run_schedules
       SET last_error = ?, updated_at = ?
       WHERE id = ?`,
      [error instanceof Error ? error.message.slice(0, 400) : "调度派发失败", now, schedule.id],
    );
    throw error;
  }
}

export async function dispatchDueWritingEvalRunSchedules(input?: {
  limit?: number;
  operatorUserId?: number | null;
  triggerMode?: string;
  agentStrategy?: string | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const limit = Math.min(20, Math.max(1, Math.round(Number(input?.limit ?? 10))));
  const triggerMode = input?.triggerMode ? normalizeWritingEvalTriggerMode(input.triggerMode, "scheduled") : null;
  const agentStrategy = input?.agentStrategy === undefined || input?.agentStrategy === null ? null : normalizeWritingEvalAgentStrategy(input.agentStrategy);
  const queryParts = [
    `SELECT id, name, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
            experiment_mode, trigger_mode, agent_strategy, priority, cadence_hours, next_run_at, last_dispatched_at, last_run_id, last_error,
            is_enabled, summary, created_by, created_at, updated_at
     FROM writing_eval_run_schedules
     WHERE is_enabled = ? AND next_run_at IS NOT NULL AND next_run_at <= ?`,
  ];
  const params: Array<string | number | boolean> = [true, now];
  if (triggerMode) {
    queryParts.push("AND trigger_mode = ?");
    params.push(triggerMode);
  }
  if (agentStrategy) {
    queryParts.push("AND agent_strategy = ?");
    params.push(agentStrategy);
  }
  queryParts.push("ORDER BY priority DESC, next_run_at ASC, id ASC LIMIT ?");
  params.push(limit);
  const rows = await db.query<WritingEvalRunScheduleRow>(
    queryParts.join("\n"),
    params,
  );
  const items = [];
  const skipped = [];
  for (const row of rows) {
    try {
      items.push(await dispatchWritingEvalRunSchedule({ scheduleId: row.id, operatorUserId: input?.operatorUserId, force: true }));
    } catch (error) {
      const schedule = await getWritingEvalRunScheduleById(row.id);
      skipped.push({
        scheduleId: row.id,
        scheduleName: row.name,
        reason: error instanceof Error ? error.message : "派发失败",
        schedule,
      });
    }
  }
  return {
    dispatchedCount: items.length,
    items,
    skippedCount: skipped.length,
    skipped,
  };
}

export async function createWritingEvalDataset(input: {
  code: string;
  name: string;
  description?: string | null;
  status?: string;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  if (!code) throw new Error("数据集编码不能为空");
  if (!name) throw new Error("数据集名称不能为空");
  const status = String(input.status || "").trim() || "draft";
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO writing_eval_datasets (code, name, description, status, sample_count, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, name, String(input.description || "").trim() || null, status, 0, input.createdBy ?? null, now, now],
  );
  const created = await db.queryOne<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     WHERE id = ?`,
    [Number(result.lastInsertRowid || 0)],
  );
  if (!created) {
    throw new Error("创建评测集失败");
  }
  return mapDataset(created, getWritingEvalDatasetReadiness([]));
}

export async function updateWritingEvalDataset(input: {
  datasetId: number;
  code?: string;
  name?: string;
  description?: string | null;
  status?: string;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  const db = getDatabase();
  const current = await db.queryOne<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     WHERE id = ?`,
    [input.datasetId],
  );
  if (!current) {
    throw new Error("评测集不存在");
  }
  const code = String(input.code ?? current.code).trim();
  const name = String(input.name ?? current.name).trim();
  const status = String(input.status ?? current.status).trim() || "draft";
  if (!code) throw new Error("数据集编码不能为空");
  if (!name) throw new Error("数据集名称不能为空");
  await db.exec(
    `UPDATE writing_eval_datasets
     SET code = ?, name = ?, description = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    [
      code,
      name,
      input.description !== undefined ? String(input.description || "").trim() || null : current.description,
      status,
      new Date().toISOString(),
      input.datasetId,
    ],
  );
  const updated = await db.queryOne<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     WHERE id = ?`,
    [input.datasetId],
  );
  if (!updated) {
    throw new Error("更新评测集失败");
  }
  return mapDataset(updated, await getWritingEvalDatasetReadinessById(updated.id));
}

export async function getWritingEvalScoringProfiles() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingEvalScoringProfileRow>(
    `SELECT id, code, name, description, config_json, is_active, created_by, created_at, updated_at
     FROM writing_eval_scoring_profiles
     ORDER BY is_active DESC, updated_at DESC, id DESC`,
  );
  return rows.map(mapScoringProfile);
}

export async function getActiveWritingEvalScoringProfile() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<WritingEvalScoringProfileRow>(
    `SELECT id, code, name, description, config_json, is_active, created_by, created_at, updated_at
     FROM writing_eval_scoring_profiles
     WHERE is_active = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [true],
  );
  return row ? mapScoringProfile(row) : null;
}

export async function getWritingEvalLayoutStrategies() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingEvalLayoutStrategyRow>(
    `SELECT id, code, name, description, meta, config_json, is_official, owner_user_id, created_at, updated_at
     FROM layout_strategies
     WHERE is_official = ? OR owner_user_id IS NOT NULL
     ORDER BY is_official DESC, owner_user_id ASC, updated_at DESC, id DESC`,
    [true],
  );
  return rows.map(mapLayoutStrategy);
}

export async function getWritingEvalApplyCommandTemplates() {
  await ensureExtendedProductSchema();
  return WRITING_EVAL_APPLY_COMMAND_TEMPLATES.map((item) => ({
    ...item,
  }));
}

export async function createWritingEvalScoringProfile(input: {
  code: string;
  name: string;
  description?: string | null;
  config?: Record<string, unknown>;
  isActive?: boolean;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  if (!code) throw new Error("评分画像编码不能为空");
  if (!name) throw new Error("评分画像名称不能为空");
  const db = getDatabase();
  const now = new Date().toISOString();
  if (input.isActive) {
    await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ?", [false, now]);
  }
  const result = await db.exec(
    `INSERT INTO writing_eval_scoring_profiles (code, name, description, config_json, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      name,
      String(input.description || "").trim() || null,
      input.config ?? {},
      input.isActive ?? true,
      input.createdBy ?? null,
      now,
      now,
    ],
  );
  const created = await db.queryOne<WritingEvalScoringProfileRow>(
    `SELECT id, code, name, description, config_json, is_active, created_by, created_at, updated_at
     FROM writing_eval_scoring_profiles
     WHERE id = ?`,
    [Number(result.lastInsertRowid || 0)],
  );
  if (!created) {
    throw new Error("创建评分画像失败");
  }
  return mapScoringProfile(created);
}

export async function createCalibratedWritingEvalScoringProfile(input: {
  baseProfileId: number;
  code?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.baseProfileId) || input.baseProfileId <= 0) {
    throw new Error("评分画像无效");
  }
  const db = getDatabase();
  const baseProfile = await db.queryOne<WritingEvalScoringProfileRow>(
    `SELECT id, code, name, description, config_json, is_active, created_by, created_at, updated_at
     FROM writing_eval_scoring_profiles
     WHERE id = ?`,
    [input.baseProfileId],
  );
  if (!baseProfile) {
    throw new Error("评分画像不存在");
  }

  const insights = await getWritingEvalInsights();
  const onlineCalibration = insights.onlineCalibration as {
    linkedResultCount?: number;
    averageCalibrationGap?: number | null;
    weightRecommendations?: Array<{
      key: keyof typeof VIRAL_WEIGHT_KEY_BY_SIGNAL_KEY;
      label: string;
      recommendedWeight: number;
      sampleCount: number;
      correlation: number | null;
      lift: number | null;
      confidence: number;
      recommendation: string;
      reason: string;
    }>;
  };
  const recommendations = Array.isArray(onlineCalibration.weightRecommendations) ? onlineCalibration.weightRecommendations : [];
  if ((onlineCalibration.linkedResultCount ?? 0) < 3 || recommendations.length === 0) {
    throw new Error("线上回流样本不足，暂时不能生成校准版评分画像");
  }

  const baseConfig = parseJsonObject(baseProfile.config_json);
  const currentViralWeights = normalizeWeightMap(
    Object.values(VIRAL_WEIGHT_KEY_BY_SIGNAL_KEY),
    getRecord(baseConfig.viralWeights),
  );
  const nextViralWeights = Object.fromEntries(
    recommendations.map((item) => {
      const weightKey = VIRAL_WEIGHT_KEY_BY_SIGNAL_KEY[item.key];
      const blendedWeight = Number((((currentViralWeights[weightKey] as number) ?? 0) * 0.5 + item.recommendedWeight * 0.5).toFixed(4));
      return [weightKey, blendedWeight];
    }),
  );
  const now = new Date().toISOString();
  const recommendedCode = `${baseProfile.code}-cal-${now.slice(2, 10).replace(/-/g, "")}`;
  const calibratedConfig = {
    ...baseConfig,
    viralWeights: nextViralWeights,
    calibrationMeta: {
      sourceProfileId: baseProfile.id,
      sourceProfileCode: baseProfile.code,
      linkedResultCount: onlineCalibration.linkedResultCount ?? 0,
      averageCalibrationGap: onlineCalibration.averageCalibrationGap ?? null,
      generatedAt: now,
      blendRatio: 0.5,
      recommendations: recommendations.map((item) => ({
        key: item.key,
        label: item.label,
        recommendedWeight: item.recommendedWeight,
        sampleCount: item.sampleCount,
        correlation: item.correlation,
        lift: item.lift,
        confidence: item.confidence,
        recommendation: item.recommendation,
        reason: item.reason,
      })),
    },
  };

  return createWritingEvalScoringProfile({
    code: String(input.code || "").trim() || recommendedCode,
    name: String(input.name || "").trim() || `${baseProfile.name} · 校准版`,
    description:
      String(input.description || "").trim() ||
      `基于 ${onlineCalibration.linkedResultCount ?? 0} 条线上回流生成，平均校准偏差 ${formatMetricNumber(onlineCalibration.averageCalibrationGap)}。`,
    config: calibratedConfig,
    isActive: input.isActive ?? false,
    createdBy: input.createdBy ?? null,
  });
}

export async function autoCalibrateWritingEvalScoringProfile(input?: {
  activate?: boolean;
  force?: boolean;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  const [activeProfile, profiles, insights] = await Promise.all([
    getActiveWritingEvalScoringProfile(),
    getWritingEvalScoringProfiles(),
    getWritingEvalInsights(),
  ]);
  if (!activeProfile) {
    return {
      action: "noop",
      reason: "当前没有 active 评分画像",
    };
  }

  const onlineCalibration = insights.onlineCalibration as {
    linkedResultCount?: number;
    averageCalibrationGap?: number | null;
    falsePositiveCases?: Array<unknown>;
    falseNegativeCases?: Array<unknown>;
    weightRecommendations?: Array<{ confidence: number }>;
  };
  const linkedResultCount = Number(onlineCalibration.linkedResultCount ?? 0);
  const averageCalibrationGap = Math.abs(Number(onlineCalibration.averageCalibrationGap ?? 0));
  const falsePositiveCount = Array.isArray(onlineCalibration.falsePositiveCases) ? onlineCalibration.falsePositiveCases.length : 0;
  const falseNegativeCount = Array.isArray(onlineCalibration.falseNegativeCases) ? onlineCalibration.falseNegativeCases.length : 0;
  const misjudgedCaseCount = falsePositiveCount + falseNegativeCount;
  const recommendations = Array.isArray(onlineCalibration.weightRecommendations) ? onlineCalibration.weightRecommendations : [];
  const averageConfidence = averageNumbers(recommendations.map((item) => Number(item.confidence ?? 0))) ?? 0;
  const activeProfileCalibrationMeta = getWritingEvalCalibrationMeta(activeProfile.config);
  const latestDerivedProfile =
    String(activeProfileCalibrationMeta.generatedAt || "").trim()
      ? activeProfile
      : profiles.find((profile) => Number(getWritingEvalCalibrationMeta(profile.config).sourceProfileId ?? 0) === activeProfile.id) ?? null;
  const latestDerivedMeta = latestDerivedProfile ? getWritingEvalCalibrationMeta(latestDerivedProfile.config) : {};
  const generatedAt = String(latestDerivedMeta.generatedAt || "").trim();
  const generatedAtMs = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  const inCooldown =
    Number.isFinite(generatedAtMs) &&
    Date.now() - generatedAtMs < WRITING_EVAL_AUTO_CALIBRATION_COOLDOWN_HOURS * 60 * 60 * 1000;
  const lastLinkedResultCount = Number(latestDerivedMeta.linkedResultCount ?? 0);
  const lastAverageGap = Math.abs(Number(latestDerivedMeta.averageCalibrationGap ?? 0));
  const noMeaningfulSignalChange =
    latestDerivedProfile !== null &&
    linkedResultCount <= lastLinkedResultCount + 1 &&
    Math.abs(averageCalibrationGap - lastAverageGap) < 1;

  if (!input?.force) {
    if (linkedResultCount < WRITING_EVAL_AUTO_CALIBRATION_MIN_LINKED_RESULTS) {
      return {
        action: "noop",
        reason: `线上绑定样本仅 ${linkedResultCount} 条，未达到自动校准阈值`,
      };
    }
    if (recommendations.length === 0 || averageConfidence < WRITING_EVAL_AUTO_CALIBRATION_MIN_CONFIDENCE) {
      return {
        action: "noop",
        reason: `当前权重建议置信度仅 ${(averageConfidence * 100).toFixed(0)}%，暂不自动校准`,
      };
    }
    if (
      averageCalibrationGap < WRITING_EVAL_AUTO_CALIBRATION_MIN_AVERAGE_GAP &&
      misjudgedCaseCount < WRITING_EVAL_AUTO_CALIBRATION_MIN_MISJUDGED_CASES
    ) {
      return {
        action: "noop",
        reason: `平均偏差 ${averageCalibrationGap.toFixed(2)}、误判样本 ${misjudgedCaseCount} 条，暂不需要自动校准`,
      };
    }
    if (inCooldown) {
      return {
        action: "noop",
        reason: `距离上次自动校准未满 ${WRITING_EVAL_AUTO_CALIBRATION_COOLDOWN_HOURS} 小时`,
        latestProfileCode: latestDerivedProfile?.code ?? null,
      };
    }
    if (noMeaningfulSignalChange) {
      return {
        action: "noop",
        reason: "最近一次自动校准后，样本量和偏差信号尚未出现明显变化",
        latestProfileCode: latestDerivedProfile?.code ?? null,
      };
    }
  }

  const created = await createCalibratedWritingEvalScoringProfile({
    baseProfileId: activeProfile.id,
    isActive: input?.activate ?? true,
    description: `系统自动校准生成：基于 ${linkedResultCount} 条线上回流，平均校准偏差 ${formatMetricNumber(
      onlineCalibration.averageCalibrationGap,
    )}，误判样本 ${misjudgedCaseCount} 条。`,
    createdBy: input?.createdBy ?? null,
  });

  await appendAuditLog({
    userId: input?.createdBy ?? null,
    action: "writing_eval_scoring_profile_auto_calibrate",
    targetType: "writing_eval_scoring_profile",
    targetId: created.id,
    payload: {
      sourceProfileId: activeProfile.id,
      sourceProfileCode: activeProfile.code,
      linkedResultCount,
      averageCalibrationGap: onlineCalibration.averageCalibrationGap ?? null,
      misjudgedCaseCount,
      autoActivated: input?.activate ?? true,
    },
  });

  return {
    action: "created",
    reason: "已生成自动校准评分画像",
    profile: created,
    sourceProfileCode: activeProfile.code,
  };
}

export async function updateWritingEvalScoringProfile(input: {
  profileId: number;
  code?: string;
  name?: string;
  description?: string | null;
  config?: Record<string, unknown>;
  isActive?: boolean;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.profileId) || input.profileId <= 0) throw new Error("评分画像无效");
  const db = getDatabase();
  const current = await db.queryOne<WritingEvalScoringProfileRow>(
    `SELECT id, code, name, description, config_json, is_active, created_by, created_at, updated_at
     FROM writing_eval_scoring_profiles
     WHERE id = ?`,
    [input.profileId],
  );
  if (!current) {
    throw new Error("评分画像不存在");
  }
  const code = String(input.code ?? current.code).trim();
  const name = String(input.name ?? current.name).trim();
  if (!code) throw new Error("评分画像编码不能为空");
  if (!name) throw new Error("评分画像名称不能为空");
  const now = new Date().toISOString();
  if (input.isActive) {
    await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ?", [false, now]);
  }
  await db.exec(
    `UPDATE writing_eval_scoring_profiles
     SET code = ?, name = ?, description = ?, config_json = ?, is_active = ?, updated_at = ?
     WHERE id = ?`,
    [
      code,
      name,
      input.description !== undefined ? String(input.description || "").trim() || null : current.description,
      input.config ?? parseJsonObject(current.config_json),
      input.isActive ?? Boolean(current.is_active),
      now,
      input.profileId,
    ],
  );
  const updated = await db.queryOne<WritingEvalScoringProfileRow>(
    `SELECT id, code, name, description, config_json, is_active, created_by, created_at, updated_at
     FROM writing_eval_scoring_profiles
     WHERE id = ?`,
    [input.profileId],
  );
  if (!updated) {
    throw new Error("更新评分画像失败");
  }
  return mapScoringProfile(updated);
}

export async function getWritingEvalCases(datasetId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE dataset_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [datasetId],
  );
  return rows.map(mapCase);
}

export async function createWritingEvalCase(input: {
  datasetId: number;
  taskCode: string;
  taskType: string;
  topicTitle: string;
  inputPayload: Record<string, unknown>;
  expectedConstraints?: Record<string, unknown>;
  viralTargets?: Record<string, unknown>;
  stageArtifactPayloads?: Record<string, unknown>;
  referenceGoodOutput?: string | null;
  referenceBadPatterns?: unknown[];
  difficultyLevel?: string;
  isEnabled?: boolean;
}) {
  await ensureExtendedProductSchema();
  const taskCode = String(input.taskCode || "").trim();
  const taskType = String(input.taskType || "").trim();
  const topicTitle = String(input.topicTitle || "").trim();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!taskCode) throw new Error("样本编码不能为空");
  if (!taskType) throw new Error("样本类型不能为空");
  if (!topicTitle) throw new Error("选题标题不能为空");
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO writing_eval_cases (
      dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
      viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.datasetId,
      taskCode,
      taskType,
      topicTitle,
      input.inputPayload,
      input.expectedConstraints ?? {},
      input.viralTargets ?? {},
      input.stageArtifactPayloads ?? {},
      String(input.referenceGoodOutput || "").trim() || null,
      Array.isArray(input.referenceBadPatterns) ? input.referenceBadPatterns : [],
      String(input.difficultyLevel || "").trim() || "medium",
      input.isEnabled ?? true,
      now,
      now,
    ],
  );
  await refreshDatasetSampleCount(input.datasetId);
  const created = await db.queryOne<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE id = ?`,
    [Number(result.lastInsertRowid || 0)],
  );
  if (!created) {
    throw new Error("创建评测样本失败");
  }
  return mapCase(created);
}

export async function updateWritingEvalCase(input: {
  caseId: number;
  datasetId?: number;
  taskCode?: string;
  taskType?: string;
  topicTitle?: string;
  inputPayload?: Record<string, unknown>;
  expectedConstraints?: Record<string, unknown>;
  viralTargets?: Record<string, unknown>;
  stageArtifactPayloads?: Record<string, unknown>;
  referenceGoodOutput?: string | null;
  referenceBadPatterns?: unknown[];
  difficultyLevel?: string;
  isEnabled?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const current = await db.queryOne<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE id = ?`,
    [input.caseId],
  );
  if (!current) {
    throw new Error("评测样本不存在");
  }
  await db.exec(
    `UPDATE writing_eval_cases
     SET task_code = ?, task_type = ?, topic_title = ?, input_payload_json = ?, expected_constraints_json = ?,
         viral_targets_json = ?, stage_artifact_payloads_json = ?, reference_good_output = ?, reference_bad_patterns_json = ?, difficulty_level = ?,
         is_enabled = ?, updated_at = ?
     WHERE id = ?`,
    [
      String(input.taskCode ?? current.task_code).trim(),
      String(input.taskType ?? current.task_type).trim(),
      String(input.topicTitle ?? current.topic_title).trim(),
      input.inputPayload ?? parseJsonObject(current.input_payload_json),
      input.expectedConstraints ?? parseJsonObject(current.expected_constraints_json),
      input.viralTargets ?? parseJsonObject(current.viral_targets_json),
      input.stageArtifactPayloads ?? parseJsonObject(current.stage_artifact_payloads_json),
      input.referenceGoodOutput !== undefined ? String(input.referenceGoodOutput || "").trim() || null : current.reference_good_output,
      input.referenceBadPatterns ?? parseJsonArray(current.reference_bad_patterns_json),
      String(input.difficultyLevel ?? current.difficulty_level).trim(),
      input.isEnabled ?? Boolean(current.is_enabled),
      new Date().toISOString(),
      input.caseId,
    ],
  );
  await refreshDatasetSampleCount(current.dataset_id);
  const updated = await db.queryOne<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE id = ?`,
    [input.caseId],
  );
  if (!updated) {
    throw new Error("更新评测样本失败");
  }
  return mapCase(updated);
}

export async function getWritingEvalRuns() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingOptimizationRunRow>(
    `SELECT r.id, r.run_code, r.dataset_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     ORDER BY r.created_at DESC, r.id DESC`,
  );
  return rows.map(mapRun);
}

export async function getWritingEvalRunDetail(runId: number) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(runId) || runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const run = await db.queryOne<WritingOptimizationRunRow>(
    `SELECT r.id, r.run_code, r.dataset_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     WHERE r.id = ?`,
    [runId],
  );
  if (!run) {
    throw new Error("实验运行不存在");
  }
  const results = await db.query<WritingOptimizationResultRow>(
    `SELECT r.id, r.run_id, r.case_id, r.generated_title, r.generated_lead, r.generated_markdown,
            r.style_score, r.language_score, r.density_score, r.emotion_score, r.structure_score, r.topic_momentum_score,
            r.headline_score, r.hook_score, r.shareability_score, r.reader_value_score, r.novelty_score, r.platform_fit_score,
            r.quality_score, r.viral_score, r.factual_risk_penalty, r.ai_noise_penalty, r.total_score, r.judge_payload_json,
            r.created_at, c.task_code, c.task_type, c.topic_title, c.difficulty_level
     FROM writing_optimization_results r
     INNER JOIN writing_eval_cases c ON c.id = r.case_id
     WHERE r.run_id = ?
     ORDER BY r.total_score DESC, r.id ASC`,
    [runId],
  );
  return {
    ...mapRun(run),
    results: results.map(mapRunResult),
  };
}

export async function retryWritingEvalRun(input: { runId: number; operatorUserId?: number | null }) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.runId) || input.runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const run = await db.queryOne<WritingOptimizationRunRow>(
    `SELECT id, run_code, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
            experiment_mode, trigger_mode, decision_mode, resolution_status, status, summary, score_summary_json, error_message, started_at, finished_at, resolved_at, created_by, created_at
     FROM writing_optimization_runs
     WHERE id = ?`,
    [input.runId],
  );
  if (!run) throw new Error("实验运行不存在");
  const now = new Date().toISOString();
  await db.transaction(async () => {
    await db.exec(
      `UPDATE writing_optimization_runs
       SET status = ?, error_message = NULL, score_summary_json = ?, started_at = NULL, finished_at = NULL,
           resolution_status = ?, resolved_at = NULL
       WHERE id = ?`,
      ["queued", {}, "pending", input.runId],
    );
    await enqueueWritingEvalRun(input.runId, run.run_code, run.dataset_id, run.trigger_mode || "manual");
  });
  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_retry",
    targetType: "writing_optimization_run",
    targetId: input.runId,
    payload: {
      runCode: run.run_code,
      retriedAt: now,
    },
  });
  return getWritingEvalRunDetail(input.runId);
}

export async function promoteWritingEvalRun(input: { runId: number; operatorUserId?: number | null }) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.runId) || input.runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const runDetail = await getWritingEvalRunDetail(input.runId);
  if (runDetail.status !== "succeeded") {
    throw new Error("只有成功完成的实验才能保留");
  }
  if (runDetail.resolutionStatus !== "pending") {
    throw new Error("当前实验已完成决议，不能重复保留");
  }
  const decision = buildPromotionDecision(runDetail.scoreSummary);
  const sourceVersion = runDetail.baseVersionRef;
  let promotionTarget: Record<string, unknown> = {};
  if (runDetail.candidateVersionType === "prompt_version") {
    const { promptId, version } = parsePromptVersionRef(runDetail.candidateVersionRef);
    await activatePromptVersion(promptId, version);
    promotionTarget = {
      promotedPromptId: promptId,
      promotedVersion: version,
    };
  } else if (runDetail.candidateVersionType === "scoring_profile") {
    await db.transaction(async () => {
      await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ?", [false, new Date().toISOString()]);
      await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ? WHERE code = ?", [true, new Date().toISOString(), runDetail.candidateVersionRef]);
    });
    promotionTarget = {
      promotedScoringProfileCode: runDetail.candidateVersionRef,
    };
  } else if (runDetail.candidateVersionType === "layout_strategy") {
    await activateWritingActiveAsset({
      assetType: "layout_strategy",
      assetRef: runDetail.candidateVersionRef,
      operatorUserId: input.operatorUserId ?? null,
    });
    promotionTarget = {
      promotedLayoutStrategyId: Number(runDetail.candidateVersionRef),
    };
  } else if (runDetail.candidateVersionType === "apply_command_template") {
    await activateWritingActiveAsset({
      assetType: "apply_command_template",
      assetRef: runDetail.candidateVersionRef,
      operatorUserId: input.operatorUserId ?? null,
    });
    promotionTarget = {
      promotedApplyCommandTemplateCode: runDetail.candidateVersionRef,
    };
  } else {
    throw new Error("当前仅支持保留 prompt_version、scoring_profile、layout_strategy 与 apply_command_template 类型");
  }
  const resolvedAt = new Date().toISOString();
  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO writing_optimization_versions (
        version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runDetail.candidateVersionType,
        runDetail.candidateVersionType === "prompt_version" ? parsePromptVersionRef(runDetail.candidateVersionRef).promptId : runDetail.candidateVersionRef,
        sourceVersion,
        runDetail.candidateVersionRef,
        {
          ...runDetail.scoreSummary,
          runId: runDetail.id,
          runCode: runDetail.runCode,
          recommendation: runDetail.recommendation,
        },
        "keep",
        decision.reason,
        input.operatorUserId ?? null,
        resolvedAt,
      ],
    );
    await db.exec(
      `UPDATE writing_optimization_runs
       SET resolution_status = ?, resolved_at = ?
       WHERE id = ?`,
      ["keep", resolvedAt, runDetail.id],
    );
  });
  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_promote",
    targetType: "writing_optimization_run",
    targetId: runDetail.id,
    payload: {
      runCode: runDetail.runCode,
      candidateVersionRef: runDetail.candidateVersionRef,
      baseVersionRef: runDetail.baseVersionRef,
      recommendation: runDetail.recommendation,
      scoreSummary: runDetail.scoreSummary,
    },
  });
  return {
    ...promotionTarget,
    run: await getWritingEvalRunDetail(runDetail.id),
  };
}

export async function discardWritingEvalRun(input: { runId: number; reason?: string | null; operatorUserId?: number | null }) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.runId) || input.runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const runDetail = await getWritingEvalRunDetail(input.runId);
  if (runDetail.status !== "succeeded") {
    throw new Error("只有成功完成的实验才能记录 discard");
  }
  if (runDetail.resolutionStatus !== "pending") {
    throw new Error("当前实验已完成决议，不能重复 discard");
  }
  const decision = buildPromotionDecision(runDetail.scoreSummary);
  const targetKey =
    runDetail.candidateVersionType === "prompt_version"
      ? parsePromptVersionRef(runDetail.candidateVersionRef).promptId
      : runDetail.candidateVersionRef;
  const resolvedAt = new Date().toISOString();
  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO writing_optimization_versions (
        version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runDetail.candidateVersionType,
        targetKey,
        runDetail.baseVersionRef,
        runDetail.candidateVersionRef,
        {
          ...runDetail.scoreSummary,
          runId: runDetail.id,
          runCode: runDetail.runCode,
          recommendation: runDetail.recommendation,
        },
        "discard",
        String(input.reason || "").trim() || decision.reason,
        input.operatorUserId ?? null,
        resolvedAt,
      ],
    );
    await db.exec(
      `UPDATE writing_optimization_runs
       SET resolution_status = ?, resolved_at = ?
       WHERE id = ?`,
      ["discard", resolvedAt, runDetail.id],
    );
  });
  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_discard",
    targetType: "writing_optimization_run",
    targetId: runDetail.id,
    payload: {
      runCode: runDetail.runCode,
      candidateVersionRef: runDetail.candidateVersionRef,
      reason: String(input.reason || "").trim() || decision.reason,
    },
  });
  return getWritingEvalRunDetail(runDetail.id);
}

export async function autoResolveWritingEvalRun(input: {
  runId: number;
  decision?: string | null;
  operatorUserId?: number | null;
  reason?: string | null;
}) {
  const runDetail = await getWritingEvalRunDetail(input.runId);
  if (runDetail.resolutionStatus && runDetail.resolutionStatus !== "pending") {
    return {
      action: "noop",
      run: runDetail,
    };
  }
  const decision = String(input.decision || "").trim() || runDetail.recommendation || "discard";
  if (decision === "keep") {
    const resolved = await promoteWritingEvalRun({ runId: input.runId, operatorUserId: input.operatorUserId });
    return {
      action: "keep",
      ...resolved,
    };
  }
  const discarded = await discardWritingEvalRun({
    runId: input.runId,
    operatorUserId: input.operatorUserId,
    reason: String(input.reason || "").trim() || runDetail.recommendationReason || "自动 discard",
  });
  return {
    action: "discard",
    run: discarded,
  };
}

export async function rollbackWritingEvalVersion(input: { versionId: number; reason?: string | null; operatorUserId?: number | null }) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.versionId) || input.versionId <= 0) throw new Error("版本账本记录无效");
  const db = getDatabase();
  const versionRow = await db.queryOne<WritingOptimizationVersionRow>(
    `SELECT id, version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
     FROM writing_optimization_versions
     WHERE id = ?`,
    [input.versionId],
  );
  if (!versionRow) {
    throw new Error("版本账本记录不存在");
  }
  if (versionRow.decision !== "keep") {
    throw new Error("只有 keep 记录支持一键回滚");
  }

  const rollbackTarget = versionRow.source_version;
  if (!rollbackTarget) {
    throw new Error("回滚目标版本缺失");
  }

  let previousVersion = "";
  const now = new Date().toISOString();

  if (versionRow.version_type === "prompt_version") {
    const target = parsePromptVersionRef(rollbackTarget);
    if (target.promptId !== versionRow.target_key) {
      throw new Error("账本中的 prompt 回滚目标与对象不一致");
    }
    const rollbackPrompt = await db.queryOne<{ id: number }>(
      "SELECT id FROM prompt_versions WHERE prompt_id = ? AND version = ?",
      [versionRow.target_key, target.version],
    );
    if (!rollbackPrompt) {
      throw new Error("回滚目标 prompt 版本不存在");
    }
    const current = await db.queryOne<{ version: string }>(
      "SELECT version FROM prompt_versions WHERE prompt_id = ? AND is_active = ? ORDER BY id DESC LIMIT 1",
      [versionRow.target_key, true],
    );
    previousVersion = current ? `${versionRow.target_key}@${current.version}` : versionRow.candidate_content;
    await activatePromptVersion(versionRow.target_key, target.version);
  } else if (versionRow.version_type === "scoring_profile") {
    const rollbackProfile = await db.queryOne<{ id: number }>("SELECT id FROM writing_eval_scoring_profiles WHERE code = ?", [rollbackTarget]);
    if (!rollbackProfile) {
      throw new Error("回滚目标评分配置不存在");
    }
    const current = await db.queryOne<{ code: string }>(
      "SELECT code FROM writing_eval_scoring_profiles WHERE is_active = ? ORDER BY updated_at DESC, id DESC LIMIT 1",
      [true],
    );
    previousVersion = current?.code || versionRow.candidate_content;
    await db.transaction(async () => {
      await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ?", [false, now]);
      await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ? WHERE code = ?", [true, now, rollbackTarget]);
    });
  } else if (versionRow.version_type === "layout_strategy") {
    previousVersion = (await getActiveWritingAssetRef("layout_strategy")) || versionRow.candidate_content;
    await activateWritingActiveAsset({
      assetType: "layout_strategy",
      assetRef: rollbackTarget,
      operatorUserId: input.operatorUserId ?? null,
    });
  } else if (versionRow.version_type === "apply_command_template") {
    previousVersion = (await getActiveWritingAssetRef("apply_command_template")) || versionRow.candidate_content;
    await activateWritingActiveAsset({
      assetType: "apply_command_template",
      assetRef: rollbackTarget,
      operatorUserId: input.operatorUserId ?? null,
    });
  } else {
    throw new Error("当前仅支持 prompt_version、scoring_profile、layout_strategy 与 apply_command_template 的回滚");
  }

  await db.exec(
    `INSERT INTO writing_optimization_versions (
      version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      versionRow.version_type,
      versionRow.target_key,
      previousVersion || versionRow.candidate_content,
      rollbackTarget,
      {
        ...parseJsonObject(versionRow.score_summary_json),
        rollbackFromVersionId: versionRow.id,
        rollbackFromCandidate: versionRow.candidate_content,
        rollbackTriggeredAt: now,
      },
      "rollback",
      String(input.reason || "").trim() || `从账本 #${versionRow.id} 回滚到 ${rollbackTarget}`,
      input.operatorUserId ?? null,
      now,
    ],
  );

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_rollback",
    targetType: "writing_optimization_version",
    targetId: versionRow.id,
    payload: {
      versionType: versionRow.version_type,
      targetKey: versionRow.target_key,
      rollbackTarget,
      previousVersion: previousVersion || versionRow.candidate_content,
      reason: String(input.reason || "").trim() || null,
    },
  });

  return {
    ledgerId: versionRow.id,
    versionType: versionRow.version_type,
    targetKey: versionRow.target_key,
    rollbackTarget,
    previousVersion: previousVersion || versionRow.candidate_content,
  };
}

export async function getWritingEvalVersions(limit = 100) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingOptimizationVersionRow>(
    `SELECT id, version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
     FROM writing_optimization_versions
     ORDER BY created_at DESC, id DESC
     LIMIT ${Math.min(Math.max(limit, 1), 200)}`,
  );
  return rows.map(mapVersion);
}

export async function getWritingEvalInsights(limit = 24) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const runs = await getWritingEvalRuns();
  const schedules = await getWritingEvalRunSchedules();
  const recentRuns = runs.slice(0, Math.min(Math.max(limit, 1), 60));
  const trend = recentRuns
    .slice()
    .reverse()
    .map((run) => ({
      runId: run.id,
      runCode: run.runCode,
      createdAt: run.createdAt,
      totalScore: getNumber(run.scoreSummary.totalScore) ?? 0,
      qualityScore: getNumber(run.scoreSummary.qualityScore) ?? 0,
      viralScore: getNumber(run.scoreSummary.viralScore) ?? 0,
      deltaTotalScore: getNumber(run.scoreSummary.deltaTotalScore) ?? 0,
      failedCaseCount: getNumber(run.scoreSummary.failedCaseCount) ?? 0,
    }));

  const reasons = new Map<string, { count: number; runId: number; resultId: number; datasetId: number; caseId: number; taskCode: string }>();
  const strengths = new Map<string, { count: number; runId: number; resultId: number; datasetId: number; caseId: number; taskCode: string }>();
  const failingCases: Array<{ runId: number; runCode: string; resultId: number; datasetId: number; caseId: number; taskCode: string; reason: string }> = [];

  function trackReason(
    bucket: Map<string, { count: number; runId: number; resultId: number; datasetId: number; caseId: number; taskCode: string }>,
    label: string,
    runId: number,
    resultId: number,
    datasetId: number,
    caseId: number,
    taskCode: string,
  ) {
    const current = bucket.get(label);
    if (current) {
      current.count += 1;
      return;
    }
    bucket.set(label, { count: 1, runId, resultId, datasetId, caseId, taskCode });
  }

  for (const run of recentRuns.slice(0, 10)) {
    const detail = await getWritingEvalRunDetail(run.id);
    for (const result of detail.results) {
      const baseline = getRecord(result.judgePayload.baseline);
      const comparison = getRecord(result.judgePayload.comparison);
      const delta = getRecord(comparison.delta);
      const aiNoise = getRecord(result.judgePayload.aiNoise);
      const caseError = getRecord(result.judgePayload).caseError;
      if (typeof caseError === "string" && caseError.trim()) {
        failingCases.push({
          runId: run.id,
          runCode: run.runCode,
          resultId: result.id,
          datasetId: detail.datasetId,
          caseId: result.caseId,
          taskCode: result.taskCode || `case-${result.caseId}`,
          reason: caseError.trim(),
        });
      }
      const deltaTotal = getNumber(delta.total_score) ?? 0;
      const deltaHeadline = getNumber(delta.headline_score) ?? 0;
      const deltaHook = getNumber(delta.hook_score) ?? 0;
      const deltaDensity = getNumber(delta.density_score) ?? 0;
      const deltaLanguage = getNumber(delta.language_score) ?? 0;
      const deltaEmotion = getNumber(delta.emotion_score) ?? 0;
      const deltaShareability = getNumber(delta.shareability_score) ?? 0;
      const deltaReaderValue = getNumber(delta.reader_value_score) ?? 0;
      const candidatePenalty = result.aiNoisePenalty;
      const basePenalty = getNumber(getRecord(baseline.scores).ai_noise_penalty) ?? candidatePenalty;
      const taskCode = result.taskCode || `case-${result.caseId}`;
      if (deltaHeadline > 0) trackReason(strengths, "标题更清晰", run.id, result.id, detail.datasetId, result.caseId, taskCode);
      if (deltaHook > 0) trackReason(strengths, "开头更快进入冲突", run.id, result.id, detail.datasetId, result.caseId, taskCode);
      if (deltaReaderValue > 0) trackReason(strengths, "读者收益更明确", run.id, result.id, detail.datasetId, result.caseId, taskCode);
      if (deltaTotal < 0) {
        if (deltaDensity < 0) trackReason(reasons, "事实密度下降", run.id, result.id, detail.datasetId, result.caseId, taskCode);
        if (deltaHook > 0 && deltaDensity < 0) trackReason(reasons, "开头变强但后文掉速", run.id, result.id, detail.datasetId, result.caseId, taskCode);
        if (candidatePenalty > basePenalty || (getNumber(aiNoise.score) ?? 0) >= 45) {
          trackReason(reasons, "机器腔回潮", run.id, result.id, detail.datasetId, result.caseId, taskCode);
        }
        if (deltaHeadline > 0 && deltaTotal <= 0) {
          trackReason(reasons, "标题变强但正文兑现不足", run.id, result.id, detail.datasetId, result.caseId, taskCode);
        }
        if (deltaShareability > 0 && (deltaEmotion < 0 || candidatePenalty > basePenalty)) {
          trackReason(reasons, "传播性变强但情绪操纵感上升", run.id, result.id, detail.datasetId, result.caseId, taskCode);
        }
      }
      if (deltaLanguage > 0 && deltaTotal > 0) trackReason(strengths, "语言更自然", run.id, result.id, detail.datasetId, result.caseId, taskCode);
    }
  }

  const [onlineFeedbackRows, articleOutcomeItems] = await Promise.all([
    db.query<WritingEvalOnlineFeedbackRow>(
      `${getWritingEvalFeedbackSelectSql()}
       WHERE f.result_id IS NOT NULL
       ORDER BY f.captured_at DESC, f.id DESC
       LIMIT 240`,
    ),
    getArticleOutcomeCalibrationItems(240),
  ]);
  const onlineCalibration = buildOnlineCalibrationInsights([
    ...onlineFeedbackRows.map(mapFeedback),
    ...articleOutcomeItems,
  ]);
  const topRegressionReasons = [...reasons.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 8)
    .map(([label, item]) => ({ label, ...item }));
  const topImprovementReasons = [...strengths.entries()]
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 8)
    .map(([label, item]) => ({ label, ...item }));
  const strategyRecommendations = buildAgentStrategyRecommendations({
    schedules,
    recentRuns,
    topRegressionReasons,
    topImprovementReasons,
    onlineCalibration,
  });

  return {
    trend,
    topRegressionReasons,
    topImprovementReasons,
    failingCases: failingCases.slice(0, 8),
    onlineCalibration,
    strategyRecommendations,
  };
}

export async function getWritingEvalRunFeedback(runId: number) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(runId) || runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const run = await db.queryOne<{ id: number; candidate_version_type: string; candidate_version_ref: string }>(
    `SELECT id, candidate_version_type, candidate_version_ref
     FROM writing_optimization_runs
     WHERE id = ?`,
    [runId],
  );
  if (!run) throw new Error("实验运行不存在");

  const [feedbackRows, resultRows, articleRows, syncLogRows, realOutcome] = await Promise.all([
    db.query<WritingEvalOnlineFeedbackRow>(
      `${getWritingEvalFeedbackSelectSql()}
       WHERE f.run_id = ?
       ORDER BY f.captured_at DESC, f.id DESC`,
      [runId],
    ),
    db.query<WritingEvalFeedbackOptionResultRow>(
      `SELECT r.id, r.case_id, c.task_code, c.topic_title, r.viral_score, r.total_score
       FROM writing_optimization_results r
       INNER JOIN writing_eval_cases c ON c.id = r.case_id
       WHERE r.run_id = ?
       ORDER BY r.total_score DESC, r.id ASC`,
      [runId],
    ),
    db.query<WritingEvalFeedbackOptionDocumentRow>(
      `SELECT id, user_id, title, status, updated_at
       FROM articles
       ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END, updated_at DESC, id DESC
       LIMIT 24`,
    ),
    db.query<WritingEvalFeedbackOptionSyncLogRow>(
      `SELECT l.id, l.article_id AS article_id, d.title, l.status, l.media_id, l.created_at
       FROM wechat_sync_logs l
       LEFT JOIN articles d ON d.id = l.article_id
       ORDER BY CASE WHEN l.status = 'success' THEN 0 ELSE 1 END, l.id DESC
       LIMIT 24`,
    ),
    getArticleOutcomeVersionFeedback({
      versionType: run.candidate_version_type,
      candidateContent: run.candidate_version_ref,
      limit: 12,
    }),
  ]);

  const items = feedbackRows.map(mapFeedback);
  return {
    items,
    summary: {
      feedbackCount: items.length,
      linkedResultCount: items.filter((item) => item.resultId != null).length,
      averageObservedViralScore: averageNumbers(items.map((item) => item.observedViralScore)),
      averagePredictedViralScore: averageNumbers(items.map((item) => item.predictedViralScore)),
      averageCalibrationGap: averageNumbers(items.map((item) => item.calibrationGap)),
      averageOpenRate: averageNumbers(items.map((item) => item.openRate)),
      averageReadCompletionRate: averageNumbers(items.map((item) => item.readCompletionRate)),
      averageShareRate: averageNumbers(items.map((item) => item.shareRate)),
      averageFavoriteRate: averageNumbers(items.map((item) => item.favoriteRate)),
    },
    options: {
      results: resultRows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        taskCode: row.task_code,
        topicTitle: row.topic_title,
        viralScore: row.viral_score,
        totalScore: row.total_score,
      })),
      articles: articleRows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        status: row.status,
        updatedAt: row.updated_at,
      })),
      syncLogs: syncLogRows.map((row) => ({
        id: row.id,
        articleId: row.article_id,
        title: row.title,
        status: row.status,
        mediaId: row.media_id,
        createdAt: row.created_at,
      })),
    },
    realOutcome,
  };
}

export async function getArticleWritingEvalRunFeedback(runId: number) {
  return getWritingEvalRunFeedback(runId);
}

export async function getWritingEvalFeedbackSummaries(runIds: number[]) {
  await ensureExtendedProductSchema();
  const safeRunIds = [...new Set(runIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
  if (safeRunIds.length === 0) {
    return [];
  }
  const db = getDatabase();
  const placeholders = safeRunIds.map(() => "?").join(", ");
  const rows = await db.query<{
    run_id: number;
    open_rate: number | null;
    read_completion_rate: number | null;
    share_rate: number | null;
    favorite_rate: number | null;
  }>(
    `SELECT run_id, open_rate, read_completion_rate, share_rate, favorite_rate
     FROM writing_eval_online_feedback
     WHERE run_id IN (${placeholders})`,
    safeRunIds,
  );
  const grouped = new Map<
    number,
    Array<{
      openRate: number | null;
      readCompletionRate: number | null;
      shareRate: number | null;
      favoriteRate: number | null;
    }>
  >();
  for (const row of rows) {
    const current = grouped.get(row.run_id) ?? [];
    current.push({
      openRate: row.open_rate,
      readCompletionRate: row.read_completion_rate,
      shareRate: row.share_rate,
      favoriteRate: row.favorite_rate,
    });
    grouped.set(row.run_id, current);
  }
  return safeRunIds.map((runId) => {
    const items = grouped.get(runId) ?? [];
    return {
      runId,
      feedbackCount: items.length,
      averageObservedViralScore: averageNumbers(
        items.map((item) =>
          computeObservedViralScore({
            openRate: item.openRate,
            readCompletionRate: item.readCompletionRate,
            shareRate: item.shareRate,
            favoriteRate: item.favoriteRate,
          }),
        ),
      ),
      averageOpenRate: averageNumbers(items.map((item) => item.openRate)),
      averageReadCompletionRate: averageNumbers(items.map((item) => item.readCompletionRate)),
      averageShareRate: averageNumbers(items.map((item) => item.shareRate)),
      averageFavoriteRate: averageNumbers(items.map((item) => item.favoriteRate)),
    };
  });
}

export async function getArticleOutcomeVersionSummaries(
  versions: Array<{ versionType: string; candidateContent: string }>,
) {
  await ensureExtendedProductSchema();
  const requested = versions
    .map((item) => ({
      versionType: String(item.versionType || "").trim(),
      candidateContent: String(item.candidateContent || "").trim(),
    }))
    .filter(
      (item) =>
        item.candidateContent
        && ["prompt_version", "scoring_profile", "layout_strategy", "apply_command_template"].includes(item.versionType),
    );
  if (requested.length === 0) {
    return [];
  }

  const requestedKeys = new Set(requested.map((item) => `${item.versionType}@@${item.candidateContent}`));
  const db = getDatabase();
  const [rows, snapshots] = await Promise.all([
    db.query<ArticleOutcomeCalibrationRow>(
      `SELECT ao.id, ao.article_id AS article_id, ao.target_package, ao.scorecard_json, ao.hit_status, ao.review_summary, ao.updated_at, d.title
       FROM article_outcomes ao
       LEFT JOIN articles d ON d.id = ao.article_id
       ORDER BY ao.updated_at DESC, ao.id DESC`,
    ),
    db.query<ArticleOutcomeCalibrationSnapshotRow>(
      `SELECT outcome_id, window_code, read_count, share_count, like_count
       FROM article_outcome_snapshots
       ORDER BY updated_at DESC, id DESC`,
    ),
  ]);

  const snapshotsByOutcomeId = new Map<number, ArticleOutcomeCalibrationSnapshotRow[]>();
  for (const snapshot of snapshots) {
    const current = snapshotsByOutcomeId.get(snapshot.outcome_id) ?? [];
    current.push(snapshot);
    snapshotsByOutcomeId.set(snapshot.outcome_id, current);
  }

  const grouped = new Map<string, CalibrationInsightItem[]>();
  for (const row of rows) {
    const scorecard = parseJsonObject(row.scorecard_json);
    const attribution = getRecord(scorecard.attribution);
    const promptVersionRefs = getPromptVersionRefsFromAttribution(attribution);
    const scoringProfileCode = String(attribution.scoringProfileCode || "").trim();
    const layoutStrategyId = getNumber(attribution.layoutStrategyId);
    const applyCommandTemplateCode = String(attribution.applyCommandTemplateCode || "").trim();
    const matchedKeys = [
      ...promptVersionRefs.map((ref) => `prompt_version@@${ref}`),
      scoringProfileCode ? `scoring_profile@@${scoringProfileCode}` : null,
      layoutStrategyId !== null ? `layout_strategy@@${String(layoutStrategyId)}` : null,
      applyCommandTemplateCode ? `apply_command_template@@${applyCommandTemplateCode}` : null,
    ].filter((item): item is string => Boolean(item) && requestedKeys.has(String(item)));
    if (matchedKeys.length === 0) {
      continue;
    }

    const calibrationItem = mapArticleOutcomeCalibrationItem(row, snapshotsByOutcomeId.get(row.id) ?? []);
    for (const key of matchedKeys) {
      const current = grouped.get(key) ?? [];
      current.push(calibrationItem);
      grouped.set(key, current);
    }
  }

  return requested.map((item) => {
    const items = grouped.get(`${item.versionType}@@${item.candidateContent}`) ?? [];
    return {
      versionType: item.versionType,
      candidateContent: item.candidateContent,
      feedbackCount: items.length,
      averageObservedViralScore: averageNumbers(items.map((sample) => sample.observedViralScore)),
      averagePredictedViralScore: averageNumbers(items.map((sample) => sample.predictedViralScore)),
      averageCalibrationGap: averageNumbers(items.map((sample) => sample.calibrationGap)),
      averageOpenRate: averageNumbers(items.map((sample) => sample.openRate)),
      averageReadCompletionRate: averageNumbers(items.map((sample) => sample.readCompletionRate)),
      averageShareRate: averageNumbers(items.map((sample) => sample.shareRate)),
      averageFavoriteRate: averageNumbers(items.map((sample) => sample.favoriteRate)),
    };
  });
}

async function getArticleOutcomeVersionFeedback(input: {
  versionType: string;
  candidateContent: string;
  limit?: number;
}) {
  const [summary] = await getArticleOutcomeVersionSummaries([
    {
      versionType: input.versionType,
      candidateContent: input.candidateContent,
    },
  ]);
  const versionType = String(input.versionType || "").trim();
  const candidateContent = String(input.candidateContent || "").trim();
  const supported = ["prompt_version", "scoring_profile", "layout_strategy", "apply_command_template"].includes(versionType);
  const limit = Number.isInteger(input.limit) && Number(input.limit) > 0 ? Number(input.limit) : 12;
  if (!supported || !candidateContent) {
    return {
      supported,
      versionType,
      candidateContent,
      summary:
        summary ?? {
          feedbackCount: 0,
          averageObservedViralScore: null,
          averagePredictedViralScore: null,
          averageCalibrationGap: null,
          averageOpenRate: null,
          averageReadCompletionRate: null,
          averageShareRate: null,
          averageFavoriteRate: null,
        },
      items: [] as CalibrationInsightItem[],
    };
  }

  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [rows, snapshots] = await Promise.all([
    db.query<ArticleOutcomeCalibrationRow>(
      `SELECT ao.id, ao.article_id AS article_id, ao.target_package, ao.scorecard_json, ao.hit_status, ao.review_summary, ao.updated_at, d.title
       FROM article_outcomes ao
       LEFT JOIN articles d ON d.id = ao.article_id
       ORDER BY ao.updated_at DESC, ao.id DESC`,
    ),
    db.query<ArticleOutcomeCalibrationSnapshotRow>(
      `SELECT outcome_id, window_code, read_count, share_count, like_count
       FROM article_outcome_snapshots
       ORDER BY updated_at DESC, id DESC`,
    ),
  ]);
  const snapshotsByOutcomeId = new Map<number, ArticleOutcomeCalibrationSnapshotRow[]>();
  for (const snapshot of snapshots) {
    const current = snapshotsByOutcomeId.get(snapshot.outcome_id) ?? [];
    current.push(snapshot);
    snapshotsByOutcomeId.set(snapshot.outcome_id, current);
  }

  const items = rows
    .map((row) => {
      const scorecard = parseJsonObject(row.scorecard_json);
      const attribution = getRecord(scorecard.attribution);
      const promptVersionRefs = getPromptVersionRefsFromAttribution(attribution);
      const scoringProfileCode = String(attribution.scoringProfileCode || "").trim();
      const layoutStrategyId = getNumber(attribution.layoutStrategyId);
      const applyCommandTemplateCode = String(attribution.applyCommandTemplateCode || "").trim();
      const matched =
        (versionType === "prompt_version" && promptVersionRefs.includes(candidateContent))
        || (versionType === "scoring_profile" && scoringProfileCode === candidateContent)
        || (versionType === "layout_strategy" && layoutStrategyId !== null && String(layoutStrategyId) === candidateContent)
        || (versionType === "apply_command_template" && applyCommandTemplateCode === candidateContent);
      return matched ? mapArticleOutcomeCalibrationItem(row, snapshotsByOutcomeId.get(row.id) ?? []) : null;
    })
    .filter(Boolean)
    .slice(0, limit) as CalibrationInsightItem[];

  return {
    supported: true,
    versionType,
    candidateContent,
    summary:
      summary ?? {
        feedbackCount: items.length,
        averageObservedViralScore: averageNumbers(items.map((item) => item.observedViralScore)),
        averagePredictedViralScore: averageNumbers(items.map((item) => item.predictedViralScore)),
        averageCalibrationGap: averageNumbers(items.map((item) => item.calibrationGap)),
        averageOpenRate: averageNumbers(items.map((item) => item.openRate)),
        averageReadCompletionRate: averageNumbers(items.map((item) => item.readCompletionRate)),
        averageShareRate: averageNumbers(items.map((item) => item.shareRate)),
        averageFavoriteRate: averageNumbers(items.map((item) => item.favoriteRate)),
      },
    items,
  };
}

export async function createWritingEvalRunFeedback(input: {
  runId: number;
  resultId?: number | null;
  caseId?: number | null;
  articleId?: number | null;
  wechatSyncLogId?: number | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
  openRate?: number | null;
  readCompletionRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
  readCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  capturedAt?: string | null;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.runId) || input.runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const run = await db.queryOne<{ id: number }>("SELECT id FROM writing_optimization_runs WHERE id = ?", [input.runId]);
  if (!run) throw new Error("实验运行不存在");

  let resolvedResultId: number | null = Number.isInteger(input.resultId) && Number(input.resultId) > 0 ? Number(input.resultId) : null;
  let resolvedCaseId: number | null = Number.isInteger(input.caseId) && Number(input.caseId) > 0 ? Number(input.caseId) : null;
  let resolvedArticleId: number | null = Number.isInteger(input.articleId) && Number(input.articleId) > 0 ? Number(input.articleId) : null;
  let resolvedSyncLogId: number | null =
    Number.isInteger(input.wechatSyncLogId) && Number(input.wechatSyncLogId) > 0 ? Number(input.wechatSyncLogId) : null;

  if (resolvedResultId !== null) {
    const result = await db.queryOne<{ id: number; case_id: number }>(
      "SELECT id, case_id FROM writing_optimization_results WHERE id = ? AND run_id = ?",
      [resolvedResultId, input.runId],
    );
    if (!result) throw new Error("关联样本结果不存在");
    if (resolvedCaseId !== null && resolvedCaseId !== result.case_id) {
      throw new Error("样本结果与评测样本不匹配");
    }
    resolvedCaseId = result.case_id;
  }

  if (resolvedCaseId !== null) {
    const result = await db.queryOne<{ case_id: number }>(
      "SELECT case_id FROM writing_optimization_results WHERE run_id = ? AND case_id = ? LIMIT 1",
      [input.runId, resolvedCaseId],
    );
    if (!result) throw new Error("关联评测样本不属于当前实验运行");
  }

  if (resolvedArticleId !== null) {
    const article = await db.queryOne<{ id: number }>("SELECT id FROM articles WHERE id = ?", [resolvedArticleId]);
    if (!article) throw new Error("关联稿件不存在");
  }

  if (resolvedSyncLogId !== null) {
    const syncLog = await db.queryOne<{ id: number; article_id: number }>(
      "SELECT id, article_id AS article_id FROM wechat_sync_logs WHERE id = ?",
      [resolvedSyncLogId],
    );
    if (!syncLog) throw new Error("关联微信同步记录不存在");
    if (resolvedArticleId !== null && resolvedArticleId !== syncLog.article_id) {
      throw new Error("微信同步记录与稿件不匹配");
    }
    resolvedArticleId = syncLog.article_id;
  }

  const now = new Date().toISOString();
  const inserted = await db.exec(
    `INSERT INTO writing_eval_online_feedback (
      run_id, result_id, case_id, article_id, wechat_sync_log_id, source_type, source_label, open_rate,
      read_completion_rate, share_rate, favorite_rate, read_count, like_count, comment_count, notes, payload_json,
      created_by, captured_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.runId,
      resolvedResultId,
      resolvedCaseId,
      resolvedArticleId,
      resolvedSyncLogId,
      String(input.sourceType || "").trim() || "manual",
      String(input.sourceLabel || "").trim() || null,
      normalizePercentage(input.openRate),
      normalizePercentage(input.readCompletionRate),
      normalizePercentage(input.shareRate),
      normalizePercentage(input.favoriteRate),
      normalizeCount(input.readCount),
      normalizeCount(input.likeCount),
      normalizeCount(input.commentCount),
      String(input.notes || "").trim() || null,
      input.payload ?? {},
      input.createdBy ?? null,
      String(input.capturedAt || "").trim() || now,
      now,
      now,
    ],
  );

  const created = await db.queryOne<WritingEvalOnlineFeedbackRow>(
    `${getWritingEvalFeedbackSelectSql()}
     WHERE f.id = ?`,
    [Number(inserted.lastInsertRowid || 0)],
  );
  if (!created) {
    throw new Error("写入线上反馈失败");
  }

  await appendAuditLog({
    userId: input.createdBy ?? null,
    action: "writing_eval_feedback_create",
    targetType: "writing_optimization_run",
    targetId: input.runId,
    payload: {
      resultId: resolvedResultId,
      caseId: resolvedCaseId,
      articleId: resolvedArticleId,
      wechatSyncLogId: resolvedSyncLogId,
      sourceType: String(input.sourceType || "").trim() || "manual",
      capturedAt: String(input.capturedAt || "").trim() || now,
    },
  });

  return mapFeedback(created);
}

export async function createArticleWritingEvalRunFeedback(input: {
  runId: number;
  resultId?: number | null;
  caseId?: number | null;
  articleId?: number | null;
  wechatSyncLogId?: number | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
  openRate?: number | null;
  readCompletionRate?: number | null;
  shareRate?: number | null;
  favoriteRate?: number | null;
  readCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  capturedAt?: string | null;
  createdBy?: number | null;
}) {
  return createWritingEvalRunFeedback({
    ...input,
    articleId: input.articleId ?? null,
  });
}

export async function createWritingEvalRun(input: {
  datasetId: number;
  baseVersionType: string;
  baseVersionRef: string;
  candidateVersionType: string;
  candidateVersionRef: string;
  experimentMode?: string;
  triggerMode?: string;
  decisionMode?: string;
  summary?: string | null;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  const resolved = await resolveWritingEvalRunDefinition(input);
  const db = getDatabase();
  const runCode = buildRunCode();
  const now = new Date().toISOString();
  const triggerMode = normalizeWritingEvalTriggerMode(input.triggerMode, "manual");
  const decisionMode = normalizeWritingEvalDecisionMode(input.decisionMode);
  await assertWritingEvalDatasetExecutionReadiness({
    datasetId: resolved.datasetId,
    datasetStatus: resolved.datasetStatus,
    triggerMode,
    decisionMode,
  });
  let createdId = 0;
  await db.transaction(async () => {
    const inserted = await db.exec(
      `INSERT INTO writing_optimization_runs (
        run_code, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
        experiment_mode, trigger_mode, decision_mode, resolution_status, status, summary, score_summary_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runCode,
        resolved.datasetId,
        resolved.baseVersionType,
        resolved.baseVersionRef,
        resolved.candidateVersionType,
        resolved.candidateVersionRef,
        resolved.experimentMode,
        triggerMode,
        decisionMode,
        "pending",
        "queued",
        String(input.summary || "").trim() || null,
        {},
        input.createdBy ?? null,
        now,
      ],
    );
    createdId = Number(inserted.lastInsertRowid || 0);
    await enqueueWritingEvalRun(createdId, runCode, resolved.datasetId, triggerMode);
  });

  const created = await db.queryOne<WritingOptimizationRunRow>(
    `SELECT r.id, r.run_code, r.dataset_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     WHERE r.id = ?`,
    [createdId],
  );
  if (!created) {
    throw new Error("创建实验运行失败");
  }
  return mapRun(created);
}
