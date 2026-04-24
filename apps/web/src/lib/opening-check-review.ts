export type OpeningCheckItem = {
  key?: string;
  label?: string;
  detail?: string;
  status?: string;
  severity?: string;
};

export type OpeningCheckDiagnose = {
  abstractLevel?: string;
  paddingLevel?: string;
  hookDensity?: string;
  informationFrontLoading?: string;
};

export type OpeningCheckPayload = {
  openingText?: string;
  patternLabel?: string;
  qualityCeiling?: string;
  hookScore?: number;
  recommendReason?: string;
  recommendedDirection?: string;
  rewriteDirections?: string[];
  forbiddenHits?: string[];
  diagnose?: OpeningCheckDiagnose;
  checks?: OpeningCheckItem[];
  checkedAt?: string;
};

type ToneMeta = {
  label: string;
  className: string;
};

const CHECK_STATUS_META: Record<string, ToneMeta> = {
  blocked: { label: "阻断", className: "text-warning" },
  warning: { label: "警告", className: "text-cinnabar" },
  passed: { label: "通过", className: "text-emerald-700" },
};

const DIAGNOSE_DIMENSIONS = [
  { key: "abstractLevel", label: "抽象度" },
  { key: "paddingLevel", label: "铺垫冗余" },
  { key: "hookDensity", label: "钩子密度" },
  { key: "informationFrontLoading", label: "信息前置" },
] as const;

const DIAGNOSE_LEVEL_META: Record<string, ToneMeta> = {
  danger: { label: "危险", className: "text-warning" },
  warn: { label: "提醒", className: "text-cinnabar" },
  pass: { label: "正常", className: "text-emerald-700" },
};

export function resolveOpeningCheckStatus(checks: OpeningCheckItem[]) {
  if (checks.some((item) => item.status === "blocked")) {
    return { code: "blocked", ...CHECK_STATUS_META.blocked } as const;
  }
  if (checks.some((item) => item.status === "warning")) {
    return { code: "warning", ...CHECK_STATUS_META.warning } as const;
  }
  return { code: "passed", ...CHECK_STATUS_META.passed } as const;
}

export function getOpeningCheckToneMeta(status: string | null | undefined) {
  return CHECK_STATUS_META[status || ""] ?? CHECK_STATUS_META.passed;
}

export function getOpeningDiagnoseRows(diagnose?: OpeningCheckDiagnose | null) {
  return DIAGNOSE_DIMENSIONS.map((item) => {
    const level = diagnose?.[item.key] || "pass";
    return {
      key: item.key,
      dimensionLabel: item.label,
      level,
      statusLabel: DIAGNOSE_LEVEL_META[level].label,
      className: DIAGNOSE_LEVEL_META[level].className,
    };
  });
}

export function getOpeningRewriteDirections(payload: OpeningCheckPayload | null | undefined) {
  const items = Array.isArray(payload?.rewriteDirections)
    ? payload?.rewriteDirections?.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (items.length > 0) {
    return items.slice(0, 2);
  }
  if (payload?.recommendedDirection?.trim()) {
    return [payload.recommendedDirection.trim()];
  }
  return [];
}
