import {
  ARTICLE_MAIN_STEP_DEFINITIONS,
  getArticleMainStepDefinitionByCode,
  type ArticleMainStepCode,
} from "./article-workflow-registry";

export type ArticleMainStepNavigationAccess = {
  disabled: boolean;
  reason: string | null;
};

type ResolveArticleMainStepNavigationAccessInput = {
  targetStepCode: ArticleMainStepCode;
  currentStepCode: ArticleMainStepCode;
  canOpenResultStep: boolean;
  generateBlockedByResearch: boolean;
  generateBlockedMessage?: string | null;
};

function getMainStepIndex(stepCode: ArticleMainStepCode) {
  return ARTICLE_MAIN_STEP_DEFINITIONS.findIndex((step) => step.code === stepCode);
}

export function resolveArticleMainStepNavigationAccess({
  targetStepCode,
  currentStepCode,
  canOpenResultStep,
  generateBlockedByResearch,
  generateBlockedMessage,
}: ResolveArticleMainStepNavigationAccessInput): ArticleMainStepNavigationAccess {
  if (targetStepCode === currentStepCode) {
    return { disabled: false, reason: null };
  }

  if (targetStepCode === "result" && !canOpenResultStep) {
    return {
      disabled: true,
      reason: "稿件正式发布后，才能进入「结果」步骤查看回流与复盘。",
    };
  }

  const currentStepIndex = getMainStepIndex(currentStepCode);
  const targetStepIndex = getMainStepIndex(targetStepCode);
  const isForwardNavigation = targetStepIndex > currentStepIndex;

  if (generateBlockedByResearch && isForwardNavigation && targetStepCode !== "result") {
    const targetStep = getArticleMainStepDefinitionByCode(targetStepCode);
    return {
      disabled: true,
      reason:
        (generateBlockedMessage && generateBlockedMessage.trim())
        || `研究覆盖仍不足，暂时不能继续进入「${targetStep.title}」步骤，请先回研究层补齐信源。`,
    };
  }

  return { disabled: false, reason: null };
}
