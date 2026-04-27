export type AutomationLevel = "draftPreview" | "wechatDraft" | "strategyOnly";
export type AutomationRunStatus = "queued" | "running" | "blocked" | "failed" | "completed" | "cancelled";
export type AutomationStageStatus = "queued" | "running" | "retrying" | "blocked" | "failed" | "completed" | "skipped";

export type AutomationRun = {
  id: number;
  articleId: number | null;
  inputMode: "brief" | "url" | "recommendedTopic";
  inputText: string;
  sourceUrl: string | null;
  targetWechatConnectionId: number | null;
  targetSeriesId: number | null;
  automationLevel: AutomationLevel;
  status: AutomationRunStatus;
  currentStageCode: string;
  finalWechatMediaId: string | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationStage = {
  stageCode: string;
  promptId: string;
  promptVersion: string;
  sceneCode: string;
  provider: string | null;
  model: string | null;
  status: AutomationStageStatus;
  inputJson: unknown;
  outputJson: unknown;
  qualityJson: unknown;
  searchTraceJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type AutomationArticle = {
  id: number;
  title: string;
  status: string;
  markdown_content: string;
  html_content: string | null;
  updated_at: string;
};

export type AutomationRunDetail = {
  run: AutomationRun;
  stages: AutomationStage[];
  article: AutomationArticle | null;
};

export type SeriesOption = {
  id: number;
  name: string;
  personaName: string;
  activeStatus: string;
};

export type WechatConnectionOption = {
  id: number;
  accountName: string | null;
  originalId: string | null;
  status: string;
  isDefault: boolean;
};

export type AutomationStageDetailSection = {
  title: string;
  items: string[];
};

export type AutomationStageQuickAction = {
  stageCode: string;
  label: string;
};

export type AutomationStageQualityGateState = {
  tone: "passed" | "warning" | "blocked";
  label: string;
  detail: string;
  action?: AutomationStageQuickAction | null;
};

export type AutomationStageSearchMetrics = {
  queryCount: number;
  domainCount: number;
  urlCount: number;
};

export const stageLabels: Record<string, string> = {
  topicAnalysis: "选题分析",
  researchBrief: "联网研究",
  audienceAnalysis: "受众分析",
  outlinePlanning: "大纲规划",
  titleOptimization: "标题优化",
  openingOptimization: "开头优化",
  deepWrite: "深度写作",
  articleWrite: "正文生成",
  factCheck: "事实核查",
  prosePolish: "文笔润色",
  languageGuardAudit: "语言守卫",
  coverImageBrief: "封面 Brief",
  inlineImagePlan: "文中配图规划",
  inlineImageGenerate: "文中配图生成",
  layoutApply: "排版应用",
  publishGuard: "发布守门",
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 6) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function appendSection(sections: AutomationStageDetailSection[], title: string, items: Array<string | null | undefined>, limit = 4) {
  const normalized = items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
  if (normalized.length > 0) {
    sections.push({ title, items: normalized });
  }
}

function collectStageUrls(value: unknown, bucket = new Set<string>()) {
  if (!value) {
    return bucket;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^https?:\/\//i.test(normalized)) {
      bucket.add(normalized);
    }
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStageUrls(item, bucket));
    return bucket;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectStageUrls(item, bucket));
  }
  return bucket;
}

function collectStageQueries(value: unknown, bucket = new Set<string>()) {
  if (!value) {
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStageQueries(item, bucket));
    return bucket;
  }
  if (typeof value !== "object") {
    return bucket;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.query === "string" && record.query.trim()) {
    bucket.add(record.query.trim());
  }
  Object.values(record).forEach((item) => collectStageQueries(item, bucket));
  return bucket;
}

function formatDomainLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

function isQualityGateBlocked(stage: AutomationStage) {
  return /_quality_blocked$/i.test(getString(stage.errorCode)) || /质量门槛|质量门禁/.test(getString(stage.errorMessage));
}

function buildStageQualityGateMetricItems(stage: AutomationStage) {
  const output = getRecord(stage.outputJson) ?? {};
  const quality = getRecord(stage.qualityJson) ?? {};
  const gateState = getStageQualityGateState(stage);
  if (!gateState && !["titleOptimization", "openingOptimization", "articleWrite"].includes(stage.stageCode)) {
    return [] as string[];
  }

  if (stage.stageCode === "titleOptimization") {
    const titleOptionCount = getNumber(quality.titleOptionCount) ?? getRecordArray(output.titleOptions).length;
    const openRateScore = getNumber(output.recommendedTitleOpenRateScore);
    const elementsHitCount = getNumber(output.recommendedTitleElementsHitCount);
    const forbiddenHitCount = getNumber(output.recommendedTitleForbiddenHitCount);
    return [
      titleOptionCount ? `候选：${titleOptionCount} 个` : "",
      openRateScore !== null ? `打开率分：${openRateScore}` : "",
      elementsHitCount !== null ? `标题三要素：${elementsHitCount}/3` : "",
      forbiddenHitCount !== null ? `禁区命中：${forbiddenHitCount}` : "",
    ].filter(Boolean);
  }

  if (stage.stageCode === "openingOptimization") {
    const openingOptionCount = getNumber(quality.openingOptionCount) ?? getRecordArray(output.openingOptions).length;
    const hookScore = getNumber(output.recommendedHookScore);
    const qualityCeiling = getString(output.recommendedQualityCeiling);
    const dangerCount = getNumber(output.recommendedOpeningDangerCount);
    const forbiddenHitCount = getNumber(output.recommendedOpeningForbiddenHitCount);
    return [
      openingOptionCount ? `候选：${openingOptionCount} 个` : "",
      hookScore !== null ? `钩子分：${hookScore}` : "",
      qualityCeiling ? `质量上限：${qualityCeiling}` : "",
      dangerCount !== null ? `Danger：${dangerCount}` : "",
      forbiddenHitCount !== null ? `禁区命中：${forbiddenHitCount}` : "",
    ].filter(Boolean);
  }

  if (stage.stageCode === "articleWrite") {
    const fictionalMaterialCount = getNumber(quality.fictionalMaterialCount);
    const emotionalHookCount = getNumber(quality.viralNarrativeEmotionalHookCount);
    const motifCallbackCount = getNumber(quality.viralNarrativeMotifCallbackCount);
    return [
      getString(quality.viralNarrativeCoreMotif) ? `核心母题：${getString(quality.viralNarrativeCoreMotif)}` : "",
      emotionalHookCount !== null ? `情绪钩子：${emotionalHookCount} 个` : "",
      motifCallbackCount !== null ? `母题回收：${motifCallbackCount} 处` : "",
      fictionalMaterialCount !== null ? `拟真素材：${fictionalMaterialCount} 条` : "",
      getString(quality.viralNarrativeBoundaryRule) ? `边界：${getString(quality.viralNarrativeBoundaryRule)}` : "",
    ].filter(Boolean);
  }

  return [] as string[];
}

export function getStageQualityGateState(stage: AutomationStage): AutomationStageQualityGateState | null {
  const quality = getRecord(stage.qualityJson) ?? {};
  const qualityRetryCount = getNumber(quality.qualityRetryCount) ?? 0;
  const qualityGatePassed = quality.qualityGatePassed === true;
  const qualityRetryAction =
    stage.stageCode === "titleOptimization"
      ? { stageCode: "titleOptimization", label: "重跑标题优化" }
      : stage.stageCode === "openingOptimization"
        ? { stageCode: "openingOptimization", label: "重跑开头优化" }
        : stage.stageCode === "articleWrite" && /^(article_viral_readiness|viral_narrative|fictional_material)_quality_blocked$/i.test(getString(stage.errorCode))
          ? { stageCode: "articleWrite", label: "重跑正文生成" }
          : null;

  if (isQualityGateBlocked(stage)) {
    return {
      tone: "blocked",
      label: "质量门禁阻断",
      detail: getString(stage.errorMessage) || "该阶段未通过质量门槛，需要回到这一层重新生成。",
      action: qualityRetryAction,
    };
  }
  if (stage.stageCode === "articleWrite" && (quality.articleViralReadinessGatePassed === true || quality.viralNarrativeGatePassed === true || quality.fictionalMaterialGatePassed === true)) {
    return {
      tone: "passed",
      label: "爆款可写性门禁通过",
      detail: "研究、标题、开头、叙事计划和拟真素材包已通过正文生成前总门槛。",
      action: null,
    };
  }
  if (qualityGatePassed && qualityRetryCount > 0) {
    return {
      tone: "warning",
      label: "自动补救后通过",
      detail: `该阶段因质量不足自动重跑 ${qualityRetryCount} 次，最终通过门槛。`,
      action: qualityRetryAction,
    };
  }
  if (qualityGatePassed) {
    return {
      tone: "passed",
      label: "一次通过",
      detail: "该阶段首次生成即通过质量门槛。",
      action: qualityRetryAction,
    };
  }
  return null;
}

export function getStageQualityGateClassName(tone: AutomationStageQualityGateState["tone"]) {
  if (tone === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-cinnabar/20 bg-cinnabar/5 text-cinnabar";
}

export function getStageSearchMetrics(stage: AutomationStage): AutomationStageSearchMetrics | null {
  const urls = [...collectStageUrls(stage.searchTraceJson)];
  const queries = [...collectStageQueries(stage.searchTraceJson)];
  const domains = new Set(urls.map((item) => formatDomainLabel(item)));
  if (urls.length === 0 && queries.length === 0) {
    return null;
  }
  return {
    queryCount: queries.length,
    domainCount: domains.size,
    urlCount: urls.length,
  };
}

export function buildStageDetailSections(stage: AutomationStage): AutomationStageDetailSection[] {
  const output = getRecord(stage.outputJson) ?? {};
  const quality = getRecord(stage.qualityJson) ?? {};
  const sections: AutomationStageDetailSection[] = [];

  appendSection(sections, "决策信号", [
    getString(output.decision) ? `决策：${getString(output.decision)}` : null,
    getString(output.whyNow) ? `Why now：${getString(output.whyNow)}` : null,
    getString(output.readerBenefit) ? `读者收益：${getString(output.readerBenefit)}` : null,
    getString(output.risk) ? `风险：${getString(output.risk)}` : null,
    getString(output.targetReader) ? `目标读者：${getString(output.targetReader)}` : null,
    getString(output.recommendedCallToAction) ? `建议 CTA：${getString(output.recommendedCallToAction)}` : null,
  ]);

  appendSection(sections, "研究查询", getRecordArray(output.queries).map((item) => {
    const query = getString(item.query);
    const purpose = getString(item.purpose);
    return query ? `${query}${purpose ? ` · ${purpose}` : ""}` : "";
  }));

  appendSection(sections, "信源摘要", getRecordArray(output.sources).map((item) => {
    const label = getString(item.label);
    const sourceType = getString(item.sourceType);
    const detail = getString(item.detail);
    const sourceUrl = getString(item.sourceUrl);
    const sourceLabel = sourceUrl ? formatDomainLabel(sourceUrl) : "";
    return [label, sourceType, sourceLabel || detail].filter(Boolean).join(" · ");
  }));

  appendSection(sections, "结构规划", [
    ...getRecordArray(output.sections).map((item) => {
      const heading = getString(item.heading);
      const goal = getString(item.goal);
      return heading ? `${heading}${goal ? ` · ${goal}` : ""}` : "";
    }),
    getString(output.workingTitle) ? `工作标题：${getString(output.workingTitle)}` : null,
    getString(output.openingHook) ? `开头抓手：${getString(output.openingHook)}` : null,
  ], 5);

  appendSection(sections, "候选方案", [
    ...getRecordArray(output.titleOptions).map((item) => {
      const title = getString(item.title);
      const angle = getString(item.angle);
      return title ? `${title}${angle ? ` · ${angle}` : ""}` : "";
    }),
    ...getRecordArray(output.openingOptions).map((item) => {
      const opening = getString(item.opening);
      const patternLabel = getString(item.patternLabel);
      return opening ? `${opening.slice(0, 42)}${opening.length > 42 ? "..." : ""}${patternLabel ? ` · ${patternLabel}` : ""}` : "";
    }),
  ], 4);

  appendSection(sections, "事实与风险", [
    ...getStringArray(output.highRiskClaims, 4).map((item) => `高风险：${item}`),
    ...getStringArray(output.needsEvidence, 4).map((item) => `待补证：${item}`),
    ...getStringArray(output.missingEvidence, 4).map((item) => `缺口：${item}`),
    getString(output.overallRisk) ? `总体风险：${getString(output.overallRisk)}` : null,
  ], 5);

  appendSection(sections, "润色结果", [
    getString(output.rewrittenLead) ? `重写开头：${getString(output.rewrittenLead)}` : null,
    ...getStringArray(output.punchlines, 4).map((item) => `金句：${item}`),
    ...getRecordArray(output.changes).map((item) => {
      const type = getString(item.type);
      const suggestion = getString(item.suggestion);
      return [type, suggestion].filter(Boolean).join(" · ");
    }),
  ], 4);

  appendSection(sections, "发布守门", [
    ...getStringArray(output.blockers, 4).map((item) => `阻塞：${item}`),
    ...getStringArray(output.warnings, 4).map((item) => `提醒：${item}`),
    ...getStringArray(output.repairActions, 4).map((item) => `修复：${item}`),
    typeof output.canPublish === "boolean" ? `可发布：${output.canPublish ? "是" : "否"}` : null,
  ], 5);

  appendSection(sections, "质量记录", [
    getString(quality.artifactSummary) ? `摘要：${getString(quality.artifactSummary)}` : null,
    ...getStringArray(quality.promptVersionRefs, 3).map((item) => `Prompt：${item}`),
    ...getStringArray(quality.repairActions, 3).map((item) => `动作：${item}`),
    getString(quality.decision) ? `决策：${getString(quality.decision)}` : null,
    (() => {
      const gateState = getStageQualityGateState(stage);
      return gateState ? `门禁：${gateState.label} · ${gateState.detail}` : null;
    })(),
    ...buildStageQualityGateMetricItems(stage).map((item) => `门禁指标：${item}`),
    quality.fallbackUsed ? "已启用 fallback 输出" : null,
    getString(quality.error) ? `回退原因：${getString(quality.error)}` : null,
  ], 8);

  const searchMetrics = getStageSearchMetrics(stage);
  if (searchMetrics) {
    const urls = [...collectStageUrls(stage.searchTraceJson)].slice(0, 3).map((item) => formatDomainLabel(item));
    appendSection(sections, "搜索轨迹", [
      `查询 ${searchMetrics.queryCount} 条 · 域名 ${searchMetrics.domainCount} 个 · 结果 ${searchMetrics.urlCount} 条`,
      ...urls.map((item) => `命中域名：${item}`),
    ], 4);
  }

  return sections;
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "刚刚";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`;
  return `${Math.max(1, Math.floor(diff / 86_400_000))} 天前`;
}

export function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "待执行";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "执行中";
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function getRunStatusClassName(status: AutomationRunStatus | AutomationStageStatus) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "running" || status === "retrying") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "blocked" || status === "failed" || status === "cancelled") return "border-cinnabar/25 bg-cinnabar/5 text-cinnabar";
  if (status === "skipped") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-lineStrong bg-surface text-inkMuted";
}

export function getAutomationLevelLabel(level: AutomationLevel) {
  if (level === "wechatDraft") return "自动推送草稿箱";
  if (level === "strategyOnly") return "只生成策略";
  return "自动到预览";
}

export function buildStageSummary(stage: AutomationStage) {
  const output = getRecord(stage.outputJson) ?? {};
  const qualityGateState = getStageQualityGateState(stage);
  if (stage.stageCode === "topicAnalysis") {
    return getString(output.coreAssertion) || getString(output.theme) || "自动判断主题收益和 why now。";
  }
  if (stage.stageCode === "researchBrief") {
    const sources = Array.isArray(output.sources) ? output.sources.length : 0;
    const gaps = getStringArray(output.evidenceGaps, 2);
    return sources > 0 ? `已归并 ${sources} 条研究来源。${gaps[0] ? `缺口：${gaps[0]}` : ""}`.trim() : "自动检索并沉淀证据包。";
  }
  if (stage.stageCode === "outlinePlanning") {
    const sections = Array.isArray(output.sections) ? output.sections.length : 0;
    return sections > 0 ? `已规划 ${sections} 个正文段落。` : "自动设计结构和论证递进。";
  }
  if (stage.stageCode === "titleOptimization") {
    if (qualityGateState?.tone === "blocked") {
      return qualityGateState.detail;
    }
    const title = getString(output.recommendedTitle) || "自动筛选最佳标题。";
    return qualityGateState?.tone === "warning" ? `${qualityGateState.label}：${title}` : title;
  }
  if (stage.stageCode === "openingOptimization") {
    if (qualityGateState?.tone === "blocked") {
      return qualityGateState.detail;
    }
    const opening = getString(output.recommendedOpening).slice(0, 56) || "自动筛选最佳开头。";
    return qualityGateState?.tone === "warning" ? `${qualityGateState.label}：${opening}` : opening;
  }
  if (stage.stageCode === "factCheck") {
    const risks = getStringArray(output.highRiskClaims, 2);
    return risks[0] ? `高风险断言：${risks[0]}` : "自动核查事实、因果和时间。";
  }
  if (stage.stageCode === "publishGuard") {
    const blockers = getStringArray(output.blockers, 2);
    const warnings = getStringArray(output.warnings, 2);
    if (blockers[0]) return `阻塞：${blockers[0]}`;
    if (warnings[0]) return `提醒：${warnings[0]}`;
    return "发布前总审查已就绪。";
  }
  if (stage.stageCode === "articleWrite" || stage.stageCode === "prosePolish" || stage.stageCode === "languageGuardAudit") {
    const markdown = getString(output.markdown) || getString(output.polishedMarkdown) || getString(output.fixedMarkdown);
    return markdown ? `正文已生成 ${markdown.length} 字符。` : "自动生产正文并压掉 AI 腔。";
  }
  return stage.errorMessage || "该阶段已接入自动执行。";
}

export function mergeRun(list: AutomationRun[], nextRun: AutomationRun) {
  const merged = [nextRun, ...list.filter((item) => item.id !== nextRun.id)];
  return merged.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 12);
}

export async function readJson<T>(response: Response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || "请求失败"));
  }
  return json.data as T;
}
