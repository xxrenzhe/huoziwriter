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
  const businessQuestions = getStringArray(researchBrief?.businessQuestions, 7);
  const businessQuestionAnswers = getRecordArray(researchBrief?.businessQuestionAnswers);
  const answeredBusinessQuestionCount = businessQuestionAnswers.filter((item) =>
    getString(item.question) && getString(item.answer) && getString(item.status) !== "needs_source",
  ).length;
  const sparseTrackResearchPlan = getRecord(researchBrief?.sparseTrackResearchPlan);
  const sparseTrack = Boolean(sparseTrackResearchPlan?.sparseTrack);
  const sparseRequiredAngles = getStringArray(sparseTrackResearchPlan?.requiredAngles, 6);
  const sparseAnglesCovered = sparseRequiredAngles.filter((angle) =>
    businessQuestionAnswers.some((item) => `${getString(item.question)} ${getString(item.answer)} ${getString(item.evidenceNeed)}`.includes(angle)),
  ).length;
  const businessQuestionBlocked = businessQuestions.length >= 5 && answeredBusinessQuestionCount < Math.min(5, businessQuestions.length);
  const sparseTrackBlocked = sparseTrack && sparseAnglesCovered < Math.min(3, sparseRequiredAngles.length || 3);
  const generationBlocked = Boolean(researchBrief && sourceCoverage) && (
    sufficiency === "blocked"
    || coveredCategoryCount <= 1
    || businessQuestionBlocked
    || sparseTrackBlocked
  );
  const generationBlockReason = generationBlocked
    ? [
        sufficiency === "blocked" || coveredCategoryCount <= 1
          ? `研究简报的信源覆盖仍不足，当前更像观点草稿${missingCategories.length ? `。建议先补：${missingCategories.join("、")}` : "。"}`
          : null,
        businessQuestionBlocked
          ? `商业七问只回答 ${answeredBusinessQuestionCount}/${businessQuestions.length}，还不能进入泛教程式正文。`
          : null,
        sparseTrackBlocked
          ? "稀疏题材还没有补齐钱流、why now、不适合谁等专门证据。"
          : null,
      ].filter(Boolean).join(" ")
    : "";

  return {
    hasResearchBrief: Boolean(researchBrief),
    coveredCategoryCount,
    sufficiency,
    missingCategories,
    timelineCount,
    comparisonCount,
    insightCount,
    businessQuestionCount: businessQuestions.length,
    answeredBusinessQuestionCount,
    sparseTrack,
    sparseRequiredAngles,
    generationBlocked,
    generationBlockReason,
  };
}
