import type { ArticleStatus } from "./domain";

const ARTICLE_STATUS_ORDER: Record<ArticleStatus, number> = {
  draft: 0,
  ready: 1,
  published: 2,
  publish_failed: 3,
};

const ARTICLE_STATUS_ALIASES: Record<string, ArticleStatus> = {
  draft: "draft",
  pending: "draft",
  writing: "draft",
  ready: "ready",
  complete: "ready",
  completed: "ready",
  generated: "ready",
  published: "published",
  publish_success: "published",
  publish_succeeded: "published",
  publish_failed: "publish_failed",
  publish_fail: "publish_failed",
  publish_error: "publish_failed",
  failed: "publish_failed",
};

function normalizeArticleStatusKey(status: string | null | undefined) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeArticleStatus(status: string | null | undefined): ArticleStatus {
  return ARTICLE_STATUS_ALIASES[normalizeArticleStatusKey(status)] ?? "draft";
}

export function toStoredArticleStatus(status: string | null | undefined): ArticleStatus {
  return normalizeArticleStatus(status);
}

export function isPublishedArticleStatus(status: string | null | undefined) {
  return normalizeArticleStatus(status) === "published";
}

export function compareArticleStatuses(left: string, right: string) {
  const normalizedLeft = normalizeArticleStatus(left);
  const normalizedRight = normalizeArticleStatus(right);
  return (ARTICLE_STATUS_ORDER[normalizedLeft as ArticleStatus] ?? 99) - (ARTICLE_STATUS_ORDER[normalizedRight as ArticleStatus] ?? 99);
}

export function formatArticleStatusLabel(status: string | null | undefined) {
  const normalized = normalizeArticleStatus(status);
  if (normalized === "published") return "已发布";
  if (normalized === "draft") return "草稿";
  if (normalized === "ready") return "待成稿";
  return "发布失败";
}
