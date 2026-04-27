export type Plan22StagePromptDefinition = {
  stageCode: string;
  promptId: string;
  sceneCode: string;
  category: "analysis" | "writing" | "review" | "publish";
  requiredOutputFields: string[];
};

export const PLAN22_STAGE_PROMPT_DEFINITIONS: readonly Plan22StagePromptDefinition[] = [
  {
    stageCode: "topicAnalysis",
    promptId: "topic_analysis",
    sceneCode: "topicAnalysis",
    category: "analysis",
    requiredOutputFields: ["theme", "coreAssertion", "whyNow", "readerBenefit", "risk"],
  },
  {
    stageCode: "researchBrief",
    promptId: "research_brief",
    sceneCode: "researchBrief",
    category: "analysis",
    requiredOutputFields: ["queries", "sources", "timeline", "contradictions", "evidenceGaps"],
  },
  {
    stageCode: "audienceAnalysis",
    promptId: "audience_analysis",
    sceneCode: "audienceProfile",
    category: "analysis",
    requiredOutputFields: ["targetReader", "painPoints", "knowledgeLevel", "toneAdvice"],
  },
  {
    stageCode: "outlinePlanning",
    promptId: "outline_planning",
    sceneCode: "outlinePlan",
    category: "writing",
    requiredOutputFields: ["sections", "claimMap", "evidenceMap", "endingAction"],
  },
  {
    stageCode: "titleOptimization",
    promptId: "title_optimizer",
    sceneCode: "titleOptimizer",
    category: "writing",
    requiredOutputFields: ["titleOptions", "recommendedTitle", "forbiddenHits"],
  },
  {
    stageCode: "openingOptimization",
    promptId: "opening_optimizer",
    sceneCode: "openingOptimizer",
    category: "writing",
    requiredOutputFields: ["openingOptions", "recommendedOpening", "diagnose"],
  },
  {
    stageCode: "deepWrite",
    promptId: "deep_write",
    sceneCode: "deepWrite",
    category: "writing",
    requiredOutputFields: ["writingPlan", "sectionTasks", "factAnchors"],
  },
  {
    stageCode: "articleWrite",
    promptId: "article_write",
    sceneCode: "articleWrite",
    category: "writing",
    requiredOutputFields: ["markdown", "usedEvidenceIds", "uncertainClaims"],
  },
  {
    stageCode: "factCheck",
    promptId: "fact_check",
    sceneCode: "factCheck",
    category: "review",
    requiredOutputFields: ["verifiedClaims", "needsEvidence", "highRiskClaims"],
  },
  {
    stageCode: "prosePolish",
    promptId: "prose_polish",
    sceneCode: "prosePolish",
    category: "review",
    requiredOutputFields: ["polishedMarkdown", "changes", "noNewFactsCheck"],
  },
  {
    stageCode: "languageGuardAudit",
    promptId: "language_guard_audit",
    sceneCode: "languageGuardAudit",
    category: "review",
    requiredOutputFields: ["violations", "fixedMarkdown"],
  },
  {
    stageCode: "coverImageBrief",
    promptId: "cover_image_brief",
    sceneCode: "coverImageBrief",
    category: "publish",
    requiredOutputFields: ["prompt", "negativePrompt", "altText", "style"],
  },
  {
    stageCode: "inlineImagePlan",
    promptId: "inline_image_plan",
    sceneCode: "inlineImagePlan",
    category: "publish",
    requiredOutputFields: ["briefs", "promptHashes", "imageCount"],
  },
  {
    stageCode: "inlineImageGenerate",
    promptId: "inline_image_generate",
    sceneCode: "inlineImageGenerate",
    category: "publish",
    requiredOutputFields: ["generated", "inserted", "warnings"],
  },
  {
    stageCode: "layoutApply",
    promptId: "layout_apply",
    sceneCode: "layoutExtract",
    category: "publish",
    requiredOutputFields: ["templateId", "html", "previewWarnings"],
  },
  {
    stageCode: "publishGuard",
    promptId: "publish_guard",
    sceneCode: "publishGuard",
    category: "publish",
    requiredOutputFields: ["canPublish", "blockers", "warnings", "repairActions"],
  },
] as const;

export function getPlan22PromptDefinitionByPromptId(promptId: string) {
  return PLAN22_STAGE_PROMPT_DEFINITIONS.find((definition) => definition.promptId === promptId) ?? null;
}

export function getPlan22PromptDefinitionBySceneCode(sceneCode: string) {
  return PLAN22_STAGE_PROMPT_DEFINITIONS.find((definition) => definition.sceneCode === sceneCode) ?? null;
}
