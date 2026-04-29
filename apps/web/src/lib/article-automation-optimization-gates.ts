import { analyzeAiNoise } from "./ai-noise-scan";
import { evaluateOpeningGuardChecks } from "./opening-patterns";
import { DEFAULT_ARTICLE_NODE_TITLES } from "./article-structure-labels";
import { evaluateFinalBodyViralContract } from "./article-viral-contract";
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

const FIRST_SCREEN_OBJECT_PATTERNS = [
  /\d/,
  /AI|Agent|MCP|SaaS|GitHub|Cursor|Figma|Notion|Google Ads/i,
  /公司|产品|工具|模型|团队|老板|投手|用户|客户|创始人|平台|账号|后台|关键词|搜索词|订单|线索|预算|定价|留存|续费|收款|佣金|仓库|插件|工作流|副业|美金|美元|海外|出海|独立站|联盟营销/,
] as const;

const FIRST_SCREEN_CHANGE_PATTERNS = [
  /变化|变了|正在变|重排|重写|提速|变慢|拖慢|卡住|失效|替代|吃掉|收购|下跌|上涨|翻倍|增长|下降|破千万|改版|开源|上线|接入|进生产|跑通|删掉|切换|涨了|跌了|慢下来|快起来|不出单|不赚钱|判断错|错位|跑偏/,
  /不是.+而是|看起来.+实际|以为.+真正|表面.+真正|原来.+现在/,
] as const;

const FIRST_SCREEN_CONSEQUENCE_PATTERNS = [
  /代价|成本|机会|风险|窗口|护城河|误判|返工|亏钱|赚钱|降本|少赚|多花|错过|转化|成交|订单|下单|出单|线索|效率|发布|核查|续费|留存|佣金|收入|预算|责任|压力|淘汰|值得换|不值得换/,
] as const;

const FIRST_PARAGRAPH_DIDACTIC_PATTERNS = [
  /你应该|你需要|你必须|我们应该|我们需要/,
  /首先|其次|最后|第一步|第二步|行动建议|方法是|步骤是/,
  /必须先|不要先|建议先|更合理的做法|真正该做的是|真正该问的是/,
] as const;

const COMMERCIAL_EVIDENCE_PATTERNS = {
  case: /案例|公司|创始人|客户|用户|老板|团队|投手|运营|开发者|站长|卖家|买家|PocketOS|Cursor|OpenAI|Anthropic|Stripe|Shopify|GitHub|Google/i,
  data: /\d|%|％|万|亿|元|美元|美金|ARR|MRR|ROI|GMV|CAC|LTV|转化率|留存|续费|预算|佣金|收入|成本|质量分/i,
  quote: /「[^」]{2,}」|“[^”]{2,}”|"[^"]{2,}"|他说|她说|对方说|原话|引用|评论区|反馈里|有人提到/,
  tool: /工具|平台|后台|仪表盘|账本|表格|截图|GitHub|Google Ads|PPC|SaaS|Cursor|Figma|Notion|OpenAI|Claude|Stripe|Shopify|Wise|Amazon Associates/i,
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

export type GeneratedArticleViralQualityInput = {
  markdownContent?: string | null;
  htmlContent?: string | null;
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

function hasAnyPattern(text: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeReaderText(value: string) {
  return String(value || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstReaderBlock(markdownContent: string | null | undefined) {
  const normalized = String(markdownContent || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    if (/^#/.test(block)) continue;
    if (/^\s*[-*]\s+/.test(block)) continue;
    if (/^!\[[^\]]*]\([^)]+\)/.test(block)) continue;
    const text = normalizeReaderText(block);
    if (DEFAULT_ARTICLE_NODE_TITLES.some((label) => text.replace(/\s+/g, "") === label)) continue;
    if (text) return text;
  }

  return normalizeReaderText(normalized);
}

function collectInternalLabelHits(content: string) {
  const compactContent = String(content || "").replace(/\s+/g, "");
  return DEFAULT_ARTICLE_NODE_TITLES.filter((label) => compactContent.includes(label));
}

function getFirstScreenContractMissing(opening: string) {
  const firstScreen = String(opening || "").replace(/\s+/g, " ").trim().slice(0, 220);
  if (!firstScreen) {
    return ["具体对象", "变化", "后果/机会"];
  }
  const missing: string[] = [];
  if (!hasAnyPattern(firstScreen, FIRST_SCREEN_OBJECT_PATTERNS)) missing.push("具体对象");
  if (!hasAnyPattern(firstScreen, FIRST_SCREEN_CHANGE_PATTERNS)) missing.push("变化");
  if (!hasAnyPattern(firstScreen, FIRST_SCREEN_CONSEQUENCE_PATTERNS)) missing.push("后果/机会");
  return missing;
}

function countPatternMatches(text: string, patterns: readonly RegExp[]) {
  return patterns.reduce((count, pattern) => count + ((text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || []).length), 0);
}

function getCommercialEvidenceTypeHits(text: string) {
  return Object.entries(COMMERCIAL_EVIDENCE_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([type]) => type);
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
  const firstScreenContractMissing = getFirstScreenContractMissing(recommendedOpening);
  if (firstScreenContractMissing.length > 0) {
    issues.push({
      code: "opening_first_screen_contract",
      detail: `开头前 200 字缺少爆款第一屏承诺：${firstScreenContractMissing.join("、")}。必须先让读者看到对象、变化和后果/机会。`,
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
  const boundaryPattern = /作者视角|推演|假设|匿名|复合|概念可视化|场景重建|策略推演|不对应|不代表|不冒充|不作为|不是实际|非真实/i;
  const namedCaseRiskPattern = /知乎|登录页|真实采访|真实聊天|真实客户|内部数据|爆料|某某公司|某公司|客户案例/i;
  const realRiskTermPattern = /真实(?:采访|聊天|客户|会议|人物|经历|案例|数据|爆料)(?:记录|原话|证言)?/g;
  const stripBoundaryNegations = (value: string) =>
    value
      .replace(/(?:不(?:对应|代表|冒充|作为|是|写成|出现|落|使用)|不是|非)[^。；;]*?真实(?:采访|聊天|客户|会议|人物|经历|案例|数据|爆料)[^。；;]*/g, "")
      .replace(/(?:不(?:对应|代表|冒充|作为|是|写成|出现|落|使用)|不是|非)[^。；;]*?(?:客户案例|命名案例|命名品牌|品牌|账户|会议记录|用户访谈)[^。；;]*/g, "")
      .replace(/非真实(?:采访|聊天|客户|会议|人物|经历|案例|数据|爆料)(?:记录|原话|证言)?/g, "")
      .replace(realRiskTermPattern, (match, offset, fullText) => {
        const prefix = fullText.slice(Math.max(0, offset - 16), offset);
        return /不对应|不代表|不冒充|不作为|不是|非|不写成|不出现|不落|不使用/.test(prefix) ? "" : match;
      });
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
    const riskText = stripBoundaryNegations(text);
    return (
      !allowedTypes.has(type)
      || !getString(item.scene)
      || !boundaryPattern.test(boundaryNote)
      || namedCaseRiskPattern.test(riskText)
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

export function getViralGenomePackGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const pack = getRecord(outputJson.viralGenomePack);
  const sampleSourceProfile = getRecord(pack?.sampleSourceProfile);
  const mechanismBias = getRecord(pack?.mechanismBias);
  const readerShareReasons = getUniqueStrings(pack?.readerShareReasons, 5);
  const materialJobs = getUniqueStrings(pack?.materialJobs, 6);
  const negativePatterns = getUniqueStrings(pack?.negativePatterns, 5);
  const readerSceneAnchors = getUniqueStrings(pack?.readerSceneAnchors, 6);
  const openingMicroScenes = getUniqueStrings(pack?.openingMicroScenes, 4);
  const evidencePriorities = getUniqueStrings(pack?.evidencePriorities, 6);
  const emotionVectors = getUniqueStrings(pack?.emotionVectors, 5);
  const visualRhythmSlots = getRecordArray(pack?.visualRhythmSlots);
  const abstractToConcretePairs = getRecordArray(pack?.abstractToConcretePairs).slice(0, 5).filter((item) => getString(item.abstract) && getString(item.concrete));
  const firstScreenPromise = getString(pack?.firstScreenPromise);
  const shareTrigger = getString(pack?.shareTrigger);
  const authorPostureMode = getString(pack?.authorPostureMode);
  const businessQuestions = getUniqueStrings(pack?.businessQuestions, 7);
  const titleDirections = getUniqueStrings(pack?.titleDirections, 5);
  const narrativeSkeleton = getString(pack?.narrativeSkeleton);
  const sparseTrackAlert = getString(pack?.sparseTrackAlert);
  const source = getString(sampleSourceProfile?.source);
  const vertical = getString(sampleSourceProfile?.vertical);
  const categorySampleCount = getNumber(sampleSourceProfile?.categorySampleCount) ?? 0;
  const matchedMechanisms = getUniqueStrings(sampleSourceProfile?.matchedMechanisms, 5);
  const sparseTrack = Boolean(sampleSourceProfile?.sparseTrack);
  const coverageNote = getString(sampleSourceProfile?.coverageNote);

  if (!pack) {
    return [{
      code: "viral_genome_missing",
      detail: "缺少 Plan24 百篇样本基因包，执行卡仍可能退回泛方法论模板。",
    }];
  }
  const supportedSources = new Set(["plan24_fulltext_100", "plan24_business_monetization_100"]);
  if (!supportedSources.has(source) || !vertical || (!sparseTrack && categorySampleCount <= 0) || matchedMechanisms.length === 0) {
    issues.push({
      code: "viral_genome_source_profile",
      detail: "百篇样本基因包缺少可验证的 Plan24 垂类画像，不能只写泛化摘要。",
    });
  }
  if (sparseTrack && !coverageNote) {
    issues.push({
      code: "viral_genome_sparse_track_note",
      detail: "稀疏题材必须显式说明样本覆盖缺口，不能假装语料已经充分覆盖。",
    });
  }
  if (!getString(mechanismBias?.label) || !getString(mechanismBias?.reason)) {
    issues.push({
      code: "viral_genome_mechanism_bias",
      detail: "百篇样本基因包缺少明确机制偏向，标题、开头和正文容易各自优化。",
    });
  }
  const hasFirstScreenWindow = /前\s*(?:120|200)\s*字|第一屏/.test(firstScreenPromise);
  const hasFirstScreenPayload = /具体处境|具体对象|后果|机会|代价|反差|半步答案|误判|冲突|预算|线索|行动/.test(firstScreenPromise);
  if (!firstScreenPromise || !hasFirstScreenWindow || !hasFirstScreenPayload) {
    issues.push({
      code: "viral_genome_first_screen_contract",
      detail: "百篇样本基因包缺少可执行的第一屏兑付合同，开头可能继续铺背景或讲道理。",
    });
  }
  if (!shareTrigger || readerShareReasons.length === 0) {
    issues.push({
      code: "viral_genome_share_reason",
      detail: "百篇样本基因包缺少读者转发理由，文章容易变成观点正确但没有传播动力。",
    });
  }
  if (!authorPostureMode || !["case_breakdown", "operator_test", "analysis_interpreter"].includes(authorPostureMode)) {
    issues.push({
      code: "viral_genome_author_posture_mode",
      detail: "商业聚焦样本必须先锁定作者姿态模式，避免正文滑回导师口吻。",
    });
  }
  if (businessQuestions.length < 5) {
    issues.push({
      code: "viral_genome_business_questions",
      detail: "商业聚焦样本必须给出足够完整的商业七问，研究与深写作才不会退回泛商业表达。",
    });
  }
  if (titleDirections.length < 3) {
    issues.push({
      code: "viral_genome_title_directions",
      detail: "百篇样本基因包缺少标题方向，标题阶段会丢失具体对象、变化和后果/机会的传播承诺。",
    });
  }
  if (!narrativeSkeleton) {
    issues.push({
      code: "viral_genome_narrative_skeleton",
      detail: "商业聚焦样本缺少叙事骨架，正文容易重新写成平铺解释或方法课。",
    });
  }
  if (sparseTrack && !sparseTrackAlert) {
    issues.push({
      code: "viral_genome_sparse_track_alert",
      detail: "样本稀疏题材必须显式提醒补研究，不可直接沿用高覆盖赛道的默认写法。",
    });
  }
  if (materialJobs.length < 3) {
    issues.push({
      code: "viral_genome_material_jobs",
      detail: "百篇样本基因包的素材任务不足，第一屏很难长出具体对象、场景、数字或代价。",
    });
  }
  if (evidencePriorities.length < 3) {
    issues.push({
      code: "viral_genome_evidence_priorities",
      detail: "百篇样本基因包缺少证据优先级，正文容易只给观点、情绪或方法，缺少数字、案例、原话和工具平台支撑。",
    });
  }
  if (emotionVectors.length < 2) {
    issues.push({
      code: "viral_genome_emotion_vectors",
      detail: "百篇样本基因包缺少情绪向量，正文无法稳定把信息转成身份代入、好奇心、机会感或效率冲动。",
    });
  }
  const visualSlotCodes = new Set(visualRhythmSlots.map((item) => getString(item.code)));
  if (!visualSlotCodes.has("early_evidence") || !visualSlotCodes.has("middle_pacing")) {
    issues.push({
      code: "viral_genome_visual_rhythm",
      detail: "百篇样本基因包缺少早段证据位或中段换气位，配图规划容易退回装饰图或提示卡。",
    });
  }
  if (negativePatterns.length === 0) {
    issues.push({
      code: "viral_genome_negative_patterns",
      detail: "百篇样本基因包缺少同题材低质模式，生成器无法主动避开教程腔、趋势腔或空泛表达。",
    });
  }
  if (readerSceneAnchors.length < 3) {
    issues.push({
      code: "viral_genome_reader_scene_anchors",
      detail: "百篇样本基因包缺少足够的贴近现场词，正文容易继续漂在概念层。",
    });
  }
  if (abstractToConcretePairs.length < 2) {
    issues.push({
      code: "viral_genome_translation_pairs",
      detail: "百篇样本基因包缺少抽象转现场翻译对，系统还不能稳定把研究腔改写成读者现场话。",
    });
  }
  if (openingMicroScenes.length === 0) {
    issues.push({
      code: "viral_genome_opening_micro_scenes",
      detail: "百篇样本基因包缺少开头微场景，开头仍可能只有判断没有画面。",
    });
  }

  return issues;
}

function getDeepWritingEvidenceGateIssues(outputJson: Record<string, unknown>) {
  const issues: OptimizationGateIssue[] = [];
  const mustUseFacts = getUniqueStrings(outputJson.mustUseFacts, 8);
  const sections = getRecordArray(outputJson.sectionBlueprint);
  const evidenceReadySections = sections.filter((section) => {
    const evidenceHints = getUniqueStrings(section.evidenceHints, 4);
    const materialRefs = Array.isArray(section.materialRefs) ? section.materialRefs.filter((item) => Number(item) > 0) : [];
    return evidenceHints.length > 0 || materialRefs.length > 0;
  });
  const requiredEvidenceSections = Math.min(3, sections.length);

  if (mustUseFacts.length < 2) {
    issues.push({
      code: "deep_writing_must_use_facts",
      detail: `正文执行卡必须至少带 2 条真实事实锚点，当前只有 ${mustUseFacts.length} 条；爆款商业文不能只靠判断和情绪推进。`,
    });
  }
  if (sections.length > 0 && evidenceReadySections.length < requiredEvidenceSections) {
    issues.push({
      code: "deep_writing_section_evidence",
      detail: `正文执行卡至少 ${requiredEvidenceSections} 节要绑定 evidenceHints 或 materialRefs，当前只有 ${evidenceReadySections.length} 节；否则正文容易写成观点平铺。`,
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
  const businessQuestions = getUniqueStrings(researchBrief.businessQuestions, 7);
  const businessQuestionAnswers = getRecordArray(researchBrief.businessQuestionAnswers)
    .filter((item) => getString(item.question) && getString(item.answer));
  const sparseTrackResearchPlan = getRecord(researchBrief.sparseTrackResearchPlan);
  const sparseTrack = Boolean(sparseTrackResearchPlan?.sparseTrack);
  const sparseRequiredAngles = getUniqueStrings(sparseTrackResearchPlan?.requiredAngles, 6);
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
  if (businessQuestions.length < 7 || businessQuestionAnswers.length < 7) {
    issues.push({
      code: "readiness_business_questions",
      detail: `商业七问未完整进入研究简报：问题 ${businessQuestions.length}/7，答案 ${businessQuestionAnswers.length}/7；不能让正文退回泛商业教程。`,
    });
  }
  if (sparseTrack && sparseRequiredAngles.length < 3) {
    issues.push({
      code: "readiness_sparse_research_plan",
      detail: "稀疏题材缺少补源强化计划，必须显式覆盖钱从哪里来、为什么现在、谁不适合做等角度。",
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
  issues.push(...prefixGateIssues("readiness_viral_genome", getViralGenomePackGateIssues(deepWriting)));
  issues.push(...prefixGateIssues("readiness_evidence", getDeepWritingEvidenceGateIssues(deepWriting)));
  if (materialRealityMode === "nonfiction") {
    issues.push(...prefixGateIssues("readiness_nonfiction", getNonfictionAuthorPerspectiveMaterialGateIssues(deepWriting)));
  } else {
    issues.push(...prefixGateIssues("readiness_fictional", getFictionalMaterialPlanGateIssues(deepWriting)));
  }

  return issues;
}

export function getGeneratedArticleViralQualityGateIssues(input: GeneratedArticleViralQualityInput) {
  const issues: OptimizationGateIssue[] = [];
  const markdownContent = String(input.markdownContent || "");
  const htmlContent = String(input.htmlContent || "");
  const plainText = normalizeReaderText(markdownContent);
  const firstReaderBlock = extractFirstReaderBlock(markdownContent);
  const noise = analyzeAiNoise(plainText);
  const firstScreenContractMissing = getFirstScreenContractMissing(firstReaderBlock);
  const firstParagraphDidacticSignal = countPatternMatches(firstReaderBlock, FIRST_PARAGRAPH_DIDACTIC_PATTERNS);
  const commercialEvidenceTypeHits = getCommercialEvidenceTypeHits(plainText);
  const internalLabelHits = Array.from(new Set([
    ...collectInternalLabelHits(markdownContent),
    ...collectInternalLabelHits(htmlContent),
  ]));
  const finalBodyContract = evaluateFinalBodyViralContract({
    markdownContent,
  });

  if (!plainText) {
    return [{
      code: "generated_article_empty",
      detail: "终稿正文为空，无法进入爆款质量验收。",
    }];
  }
  if (firstScreenContractMissing.length > 0) {
    issues.push({
      code: "generated_article_first_screen_contract",
      detail: `终稿第一屏缺少爆款承诺：${firstScreenContractMissing.join("、")}。终稿不能只继承开头优化结果，必须在最终正文前 200 字兑现对象、变化和后果/机会。`,
    });
  }
  if (noise.didacticToneRisk === "high") {
    issues.push({
      code: "generated_article_didactic_tone",
      detail: `终稿说教姿态过重，命令、步骤或框架化提示 ${noise.didacticCueCount} 个；读者会感觉作者在灌输做法，而不是带他看见一场真实冲突。`,
    });
  }
  if (firstParagraphDidacticSignal > 2) {
    issues.push({
      code: "generated_article_first_paragraph_didactic_signal",
      detail: `终稿首段导师式指令信号 ${firstParagraphDidacticSignal} 个，超过 Plan26 上限 2；开头必须先给对象、变化和代价，不要先教读者做事。`,
    });
  }
  if (commercialEvidenceTypeHits.length < 3) {
    issues.push({
      code: "generated_article_commercial_evidence_coverage",
      detail: `终稿商业证据类型只命中 ${commercialEvidenceTypeHits.length}/4（${commercialEvidenceTypeHits.join("、") || "无"}），至少需要覆盖案例主体、数据数字、原话引用、工具平台中的 3 类。`,
    });
  }
  if (noise.distantToneRisk === "high") {
    issues.push({
      code: "generated_article_distant_tone",
      detail: `终稿读者距离感过重，抽象表达 ${noise.distantExpressionCount} 处，现场锚点 ${noise.readerClosenessCueCount} 处；需要把概念判断落回钱、后台、客户、复盘会或具体动作。`,
    });
  }
  if (noise.matchedDistantExpressionPhrases.length > 0) {
    issues.push({
      code: "generated_article_obscure_expression",
      detail: `终稿仍出现晦涩表达：${noise.matchedDistantExpressionPhrases.join("、")}。这类词必须在生成阶段被翻译成读者熟悉的现场话。`,
    });
  }
  if (internalLabelHits.length > 0) {
    issues.push({
      code: "generated_article_internal_label_exposure",
      detail: `终稿或 HTML 暴露内部结构标签：${internalLabelHits.join("、")}。执行卡标签只能服务生成流程，不能作为用户可见内容。`,
    });
  }
  if (!finalBodyContract.passed) {
    issues.push({
      code: "generated_article_final_body_contract",
      detail: `终稿正文契约未兑现：${finalBodyContract.blockers.slice(0, 3).join("；")}。`,
    });
  }

  return issues;
}

export function formatOptimizationGateIssues(issues: OptimizationGateIssue[]) {
  return issues.map((item) => item.detail).join("；");
}
