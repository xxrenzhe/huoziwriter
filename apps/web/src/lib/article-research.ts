const RESEARCH_SOURCE_COVERAGE_KEYS = ["official", "industry", "comparison", "userVoice", "timeline"] as const;

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

export function getResearchBriefGenerationGate(payload: unknown) {
  const researchBrief = getRecord(payload);
  const sourceCoverage = getRecord(researchBrief?.sourceCoverage);
  const coveredCategoryCount = RESEARCH_SOURCE_COVERAGE_KEYS.filter((key) => getStringArray(sourceCoverage?.[key], 4).length > 0).length;
  const sufficiency = getString(sourceCoverage?.sufficiency);
  const missingCategories = getStringArray(sourceCoverage?.missingCategories, 5);
  const timelineCount = getRecordArray(researchBrief?.timelineCards).length;
  const comparisonCount = getRecordArray(researchBrief?.comparisonCards).length;
  const insightCount = getRecordArray(researchBrief?.intersectionInsights).length;
  const generationBlocked = Boolean(researchBrief && sourceCoverage) && (sufficiency === "blocked" || coveredCategoryCount <= 1);
  const generationBlockReason = generationBlocked
    ? `研究简报的信源覆盖仍不足，当前更像观点草稿，不适合直接生成判断型正文${missingCategories.length ? `。建议先补：${missingCategories.join("、")}` : "。"}`
    : "";

  return {
    hasResearchBrief: Boolean(researchBrief),
    coveredCategoryCount,
    sufficiency,
    missingCategories,
    timelineCount,
    comparisonCount,
    insightCount,
    generationBlocked,
    generationBlockReason,
  };
}
