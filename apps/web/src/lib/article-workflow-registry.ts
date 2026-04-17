export const ARTICLE_WORKFLOW_STAGE_DEFINITIONS = [
  { code: "opportunity", title: "机会", mainStepCode: "opportunity", supportsArtifact: false },
  { code: "researchBrief", title: "研究简报", mainStepCode: "strategy", supportsArtifact: true },
  { code: "audienceAnalysis", title: "受众分析", mainStepCode: "strategy", supportsArtifact: true },
  { code: "outlinePlanning", title: "大纲规划", mainStepCode: "evidence", supportsArtifact: true },
  { code: "deepWriting", title: "深度写作", mainStepCode: "draft", supportsArtifact: true },
  { code: "factCheck", title: "事实核查", mainStepCode: "evidence", supportsArtifact: true },
  { code: "prosePolish", title: "文笔润色", mainStepCode: "draft", supportsArtifact: true },
  { code: "coverImage", title: "配图生成", mainStepCode: "publish", supportsArtifact: false },
  { code: "layout", title: "一键排版", mainStepCode: "publish", supportsArtifact: false },
  { code: "publish", title: "一键发布", mainStepCode: "publish", supportsArtifact: false },
] as const;

export type ArticleWorkflowStageCode = (typeof ARTICLE_WORKFLOW_STAGE_DEFINITIONS)[number]["code"];
export type ArticleWorkflowStageDefinition = (typeof ARTICLE_WORKFLOW_STAGE_DEFINITIONS)[number];
export type ArticleMainStepCode = "opportunity" | "strategy" | "evidence" | "draft" | "publish" | "result";
export type ArticleArtifactStageCode = Extract<
  ArticleWorkflowStageCode,
  "researchBrief" | "audienceAnalysis" | "outlinePlanning" | "deepWriting" | "factCheck" | "prosePolish"
>;

type ArticleMainStepBaseDefinition = {
  code: ArticleMainStepCode;
  title: string;
  primaryStageCode: ArticleWorkflowStageCode;
  supportLabel: string;
};

const ARTICLE_WORKFLOW_STAGE_CODE_SET = new Set<string>(
  ARTICLE_WORKFLOW_STAGE_DEFINITIONS.map((stage) => stage.code),
);

export const ARTICLE_WORKFLOW_STAGE_CODES = ARTICLE_WORKFLOW_STAGE_DEFINITIONS.map((stage) => stage.code) as ArticleWorkflowStageCode[];
export const ARTICLE_WORKFLOW_STAGE_TITLES = Object.fromEntries(
  ARTICLE_WORKFLOW_STAGE_DEFINITIONS.map((stage) => [stage.code, stage.title]),
) as Record<ArticleWorkflowStageCode, string>;

function isArtifactStageDefinition(
  stage: ArticleWorkflowStageDefinition,
): stage is ArticleWorkflowStageDefinition & { supportsArtifact: true } {
  return stage.supportsArtifact;
}

export const ARTICLE_ARTIFACT_STAGE_DEFINITIONS = ARTICLE_WORKFLOW_STAGE_DEFINITIONS.filter(isArtifactStageDefinition);
export const ARTICLE_ARTIFACT_STAGE_CODES = ARTICLE_ARTIFACT_STAGE_DEFINITIONS.map((stage) => stage.code) as ArticleArtifactStageCode[];
export const ARTICLE_ARTIFACT_STAGE_TITLES = Object.fromEntries(
  ARTICLE_ARTIFACT_STAGE_DEFINITIONS.map((stage) => [stage.code, stage.title]),
) as Record<ArticleArtifactStageCode, string>;
const ARTICLE_ARTIFACT_STAGE_CODE_SET = new Set<string>(ARTICLE_ARTIFACT_STAGE_CODES);

const ARTICLE_MAIN_STEP_BASE_DEFINITIONS = [
  { code: "opportunity", title: "机会", primaryStageCode: "opportunity", supportLabel: "选题切口" },
  { code: "strategy", title: "策略", primaryStageCode: "researchBrief", supportLabel: "研究与读者" },
  { code: "evidence", title: "证据", primaryStageCode: "outlinePlanning", supportLabel: "素材与核查" },
  { code: "draft", title: "成稿", primaryStageCode: "deepWriting", supportLabel: "正文与润色" },
  { code: "publish", title: "发布", primaryStageCode: "publish", supportLabel: "封面与推送" },
  { code: "result", title: "结果", primaryStageCode: "publish", supportLabel: "回流与复盘" },
] as const satisfies ReadonlyArray<ArticleMainStepBaseDefinition>;

export const ARTICLE_MAIN_STEP_DEFINITIONS = ARTICLE_MAIN_STEP_BASE_DEFINITIONS.map((step) => ({
  ...step,
  stageCodes: ARTICLE_WORKFLOW_STAGE_DEFINITIONS
    .filter((stage) => stage.mainStepCode === step.code)
    .map((stage) => stage.code),
}));

export type ArticleMainStepDefinition = (typeof ARTICLE_MAIN_STEP_DEFINITIONS)[number];
const ARTICLE_MAIN_STEP_CODE_SET = new Set<string>(ARTICLE_MAIN_STEP_DEFINITIONS.map((step) => step.code));

export function isArticleWorkflowStageCode(value: unknown): value is ArticleWorkflowStageCode {
  return ARTICLE_WORKFLOW_STAGE_CODE_SET.has(String(value || "").trim());
}

export function normalizeArticleWorkflowStageCode(value: unknown): ArticleWorkflowStageCode {
  return isArticleWorkflowStageCode(value) ? String(value).trim() as ArticleWorkflowStageCode : "opportunity";
}

export function getArticleWorkflowStageDefinition(code: ArticleWorkflowStageCode) {
  return ARTICLE_WORKFLOW_STAGE_DEFINITIONS.find((stage) => stage.code === code) ?? ARTICLE_WORKFLOW_STAGE_DEFINITIONS[0];
}

export function isArticleArtifactStageCode(value: unknown): value is ArticleArtifactStageCode {
  return ARTICLE_ARTIFACT_STAGE_CODE_SET.has(String(value || "").trim());
}

export function mapArticleStageCodeToMainStep(stageCode: ArticleWorkflowStageCode): ArticleMainStepCode {
  return getArticleWorkflowStageDefinition(stageCode).mainStepCode;
}

export function isArticleMainStepCode(value: unknown): value is ArticleMainStepCode {
  return ARTICLE_MAIN_STEP_CODE_SET.has(String(value || "").trim());
}

export function mapArticleMainStepToStageCode(stepCode: ArticleMainStepCode): ArticleWorkflowStageCode {
  const stepDefinition = ARTICLE_MAIN_STEP_DEFINITIONS.find((step) => step.code === stepCode);
  return stepDefinition?.primaryStageCode ?? "opportunity";
}

export function getArticleMainStepDefinitionByCode(code: ArticleMainStepCode) {
  return ARTICLE_MAIN_STEP_DEFINITIONS.find((step) => step.code === code) ?? ARTICLE_MAIN_STEP_DEFINITIONS[0];
}

export function getArticleMainStepDefinitionByStageCode(stageCode: string) {
  const normalizedStageCode = normalizeArticleWorkflowStageCode(stageCode);
  return getArticleMainStepDefinitionByCode(mapArticleStageCodeToMainStep(normalizedStageCode));
}
