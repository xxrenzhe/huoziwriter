import { summarizeTemplateRenderConfig } from "./template-rendering";

export type PublishStageStatus = "ready" | "needs_attention" | "blocked";
export type PublishGuardStatus = "passed" | "warning" | "blocked";
export type WorkflowStageStatus = "pending" | "current" | "completed" | "failed";
export type OutcomeHitStatus = "pending" | "hit" | "near_miss" | "miss";
export type ArticleMainStepStatus = "pending" | "current" | "completed" | "needs_attention";

export function formatPublishFailureCode(code: string | null | undefined) {
  if (!code) return "未分类";
  if (code === "ip_whitelist_blocked") return "IP 白名单未放行";
  if (code === "auth_failed") return "凭证失败";
  if (code === "media_failed") return "媒体素材失败";
  if (code === "rate_limited") return "频率限制";
  if (code === "content_invalid") return "内容格式问题";
  return "上游异常";
}

export function formatConnectionStatus(status: string | null | undefined) {
  if (status === "valid") return "可发布";
  if (status === "expired") return "待刷新";
  if (status === "invalid") return "凭证失效";
  if (status === "disabled") return "已停用";
  return status || "未知";
}

export function formatAiNoiseLevel(level: string | null | undefined) {
  if (level === "low") return "低";
  if (level === "medium") return "中";
  if (level === "high") return "高";
  return level || "未知";
}

export function formatPublishStageStatus(status: PublishStageStatus) {
  if (status === "ready") return "已就绪";
  if (status === "blocked") return "阻断";
  return "待处理";
}

export function formatStageChecklistStatus(status: PublishStageStatus) {
  if (status === "ready") return "已完成";
  if (status === "blocked") return "阻断项";
  return "待补充";
}

export function formatWritingQualityStatus(status: PublishStageStatus) {
  if (status === "ready") return "通过";
  if (status === "blocked") return "阻断";
  return "需关注";
}

export function formatPublishGuardStatus(status: PublishGuardStatus) {
  if (status === "passed") return "通过";
  if (status === "blocked") return "拦截";
  return "需关注";
}

export function formatDeepWritingHistoryAdjustment(value: number | null | undefined) {
  const adjustment = Number(value || 0);
  if (!Number.isFinite(adjustment) || adjustment === 0) {
    return "";
  }
  return adjustment < 0 ? "本次轻度加权" : "本次降权观察";
}

export function formatResearchStepSummaryStatus(status: PublishStageStatus) {
  if (status === "ready") return "研究已就位";
  if (status === "blocked") return "研究阻断";
  return "研究待补";
}

export function formatViewpointAction(action: string) {
  if (action === "adopted") return "已采纳";
  if (action === "softened") return "已弱化";
  if (action === "deferred") return "暂缓采用";
  if (action === "conflicted") return "判定冲突";
  return action || "未说明";
}

export function formatTitleAuditTimestamp(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFactCheckActionLabel(action: string) {
  if (action === "source") return "补来源锚点";
  if (action === "soften") return "改判断语气";
  if (action === "remove") return "删除该表述";
  if (action === "mark_opinion") return "明确为观点";
  return "保持原样";
}

export function formatFactCheckStatusLabel(status: string) {
  if (status === "needs_source") return "需补来源";
  if (status === "risky") return "高风险";
  if (status === "opinion") return "观点表达";
  if (status === "verified") return "已核实";
  return status || "待确认";
}

export function formatKnowledgeStatus(status: string) {
  if (status === "active") return "可引用";
  if (status === "stale") return "待刷新";
  if (status === "conflicted") return "有冲突";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status;
}

export function formatTemplateConfigSummary(template?: { config?: Record<string, unknown> } | null) {
  return summarizeTemplateRenderConfig(template, 7).filter(
    (item) => !item.startsWith("标题密度：") && !item.startsWith("列表："),
  );
}

export function formatTemplateAssetOwner(template?: { ownerUserId?: number | null } | null) {
  return template?.ownerUserId == null ? "官方模板库" : "你的个人空间";
}

export function formatTemplateSourceSummary(template?: { sourceUrl?: string | null } | null) {
  if (!template?.sourceUrl) {
    return "系统模板库";
  }
  try {
    return new URL(template.sourceUrl).hostname;
  } catch {
    return template.sourceUrl;
  }
}

export function formatWorkflowStageStatus(status: WorkflowStageStatus) {
  if (status === "completed") return "已完成";
  if (status === "current") return "进行中";
  if (status === "failed") return "待处理";
  return "待开始";
}

export function formatArticleMainStepStatus(status: ArticleMainStepStatus) {
  if (status === "completed") return "已完成";
  if (status === "current") return "进行中";
  if (status === "needs_attention") return "需关注";
  return "待开始";
}

export function formatOutcomeHitStatus(status: OutcomeHitStatus) {
  if (status === "hit") return "已命中";
  if (status === "near_miss") return "差一点命中";
  if (status === "miss") return "未命中";
  return "待判定";
}

export function formatTopicAttributionSourceLabel(value: string | null | undefined) {
  if (value === "radar") return "选题雷达";
  if (value === "topicFission") return "选题裂变";
  if (value === "manual") return "手动录入";
  return value || "未记录";
}

export function formatTopicFissionModeLabel(value: string | null | undefined) {
  if (value === "regularity") return "规律裂变";
  if (value === "contrast") return "差异化";
  if (value === "cross-domain") return "跨赛道迁移";
  return value || "未记录";
}

export function formatOutcomeRhythmStatusLabel(value: string | null | undefined) {
  if (value === "aligned") return "节奏贴合";
  if (value === "needs_attention") return "节奏偏移";
  if (value === "insufficient") return "样本不足";
  return value || "未评估";
}

export function formatFactRiskLabel(risk: string) {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  if (risk === "low") return "低风险";
  return risk || "未评估";
}

export function formatEvidenceSupportLevel(level: string) {
  if (level === "strong") return "证据较强";
  if (level === "partial") return "证据部分命中";
  if (level === "missing") return "缺少证据";
  return level || "未评估";
}

export function formatResearchCoverageSufficiencyLabel(value: string) {
  if (value === "ready") return "研究底座已就位";
  if (value === "limited") return "研究仍有限";
  if (value === "blocked") return "研究覆盖不足";
  return value || "未评估";
}

export function formatResearchSupportStatusLabel(value: string) {
  if (value === "enough") return "已支撑";
  if (value === "missing") return "仍缺支撑";
  return value || "未评估";
}

export function formatResearchSourceTraceLabel(value: string) {
  if (value === "official") return "官方源";
  if (value === "industry") return "行业源";
  if (value === "comparison") return "同类源";
  if (value === "userVoice") return "用户源";
  if (value === "timeline") return "时间源";
  if (value === "knowledge") return "背景卡";
  if (value === "history") return "历史文章";
  if (value === "url") return "链接源";
  if (value === "screenshot") return "截图源";
  if (value === "manual") return "文本素材";
  return value || "来源";
}

export function formatOutlineResearchFocusLabel(value: string) {
  if (value === "timeline") return "时间脉络";
  if (value === "comparison") return "横向比较";
  if (value === "intersection") return "交汇洞察";
  if (value === "support") return "辅助支撑";
  return value || "研究焦点";
}

export function formatFragmentSourceType(type: string | null | undefined) {
  if (type === "url") return "链接";
  if (type === "screenshot") return "截图";
  if (type === "ima_kb") return "IMA 爆款";
  return "文本";
}

export function formatFragmentUsageMode(mode: string | null | undefined) {
  return mode === "image" ? "原样插图" : "可改写素材";
}
