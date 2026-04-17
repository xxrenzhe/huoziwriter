import { ensureUserSession } from "@/lib/auth";
import { buildStageArtifactApplyCommand, getArticleStageArtifact } from "@/lib/article-stage-artifacts";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { getSavedArticleHistoryReferences } from "@/lib/article-history-references";
import { getResearchBriefGenerationGate } from "@/lib/article-research";
import { resolveArticleApplyCommandTemplate, resolveArticleLayoutStrategy } from "@/lib/article-rollout";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { buildGeneratedOpeningPreview } from "@/lib/generation";
import { fail, ok } from "@/lib/http";
import { canUseHistoryReferences, getUserPlanContext } from "@/lib/plan-access";
import { getArticleById } from "@/lib/repositories";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { getActiveWritingEvalScoringProfile } from "@/lib/writing-eval";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPreviewDeepWritingPayload(input: {
  payload: Record<string, unknown>;
  articlePrototypeCode?: string | null;
  stateVariantCode?: string | null;
}) {
  const nextPayload = { ...input.payload } as Record<string, unknown>;
  const prototypeComparisons = getRecordArray(input.payload.prototypeComparisons);
  const stateComparisons = getRecordArray(input.payload.stateComparisons);

  if (input.articlePrototypeCode) {
    const prototype = prototypeComparisons.find((item) => getString(item.code) === input.articlePrototypeCode) ?? null;
    nextPayload.articlePrototype = input.articlePrototypeCode;
    nextPayload.articlePrototypeLabel = getString(prototype?.label) || getString(input.payload.articlePrototypeLabel) || input.articlePrototypeCode;
    nextPayload.articlePrototypeReason = getString(prototype?.reason) || getString(input.payload.articlePrototypeReason);
    if (prototype) {
      nextPayload.openingMove = getString(prototype.openingMove) || getString(nextPayload.openingMove);
      nextPayload.sectionRhythm = getString(prototype.sectionRhythm) || getString(nextPayload.sectionRhythm);
      nextPayload.evidenceMode = getString(prototype.evidenceMode) || getString(nextPayload.evidenceMode);
    }
  }

  if (input.stateVariantCode) {
    const state = stateComparisons.find((item) => getString(item.code) === input.stateVariantCode) ?? null;
    nextPayload.stateVariantCode = input.stateVariantCode;
    nextPayload.stateVariantLabel = getString(state?.label) || getString(input.payload.stateVariantLabel) || input.stateVariantCode;
    nextPayload.stateVariantReason = getString(state?.reason) || getString(input.payload.stateVariantReason);
    if (state) {
      nextPayload.openingMove = getString(state.openingMove) || getString(nextPayload.openingMove);
      nextPayload.progressiveRevealLabel = getString(state.progressiveRevealLabel) || getString(nextPayload.progressiveRevealLabel);
      nextPayload.progressiveRevealReason = getString(state.progressiveRevealReason) || getString(nextPayload.progressiveRevealReason);
    }
  }

  return nextPayload;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const articlePrototypeCode = typeof body.articlePrototypeCode === "string" ? body.articlePrototypeCode.trim() || null : null;
    const stateVariantCode = typeof body.stateVariantCode === "string" ? body.stateVariantCode.trim() || null : null;

    const researchArtifactPromise = getArticleStageArtifact(article.id, session.userId, "researchBrief");
    const outlineArtifactPromise = getArticleStageArtifact(article.id, session.userId, "outlinePlanning");
    const deepWritingArtifactPromise = getArticleStageArtifact(article.id, session.userId, "deepWriting");
    const [planContext, researchArtifact, outlineArtifact, deepWritingArtifact, writingContext, languageGuardRules, authoringStyleContext, historyReferences, activeScoringProfile] = await Promise.all([
      getUserPlanContext(session.userId),
      researchArtifactPromise,
      outlineArtifactPromise,
      deepWritingArtifactPromise,
      getArticleWritingContext({
        userId: session.userId,
        articleId: article.id,
        title: article.title,
        markdownContent: article.markdown_content,
      }),
      getLanguageGuardRules(session.userId),
      getArticleAuthoringStyleContext(session.userId, article.id),
      getSavedArticleHistoryReferences(article.id),
      getActiveWritingEvalScoringProfile(),
    ]);

    const researchGate = getResearchBriefGenerationGate(researchArtifact?.payload ?? null);
    if (researchGate.generationBlocked) {
      return fail(researchGate.generationBlockReason, 409);
    }
    if (!deepWritingArtifact?.payload) {
      return fail("请先生成写作执行卡", 409);
    }

    const usableHistoryReferences = canUseHistoryReferences(planContext.effectivePlanCode) ? historyReferences : [];
    const [layoutStrategy, applyCommandTemplate] = await Promise.all([
      resolveArticleLayoutStrategy({
        userId: session.userId,
        role: session.role,
        planCode: planContext.effectivePlanCode,
      }),
      resolveArticleApplyCommandTemplate({
        userId: session.userId,
        role: session.role,
        planCode: planContext.effectivePlanCode,
      }),
    ]);

    const deepWritingGuide = buildStageArtifactApplyCommand(deepWritingArtifact, {
      templateCode: applyCommandTemplate?.code ?? null,
    });
    const preferredTitle = (() => {
      const selection = outlineArtifact?.payload?.selection;
      return selection && typeof selection === "object" && !Array.isArray(selection)
        ? String((selection as Record<string, unknown>).selectedTitle || "").trim() || article.title
        : article.title;
    })();
    const previewPayload = buildPreviewDeepWritingPayload({
      payload: deepWritingArtifact.payload,
      articlePrototypeCode,
      stateVariantCode,
    });

    const generated = await buildGeneratedOpeningPreview({
      title: preferredTitle,
      fragments: writingContext.fragments,
      bannedWords: getLanguageGuardTokenBlacklist(languageGuardRules),
      promptContext: {
        userId: session.userId,
        role: session.role,
        planCode: planContext.effectivePlanCode,
      },
      persona: authoringStyleContext.persona,
      writingStyleProfile: authoringStyleContext.writingStyleProfile,
      strategyCard: writingContext.strategyCard,
      seriesInsight: writingContext.seriesInsight,
      researchBrief: researchArtifact?.payload ?? null,
      humanSignals: writingContext.humanSignals,
      layoutStrategy,
      outlineNodes: writingContext.outlineNodes,
      knowledgeCards: writingContext.knowledgeCards,
      imageFragments: writingContext.imageFragments
        .filter((item): item is typeof item & { screenshotPath: string } => Boolean(item.screenshotPath))
        .map((item) => ({
          title: item.title,
          screenshotPath: item.screenshotPath,
        })),
      historyReferences: usableHistoryReferences.map((item) => ({
        title: item.title,
        relationReason: item.relationReason,
        bridgeSentence: item.bridgeSentence,
      })),
      deepWritingPayload: previewPayload,
      deepWritingGuide,
    });

    return ok({
      previewMarkdown: generated.markdown,
      promptVersionRefs: generated.promptVersionRefs,
      scoringProfile: activeScoringProfile
        ? {
            code: activeScoringProfile.code,
            name: activeScoringProfile.name,
          }
        : null,
      articlePrototypeCode: getString(previewPayload.articlePrototype) || null,
      articlePrototypeLabel: getString(previewPayload.articlePrototypeLabel) || null,
      stateVariantCode: getString(previewPayload.stateVariantCode) || null,
      stateVariantLabel: getString(previewPayload.stateVariantLabel) || null,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "候选开头预览生成失败", 400);
  }
}
