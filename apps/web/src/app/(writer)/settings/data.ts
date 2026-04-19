import { getKnowledgeCards } from "@/lib/knowledge";
import { getActiveTemplates } from "@/lib/layout-templates";
import { getLanguageGuardRules } from "@/lib/language-guard";
import { requireWriterSession } from "@/lib/page-auth";
import {
  getCoverImageQuotaStatus,
  getImageAssetStorageQuotaStatus,
  getUserPlanContext,
} from "@/lib/plan-access";
import { getPersonaCatalog, getPersonas } from "@/lib/personas";
import {
  getAssetFilesByUser,
  getCurrentSubscriptionForUser,
  getFragmentsByUser,
  getUserWorkspaceAssetSummary,
  getWechatConnections,
  getWechatSyncLogs,
} from "@/lib/repositories";
import { getSeries } from "@/lib/series";
import { getVisibleTopicSources } from "@/lib/topic-signals";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getWritingStyleProfiles } from "@/lib/writing-style-profiles";

export async function requireSettingsAccess() {
  return requireWriterSession();
}

export function summarizeTemplateTone(config: Record<string, unknown> | undefined) {
  return String(config?.tone || "默认").trim() || "默认";
}

export function summarizeTemplateParagraphLength(config: Record<string, unknown> | undefined) {
  const value = String(config?.paragraphLength || "medium");
  if (value === "short") return "短段落";
  if (value === "long") return "长段落";
  return "中段落";
}

export function summarizeTemplateSource(sourceUrl: string | null) {
  if (!sourceUrl) return "系统模板库";
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

export function formatTemplateLastUsed(value: string | null | undefined) {
  if (!value) return "暂未使用";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAssetDate(value: string | null | undefined) {
  if (!value) return "暂未记录";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export function formatConnectionStatus(status: string) {
  if (status === "valid") return "可发布";
  if (status === "expired") return "待刷新";
  if (status === "invalid") return "凭证失效";
  if (status === "disabled") return "已停用";
  return status || "未知";
}

export function formatWechatSyncStatus(status: string) {
  if (status === "success") return "推送成功";
  if (status === "failed") return "推送失败";
  if (status === "pending") return "等待中";
  return status || "未知状态";
}

export function formatPublishFailureCode(code: string | null | undefined) {
  if (!code) return "未分类";
  if (code === "auth_failed") return "凭证失败";
  if (code === "media_failed") return "媒体素材失败";
  if (code === "rate_limited") return "频率限制";
  if (code === "content_invalid") return "内容格式问题";
  return "上游异常";
}

function stringifySummary(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function summarizeSyncPayload(
  value: string | Record<string, unknown> | null,
  maxLength = 180,
) {
  const summary = stringifySummary(value);
  if (!summary) return null;
  return summary.length > maxLength ? `${summary.slice(0, maxLength).trimEnd()}…` : summary;
}

export function parseStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function formatSourceTypeLabel(value: string | null | undefined) {
  if (value === "youtube") return "YouTube";
  if (value === "reddit") return "Reddit";
  if (value === "podcast") return "播客";
  if (value === "spotify") return "Spotify";
  if (value === "rss") return "RSS";
  if (value === "blog") return "博客";
  return "资讯";
}

export function formatSubscriptionSourceLabel(value: string | null | undefined) {
  if (value === "manual" || !String(value || "").trim()) return "手动配置";
  if (value === "stripe") return "Stripe";
  if (value === "apple") return "Apple";
  if (value === "wechat") return "微信支付";
  return String(value);
}

export async function getSettingsHubData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session, user } = auth;
  const [planContext, dailyGenerationUsage, workspaceAssets, connections, topicSources, languageGuardRules] =
    await Promise.all([
      getUserPlanContext(session.userId),
      getDailyGenerationUsage(session.userId),
      getUserWorkspaceAssetSummary(session.userId),
      getWechatConnections(session.userId),
      getVisibleTopicSources(session.userId),
      getLanguageGuardRules(session.userId),
    ]);

  return {
    session,
    user,
    planContext,
    dailyGenerationUsage,
    workspaceAssets,
    connections,
    topicSources,
    languageGuardRules,
  };
}

export async function getAuthorSettingsData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session } = auth;
  const [planContext, personas, personaCatalog, series, writingStyleProfiles] = await Promise.all([
    getUserPlanContext(session.userId),
    getPersonas(session.userId),
    getPersonaCatalog(),
    getSeries(session.userId),
    getWritingStyleProfiles(session.userId),
  ]);

  return {
    session,
    planContext,
    personas,
    personaCatalog,
    series,
    writingStyleProfiles,
  };
}

export async function getAssetsSettingsData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session } = auth;
  const [planContext, workspaceAssets, fragments, knowledgeCards, assetFiles, templates] =
    await Promise.all([
      getUserPlanContext(session.userId),
      getUserWorkspaceAssetSummary(session.userId),
      getFragmentsByUser(session.userId),
      getKnowledgeCards(session.userId),
      getAssetFilesByUser(session.userId),
      getActiveTemplates(session.userId),
    ]);

  return {
    session,
    planContext,
    workspaceAssets,
    fragments,
    knowledgeCards,
    assetFiles,
    templates,
  };
}

export async function getSourcesSettingsData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session } = auth;
  const [planContext, topicSources] = await Promise.all([
    getUserPlanContext(session.userId),
    getVisibleTopicSources(session.userId),
  ]);

  return {
    planContext,
    topicSources,
  };
}

export async function getPublishSettingsData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session } = auth;
  const [planContext, connections, syncLogs] = await Promise.all([
    getUserPlanContext(session.userId),
    getWechatConnections(session.userId),
    getWechatSyncLogs(session.userId),
  ]);

  return {
    planContext,
    connections,
    syncLogs,
  };
}

export async function getAccountSettingsData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session, user } = auth;
  const [
    planContext,
    dailyGenerationUsage,
    subscription,
    coverImageQuota,
    imageAssetQuota,
    workspaceAssets,
    connections,
  ] = await Promise.all([
    getUserPlanContext(session.userId),
    getDailyGenerationUsage(session.userId),
    getCurrentSubscriptionForUser(session.userId),
    getCoverImageQuotaStatus(session.userId),
    getImageAssetStorageQuotaStatus(session.userId),
    getUserWorkspaceAssetSummary(session.userId),
    getWechatConnections(session.userId),
  ]);

  return {
    user,
    planContext,
    dailyGenerationUsage,
    subscription,
    coverImageQuota,
    imageAssetQuota,
    workspaceAssets,
    connections,
  };
}

export async function getLanguageGuardSettingsData() {
  const auth = await requireSettingsAccess();
  if (!auth) return null;
  const { session } = auth;
  const [planContext, languageGuardRules] = await Promise.all([
    getUserPlanContext(session.userId),
    getLanguageGuardRules(session.userId),
  ]);

  return {
    planContext,
    languageGuardRules,
  };
}
