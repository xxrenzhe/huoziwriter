import { evaluateOpeningGuardChecks } from "./opening-patterns";
import { evaluateTitleGuardChecks } from "./title-patterns";

export const TITLE_OPTIMIZATION_MIN_OPTION_COUNT = 6;
export const TITLE_OPTIMIZATION_MIN_OPEN_RATE_SCORE = 35;
export const TITLE_OPTIMIZATION_MIN_ELEMENTS_HIT_COUNT = 2;

export const OPENING_OPTIMIZATION_MIN_OPTION_COUNT = 3;
export const OPENING_OPTIMIZATION_MIN_HOOK_SCORE = 65;
export const OPENING_OPTIMIZATION_MIN_QUALITY_CEILING = "B";
export const FICTIONAL_MATERIAL_MIN_ITEM_COUNT = 4;
export const VIRAL_NARRATIVE_MIN_EMOTIONAL_HOOK_COUNT = 2;
export const VIRAL_NARRATIVE_MIN_MOTIF_CALLBACK_COUNT = 2;

const OPENING_QUALITY_CEILING_RANKS = {
  C: 0,
  "B-": 1,
  B: 2,
  "B+": 3,
  A: 4,
} as const;

export type OptimizationGateIssue = {
  code: string;
  detail: string;
};

export type ArticleViralReadinessInput = {
  researchBrief?: Record<string, unknown> | null;
  titleOptimization?: Record<string, unknown> | null;
  openingOptimization?: Record<string, unknown> | null;
  deepWriting?: Record<string, unknown> | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getUniqueStrings(value: unknown, limit = 8) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function getMaterialRealityMode(value: unknown) {
  const normalized = getString(value);
  return normalized === "fiction" || normalized === "nonfiction" ? normalized : null;
}

export function getOpeningQualityCeilingRank(value: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return OPENING_QUALITY_CEILING_RANKS[normalized as keyof typeof OPENING_QUALITY_CEILING_RANKS] ?? -1;
}

export function getTitleOptimizationGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const titleOptions = getRecordArray(outputJson.titleOptions);
  const recommendedTitle = getString(outputJson.recommendedTitle);
  const recommendedTitleOption = titleOptions.find((item) => getString(item.title) === recommendedTitle)
    ?? titleOptions.find((item) => item.isRecommended === true)
    ?? null;
  const recommendedOpenRateScore = getNumber(outputJson.recommendedTitleOpenRateScore)
    ?? getNumber(recommendedTitleOption?.openRateScore)
    ?? 0;
  const allForbiddenHits = getUniqueStrings(outputJson.forbiddenHits, 8);
  const titleGuard = evaluateTitleGuardChecks({
    selectedTitle: recommendedTitle,
    selectedTitleOption: recommendedTitleOption,
  });

  if (titleOptions.length < TITLE_OPTIMIZATION_MIN_OPTION_COUNT) {
    issues.push({
      code: "title_option_count",
      detail: `标题候选不足 ${TITLE_OPTIMIZATION_MIN_OPTION_COUNT} 个，当前只有 ${titleOptions.length} 个。`,
    });
  }
  if (titleGuard.titleForbiddenHits.length > 0 || allForbiddenHits.length > 0) {
    issues.push({
      code: "title_forbidden_hits",
      detail: `标题命中禁区：${(titleGuard.titleForbiddenHits.length > 0 ? titleGuard.titleForbiddenHits : allForbiddenHits).join("、")}。`,
    });
  }
  if (titleGuard.titleElementsHitCount < TITLE_OPTIMIZATION_MIN_ELEMENTS_HIT_COUNT) {
    issues.push({
      code: "title_elements_hit_count",
      detail: `标题三要素命中不足，当前 ${titleGuard.titleElementsHitCount}/3。`,
    });
  }
  if (recommendedOpenRateScore < TITLE_OPTIMIZATION_MIN_OPEN_RATE_SCORE) {
    issues.push({
      code: "title_open_rate_score",
      detail: `标题打开率分过低，当前 ${recommendedOpenRateScore}，要求至少 ${TITLE_OPTIMIZATION_MIN_OPEN_RATE_SCORE}。`,
    });
  }

  return issues;
}

export function getOpeningOptimizationGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const openingOptions = getRecordArray(outputJson.openingOptions);
  const recommendedOpening = getString(outputJson.recommendedOpening);
  const recommendedOpeningOption = openingOptions.find((item) => getString(item.opening) === recommendedOpening || getString(item.text) === recommendedOpening)
    ?? openingOptions.find((item) => item.isRecommended === true)
    ?? null;
  const openingGuard = evaluateOpeningGuardChecks({
    selectedOpening: recommendedOpening,
    selectedOpeningOption: recommendedOpeningOption,
  });
  const recommendedHookScore = getNumber(outputJson.recommendedHookScore) ?? openingGuard.openingHookScore ?? 0;
  const recommendedDangerCount = getNumber(outputJson.recommendedOpeningDangerCount)
    ?? Object.values(openingGuard.openingDiagnose).filter((item) => item === "danger").length;
  const recommendedQualityCeiling = getString(outputJson.recommendedQualityCeiling) || openingGuard.openingQualityCeiling || null;

  if (openingOptions.length < OPENING_OPTIMIZATION_MIN_OPTION_COUNT) {
    issues.push({
      code: "opening_option_count",
      detail: `开头候选不足 ${OPENING_OPTIMIZATION_MIN_OPTION_COUNT} 个，当前只有 ${openingOptions.length} 个。`,
    });
  }
  if (openingGuard.openingForbiddenHits.length > 0) {
    issues.push({
      code: "opening_forbidden_hits",
      detail: `开头命中禁区：${openingGuard.openingForbiddenHits.join("、")}。`,
    });
  }
  if (recommendedDangerCount > 0) {
    issues.push({
      code: "opening_danger_diagnose",
      detail: `开头仍存在 ${recommendedDangerCount} 个 danger 诊断项。`,
    });
  }
  if (recommendedHookScore < OPENING_OPTIMIZATION_MIN_HOOK_SCORE) {
    issues.push({
      code: "opening_hook_score",
      detail: `开头钩子分过低，当前 ${recommendedHookScore}，要求至少 ${OPENING_OPTIMIZATION_MIN_HOOK_SCORE}。`,
    });
  }
  if (getOpeningQualityCeilingRank(recommendedQualityCeiling) < getOpeningQualityCeilingRank(OPENING_OPTIMIZATION_MIN_QUALITY_CEILING)) {
    issues.push({
      code: "opening_quality_ceiling",
      detail: `开头质量上限不足，当前 ${recommendedQualityCeiling || "null"}，要求至少 ${OPENING_OPTIMIZATION_MIN_QUALITY_CEILING}。`,
    });
  }

  return issues;
}

export function getFictionalMaterialPlanGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const materials = getRecordArray(outputJson.fictionalMaterialPlan);
  const hasScene = materials.some((item) => getString(item.scene));
  const hasCharacter = materials.some((item) => getString(item.character));
  const hasDialogue = materials.some((item) => getString(item.dialogue));
  const hasDataRange = materials.some((item) => getString(item.dataRange));
  const hasPlausibilityAnchor = materials.some((item) => getString(item.plausibilityAnchor));
  const hasBoundaryNote = materials.some((item) => getString(item.boundaryNote));
  const weakItems = materials.filter((item) => {
    const concreteFieldCount = [
      getString(item.scene),
      getString(item.character),
      getString(item.dialogue),
      getString(item.dataRange),
      getString(item.plausibilityAnchor),
      getString(item.boundaryNote),
    ].filter(Boolean).length;
    return concreteFieldCount < 4;
  });

  if (materials.length < FICTIONAL_MATERIAL_MIN_ITEM_COUNT) {
    issues.push({
      code: "fictional_material_count",
      detail: `拟真虚构素材不足 ${FICTIONAL_MATERIAL_MIN_ITEM_COUNT} 条，当前只有 ${materials.length} 条。`,
    });
  }
  if (!hasScene || !hasCharacter || !hasDialogue || !hasDataRange || !hasPlausibilityAnchor || !hasBoundaryNote) {
    issues.push({
      code: "fictional_material_field_coverage",
      detail: "拟真虚构素材必须覆盖场景、人物、对话、数据区间、可信锚点和虚构边界。",
    });
  }
  if (weakItems.length > 0) {
    issues.push({
      code: "fictional_material_concreteness",
      detail: `拟真虚构素材仍有 ${weakItems.length} 条过于空泛，每条至少需要 4 个具体字段。`,
    });
  }

  return issues;
}

function getNonfictionAuthorPerspectiveMaterialGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const materials = getRecordArray(outputJson.fictionalMaterialPlan);
  const allowedTypes = new Set(["author_inference", "composite_scene", "scenario_reconstruction"]);
  const boundaryPattern = /作者视角|推演|假设|匿名|复合|不对应|不代表|不冒充|非真实/i;
  const namedCaseRiskPattern = /知乎|登录页|真实采访|真实聊天|真实客户|内部数据|爆料|某某公司|某公司|客户案例/i;
  const invalidItems = materials.filter((item) => {
    const type = getString(item.type) || "author_inference";
    const boundaryNote = getString(item.boundaryNote);
    const text = [
      getString(item.label),
      getString(item.scene),
      getString(item.character),
      getString(item.dialogue),
      getString(item.plausibilityAnchor),
      boundaryNote,
    ].join(" ");
    return (
      !allowedTypes.has(type)
      || !getString(item.scene)
      || !boundaryPattern.test(boundaryNote)
      || namedCaseRiskPattern.test(text)
    );
  });

  if (invalidItems.length > 0) {
    issues.push({
      code: "author_perspective_material_boundary",
      detail: "非虚构文章只能携带作者视角推演、匿名复合观察或假设场景；必须写清虚构边界，且不得新增命名案例、真实采访、真实聊天或客户案例。",
    });
  }

  return issues;
}

export function getViralNarrativePlanGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const plan = getRecord(outputJson.viralNarrativePlan);
  const emotionalHooks = getUniqueStrings(plan?.emotionalHooks, 6);
  const motifCallbacks = getRecordArray(plan?.motifCallbacks);

  if (!plan) {
    return [{
      code: "viral_narrative_missing",
      detail: "缺少爆款叙事计划，必须先规划核心母题、现场入口、故事数据交替和母题回收。",
    }];
  }
  if (!getString(plan.coreMotif) || !getString(plan.sceneEntry) || !getString(plan.storyDataAlternation)) {
    issues.push({
      code: "viral_narrative_core_fields",
      detail: "爆款叙事计划缺少核心母题、现场入口或故事数据交替规则。",
    });
  }
  if (emotionalHooks.length < VIRAL_NARRATIVE_MIN_EMOTIONAL_HOOK_COUNT) {
    issues.push({
      code: "viral_narrative_emotional_hooks",
      detail: `情绪钩子不足 ${VIRAL_NARRATIVE_MIN_EMOTIONAL_HOOK_COUNT} 个，当前只有 ${emotionalHooks.length} 个。`,
    });
  }
  if (motifCallbacks.length < VIRAL_NARRATIVE_MIN_MOTIF_CALLBACK_COUNT) {
    issues.push({
      code: "viral_narrative_motif_callbacks",
      detail: `母题回收节点不足 ${VIRAL_NARRATIVE_MIN_MOTIF_CALLBACK_COUNT} 个，当前只有 ${motifCallbacks.length} 个。`,
    });
  }
  if (!getString(plan.boundaryRule)) {
    issues.push({
      code: "viral_narrative_boundary_rule",
      detail: "爆款叙事计划必须说明真实锚点与复合虚构素材的边界。",
    });
  }

  return issues;
}

function prefixGateIssues(prefix: string, issues: OptimizationGateIssue[]) {
  return issues.map((issue) => ({
    code: `${prefix}_${issue.code}`,
    detail: issue.detail,
  }));
}

export function getArticleViralReadinessGateIssues(input: ArticleViralReadinessInput) {
  const issues: OptimizationGateIssue[] = [];
  const researchBrief = input.researchBrief ?? {};
  const titleOptimization = input.titleOptimization ?? {};
  const openingOptimization = input.openingOptimization ?? {};
  const deepWriting = input.deepWriting ?? {};
  const sourceCoverage = getRecord(researchBrief.sourceCoverage);
  const researchSufficiency = getString(sourceCoverage?.sufficiency);
  const sourceCount = getRecordArray(researchBrief.sources).length;
  const timelineCount = getRecordArray(researchBrief.timelineCards).length || getRecordArray(researchBrief.timeline).length;
  const comparisonCount = getRecordArray(researchBrief.comparisonCards).length;
  const intersectionCount = getRecordArray(researchBrief.intersectionInsights).length;
  const sectionCount = getRecordArray(deepWriting.sectionBlueprint).length;
  const titleHasCandidate = Boolean(getString(titleOptimization.recommendedTitle) || getRecordArray(titleOptimization.titleOptions).length > 0);
  const openingHasCandidate = Boolean(getString(openingOptimization.recommendedOpening) || getRecordArray(openingOptimization.openingOptions).length > 0);
  const materialRealityMode = getMaterialRealityMode(deepWriting.materialRealityMode);

  if (researchSufficiency === "blocked" || (!researchSufficiency && sourceCount === 0)) {
    issues.push({
      code: "readiness_research_blocked",
      detail: "研究底座仍不足：信源覆盖 blocked 或没有可展示来源，不能直接进入正文生成。",
    });
  }
  if (timelineCount === 0 || comparisonCount === 0 || intersectionCount === 0) {
    issues.push({
      code: "readiness_research_backbone",
      detail: `研究骨架不完整：时间脉络 ${timelineCount}、横向比较 ${comparisonCount}、交汇洞察 ${intersectionCount}，三者都必须至少 1 条。`,
    });
  }
  if (!titleHasCandidate) {
    issues.push({
      code: "readiness_title_missing",
      detail: "缺少已优化标题，无法判断打开率和承诺边界。",
    });
  } else {
    issues.push(...prefixGateIssues("readiness_title", getTitleOptimizationGateIssues(titleOptimization)));
  }
  if (!openingHasCandidate) {
    issues.push({
      code: "readiness_opening_missing",
      detail: "缺少已优化开头，无法判断前三秒钩子和质量上限。",
    });
  } else {
    issues.push(...prefixGateIssues("readiness_opening", getOpeningOptimizationGateIssues(openingOptimization)));
  }
  if (sectionCount < 3) {
    issues.push({
      code: "readiness_section_blueprint",
      detail: `正文执行卡结构不足 3 节，当前只有 ${sectionCount} 节。`,
    });
  }
  issues.push(...prefixGateIssues("readiness_viral", getViralNarrativePlanGateIssues(deepWriting)));
  if (materialRealityMode === "nonfiction") {
    issues.push(...prefixGateIssues("readiness_nonfiction", getNonfictionAuthorPerspectiveMaterialGateIssues(deepWriting)));
  } else {
    issues.push(...prefixGateIssues("readiness_fictional", getFictionalMaterialPlanGateIssues(deepWriting)));
  }

  return issues;
}

export function formatOptimizationGateIssues(issues: OptimizationGateIssue[]) {
  return issues.map((item) => item.detail).join("；");
}
