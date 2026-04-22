import type { LanguageGuardHit } from "./language-guard-core";

export type WorkspaceEditorialAnnotation = {
  id: string;
  anchorId: string;
  order: number;
  ruleId: string;
  ruleKind: LanguageGuardHit["ruleKind"];
  severity: LanguageGuardHit["severity"];
  scope: LanguageGuardHit["scope"];
  matchedText: string;
  patternText: string;
  rewriteHint: string | null;
  count: number;
  sampleContext: string;
};

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEditorialAnnotationAnchorId(order: number) {
  return `editorial-annotation-${order}`;
}

export function buildEditorialReview(markdown: string, hits: LanguageGuardHit[]) {
  const text = String(markdown || "");
  if (!text.trim() || hits.length === 0) {
    return {
      html: escapeHtml(text),
      annotations: [] as WorkspaceEditorialAnnotation[],
    };
  }

  const ranges: Array<{
    start: number;
    end: number;
    annotationId: string;
    anchorId: string;
    order: number;
    severity: LanguageGuardHit["severity"];
    isPrimary: boolean;
  }> = [];
  const annotations: WorkspaceEditorialAnnotation[] = [];
  const sortedHits = [...hits]
    .map((hit) => ({
      ...hit,
      matched: String(hit.matchedText || hit.patternText || "").trim(),
    }))
    .filter((hit) => hit.matched)
    .sort((left, right) => right.matched.length - left.matched.length);

  function overlaps(start: number, end: number) {
    return ranges.some((range) => start < range.end && end > range.start);
  }

  function buildContext(start: number, end: number) {
    const prefix = text.slice(Math.max(0, start - 18), start).trimStart();
    const suffix = text.slice(end, Math.min(text.length, end + 24)).trimEnd();
    return `${prefix}${text.slice(start, end)}${suffix}`;
  }

  sortedHits.forEach((hit, index) => {
    const annotationId = `${hit.ruleId}-${index}`;
    const anchorId = buildEditorialAnnotationAnchorId(index + 1);
    let count = 0;
    let searchIndex = 0;
    let sampleContext = hit.matched;

    while (searchIndex < text.length) {
      const foundAt = text.indexOf(hit.matched, searchIndex);
      if (foundAt === -1) {
        break;
      }
      const rangeEnd = foundAt + hit.matched.length;
      if (!overlaps(foundAt, rangeEnd)) {
        count += 1;
        if (count === 1) {
          sampleContext = buildContext(foundAt, rangeEnd);
        }
        ranges.push({
          start: foundAt,
          end: rangeEnd,
          annotationId,
          anchorId,
          order: index + 1,
          severity: hit.severity,
          isPrimary: count === 1,
        });
      }
      searchIndex = rangeEnd;
    }

    if (count > 0) {
      annotations.push({
        id: annotationId,
        anchorId,
        order: index + 1,
        ruleId: hit.ruleId,
        ruleKind: hit.ruleKind,
        severity: hit.severity,
        scope: hit.scope,
        matchedText: hit.matched,
        patternText: hit.patternText,
        rewriteHint: hit.rewriteHint,
        count,
        sampleContext,
      });
    }
  });

  if (ranges.length === 0) {
    return {
      html: escapeHtml(text),
      annotations,
    };
  }

  const orderedRanges = ranges.sort((left, right) => left.start - right.start);
  let html = "";
  let cursor = 0;
  for (const range of orderedRanges) {
    html += escapeHtml(text.slice(cursor, range.start));
    const matchedText = escapeHtml(text.slice(range.start, range.end));
    const tone =
      range.severity === "high"
        ? "color:rgb(127,29,29);background:rgba(167,48,50,0.10);text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:rgb(167,48,50);text-decoration-thickness:1.5px;box-shadow:inset 0 -1px 0 rgba(167,48,50,0.18);"
        : "color:rgb(125,100,48);background:rgba(196,138,58,0.14);text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:rgb(196,138,58);text-decoration-thickness:1.5px;";
    const primaryAttrs = range.isPrimary ? ` id="${range.anchorId}" tabindex="-1"` : "";
    html += `<span data-annotation-id="${range.annotationId}"${primaryAttrs} style="${tone}">${matchedText}<sup style="margin-left:2px;color:${range.severity === "high" ? "rgb(167,48,50)" : "rgb(138,101,30)"};font-size:10px;font-weight:700;">${range.order}</sup></span>`;
    cursor = range.end;
  }
  html += escapeHtml(text.slice(cursor));

  return {
    html,
    annotations,
  };
}

export function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export function getRecordNumber(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getRecordBoolean(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

export function getRecordString(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getRecordStringArray(source: Record<string, unknown> | null | undefined, key: string) {
  const value = source?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function getStrategyDraftValue(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPayloadStringArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function getPayloadRecordArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function getPayloadRecord(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getWeakestWritingQualityLayerSummary(panel: {
  weakestLayerCode: string | null;
  layers: Array<{
    code: string;
    title: string;
    status: "ready" | "needs_attention" | "blocked";
    suggestions: string[];
    summary: string;
  }>;
}) {
  const weakestLayer = panel.layers.find((item) => item.code === panel.weakestLayerCode) ?? null;
  if (!weakestLayer) {
    return null;
  }
  return {
    title: weakestLayer.title,
    status: weakestLayer.status,
    suggestion: weakestLayer.suggestions[0] || weakestLayer.summary,
  };
}

export function getDeepWritingHistorySignalSummary(
  signal: Record<string, unknown> | null | undefined,
  formatDeepWritingHistoryAdjustment: (value: number | null | undefined) => string,
) {
  const sampleCount = getRecordNumber(signal, "sampleCount") ?? 0;
  if (sampleCount <= 0) {
    return "";
  }
  const hitCount = getRecordNumber(signal, "hitCount") ?? 0;
  const nearMissCount = getRecordNumber(signal, "nearMissCount") ?? 0;
  const missCount = getRecordNumber(signal, "missCount") ?? 0;
  const adjustmentLabel = formatDeepWritingHistoryAdjustment(getRecordNumber(signal, "rankingAdjustment"));
  return [
    `历史样本 ${sampleCount} 篇`,
    hitCount > 0 ? `命中 ${hitCount}` : "",
    nearMissCount > 0 ? `接近命中 ${nearMissCount}` : "",
    missCount > 0 ? `未达目标 ${missCount}` : "",
    adjustmentLabel,
  ].filter(Boolean).join(" · ");
}

export function getTitleOptionElementsHit(option: Record<string, unknown>) {
  const elements = getPayloadRecord(option, "elementsHit");
  return {
    specific: Boolean(elements?.specific),
    curiosityGap: Boolean(elements?.curiosityGap),
    readerView: Boolean(elements?.readerView),
  };
}

export function getTitleOptionScore(option: Record<string, unknown>) {
  const value =
    typeof option.openRateScore === "number"
      ? option.openRateScore
      : typeof option.openRateScore === "string" && option.openRateScore.trim()
        ? Number(option.openRateScore)
        : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(50, Math.round(value)));
}
