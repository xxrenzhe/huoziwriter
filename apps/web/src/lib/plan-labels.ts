export function formatPlanDisplayName(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "未设置套餐";

  const code = normalized.toLowerCase();
  if (code === "free") return "免费版";
  if (code === "pro") return "Pro";
  if (code === "ultra") return "Ultra";

  return normalized;
}
