import { PLAN_LABELS, type UserPlanCode } from "@huoziwriter/core";
import { isStandardPlanCode } from "@/lib/plan-entitlements";

export const MANAGED_PLAN_CODES = ["free", "pro", "ultra"] as const satisfies readonly UserPlanCode[];

const PLAN_DISPLAY_NAMES: Record<UserPlanCode, string> = {
  free: "免费版",
  pro: "Pro",
  ultra: "Ultra",
};

const PLAN_MARKETING_TAGLINES: Record<UserPlanCode, string> = {
  free: "Free",
  pro: "Pro",
  ultra: "Ultra",
};

export const MANAGED_PLAN_OPTIONS = MANAGED_PLAN_CODES.map((code) => ({
  code,
  label: PLAN_LABELS[code],
}));

export function formatPlanDisplayName(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "未设置套餐";

  const code = normalized.toLowerCase();
  if (isStandardPlanCode(code)) {
    return PLAN_DISPLAY_NAMES[code];
  }

  return normalized;
}

export function getPlanMarketingTagline(code: string) {
  if (isStandardPlanCode(code)) {
    return PLAN_MARKETING_TAGLINES[code];
  }
  return code.toUpperCase();
}

export function getPlanSortOrder(code: string) {
  return MANAGED_PLAN_CODES.findIndex((item) => item === code);
}
