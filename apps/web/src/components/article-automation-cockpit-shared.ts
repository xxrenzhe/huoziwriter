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
    return getString(output.recommendedTitle) || "自动筛选最佳标题。";
  }
  if (stage.stageCode === "openingOptimization") {
    return getString(output.recommendedOpening).slice(0, 56) || "自动筛选最佳开头。";
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
