export type ArticleStatus = "draft" | "ready" | "published" | "publish_failed";

const ARTICLE_STATUS_ORDER: Record<ArticleStatus, number> = {
  draft: 0,
  ready: 1,
  published: 2,
  publish_failed: 3,
};

export function normalizeArticleStatus(status: string | null | undefined) {
  if (status === "draft" || status === "ready" || status === "published" || status === "publish_failed") {
    return status;
  }
  return status || "draft";
}

export function toStoredArticleStatus(status: string | null | undefined) {
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
  if (normalized === "publish_failed") return "发布失败";
  return normalized || "未设置状态";
}
