import { computeObservedOutcomeScore } from "./article-scorecard";
import { normalizeWritingEvalRolloutAuditLogs } from "./admin-writing-eval-rollout-audits";
import { evaluateArchetypeRhythmConsistency } from "./archetype-rhythm";
import { buildFourPointAudit, STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import { getDatabase } from "./db";
import { appendAuditLog, getWritingEvalRolloutAuditLogs } from "./audit";
import { activatePromptVersion, getPromptVersions } from "./repositories";
import { buildTopicAngleOptions, buildTopicJudgementShift, matchTopicToKnowledgeCards } from "./knowledge-match";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { WRITING_EVAL_APPLY_COMMAND_TEMPLATES } from "./writing-eval-assets";
import { WRITING_EVAL_AGENT_STRATEGY_PRESETS, normalizeWritingEvalAgentStrategyCode } from "./writing-eval-config";
import {
  getWritingEvalDatasetCreatePresets,
  getWritingEvalDatasetFocusMeta,
  getWritingEvalImportFocusBoost,
  getPlan17PromptSceneMeta,
  inferWritingEvalDatasetFocus,
  isPlan17WritingEvalFocusKey,
  isWritingEvalSourceTypeRecommendedForFocus,
  resolveWritingEvalTaskTypeForDatasetFocus,
  type WritingEvalDatasetFocusKey,
  type WritingEvalPlan17FocusKey,
} from "./writing-eval-plan17";
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

const PLAN21_OPENING_OPTIMIZER_DATASET_CODE = "plan21-opening-optimizer-v1";
const PLAN21_OPENING_OPTIMIZER_SEED_CASE_COUNT = 30;
const PLAN21_OPENING_OPTIMIZER_SCHEDULE_NAME = "Plan21 · Opening Optimizer 自动评测";

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

type WritingEvalPlan17QualityFocusReport = {
  key: WritingEvalPlan17FocusKey;
  label: string;
  description: string;
  promptIds: string[];
  datasetCount: number;
  activeDatasetCount: number;
  sampleCount: number;
  enabledCaseCount: number;
  disabledCaseCount: number;
  runCount: number;
  linkedFeedbackCount: number;
  latestRunAt: string | null;
  readiness: {
    readyCount: number;
    warningCount: number;
    blockedCount: number;
  };
  sourceTypeBreakdown: Array<{ key: string; count: number }>;
  taskTypeBreakdown: Array<{ key: string; count: number }>;
  reporting: {
    topicFissionSceneBreakdown: Array<{
      sceneKey: string;
      promptId: string;
      label: string;
      activeVersion: string | null;
      evaluatedCaseCount: number;
      stableCaseCount: number;
      stableHitCaseCount: number;
      stableHitRate: number | null;
      failedCaseCount: number;
      runCount: number;
      latestRunAt: string | null;
    }>;
    proxyScoreVsObservedSpearman: number | null;
    proxyScoreVsObservedSampleCount: number;
    strategyManualScoreSpearman: number | null;
    strategyManualScoreSampleCount: number;
    evidenceLabelPrecision: number | null;
    evidenceLabelRecall: number | null;
    evidenceLabelSampleCount: number;
    rhythmDeviationVsReadCompletionCorrelation: number | null;
    rhythmDeviationVsReadCompletionSampleCount: number;
    rhythmDeviationVsReadCompletionPValue: number | null;
  };
  observationGaps: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

type WritingEvalPlan17QualityReport = {
  generatedAt: string;
  seededDatasetCodes: string[];
  totalDatasetCount: number;
  totalSampleCount: number;
  focuses: WritingEvalPlan17QualityFocusReport[];
};

type WritingEvalCaseRow = {
  id: number;
  dataset_id: number;
  task_code: string;
  task_type: string;
  topic_title: string;
  source_type: string;
  source_ref: string | null;
  source_label: string | null;
  source_url: string | null;
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

type WritingEvalCaseQualityLabelRow = {
  id: number;
  case_id: number;
  dataset_id: number;
  focus_key: string;
  strategy_manual_score: number | null;
  evidence_expected_tags_json: string | string[] | null;
  evidence_detected_tags_json: string | string[] | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  task_code?: string | null;
  task_type?: string | null;
  topic_title?: string | null;
  source_type?: string | null;
  source_ref?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  difficulty_level?: string | null;
};

type WritingEvalArticleImportRow = {
  id: number;
  user_id: number;
  title: string;
  status: string;
  markdown_content: string;
  series_id: number | null;
  updated_at: string;
  series_name: string | null;
};

type WritingEvalArticleArtifactRow = {
  article_id: number;
  stage_code: string;
  payload_json: string | Record<string, unknown> | null;
};

type WritingEvalKnowledgeCardImportRow = {
  id: number;
  user_id: number;
  card_type: string;
  title: string;
  summary: string | null;
  key_facts_json: string | string[] | null;
  open_questions_json: string | string[] | null;
  conflict_flags_json: string | string[] | null;
  latest_change_summary: string | null;
  confidence_score: number;
  status: string;
  last_compiled_at: string | null;
  last_verified_at: string | null;
  updated_at: string;
  owner_username?: string | null;
};

type WritingEvalKnowledgeCardFragmentRow = {
  knowledge_card_id: number;
  fragment_id: number;
  distilled_content: string;
};

type WritingEvalKnowledgeCardLinkRow = {
  source_card_id: number;
  target_card_id: number;
  link_type: string;
};

type WritingEvalKnowledgeCardLinkedCardRow = {
  id: number;
  title: string;
  summary: string | null;
  card_type: string;
  status: string;
};

type WritingEvalTopicImportRow = {
  id: number;
  owner_user_id: number | null;
  source_name: string;
  source_type: string | null;
  source_priority: number | null;
  title: string;
  summary: string | null;
  emotion_labels_json: string | string[] | null;
  angle_options_json: string | string[] | null;
  source_url: string | null;
  published_at: string | null;
};

type WritingEvalTopicKnowledgeCandidateRow = {
  id: number;
  title: string;
  summary: string | null;
  latest_change_summary: string | null;
  overturned_judgements_json: string | string[] | null;
  card_type: string;
  status: string;
  confidence_score: number;
  owner_username: string | null;
};

type WritingEvalFragmentImportRow = {
  id: number;
  user_id: number;
  source_type: string;
  title: string | null;
  raw_content: string | null;
  distilled_content: string;
  source_url: string | null;
  screenshot_path: string | null;
  created_at: string;
};

type WritingEvalFragmentKnowledgeCardRow = {
  fragment_id: number;
  knowledge_card_id: number;
  title: string;
  summary: string | null;
  card_type: string;
  status: string;
  confidence_score: number;
};

type WritingEvalImportRecommendationItem = {
  sourceType: "article" | "knowledge_card" | "topic_item" | "fragment";
  sourceId: number;
  taskCode: string;
  title: string;
  subtitle: string | null;
  suggestedTaskType: string;
  suggestedDifficultyLevel: string;
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  referenceGoodOutput: boolean;
  variantCode?: string;
  variantLabel?: string | null;
  derivation?: {
    sourceCaseId: number;
    code: string;
    label: string;
  };
  reasonTags: string[];
  score: number;
};

type WritingEvalTopicCaseVariant = {
  code: string;
  label: string;
  titleSuffix: string | null;
  preferredAngle: string | null;
  targetEmotion: string | null;
  authorPersonaSnapshot: string | null;
  backgroundAwareness: string | null;
  hookGoal: string | null;
  shareTriggerGoal: string | null;
};

type WritingEvalTopicMatchedCard = {
  id: number;
  title: string;
  cardType: string;
  status: string;
  confidenceScore: number;
  summary: string | null;
  latestChangeSummary: string | null;
  overturnedJudgements: string[];
  shared: boolean;
  ownerUsername: string | null;
};

type WritingEvalTopicVariantBuilderInput =
  | WritingEvalTopicImportRow
  | {
    topic: WritingEvalTopicImportRow;
    matchedCards?: WritingEvalTopicMatchedCard[];
  };

type WritingOptimizationRunRow = {
  id: number;
  run_code: string;
  dataset_id: number;
  source_schedule_id?: number | null;
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
  source_schedule_name?: string | null;
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
  last_run_score_summary_json?: string | Record<string, unknown> | null;
  last_run_started_at?: string | null;
  last_run_finished_at?: string | null;
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

type WritingEvalJobQueueRow = {
  id: number;
  job_type: string;
  status: string;
  payload_json: string | Record<string, unknown> | null;
  run_at: string | null;
  attempts: number;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type WritingEvalRetryAuditRow = {
  id: number;
  username: string | null;
  payload_json: string | Record<string, unknown> | null;
  created_at: string;
};

type WritingEvalRetryAuditAggregateRow = {
  id: number;
  target_id: string | null;
  username: string | null;
  payload_json: string | Record<string, unknown> | null;
  created_at: string;
};

type WritingEvalPromptVersionRolloutRow = {
  prompt_id: string;
  version: string;
  auto_mode: string | null;
  rollout_observe_only: number | boolean;
  rollout_percentage: number;
  rollout_plan_codes_json: string | null;
  is_active: number | boolean;
};

type WritingEvalPromptRolloutObservationRow = {
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

type WritingEvalAssetRolloutRow = {
  asset_type: string;
  asset_ref: string;
  auto_mode: string | null;
  rollout_observe_only: number | boolean;
  rollout_percentage: number;
  rollout_plan_codes_json: string | null;
  is_enabled: number | boolean;
  notes: string | null;
};

type WritingEvalAssetRolloutObservationRow = {
  asset_type: string;
  asset_ref: string;
  unique_user_count: number;
  total_hit_count: number;
  last_hit_at: string | null;
  observe_user_count: number;
  plan_user_count: number;
  percentage_user_count: number;
  stable_user_count: number;
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

function parseJsonObject(value: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
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

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatMetricNumber(value: unknown, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getRecordArray(value: unknown) {
  if (!Array.isArray(value)) return [] as Record<string, unknown>[];
  return value.map((item) => getRecord(item)).filter((item) => Object.keys(item).length > 0);
}

function getStringArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function parsePlanCodes(value: unknown) {
  return parseJsonArray(typeof value === "string" ? value : null).map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeTextSnippet(value: unknown, limit = 96) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…` : text;
}

function uniqueStrings(values: unknown[], limit = 12) {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = normalizeTextSnippet(value, 120);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push(text);
    if (items.length >= limit) break;
  }
  return items;
}

function hasFilledString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

const PLAN17_FOUR_POINT_DIMENSION_KEYS = [
  "cognitiveFlip",
  "readerSnapshot",
  "coreTension",
  "impactVector",
] as const;

function normalizeStrategyArchetype(value: unknown) {
  const archetype = getString(value);
  return archetype === "opinion"
    || archetype === "case"
    || archetype === "howto"
    || archetype === "hotTake"
    || archetype === "phenomenon"
    ? archetype
    : null;
}

function parseArticleIdFromSourceRef(sourceType: unknown, sourceRef: unknown) {
  if (getString(sourceType) !== "article") return null;
  const match = /^article:(\d+)$/.exec(getString(sourceRef));
  return match ? Number(match[1]) : null;
}

function computeFourPointAverageScoreFromAudit(audit: Record<string, unknown> | null | undefined) {
  const scoreValues = PLAN17_FOUR_POINT_DIMENSION_KEYS
    .map((key) => getNumber(getRecord(audit?.[key]).score))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return scoreValues.length > 0
    ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(2))
    : null;
}

function getPlan17StrategyStrengthScore(input: {
  inputPayload?: Record<string, unknown>;
  stageArtifactPayloads?: Record<string, unknown>;
  articleStrategyCard?: Record<string, unknown> | null;
  articleOutcomeAttribution?: Record<string, unknown> | null;
}) {
  const attributionStrategy = getRecord(input.articleOutcomeAttribution?.strategy);
  const attributedScore = getNumber(attributionStrategy.fourPointAverageScore);
  if (attributedScore !== null) {
    return attributedScore;
  }

  const strategyCard = getRecord(
    input.stageArtifactPayloads?.strategyCard
    || input.stageArtifactPayloads?.strategy_card
    || input.inputPayload?.strategyCard
    || input.inputPayload?.strategy_card
    || input.articleStrategyCard,
  );
  if (Object.keys(strategyCard).length === 0) {
    return null;
  }

  const persistedAudit = getRecord(
    strategyCard.fourPointAudit
    || strategyCard.four_point_audit
    || strategyCard.fourPointAuditJson,
  );
  const persistedAverageScore = computeFourPointAverageScoreFromAudit(persistedAudit);
  if (persistedAverageScore !== null) {
    return persistedAverageScore;
  }

  return computeFourPointAverageScoreFromAudit(buildFourPointAudit(strategyCard));
}

function getPlan17RhythmScore(input: {
  generatedMarkdown: string;
  inputPayload?: Record<string, unknown>;
  stageArtifactPayloads?: Record<string, unknown>;
  articleStrategyCard?: Record<string, unknown> | null;
  articleOutcomeAttribution?: Record<string, unknown> | null;
  articleDeepWritingPayload?: Record<string, unknown> | null;
}) {
  const attributionRhythm = getRecord(input.articleOutcomeAttribution?.rhythm);
  const attributedScore = getNumber(attributionRhythm.score);
  if (attributedScore !== null) {
    return attributedScore;
  }

  const strategyCard = getRecord(
    input.stageArtifactPayloads?.strategyCard
    || input.stageArtifactPayloads?.strategy_card
    || input.inputPayload?.strategyCard
    || input.inputPayload?.strategy_card
    || input.articleStrategyCard,
  );
  const archetype = normalizeStrategyArchetype(strategyCard.archetype);
  if (!archetype) {
    return null;
  }

  const deepWritingPayload = getRecord(
    input.stageArtifactPayloads?.deepWriting
    || input.stageArtifactPayloads?.deep_writing
    || input.articleDeepWritingPayload,
  );
  const expectedPrototypeCode =
    STRATEGY_ARCHETYPE_OPTIONS.find((item) => item.key === archetype)?.prototypeCode
    ?? null;
  const report = evaluateArchetypeRhythmConsistency({
    archetype,
    expectedPrototypeCode,
    actualPrototypeCode: getString(deepWritingPayload.articlePrototype) || null,
    markdownContent: input.generatedMarkdown,
    deepWritingPayload,
  });
  return report.score;
}

const OBVIOUS_TEMPLATE_PLACEHOLDER_PATTERN = /\{\{\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)+\s*\}\}/;

function hasObviousTemplatePlaceholder(value: unknown) {
  return typeof value === "string" && OBVIOUS_TEMPLATE_PLACEHOLDER_PATTERN.test(value);
}

function isTopicItemTemplatePolluted(topic: Pick<WritingEvalTopicImportRow, "title" | "summary" | "angle_options_json">) {
  return [
    topic.title,
    topic.summary,
    ...parseJsonArray(topic.angle_options_json),
  ].some((item) => hasObviousTemplatePlaceholder(item));
}

function normalizeWritingEvalDatasetStatus(value: unknown) {
  const status = String(value || "").trim();
  return status === "archived" || status === "draft" ? status : "active";
}

function inferWritingEvalTaskTypeFromArticle(input: {
  title: string;
  seriesName?: string | null;
  researchBrief?: Record<string, unknown>;
  outlinePlanning?: Record<string, unknown>;
}) {
  const title = `${input.title} ${String(input.seriesName || "")}`.toLowerCase();
  const comparisonCount = getRecordArray(input.researchBrief?.comparisonCards).length;
  if (/(复盘|复习|总结|踩坑|经验|教训|回顾)/.test(title)) {
    return "experience_recap";
  }
  if (/(系列|周报|观察|追踪|连载)/.test(title) || /(series|weekly|watch)/.test(title)) {
    return "series_observation";
  }
  if (comparisonCount > 0 || /(商业|增长|竞争|拆解|市场|策略|公司)/.test(title)) {
    return "business_breakdown";
  }
  if (hasFilledString(input.outlinePlanning?.centralThesis) || hasFilledString(input.researchBrief?.coreQuestion)) {
    return "tech_commentary";
  }
  return "tech_commentary";
}

function inferWritingEvalDifficultyFromArticle(input: {
  hasMarkdown: boolean;
  stageCodes: string[];
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
}) {
  let score = 0;
  if (input.hasMarkdown) score += 1;
  score += Math.min(3, input.stageCodes.length);
  if (input.sourceFactCount >= 4) score += 2;
  else if (input.sourceFactCount >= 2) score += 1;
  if (input.knowledgeCardCount >= 2) score += 1;
  if (input.historyReferenceCount >= 2) score += 1;
  if (score >= 6) return "hard";
  if (score >= 3) return "medium";
  return "light";
}

function inferWritingEvalTaskTypeFromKnowledgeCard(input: {
  title: string;
  summary?: string | null;
  cardType?: string | null;
}) {
  const title = `${input.title} ${String(input.summary || "")}`.toLowerCase();
  if (input.cardType === "company" || input.cardType === "product") {
    return "business_breakdown";
  }
  if (/(复盘|回顾|经验|教训|踩坑|总结)/.test(title)) {
    return "experience_recap";
  }
  if (/(趋势|观察|追踪|系列|连载|演化|时间线)/.test(title) || input.cardType === "event" || input.cardType === "topic") {
    return "series_observation";
  }
  if (/(商业|增长|竞争|市场|策略|公司|产品)/.test(title)) {
    return "business_breakdown";
  }
  return "tech_commentary";
}

function inferWritingEvalDifficultyFromKnowledgeCard(input: {
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  openQuestionCount: number;
  conflictFlagCount: number;
}) {
  let score = 0;
  if (input.sourceFactCount >= 4) score += 2;
  else if (input.sourceFactCount >= 2) score += 1;
  if (input.knowledgeCardCount >= 2) score += 1;
  if (input.historyReferenceCount >= 2) score += 1;
  if (input.openQuestionCount >= 2) score += 1;
  if (input.conflictFlagCount > 0) score += 1;
  if (score >= 5) return "hard";
  if (score >= 2) return "medium";
  return "light";
}

function inferWritingEvalTaskTypeFromTopic(input: {
  title: string;
  summary?: string | null;
  sourceType?: string | null;
}) {
  const title = `${input.title} ${String(input.summary || "")}`.toLowerCase();
  if (/(复盘|回顾|复习|经验|教训|踩坑|总结)/.test(title)) {
    return "experience_recap";
  }
  if (/(系列|观察|追踪|连载|演化|时间线|热点)/.test(title) || input.sourceType === "news") {
    return "series_observation";
  }
  if (/(商业|增长|竞争|市场|策略|公司|产品)/.test(title)) {
    return "business_breakdown";
  }
  return "tech_commentary";
}

function inferWritingEvalDifficultyFromTopic(input: {
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  emotionLabelCount: number;
  angleOptionCount: number;
}) {
  let score = 0;
  if (input.sourceFactCount >= 4) score += 2;
  else if (input.sourceFactCount >= 2) score += 1;
  if (input.knowledgeCardCount >= 2) score += 1;
  if (input.historyReferenceCount >= 2) score += 1;
  if (input.emotionLabelCount >= 2) score += 1;
  if (input.angleOptionCount >= 2) score += 1;
  if (score >= 5) return "hard";
  if (score >= 2) return "medium";
  return "light";
}

function inferWritingEvalTaskTypeFromFragment(input: {
  title?: string | null;
  distilledContent: string;
  sourceType?: string | null;
}) {
  const text = `${String(input.title || "")} ${input.distilledContent}`.toLowerCase();
  if (/(复盘|总结|经验|教训|踩坑|回顾)/.test(text)) {
    return "experience_recap";
  }
  if (/(商业|增长|竞争|市场|公司|产品|策略)/.test(text)) {
    return "business_breakdown";
  }
  if (/(追踪|观察|时间线|变化|舆情|热点)/.test(text) || input.sourceType === "url" || input.sourceType === "screenshot") {
    return "series_observation";
  }
  return "tech_commentary";
}

function inferWritingEvalDifficultyFromFragment(input: {
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  hasSourceUrl: boolean;
  hasScreenshot: boolean;
}) {
  let score = 0;
  if (input.sourceFactCount >= 3) score += 2;
  else if (input.sourceFactCount >= 1) score += 1;
  if (input.knowledgeCardCount >= 2) score += 1;
  if (input.historyReferenceCount >= 2) score += 1;
  if (input.hasSourceUrl) score += 1;
  if (input.hasScreenshot) score += 1;
  if (score >= 5) return "hard";
  if (score >= 2) return "medium";
  return "light";
}

function buildWritingEvalArticleCaseDraft(input: {
  article: WritingEvalArticleImportRow;
  artifactPayloads: Record<string, Record<string, unknown>>;
  historyReferences?: string[];
}) {
  const researchBrief = getRecord(input.artifactPayloads.researchBrief);
  const audienceAnalysis = getRecord(input.artifactPayloads.audienceAnalysis);
  const outlinePlanning = getRecord(input.artifactPayloads.outlinePlanning);
  const deepWriting = getRecord(input.artifactPayloads.deepWriting);
  const researchWriteback = getRecord(researchBrief.strategyWriteback);
  const timelineCards = getRecordArray(researchBrief.timelineCards);
  const comparisonCards = getRecordArray(researchBrief.comparisonCards);
  const intersectionInsights = getRecordArray(researchBrief.intersectionInsights);
  const outlineSelection = getRecord(outlinePlanning.selection);
  const selectedTitle = String(outlineSelection?.selectedTitle || outlinePlanning.workingTitle || input.article.title).trim() || input.article.title;
  const selectedTitleOption = getRecordArray(outlinePlanning.titleOptions).find(
    (item) => String(item.title || "").trim() === selectedTitle,
  ) ?? null;
  const selectedTitleElementsHit = getRecord(selectedTitleOption?.elementsHit);
  const selectedTitleElementsHitCount = ["specific", "curiosityGap", "readerView"].filter(
    (key) => Boolean(selectedTitleElementsHit?.[key]),
  ).length;
  const selectedTitleForbiddenHits = getStringArray(selectedTitleOption?.forbiddenHits, 6);
  const selectedTitleOpenRateScore = typeof selectedTitleOption?.openRateScore === "number"
    ? selectedTitleOption.openRateScore
    : typeof selectedTitleOption?.openRateScore === "string" && String(selectedTitleOption.openRateScore).trim()
      ? Number(selectedTitleOption.openRateScore)
      : null;
  const historyReferencePlan = getRecordArray(deepWriting.historyReferencePlan);
  const historyReferences = uniqueStrings(
    [
      ...(input.historyReferences ?? []),
      ...historyReferencePlan.map((item) => {
        const title = String(item.title || "").trim();
        const detail = String(item.useWhen || item.bridgeSentence || "").trim();
        return title ? `《${title}》${detail ? `：${normalizeTextSnippet(detail, 42)}` : ""}` : "";
      }),
    ],
    4,
  );
  const sourceFacts = uniqueStrings(
    [
      ...timelineCards.flatMap((item) => [item.summary, ...getStringArray(item.signals, 2)]),
      ...comparisonCards.flatMap((item) => [item.position, ...getStringArray(item.differences, 2)]),
      ...intersectionInsights.flatMap((item) => [item.insight, item.whyNow]),
      researchWriteback.coreAssertion,
      researchWriteback.marketPositionInsight,
      researchWriteback.historicalTurningPoint,
    ],
    8,
  );
  const knowledgeCards = uniqueStrings(
    [
      ...timelineCards.flatMap((item) =>
        getRecordArray(item.sources)
          .filter((source) => String(source.sourceType || "").trim() === "knowledge")
          .map((source) => source.label),
      ),
      ...comparisonCards.flatMap((item) =>
        getRecordArray(item.sources)
          .filter((source) => String(source.sourceType || "").trim() === "knowledge")
          .map((source) => source.label),
      ),
      ...intersectionInsights.flatMap((item) =>
        getRecordArray(item.sources)
          .filter((source) => String(source.sourceType || "").trim() === "knowledge")
          .map((source) => source.label),
      ),
    ],
    6,
  );
  const mustUseFacts = uniqueStrings(
    [
      ...getStringArray(deepWriting.mustUseFacts, 6),
      ...sourceFacts.slice(0, 3),
    ],
    5,
  );
  const contentWarnings = uniqueStrings(
    [
      ...getStringArray(audienceAnalysis.contentWarnings, 6),
      ...getStringArray(researchBrief.forbiddenConclusions, 4),
    ],
    6,
  );
  const referenceBadPatterns = uniqueStrings(
    [
      ...getStringArray(researchBrief.forbiddenConclusions, 4),
      ...comparisonCards.flatMap((item) => getStringArray(item.risks, 2)),
      "空泛判断",
      "没有把事实和判断绑紧",
      "标题很强但正文兑现不足",
    ],
    8,
  );
  const stageCodes = Object.keys(input.artifactPayloads).filter(Boolean);
  const hasMarkdown = hasFilledString(input.article.markdown_content);
  const taskType = inferWritingEvalTaskTypeFromArticle({
    title: input.article.title,
    seriesName: input.article.series_name,
    researchBrief,
    outlinePlanning,
  });
  const difficultyLevel = inferWritingEvalDifficultyFromArticle({
    hasMarkdown,
    stageCodes,
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
  });

  return {
    taskCode: `article-${input.article.id}`,
    taskType,
    topicTitle: String(outlinePlanning.workingTitle || deepWriting.selectedTitle || input.article.title).trim() || input.article.title,
    difficultyLevel,
    inputPayload: {
      readerProfile:
        String(audienceAnalysis.coreReaderLabel || researchBrief.targetReader || researchWriteback.targetReader || "").trim()
        || `${input.article.series_name ? `系列读者：${input.article.series_name}` : "关注写作与内容判断的读者"}`,
      languageGuidance:
        String(getStringArray(audienceAnalysis.languageGuidance, 1)[0] || "").trim()
        || "短句、先下判断再补证据、避免机器腔。",
      backgroundAwareness:
        String(getStringArray(audienceAnalysis.backgroundAwarenessOptions, 1)[0] || "").trim()
        || "默认读者知道表层新闻，但不一定知道前情和结构性差异。",
      targetEmotion:
        String(outlinePlanning.targetEmotion || deepWriting.targetEmotion || "").trim()
        || "从表层现象转到结构性理解，并愿意继续传播这个判断。",
      authorPersonaSnapshot:
        String(researchBrief.authorHypothesis || researchWriteback.researchHypothesis || "").trim()
        || (input.article.series_name ? `延续系列 ${input.article.series_name} 的持续观察口径。` : ""),
      writingStyleTarget:
        String(deepWriting.articlePrototypeLabel || outlinePlanning.writingAngle || "").trim()
        || (input.article.series_name ? `延续 ${input.article.series_name} 的连载观察写法。` : "强调判断、证据和行动意义。"),
      titleSignalSnapshot: {
        selectedTitle,
        openRateScore: Number.isFinite(selectedTitleOpenRateScore ?? NaN) ? Math.max(0, Math.min(50, Math.round(selectedTitleOpenRateScore ?? 0))) : null,
        elementsHitCount: selectedTitleElementsHitCount,
        forbiddenHits: selectedTitleForbiddenHits,
        isRecommended: Boolean(selectedTitleOption?.isRecommended),
        recommendReason: String(selectedTitleOption?.recommendReason || "").trim() || null,
      },
      sourceFacts,
      knowledgeCards,
      historyReferences,
    },
    expectedConstraints: {
      mustUseFacts,
      contentWarnings,
      bannedPatterns: uniqueStrings(getStringArray(deepWriting.bannedWordWatchlist, 8), 8),
      callToAction:
        String(audienceAnalysis.recommendedCallToAction || outlinePlanning.endingStrategy || "").trim() || null,
      factCheckRisk: uniqueStrings(getStringArray(researchBrief.forbiddenConclusions, 3), 3),
      importMeta: {
        sourceType: "article",
        articleId: input.article.id,
        articleStatus: input.article.status,
        seriesName: input.article.series_name,
        artifactStages: stageCodes,
        importedFromUpdatedAt: input.article.updated_at,
        titleOpenRateScore: Number.isFinite(selectedTitleOpenRateScore ?? NaN) ? Math.max(0, Math.min(50, Math.round(selectedTitleOpenRateScore ?? 0))) : null,
        titleElementsHitCount: selectedTitleElementsHitCount,
        titleForbiddenHitsCount: selectedTitleForbiddenHits.length,
      },
    },
    viralTargets: {
      titleGoal:
        String(outlinePlanning.workingTitle || "").trim()
        || "标题要先给读者一个明确判断，再点出为什么这件事现在值得关心。",
      hookGoal:
        String(outlinePlanning.openingHook || "").trim()
        || "开头三句内交代今天真正要讨论的变化，不先堆背景。",
      shareTriggerGoal:
        String(intersectionInsights[0]?.insight || researchWriteback.coreAssertion || "").trim()
        || "正文里至少要产出一句值得转发的结构性判断。",
    },
    stageArtifactPayloads: Object.fromEntries(
      Object.entries(input.artifactPayloads).filter(([, payload]) => Object.keys(payload).length > 0),
    ),
    referenceGoodOutput: hasMarkdown ? input.article.markdown_content : null,
    referenceBadPatterns,
    hasMarkdown,
    stageCodes,
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
  };
}

function buildWritingEvalKnowledgeCardCaseDraft(input: {
  card: WritingEvalKnowledgeCardImportRow;
  sourceFragments?: Array<{ id: number; distilledContent: string }>;
  relatedCards?: Array<{ id: number; title: string; summary: string | null; cardType: string; status: string; linkType: string }>;
}) {
  const keyFacts = uniqueStrings(getStringArray(input.card.key_facts_json, 12), 8);
  const openQuestions = uniqueStrings(getStringArray(input.card.open_questions_json, 8), 6);
  const conflictFlags = uniqueStrings(getStringArray(input.card.conflict_flags_json, 6), 4);
  const sourceFacts = uniqueStrings(
    [
      ...keyFacts,
      ...(input.sourceFragments ?? []).map((item) => item.distilledContent),
      input.card.summary,
    ],
    8,
  );
  const knowledgeCards = uniqueStrings((input.relatedCards ?? []).map((item) => item.title), 6);
  const historyReferences = uniqueStrings(
    (input.relatedCards ?? []).flatMap((item) => [item.title, item.summary]),
    6,
  );
  const taskType = inferWritingEvalTaskTypeFromKnowledgeCard({
    title: input.card.title,
    summary: input.card.summary,
    cardType: input.card.card_type,
  });
  const difficultyLevel = inferWritingEvalDifficultyFromKnowledgeCard({
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
    openQuestionCount: openQuestions.length,
    conflictFlagCount: conflictFlags.length,
  });
  const mustUseFacts = uniqueStrings([...keyFacts, ...sourceFacts.slice(0, 3)], 5);
  const contentWarnings = uniqueStrings(
    [
      ...conflictFlags.map((item) => `注意冲突信号：${item}`),
      ...(input.card.status === "stale" ? ["背景卡状态为 stale，引用前要补最新事实。"] : []),
      ...(input.card.status === "conflicted" ? ["背景卡存在冲突，正文里不要把单一口径写成定论。"] : []),
    ],
    5,
  );
  const referenceBadPatterns = uniqueStrings(
    [
      "只复述知识卡摘要，没有形成新判断",
      "忽略知识卡里的冲突信号",
      "把开放问题写成确定结论",
      ...conflictFlags.map((item) => `跳过冲突维度：${item}`),
    ],
    8,
  );

  return {
    taskCode: `knowledge-card-${input.card.id}`,
    taskType,
    topicTitle: input.card.title,
    difficultyLevel,
    inputPayload: {
      readerProfile: "希望快速建立背景理解、再进入结构性判断的中文内容读者",
      languageGuidance: "短句、先讲判断再补证据、不要重复档案摘要。",
      backgroundAwareness: input.card.summary || "默认读者知道表层事件，但不了解这张背景卡沉淀出的关键前情。",
      targetEmotion:
        input.card.status === "conflicted"
          ? "先把冲突口径讲清，再给出暂时可信的判断边界。"
          : "帮助读者快速建立背景坐标，并形成值得传播的解释框架。",
      authorPersonaSnapshot:
        input.card.latest_change_summary || `围绕 ${input.card.title} 做持续观察和结构化解释。`,
      writingStyleTarget:
        input.card.card_type === "company" || input.card.card_type === "product"
          ? "商业拆解式写法，判断清楚、证据克制。"
          : "背景梳理 + 结构判断并重，不只做资料汇编。",
      sourceFacts,
      knowledgeCards,
      historyReferences,
    },
    expectedConstraints: {
      mustUseFacts,
      contentWarnings,
      bannedPatterns: uniqueStrings(openQuestions.map((item) => `不要跳过这个未决问题：${item}`), 6),
      callToAction: input.card.status === "conflicted" ? "明确告诉读者哪些点还要继续观察" : null,
      factCheckRisk: uniqueStrings([...openQuestions, ...conflictFlags], 6),
      importMeta: {
        sourceType: "knowledge_card",
        knowledgeCardId: input.card.id,
        cardType: input.card.card_type,
        cardStatus: input.card.status,
        confidenceScore: input.card.confidence_score,
        lastCompiledAt: input.card.last_compiled_at,
        lastVerifiedAt: input.card.last_verified_at,
      },
    },
    viralTargets: {
      titleGoal:
        input.card.status === "conflicted"
          ? "标题要同时点出核心争议和这轮真正新增的判断。"
          : "标题要把背景卡里的核心判断前置，不写成资料汇总标题。",
      hookGoal:
        input.card.latest_change_summary
        || input.card.summary
        || "开头三句内先交代这张背景卡为什么现在值得重新看。",
      shareTriggerGoal:
        keyFacts[0]
        || input.card.summary
        || "正文里至少产出一句能代表这张背景卡核心判断的句子。",
    },
    stageArtifactPayloads: {
      deepWriting: {
        sourceType: "knowledge_card",
        knowledgeCardId: input.card.id,
        knowledgeCardTitle: input.card.title,
        cardType: input.card.card_type,
        confidenceScore: Math.round((Number(input.card.confidence_score || 0) || 0) * 100),
        status: input.card.status,
        summary: input.card.summary,
        keyFacts,
        openQuestions,
        conflictFlags,
      },
    },
    referenceGoodOutput: null,
    referenceBadPatterns,
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
    openQuestionCount: openQuestions.length,
    conflictFlagCount: conflictFlags.length,
  };
}

function buildWritingEvalTopicCaseDraft(input: {
  topic: WritingEvalTopicImportRow;
  matchedCards?: WritingEvalTopicMatchedCard[];
  variant?: WritingEvalTopicCaseVariant | null;
}) {
  const emotionLabels = uniqueStrings(parseJsonArray(input.topic.emotion_labels_json), 4);
  const baseAngles = uniqueStrings(parseJsonArray(input.topic.angle_options_json), 3);
  const matchedCards = input.matchedCards ?? [];
  const variant = input.variant ?? buildWritingEvalTopicCaseVariants({
    topic: input.topic,
    matchedCards,
  })[0] ?? null;
  const angleOptions = uniqueStrings(buildTopicAngleOptions(input.topic.title, baseAngles, matchedCards), 3);
  const judgementShift =
    buildTopicJudgementShift(input.topic.title, matchedCards)
    || (input.topic.summary
      ? `别停在“${normalizeTextSnippet(input.topic.summary, 54)}”这层摘要复述，要解释这次新增变量怎样改写旧判断。`
      : `围绕 ${input.topic.title} 解释旧判断为什么不够用了。`);
  const sourceFacts = uniqueStrings(
    [
      input.topic.summary,
      input.topic.source_url ? `主信源：${input.topic.source_url}` : "",
      ...emotionLabels.map((item) => `情绪线索：${item}`),
      ...matchedCards.flatMap((item) => [item.summary, item.latestChangeSummary]),
    ],
    8,
  );
  const knowledgeCards = uniqueStrings(matchedCards.map((item) => item.title), 6);
  const historyReferences = uniqueStrings(
    matchedCards.flatMap((item) => [item.title, item.summary, item.latestChangeSummary, ...item.overturnedJudgements]),
    6,
  );
  const taskType = inferWritingEvalTaskTypeFromTopic({
    title: input.topic.title,
    summary: input.topic.summary,
    sourceType: input.topic.source_type,
  });
  const difficultyLevel = inferWritingEvalDifficultyFromTopic({
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
    emotionLabelCount: emotionLabels.length,
    angleOptionCount: angleOptions.length,
  });
  const mustUseFacts = uniqueStrings(
    [
      ...sourceFacts.slice(0, 2),
      variant?.preferredAngle,
      variant?.targetEmotion,
      judgementShift,
    ],
    5,
  );
  const contentWarnings = uniqueStrings(
    [
      input.topic.source_url ? "" : "缺少原始信源 URL，成文时不要把单条摘要写成定论。",
      ...matchedCards
        .filter((item) => item.status === "conflicted" || item.status === "stale")
        .map((item) => `关联背景卡 ${item.title} 当前状态为 ${item.status}`),
    ],
    5,
  );
  const referenceBadPatterns = uniqueStrings(
    [
      "只复述热点摘要，没有给出新增判断",
      "没有交代为什么这件事现在值得写",
      "标题很热但正文缺少事实钩子",
      variant?.code === "emotion-primary" ? "只写情绪标签，没有把情绪压强落到事实与读者处境" : "",
      variant?.code === "judgement-shift" ? "没有说清旧判断为什么失效、新判断为什么成立" : "",
      ...matchedCards
        .filter((item) => item.status === "conflicted")
        .map((item) => `忽略关联背景卡冲突：${item.title}`),
    ],
    8,
  );

  return {
    taskCode: `topic-item-${input.topic.id}--${variant?.code || "angle-primary"}`,
    variantCode: variant?.code ?? "angle-primary",
    variantLabel: variant?.label ?? "主切角",
    taskType,
    topicTitle: variant?.titleSuffix ? `${input.topic.title} · ${variant.titleSuffix}` : input.topic.title,
    difficultyLevel,
    inputPayload: {
      readerProfile: "知道表层热点，但希望快速建立判断框架的中文读者",
      languageGuidance: "先给判断，再补事实，不要把热点摘要重写成空泛评论。",
      backgroundAwareness:
        variant?.backgroundAwareness
        || input.topic.summary
        || "默认读者知道新闻标题，但不知道这件事真正改变了什么。",
      targetEmotion:
        variant?.targetEmotion
        || emotionLabels[0]
        || "先感到压强，再愿意把这个判断转发给同样关注此事的人。",
      authorPersonaSnapshot:
        variant?.authorPersonaSnapshot
        || judgementShift
        || `围绕 ${input.topic.title} 做一次“旧判断是否失效”的结构化解释。`,
      writingStyleTarget:
        variant?.preferredAngle
        || angleOptions[0]
        || "热点观察写法，强调新增变量、判断位移和读者收益。",
      sourceFacts,
      knowledgeCards,
      historyReferences,
    },
    expectedConstraints: {
      mustUseFacts,
      contentWarnings,
      bannedPatterns: uniqueStrings(
        [
          ...angleOptions.map((item) => `不要绕开这个切角：${item}`),
          variant?.preferredAngle ? `不要只喊“${variant.preferredAngle}”，要拆出新增事实与判断位移。` : "",
          variant?.code === "emotion-primary" && emotionLabels[0] ? `不要把“${emotionLabels[0]}”只当成标签使用。` : "",
          variant?.code === "judgement-shift" ? "不要回避旧判断为何失效。" : "",
        ],
        6,
      ),
      callToAction: "结尾要点明这条热点后续还要继续观察什么。",
      factCheckRisk: uniqueStrings(
        [
          ...matchedCards.flatMap((item) => item.status === "conflicted" ? [item.title] : []),
          ...matchedCards.flatMap((item) => item.overturnedJudgements),
        ],
        6,
      ),
      importMeta: {
        sourceType: "topic_item",
        topicItemId: input.topic.id,
        variantCode: variant?.code ?? "angle-primary",
        variantLabel: variant?.label ?? "主切角",
        sourceName: input.topic.source_name,
        sourceTypeCode: input.topic.source_type,
        sourcePriority: input.topic.source_priority,
        sourceUrl: input.topic.source_url,
        publishedAt: input.topic.published_at,
      },
    },
    viralTargets: {
      titleGoal: variant?.preferredAngle || angleOptions[0] || "标题要先点明这次真正新增的判断，而不是重复新闻。",
      hookGoal:
        variant?.hookGoal
        || judgementShift
        || input.topic.summary
        || "开头三句内交代旧判断为什么不够用了。",
      shareTriggerGoal:
        variant?.shareTriggerGoal
        || angleOptions[1]
        || "正文里至少要产出一句值得转发的判断位移句。",
    },
    stageArtifactPayloads: {
      researchBrief: {
        sourceType: "topic_item",
        topicItemId: input.topic.id,
        sourceName: input.topic.source_name,
        sourceTypeCode: input.topic.source_type,
        summary: input.topic.summary,
        sourceUrl: input.topic.source_url,
        publishedAt: input.topic.published_at,
        emotionLabels,
        angleOptions,
        judgementShift,
        variantCode: variant?.code ?? "angle-primary",
        variantLabel: variant?.label ?? "主切角",
        matchedKnowledgeCards: matchedCards.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          cardType: item.cardType,
          summary: item.summary,
          latestChangeSummary: item.latestChangeSummary,
          confidenceScore: item.confidenceScore,
        })),
      },
    },
    referenceGoodOutput: null,
    referenceBadPatterns,
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
    emotionLabelCount: emotionLabels.length,
    angleOptionCount: angleOptions.length,
  };
}

function normalizeWritingEvalTopicVariantBuilderInput(input: WritingEvalTopicVariantBuilderInput) {
  if ("topic" in input) {
    return {
      topic: input.topic,
      matchedCards: input.matchedCards ?? [],
    };
  }
  return {
    topic: input,
    matchedCards: [],
  };
}

function normalizeTopicVariantTaskCodes(topicId: number, existingTaskCodes?: Iterable<string>) {
  const normalized = new Set(Array.from(existingTaskCodes ?? []).filter((item) => Boolean(item)));
  if (normalized.has(`topic-item-${topicId}`)) {
    normalized.add(`topic-item-${topicId}--angle-primary`);
  }
  return normalized;
}

export function buildWritingEvalTopicCaseVariants(input: WritingEvalTopicVariantBuilderInput) {
  const normalized = normalizeWritingEvalTopicVariantBuilderInput(input);
  const emotionLabels = uniqueStrings(parseJsonArray(normalized.topic.emotion_labels_json), 4);
  const baseAngles = uniqueStrings(parseJsonArray(normalized.topic.angle_options_json), 3);
  const matchedCards = normalized.matchedCards;
  const angleOptions = uniqueStrings(buildTopicAngleOptions(normalized.topic.title, baseAngles, matchedCards), 3);
  const primaryAngle =
    angleOptions[0]
    || `围绕“${normalized.topic.title}”拆出这次最值得写的新变量，不要重写热点摘要。`;
  const contrastAngle =
    angleOptions[1]
    || angleOptions[2]
    || `不要只看表层热度，改写“${normalized.topic.title}”背后的利益变化和判断坐标。`;
  const leadEmotion =
    emotionLabels[0]
    || "把这条热点带来的真实压强写出来，让读者知道为什么现在必须形成判断。";
  const judgementShift =
    buildTopicJudgementShift(normalized.topic.title, matchedCards)
    || (normalized.topic.summary
      ? `旧判断容易停在“${normalizeTextSnippet(normalized.topic.summary, 54)}”这层复述，这次要说明新增事实怎样改写原有结论。`
      : `围绕 ${normalized.topic.title} 说明旧判断为什么失效，新判断为什么成立。`);
  const variants: WritingEvalTopicCaseVariant[] = [
    {
      code: "angle-primary",
      label: "主切角",
      titleSuffix: "主切角",
      preferredAngle: primaryAngle,
      targetEmotion: emotionLabels[0] ?? null,
      authorPersonaSnapshot: `先沿“${primaryAngle}”拆开新增变量，不要平铺事件进展。`,
      backgroundAwareness:
        normalized.topic.summary
          ? `${normalized.topic.summary} 这次优先从“${primaryAngle}”切入。`
          : `围绕“${primaryAngle}”重写这条热点的判断入口。`,
      hookGoal: `开头三句内直接落到“${primaryAngle}”。`,
      shareTriggerGoal: `正文里至少产出一句围绕“${primaryAngle}”的可转发判断。`,
    },
    {
      code: "angle-contrast",
      label: "差异切角",
      titleSuffix: "差异切角",
      preferredAngle: contrastAngle,
      targetEmotion: emotionLabels[1] ?? emotionLabels[0] ?? null,
      authorPersonaSnapshot: `别顺着主流摘要走，围绕“${contrastAngle}”写出不同的判断入口。`,
      backgroundAwareness:
        normalized.topic.summary
          ? `${normalized.topic.summary} 但正文不能停在摘要层，要切进“${contrastAngle}”。`
          : `优先用“${contrastAngle}”建立区别于表层新闻的判断框架。`,
      hookGoal: `开头先抛出“${contrastAngle}”这条反直觉切角。`,
      shareTriggerGoal: `正文里写出一句能代表“${contrastAngle}”的差异化判断。`,
    },
  ];
  variants.push({
    code: "emotion-primary",
    label: emotionLabels[0] ? `情绪主轴 · ${emotionLabels[0]}` : "情绪主轴",
    titleSuffix: "情绪主轴",
    preferredAngle: emotionLabels[0] ? `沿“${emotionLabels[0]}”这股情绪拆读者为什么现在会被这条热点刺中。` : primaryAngle,
    targetEmotion: `${leadEmotion} 要被写成具体读者感受，而不是标签。`,
    authorPersonaSnapshot: `围绕“${leadEmotion}”这股压强，解释为什么这条热点会卡住读者。`,
    backgroundAwareness: normalized.topic.summary,
    hookGoal: `${leadEmotion} 不是背景，它要在开头三句里被具象化。`,
    shareTriggerGoal: `正文里至少要写出一句会因为“${leadEmotion}”被转发的判断。`,
  });
  variants.push({
    code: "judgement-shift",
    label: "判断位移",
    titleSuffix: "判断位移",
    preferredAngle: judgementShift,
    targetEmotion: null,
    authorPersonaSnapshot: judgementShift,
    backgroundAwareness:
      normalized.topic.summary
        ? `${normalized.topic.summary} 重点不是复述事实，而是说明旧判断为什么失效。`
        : "重点解释这条热点带来的判断位移。",
    hookGoal: judgementShift,
    shareTriggerGoal: "正文里要明确写出“旧判断失效，新判断成立”的那一句。",
  });
  return Array.from(new Map(variants.map((item) => [item.code, item])).values()).slice(0, 6);
}

function buildWritingEvalTopicCaseDrafts(input: {
  topic: WritingEvalTopicImportRow;
  matchedCards?: Array<{
    id: number;
    title: string;
    cardType: string;
    status: string;
    confidenceScore: number;
    summary: string | null;
    latestChangeSummary: string | null;
    overturnedJudgements: string[];
    shared: boolean;
    ownerUsername: string | null;
  }>;
}) {
  return buildWritingEvalTopicCaseVariants(input).map((variant) =>
    buildWritingEvalTopicCaseDraft({
      topic: input.topic,
      matchedCards: input.matchedCards,
      variant,
    }),
  );
}

function pickNextWritingEvalTopicCaseDraft(input: {
  topic: WritingEvalTopicImportRow;
  matchedCards?: Array<{
    id: number;
    title: string;
    cardType: string;
    status: string;
    confidenceScore: number;
    summary: string | null;
    latestChangeSummary: string | null;
    overturnedJudgements: string[];
    shared: boolean;
    ownerUsername: string | null;
  }>;
  existingTaskCodes?: Iterable<string>;
}) {
  const existingTaskCodes = new Set(Array.from(input.existingTaskCodes ?? []));
  return buildWritingEvalTopicCaseDrafts({
    topic: input.topic,
    matchedCards: input.matchedCards,
  }).find((draft) => !existingTaskCodes.has(draft.taskCode)) ?? null;
}

function buildWritingEvalFragmentCaseDraft(input: {
  fragment: WritingEvalFragmentImportRow;
  linkedCards?: Array<{ id: number; title: string; summary: string | null; cardType: string; status: string; confidenceScore: number }>;
}) {
  const linkedCards = input.linkedCards ?? [];
  const fragmentTitle = String(input.fragment.title || "").trim() || `素材 #${input.fragment.id}`;
  const sourceFacts = uniqueStrings(
    [
      input.fragment.distilled_content,
      normalizeTextSnippet(input.fragment.raw_content, 120),
      input.fragment.source_url ? `来源：${input.fragment.source_url}` : "",
      ...linkedCards.flatMap((item) => [item.summary, item.title]),
    ],
    8,
  );
  const knowledgeCards = uniqueStrings(linkedCards.map((item) => item.title), 6);
  const historyReferences = uniqueStrings(linkedCards.flatMap((item) => [item.title, item.summary]), 6);
  const hasScreenshot = Boolean(input.fragment.screenshot_path) || input.fragment.source_type === "screenshot";
  const taskType = inferWritingEvalTaskTypeFromFragment({
    title: input.fragment.title,
    distilledContent: input.fragment.distilled_content,
    sourceType: input.fragment.source_type,
  });
  const difficultyLevel = inferWritingEvalDifficultyFromFragment({
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
    hasSourceUrl: Boolean(input.fragment.source_url),
    hasScreenshot,
  });
  const mustUseFacts = uniqueStrings(sourceFacts.slice(0, 4), 4);
  const contentWarnings = uniqueStrings(
    [
      hasScreenshot ? "如果引用截图素材，只能描述画面信息，不要伪造原文逐字引用。" : "",
      input.fragment.source_url ? "" : "缺少外链来源，成文时要把事实边界写得更保守。",
      ...linkedCards
        .filter((item) => item.status === "conflicted" || item.status === "stale")
        .map((item) => `关联背景卡 ${item.title} 当前状态为 ${item.status}`),
    ],
    5,
  );
  const referenceBadPatterns = uniqueStrings(
    [
      "只改写素材原句，没有形成判断",
      "把截图或二手摘要写成确定事实",
      "没有交代这条素材为什么值得进入正文",
    ],
    6,
  );
  const materialBundleItem = {
    fragmentId: input.fragment.id,
    title: fragmentTitle,
    usageMode: hasScreenshot ? "image" : "rewrite",
    sourceType: input.fragment.source_type,
    summary: normalizeTextSnippet(input.fragment.distilled_content, 120),
    screenshotPath: input.fragment.screenshot_path,
    sourceUrl: input.fragment.source_url,
  };

  return {
    taskCode: `fragment-${input.fragment.id}`,
    taskType,
    topicTitle: fragmentTitle,
    difficultyLevel,
    inputPayload: {
      readerProfile: "对新事实敏感，希望快速看到判断和出处边界的中文读者",
      languageGuidance: "短句、先讲这条素材意味着什么，再补来源和判断。",
      backgroundAwareness: normalizeTextSnippet(input.fragment.raw_content || input.fragment.distilled_content, 140),
      targetEmotion: "让读者觉得这条素材不只是线索，而是一个值得继续展开的判断入口。",
      authorPersonaSnapshot: `围绕素材 ${fragmentTitle} 提炼最值得成文的判断。`,
      writingStyleTarget: hasScreenshot ? "图证 + 判断并重，不要把截图抄写成流水账。" : "素材驱动写法，判断必须绑定事实。",
      sourceFacts,
      knowledgeCards,
      historyReferences,
    },
    expectedConstraints: {
      mustUseFacts,
      contentWarnings,
      bannedPatterns: [
        "空泛扩写",
        "跳过来源边界",
      ],
      callToAction: "结尾要说明这条素材下一步最值得补哪类证据。",
      factCheckRisk: uniqueStrings(
        [
          input.fragment.source_url ? "" : "缺少原始信源链接",
          hasScreenshot ? "截图素材需要明确来源边界" : "",
        ],
        3,
      ),
      importMeta: {
        sourceType: "fragment",
        fragmentId: input.fragment.id,
        fragmentSourceType: input.fragment.source_type,
        sourceUrl: input.fragment.source_url,
        screenshotPath: input.fragment.screenshot_path,
        createdAt: input.fragment.created_at,
      },
    },
    viralTargets: {
      titleGoal: "标题要点明这条素材真正值得关注的变化，而不是只报事实。",
      hookGoal: input.fragment.distilled_content || "开头三句内交代这条素材为什么值得继续写。",
      shareTriggerGoal: "正文里至少产出一句能概括这条素材判断价值的话。",
    },
    stageArtifactPayloads: {
      deepWriting: {
        sourceType: "fragment",
        fragmentId: input.fragment.id,
        fragmentTitle,
        materialBundle: [materialBundleItem],
        linkedKnowledgeCards: linkedCards,
      },
    },
    referenceGoodOutput: null,
    referenceBadPatterns,
    sourceFactCount: sourceFacts.length,
    knowledgeCardCount: knowledgeCards.length,
    historyReferenceCount: historyReferences.length,
    hasSourceUrl: Boolean(input.fragment.source_url),
    hasScreenshot,
  };
}

function getWritingEvalDatasetReadiness(
  cases: WritingEvalCaseRow[],
  datasetStatusInput?: string | null,
  datasetDescriptor?: { code?: string | null; name?: string | null; description?: string | null },
): WritingEvalDatasetReadiness {
  const datasetStatus = normalizeWritingEvalDatasetStatus(datasetStatusInput);
  const datasetFocus = inferWritingEvalDatasetFocus(datasetDescriptor ?? {});
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
    if (datasetFocus.key === "general") {
      if (qualityTargets.distinctTaskTypeCount < 4) warnings.push(`样本题型仅覆盖 ${qualityTargets.distinctTaskTypeCount}/4 类`);
    } else if (!datasetFocus.targetTaskTypes.some((taskType) => taskTypes.has(taskType))) {
      warnings.push(`当前还没有命中 ${datasetFocus.label} 的专用样本类型`);
    }
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
  const datasetDescriptor = await db.queryOne<{ code: string | null; name: string | null; description: string | null }>(
    "SELECT code, name, description FROM writing_eval_datasets WHERE id = ?",
    [datasetId],
  );
  const rows = await db.query<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE dataset_id = ?`,
    [datasetId],
  );
  return getWritingEvalDatasetReadiness(rows, datasetStatus, datasetDescriptor ?? undefined);
}

async function getWritingEvalDatasetReadinessMap(datasets: Array<{
  id: number;
  status?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
}>) {
  const safeDatasets = datasets.filter((item) => Number.isInteger(item.id) && item.id > 0);
  const safeDatasetIds = [...new Set(safeDatasets.map((item) => item.id))];
  const map = new Map<number, WritingEvalDatasetReadiness>();
  if (safeDatasetIds.length === 0) {
    return map;
  }
  const statusMap = new Map<number, string>();
  const descriptorMap = new Map<number, { code?: string | null; name?: string | null; description?: string | null }>();
  for (const item of safeDatasets) {
    statusMap.set(item.id, normalizeWritingEvalDatasetStatus(item.status));
    descriptorMap.set(item.id, {
      code: item.code,
      name: item.name,
      description: item.description,
    });
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
    map.set(
      datasetId,
      getWritingEvalDatasetReadiness(grouped.get(datasetId) ?? [], statusMap.get(datasetId), descriptorMap.get(datasetId)),
    );
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

function approximateErf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absolute);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-(absolute ** 2));
  return sign * y;
}

function computeNormalCdf(value: number) {
  return 0.5 * (1 + approximateErf(value / Math.SQRT2));
}

function computeCorrelationPValue(correlation: number | null, sampleSize: number) {
  if (correlation == null || sampleSize < 4) return null;
  const bounded = clampNumber(correlation, -0.999999, 0.999999);
  const fisherZ = 0.5 * Math.log((1 + bounded) / (1 - bounded));
  const zScore = Math.abs(fisherZ) * Math.sqrt(sampleSize - 3);
  return 2 * (1 - computeNormalCdf(zScore));
}

function summarizeQualityObservationGaps(items: Array<{ key: string; label: string; count: number }>) {
  return items
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function computeRank(values: number[]) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value);
  const ranks = new Array<number>(values.length);
  let cursor = 0;
  while (cursor < sorted.length) {
    let end = cursor;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[cursor].value) {
      end += 1;
    }
    const averageRank = (cursor + end + 2) / 2;
    for (let index = cursor; index <= end; index += 1) {
      ranks[sorted[index].index] = averageRank;
    }
    cursor = end + 1;
  }
  return ranks;
}

function computeSpearmanCorrelation(left: number[], right: number[]) {
  if (left.length < 2 || right.length < 2 || left.length !== right.length) return null;
  return computePearsonCorrelation(computeRank(left), computeRank(right));
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

const TITLE_TEMPLATE_PROMPT_ID = "title_optimizer" as const;
const LEAD_TEMPLATE_PROMPT_ID = "opening_optimizer" as const;

const PROMPT_BACKED_WRITING_EVAL_VERSION_TYPES = [
  "prompt_version",
  "fact_check",
  "title_template",
  "lead_template",
] as const;
const SUPPORTED_WRITING_EVAL_VERSION_TYPES = [
  ...PROMPT_BACKED_WRITING_EVAL_VERSION_TYPES,
  "scoring_profile",
  "layout_strategy",
  "apply_command_template",
] as const;

function isPromptBackedWritingEvalVersionType(value: string) {
  return PROMPT_BACKED_WRITING_EVAL_VERSION_TYPES.includes(value as (typeof PROMPT_BACKED_WRITING_EVAL_VERSION_TYPES)[number]);
}

function getRequiredPromptIdForPromptBackedVersionType(versionType: string) {
  if (versionType === "fact_check") return "fact_check";
  if (versionType === "title_template") return TITLE_TEMPLATE_PROMPT_ID;
  if (versionType === "lead_template") return LEAD_TEMPLATE_PROMPT_ID;
  return null;
}

function resolvePromptBackedWritingEvalVersionRef(versionType: string, versionRef: string) {
  const parsed = parsePromptVersionRef(versionRef);
  const requiredPromptId = getRequiredPromptIdForPromptBackedVersionType(versionType);
  if (requiredPromptId && parsed.promptId !== requiredPromptId) {
    if (versionType === "fact_check") {
      throw new Error("fact_check 实验必须使用 fact_check Prompt 版本");
    }
    if (versionType === "title_template") {
      throw new Error("title_template 实验必须使用 title_optimizer Prompt 版本");
    }
    if (versionType === "lead_template") {
      throw new Error("lead_template 实验必须使用 opening_optimizer Prompt 版本");
    }
  }
  return parsed;
}

function getWritingEvalVersionTargetKey(versionType: string, versionRef: string) {
  return isPromptBackedWritingEvalVersionType(versionType)
    ? resolvePromptBackedWritingEvalVersionRef(versionType, versionRef).promptId
    : versionRef;
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
  if (experimentMode === "title_only") return TITLE_TEMPLATE_PROMPT_ID;
  if (experimentMode === "lead_only") return LEAD_TEMPLATE_PROMPT_ID;
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
  const historicalSimilarityRisk = getNumber(scoreSummary.historicalSimilarityRisk) ?? 0;
  const baseHistoricalSimilarityRisk = getNumber(scoreSummary.baseHistoricalSimilarityRisk) ?? historicalSimilarityRisk;
  const judgeAgreementRatio = getNumber(scoreSummary.judgeAgreementRatio) ?? 1;
  const baseJudgeAgreementRatio = getNumber(scoreSummary.baseJudgeAgreementRatio) ?? judgeAgreementRatio;
  const judgeScoreStddev = getNumber(scoreSummary.judgeScoreStddev) ?? 0;
  const baseJudgeScoreStddev = getNumber(scoreSummary.baseJudgeScoreStddev) ?? judgeScoreStddev;
  const judgeDisagreementRisk = getNumber(scoreSummary.judgeDisagreementRisk) ?? 0;
  const baseJudgeDisagreementRisk = getNumber(scoreSummary.baseJudgeDisagreementRisk) ?? judgeDisagreementRisk;
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
  if (historicalSimilarityRisk > Math.max(0.55, baseHistoricalSimilarityRisk + 0.08)) blockers.push("历史近重复风险过高");
  if (judgeAgreementRatio < 0.66 || judgeAgreementRatio < baseJudgeAgreementRatio - 0.08) blockers.push("评审结论分歧扩大");
  if (judgeDisagreementRisk > Math.max(0.45, baseJudgeDisagreementRisk + 0.08)) blockers.push("多评审分歧风险过高");
  if (judgeScoreStddev > Math.max(8, baseJudgeScoreStddev + 2)) blockers.push("裁判打分波动过大");
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
      ? `总分提升 ${deltaTotal.toFixed(2)}，提分样本 ${improvedCaseCount} 条；${signalHighlights.length ? `核心增益集中在 ${signalHighlights.join("、")}，` : ""}且事实风险、近重复、多评审分歧与组合风险守卫均未触发。`
      : `当前更适合 discard：${blockers.slice(0, 4).join("；")}。`,
  };
}

function mapDataset(row: WritingEvalDatasetRow, readiness: WritingEvalDatasetReadiness) {
  const focus = inferWritingEvalDatasetFocus(row);
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
    focus,
    readiness,
  };
}

async function ensureWritingEvalDatasetPresets() {
  await ensureExtendedProductSchema();
  const presets = getWritingEvalDatasetCreatePresets();
  if (presets.length === 0) {
    return {
      createdCodes: [] as string[],
    };
  }

  const db = getDatabase();
  const existingRows = await db.query<{ code: string }>(
    `SELECT code
     FROM writing_eval_datasets
     WHERE code IN (${presets.map(() => "?").join(", ")})`,
    presets.map((preset) => preset.code),
  );
  const existingCodes = new Set(existingRows.map((row) => row.code));
  const now = new Date().toISOString();
  const createdCodes: string[] = [];

  for (const preset of presets) {
    if (existingCodes.has(preset.code)) {
      continue;
    }
    await db.exec(
      `INSERT INTO writing_eval_datasets (code, name, description, status, sample_count, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [preset.code, preset.name, preset.description, preset.status, 0, null, now, now],
    );
    createdCodes.push(preset.code);
    existingCodes.add(preset.code);
  }

  await ensurePlan21OpeningOptimizerEvaluationSeed();
  await normalizePlan17TopicItemCaseTaskTypes(presets.map((preset) => preset.code));
  return { createdCodes };
}

function buildPlan21OpeningOptimizerSeedCase(index: number) {
  const taskTypes = ["tech_commentary", "business_breakdown", "experience_recap", "series_observation"] as const;
  const difficultyLevels = ["light", "medium", "hard"] as const;
  const patternSeeds = [
    {
      title: "AI 写作第一屏为什么留不住人",
      badOpening: "在当今 AI 时代，内容创作正在经历深刻变化。",
      goodOpening: "上周我帮朋友改稿，改到一半我把电脑关了。",
      forbiddenPattern: "D1 大而空背景铺垫",
    },
    {
      title: "公众号团队为什么总在发布前返工",
      badOpening: "大家好，我是内容团队负责人，今天聊聊公众号发布效率。",
      goodOpening: "周二晚上十点，编辑把稿子退回来，只留了一句：草稿箱又卡住了。",
      forbiddenPattern: "D2 自我介绍开场",
    },
    {
      title: "标题合格但完读率不动的真实原因",
      badOpening: "某份报告显示，用户注意力正在快速下降。",
      goodOpening: "标题点开率涨了以后，我们反而更快看见了另一个问题：读者三秒就走。",
      forbiddenPattern: "D3 引用 / 数据诱饵",
    },
    {
      title: "把好故事埋在第三段会发生什么",
      badOpening: "最近很多作者都在复盘自己的写作流程，试图找到新的增长方式。",
      goodOpening: "我把原稿第三段挪到第一句后，那篇文章的开头终于像人在说话了。",
      forbiddenPattern: "D4 钩子后置",
    },
  ];
  const seed = patternSeeds[index % patternSeeds.length];
  const caseNo = index + 1;
  return {
    taskCode: `plan21-opening-${String(caseNo).padStart(2, "0")}`,
    taskType: taskTypes[index % taskTypes.length],
    topicTitle: `${seed.title} · 样本 ${caseNo}`,
    difficultyLevel: difficultyLevels[index % difficultyLevels.length],
    inputPayload: {
      readerProfile: "月发文 >=4 篇的公众号作者，熟悉 AI 辅助写作但反感 AI 腔。",
      targetEmotion: index % 2 === 0 ? "先被现场抓住，再接受判断" : "先看到冲突，再愿意继续读",
      sourceFacts: [
        "公众号读者注意力窗口集中在前 200 字。",
        "开头禁区会显著增加 AI 腔和跳出风险。",
        `样本 ${caseNo} 用于 opening_optimizer 诊断与改写回归。`,
      ],
      knowledgeCards: [
        "四种死法：大背景、自我介绍、引用数据诱饵、钩子后置。",
        "高上限开头优先选择具体场景、冲突反差或判断前置。",
      ],
      historyReferences: [
        "plan19 标题闸门",
        "plan21 开头模式学习",
      ],
      draftOpening: seed.badOpening,
    },
    expectedConstraints: {
      forbiddenPattern: seed.forbiddenPattern,
      mustReturnRewriteDirections: 2,
      diagnoseDimensions: ["abstractLevel", "paddingLevel", "hookDensity", "informationFrontLoading"],
      preferredPatterns: ["scene_entry", "conflict_entry", "judgement_first"],
    },
    viralTargets: {
      titleGoal: "标题承诺必须在前 200 字兑现一部分。",
      hookGoal: "第一句必须避开禁区，并给出具体场景、冲突或判断。",
      shareTriggerGoal: "改写后应让读者愿意把这篇转给同样卡在开头的人。",
    },
    stageArtifactPayloads: {
      outlinePlanning: {
        workingTitle: seed.title,
        openingHook: seed.badOpening,
        openingOptions: [
          {
            text: seed.goodOpening,
            patternCode: "scene_entry",
            patternLabel: "场景切入",
            hookScore: 86,
            qualityCeiling: "A",
            forbiddenHits: [],
            isRecommended: true,
            recommendReason: "具体动作先行，能快速压住 AI 腔。",
          },
        ],
      },
      deepWriting: {
        openingStrategy: seed.badOpening,
        openingPatternLabel: "现象信号",
        mustUseFacts: [
          "前 200 字决定读者是否继续读。",
          "禁区开头需要改为具体场景、冲突反差或判断前置。",
        ],
      },
    },
    referenceGoodOutput: seed.goodOpening,
    referenceBadPatterns: [seed.badOpening, seed.forbiddenPattern],
  };
}

async function ensurePlan21OpeningOptimizerEvaluationSeed() {
  const db = getDatabase();
  const dataset = await db.queryOne<{ id: number; status: string }>(
    "SELECT id, status FROM writing_eval_datasets WHERE code = ?",
    [PLAN21_OPENING_OPTIMIZER_DATASET_CODE],
  );
  if (!dataset) {
    return;
  }

  const now = new Date().toISOString();
  for (let index = 0; index < PLAN21_OPENING_OPTIMIZER_SEED_CASE_COUNT; index += 1) {
    const spec = buildPlan21OpeningOptimizerSeedCase(index);
    const exists = await db.queryOne<{ id: number }>(
      "SELECT id FROM writing_eval_cases WHERE dataset_id = ? AND task_code = ?",
      [dataset.id, spec.taskCode],
    );
    if (exists) {
      continue;
    }
    await db.exec(
      `INSERT INTO writing_eval_cases (
        dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, input_payload_json, expected_constraints_json,
        viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dataset.id,
        spec.taskCode,
        spec.taskType,
        spec.topicTitle,
        "seed",
        PLAN21_OPENING_OPTIMIZER_DATASET_CODE,
        "Plan21 开头专项默认样本",
        spec.inputPayload,
        spec.expectedConstraints,
        spec.viralTargets,
        spec.stageArtifactPayloads,
        spec.referenceGoodOutput,
        spec.referenceBadPatterns,
        spec.difficultyLevel,
        true,
        now,
        now,
      ],
    );
  }

  const sampleCount = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM writing_eval_cases WHERE dataset_id = ?",
    [dataset.id],
  );
  await db.exec(
    "UPDATE writing_eval_datasets SET sample_count = ?, status = ?, updated_at = ? WHERE id = ?",
    [sampleCount?.count ?? 0, "active", now, dataset.id],
  );

  const promptVersions = await db.query<{ prompt_id: string; version: string; is_active: number | boolean }>(
    `SELECT prompt_id, version, is_active
     FROM prompt_versions
     WHERE prompt_id = ?
     ORDER BY is_active DESC, created_at DESC`,
    ["opening_optimizer"],
  );
  const activeOpeningPrompt = promptVersions.find((item) => Boolean(item.is_active))
    ?? promptVersions[0]
    ?? null;
  const promptRef = activeOpeningPrompt
    ? `${activeOpeningPrompt.prompt_id}@${activeOpeningPrompt.version}`
    : "opening_optimizer@v1.0.0";
  const scheduleExists = await db.queryOne<{ id: number }>(
    "SELECT id FROM writing_eval_run_schedules WHERE dataset_id = ? AND name = ?",
    [dataset.id, PLAN21_OPENING_OPTIMIZER_SCHEDULE_NAME],
  );
  if (scheduleExists) {
    return;
  }
  await db.exec(
    `INSERT INTO writing_eval_run_schedules (
      name, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
      experiment_mode, trigger_mode, agent_strategy, decision_mode, priority, cadence_hours, next_run_at, last_dispatched_at, last_run_id, last_error,
      is_enabled, summary, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      PLAN21_OPENING_OPTIMIZER_SCHEDULE_NAME,
      dataset.id,
      "prompt_version",
      promptRef,
      "prompt_version",
      promptRef,
      "lead_only",
      "scheduled",
      "lead_template",
      "manual_review",
      90,
      24,
      now,
      null,
      null,
      null,
      true,
      "plan21 opening_optimizer 默认自动评测闭环；人工审核决议，先验证闭环可触发。",
      null,
      now,
      now,
    ],
  );
}

async function normalizePlan17TopicItemCaseTaskTypes(datasetCodes: string[]) {
  if (datasetCodes.length === 0) {
    return;
  }
  const db = getDatabase();
  const rows = await db.query<{ id: number; code: string; name: string; description: string | null }>(
    `SELECT id, code, name, description
     FROM writing_eval_datasets
     WHERE code IN (${datasetCodes.map(() => "?").join(", ")})`,
    datasetCodes,
  );
  if (rows.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  for (const row of rows) {
    const focus = inferWritingEvalDatasetFocus(row);
    if (focus.key === "general") {
      continue;
    }
    const normalizedTaskType = resolveWritingEvalTaskTypeForDatasetFocus({
      datasetFocusKey: focus.key,
      baseTaskType: "series_observation",
      sourceType: "topic_item",
    });
    if (normalizedTaskType === "series_observation") {
      continue;
    }
    await db.exec(
      `UPDATE writing_eval_cases
       SET task_type = ?, updated_at = ?
       WHERE dataset_id = ?
         AND source_type = 'topic_item'
         AND task_type <> ?`,
      [normalizedTaskType, now, row.id, normalizedTaskType],
    );
  }
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
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
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

function mapCaseQualityLabel(row: WritingEvalCaseQualityLabelRow) {
  return {
    id: row.id,
    caseId: row.case_id,
    datasetId: row.dataset_id,
    focusKey: row.focus_key,
    taskCode: row.task_code ?? null,
    taskType: row.task_type ?? null,
    topicTitle: row.topic_title ?? null,
    sourceType: row.source_type ?? null,
    sourceRef: row.source_ref ?? null,
    sourceLabel: row.source_label ?? null,
    sourceUrl: row.source_url ?? null,
    difficultyLevel: row.difficulty_level ?? null,
    strategyManualScore: row.strategy_manual_score,
    evidenceExpectedTags: uniqueStrings(parseJsonArray(row.evidence_expected_tags_json), 24),
    evidenceDetectedTags: uniqueStrings(parseJsonArray(row.evidence_detected_tags_json), 24),
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeQualityLabelTags(values: string | unknown[] | null | undefined) {
  return uniqueStrings(
    (Array.isArray(values) ? values : parseJsonArray(values))
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    24,
  );
}

function keepLatestQualityLabelsByCase(rows: WritingEvalCaseQualityLabelRow[]) {
  const latestByCaseId = new Map<number, WritingEvalCaseQualityLabelRow>();
  for (const row of [...rows].sort((left, right) => {
    const updatedAtCompare = String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
    if (updatedAtCompare !== 0) {
      return updatedAtCompare;
    }
    return right.id - left.id;
  })) {
    if (!latestByCaseId.has(row.case_id)) {
      latestByCaseId.set(row.case_id, row);
    }
  }
  return Array.from(latestByCaseId.values());
}

function getWritingEvalResultStatus(judgePayloadJson: string | Record<string, unknown> | null | undefined) {
  const payload = parseJsonObject(judgePayloadJson);
  const topLevelStatus = String(payload.status || "").trim();
  if (topLevelStatus) {
    return topLevelStatus;
  }
  const hybridJudge = getRecord(payload.hybridJudge);
  return String(hybridJudge.status || "").trim();
}

function normalizeOptionalScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapRun(row: WritingOptimizationRunRow) {
  const scoreSummary = parseJsonObject(row.score_summary_json);
  const suggestion = buildPromotionDecision(scoreSummary);
  return {
    id: row.id,
    runCode: row.run_code,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name ?? null,
    sourceScheduleId: typeof row.source_schedule_id === "number" ? row.source_schedule_id : null,
    sourceScheduleName: row.source_schedule_name ?? null,
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
    lastRunScoreSummary: parseJsonObject(row.last_run_score_summary_json),
    lastRunStartedAt: row.last_run_started_at ?? null,
    lastRunFinishedAt: row.last_run_finished_at ?? null,
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

function getWritingEvalJobRunFilterSql(runId: number) {
  const db = getDatabase();
  if (db.type === "postgres") {
    return {
      clause: "payload_json ->> 'runId' = ?",
      params: [String(runId)] as unknown[],
    };
  }

  return {
    clause: "(payload_json LIKE ? OR payload_json LIKE ?)",
    params: [`%\"runId\":${runId}%`, `%\"runId\": ${runId}%`] as unknown[],
  };
}

function getWritingEvalStageMetaForJobType(jobType: string) {
  if (jobType === "writingEvalScore") {
    return { stageKey: "scoring", stageLabel: "评分" };
  }
  if (jobType === "writingEvalPromote") {
    return { stageKey: "promotion", stageLabel: "决议" };
  }
  return { stageKey: "generation", stageLabel: "生成" };
}

const WRITING_EVAL_DAY_MS = 24 * 60 * 60 * 1000;

function getPositiveInteger(value: unknown) {
  const resolved = typeof value === "string" ? Number(value) : value;
  return typeof resolved === "number" && Number.isInteger(resolved) && resolved > 0 ? Number(resolved) : null;
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getWindowRange(days: number, offsetDays = 0, now = new Date()) {
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  const endMs = anchor.getTime() - offsetDays * WRITING_EVAL_DAY_MS + WRITING_EVAL_DAY_MS;
  const startMs = endMs - days * WRITING_EVAL_DAY_MS;
  return { startMs, endMs };
}

function isWithinWindow(value: string | null | undefined, startMs: number, endMs: number) {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && ts >= startMs && ts < endMs;
}

function getDurationSeconds(startValue: string | null | undefined, endValue: string | null | undefined) {
  if (!startValue || !endValue) return null;
  const startMs = new Date(startValue).getTime();
  const endMs = new Date(endValue).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 1000;
}

function buildWritingEvalExecutionInsights(input: {
  jobRows: WritingEvalJobQueueRow[];
  retryAuditRows: WritingEvalRetryAuditAggregateRow[];
}) {
  const jobs = input.jobRows
    .map((row) => {
      const payload = parseJsonObject(row.payload_json);
      const stage = getWritingEvalStageMetaForJobType(row.job_type);
      const runId = getPositiveInteger(payload.runId);
      const runCode = getTrimmedString(payload.runCode) || null;
      const finishedAt = row.status === "completed" || row.status === "failed" ? row.updated_at : null;
      return {
        id: row.id,
        jobType: row.job_type,
        stageKey: stage.stageKey,
        stageLabel: stage.stageLabel,
        runId,
        runCode,
        status: row.status,
        queuedAt: row.created_at,
        startedAt: row.locked_at,
        finishedAt,
        updatedAt: row.updated_at,
        lastError: row.last_error,
        retryCount: Number(row.attempts || 0),
        durationSeconds: getDurationSeconds(row.locked_at, finishedAt),
      };
    })
    .filter((item) => item.runId !== null || item.runCode);

  const retries = input.retryAuditRows.map((row) => {
    const payload = parseJsonObject(row.payload_json);
    return {
      id: row.id,
      runId: getPositiveInteger(row.target_id) ?? getPositiveInteger(payload.runId),
      runCode: getTrimmedString(payload.runCode) || null,
      username: row.username,
      createdAt: row.created_at,
      retriedAt: getTrimmedString(payload.retriedAt) || row.created_at,
    };
  });

  function summarizeWindow(days: number, offsetDays = 0, now = new Date()) {
    const { startMs, endMs } = getWindowRange(days, offsetDays, now);
    const windowJobs = jobs.filter((item) => isWithinWindow(item.queuedAt, startMs, endMs));
    const windowRetries = retries.filter((item) => isWithinWindow(item.retriedAt, startMs, endMs));
    return {
      jobCount: windowJobs.length,
      failedJobCount: windowJobs.filter((item) => item.status === "failed").length,
      runningJobCount: windowJobs.filter((item) => item.status === "running").length,
      queuedJobCount: windowJobs.filter((item) => item.status === "queued").length,
      retryCount: windowRetries.length,
      averageDurationSeconds: averageNumbers(windowJobs.map((item) => item.durationSeconds)),
      stageBreakdown: ["generation", "scoring", "promotion"].map((stageKey) => {
        const stageJobs = windowJobs.filter((item) => item.stageKey === stageKey);
        const stageLabel = stageJobs[0]?.stageLabel ?? getWritingEvalStageMetaForJobType(
          stageKey === "generation" ? "writingEvalRun" : stageKey === "scoring" ? "writingEvalScore" : "writingEvalPromote",
        ).stageLabel;
        return {
          stageKey,
          stageLabel,
          jobCount: stageJobs.length,
          failedJobCount: stageJobs.filter((item) => item.status === "failed").length,
          retryCount: stageJobs.reduce((sum, item) => sum + item.retryCount, 0),
          averageDurationSeconds: averageNumbers(stageJobs.map((item) => item.durationSeconds)),
        };
      }),
    };
  }

  const weeklyBuckets = Array.from({ length: 6 }, (_, index) => {
    const offsetDays = (6 - index - 1) * 7;
    const { startMs, endMs } = getWindowRange(7, offsetDays);
    const windowJobs = jobs.filter((item) => isWithinWindow(item.queuedAt, startMs, endMs));
    const windowRetries = retries.filter((item) => isWithinWindow(item.retriedAt, startMs, endMs));
    const startKey = new Date(startMs).toISOString().slice(5, 10);
    const endKey = new Date(endMs - 1).toISOString().slice(5, 10);
    return {
      label: `${startKey} - ${endKey}`,
      jobCount: windowJobs.length,
      failedJobCount: windowJobs.filter((item) => item.status === "failed").length,
      retryCount: windowRetries.length,
      averageDurationSeconds: averageNumbers(windowJobs.map((item) => item.durationSeconds)),
      generationFailedCount: windowJobs.filter((item) => item.stageKey === "generation" && item.status === "failed").length,
      scoringFailedCount: windowJobs.filter((item) => item.stageKey === "scoring" && item.status === "failed").length,
      promotionFailedCount: windowJobs.filter((item) => item.stageKey === "promotion" && item.status === "failed").length,
    };
  });

  const recentFailures = jobs
    .filter((item) => item.status === "failed")
    .sort((left, right) => new Date(right.finishedAt || right.updatedAt).getTime() - new Date(left.finishedAt || left.updatedAt).getTime())
    .slice(0, 8)
    .map((item) => ({
      jobId: item.id,
      runId: item.runId,
      runCode: item.runCode,
      stageKey: item.stageKey,
      stageLabel: item.stageLabel,
      failedAt: item.finishedAt || item.updatedAt,
      queuedAt: item.queuedAt,
      durationSeconds: item.durationSeconds,
      lastError: item.lastError,
    }));

  const recentRetries = retries
    .slice()
    .sort((left, right) => new Date(right.retriedAt).getTime() - new Date(left.retriedAt).getTime())
    .slice(0, 8);

  return {
    currentWindow: summarizeWindow(7),
    previousWindow: summarizeWindow(7, 7),
    weeklyBuckets,
    recentFailures,
    recentRetries,
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
    !SUPPORTED_WRITING_EVAL_VERSION_TYPES.includes(baseVersionType as (typeof SUPPORTED_WRITING_EVAL_VERSION_TYPES)[number]) ||
    !SUPPORTED_WRITING_EVAL_VERSION_TYPES.includes(candidateVersionType as (typeof SUPPORTED_WRITING_EVAL_VERSION_TYPES)[number])
  ) {
    throw new Error("当前仅支持 prompt_version、fact_check、title_template、lead_template、scoring_profile、layout_strategy 与 apply_command_template 实验");
  }
  if (baseVersionType !== candidateVersionType) {
    throw new Error("一次实验只能比较同一类型的可变对象");
  }

  const db = getDatabase();
  const dataset = await db.queryOne<{ id: number; status: string }>("SELECT id, status FROM writing_eval_datasets WHERE id = ?", [input.datasetId]);
  if (!dataset) {
    throw new Error("评测集不存在");
  }
  if (isPromptBackedWritingEvalVersionType(baseVersionType)) {
    const basePromptRef = resolvePromptBackedWritingEvalVersionRef(baseVersionType, baseVersionRef);
    const candidatePromptRef = resolvePromptBackedWritingEvalVersionRef(candidateVersionType, candidateVersionRef);
    if (basePromptRef.promptId !== candidatePromptRef.promptId) {
      throw new Error("Prompt 实验必须在同一个 prompt 对象内比较不同版本");
    }
    const requiredPromptTargetId = getRequiredPromptTargetIdForExperimentMode(experimentMode);
    if (requiredPromptTargetId && (basePromptRef.promptId !== requiredPromptTargetId || candidatePromptRef.promptId !== requiredPromptTargetId)) {
      throw new Error(
        experimentMode === "title_only"
          ? "标题专项实验只能比较 title_optimizer / title_template 版本"
          : "开头专项实验只能比较 opening_optimizer / lead_template 版本",
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
  await ensureWritingEvalDatasetPresets();
  const db = getDatabase();
  const rows = await db.query<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     ORDER BY updated_at DESC, id DESC`,
  );
  const readinessMap = await getWritingEvalDatasetReadinessMap(rows.map((row) => ({ id: row.id, status: row.status })));
  return rows.map((row) => mapDataset(row, readinessMap.get(row.id) ?? getWritingEvalDatasetReadiness([], row.status, row)));
}

export async function getWritingEvalRunSchedules() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<WritingEvalRunScheduleRow>(
    `SELECT s.id, s.name, s.dataset_id, s.base_version_type, s.base_version_ref, s.candidate_version_type, s.candidate_version_ref,
            s.experiment_mode, s.trigger_mode, s.agent_strategy, s.decision_mode, s.priority, s.cadence_hours, s.next_run_at, s.last_dispatched_at, s.last_run_id, s.last_error,
            s.is_enabled, s.summary, s.created_by, s.created_at, s.updated_at,
            d.name AS dataset_name, d.status AS dataset_status, r.run_code AS last_run_code, r.status AS last_run_status,
            r.score_summary_json AS last_run_score_summary_json, r.started_at AS last_run_started_at, r.finished_at AS last_run_finished_at
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
            d.name AS dataset_name, d.status AS dataset_status, r.run_code AS last_run_code, r.status AS last_run_status,
            r.score_summary_json AS last_run_score_summary_json, r.started_at AS last_run_started_at, r.finished_at AS last_run_finished_at
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
      sourceScheduleId: schedule.id,
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
  return mapDataset(created, getWritingEvalDatasetReadiness([], created.status, created));
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
    `SELECT id, dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE dataset_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [datasetId],
  );
  return rows.map(mapCase);
}

export async function getWritingEvalCaseQualityLabels(input?: {
  datasetId?: number | null;
  focusKey?: string | null;
  limit?: number;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const clauses: string[] = [];
  const params: Array<number | string> = [];
  if (Number.isInteger(input?.datasetId) && Number(input?.datasetId) > 0) {
    clauses.push("label.dataset_id = ?");
    params.push(Number(input?.datasetId));
  }
  if (String(input?.focusKey || "").trim()) {
    clauses.push("label.focus_key = ?");
    params.push(String(input?.focusKey).trim());
  }
  const limit = Math.min(Math.max(Number(input?.limit ?? 200) || 200, 1), 1000);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.query<WritingEvalCaseQualityLabelRow>(
    `SELECT label.id, label.case_id, label.dataset_id, label.focus_key, label.strategy_manual_score, label.evidence_expected_tags_json, label.evidence_detected_tags_json,
            label.notes, label.created_by, label.created_at, label.updated_at,
            c.task_code, c.task_type, c.topic_title, c.source_type, c.source_ref, c.source_label, c.source_url, c.difficulty_level
     FROM writing_eval_case_quality_labels label
     INNER JOIN writing_eval_cases c ON c.id = label.case_id
     ${where}
     ORDER BY label.updated_at DESC, label.id DESC
     LIMIT ?`,
    [...params, limit],
  );
  return rows.map(mapCaseQualityLabel);
}

export async function upsertWritingEvalCaseQualityLabel(input: {
  caseId: number;
  strategyManualScore?: number | null;
  evidenceExpectedTags?: string[] | null;
  evidenceDetectedTags?: string[] | null;
  notes?: string | null;
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.caseId) || input.caseId <= 0) throw new Error("评测样本无效");
  const db = getDatabase();
  const row = await db.queryOne<{
    case_id: number;
    dataset_id: number;
    task_code: string;
    dataset_code: string | null;
    dataset_name: string | null;
    dataset_description: string | null;
  }>(
    `SELECT c.id AS case_id, c.dataset_id, c.task_code, d.code AS dataset_code, d.name AS dataset_name, d.description AS dataset_description
     FROM writing_eval_cases c
     INNER JOIN writing_eval_datasets d ON d.id = c.dataset_id
     WHERE c.id = ?`,
    [input.caseId],
  );
  if (!row) throw new Error("评测样本不存在");
  const focus = inferWritingEvalDatasetFocus({
    code: row.dataset_code,
    name: row.dataset_name,
    description: row.dataset_description,
  });
  if (!isPlan17WritingEvalFocusKey(focus.key)) {
    throw new Error("仅 plan17 质量桶支持人工标注");
  }
  const strategyManualScore = normalizeOptionalScore(input.strategyManualScore);
  const evidenceExpectedTags = normalizeQualityLabelTags(input.evidenceExpectedTags ?? []);
  const evidenceDetectedTags = normalizeQualityLabelTags(input.evidenceDetectedTags ?? []);
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: number; created_at: string }>(
    "SELECT id, created_at FROM writing_eval_case_quality_labels WHERE case_id = ?",
    [input.caseId],
  );
  if (existing) {
    await db.exec(
      `UPDATE writing_eval_case_quality_labels
       SET dataset_id = ?, focus_key = ?, strategy_manual_score = ?, evidence_expected_tags_json = ?, evidence_detected_tags_json = ?,
           notes = ?, created_by = ?, updated_at = ?
       WHERE case_id = ?`,
      [
        row.dataset_id,
        focus.key,
        strategyManualScore,
        JSON.stringify(evidenceExpectedTags),
        JSON.stringify(evidenceDetectedTags),
        String(input.notes || "").trim() || null,
        input.createdBy ?? null,
        now,
        input.caseId,
      ],
    );
  } else {
    await db.exec(
      `INSERT INTO writing_eval_case_quality_labels (
        case_id, dataset_id, focus_key, strategy_manual_score, evidence_expected_tags_json, evidence_detected_tags_json,
        notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.caseId,
        row.dataset_id,
        focus.key,
        strategyManualScore,
        JSON.stringify(evidenceExpectedTags),
        JSON.stringify(evidenceDetectedTags),
        String(input.notes || "").trim() || null,
        input.createdBy ?? null,
        now,
        now,
      ],
    );
  }
  const created = await db.queryOne<WritingEvalCaseQualityLabelRow>(
    `SELECT label.id, label.case_id, label.dataset_id, label.focus_key, label.strategy_manual_score, label.evidence_expected_tags_json, label.evidence_detected_tags_json,
            label.notes, label.created_by, label.created_at, label.updated_at,
            c.task_code, c.task_type, c.topic_title, c.source_type, c.source_ref, c.source_label, c.source_url, c.difficulty_level
     FROM writing_eval_case_quality_labels label
     INNER JOIN writing_eval_cases c ON c.id = label.case_id
     WHERE label.case_id = ?`,
    [input.caseId],
  );
  if (!created) {
    throw new Error("写入质量人工标注失败");
  }
  await appendAuditLog({
    userId: input.createdBy ?? null,
    action: "writing_eval_case_quality_label_upsert",
    targetType: "writing_eval_case",
    targetId: input.caseId,
    payload: {
      datasetId: row.dataset_id,
      taskCode: row.task_code,
      focusKey: focus.key,
      strategyManualScore,
      evidenceExpectedTagCount: evidenceExpectedTags.length,
      evidenceDetectedTagCount: evidenceDetectedTags.length,
    },
  });
  return mapCaseQualityLabel(created);
}

export async function getWritingEvalArticleImportOptions(limit = 24) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidateRows = await db.query<WritingEvalArticleImportRow>(
    `SELECT a.id, a.user_id, a.title, a.status, a.markdown_content, a.series_id, a.updated_at, s.name AS series_name
     FROM articles a
     LEFT JOIN series s ON s.id = a.series_id
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT ?`,
    [Math.max(limit * 3, limit)],
  );
  if (candidateRows.length === 0) {
    return [];
  }

  const articleIds = candidateRows.map((row) => row.id);
  const taskCodes = articleIds.map((articleId) => `article-${articleId}`);
  const articlePlaceholders = articleIds.map(() => "?").join(", ");
  const taskCodePlaceholders = taskCodes.map(() => "?").join(", ");
  const [artifactRows, importedRows] = await Promise.all([
    db.query<WritingEvalArticleArtifactRow>(
      `SELECT article_id, stage_code, payload_json
       FROM article_stage_artifacts
       WHERE article_id IN (${articlePlaceholders})
       ORDER BY updated_at DESC, id DESC`,
      articleIds,
    ),
    db.query<{ dataset_id: number; task_code: string }>(
      `SELECT dataset_id, task_code
       FROM writing_eval_cases
       WHERE task_code IN (${taskCodePlaceholders})`,
      taskCodes,
    ),
  ]);

  const artifactRowsByArticleId = new Map<number, WritingEvalArticleArtifactRow[]>();
  for (const row of artifactRows) {
    const current = artifactRowsByArticleId.get(row.article_id) ?? [];
    current.push(row);
    artifactRowsByArticleId.set(row.article_id, current);
  }
  const importedDatasetIdsByTaskCode = new Map<string, number[]>();
  for (const row of importedRows) {
    const current = importedDatasetIdsByTaskCode.get(row.task_code) ?? [];
    current.push(row.dataset_id);
    importedDatasetIdsByTaskCode.set(row.task_code, current);
  }

  return candidateRows
    .map((row) => {
      const articleArtifactRows = artifactRowsByArticleId.get(row.id) ?? [];
      const artifactPayloads = Object.fromEntries(
        articleArtifactRows.map((item) => [item.stage_code, parseJsonObject(item.payload_json)]),
      );
      const draft = buildWritingEvalArticleCaseDraft({
        article: row,
        artifactPayloads,
      });
      if (!draft.hasMarkdown && draft.stageCodes.length === 0) {
        return null;
      }
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        seriesName: row.series_name,
        updatedAt: row.updated_at,
        hasMarkdown: draft.hasMarkdown,
        stageCodes: draft.stageCodes,
        suggestedTaskType: draft.taskType,
        suggestedDifficultyLevel: draft.difficultyLevel,
        sourceFactCount: draft.sourceFactCount,
        knowledgeCardCount: draft.knowledgeCardCount,
        historyReferenceCount: draft.historyReferenceCount,
        alreadyImportedDatasetIds: importedDatasetIdsByTaskCode.get(draft.taskCode) ?? [],
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: number;
        title: string;
        status: string;
        seriesName: string | null;
        updatedAt: string;
        hasMarkdown: boolean;
        stageCodes: string[];
        suggestedTaskType: string;
        suggestedDifficultyLevel: string;
        sourceFactCount: number;
        knowledgeCardCount: number;
        historyReferenceCount: number;
        alreadyImportedDatasetIds: number[];
      } => Boolean(item),
    )
    .slice(0, limit);
}

export async function getWritingEvalKnowledgeCardImportOptions(limit = 24) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidateRows = await db.query<WritingEvalKnowledgeCardImportRow>(
    `SELECT kc.id, kc.user_id, kc.card_type, kc.title, kc.summary, kc.key_facts_json, kc.open_questions_json,
            kc.conflict_flags_json, kc.latest_change_summary, kc.confidence_score, kc.status,
            kc.last_compiled_at, kc.last_verified_at, kc.updated_at, u.username AS owner_username
     FROM knowledge_cards kc
     LEFT JOIN users u ON u.id = kc.user_id
     WHERE kc.status <> 'archived'
     ORDER BY
       CASE kc.status
         WHEN 'conflicted' THEN 0
         WHEN 'stale' THEN 1
         WHEN 'draft' THEN 2
         ELSE 3
       END ASC,
       kc.updated_at DESC,
       kc.id DESC
     LIMIT ?`,
    [Math.max(limit * 3, limit)],
  );
  if (candidateRows.length === 0) {
    return [];
  }

  const cardIds = candidateRows.map((row) => row.id);
  const taskCodes = cardIds.map((cardId) => `knowledge-card-${cardId}`);
  const cardPlaceholders = cardIds.map(() => "?").join(", ");
  const taskCodePlaceholders = taskCodes.map(() => "?").join(", ");
  const [fragmentRows, linkRows, importedRows] = await Promise.all([
    db.query<WritingEvalKnowledgeCardFragmentRow>(
      `SELECT k.knowledge_card_id, k.fragment_id, f.distilled_content
       FROM knowledge_card_fragments k
       INNER JOIN fragments f ON f.id = k.fragment_id
       WHERE k.knowledge_card_id IN (${cardPlaceholders})
       ORDER BY k.knowledge_card_id ASC, k.id ASC`,
      cardIds,
    ),
    db.query<WritingEvalKnowledgeCardLinkRow>(
      `SELECT source_card_id, target_card_id, link_type
       FROM knowledge_card_links
       WHERE source_card_id IN (${cardPlaceholders}) OR target_card_id IN (${cardPlaceholders})
       ORDER BY id ASC`,
      [...cardIds, ...cardIds],
    ),
    db.query<{ dataset_id: number; task_code: string }>(
      `SELECT dataset_id, task_code
       FROM writing_eval_cases
       WHERE task_code IN (${taskCodePlaceholders})`,
      taskCodes,
    ),
  ]);
  const linkedCardIds = Array.from(new Set(linkRows.flatMap((item) => [item.source_card_id, item.target_card_id]).filter((id) => !cardIds.includes(id))));
  const linkedCards = linkedCardIds.length > 0
    ? await db.query<WritingEvalKnowledgeCardLinkedCardRow>(
        `SELECT id, title, summary, card_type, status
         FROM knowledge_cards
         WHERE id IN (${linkedCardIds.map(() => "?").join(", ")})`,
        linkedCardIds,
      )
    : [];
  const linkedCardMap = new Map(linkedCards.map((item) => [item.id, item]));
  const sourceFragmentsByCardId = new Map<number, Array<{ id: number; distilledContent: string }>>();
  for (const row of fragmentRows) {
    const current = sourceFragmentsByCardId.get(row.knowledge_card_id) ?? [];
    current.push({ id: row.fragment_id, distilledContent: row.distilled_content });
    sourceFragmentsByCardId.set(row.knowledge_card_id, current);
  }
  const relatedCardsByCardId = new Map<number, Array<{ id: number; title: string; summary: string | null; cardType: string; status: string; linkType: string }>>();
  for (const row of linkRows) {
    if (cardIds.includes(row.source_card_id)) {
      const linked = linkedCardMap.get(row.target_card_id);
      if (linked) {
        const current = relatedCardsByCardId.get(row.source_card_id) ?? [];
        current.push({ id: linked.id, title: linked.title, summary: linked.summary, cardType: linked.card_type, status: linked.status, linkType: row.link_type });
        relatedCardsByCardId.set(row.source_card_id, current);
      }
    }
    if (cardIds.includes(row.target_card_id)) {
      const linked = linkedCardMap.get(row.source_card_id);
      if (linked) {
        const current = relatedCardsByCardId.get(row.target_card_id) ?? [];
        current.push({ id: linked.id, title: linked.title, summary: linked.summary, cardType: linked.card_type, status: linked.status, linkType: row.link_type });
        relatedCardsByCardId.set(row.target_card_id, current);
      }
    }
  }
  const importedDatasetIdsByTaskCode = new Map<string, number[]>();
  for (const row of importedRows) {
    const current = importedDatasetIdsByTaskCode.get(row.task_code) ?? [];
    current.push(row.dataset_id);
    importedDatasetIdsByTaskCode.set(row.task_code, current);
  }

  return candidateRows
    .map((row) => {
      const draft = buildWritingEvalKnowledgeCardCaseDraft({
        card: row,
        sourceFragments: sourceFragmentsByCardId.get(row.id) ?? [],
        relatedCards: relatedCardsByCardId.get(row.id) ?? [],
      });
      if (draft.sourceFactCount === 0 && !hasFilledString(row.summary)) {
        return null;
      }
      return {
        id: row.id,
        title: row.title,
        cardType: row.card_type,
        status: row.status,
        ownerUsername: row.owner_username ?? null,
        updatedAt: row.updated_at,
        confidenceScore: row.confidence_score,
        suggestedTaskType: draft.taskType,
        suggestedDifficultyLevel: draft.difficultyLevel,
        sourceFactCount: draft.sourceFactCount,
        knowledgeCardCount: draft.knowledgeCardCount,
        historyReferenceCount: draft.historyReferenceCount,
        openQuestionCount: draft.openQuestionCount,
        conflictFlagCount: draft.conflictFlagCount,
        alreadyImportedDatasetIds: importedDatasetIdsByTaskCode.get(draft.taskCode) ?? [],
      };
    })
    .filter((item): item is {
      id: number;
      title: string;
      cardType: string;
      status: string;
      ownerUsername: string | null;
      updatedAt: string;
      confidenceScore: number;
      suggestedTaskType: string;
      suggestedDifficultyLevel: string;
      sourceFactCount: number;
      knowledgeCardCount: number;
      historyReferenceCount: number;
      openQuestionCount: number;
      conflictFlagCount: number;
      alreadyImportedDatasetIds: number[];
    } => Boolean(item))
    .slice(0, limit);
}

async function getWritingEvalTopicKnowledgeCandidates(limit = 160) {
  const db = getDatabase();
  const rows = await db.query<WritingEvalTopicKnowledgeCandidateRow>(
    `SELECT kc.id, kc.title, kc.summary, kc.latest_change_summary, kc.overturned_judgements_json,
            kc.card_type, kc.status, kc.confidence_score, u.username AS owner_username
     FROM knowledge_cards kc
     LEFT JOIN users u ON u.id = kc.user_id
     WHERE kc.status <> 'archived'
     ORDER BY kc.updated_at DESC, kc.id DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    latestChangeSummary: item.latest_change_summary,
    overturnedJudgements: parseJsonArray(item.overturned_judgements_json),
    cardType: item.card_type,
    status: item.status,
    confidenceScore: item.confidence_score,
    ownerUsername: item.owner_username,
  }));
}

export async function getWritingEvalTopicImportOptions(limit = 24, datasetId?: number | null) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidateRows = await db.query<WritingEvalTopicImportRow>(
    `SELECT ti.id, ti.owner_user_id, ti.source_name, ti.title, ti.summary, ti.emotion_labels_json,
            ti.angle_options_json, ti.source_url, ti.published_at, ts.source_type, ts.priority AS source_priority
     FROM topic_items ti
     LEFT JOIN topic_sources ts
       ON ts.name = ti.source_name
      AND (
        (ti.owner_user_id IS NULL AND ts.owner_user_id IS NULL)
        OR ti.owner_user_id = ts.owner_user_id
      )
     ORDER BY COALESCE(ti.published_at, ti.created_at) DESC, ti.id DESC
     LIMIT ?`,
    [Math.max(limit * 3, limit)],
  );
  if (candidateRows.length === 0) {
    return [];
  }

  const eligibleRows = candidateRows.filter((row) => !isTopicItemTemplatePolluted(row));
  if (eligibleRows.length === 0) {
    return [];
  }

  const topicRefs = eligibleRows.map((row) => `topic_item:${row.id}`);
  const topicRefPlaceholders = topicRefs.map(() => "?").join(", ");
  const [knowledgeCandidates, importedRows] = await Promise.all([
    getWritingEvalTopicKnowledgeCandidates(),
    db.query<{ dataset_id: number; source_ref: string; task_code: string }>(
      `SELECT dataset_id, source_ref, task_code
       FROM writing_eval_cases
       WHERE source_type = 'topic_item'
         AND source_ref IN (${topicRefPlaceholders})`,
      topicRefs,
    ),
  ]);
  const importedTaskCodesBySourceRef = new Map<string, Map<number, Set<string>>>();
  for (const row of importedRows) {
    const datasetMap = importedTaskCodesBySourceRef.get(row.source_ref) ?? new Map<number, Set<string>>();
    const taskCodes = datasetMap.get(row.dataset_id) ?? new Set<string>();
    taskCodes.add(row.task_code);
    datasetMap.set(row.dataset_id, taskCodes);
    importedTaskCodesBySourceRef.set(row.source_ref, datasetMap);
  }

  const topicOptions = eligibleRows.map((row) => {
      const matchedCards = matchTopicToKnowledgeCards(row.title, knowledgeCandidates, 3);
      const sourceRef = `topic_item:${row.id}`;
      const draftVariants = buildWritingEvalTopicCaseDrafts({
        topic: row,
        matchedCards,
      });
      if (draftVariants.length === 0 || ((draftVariants[0]?.sourceFactCount ?? 0) === 0 && !hasFilledString(row.summary))) {
        return null;
      }
      const datasetMap = importedTaskCodesBySourceRef.get(sourceRef) ?? new Map<number, Set<string>>();
      const fullyImportedDatasetIds = Array.from(datasetMap.entries())
        .filter(([currentDatasetId, taskCodes]) => {
          const normalizedTaskCodes = normalizeTopicVariantTaskCodes(row.id, taskCodes);
          return draftVariants.every((draft) => normalizedTaskCodes.has(draft.taskCode));
        })
        .map(([currentDatasetId]) => currentDatasetId);
      const nextDraft =
        Number.isInteger(datasetId) && Number(datasetId) > 0
          ? pickNextWritingEvalTopicCaseDraft({
              topic: row,
              matchedCards,
              existingTaskCodes: normalizeTopicVariantTaskCodes(row.id, datasetMap.get(Number(datasetId)) ?? []),
            })
          : draftVariants[0];
      if (!nextDraft) {
        return null;
      }
      return {
        id: row.id,
        taskCode: nextDraft.taskCode,
        title: nextDraft.topicTitle,
        subtitle: nextDraft.variantLabel || `${draftVariants.length} 个高价值变体`,
        sourceName: row.source_name,
        sourceType: row.source_type ?? "news",
        sourcePriority: row.source_priority ?? null,
        publishedAt: row.published_at,
        suggestedTaskType: nextDraft.taskType,
        suggestedDifficultyLevel: nextDraft.difficultyLevel,
        sourceFactCount: nextDraft.sourceFactCount,
        knowledgeCardCount: nextDraft.knowledgeCardCount,
        historyReferenceCount: nextDraft.historyReferenceCount,
        emotionLabelCount: nextDraft.emotionLabelCount,
        angleOptionCount: nextDraft.angleOptionCount,
        variantCode: nextDraft.variantCode,
        variantLabel: nextDraft.variantLabel,
        totalVariantCount: draftVariants.length,
        alreadyImportedDatasetIds: fullyImportedDatasetIds,
      };
    });
  return topicOptions
    .filter((item): item is NonNullable<(typeof topicOptions)[number]> => item !== null)
    .slice(0, limit);
}

export async function getWritingEvalFragmentImportOptions(limit = 24) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidateRows = await db.query<WritingEvalFragmentImportRow>(
    `SELECT id, user_id, source_type, title, raw_content, distilled_content, source_url, screenshot_path, created_at
     FROM fragments
     WHERE TRIM(COALESCE(distilled_content, '')) <> ''
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [Math.max(limit * 3, limit)],
  );
  if (candidateRows.length === 0) {
    return [];
  }

  const fragmentIds = candidateRows.map((row) => row.id);
  const taskCodes = fragmentIds.map((fragmentId) => `fragment-${fragmentId}`);
  const fragmentPlaceholders = fragmentIds.map(() => "?").join(", ");
  const taskCodePlaceholders = taskCodes.map(() => "?").join(", ");
  const [linkedCardRows, importedRows] = await Promise.all([
    db.query<WritingEvalFragmentKnowledgeCardRow>(
      `SELECT k.fragment_id, kc.id AS knowledge_card_id, kc.title, kc.summary, kc.card_type, kc.status, kc.confidence_score
       FROM knowledge_card_fragments k
       INNER JOIN knowledge_cards kc ON kc.id = k.knowledge_card_id
       WHERE k.fragment_id IN (${fragmentPlaceholders})
       ORDER BY k.fragment_id ASC, kc.updated_at DESC, kc.id DESC`,
      fragmentIds,
    ),
    db.query<{ dataset_id: number; task_code: string }>(
      `SELECT dataset_id, task_code
       FROM writing_eval_cases
       WHERE task_code IN (${taskCodePlaceholders})`,
      taskCodes,
    ),
  ]);
  const linkedCardsByFragmentId = new Map<number, Array<{ id: number; title: string; summary: string | null; cardType: string; status: string; confidenceScore: number }>>();
  for (const row of linkedCardRows) {
    const current = linkedCardsByFragmentId.get(row.fragment_id) ?? [];
    current.push({
      id: row.knowledge_card_id,
      title: row.title,
      summary: row.summary,
      cardType: row.card_type,
      status: row.status,
      confidenceScore: row.confidence_score,
    });
    linkedCardsByFragmentId.set(row.fragment_id, current);
  }
  const importedDatasetIdsByTaskCode = new Map<string, number[]>();
  for (const row of importedRows) {
    const current = importedDatasetIdsByTaskCode.get(row.task_code) ?? [];
    current.push(row.dataset_id);
    importedDatasetIdsByTaskCode.set(row.task_code, current);
  }

  return candidateRows
    .map((row) => {
      const draft = buildWritingEvalFragmentCaseDraft({
        fragment: row,
        linkedCards: linkedCardsByFragmentId.get(row.id) ?? [],
      });
      return {
        id: row.id,
        title: String(row.title || "").trim() || `素材 #${row.id}`,
        sourceType: row.source_type,
        sourceUrl: row.source_url,
        hasScreenshot: Boolean(row.screenshot_path) || row.source_type === "screenshot",
        createdAt: row.created_at,
        suggestedTaskType: draft.taskType,
        suggestedDifficultyLevel: draft.difficultyLevel,
        sourceFactCount: draft.sourceFactCount,
        knowledgeCardCount: draft.knowledgeCardCount,
        historyReferenceCount: draft.historyReferenceCount,
        alreadyImportedDatasetIds: importedDatasetIdsByTaskCode.get(draft.taskCode) ?? [],
      };
    })
    .slice(0, limit);
}

function buildWritingEvalDatasetRecommendationTargets(input: {
  readiness: WritingEvalDatasetReadiness;
  cases: WritingEvalCaseRow[];
  dataset: Pick<WritingEvalDatasetRow, "code" | "name" | "description">;
}) {
  const enabledCases = input.cases.filter((item) => Boolean(item.is_enabled));
  const enabledCaseCount = input.readiness.enabledCaseCount;
  const datasetFocus = inferWritingEvalDatasetFocus(input.dataset);
  const taskTypes = new Set(enabledCases.map((item) => String(item.task_type || "").trim()).filter(Boolean));
  const difficultyLevels = {
    light: enabledCases.filter((item) => String(item.difficulty_level || "").trim() === "light").length,
    medium: enabledCases.filter((item) => String(item.difficulty_level || "").trim() === "medium").length,
    hard: enabledCases.filter((item) => String(item.difficulty_level || "").trim() === "hard").length,
  };
  const coverageRatio = (value: number) => (enabledCaseCount > 0 ? value / enabledCaseCount : 0);
  const targetTaskTypes = datasetFocus.targetTaskTypes;
  const missingTaskTypes = targetTaskTypes.filter((item) => !taskTypes.has(item));
  const missingDifficultyLevels = (Object.entries(difficultyLevels) as Array<["light" | "medium" | "hard", number]>)
    .filter(([, count]) => count === 0)
    .map(([level]) => level);
  const gapFlags = {
    readerProfile: coverageRatio(input.readiness.coverage.readerProfile) < 0.7,
    targetEmotion: coverageRatio(input.readiness.coverage.targetEmotion) < 0.7,
    sourceFacts: coverageRatio(input.readiness.coverage.sourceFacts) < 0.7,
    knowledgeCards: coverageRatio(input.readiness.coverage.knowledgeCards) < 0.4,
    historyReferences: coverageRatio(input.readiness.coverage.historyReferences) < 0.3,
    titleGoal: coverageRatio(input.readiness.coverage.titleGoal) < 0.7,
    hookGoal: coverageRatio(input.readiness.coverage.hookGoal) < 0.7,
    shareTriggerGoal: coverageRatio(input.readiness.coverage.shareTriggerGoal) < 0.7,
    referenceGoodOutput: coverageRatio(input.readiness.qualityTargets.referenceGoodOutputCount) < 0.5,
    referenceBadPatterns: coverageRatio(input.readiness.qualityTargets.referenceBadPatternsCount) < 0.5,
    mustUseFacts: coverageRatio(input.readiness.qualityTargets.mustUseFactsCount) < 0.7,
  };
  const targetSummary = uniqueStrings(
    [
      datasetFocus.key !== "general" ? `当前聚焦：${datasetFocus.label}` : "",
      enabledCaseCount < 20 ? `样本总量仍偏低（当前 ${enabledCaseCount}/20）` : "",
      missingTaskTypes.length > 0 ? `缺少题型：${missingTaskTypes.join(" / ")}` : "",
      missingDifficultyLevels.length > 0 ? `缺少难度层级：${missingDifficultyLevels.join(" / ")}` : "",
      gapFlags.sourceFacts ? "事实素材覆盖不足" : "",
      gapFlags.knowledgeCards ? "知识卡覆盖偏低" : "",
      gapFlags.historyReferences ? "历史参考覆盖偏低" : "",
      gapFlags.referenceGoodOutput ? "referenceGoodOutput 覆盖不足" : "",
      gapFlags.mustUseFacts ? "mustUseFacts 覆盖不足" : "",
    ],
    8,
  );
  return {
    datasetFocus,
    enabledCaseCount,
    taskTypes,
    missingTaskTypes,
    missingDifficultyLevels,
    gapFlags,
    targetSummary,
  };
}

function normalizeWritingEvalRecommendationSourceType(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized === "article" || normalized === "knowledge_card" || normalized === "topic_item" || normalized === "fragment"
    ? normalized
    : "fragment";
}

function extractWritingEvalRecommendationSourceId(sourceRef: string | null | undefined, fallbackId: number) {
  const match = String(sourceRef || "").trim().match(/:(\d+)$/);
  return match ? Number(match[1]) : fallbackId;
}

function buildWritingEvalDerivedCaseTaskCode(input: {
  existingTaskCodes: Set<string>;
  sourceTaskCode: string;
  derivationCode: string;
}) {
  const base = `${input.sourceTaskCode}--autofill-${input.derivationCode}`;
  if (!input.existingTaskCodes.has(base)) {
    return base;
  }
  let index = 2;
  while (input.existingTaskCodes.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function extractWritingEvalLatentKnowledgeCards(stageArtifactPayloads: Record<string, unknown>) {
  const researchBrief = getRecord(stageArtifactPayloads.researchBrief || stageArtifactPayloads.research_brief);
  const deepWriting = getRecord(stageArtifactPayloads.deepWriting || stageArtifactPayloads.deep_writing);
  return uniqueStrings(
    [
      ...((Array.isArray(researchBrief.matchedKnowledgeCards) ? researchBrief.matchedKnowledgeCards : []) as Array<Record<string, unknown>>)
        .map((item) => String(getRecord(item).title || "").trim()),
      ...((Array.isArray(deepWriting.linkedKnowledgeCards) ? deepWriting.linkedKnowledgeCards : []) as Array<Record<string, unknown>>)
        .map((item) => String(getRecord(item).title || "").trim()),
    ].filter(Boolean),
    8,
  );
}

function extractWritingEvalLatentHistoryReferences(input: {
  inputPayload: Record<string, unknown>;
  stageArtifactPayloads: Record<string, unknown>;
  sourceLabel: string | null;
  sourceUrl: string | null;
}) {
  const researchBrief = getRecord(input.stageArtifactPayloads.researchBrief || input.stageArtifactPayloads.research_brief);
  const deepWriting = getRecord(input.stageArtifactPayloads.deepWriting || input.stageArtifactPayloads.deep_writing);
  const materialBundle = Array.isArray(deepWriting.materialBundle) ? deepWriting.materialBundle : [];
  return uniqueStrings(
    [
      ...getStringArray(input.inputPayload.historyReferences, 12),
      ...getStringArray(input.inputPayload.knowledgeCards, 8),
      ...extractWritingEvalLatentKnowledgeCards(input.stageArtifactPayloads),
      ...((Array.isArray(researchBrief.angleOptions) ? researchBrief.angleOptions : []) as unknown[])
        .map((item) => normalizeTextSnippet(item, 48)),
      ...materialBundle
        .map((item) => {
          const record = getRecord(item);
          return normalizeTextSnippet(record.summary || record.title || "", 48);
        }),
      input.sourceLabel,
      input.sourceUrl ? `来源：${input.sourceUrl}` : "",
    ],
    8,
  );
}

function buildWritingEvalDerivedReferenceGoodOutput(input: {
  topicTitle: string;
  inputPayload: Record<string, unknown>;
  viralTargets: Record<string, unknown>;
}) {
  const sourceFacts = uniqueStrings(getStringArray(input.inputPayload.sourceFacts, 4), 4);
  const historyReferences = uniqueStrings(getStringArray(input.inputPayload.historyReferences, 2), 2);
  const summaryLine =
    sourceFacts[0]
    || String(input.inputPayload.backgroundAwareness || "").trim()
    || String(input.viralTargets.hookGoal || "").trim()
    || `围绕 ${input.topicTitle} 先落判断，再补证据。`;
  const evidenceBlock = sourceFacts.length > 0
    ? sourceFacts.slice(0, 3).map((item) => `- ${item}`).join("\n")
    : "- 先写新增变量，再补关键证据。";
  const historyLine = historyReferences.length > 0 ? `历史参考：${historyReferences.join("；")}` : "历史参考：优先补旧判断为何失效。";
  return [`# ${input.topicTitle}`, "", summaryLine, "", evidenceBlock, "", historyLine].join("\n").trim();
}

function buildWritingEvalDerivedCaseRecommendations(input: {
  cases: WritingEvalCaseRow[];
  targetState: ReturnType<typeof buildWritingEvalDatasetRecommendationTargets>;
  limit: number;
}) {
  const existingTaskCodes = new Set(input.cases.map((item) => item.task_code));
  const derived = input.cases
    .filter((item) => Boolean(item.is_enabled))
    .flatMap((item) => {
      const sourceType = normalizeWritingEvalRecommendationSourceType(item.source_type);
      const sourceId = extractWritingEvalRecommendationSourceId(item.source_ref, item.id);
      const inputPayload = parseJsonObject(item.input_payload_json);
      const stageArtifactPayloads = parseJsonObject(item.stage_artifact_payloads_json);
      const currentKnowledgeCards = uniqueStrings(getStringArray(inputPayload.knowledgeCards, 8), 8);
      const latentKnowledgeCards = extractWritingEvalLatentKnowledgeCards(stageArtifactPayloads);
      const latentHistoryReferences = extractWritingEvalLatentHistoryReferences({
        inputPayload,
        stageArtifactPayloads,
        sourceLabel: item.source_label,
        sourceUrl: item.source_url,
      });
      const availableKnowledgeCards = currentKnowledgeCards.length > 0 ? currentKnowledgeCards : latentKnowledgeCards;
      const availableHistoryReferences = latentHistoryReferences;
      const options: Array<{
        code: string;
        label: string;
        suggestedDifficultyLevel: string;
        sourceFactCount: number;
        knowledgeCardCount: number;
        historyReferenceCount: number;
        referenceGoodOutput: boolean;
      }> = [];

      for (const level of input.targetState.missingDifficultyLevels) {
        if (level !== String(item.difficulty_level || "").trim()) {
          options.push({
            code: `difficulty-${level}`,
            label: level === "light" ? "轻量快切版" : "高压综合版",
            suggestedDifficultyLevel: level,
            sourceFactCount: Math.max(getStringArray(inputPayload.sourceFacts, 12).length, 1),
            knowledgeCardCount: availableKnowledgeCards.length,
            historyReferenceCount: availableHistoryReferences.length,
            referenceGoodOutput: hasFilledString(item.reference_good_output),
          });
        }
      }

      if (input.targetState.gapFlags.knowledgeCards && currentKnowledgeCards.length === 0 && latentKnowledgeCards.length > 0) {
        options.push({
          code: "knowledge-anchor",
          label: "知识卡补锚版",
          suggestedDifficultyLevel: String(item.difficulty_level || "").trim() || "medium",
          sourceFactCount: Math.max(getStringArray(inputPayload.sourceFacts, 12).length, 1),
          knowledgeCardCount: latentKnowledgeCards.length,
          historyReferenceCount: Math.max(availableHistoryReferences.length, latentKnowledgeCards.length),
          referenceGoodOutput: hasFilledString(item.reference_good_output),
        });
      }

      if (input.targetState.gapFlags.historyReferences && getStringArray(inputPayload.historyReferences, 12).length === 0 && availableHistoryReferences.length > 0) {
        options.push({
          code: "history-anchor",
          label: "历史锚点版",
          suggestedDifficultyLevel: String(item.difficulty_level || "").trim() || "medium",
          sourceFactCount: Math.max(getStringArray(inputPayload.sourceFacts, 12).length, 1),
          knowledgeCardCount: availableKnowledgeCards.length,
          historyReferenceCount: availableHistoryReferences.length,
          referenceGoodOutput: hasFilledString(item.reference_good_output),
        });
      }

      if (input.targetState.enabledCaseCount < 20) {
        options.push({
          code: "angle-refresh",
          label: "判断重写版",
          suggestedDifficultyLevel:
            input.targetState.missingDifficultyLevels[0]
            || String(item.difficulty_level || "").trim()
            || "medium",
          sourceFactCount: Math.max(getStringArray(inputPayload.sourceFacts, 12).length, 1),
          knowledgeCardCount: availableKnowledgeCards.length,
          historyReferenceCount: availableHistoryReferences.length,
          referenceGoodOutput: hasFilledString(item.reference_good_output) || input.targetState.gapFlags.referenceGoodOutput,
        });
      }

      return Array.from(new Map(options.map((option) => [option.code, option])).values()).map((option) =>
        scoreWritingEvalImportRecommendationCandidate({
          candidate: {
            sourceType,
            sourceId,
            taskCode: buildWritingEvalDerivedCaseTaskCode({
              existingTaskCodes,
              sourceTaskCode: item.task_code,
              derivationCode: option.code,
            }),
            title: item.topic_title,
            subtitle: uniqueStrings([option.label, item.source_label, item.source_type], 3).join(" · ") || null,
            suggestedTaskType: item.task_type,
            suggestedDifficultyLevel: option.suggestedDifficultyLevel,
            sourceFactCount: option.sourceFactCount,
            knowledgeCardCount: option.knowledgeCardCount,
            historyReferenceCount: option.historyReferenceCount,
            referenceGoodOutput: option.referenceGoodOutput,
            variantCode: undefined,
            variantLabel: null,
            derivation: {
              sourceCaseId: item.id,
              code: option.code,
              label: option.label,
            },
            reasonTags: [],
            score: 0,
          },
          targetState: input.targetState,
        }),
      );
    })
    .filter((item) => item.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || Number(Boolean(right.derivation)) - Number(Boolean(left.derivation))
      || right.sourceFactCount - left.sourceFactCount
      || right.historyReferenceCount - left.historyReferenceCount
      || right.sourceId - left.sourceId)
    .slice(0, Math.max(input.limit, 1));

  return derived;
}

async function createWritingEvalDerivedCaseFromExistingCase(input: {
  datasetId: number;
  sourceCaseId: number;
  derivationCode: string;
  derivationLabel: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE id = ? AND dataset_id = ?`,
    [input.sourceCaseId, input.datasetId],
  );
  if (!row) {
    throw new Error("派生样本的来源 case 不存在");
  }

  const existingTaskCodes = new Set(
    (
      await db.query<{ task_code: string }>(
        "SELECT task_code FROM writing_eval_cases WHERE dataset_id = ?",
        [input.datasetId],
      )
    ).map((item) => item.task_code),
  );
  const inputPayload = parseJsonObject(row.input_payload_json);
  const expectedConstraints = parseJsonObject(row.expected_constraints_json);
  const viralTargets = parseJsonObject(row.viral_targets_json);
  const stageArtifactPayloads = parseJsonObject(row.stage_artifact_payloads_json);
  const latentKnowledgeCards = extractWritingEvalLatentKnowledgeCards(stageArtifactPayloads);
  const latentHistoryReferences = extractWritingEvalLatentHistoryReferences({
    inputPayload,
    stageArtifactPayloads,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
  });
  const nextInputPayload: Record<string, unknown> = {
    ...inputPayload,
    knowledgeCards:
      input.derivationCode === "knowledge-anchor"
        ? uniqueStrings([...getStringArray(inputPayload.knowledgeCards, 8), ...latentKnowledgeCards], 8)
        : inputPayload.knowledgeCards,
    historyReferences:
      input.derivationCode === "history-anchor" || input.derivationCode === "difficulty-hard"
        ? uniqueStrings([...getStringArray(inputPayload.historyReferences, 8), ...latentHistoryReferences], 8)
        : inputPayload.historyReferences,
    backgroundAwareness:
      input.derivationCode === "angle-refresh"
        ? `${String(inputPayload.backgroundAwareness || "").trim() || row.topic_title} 这次优先重写判断入口，不要复述旧摘要。`.trim()
        : inputPayload.backgroundAwareness,
    languageGuidance:
      input.derivationCode === "difficulty-light"
        ? "先下判断，再补关键事实，句子更短，收束更快。"
        : input.derivationCode === "difficulty-hard"
          ? "至少同时处理两个变量，必须解释判断位移和反方疑问。"
          : input.derivationCode === "angle-refresh"
            ? "保持事实不变，重写判断入口和传播句，不要平铺原叙事。"
            : inputPayload.languageGuidance,
    targetEmotion:
      input.derivationCode === "angle-refresh"
        ? String(inputPayload.targetEmotion || "").trim() || "先感到判断被改写，再愿意把这次位移转发出去。"
        : inputPayload.targetEmotion,
  };
  const nextExpectedConstraints = {
    ...expectedConstraints,
    mustUseFacts: uniqueStrings(
      [
        ...getStringArray(expectedConstraints.mustUseFacts, 8),
        ...getStringArray(nextInputPayload.sourceFacts, 3).slice(0, 3),
      ],
      6,
    ),
    importMeta: {
      ...getRecord(expectedConstraints.importMeta),
      derivedFromCaseId: row.id,
      derivedFromTaskCode: row.task_code,
      derivationCode: input.derivationCode,
      derivationLabel: input.derivationLabel,
    },
  };
  const nextViralTargets = {
    ...viralTargets,
    titleGoal:
      input.derivationCode === "angle-refresh"
        ? `标题要直接体现 ${row.topic_title} 这次新增的判断，不要只报事实。`
        : viralTargets.titleGoal,
    hookGoal:
      input.derivationCode === "angle-refresh"
        ? String(viralTargets.hookGoal || "").trim() || `开头三句内解释 ${row.topic_title} 为什么需要重写判断。`
        : viralTargets.hookGoal,
    shareTriggerGoal:
      input.derivationCode === "angle-refresh"
        ? String(viralTargets.shareTriggerGoal || "").trim() || "正文里至少产出一句能代表这次判断位移的转发句。"
        : viralTargets.shareTriggerGoal,
  };
  const nextStageArtifacts = {
    ...stageArtifactPayloads,
    autoFillVariant: {
      sourceCaseId: row.id,
      sourceTaskCode: row.task_code,
      derivationCode: input.derivationCode,
      derivationLabel: input.derivationLabel,
    },
  };
  const nextDifficultyLevel =
    input.derivationCode === "difficulty-light"
      ? "light"
      : input.derivationCode === "difficulty-hard"
        ? "hard"
        : row.difficulty_level;
  const nextReferenceGoodOutput =
    hasFilledString(row.reference_good_output)
      ? row.reference_good_output
      : input.derivationCode === "angle-refresh"
        ? buildWritingEvalDerivedReferenceGoodOutput({
            topicTitle: `${row.topic_title} · ${input.derivationLabel}`,
            inputPayload: nextInputPayload,
            viralTargets: nextViralTargets,
          })
        : null;

  return createWritingEvalCase({
    datasetId: input.datasetId,
    taskCode: buildWritingEvalDerivedCaseTaskCode({
      existingTaskCodes,
      sourceTaskCode: row.task_code,
      derivationCode: input.derivationCode,
    }),
    taskType: row.task_type,
    topicTitle: `${row.topic_title} · ${input.derivationLabel}`,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    inputPayload: nextInputPayload,
    expectedConstraints: nextExpectedConstraints,
    viralTargets: nextViralTargets,
    stageArtifactPayloads: nextStageArtifacts,
    referenceGoodOutput: nextReferenceGoodOutput,
    referenceBadPatterns: parseJsonArray(row.reference_bad_patterns_json),
    difficultyLevel: nextDifficultyLevel,
    isEnabled: Boolean(row.is_enabled),
  });
}

function scoreWritingEvalImportRecommendationCandidate(input: {
  candidate: WritingEvalImportRecommendationItem;
  targetState: ReturnType<typeof buildWritingEvalDatasetRecommendationTargets>;
}) {
  const { candidate, targetState } = input;
  const reasons = new Set<string>();
  let score = 0;
  if (targetState.enabledCaseCount < 20) {
    score += 10;
    reasons.add(`补样本总量（当前 ${targetState.enabledCaseCount}/20）`);
  }
  if (targetState.missingTaskTypes.includes(candidate.suggestedTaskType)) {
    score += 36;
    reasons.add(`补题型 ${candidate.suggestedTaskType}`);
  } else if (
    !targetState.taskTypes.has(candidate.suggestedTaskType)
    && targetState.taskTypes.size < Math.max(targetState.datasetFocus.targetTaskTypes.length, 4)
  ) {
    score += 18;
    reasons.add(`扩题型覆盖 ${candidate.suggestedTaskType}`);
  }
  if (targetState.missingDifficultyLevels.includes(candidate.suggestedDifficultyLevel as "light" | "medium" | "hard")) {
    score += 30;
    reasons.add(`补难度 ${candidate.suggestedDifficultyLevel}`);
  }
  if (targetState.gapFlags.sourceFacts && candidate.sourceFactCount > 0) {
    score += 10 + Math.min(candidate.sourceFactCount, 4);
    reasons.add("补事实素材覆盖");
  }
  if (targetState.gapFlags.knowledgeCards && candidate.knowledgeCardCount > 0) {
    score += 8 + Math.min(candidate.knowledgeCardCount, 3);
    reasons.add("补知识卡覆盖");
  }
  if (targetState.gapFlags.historyReferences && candidate.historyReferenceCount > 0) {
    score += 7 + Math.min(candidate.historyReferenceCount, 3);
    reasons.add("补历史参考覆盖");
  }
  if (targetState.gapFlags.referenceGoodOutput && candidate.referenceGoodOutput) {
    score += 18;
    reasons.add("补 referenceGoodOutput");
  }
  if (targetState.gapFlags.mustUseFacts && candidate.sourceFactCount >= 2) {
    score += 8;
    reasons.add("补 mustUseFacts 命中潜力");
  }
  if (targetState.gapFlags.referenceBadPatterns) {
    score += 4;
    reasons.add("补反例模式覆盖");
  }
  const focusBoost = getWritingEvalImportFocusBoost({
    datasetFocusKey: targetState.datasetFocus.key,
    candidateSourceType: candidate.sourceType,
    candidateTaskType: candidate.suggestedTaskType,
  });
  if (focusBoost.score > 0) {
    score += focusBoost.score;
    for (const reason of focusBoost.reasons) {
      reasons.add(reason);
    }
  }
  if (targetState.gapFlags.titleGoal) score += 3;
  if (targetState.gapFlags.hookGoal) score += 3;
  if (targetState.gapFlags.shareTriggerGoal) score += 3;
  if (targetState.gapFlags.readerProfile) score += 2;
  if (targetState.gapFlags.targetEmotion) score += 2;
  score += Math.min(candidate.sourceFactCount, 4);
  score += Math.min(candidate.knowledgeCardCount, 2);
  score += Math.min(candidate.historyReferenceCount, 2);
  if (candidate.referenceGoodOutput) score += 4;
  return {
    ...candidate,
    score,
    reasonTags: Array.from(reasons),
  };
}

export async function getWritingEvalDatasetImportRecommendations(input: {
  datasetId: number;
  limit?: number;
  candidatePoolLimit?: number;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  const db = getDatabase();
  const dataset = await db.queryOne<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     WHERE id = ?`,
    [input.datasetId],
  );
  if (!dataset) throw new Error("评测集不存在");

  const cases = await db.query<WritingEvalCaseRow>(
    `SELECT id, dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
            viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled,
            created_at, updated_at
     FROM writing_eval_cases
     WHERE dataset_id = ?`,
    [input.datasetId],
  );
  const readiness = getWritingEvalDatasetReadiness(cases, dataset.status, dataset);
  const targetState = buildWritingEvalDatasetRecommendationTargets({
    readiness,
    cases,
    dataset,
  });
  const candidatePoolLimit = Math.max(Number(input.candidatePoolLimit ?? 24) || 24, 12);
  const [articleOptions, knowledgeCardOptions, topicOptions, fragmentOptions] = await Promise.all([
    getWritingEvalArticleImportOptions(candidatePoolLimit),
    getWritingEvalKnowledgeCardImportOptions(candidatePoolLimit),
    getWritingEvalTopicImportOptions(candidatePoolLimit, input.datasetId),
    getWritingEvalFragmentImportOptions(candidatePoolLimit),
  ]);
  const baseRecommendations = [
    ...articleOptions.map<WritingEvalImportRecommendationItem>((item) => ({
      sourceType: "article",
      sourceId: item.id,
      taskCode: `article-${item.id}`,
      title: item.title,
      subtitle: uniqueStrings([item.status, item.seriesName], 2).join(" · ") || null,
      suggestedTaskType: resolveWritingEvalTaskTypeForDatasetFocus({
        datasetFocusKey: targetState.datasetFocus.key,
        baseTaskType: item.suggestedTaskType,
        sourceType: "article",
      }),
      suggestedDifficultyLevel: item.suggestedDifficultyLevel,
      sourceFactCount: item.sourceFactCount,
      knowledgeCardCount: item.knowledgeCardCount,
      historyReferenceCount: item.historyReferenceCount,
      referenceGoodOutput: item.hasMarkdown,
      variantCode: undefined,
      variantLabel: null,
      reasonTags: [],
      score: 0,
    })),
    ...knowledgeCardOptions.map<WritingEvalImportRecommendationItem>((item) => ({
      sourceType: "knowledge_card",
      sourceId: item.id,
      taskCode: `knowledge-card-${item.id}`,
      title: item.title,
      subtitle: uniqueStrings([item.cardType, item.status, item.ownerUsername], 3).join(" · ") || null,
      suggestedTaskType: resolveWritingEvalTaskTypeForDatasetFocus({
        datasetFocusKey: targetState.datasetFocus.key,
        baseTaskType: item.suggestedTaskType,
        sourceType: "knowledge_card",
      }),
      suggestedDifficultyLevel: item.suggestedDifficultyLevel,
      sourceFactCount: item.sourceFactCount,
      knowledgeCardCount: item.knowledgeCardCount,
      historyReferenceCount: item.historyReferenceCount,
      referenceGoodOutput: false,
      variantCode: undefined,
      variantLabel: null,
      reasonTags: [],
      score: 0,
    })),
    ...topicOptions.map<WritingEvalImportRecommendationItem>((item) => ({
      sourceType: "topic_item",
      sourceId: item.id,
      taskCode: item.taskCode,
      title: item.title,
      subtitle: uniqueStrings([item.subtitle, item.sourceName, item.sourceType, item.publishedAt], 4).join(" · ") || null,
      suggestedTaskType: resolveWritingEvalTaskTypeForDatasetFocus({
        datasetFocusKey: targetState.datasetFocus.key,
        baseTaskType: item.suggestedTaskType,
        sourceType: "topic_item",
      }),
      suggestedDifficultyLevel: item.suggestedDifficultyLevel,
      sourceFactCount: item.sourceFactCount,
      knowledgeCardCount: item.knowledgeCardCount,
      historyReferenceCount: item.historyReferenceCount,
      referenceGoodOutput: false,
      variantCode: item.variantCode,
      variantLabel: item.variantLabel,
      reasonTags: [],
      score: 0,
    })),
    ...fragmentOptions.map<WritingEvalImportRecommendationItem>((item) => ({
      sourceType: "fragment",
      sourceId: item.id,
      taskCode: `fragment-${item.id}`,
      title: item.title,
      subtitle: uniqueStrings([item.sourceType, item.sourceUrl, item.hasScreenshot ? "screenshot" : ""], 3).join(" · ") || null,
      suggestedTaskType: resolveWritingEvalTaskTypeForDatasetFocus({
        datasetFocusKey: targetState.datasetFocus.key,
        baseTaskType: item.suggestedTaskType,
        sourceType: "fragment",
      }),
      suggestedDifficultyLevel: item.suggestedDifficultyLevel,
      sourceFactCount: item.sourceFactCount,
      knowledgeCardCount: item.knowledgeCardCount,
      historyReferenceCount: item.historyReferenceCount,
      referenceGoodOutput: false,
      variantCode: undefined,
      variantLabel: null,
      reasonTags: [],
      score: 0,
    })),
  ]
    .filter((item) => !cases.some((existing) => existing.task_code === item.taskCode))
    .filter((item, _, all) => {
      if (targetState.datasetFocus.key === "general") {
        return true;
      }
      const hasRecommendedSource = all.some((candidate) =>
        isWritingEvalSourceTypeRecommendedForFocus({
          datasetFocusKey: targetState.datasetFocus.key,
          candidateSourceType: candidate.sourceType,
        }),
      );
      if (!hasRecommendedSource) {
        return true;
      }
      return isWritingEvalSourceTypeRecommendedForFocus({
        datasetFocusKey: targetState.datasetFocus.key,
        candidateSourceType: item.sourceType,
      });
    })
    .map((item) => scoreWritingEvalImportRecommendationCandidate({
      candidate: item,
      targetState,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.sourceFactCount - left.sourceFactCount || Number(right.referenceGoodOutput) - Number(left.referenceGoodOutput) || right.sourceId - left.sourceId);

  const recommendations = (
    baseRecommendations.length > 0
      ? baseRecommendations
      : buildWritingEvalDerivedCaseRecommendations({
          cases,
          targetState,
          limit: candidatePoolLimit,
        })
  ).slice(0, Math.max(Number(input.limit ?? 8) || 8, 1));

  return {
    datasetId: input.datasetId,
    readiness,
    targetSummary: targetState.targetSummary,
    recommendations,
  };
}

export async function autoFillWritingEvalDatasetImports(input: {
  datasetId: number;
  maxImports?: number;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  const maxImports = Math.min(Math.max(Number(input.maxImports ?? 4) || 4, 1), 12);
  let plan = await getWritingEvalDatasetImportRecommendations({
    datasetId: input.datasetId,
    limit: Math.max(maxImports * 2, 6),
    candidatePoolLimit: 36,
  });
  if (plan.recommendations.length === 0) {
    return {
      datasetId: input.datasetId,
      targetSummary: plan.targetSummary,
      recommendations: [],
      createdCases: [],
      importedItems: [],
      skipped: [],
    };
  }

  const createdCases: Array<Awaited<
    | ReturnType<typeof importWritingEvalCaseFromArticle>
    | ReturnType<typeof importWritingEvalCaseFromKnowledgeCard>
    | ReturnType<typeof importWritingEvalCaseFromTopicItem>
    | ReturnType<typeof importWritingEvalCaseFromFragment>
    | ReturnType<typeof createWritingEvalDerivedCaseFromExistingCase>
  >> = [];
  const importedItems: Array<{ sourceType: WritingEvalImportRecommendationItem["sourceType"]; sourceId: number; taskCode?: string }> = [];
  const skipped: Array<{ sourceType: string; sourceId: number; taskCode?: string; reason: string }> = [];
  const attemptedTaskCodes = new Set<string>();

  while (createdCases.length < maxImports) {
    const recommendation = plan.recommendations.find((item) => !attemptedTaskCodes.has(item.taskCode));
    if (!recommendation) {
      break;
    }
    attemptedTaskCodes.add(recommendation.taskCode);
    try {
      const created =
        recommendation.derivation
          ? await createWritingEvalDerivedCaseFromExistingCase({
              datasetId: input.datasetId,
              sourceCaseId: recommendation.derivation.sourceCaseId,
              derivationCode: recommendation.derivation.code,
              derivationLabel: recommendation.derivation.label,
            })
          : recommendation.sourceType === "article"
          ? await importWritingEvalCaseFromArticle({
              datasetId: input.datasetId,
              articleId: recommendation.sourceId,
              operatorUserId: input.operatorUserId,
            })
          : recommendation.sourceType === "knowledge_card"
            ? await importWritingEvalCaseFromKnowledgeCard({
                datasetId: input.datasetId,
                knowledgeCardId: recommendation.sourceId,
                operatorUserId: input.operatorUserId,
              })
            : recommendation.sourceType === "topic_item"
              ? await importWritingEvalCaseFromTopicItem({
                  datasetId: input.datasetId,
                  topicItemId: recommendation.sourceId,
                  variantCode: recommendation.variantCode,
                  operatorUserId: input.operatorUserId,
                })
              : await importWritingEvalCaseFromFragment({
                  datasetId: input.datasetId,
                  fragmentId: recommendation.sourceId,
                  operatorUserId: input.operatorUserId,
                });
      createdCases.push(created);
      importedItems.push({
        sourceType: recommendation.sourceType,
        sourceId: recommendation.sourceId,
        taskCode: created.taskCode,
      });
    } catch (error) {
      skipped.push({
        sourceType: recommendation.sourceType,
        sourceId: recommendation.sourceId,
        taskCode: recommendation.taskCode,
        reason: error instanceof Error ? error.message : "自动导入失败",
      });
    }

    if (createdCases.length >= maxImports) {
      break;
    }
    plan = await getWritingEvalDatasetImportRecommendations({
      datasetId: input.datasetId,
      limit: Math.max(maxImports * 2, 6),
      candidatePoolLimit: 36,
    });
    if (plan.recommendations.length === 0) {
      break;
    }
  }
  return {
    datasetId: input.datasetId,
    targetSummary: plan.targetSummary,
    recommendations: plan.recommendations,
    createdCases,
    importedItems,
    skipped,
  };
}

export async function autoFillWritingEvalDatasets(input: {
  limit?: number;
  maxImportsPerDataset?: number;
  cooldownHours?: number;
  force?: boolean;
  statuses?: string[];
  operatorUserId?: number | null;
  datasetIds?: number[];
} = {}) {
  await ensureExtendedProductSchema();
  const seedResult = await ensureWritingEvalDatasetPresets();
  const limit = Math.min(Math.max(Math.round(Number(input.limit ?? 3)) || 3, 1), 12);
  const scanLimit = Math.min(Math.max(limit * 4, limit), 48);
  const maxImportsPerDataset = Math.min(Math.max(Math.round(Number(input.maxImportsPerDataset ?? 4)) || 4, 1), 12);
  const cooldownHours = Math.min(Math.max(Number(input.cooldownHours ?? 6) || 6, 1), 168);
  const datasetIds = Array.from(
    new Set(
      (Array.isArray(input.datasetIds) ? input.datasetIds : [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  const statuses = Array.from(
    new Set(
      (Array.isArray(input.statuses) && input.statuses.length > 0 ? input.statuses : ["active", "draft"])
        .map((item) => normalizeWritingEvalDatasetStatus(item))
        .filter((item) => item !== "archived"),
    ),
  );
  if (statuses.length === 0) {
    statuses.push("active");
  }

  const db = getDatabase();
  const cutoffIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  const statusPlaceholders = statuses.map(() => "?").join(", ");
  const params: Array<string | number> = [...statuses];
  const conditions = [`status IN (${statusPlaceholders})`];
  if (datasetIds.length > 0) {
    conditions.push(`id IN (${datasetIds.map(() => "?").join(", ")})`);
    params.push(...datasetIds);
  }
  if (!input.force) {
    if (seedResult.createdCodes.length > 0) {
      conditions.push(`(updated_at <= ? OR code IN (${seedResult.createdCodes.map(() => "?").join(", ")}))`);
      params.push(cutoffIso, ...seedResult.createdCodes);
    } else {
      conditions.push("updated_at <= ?");
      params.push(cutoffIso);
    }
  }
  params.push(scanLimit);

  const rows = await db.query<WritingEvalDatasetRow>(
    `SELECT id, code, name, description, status, sample_count, created_by, created_at, updated_at
     FROM writing_eval_datasets
     WHERE ${conditions.join(" AND ")}
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at ASC, id ASC
     LIMIT ?`,
    params,
  );

  const readinessMap = await getWritingEvalDatasetReadinessMap(rows.map((row) => ({ id: row.id, status: row.status })));
  const items: Array<{
    datasetId: number;
    datasetCode: string;
    datasetName: string;
    datasetStatus: string;
    readinessStatus: WritingEvalDatasetReadiness["status"];
    targetSummary: string[];
    importedCount: number;
    importedItems: Array<{ sourceType: WritingEvalImportRecommendationItem["sourceType"]; sourceId: number }>;
    skipped: Array<{ sourceType: string; sourceId: number; reason: string }>;
  }> = [];
  const skipped: Array<{
    datasetId: number;
    datasetCode: string;
    datasetName: string;
    datasetStatus: string;
    reason: string;
    readinessStatus?: WritingEvalDatasetReadiness["status"];
    targetSummary?: string[];
  }> = [];

  for (const row of rows) {
    if (items.length >= limit) break;
    const readiness = readinessMap.get(row.id) ?? getWritingEvalDatasetReadiness([], row.status, row);
    if (readiness.status === "ready") {
      skipped.push({
        datasetId: row.id,
        datasetCode: row.code,
        datasetName: row.name,
        datasetStatus: row.status,
        readinessStatus: readiness.status,
        reason: "当前数据集已达到 readiness=ready，无需自动补桶",
      });
      continue;
    }

    const plan = await getWritingEvalDatasetImportRecommendations({
      datasetId: row.id,
      limit: Math.max(maxImportsPerDataset * 2, 6),
      candidatePoolLimit: 36,
    });
    if (plan.targetSummary.length === 0) {
      skipped.push({
        datasetId: row.id,
        datasetCode: row.code,
        datasetName: row.name,
        datasetStatus: row.status,
        readinessStatus: readiness.status,
        reason: "当前数据集没有明确补桶缺口",
      });
      continue;
    }
    if (plan.recommendations.length === 0) {
      skipped.push({
        datasetId: row.id,
        datasetCode: row.code,
        datasetName: row.name,
        datasetStatus: row.status,
        readinessStatus: readiness.status,
        targetSummary: plan.targetSummary,
        reason: "当前数据集存在缺口，但没有可导入候选",
      });
      continue;
    }

    const result = await autoFillWritingEvalDatasetImports({
      datasetId: row.id,
      maxImports: maxImportsPerDataset,
      operatorUserId: input.operatorUserId,
    });
    if (result.createdCases.length === 0) {
      skipped.push({
        datasetId: row.id,
        datasetCode: row.code,
        datasetName: row.name,
        datasetStatus: row.status,
        readinessStatus: readiness.status,
        targetSummary: result.targetSummary,
        reason: result.skipped[0]?.reason || "自动补桶未产生新样本",
      });
      continue;
    }

    items.push({
      datasetId: row.id,
      datasetCode: row.code,
      datasetName: row.name,
      datasetStatus: row.status,
      readinessStatus: readiness.status,
      targetSummary: result.targetSummary,
      importedCount: result.createdCases.length,
      importedItems: result.importedItems,
      skipped: result.skipped,
    });
    await appendAuditLog({
      userId: input.operatorUserId ?? null,
      action: "writing_eval_dataset_auto_fill",
      targetType: "writing_eval_dataset",
      targetId: row.id,
      payload: {
        datasetCode: row.code,
        datasetStatus: row.status,
        readinessStatus: readiness.status,
        targetSummary: result.targetSummary,
        importedCount: result.createdCases.length,
        importedItems: result.importedItems,
        skipped: result.skipped,
        force: Boolean(input.force),
      },
    });
  }

  return {
    limit,
    scanLimit,
    cooldownHours,
    statuses,
    force: Boolean(input.force),
    datasetIds,
    scannedCount: rows.length,
    appliedCount: items.length,
    createdCaseCount: items.reduce((sum, item) => sum + item.importedCount, 0),
    items,
    skippedCount: skipped.length,
    skipped,
  };
}

export async function autoFillPlan17QualityDatasets(input?: {
  operatorUserId?: number | null;
  maxImportsPerDataset?: number;
  force?: boolean;
}) {
  const datasets = await getWritingEvalDatasets();
  const plan17DatasetIds = datasets
    .filter((dataset) => isPlan17WritingEvalFocusKey(dataset.focus.key))
    .map((dataset) => dataset.id);

  return autoFillWritingEvalDatasets({
    datasetIds: plan17DatasetIds,
    limit: plan17DatasetIds.length || 4,
    maxImportsPerDataset: input?.maxImportsPerDataset ?? 6,
    force: input?.force ?? true,
    statuses: ["draft", "active"],
    operatorUserId: input?.operatorUserId ?? null,
  });
}

function inferWritingEvalModelProvider(model: string) {
  const normalized = String(model || "").trim().toLowerCase();
  if (normalized.startsWith("gpt") || normalized.startsWith("o")) return "openai" as const;
  if (normalized.startsWith("claude")) return "anthropic" as const;
  if (normalized.startsWith("gemini")) return "gemini" as const;
  return null;
}

function hasProviderEnvForWritingEval(provider: "openai" | "anthropic" | "gemini") {
  if (provider === "openai") return hasFilledString(process.env.OPENAI_API_KEY);
  if (provider === "anthropic") return hasFilledString(process.env.ANTHROPIC_API_KEY);
  return hasFilledString(process.env.GEMINI_API_KEY) || hasFilledString(process.env.GOOGLE_API_KEY);
}

export async function queuePlan17TopicFissionBenchmarkRuns(input?: {
  operatorUserId?: number | null;
  force?: boolean;
  autoFill?: boolean;
  maxImportsPerDataset?: number;
  skipProviderPreflight?: boolean;
}) {
  await ensureExtendedProductSchema();
  const shouldAutoFill = input?.autoFill !== false;
  const autoFillResult = shouldAutoFill
    ? await autoFillPlan17QualityDatasets({
        operatorUserId: input?.operatorUserId ?? null,
        maxImportsPerDataset: input?.maxImportsPerDataset ?? 6,
        force: true,
      })
    : null;
  const datasets = await getWritingEvalDatasets();
  const dataset = datasets.find((item) => item.focus.key === "topic_fission" || item.code === "plan17-topic-fission-v1");
  if (!dataset) {
    throw new Error("未找到 plan17 topic_fission 评测集");
  }

  const scenePromptIds = ["topicFission.regularity", "topicFission.contrast", "topicFission.crossDomain"] as const;
  const promptVersions = await getPromptVersions();
  const activePromptRefs = scenePromptIds.map((promptId) => {
    const active = promptVersions.find((item) => item.prompt_id === promptId && Boolean(item.is_active));
    if (!active) {
      throw new Error(`缺少激活中的 Prompt：${promptId}`);
    }
    return {
      promptId,
      label: getPlan17PromptSceneMeta(promptId)?.label ?? promptId,
      activeVersion: active.version,
      promptVersionRef: `${promptId}@${active.version}`,
    };
  });

  const db = getDatabase();
  if (!input?.skipProviderPreflight) {
    const routes = await db.query<{ scene_code: string; primary_model: string; fallback_model: string | null }>(
      `SELECT scene_code, primary_model, fallback_model
       FROM ai_model_routes
       WHERE scene_code IN (${activePromptRefs.map(() => "?").join(", ")})`,
      activePromptRefs.map((item) => item.promptId),
    );
    const routeMap = new Map(routes.map((item) => [item.scene_code, item]));
    const missingProviderScenes = activePromptRefs
      .map((item) => {
        const route = routeMap.get(item.promptId);
        if (!route) {
          return `${item.promptId} 缺少 ai_model_routes 配置`;
        }
        const models = [route.primary_model, route.fallback_model].filter(Boolean) as string[];
        const availableModels = models.filter((model) => {
          const provider = inferWritingEvalModelProvider(model);
          return provider != null && hasProviderEnvForWritingEval(provider);
        });
        if (availableModels.length > 0) {
          return null;
        }
        const requiredEnvHints = Array.from(new Set(models
          .map((model) => inferWritingEvalModelProvider(model))
          .filter((item): item is "openai" | "anthropic" | "gemini" => item != null)
          .map((provider) => provider === "openai"
            ? "OPENAI_API_KEY"
            : provider === "anthropic"
              ? "ANTHROPIC_API_KEY"
              : "GEMINI_API_KEY/GOOGLE_API_KEY")));
        return `${item.promptId} 缺少可用 provider 凭据（需要 ${requiredEnvHints.join(" 或 ")}）`;
      })
      .filter((item): item is string => Boolean(item));
    if (missingProviderScenes.length > 0) {
      throw new Error(
        `topicFission benchmark 无法执行：${missingProviderScenes.join("；")}。`
        + "请先补齐 provider 凭据，或先运行 `pnpm plan17:acceptance-blockers` 查看当前阻塞明细。"
        + "`--skip-provider-preflight` 只会跳过预检，不会绕过真实 provider 调用。",
      );
    }
  }
  const existingRuns = await db.query<{
    id: number;
    run_code: string;
    candidate_version_ref: string;
    status: string;
    created_at: string;
    finished_at: string | null;
  }>(
    `SELECT id, run_code, candidate_version_ref, status, created_at, finished_at
     FROM writing_optimization_runs
     WHERE dataset_id = ?
       AND candidate_version_type = ?
       AND candidate_version_ref IN (${activePromptRefs.map(() => "?").join(", ")})
     ORDER BY created_at DESC, id DESC`,
    [dataset.id, "prompt_version", ...activePromptRefs.map((item) => item.promptVersionRef)],
  );

  const runsByRef = new Map<string, typeof existingRuns>();
  for (const row of existingRuns) {
    const current = runsByRef.get(row.candidate_version_ref) ?? [];
    current.push(row);
    runsByRef.set(row.candidate_version_ref, current);
  }

  const scenes: Array<{
    promptId: string;
    label: string;
    activeVersion: string;
    promptVersionRef: string;
    selectedRunId: number | null;
    selectedRunCode: string | null;
    selectedRunStatus: string | null;
    selectedRunCreatedAt: string | null;
    selectedRunFinishedAt: string | null;
    reusedSucceededRun: boolean;
    createdNewRun: boolean;
  }> = [];

  for (const scene of activePromptRefs) {
    const sceneRuns = runsByRef.get(scene.promptVersionRef) ?? [];
    const reusableSucceededRun = sceneRuns.find((item) => item.status === "succeeded") ?? null;
    if (reusableSucceededRun && !input?.force) {
      scenes.push({
        ...scene,
        selectedRunId: reusableSucceededRun.id,
        selectedRunCode: reusableSucceededRun.run_code,
        selectedRunStatus: reusableSucceededRun.status,
        selectedRunCreatedAt: reusableSucceededRun.created_at,
        selectedRunFinishedAt: reusableSucceededRun.finished_at,
        reusedSucceededRun: true,
        createdNewRun: false,
      });
      continue;
    }
    const reusablePendingRun = sceneRuns.find((item) =>
      item.status === "queued" || item.status === "running" || item.status === "scoring" || item.status === "promoting",
    ) ?? null;
    if (reusablePendingRun && !input?.force) {
      scenes.push({
        ...scene,
        selectedRunId: reusablePendingRun.id,
        selectedRunCode: reusablePendingRun.run_code,
        selectedRunStatus: reusablePendingRun.status,
        selectedRunCreatedAt: reusablePendingRun.created_at,
        selectedRunFinishedAt: reusablePendingRun.finished_at,
        reusedSucceededRun: false,
        createdNewRun: false,
      });
      continue;
    }

    const createdRun = await createWritingEvalRun({
      datasetId: dataset.id,
      baseVersionType: "prompt_version",
      baseVersionRef: scene.promptVersionRef,
      candidateVersionType: "prompt_version",
      candidateVersionRef: scene.promptVersionRef,
      experimentMode: "full_article",
      triggerMode: "manual",
      decisionMode: "manual_review",
      summary: [
        "plan17.topicFission benchmark",
        `scene:${scene.promptId}`,
        `dataset:${dataset.code}`,
        `cases:${dataset.readiness.enabledCaseCount}`,
      ].join("\n"),
      createdBy: input?.operatorUserId ?? null,
    });
    scenes.push({
      ...scene,
      selectedRunId: createdRun.id,
      selectedRunCode: createdRun.runCode,
      selectedRunStatus: createdRun.status,
      selectedRunCreatedAt: createdRun.createdAt,
      selectedRunFinishedAt: null,
      reusedSucceededRun: false,
      createdNewRun: true,
    });
  }

  return {
    datasetId: dataset.id,
    datasetCode: dataset.code,
    datasetStatus: dataset.status,
    enabledCaseCount: dataset.readiness.enabledCaseCount,
    autoFillApplied: autoFillResult != null,
    autoFillResult,
    createdRunCount: scenes.filter((item) => item.createdNewRun).length,
    reusedSucceededRunCount: scenes.filter((item) => item.reusedSucceededRun).length,
    scenes,
  };
}

export async function importWritingEvalCaseFromArticle(input: {
  datasetId: number;
  articleId: number;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Number.isInteger(input.articleId) || input.articleId <= 0) throw new Error("历史稿件无效");
  const db = getDatabase();
  const [dataset, article] = await Promise.all([
    db.queryOne<Pick<WritingEvalDatasetRow, "id" | "code" | "name" | "description">>(
      "SELECT id, code, name, description FROM writing_eval_datasets WHERE id = ?",
      [input.datasetId],
    ),
    db.queryOne<WritingEvalArticleImportRow>(
      `SELECT a.id, a.user_id, a.title, a.status, a.markdown_content, a.series_id, a.updated_at, s.name AS series_name
       FROM articles a
       LEFT JOIN series s ON s.id = a.series_id
       WHERE a.id = ?`,
      [input.articleId],
    ),
  ]);
  if (!dataset) throw new Error("评测集不存在");
  if (!article) throw new Error("历史稿件不存在");

  const taskCode = `article-${article.id}`;
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM writing_eval_cases WHERE dataset_id = ? AND task_code = ?",
    [input.datasetId, taskCode],
  );
  if (existing) {
    throw new Error("该历史稿件已导入当前评测集");
  }

  const [artifactRows, referencedRows, seriesRows] = await Promise.all([
    db.query<WritingEvalArticleArtifactRow>(
      `SELECT article_id, stage_code, payload_json
       FROM article_stage_artifacts
       WHERE article_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [article.id],
    ),
    db.query<{ title: string }>(
      `SELECT a.title
       FROM article_reference_articles r
       INNER JOIN articles a ON a.id = r.referenced_article_id
       WHERE r.article_id = ?
       ORDER BY r.id DESC
       LIMIT 4`,
      [article.id],
    ),
    article.series_id
      ? db.query<{ title: string }>(
          `SELECT title
           FROM articles
           WHERE series_id = ? AND id <> ?
           ORDER BY updated_at DESC, id DESC
           LIMIT 4`,
          [article.series_id, article.id],
        )
      : Promise.resolve([] as Array<{ title: string }>),
  ]);

  const artifactPayloads = Object.fromEntries(
    artifactRows.map((item) => [item.stage_code, parseJsonObject(item.payload_json)]),
  );
  const draft = buildWritingEvalArticleCaseDraft({
    article,
    artifactPayloads,
    historyReferences: [...referencedRows.map((item) => item.title), ...seriesRows.map((item) => item.title)],
  });
  const resolvedTaskType = resolveWritingEvalTaskTypeForDatasetFocus({
    datasetFocusKey: inferWritingEvalDatasetFocus(dataset).key,
    baseTaskType: draft.taskType,
    sourceType: "article",
  });
  const created = await createWritingEvalCase({
    datasetId: input.datasetId,
    taskCode: draft.taskCode,
    taskType: resolvedTaskType,
    topicTitle: draft.topicTitle,
    sourceType: "article",
    sourceRef: `article:${article.id}`,
    sourceLabel: article.title,
    inputPayload: draft.inputPayload,
    expectedConstraints: draft.expectedConstraints,
    viralTargets: draft.viralTargets,
    stageArtifactPayloads: draft.stageArtifactPayloads,
    referenceGoodOutput: draft.referenceGoodOutput,
    referenceBadPatterns: draft.referenceBadPatterns,
    difficultyLevel: draft.difficultyLevel,
    isEnabled: true,
  });

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_case_import_article",
    targetType: "writing_eval_case",
    targetId: created.id,
    payload: {
      datasetId: input.datasetId,
      articleId: article.id,
      taskCode: created.taskCode,
      taskType: created.taskType,
      difficultyLevel: created.difficultyLevel,
      sourceFactCount: draft.sourceFactCount,
      knowledgeCardCount: draft.knowledgeCardCount,
      historyReferenceCount: draft.historyReferenceCount,
    },
  });

  return created;
}

export async function importWritingEvalCasesFromArticles(input: {
  datasetId: number;
  articleIds: number[];
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Array.isArray(input.articleIds) || input.articleIds.length === 0) throw new Error("请至少提供一篇历史稿件");
  const uniqueArticleIds = Array.from(
    new Set(
      input.articleIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  if (uniqueArticleIds.length === 0) throw new Error("历史稿件列表无效");
  const createdCases: Awaited<ReturnType<typeof importWritingEvalCaseFromArticle>>[] = [];
  const skipped: Array<{ articleId: number; reason: string }> = [];

  for (const articleId of uniqueArticleIds) {
    try {
      const created = await importWritingEvalCaseFromArticle({
        datasetId: input.datasetId,
        articleId,
        operatorUserId: input.operatorUserId,
      });
      createdCases.push(created);
    } catch (error) {
      skipped.push({
        articleId,
        reason: error instanceof Error ? error.message : "导入失败",
      });
    }
  }

  return {
    datasetId: input.datasetId,
    requestedArticleIds: uniqueArticleIds,
    createdCases,
    skipped,
  };
}

export async function importWritingEvalCaseFromKnowledgeCard(input: {
  datasetId: number;
  knowledgeCardId: number;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Number.isInteger(input.knowledgeCardId) || input.knowledgeCardId <= 0) throw new Error("知识卡无效");
  const db = getDatabase();
  const [dataset, card] = await Promise.all([
    db.queryOne<Pick<WritingEvalDatasetRow, "id" | "code" | "name" | "description">>(
      "SELECT id, code, name, description FROM writing_eval_datasets WHERE id = ?",
      [input.datasetId],
    ),
    db.queryOne<WritingEvalKnowledgeCardImportRow>(
      `SELECT kc.id, kc.user_id, kc.card_type, kc.title, kc.summary, kc.key_facts_json, kc.open_questions_json,
              kc.conflict_flags_json, kc.latest_change_summary, kc.confidence_score, kc.status,
              kc.last_compiled_at, kc.last_verified_at, kc.updated_at, u.username AS owner_username
       FROM knowledge_cards kc
       LEFT JOIN users u ON u.id = kc.user_id
       WHERE kc.id = ?`,
      [input.knowledgeCardId],
    ),
  ]);
  if (!dataset) throw new Error("评测集不存在");
  if (!card) throw new Error("知识卡不存在");

  const taskCode = `knowledge-card-${card.id}`;
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM writing_eval_cases WHERE dataset_id = ? AND task_code = ?",
    [input.datasetId, taskCode],
  );
  if (existing) throw new Error("该知识卡已导入当前评测集");

  const [fragmentRows, linkRows] = await Promise.all([
    db.query<WritingEvalKnowledgeCardFragmentRow>(
      `SELECT k.knowledge_card_id, k.fragment_id, f.distilled_content
       FROM knowledge_card_fragments k
       INNER JOIN fragments f ON f.id = k.fragment_id
       WHERE k.knowledge_card_id = ?
       ORDER BY k.id ASC`,
      [card.id],
    ),
    db.query<WritingEvalKnowledgeCardLinkRow>(
      `SELECT source_card_id, target_card_id, link_type
       FROM knowledge_card_links
       WHERE source_card_id = ? OR target_card_id = ?
       ORDER BY id ASC`,
      [card.id, card.id],
    ),
  ]);
  const relatedCardIds = Array.from(new Set(linkRows.map((item) => (item.source_card_id === card.id ? item.target_card_id : item.source_card_id))));
  const relatedCards = relatedCardIds.length > 0
    ? await db.query<WritingEvalKnowledgeCardLinkedCardRow>(
        `SELECT id, title, summary, card_type, status
         FROM knowledge_cards
         WHERE id IN (${relatedCardIds.map(() => "?").join(", ")})`,
        relatedCardIds,
      )
    : [];
  const relatedCardMap = new Map(relatedCards.map((item) => [item.id, item]));
  const draft = buildWritingEvalKnowledgeCardCaseDraft({
    card,
    sourceFragments: fragmentRows.map((item) => ({ id: item.fragment_id, distilledContent: item.distilled_content })),
    relatedCards: relatedCardIds.map((relatedCardId) => {
      const relatedCard = relatedCardMap.get(relatedCardId);
      if (!relatedCard) return null;
      const matchedLink = linkRows.find((item) => item.source_card_id === relatedCardId || item.target_card_id === relatedCardId);
      return {
        id: relatedCard.id,
        title: relatedCard.title,
        summary: relatedCard.summary,
        cardType: relatedCard.card_type,
        status: relatedCard.status,
        linkType: matchedLink?.link_type || "mentions",
      };
    }).filter((item): item is { id: number; title: string; summary: string | null; cardType: string; status: string; linkType: string } => Boolean(item)),
  });
  const resolvedTaskType = resolveWritingEvalTaskTypeForDatasetFocus({
    datasetFocusKey: inferWritingEvalDatasetFocus(dataset).key,
    baseTaskType: draft.taskType,
    sourceType: "knowledge_card",
  });
  const created = await createWritingEvalCase({
    datasetId: input.datasetId,
    taskCode: draft.taskCode,
    taskType: resolvedTaskType,
    topicTitle: draft.topicTitle,
    sourceType: "knowledge_card",
    sourceRef: `knowledge_card:${card.id}`,
    sourceLabel: card.title,
    inputPayload: draft.inputPayload,
    expectedConstraints: draft.expectedConstraints,
    viralTargets: draft.viralTargets,
    stageArtifactPayloads: draft.stageArtifactPayloads,
    referenceGoodOutput: draft.referenceGoodOutput,
    referenceBadPatterns: draft.referenceBadPatterns,
    difficultyLevel: draft.difficultyLevel,
    isEnabled: true,
  });

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_case_import_knowledge_card",
    targetType: "writing_eval_case",
    targetId: created.id,
    payload: {
      datasetId: input.datasetId,
      knowledgeCardId: card.id,
      taskCode: created.taskCode,
      taskType: created.taskType,
      difficultyLevel: created.difficultyLevel,
      sourceFactCount: draft.sourceFactCount,
      knowledgeCardCount: draft.knowledgeCardCount,
      historyReferenceCount: draft.historyReferenceCount,
      openQuestionCount: draft.openQuestionCount,
      conflictFlagCount: draft.conflictFlagCount,
    },
  });

  return created;
}

export async function importWritingEvalCasesFromKnowledgeCards(input: {
  datasetId: number;
  knowledgeCardIds: number[];
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Array.isArray(input.knowledgeCardIds) || input.knowledgeCardIds.length === 0) throw new Error("请至少提供一张知识卡");
  const uniqueKnowledgeCardIds = Array.from(
    new Set(
      input.knowledgeCardIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  if (uniqueKnowledgeCardIds.length === 0) throw new Error("知识卡列表无效");
  const createdCases: Awaited<ReturnType<typeof importWritingEvalCaseFromKnowledgeCard>>[] = [];
  const skipped: Array<{ knowledgeCardId: number; reason: string }> = [];
  for (const knowledgeCardId of uniqueKnowledgeCardIds) {
    try {
      const created = await importWritingEvalCaseFromKnowledgeCard({
        datasetId: input.datasetId,
        knowledgeCardId,
        operatorUserId: input.operatorUserId,
      });
      createdCases.push(created);
    } catch (error) {
      skipped.push({
        knowledgeCardId,
        reason: error instanceof Error ? error.message : "导入失败",
      });
    }
  }
  return {
    datasetId: input.datasetId,
    requestedKnowledgeCardIds: uniqueKnowledgeCardIds,
    createdCases,
    skipped,
  };
}

export async function importWritingEvalCaseFromTopicItem(input: {
  datasetId: number;
  topicItemId: number;
  variantCode?: string | null;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Number.isInteger(input.topicItemId) || input.topicItemId <= 0) throw new Error("主题档案无效");
  const db = getDatabase();
  const [dataset, topic, knowledgeCandidates] = await Promise.all([
    db.queryOne<Pick<WritingEvalDatasetRow, "id" | "code" | "name" | "description">>(
      "SELECT id, code, name, description FROM writing_eval_datasets WHERE id = ?",
      [input.datasetId],
    ),
    db.queryOne<WritingEvalTopicImportRow>(
      `SELECT ti.id, ti.owner_user_id, ti.source_name, ti.title, ti.summary, ti.emotion_labels_json,
              ti.angle_options_json, ti.source_url, ti.published_at, ts.source_type, ts.priority AS source_priority
       FROM topic_items ti
       LEFT JOIN topic_sources ts
         ON ts.name = ti.source_name
        AND (
          (ti.owner_user_id IS NULL AND ts.owner_user_id IS NULL)
          OR ti.owner_user_id = ts.owner_user_id
        )
       WHERE ti.id = ?`,
      [input.topicItemId],
    ),
    getWritingEvalTopicKnowledgeCandidates(),
  ]);
  if (!dataset) throw new Error("评测集不存在");
  if (!topic) throw new Error("主题档案不存在");
  if (isTopicItemTemplatePolluted(topic)) {
    throw new Error("主题档案包含明显模板占位符，不能导入评测集");
  }

  const matchedCards = matchTopicToKnowledgeCards(topic.title, knowledgeCandidates, 3);
  const drafts = buildWritingEvalTopicCaseDrafts({
    topic,
    matchedCards,
  });
  const existingRows = await db.query<{ task_code: string }>(
    `SELECT task_code
     FROM writing_eval_cases
     WHERE dataset_id = ?
       AND source_type = 'topic_item'
       AND (
         source_ref = ?
         OR source_ref LIKE ?
         OR task_code = ?
         OR task_code LIKE ?
       )`,
    [
      input.datasetId,
      `topic_item:${topic.id}`,
      `topic_item:${topic.id}#%`,
      `topic-item-${topic.id}`,
      `topic-item-${topic.id}--%`,
    ],
  );
  const existingTaskCodes = normalizeTopicVariantTaskCodes(topic.id, existingRows.map((row) => row.task_code));
  const requestedVariantCode = String(input.variantCode || "").trim();
  const draft = requestedVariantCode
    ? drafts.find((item) => item.variantCode === requestedVariantCode && !existingTaskCodes.has(item.taskCode)) ?? null
    : pickNextWritingEvalTopicCaseDraft({
        topic,
        matchedCards,
        existingTaskCodes,
      });
  if (!draft) {
    throw new Error(
      requestedVariantCode
        ? "该主题档案变体已导入当前评测集"
        : "该主题档案的高价值变体已全部导入当前评测集",
    );
  }
  const resolvedTaskType = resolveWritingEvalTaskTypeForDatasetFocus({
    datasetFocusKey: inferWritingEvalDatasetFocus(dataset).key,
    baseTaskType: draft.taskType,
    sourceType: "topic_item",
  });
  const created = await createWritingEvalCase({
    datasetId: input.datasetId,
    taskCode: draft.taskCode,
    taskType: resolvedTaskType,
    topicTitle: draft.topicTitle,
    sourceType: "topic_item",
    sourceRef: `topic_item:${topic.id}`,
    sourceLabel: topic.source_name || topic.title,
    sourceUrl: topic.source_url,
    inputPayload: draft.inputPayload,
    expectedConstraints: draft.expectedConstraints,
    viralTargets: draft.viralTargets,
    stageArtifactPayloads: draft.stageArtifactPayloads,
    referenceGoodOutput: draft.referenceGoodOutput,
    referenceBadPatterns: draft.referenceBadPatterns,
    difficultyLevel: draft.difficultyLevel,
    isEnabled: true,
  });

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_case_import_topic_item",
    targetType: "writing_eval_case",
    targetId: created.id,
    payload: {
      datasetId: input.datasetId,
      topicItemId: topic.id,
      variantCode: draft.variantCode ?? "angle-primary",
      variantLabel: draft.variantLabel ?? "主切角",
      taskCode: created.taskCode,
      taskType: created.taskType,
      difficultyLevel: created.difficultyLevel,
      sourceFactCount: draft.sourceFactCount,
      knowledgeCardCount: draft.knowledgeCardCount,
      historyReferenceCount: draft.historyReferenceCount,
      emotionLabelCount: draft.emotionLabelCount,
      angleOptionCount: draft.angleOptionCount,
    },
  });

  return created;
}

export async function importWritingEvalCasesFromTopicItems(input: {
  datasetId: number;
  topicItemIds: number[];
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Array.isArray(input.topicItemIds) || input.topicItemIds.length === 0) throw new Error("请至少提供一个主题档案");
  const uniqueTopicItemIds = Array.from(
    new Set(
      input.topicItemIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  if (uniqueTopicItemIds.length === 0) throw new Error("主题档案列表无效");
  const createdCases: Awaited<ReturnType<typeof importWritingEvalCaseFromTopicItem>>[] = [];
  const skipped: Array<{ topicItemId: number; reason: string }> = [];

  for (const topicItemId of uniqueTopicItemIds) {
    try {
      const created = await importWritingEvalCaseFromTopicItem({
        datasetId: input.datasetId,
        topicItemId,
        operatorUserId: input.operatorUserId,
      });
      createdCases.push(created);
    } catch (error) {
      skipped.push({
        topicItemId,
        reason: error instanceof Error ? error.message : "导入失败",
      });
    }
  }

  return {
    datasetId: input.datasetId,
    requestedTopicItemIds: uniqueTopicItemIds,
    createdCases,
    skipped,
  };
}

export async function importWritingEvalCaseFromFragment(input: {
  datasetId: number;
  fragmentId: number;
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Number.isInteger(input.fragmentId) || input.fragmentId <= 0) throw new Error("素材无效");
  const db = getDatabase();
  const [dataset, fragment] = await Promise.all([
    db.queryOne<Pick<WritingEvalDatasetRow, "id" | "code" | "name" | "description">>(
      "SELECT id, code, name, description FROM writing_eval_datasets WHERE id = ?",
      [input.datasetId],
    ),
    db.queryOne<WritingEvalFragmentImportRow>(
      `SELECT id, user_id, source_type, title, raw_content, distilled_content, source_url, screenshot_path, created_at
       FROM fragments
       WHERE id = ?`,
      [input.fragmentId],
    ),
  ]);
  if (!dataset) throw new Error("评测集不存在");
  if (!fragment) throw new Error("素材不存在");

  const taskCode = `fragment-${fragment.id}`;
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM writing_eval_cases WHERE dataset_id = ? AND task_code = ?",
    [input.datasetId, taskCode],
  );
  if (existing) throw new Error("该素材已导入当前评测集");

  const linkedCards = await db.query<WritingEvalFragmentKnowledgeCardRow>(
    `SELECT k.fragment_id, kc.id AS knowledge_card_id, kc.title, kc.summary, kc.card_type, kc.status, kc.confidence_score
     FROM knowledge_card_fragments k
     INNER JOIN knowledge_cards kc ON kc.id = k.knowledge_card_id
     WHERE k.fragment_id = ?
     ORDER BY kc.updated_at DESC, kc.id DESC`,
    [fragment.id],
  );
  const draft = buildWritingEvalFragmentCaseDraft({
    fragment,
    linkedCards: linkedCards.map((item) => ({
      id: item.knowledge_card_id,
      title: item.title,
      summary: item.summary,
      cardType: item.card_type,
      status: item.status,
      confidenceScore: item.confidence_score,
    })),
  });
  const resolvedTaskType = resolveWritingEvalTaskTypeForDatasetFocus({
    datasetFocusKey: inferWritingEvalDatasetFocus(dataset).key,
    baseTaskType: draft.taskType,
    sourceType: "fragment",
  });
  const created = await createWritingEvalCase({
    datasetId: input.datasetId,
    taskCode: draft.taskCode,
    taskType: resolvedTaskType,
    topicTitle: draft.topicTitle,
    sourceType: "fragment",
    sourceRef: `fragment:${fragment.id}`,
    sourceLabel: fragment.title || `fragment-${fragment.id}`,
    sourceUrl: fragment.source_url,
    inputPayload: draft.inputPayload,
    expectedConstraints: draft.expectedConstraints,
    viralTargets: draft.viralTargets,
    stageArtifactPayloads: draft.stageArtifactPayloads,
    referenceGoodOutput: draft.referenceGoodOutput,
    referenceBadPatterns: draft.referenceBadPatterns,
    difficultyLevel: draft.difficultyLevel,
    isEnabled: true,
  });

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_case_import_fragment",
    targetType: "writing_eval_case",
    targetId: created.id,
    payload: {
      datasetId: input.datasetId,
      fragmentId: fragment.id,
      taskCode: created.taskCode,
      taskType: created.taskType,
      difficultyLevel: created.difficultyLevel,
      sourceFactCount: draft.sourceFactCount,
      knowledgeCardCount: draft.knowledgeCardCount,
      historyReferenceCount: draft.historyReferenceCount,
      hasSourceUrl: draft.hasSourceUrl,
      hasScreenshot: draft.hasScreenshot,
    },
  });

  return created;
}

export async function importWritingEvalCasesFromFragments(input: {
  datasetId: number;
  fragmentIds: number[];
  operatorUserId?: number | null;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.datasetId) || input.datasetId <= 0) throw new Error("数据集无效");
  if (!Array.isArray(input.fragmentIds) || input.fragmentIds.length === 0) throw new Error("请至少提供一条素材");
  const uniqueFragmentIds = Array.from(
    new Set(
      input.fragmentIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  if (uniqueFragmentIds.length === 0) throw new Error("素材列表无效");
  const createdCases: Awaited<ReturnType<typeof importWritingEvalCaseFromFragment>>[] = [];
  const skipped: Array<{ fragmentId: number; reason: string }> = [];

  for (const fragmentId of uniqueFragmentIds) {
    try {
      const created = await importWritingEvalCaseFromFragment({
        datasetId: input.datasetId,
        fragmentId,
        operatorUserId: input.operatorUserId,
      });
      createdCases.push(created);
    } catch (error) {
      skipped.push({
        fragmentId,
        reason: error instanceof Error ? error.message : "导入失败",
      });
    }
  }

  return {
    datasetId: input.datasetId,
    requestedFragmentIds: uniqueFragmentIds,
    createdCases,
    skipped,
  };
}

export async function createWritingEvalCase(input: {
  datasetId: number;
  taskCode: string;
  taskType: string;
  topicTitle: string;
  sourceType?: string | null;
  sourceRef?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
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
      dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
      viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json, difficulty_level, is_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.datasetId,
      taskCode,
      taskType,
      topicTitle,
      String(input.sourceType || "").trim() || "manual",
      String(input.sourceRef || "").trim() || null,
      String(input.sourceLabel || "").trim() || null,
      String(input.sourceUrl || "").trim() || null,
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
    `SELECT id, dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
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
  sourceType?: string | null;
  sourceRef?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
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
    `SELECT id, dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
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
     SET task_code = ?, task_type = ?, topic_title = ?, source_type = ?, source_ref = ?, source_label = ?, source_url = ?, input_payload_json = ?, expected_constraints_json = ?,
         viral_targets_json = ?, stage_artifact_payloads_json = ?, reference_good_output = ?, reference_bad_patterns_json = ?, difficulty_level = ?,
         is_enabled = ?, updated_at = ?
     WHERE id = ?`,
    [
      String(input.taskCode ?? current.task_code).trim(),
      String(input.taskType ?? current.task_type).trim(),
      String(input.topicTitle ?? current.topic_title).trim(),
      String(input.sourceType ?? (current.source_type || "")).trim() || "manual",
      String(input.sourceRef ?? (current.source_ref || "")).trim() || null,
      String(input.sourceLabel ?? (current.source_label || "")).trim() || null,
      String(input.sourceUrl ?? (current.source_url || "")).trim() || null,
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
    `SELECT id, dataset_id, task_code, task_type, topic_title, source_type, source_ref, source_label, source_url, input_payload_json, expected_constraints_json,
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
    `SELECT r.id, r.run_code, r.dataset_id, r.source_schedule_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name, s.name AS source_schedule_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     LEFT JOIN writing_eval_run_schedules s ON s.id = r.source_schedule_id
     ORDER BY r.created_at DESC, r.id DESC`,
  );
  return rows.map(mapRun);
}

function summarizeRunScoreComparison(results: ReturnType<typeof mapRunResult>[]) {
  return {
    caseCount: results.length,
    averageTotalScore: averageNumbers(results.map((item) => item.totalScore)),
    averageQualityScore: averageNumbers(results.map((item) => item.qualityScore)),
    averageViralScore: averageNumbers(results.map((item) => item.viralScore)),
    averageHookScore: averageNumbers(results.map((item) => item.hookScore)),
  };
}

function deltaNumber(left: number | null, right: number | null) {
  return left == null || right == null ? null : Number((right - left).toFixed(4));
}

export async function getWritingEvalPrimaryShadowComparison(input: {
  primaryRunId: number;
  shadowRunId: number;
}) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(input.primaryRunId) || input.primaryRunId <= 0) throw new Error("primary run 无效");
  if (!Number.isInteger(input.shadowRunId) || input.shadowRunId <= 0) throw new Error("shadow run 无效");
  const db = getDatabase();
  const runs = await db.query<WritingOptimizationRunRow>(
    `SELECT r.id, r.run_code, r.dataset_id, r.source_schedule_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name, s.name AS source_schedule_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     LEFT JOIN writing_eval_run_schedules s ON s.id = r.source_schedule_id
     WHERE r.id IN (?, ?)
     ORDER BY r.id ASC`,
    [input.primaryRunId, input.shadowRunId],
  );
  const primaryRun = runs.find((item) => item.id === input.primaryRunId);
  const shadowRun = runs.find((item) => item.id === input.shadowRunId);
  if (!primaryRun || !shadowRun) throw new Error("primary/shadow run 不存在");
  if (primaryRun.dataset_id !== shadowRun.dataset_id) throw new Error("primary/shadow run 必须来自同一评测集");

  const resultRows = await db.query<WritingOptimizationResultRow>(
    `SELECT r.id, r.run_id, r.case_id, r.generated_title, r.generated_lead, r.generated_markdown,
            r.style_score, r.language_score, r.density_score, r.emotion_score, r.structure_score,
            r.topic_momentum_score, r.headline_score, r.hook_score, r.shareability_score, r.reader_value_score,
            r.novelty_score, r.platform_fit_score, r.quality_score, r.viral_score, r.factual_risk_penalty,
            r.ai_noise_penalty, r.total_score, r.judge_payload_json, r.created_at,
            c.task_code, c.task_type, c.topic_title, c.difficulty_level
     FROM writing_optimization_results r
     INNER JOIN writing_eval_cases c ON c.id = r.case_id
     WHERE r.run_id IN (?, ?)
     ORDER BY c.task_code ASC, r.id ASC`,
    [input.primaryRunId, input.shadowRunId],
  );
  const primaryResults = resultRows.filter((item) => item.run_id === input.primaryRunId).map(mapRunResult);
  const shadowResults = resultRows.filter((item) => item.run_id === input.shadowRunId).map(mapRunResult);
  const primaryByCaseId = new Map(primaryResults.map((item) => [item.caseId, item]));
  const pairedCases = shadowResults
    .map((shadow) => {
      const primary = primaryByCaseId.get(shadow.caseId);
      if (!primary) return null;
      return {
        caseId: shadow.caseId,
        taskCode: shadow.taskCode,
        topicTitle: shadow.topicTitle,
        primaryTotalScore: primary.totalScore,
        shadowTotalScore: shadow.totalScore,
        deltaTotalScore: deltaNumber(primary.totalScore, shadow.totalScore),
        primaryQualityScore: primary.qualityScore,
        shadowQualityScore: shadow.qualityScore,
        deltaQualityScore: deltaNumber(primary.qualityScore, shadow.qualityScore),
        primaryViralScore: primary.viralScore,
        shadowViralScore: shadow.viralScore,
        deltaViralScore: deltaNumber(primary.viralScore, shadow.viralScore),
        primaryHookScore: primary.hookScore,
        shadowHookScore: shadow.hookScore,
        deltaHookScore: deltaNumber(primary.hookScore, shadow.hookScore),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  const primarySummary = summarizeRunScoreComparison(primaryResults);
  const shadowSummary = summarizeRunScoreComparison(shadowResults);
  return {
    datasetId: primaryRun.dataset_id,
    primaryRun: mapRun(primaryRun),
    shadowRun: mapRun(shadowRun),
    primary: primarySummary,
    shadow: shadowSummary,
    delta: {
      totalScore: deltaNumber(primarySummary.averageTotalScore, shadowSummary.averageTotalScore),
      qualityScore: deltaNumber(primarySummary.averageQualityScore, shadowSummary.averageQualityScore),
      viralScore: deltaNumber(primarySummary.averageViralScore, shadowSummary.averageViralScore),
      hookScore: deltaNumber(primarySummary.averageHookScore, shadowSummary.averageHookScore),
    },
    pairedCaseCount: pairedCases.length,
    pairedCases,
  };
}

async function getLatestWritingEvalVersionLedgerByRef(
  versionType: string,
  candidateContent: string,
) {
  const db = getDatabase();
  return db.queryOne<WritingOptimizationVersionRow>(
    `SELECT id, version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
     FROM writing_optimization_versions
     WHERE version_type = ? AND candidate_content = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [versionType, candidateContent],
  );
}

async function getWritingEvalRunRolloutAuditSummaries(input: {
  rolloutKind: "prompt" | "asset";
  focusVersionType: string;
  focusVersionRef: string;
}) {
  const audits = await getWritingEvalRolloutAuditLogs(60);
  const items =
    input.rolloutKind === "prompt"
      ? audits.promptRolloutAuditLogs.filter((item) => {
          const payload = getRecord(item.payload);
          const promptId = String(payload.promptId || "").trim();
          const version = String(payload.version || "").trim();
          return `${promptId}@${version}` === input.focusVersionRef;
        })
      : audits.rolloutAuditLogs.filter((item) => {
          const payload = getRecord(item.payload);
          return String(payload.assetType || "").trim() === input.focusVersionType && String(payload.assetRef || "").trim() === input.focusVersionRef;
        });

  return items.slice(0, 6).map((item) => {
    const payload = getRecord(item.payload);
    const signals = getRecord(payload.signals);
    return {
      id: item.id,
      createdAt: item.createdAt,
      action: item.action,
      username: item.username,
      reason: String(payload.reason || "").trim() || null,
      riskLevel: String(payload.riskLevel || "").trim() || "stone",
      changes: getStringArray(payload.changes, 6),
      signals: {
        feedbackCount: getNumber(signals.feedbackCount),
        uniqueUsers: getNumber(signals.uniqueUsers),
        totalHitCount: getNumber(signals.totalHitCount),
        deltaTotalScore: getNumber(signals.deltaTotalScore),
        observedViralScore: getNumber(signals.observedViralScore),
        openRate: getNumber(signals.openRate),
        readCompletionRate: getNumber(signals.readCompletionRate),
      },
    };
  });
}

async function buildWritingEvalRunPostDecisionOps(runDetail: ReturnType<typeof mapRun>) {
  const focusVersionType =
    runDetail.resolutionStatus === "keep"
      ? runDetail.candidateVersionType
      : runDetail.resolutionStatus === "discard" || runDetail.resolutionStatus === "rollback"
        ? runDetail.baseVersionType
        : runDetail.recommendation === "keep"
          ? runDetail.candidateVersionType
          : runDetail.baseVersionType;
  const focusVersionRef =
    runDetail.resolutionStatus === "keep"
      ? runDetail.candidateVersionRef
      : runDetail.resolutionStatus === "discard" || runDetail.resolutionStatus === "rollback"
        ? runDetail.baseVersionRef
        : runDetail.recommendation === "keep"
          ? runDetail.candidateVersionRef
          : runDetail.baseVersionRef;
  const focusTargetKey = getWritingEvalVersionTargetKey(focusVersionType, focusVersionRef);
  const focusSource: "candidate" | "base" =
    focusVersionRef === runDetail.candidateVersionRef && focusVersionType === runDetail.candidateVersionType ? "candidate" : "base";

  const [baseLedgerRow, candidateLedgerRow, outcomeSummary] = await Promise.all([
    getLatestWritingEvalVersionLedgerByRef(runDetail.baseVersionType, runDetail.baseVersionRef),
    getLatestWritingEvalVersionLedgerByRef(runDetail.candidateVersionType, runDetail.candidateVersionRef),
    (await getArticleOutcomeVersionSummaries([{ versionType: focusVersionType, candidateContent: focusVersionRef }]))[0] ?? null,
  ]);

  const focusLedgerRow =
    focusVersionType === runDetail.candidateVersionType && focusVersionRef === runDetail.candidateVersionRef
      ? candidateLedgerRow
      : focusVersionType === runDetail.baseVersionType && focusVersionRef === runDetail.baseVersionRef
        ? baseLedgerRow
        : await getLatestWritingEvalVersionLedgerByRef(focusVersionType, focusVersionRef);

  if (isPromptBackedWritingEvalVersionType(focusVersionType)) {
    const { promptId, version } = resolvePromptBackedWritingEvalVersionRef(focusVersionType, focusVersionRef);
    const db = getDatabase();
    const [promptVersionRow, promptRolloutStats, rolloutAuditLogs] = await Promise.all([
      db.queryOne<WritingEvalPromptVersionRolloutRow>(
        `SELECT prompt_id, version, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json, is_active
         FROM prompt_versions
         WHERE prompt_id = ? AND version = ?
         LIMIT 1`,
        [promptId, version],
      ),
      db.queryOne<WritingEvalPromptRolloutObservationRow>(
        `SELECT prompt_id, version,
                COUNT(DISTINCT user_id) AS unique_user_count,
                COALESCE(SUM(hit_count), 0) AS total_hit_count,
                MAX(last_hit_at) AS last_hit_at,
                COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'observe%' THEN user_id END) AS observe_user_count,
                COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'plan:%' THEN user_id END) AS plan_user_count,
                COUNT(DISTINCT CASE WHEN resolution_reason LIKE 'percentage:%' THEN user_id END) AS percentage_user_count,
                COUNT(DISTINCT CASE WHEN resolution_reason = 'stable' THEN user_id END) AS stable_user_count
         FROM prompt_rollout_observations
         WHERE prompt_id = ? AND version = ?
         GROUP BY prompt_id, version`,
        [promptId, version],
      ),
      getWritingEvalRunRolloutAuditSummaries({
        rolloutKind: "prompt",
        focusVersionType,
        focusVersionRef,
      }),
    ]);
    return {
      focusVersionType,
      focusVersionRef,
      focusTargetKey,
      focusSource,
      candidateLedgerId: candidateLedgerRow?.id ?? null,
      baseLedgerId: baseLedgerRow?.id ?? null,
      focusLedgerId: focusLedgerRow?.id ?? null,
      focusLedgerDecision: focusLedgerRow?.decision ?? null,
      focusLedgerCreatedAt: focusLedgerRow?.created_at ?? null,
      canRollbackFocusLedger: focusLedgerRow?.decision === "keep",
      rolloutKind: "prompt" as const,
      isFocusActive: promptVersionRow ? Boolean(promptVersionRow.is_active) : false,
      rolloutConfig: promptVersionRow
        ? {
            autoMode: String(promptVersionRow.auto_mode || "").trim() || "manual",
            rolloutObserveOnly: Boolean(promptVersionRow.rollout_observe_only),
            rolloutPercentage: Number(promptVersionRow.rollout_percentage || 0),
            rolloutPlanCodes: parsePlanCodes(promptVersionRow.rollout_plan_codes_json),
            isEnabled:
              Boolean(promptVersionRow.rollout_observe_only)
              || Number(promptVersionRow.rollout_percentage || 0) > 0
              || parsePlanCodes(promptVersionRow.rollout_plan_codes_json).length > 0,
            notes: null,
          }
        : null,
      rolloutStats: promptRolloutStats
        ? {
            uniqueUserCount: promptRolloutStats.unique_user_count,
            totalHitCount: promptRolloutStats.total_hit_count,
            lastHitAt: promptRolloutStats.last_hit_at,
            observeUserCount: promptRolloutStats.observe_user_count,
            planUserCount: promptRolloutStats.plan_user_count,
            percentageUserCount: promptRolloutStats.percentage_user_count,
            stableUserCount: promptRolloutStats.stable_user_count,
          }
        : null,
      feedbackSummary: {
        feedbackCount: outcomeSummary?.feedbackCount ?? 0,
        averageObservedViralScore: outcomeSummary?.averageObservedViralScore ?? null,
        averageOpenRate: outcomeSummary?.averageOpenRate ?? null,
        averageReadCompletionRate: outcomeSummary?.averageReadCompletionRate ?? null,
      },
      rolloutAuditLogs,
    };
  }

  if (focusVersionType === "layout_strategy" || focusVersionType === "apply_command_template" || focusVersionType === "scoring_profile") {
    const db = getDatabase();
    const [assetRolloutRow, assetRolloutStats, activeAssetRow, activeScoringProfile, rolloutAuditLogs] = await Promise.all([
      db.queryOne<WritingEvalAssetRolloutRow>(
        `SELECT asset_type, asset_ref, auto_mode, rollout_observe_only, rollout_percentage, rollout_plan_codes_json, is_enabled, notes
         FROM writing_asset_rollouts
         WHERE asset_type = ? AND asset_ref = ?
         LIMIT 1`,
        [focusVersionType, focusVersionRef],
      ),
      db.queryOne<WritingEvalAssetRolloutObservationRow>(
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
        [focusVersionType, focusVersionRef],
      ),
      focusVersionType === "layout_strategy" || focusVersionType === "apply_command_template"
        ? db.queryOne<{ asset_ref: string }>(
            `SELECT asset_ref
             FROM writing_active_assets
             WHERE asset_type = ?
             LIMIT 1`,
            [focusVersionType],
          )
        : Promise.resolve(null),
      focusVersionType === "scoring_profile"
        ? db.queryOne<{ code: string }>(
            `SELECT code
             FROM writing_eval_scoring_profiles
             WHERE is_active = ?
             ORDER BY updated_at DESC, id DESC
             LIMIT 1`,
            [true],
          )
        : Promise.resolve(null),
      getWritingEvalRunRolloutAuditSummaries({
        rolloutKind: "asset",
        focusVersionType,
        focusVersionRef,
      }),
    ]);
    return {
      focusVersionType,
      focusVersionRef,
      focusTargetKey,
      focusSource,
      candidateLedgerId: candidateLedgerRow?.id ?? null,
      baseLedgerId: baseLedgerRow?.id ?? null,
      focusLedgerId: focusLedgerRow?.id ?? null,
      focusLedgerDecision: focusLedgerRow?.decision ?? null,
      focusLedgerCreatedAt: focusLedgerRow?.created_at ?? null,
      canRollbackFocusLedger: focusLedgerRow?.decision === "keep",
      rolloutKind: "asset" as const,
      isFocusActive:
        focusVersionType === "scoring_profile"
          ? activeScoringProfile?.code === focusVersionRef
          : activeAssetRow?.asset_ref === focusVersionRef,
      rolloutConfig: assetRolloutRow
        ? {
            autoMode: String(assetRolloutRow.auto_mode || "").trim() || "manual",
            rolloutObserveOnly: Boolean(assetRolloutRow.rollout_observe_only),
            rolloutPercentage: Number(assetRolloutRow.rollout_percentage || 0),
            rolloutPlanCodes: parsePlanCodes(assetRolloutRow.rollout_plan_codes_json),
            isEnabled: Boolean(assetRolloutRow.is_enabled),
            notes: String(assetRolloutRow.notes || "").trim() || null,
          }
        : null,
      rolloutStats: assetRolloutStats
        ? {
            uniqueUserCount: assetRolloutStats.unique_user_count,
            totalHitCount: assetRolloutStats.total_hit_count,
            lastHitAt: assetRolloutStats.last_hit_at,
            observeUserCount: assetRolloutStats.observe_user_count,
            planUserCount: assetRolloutStats.plan_user_count,
            percentageUserCount: assetRolloutStats.percentage_user_count,
            stableUserCount: assetRolloutStats.stable_user_count,
          }
        : null,
      feedbackSummary: {
        feedbackCount: outcomeSummary?.feedbackCount ?? 0,
        averageObservedViralScore: outcomeSummary?.averageObservedViralScore ?? null,
        averageOpenRate: outcomeSummary?.averageOpenRate ?? null,
        averageReadCompletionRate: outcomeSummary?.averageReadCompletionRate ?? null,
      },
      rolloutAuditLogs,
    };
  }

  return {
    focusVersionType,
    focusVersionRef,
    focusTargetKey,
    focusSource,
    candidateLedgerId: candidateLedgerRow?.id ?? null,
    baseLedgerId: baseLedgerRow?.id ?? null,
    focusLedgerId: focusLedgerRow?.id ?? null,
    focusLedgerDecision: focusLedgerRow?.decision ?? null,
    focusLedgerCreatedAt: focusLedgerRow?.created_at ?? null,
    canRollbackFocusLedger: focusLedgerRow?.decision === "keep",
    rolloutKind: "unsupported" as const,
    isFocusActive: null,
    rolloutConfig: null,
    rolloutStats: null,
    feedbackSummary: {
      feedbackCount: outcomeSummary?.feedbackCount ?? 0,
      averageObservedViralScore: outcomeSummary?.averageObservedViralScore ?? null,
      averageOpenRate: outcomeSummary?.averageOpenRate ?? null,
      averageReadCompletionRate: outcomeSummary?.averageReadCompletionRate ?? null,
    },
    rolloutAuditLogs: [],
  };
}

export async function getWritingEvalRunDetail(runId: number) {
  await ensureExtendedProductSchema();
  if (!Number.isInteger(runId) || runId <= 0) throw new Error("实验运行无效");
  const db = getDatabase();
  const run = await db.queryOne<WritingOptimizationRunRow>(
    `SELECT r.id, r.run_code, r.dataset_id, r.source_schedule_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name, s.name AS source_schedule_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     LEFT JOIN writing_eval_run_schedules s ON s.id = r.source_schedule_id
     WHERE r.id = ?`,
    [runId],
  );
  if (!run) {
    throw new Error("实验运行不存在");
  }
  const jobRunFilter = getWritingEvalJobRunFilterSql(runId);
  const [results, jobRows, retryAuditRows] = await Promise.all([
    db.query<WritingOptimizationResultRow>(
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
    ),
    db.query<WritingEvalJobQueueRow>(
      `SELECT id, job_type, status, payload_json, run_at, attempts, locked_at, last_error, created_at, updated_at
       FROM job_queue
       WHERE job_type IN (?, ?, ?)
         AND ${jobRunFilter.clause}
       ORDER BY id ASC`,
      ["writingEvalRun", "writingEvalScore", "writingEvalPromote", ...jobRunFilter.params],
    ),
    db.query<WritingEvalRetryAuditRow>(
      `SELECT a.id, u.username, a.payload_json, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action = ?
         AND a.target_type = ?
         AND a.target_id = ?
       ORDER BY a.id ASC`,
      ["writing_eval_retry", "writing_optimization_run", String(runId)],
    ),
  ]);
  const mappedRun = mapRun(run);
  const stageAttemptMap = new Map<string, number>();
  const jobHistory = jobRows.map((row) => {
    const stageMeta = getWritingEvalStageMetaForJobType(row.job_type);
    const attemptIndex = (stageAttemptMap.get(stageMeta.stageKey) ?? 0) + 1;
    stageAttemptMap.set(stageMeta.stageKey, attemptIndex);
    const payload = parseJsonObject(row.payload_json);
    return {
      id: row.id,
      jobType: row.job_type,
      stageKey: stageMeta.stageKey,
      stageLabel: stageMeta.stageLabel,
      attemptIndex,
      status: row.status,
      runAt: row.run_at,
      queuedAt: row.created_at,
      startedAt: row.locked_at,
      finishedAt: row.status === "completed" || row.status === "failed" ? row.updated_at : null,
      updatedAt: row.updated_at,
      lastError: row.last_error,
      retryCount: Number(row.attempts || 0),
      runCode: String(payload.runCode || "").trim() || null,
    };
  });
  const retryHistory = retryAuditRows.map((row) => {
    const payload = parseJsonObject(row.payload_json);
    const retriedAt = String(payload.retriedAt || "").trim() || null;
    const runCode = String(payload.runCode || "").trim() || null;
    return {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      retriedAt,
      runCode,
    };
  });
  return {
    ...mappedRun,
    results: results.map(mapRunResult),
    jobHistory,
    retryHistory,
    postDecisionOps: await buildWritingEvalRunPostDecisionOps(mappedRun),
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

export async function promoteWritingEvalRun(input: { runId: number; reason?: string | null; operatorUserId?: number | null }) {
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
  const approvalReason = String(input.reason || "").trim();
  const isRiskOverride = decision.suggestion !== "keep";
  if (isRiskOverride && !approvalReason) {
    throw new Error("当前 run 命中风险守卫，keep 前必须填写审批理由");
  }
  const sourceVersion = runDetail.baseVersionRef;
  let promotionTarget: Record<string, unknown> = {};
  if (isPromptBackedWritingEvalVersionType(runDetail.candidateVersionType)) {
    const { promptId, version } = resolvePromptBackedWritingEvalVersionRef(runDetail.candidateVersionType, runDetail.candidateVersionRef);
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
    throw new Error("当前仅支持保留 prompt_version、fact_check、title_template、lead_template、scoring_profile、layout_strategy 与 apply_command_template 类型");
  }
  const resolvedAt = new Date().toISOString();
  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO writing_optimization_versions (
        version_type, target_key, source_version, candidate_content, score_summary_json, decision, decision_reason, approved_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runDetail.candidateVersionType,
        getWritingEvalVersionTargetKey(runDetail.candidateVersionType, runDetail.candidateVersionRef),
        sourceVersion,
        runDetail.candidateVersionRef,
        {
          ...runDetail.scoreSummary,
          runId: runDetail.id,
          runCode: runDetail.runCode,
          recommendation: runDetail.recommendation,
          riskOverrideApprovalRequired: isRiskOverride,
          riskOverrideApprovalReason: isRiskOverride ? approvalReason : null,
          riskOverrideApprovedBy: isRiskOverride ? input.operatorUserId ?? null : null,
        },
        "keep",
        approvalReason || decision.reason,
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
      approvalMode: isRiskOverride ? "risk_override" : "normal_keep",
      approvalReason: approvalReason || null,
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
  const targetKey = getWritingEvalVersionTargetKey(runDetail.candidateVersionType, runDetail.candidateVersionRef);
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
    await appendAuditLog({
      userId: input.operatorUserId ?? null,
      action: "writing_eval_auto_resolve",
      targetType: "writing_optimization_run",
      targetId: input.runId,
      payload: {
        runCode: runDetail.runCode,
        decision: "keep",
        recommendation: runDetail.recommendation,
        recommendationReason: runDetail.recommendationReason,
        decisionMode: runDetail.decisionMode,
        reason: String(input.reason || "").trim() || null,
      },
    });
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
  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_auto_resolve",
    targetType: "writing_optimization_run",
    targetId: input.runId,
    payload: {
      runCode: runDetail.runCode,
      decision: "discard",
      recommendation: runDetail.recommendation,
      recommendationReason: runDetail.recommendationReason,
      decisionMode: runDetail.decisionMode,
      reason: String(input.reason || "").trim() || runDetail.recommendationReason || "自动 discard",
    },
  });
  return {
    action: "discard",
    run: discarded,
  };
}

export async function autoResolveWritingEvalRuns(input?: {
  operatorUserId?: number | null;
  limit?: number;
  dryRun?: boolean;
}) {
  const limit = Math.min(Math.max(Math.round(Number(input?.limit ?? 6)), 1), 24);
  const runs = await getWritingEvalRuns();
  const candidates = runs
    .filter((run) => run.status === "succeeded" && run.resolutionStatus === "pending")
    .filter((run) => {
      if (run.decisionMode === "auto_keep") {
        return run.recommendation === "keep";
      }
      if (run.decisionMode === "auto_keep_or_discard") {
        return run.recommendation === "keep" || run.recommendation === "discard";
      }
      return false;
    })
    .slice(0, limit);

  if (input?.dryRun) {
    return {
      dryRun: true,
      scannedCount: candidates.length,
      resolvedCount: 0,
      keepCount: 0,
      discardCount: 0,
      noopCount: 0,
      failureCount: 0,
      items: candidates.map((run) => ({
        runId: run.id,
        runCode: run.runCode,
        decisionMode: run.decisionMode,
        recommendation: run.recommendation,
        recommendationReason: run.recommendationReason,
      })),
    };
  }

  const results: Array<{
    runId: number;
    runCode: string;
    action: "keep" | "discard" | "noop" | "failed";
    decisionMode: string;
    recommendation: string;
    message: string;
  }> = [];

  for (const run of candidates) {
    try {
      const resolved = await autoResolveWritingEvalRun({
        runId: run.id,
        operatorUserId: input?.operatorUserId ?? null,
      });
      results.push({
        runId: run.id,
        runCode: run.runCode,
        action: resolved.action === "keep" || resolved.action === "discard" ? resolved.action : "noop",
        decisionMode: run.decisionMode,
        recommendation: run.recommendation,
        message:
          resolved.action === "keep"
            ? "已自动 keep"
            : resolved.action === "discard"
              ? "已自动 discard"
              : "无需处理",
      });
    } catch (error) {
      results.push({
        runId: run.id,
        runCode: run.runCode,
        action: "failed",
        decisionMode: run.decisionMode,
        recommendation: run.recommendation,
        message: error instanceof Error ? error.message : "自动决议失败",
      });
    }
  }

  const summary = {
    dryRun: false,
    scannedCount: candidates.length,
    resolvedCount: results.filter((item) => item.action === "keep" || item.action === "discard").length,
    keepCount: results.filter((item) => item.action === "keep").length,
    discardCount: results.filter((item) => item.action === "discard").length,
    noopCount: results.filter((item) => item.action === "noop").length,
    failureCount: results.filter((item) => item.action === "failed").length,
    items: results,
  };

  await appendAuditLog({
    userId: input?.operatorUserId ?? null,
    action: "writing_eval_auto_resolve_batch",
    targetType: "writing_optimization_run",
    payload: summary,
  });

  return summary;
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

  if (isPromptBackedWritingEvalVersionType(versionRow.version_type)) {
    const target = resolvePromptBackedWritingEvalVersionRef(versionRow.version_type, rollbackTarget);
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
    throw new Error("当前仅支持 prompt_version、fact_check、title_template、lead_template、scoring_profile、layout_strategy 与 apply_command_template 的回滚");
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

export type WritingEvalInsightsRiskLedgerItem = {
  key: string;
  tone: "cinnabar" | "amber";
  source: "execution" | "rollout" | "calibration" | "sample";
  title: string;
  detail: string;
  meta: string;
  occurredAt: string;
  runId: number | null;
  resultId: number | null;
  datasetId: number | null;
  caseId: number | null;
  assetType: string | null;
  assetRef: string | null;
  recommendedAction: {
    actionType: "retry_run" | "set_rollout_observe" | "set_rollout_trial" | "pause_rollout";
    label: string;
    reason: string;
    priorityHint?: number | null;
    strategyTags?: string[] | null;
    runId: number | null;
    assetType: string | null;
    assetRef: string | null;
  } | null;
};

export type WritingEvalInsightsRiskLedger = {
  generatedAt: string;
  windowDays: number;
  totalCount: number;
  highPriorityCount: number;
  summary: {
    failedJobCount: number;
    retryCount: number;
    highRiskRolloutCount: number;
    shrinkActionCount: number;
    falsePositiveCount: number;
    linkedFeedbackCount: number;
  };
  sourceBreakdown: Array<{
    key: "execution" | "rollout" | "calibration" | "sample";
    label: string;
    tone: "cinnabar" | "amber";
    value: number;
  }>;
  items: WritingEvalInsightsRiskLedgerItem[];
};

export function buildWritingEvalInsightsRiskLedger(input: {
  insights: Awaited<ReturnType<typeof getWritingEvalInsights>>;
  combinedRolloutAuditLogs: Awaited<ReturnType<typeof getWritingEvalRolloutAuditLogs>>["combinedRolloutAuditLogs"];
  recentWindowDays?: number;
  maxItems?: number;
}) {
  const recentWindowDays = Math.min(Math.max(Math.round(Number(input.recentWindowDays ?? 7)), 1), 30);
  const maxItems = Math.min(Math.max(Math.round(Number(input.maxItems ?? 12)), 1), 48);
  const now = new Date();
  const generatedAt = now.toISOString();
  const cutoffMs = now.getTime() - recentWindowDays * 24 * 60 * 60 * 1000;
  const onlineCalibration = input.insights.onlineCalibration as ReturnType<typeof buildOnlineCalibrationInsights>;
  const executionInsights = input.insights.executionInsights as ReturnType<typeof buildWritingEvalExecutionInsights>;
  const falsePositiveCases = Array.isArray(onlineCalibration.falsePositiveCases) ? onlineCalibration.falsePositiveCases : [];
  const recentAutoRolloutTrend = normalizeWritingEvalRolloutAuditLogs(input.combinedRolloutAuditLogs)
    .map((item) => ({
      ...item,
      assetType: item.assetType || null,
      assetRef: item.assetRef || null,
      reason: item.reason || "无原因",
    }))
    .filter((item) => {
      const ts = new Date(item.createdAt).getTime();
      return Number.isFinite(ts) && ts >= cutoffMs;
    });
  const rolloutLogsByAsset = new Map<string, typeof recentAutoRolloutTrend>();
  for (const item of recentAutoRolloutTrend) {
    const assetKey = item.assetType && item.assetRef ? `${item.assetType}:${item.assetRef}` : null;
    if (!assetKey) continue;
    const current = rolloutLogsByAsset.get(assetKey) ?? [];
    current.push(item);
    rolloutLogsByAsset.set(assetKey, current);
  }
  const rolloutRiskItems: WritingEvalInsightsRiskLedgerItem[] = recentAutoRolloutTrend
    .filter((item) => item.riskLevel === "cinnabar")
    .slice(0, 6)
    .map((item) => {
      const assetKey = item.assetType && item.assetRef ? `${item.assetType}:${item.assetRef}` : null;
      const assetLogs = assetKey ? (rolloutLogsByAsset.get(assetKey) ?? []) : [];
      const recentAssetLogs = assetLogs
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 3);
      const recentCinnabarCount = recentAssetLogs.filter((log) => log.riskLevel === "cinnabar").length;
      const recentShrinkCount = recentAssetLogs.filter((log) => log.direction === "shrink").length;
      const shouldPause =
        recentCinnabarCount >= 2
        || recentShrinkCount >= 2
        || (item.deltaTotalScore ?? 0) <= -3
        || ((item.feedbackCount ?? 0) >= 3 && (((item.openRate ?? 100) < 8) || ((item.readCompletionRate ?? 100) < 15)));
      const strategyTags = [
        recentCinnabarCount >= 2 ? "repeat_cinnabar" : null,
        recentShrinkCount >= 2 ? "repeat_shrink" : null,
        (item.deltaTotalScore ?? 0) <= -3 ? "negative_delta" : null,
        ((item.feedbackCount ?? 0) >= 3 && ((item.openRate ?? 100) < 8 || (item.readCompletionRate ?? 100) < 15)) ? "weak_feedback" : null,
      ].filter((tag): tag is string => Boolean(tag));
      return {
        key: `rollout-${item.id}`,
        tone: "cinnabar",
        source: "rollout",
        title: `${item.directionLabel} · ${item.assetType || "asset"} · ${item.assetRef || "--"}`,
        detail: item.reason,
        meta: `高风险自动放量 · ${item.createdAt}`,
        occurredAt: item.createdAt,
        runId: null,
        resultId: null,
        datasetId: null,
        caseId: null,
        assetType: item.assetType,
        assetRef: item.assetRef,
        recommendedAction:
          item.assetType && item.assetRef
            ? {
                actionType: shouldPause ? "pause_rollout" : "set_rollout_observe",
                label: shouldPause ? "暂停灰度" : "切回观察",
                reason: shouldPause
                  ? "该对象近期连续出现高风险放量/收缩信号，且收益边际不足，先暂停灰度避免继续消耗样本。"
                  : "高风险自动放量后，先切回观察流量，避免继续扩量。",
                priorityHint: shouldPause ? 520 : 340,
                strategyTags,
                runId: null,
                assetType: item.assetType,
                assetRef: item.assetRef,
              }
            : null,
      };
    });
  const executionRiskItems: WritingEvalInsightsRiskLedgerItem[] = executionInsights.recentFailures.slice(0, 6).map((item) => ({
    key: `execution-${item.jobId}`,
    tone: "cinnabar",
    source: "execution",
    title: `${item.stageLabel} 失败 · ${item.runCode || `run#${item.runId ?? "--"}`}`,
    detail: item.lastError || "该阶段执行失败，建议优先查看 run 详情和 worker 日志。",
    meta: `stage job #${item.jobId} · ${item.failedAt}`,
    occurredAt: item.failedAt,
    runId: item.runId,
    resultId: null,
    datasetId: null,
    caseId: null,
    assetType: null,
    assetRef: null,
    recommendedAction:
      item.runId
        ? {
            actionType: "retry_run",
            label: "重试 Run",
            reason: "当前 run 出现阶段失败，优先拉起一次重试验证是否为瞬时异常。",
            priorityHint: 220,
            strategyTags: [item.stageKey, "stage_failure"],
            runId: item.runId,
            assetType: null,
            assetRef: null,
          }
        : null,
  }));
  const calibrationRiskItems: WritingEvalInsightsRiskLedgerItem[] = falsePositiveCases.slice(0, 6).map((item, index) => ({
    key: `calibration-${item.runId ?? item.feedbackId ?? index}`,
    tone: "amber",
    source: "calibration",
    title: `线上误判 · ${item.topicTitle || item.articleTitle || item.taskCode || "未命名样本"}`,
    detail: `离线 ${formatMetricNumber(item.predictedViralScore)} -> 线上 ${formatMetricNumber(item.observedViralScore)}，校准偏差 ${formatMetricNumber(item.calibrationGap)}。`,
    meta: item.sourceLabel || item.taskCode || "回流校准样本",
    occurredAt: generatedAt,
    runId: item.runId,
    resultId: item.resultId,
    datasetId: null,
    caseId: null,
    assetType: null,
    assetRef: null,
    recommendedAction: null,
  }));
  const sampleRiskItems: WritingEvalInsightsRiskLedgerItem[] = input.insights.failingCases
    .slice(0, 6)
    .map((item) => ({
      key: `sample-${item.runId}-${item.caseId}`,
      tone: "amber",
      source: "sample",
      title: `失败样本 · ${item.taskCode}`,
      detail: item.reason,
      meta: item.runCode,
      occurredAt: generatedAt,
      runId: item.runId,
      resultId: item.resultId,
      datasetId: item.datasetId,
      caseId: item.caseId,
      assetType: null,
      assetRef: null,
      recommendedAction: null,
    }));
  const items = [...executionRiskItems, ...rolloutRiskItems, ...calibrationRiskItems, ...sampleRiskItems]
    .sort((left, right) => {
      const toneRank = left.tone === right.tone ? 0 : left.tone === "cinnabar" ? -1 : 1;
      if (toneRank !== 0) return toneRank;
      return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    })
    .slice(0, maxItems);

  return {
    generatedAt,
    windowDays: recentWindowDays,
    totalCount: items.length,
    highPriorityCount: items.filter((item) => item.tone === "cinnabar").length,
    summary: {
      failedJobCount: executionInsights.currentWindow.failedJobCount,
      retryCount: executionInsights.currentWindow.retryCount,
      highRiskRolloutCount: rolloutRiskItems.length,
      shrinkActionCount: recentAutoRolloutTrend.filter((item) => item.direction === "shrink").length,
      falsePositiveCount: falsePositiveCases.length,
      linkedFeedbackCount: Number(onlineCalibration.linkedResultCount ?? 0),
    },
    sourceBreakdown: [
      { key: "execution", label: "执行失败", value: executionRiskItems.length, tone: "cinnabar" },
      { key: "rollout", label: "高风险放量", value: rolloutRiskItems.length, tone: "cinnabar" },
      { key: "calibration", label: "线上误判", value: calibrationRiskItems.length, tone: "amber" },
      { key: "sample", label: "失败样本", value: sampleRiskItems.length, tone: "amber" },
    ],
    items,
  } satisfies WritingEvalInsightsRiskLedger;
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

  const [onlineFeedbackRows, articleOutcomeItems, executionJobRows, retryAuditRows] = await Promise.all([
    db.query<WritingEvalOnlineFeedbackRow>(
      `${getWritingEvalFeedbackSelectSql()}
       WHERE f.result_id IS NOT NULL
       ORDER BY f.captured_at DESC, f.id DESC
       LIMIT 240`,
    ),
    getArticleOutcomeCalibrationItems(240),
    db.query<WritingEvalJobQueueRow>(
      `SELECT id, job_type, status, payload_json, run_at, attempts, locked_at, last_error, created_at, updated_at
       FROM job_queue
       WHERE job_type IN (?, ?, ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 480`,
      ["writingEvalRun", "writingEvalScore", "writingEvalPromote"],
    ),
    db.query<WritingEvalRetryAuditAggregateRow>(
      `SELECT a.id, a.target_id, u.username, a.payload_json, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action = ?
         AND a.target_type = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 240`,
      ["writing_eval_retry", "writing_optimization_run"],
    ),
  ]);
  const onlineCalibration = buildOnlineCalibrationInsights([
    ...onlineFeedbackRows.map(mapFeedback),
    ...articleOutcomeItems,
  ]);
  const executionInsights = buildWritingEvalExecutionInsights({
    jobRows: executionJobRows,
    retryAuditRows,
  });
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
    executionInsights,
  };
}

export async function getPlan17QualityReport(): Promise<WritingEvalPlan17QualityReport> {
  await ensureExtendedProductSchema();
  const seedResult = await ensureWritingEvalDatasetPresets();
  const datasets = await getWritingEvalDatasets();
  const plan17Datasets = datasets.filter((dataset) => isPlan17WritingEvalFocusKey(dataset.focus.key));
  const datasetIds = plan17Datasets.map((dataset) => dataset.id);
  const db = getDatabase();
  const activePromptVersionRows = await db.query<{ prompt_id: string; version: string }>(
    `SELECT prompt_id, version
     FROM prompt_versions
     WHERE is_active = ?`,
    [true],
  );
  const activePromptVersionMap = new Map(activePromptVersionRows.map((row) => [row.prompt_id, row.version]));

  const caseRows = datasetIds.length > 0
    ? await db.query<{
        id: number;
        dataset_id: number;
        task_type: string;
        source_type: string;
        source_ref: string | null;
        input_payload_json: string | Record<string, unknown>;
        stage_artifact_payloads_json: string | Record<string, unknown>;
        is_enabled: number | boolean;
      }>(
        `SELECT id, dataset_id, task_type, source_type, source_ref, input_payload_json, stage_artifact_payloads_json, is_enabled
         FROM writing_eval_cases
         WHERE dataset_id IN (${datasetIds.map(() => "?").join(", ")})`,
        datasetIds,
      )
    : [];
  const caseArticleIds = Array.from(
    new Set(
      caseRows
        .map((row) => parseArticleIdFromSourceRef(row.source_type, row.source_ref))
        .filter((value): value is number => value != null),
    ),
  );
  const articleStrategyRows = caseArticleIds.length > 0
    ? await db.query<{
        article_id: number;
        archetype: string | null;
        mainstreamBelief: string | null;
        targetReader: string | null;
        coreAssertion: string | null;
        whyNow: string | null;
        researchHypothesis: string | null;
        marketPositionInsight: string | null;
        historicalTurningPoint: string | null;
        targetPackage: string | null;
        publishWindow: string | null;
        endingAction: string | null;
        firstHandObservation: string | null;
        feltMoment: string | null;
        whyThisHitMe: string | null;
        realSceneOrDialogue: string | null;
        wantToComplain: string | null;
        nonDelegableTruth: string | null;
        fourPointAudit: string | Record<string, unknown> | null;
      }>(
        `SELECT article_id, archetype,
                mainstream_belief AS mainstreamBelief,
                target_reader AS targetReader,
                core_assertion AS coreAssertion,
                why_now AS whyNow,
                research_hypothesis AS researchHypothesis,
                market_position_insight AS marketPositionInsight,
                historical_turning_point AS historicalTurningPoint,
                target_package AS targetPackage,
                publish_window AS publishWindow,
                ending_action AS endingAction,
                first_hand_observation AS firstHandObservation,
                felt_moment AS feltMoment,
                why_this_hit_me AS whyThisHitMe,
                real_scene_or_dialogue AS realSceneOrDialogue,
                want_to_complain AS wantToComplain,
                non_delegable_truth AS nonDelegableTruth,
                four_point_audit_json AS fourPointAudit
         FROM article_strategy_cards
         WHERE article_id IN (${caseArticleIds.map(() => "?").join(", ")})`,
        caseArticleIds,
      )
    : [];
  const articleOutcomeRows = caseArticleIds.length > 0
    ? await db.query<{ article_id: number; attribution_json: string | Record<string, unknown> | null }>(
        `SELECT article_id, attribution_json
         FROM article_outcomes
         WHERE article_id IN (${caseArticleIds.map(() => "?").join(", ")})`,
        caseArticleIds,
      )
    : [];
  const articleDeepWritingRows = caseArticleIds.length > 0
    ? await db.query<{ article_id: number; payload_json: string | Record<string, unknown> | null }>(
        `SELECT article_id, payload_json
         FROM article_stage_artifacts
         WHERE article_id IN (${caseArticleIds.map(() => "?").join(", ")})
           AND stage_code = ?`,
        [...caseArticleIds, "deepWriting"],
      )
    : [];
  const runRows = datasetIds.length > 0
    ? await db.query<{
        id: number;
        dataset_id: number;
        status: string;
        candidate_version_type: string;
        candidate_version_ref: string;
        created_at: string;
      }>(
        `SELECT id, dataset_id, status, candidate_version_type, candidate_version_ref, created_at
         FROM writing_optimization_runs
         WHERE dataset_id IN (${datasetIds.map(() => "?").join(", ")})
         ORDER BY created_at DESC, id DESC`,
        datasetIds,
      )
    : [];
  const feedbackRows = datasetIds.length > 0
    ? await db.query<{
        result_id: number | null;
        case_id: number | null;
        article_id: number | null;
        dataset_id: number;
        predicted_total_score: number | null;
        open_rate: number | null;
        read_completion_rate: number | null;
        share_rate: number | null;
        favorite_rate: number | null;
        article_attribution_json: string | Record<string, unknown> | null;
      }>(
        `SELECT f.result_id,
                r.case_id,
                f.article_id,
                run.dataset_id,
                r.total_score AS predicted_total_score,
                f.open_rate,
                f.read_completion_rate,
                f.share_rate,
                f.favorite_rate,
                ao.attribution_json AS article_attribution_json
         FROM writing_eval_online_feedback f
         INNER JOIN writing_optimization_results r ON r.id = f.result_id
         INNER JOIN writing_optimization_runs run ON run.id = r.run_id
         LEFT JOIN article_outcomes ao ON ao.article_id = f.article_id
         WHERE f.result_id IS NOT NULL
           AND run.dataset_id IN (${datasetIds.map(() => "?").join(", ")})`,
        datasetIds,
      )
    : [];
  const qualityLabelRows = datasetIds.length > 0
    ? await db.query<WritingEvalCaseQualityLabelRow>(
        `SELECT id, case_id, dataset_id, focus_key, strategy_manual_score, evidence_expected_tags_json, evidence_detected_tags_json,
                notes, created_by, created_at, updated_at
         FROM writing_eval_case_quality_labels
         WHERE dataset_id IN (${datasetIds.map(() => "?").join(", ")})`,
        datasetIds,
      )
    : [];
  const latestQualityLabelRows = keepLatestQualityLabelsByCase(qualityLabelRows);
  const resultRows = datasetIds.length > 0
    ? await db.query<{
        id: number;
        run_id: number;
        dataset_id: number;
        case_id: number;
        generated_markdown: string;
        total_score: number | null;
        judge_payload_json: string | Record<string, unknown>;
        created_at: string;
      }>(
        `SELECT result.id, run.id AS run_id, run.dataset_id, result.case_id, result.generated_markdown, result.total_score, result.judge_payload_json, result.created_at
         FROM writing_optimization_results result
         INNER JOIN writing_optimization_runs run ON run.id = result.run_id
         WHERE run.dataset_id IN (${datasetIds.map(() => "?").join(", ")})
         ORDER BY result.created_at DESC, result.id DESC`,
        datasetIds,
      )
    : [];

  const casesByDataset = new Map<number, typeof caseRows>();
  for (const row of caseRows) {
    const current = casesByDataset.get(row.dataset_id) ?? [];
    current.push(row);
    casesByDataset.set(row.dataset_id, current);
  }
  const runsByDataset = new Map<number, typeof runRows>();
  for (const row of runRows) {
    const current = runsByDataset.get(row.dataset_id) ?? [];
    current.push(row);
    runsByDataset.set(row.dataset_id, current);
  }
  const feedbackByDataset = new Map<number, typeof feedbackRows>();
  for (const row of feedbackRows) {
    const current = feedbackByDataset.get(row.dataset_id) ?? [];
    current.push(row);
    feedbackByDataset.set(row.dataset_id, current);
  }
  const articleStrategyCardByArticleId = new Map(
    articleStrategyRows.map((row) => [
      row.article_id,
      {
        ...row,
        fourPointAudit: parseJsonObject(row.fourPointAudit),
      } satisfies Record<string, unknown>,
    ]),
  );
  const articleOutcomeAttributionByArticleId = new Map(
    articleOutcomeRows.map((row) => [row.article_id, parseJsonObject(row.attribution_json)]),
  );
  const articleDeepWritingPayloadByArticleId = new Map(
    articleDeepWritingRows.map((row) => [row.article_id, parseJsonObject(row.payload_json)]),
  );
  const runsById = new Map(runRows.map((row) => [row.id, row]));
  const labelsByDataset = new Map<number, WritingEvalCaseQualityLabelRow[]>();
  for (const row of latestQualityLabelRows) {
    const current = labelsByDataset.get(row.dataset_id) ?? [];
    current.push(row);
    labelsByDataset.set(row.dataset_id, current);
  }
  const caseContextById = new Map(
    caseRows.map((row) => {
      const articleId = parseArticleIdFromSourceRef(row.source_type, row.source_ref);
      return [
        row.id,
        {
          articleId,
          inputPayload: parseJsonObject(row.input_payload_json),
          stageArtifactPayloads: parseJsonObject(row.stage_artifact_payloads_json),
          articleStrategyCard: articleId != null ? articleStrategyCardByArticleId.get(articleId) ?? null : null,
          articleOutcomeAttribution: articleId != null ? articleOutcomeAttributionByArticleId.get(articleId) ?? null : null,
          articleDeepWritingPayload: articleId != null ? articleDeepWritingPayloadByArticleId.get(articleId) ?? null : null,
        },
      ] as const;
    }),
  );
  const resultById = new Map(resultRows.map((row) => [row.id, row]));
  const latestResultByDatasetCaseKey = new Map<string, { totalScore: number | null }>();
  for (const row of resultRows) {
    const key = `${row.dataset_id}@@${row.case_id}`;
    if (!latestResultByDatasetCaseKey.has(key)) {
      latestResultByDatasetCaseKey.set(key, {
        totalScore: typeof row.total_score === "number" && Number.isFinite(row.total_score) ? row.total_score : null,
      });
    }
  }

  const focusKeys = Array.from(
    new Set(
      getWritingEvalDatasetCreatePresets()
        .map((preset) => preset.key)
        .filter((key): key is WritingEvalPlan17FocusKey => isPlan17WritingEvalFocusKey(key)),
    ),
  );

  const focuses = focusKeys.map((focusKey) => {
    const focusMeta = getWritingEvalDatasetFocusMeta(focusKey);
    const matchedDatasets = plan17Datasets.filter((dataset) => dataset.focus.key === focusKey);
    const caseItems = matchedDatasets.flatMap((dataset) => casesByDataset.get(dataset.id) ?? []);
    const runItems = matchedDatasets.flatMap((dataset) => runsByDataset.get(dataset.id) ?? []);
    const feedbackItems = matchedDatasets.flatMap((dataset) => feedbackByDataset.get(dataset.id) ?? []);
    const labelItems = matchedDatasets.flatMap((dataset) => labelsByDataset.get(dataset.id) ?? []);
    const observedPairs = feedbackItems
      .map((item) => ({
        predictedTotalScore:
          typeof item.predicted_total_score === "number" && Number.isFinite(item.predicted_total_score)
            ? item.predicted_total_score
            : null,
        observedViralScore: computeObservedViralScore({
          openRate: item.open_rate,
          readCompletionRate: item.read_completion_rate,
          shareRate: item.share_rate,
          favoriteRate: item.favorite_rate,
        }),
        readCompletionRate:
          typeof item.read_completion_rate === "number" && Number.isFinite(item.read_completion_rate)
            ? item.read_completion_rate
            : null,
      }))
      .filter(
        (item): item is { predictedTotalScore: number; observedViralScore: number | null; readCompletionRate: number | null } =>
          typeof item.predictedTotalScore === "number" && Number.isFinite(item.predictedTotalScore),
      );
    const scoreVsObservedPairs = observedPairs.filter(
      (item): item is { predictedTotalScore: number; observedViralScore: number; readCompletionRate: number | null } =>
        typeof item.observedViralScore === "number" && Number.isFinite(item.observedViralScore),
    );
    const rhythmDeviationPairs = feedbackItems
      .map((item) => {
        if (typeof item.read_completion_rate !== "number" || !Number.isFinite(item.read_completion_rate)) {
          return null;
        }
        const result = item.result_id != null ? resultById.get(item.result_id) ?? null : null;
        const caseContext = item.case_id != null ? caseContextById.get(item.case_id) ?? null : null;
        if (!result || !caseContext) {
          return null;
        }
        const articleOutcomeAttribution =
          item.article_id != null
            ? parseJsonObject(item.article_attribution_json)
            : caseContext.articleOutcomeAttribution;
        const rhythmScore = getPlan17RhythmScore({
          generatedMarkdown: result.generated_markdown,
          inputPayload: caseContext.inputPayload,
          stageArtifactPayloads: caseContext.stageArtifactPayloads,
          articleStrategyCard: caseContext.articleStrategyCard,
          articleOutcomeAttribution,
          articleDeepWritingPayload: caseContext.articleDeepWritingPayload,
        });
        return rhythmScore != null
          ? {
              rhythmDeviation: Number((1 - rhythmScore).toFixed(4)),
              readCompletionRate: item.read_completion_rate,
            }
          : null;
      })
      .filter(
        (item): item is { rhythmDeviation: number; readCompletionRate: number } =>
          item != null
          && typeof item.rhythmDeviation === "number"
          && Number.isFinite(item.rhythmDeviation)
          && typeof item.readCompletionRate === "number"
          && Number.isFinite(item.readCompletionRate),
      );
    const sourceTypeBreakdown = Array.from(
      caseItems.reduce((bucket, item) => {
        const key = String(item.source_type || "manual").trim() || "manual";
        bucket.set(key, (bucket.get(key) ?? 0) + 1);
        return bucket;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([key, count]) => ({ key, count }));
    const taskTypeBreakdown = Array.from(
      caseItems.reduce((bucket, item) => {
        const key = String(item.task_type || "").trim() || "unknown";
        bucket.set(key, (bucket.get(key) ?? 0) + 1);
        return bucket;
      }, new Map<string, number>()),
    )
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([key, count]) => ({ key, count }));
    const strategyManualPairs = labelItems
      .map((item) => {
        const caseContext = caseContextById.get(item.case_id);
        return {
          manualScore: typeof item.strategy_manual_score === "number" && Number.isFinite(item.strategy_manual_score)
            ? item.strategy_manual_score
            : null,
          strategyStrengthScore: caseContext
            ? getPlan17StrategyStrengthScore({
                inputPayload: caseContext.inputPayload,
                stageArtifactPayloads: caseContext.stageArtifactPayloads,
                articleStrategyCard: caseContext.articleStrategyCard,
                articleOutcomeAttribution: caseContext.articleOutcomeAttribution,
              })
            : null,
        };
      })
      .filter(
        (item): item is { manualScore: number; strategyStrengthScore: number } =>
          typeof item.manualScore === "number"
          && Number.isFinite(item.manualScore)
          && typeof item.strategyStrengthScore === "number"
          && Number.isFinite(item.strategyStrengthScore),
      );
    const evidenceLabelItems = labelItems
      .map((item) => {
        const expectedTags = normalizeQualityLabelTags(item.evidence_expected_tags_json);
        const detectedTags = normalizeQualityLabelTags(item.evidence_detected_tags_json);
        return {
          expectedTags,
          detectedTags,
          overlapCount: expectedTags.filter((tag) => detectedTags.includes(tag)).length,
        };
      })
      .filter((item) => item.expectedTags.length > 0 || item.detectedTags.length > 0);
    const evidenceExpectedTagCount = evidenceLabelItems.reduce((sum, item) => sum + item.expectedTags.length, 0);
    const evidenceDetectedTagCount = evidenceLabelItems.reduce((sum, item) => sum + item.detectedTags.length, 0);
    const evidenceOverlapTagCount = evidenceLabelItems.reduce((sum, item) => sum + item.overlapCount, 0);
    const strategyManualScoreSpearman = strategyManualPairs.length >= 3
      ? computeSpearmanCorrelation(
          strategyManualPairs.map((item) => item.strategyStrengthScore),
          strategyManualPairs.map((item) => item.manualScore),
        )
      : null;
    const evidenceLabelPrecision =
      evidenceDetectedTagCount > 0
        ? evidenceOverlapTagCount / evidenceDetectedTagCount
        : null;
    const evidenceLabelRecall =
      evidenceExpectedTagCount > 0
        ? evidenceOverlapTagCount / evidenceExpectedTagCount
        : null;
    const rhythmDeviationCorrelation = rhythmDeviationPairs.length >= 3
      ? computePearsonCorrelation(
          rhythmDeviationPairs.map((item) => item.rhythmDeviation),
          rhythmDeviationPairs.map((item) => item.readCompletionRate),
        )
      : null;
    const rhythmDeviationPValue = computeCorrelationPValue(rhythmDeviationCorrelation, rhythmDeviationPairs.length);
    const topicFissionSceneBreakdown = focusKey === "topic_fission"
      ? (focusMeta?.promptIds ?? [])
          .map((promptId) => {
            const sceneMeta = getPlan17PromptSceneMeta(promptId);
            const activeVersion = activePromptVersionMap.get(promptId) ?? null;
            const sceneRuns = runItems.filter((item) => {
              if (item.status !== "succeeded" || item.candidate_version_type !== "prompt_version") {
                return false;
              }
              try {
                return resolvePromptBackedWritingEvalVersionRef(item.candidate_version_type, item.candidate_version_ref).promptId === promptId;
              } catch {
                return false;
              }
            });
            const sceneEvaluatedCaseIds = new Set<number>();
            const sceneFailedCaseIds = new Set<number>();
            const latestStableResultByCaseId = new Map<number, { totalScore: number | null }>();
            const latestActiveResultCaseIds = new Set<number>();
            for (const row of resultRows) {
              const run = runsById.get(row.run_id);
              if (!run || !sceneRuns.some((item) => item.id === run.id)) {
                continue;
              }
              sceneEvaluatedCaseIds.add(row.case_id);
              if (activeVersion == null || run.candidate_version_type !== "prompt_version") {
                continue;
              }
              try {
                const parsed = resolvePromptBackedWritingEvalVersionRef(run.candidate_version_type, run.candidate_version_ref);
                if (parsed.promptId !== promptId || parsed.version !== activeVersion) {
                  continue;
                }
              } catch {
                continue;
              }
              if (latestActiveResultCaseIds.has(row.case_id)) {
                continue;
              }
              latestActiveResultCaseIds.add(row.case_id);
              const resultStatus = getWritingEvalResultStatus(row.judge_payload_json);
              if (resultStatus === "failed") {
                sceneFailedCaseIds.add(row.case_id);
                continue;
              }
              if (!latestStableResultByCaseId.has(row.case_id)) {
                latestStableResultByCaseId.set(row.case_id, {
                  totalScore: typeof row.total_score === "number" && Number.isFinite(row.total_score) ? row.total_score : null,
                });
              }
            }
            const stableScores = Array.from(latestStableResultByCaseId.values())
              .map((item) => item.totalScore)
              .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
            const stableHitCaseCount = stableScores.filter((item) => item >= 70).length;
            return {
              sceneKey: promptId.split(".").pop() || promptId,
              promptId,
              label: sceneMeta?.label ?? promptId,
              activeVersion,
              evaluatedCaseCount: sceneEvaluatedCaseIds.size,
              stableCaseCount: stableScores.length,
              stableHitCaseCount,
              stableHitRate: stableScores.length > 0 ? stableHitCaseCount / stableScores.length : null,
              failedCaseCount: sceneFailedCaseIds.size,
              runCount: sceneRuns.length,
              latestRunAt: sceneRuns[0]?.created_at ?? null,
            };
          })
      : [];
    const topicFissionStableCaseGap = topicFissionSceneBreakdown.reduce(
      (sum, item) => sum + Math.max(20 - Number(item.stableCaseCount || 0), 0),
      0,
    );
    const topicFissionHitRateGapCount = topicFissionSceneBreakdown.filter(
      (item) => item.stableHitRate != null && item.stableHitRate < 0.7,
    ).length;
    const topicFissionMissingStableRateCount = topicFissionSceneBreakdown.filter((item) => item.stableHitRate == null).length;
    const strategyManualGap = Math.max(20 - strategyManualPairs.length, 0);
    const evidenceLabelGap = Math.max(20 - evidenceLabelItems.length, 0);
    const rhythmPairGap = Math.max(20 - rhythmDeviationPairs.length, 0);
    const observationGaps = summarizeQualityObservationGaps(
      focusKey === "topic_fission"
        ? [
            {
              key: "stable-case-gap",
              label: "三场景距每场景 20 个 stable case 仍差",
              count: topicFissionStableCaseGap,
            },
            {
              key: "missing-stable-hit-rate",
              label: "还没有 stable 命中率的场景数",
              count: topicFissionMissingStableRateCount,
            },
            {
              key: "below-hit-threshold",
              label: "stable 命中率仍低于 70% 的场景数",
              count: topicFissionHitRateGapCount,
            },
          ]
        : focusKey === "strategy_strength"
          ? [
              {
                key: "manual-score-gap",
                label: "距 20 条人工判分样本仍差",
                count: strategyManualGap,
              },
              {
                key: "spearman-threshold-gap",
                label: "Spearman 仍未达到 0.7",
                count:
                  strategyManualPairs.length >= 20
                  && (strategyManualScoreSpearman ?? Number.NEGATIVE_INFINITY) < 0.7
                    ? 1
                    : 0,
              },
            ]
          : focusKey === "evidence_hook"
            ? [
                {
                  key: "manual-label-gap",
                  label: "距 20 条人工标签样本仍差",
                  count: evidenceLabelGap,
                },
                {
                key: "precision-threshold-gap",
                label: "precision 仍未达到 75%",
                count:
                  evidenceLabelItems.length >= 20
                    && (evidenceLabelPrecision ?? Number.NEGATIVE_INFINITY) < 0.75
                      ? 1
                      : 0,
                },
                {
                key: "recall-threshold-gap",
                label: "recall 仍未达到 80%",
                count:
                  evidenceLabelItems.length >= 20
                    && (evidenceLabelRecall ?? Number.NEGATIVE_INFINITY) < 0.8
                      ? 1
                      : 0,
                },
              ]
            : focusKey === "rhythm_consistency"
              ? [
                  {
                    key: "paired-sample-gap",
                    label: "距 20 条节奏-完读率配对样本仍差",
                    count: rhythmPairGap,
                  },
                  {
                    key: "significance-gap",
                    label: "节奏负相关显著性仍未达标",
                    count:
                      rhythmDeviationPairs.length >= 20
                      && !(
                        rhythmDeviationCorrelation != null
                        && rhythmDeviationCorrelation < 0
                        && (rhythmDeviationPValue ?? Number.POSITIVE_INFINITY) < 0.05
                      )
                        ? 1
                        : 0,
                  },
                ]
              : [],
    );

    return {
      key: focusKey,
      label: focusMeta?.label ?? focusKey,
      description: focusMeta?.description ?? "",
      promptIds: focusMeta?.promptIds ?? [],
      datasetCount: matchedDatasets.length,
      activeDatasetCount: matchedDatasets.filter((dataset) => dataset.status === "active").length,
      sampleCount: matchedDatasets.reduce((sum, dataset) => sum + Number(dataset.sampleCount || 0), 0),
      enabledCaseCount: caseItems.filter((item) => Boolean(item.is_enabled)).length,
      disabledCaseCount: caseItems.filter((item) => !Boolean(item.is_enabled)).length,
      runCount: runItems.length,
      linkedFeedbackCount: feedbackItems.length,
      latestRunAt: runItems[0]?.created_at ?? null,
      readiness: {
        readyCount: matchedDatasets.filter((dataset) => dataset.readiness.status === "ready").length,
        warningCount: matchedDatasets.filter((dataset) => dataset.readiness.status === "warning").length,
        blockedCount: matchedDatasets.filter((dataset) => dataset.readiness.status === "blocked").length,
      },
      sourceTypeBreakdown,
      taskTypeBreakdown,
      reporting: {
        topicFissionSceneBreakdown,
        proxyScoreVsObservedSpearman:
          scoreVsObservedPairs.length >= 3
            ? computeSpearmanCorrelation(
                scoreVsObservedPairs.map((item) => item.predictedTotalScore),
                scoreVsObservedPairs.map((item) => item.observedViralScore),
              )
            : null,
        proxyScoreVsObservedSampleCount: scoreVsObservedPairs.length,
        strategyManualScoreSpearman,
        strategyManualScoreSampleCount: strategyManualPairs.length,
        evidenceLabelPrecision,
        evidenceLabelRecall,
        evidenceLabelSampleCount: evidenceLabelItems.length,
        rhythmDeviationVsReadCompletionCorrelation: rhythmDeviationCorrelation,
        rhythmDeviationVsReadCompletionSampleCount: rhythmDeviationPairs.length,
        rhythmDeviationVsReadCompletionPValue: rhythmDeviationPValue,
      },
      observationGaps,
    } satisfies WritingEvalPlan17QualityFocusReport;
  });

  return {
    generatedAt: new Date().toISOString(),
    seededDatasetCodes: seedResult.createdCodes,
    totalDatasetCount: plan17Datasets.length,
    totalSampleCount: plan17Datasets.reduce((sum, dataset) => sum + Number(dataset.sampleCount || 0), 0),
    focuses,
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
        && SUPPORTED_WRITING_EVAL_VERSION_TYPES.includes(item.versionType as (typeof SUPPORTED_WRITING_EVAL_VERSION_TYPES)[number]),
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
  const supported = SUPPORTED_WRITING_EVAL_VERSION_TYPES.includes(versionType as (typeof SUPPORTED_WRITING_EVAL_VERSION_TYPES)[number]);
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
        (isPromptBackedWritingEvalVersionType(versionType) && promptVersionRefs.includes(candidateContent))
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
  sourceScheduleId?: number | null;
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
  if (
    input.sourceScheduleId !== undefined
    && input.sourceScheduleId !== null
    && (!Number.isInteger(input.sourceScheduleId) || input.sourceScheduleId <= 0)
  ) {
    throw new Error("来源调度规则无效");
  }
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
        run_code, dataset_id, source_schedule_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
        experiment_mode, trigger_mode, decision_mode, resolution_status, status, summary, score_summary_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runCode,
        resolved.datasetId,
        input.sourceScheduleId ?? null,
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
    `SELECT r.id, r.run_code, r.dataset_id, r.source_schedule_id, r.base_version_type, r.base_version_ref, r.candidate_version_type,
            r.candidate_version_ref, r.experiment_mode, r.trigger_mode, r.decision_mode, r.resolution_status, r.status, r.summary, r.score_summary_json, r.error_message,
            r.started_at, r.finished_at, r.resolved_at, r.created_by, r.created_at, d.name AS dataset_name, s.name AS source_schedule_name
     FROM writing_optimization_runs r
     INNER JOIN writing_eval_datasets d ON d.id = r.dataset_id
     LEFT JOIN writing_eval_run_schedules s ON s.id = r.source_schedule_id
     WHERE r.id = ?`,
    [createdId],
  );
  if (!created) {
    throw new Error("创建实验运行失败");
  }
  return mapRun(created);
}
