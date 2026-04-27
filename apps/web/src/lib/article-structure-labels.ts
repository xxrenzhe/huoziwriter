export const DEFAULT_ARTICLE_NODE_TITLES = ["痛点引入", "核心反转", "底层原因", "行动建议"] as const;

const INTERNAL_ARTICLE_STRUCTURE_LABELS = new Set<string>(DEFAULT_ARTICLE_NODE_TITLES);

export function isInternalArticleStructureLabel(value: string | null | undefined) {
  const normalized = String(value || "").replace(/\s+/g, "").trim();
  return Boolean(normalized) && INTERNAL_ARTICLE_STRUCTURE_LABELS.has(normalized);
}

export function sanitizeUserVisibleVisualCaption(value: string | null | undefined) {
  const normalized = String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || isInternalArticleStructureLabel(normalized)) {
    return null;
  }
  return normalized;
}
