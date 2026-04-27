import { saveArticleDraft } from "./article-draft";
import {
  buildArticleArtifactRuntimeMetaPatch,
  buildStageArtifactApplyCommand,
  getArticleStageArtifact,
  updateArticleStageArtifactPayload,
} from "./article-stage-artifacts";
import { getArticleAuthoringStyleContext } from "./article-authoring-style-context";
import { resolveArticleApplyCommandTemplate, resolveArticleLayoutStrategy } from "./article-rollout";
import { getArticleWritingContext } from "./article-writing-context";
import type { ArticleArtifactStageCode } from "./article-workflow-registry";
import { buildCommandRewrite, buildFactCheckTargetedRewrite, buildProsePolishTargetedRewrite } from "./generation";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "./language-guard";
import { consumeDailyGenerationQuota, getUserPlanContext } from "./plan-access";
import { createArticleSnapshot, getArticleById } from "./repositories";
import { getActiveWritingEvalScoringProfile } from "./writing-eval";
import { appendWritingStyleProfileUsageEvent } from "./writing-style-profiles";

export type ApplyArticleStageArtifactResult = {
  id: number;
  markdownContent: string;
  htmlContent: string;
  status: string;
  title: string;
  command: string;
  stageCode: ArticleArtifactStageCode;
  stageTitle: string;
  applyMode: "targeted" | "rewrite";
};

export async function applyArticleStageArtifact(input: {
  articleId: number;
  userId: number;
  role: string | null;
  stageCode: ArticleArtifactStageCode;
  localOnly?: boolean;
  skipLanguageGuardAudit?: boolean;
}): Promise<ApplyArticleStageArtifactResult> {
  await consumeDailyGenerationQuota(input.userId);

  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在");
  }
  const artifact = await getArticleStageArtifact(article.id, input.userId, input.stageCode);
  if (!artifact?.payload) {
    throw new Error("当前阶段还没有可应用的结构化产物");
  }

  const selectedTitle =
    artifact.payload.selection &&
    typeof artifact.payload.selection === "object" &&
    !Array.isArray(artifact.payload.selection)
      ? String((artifact.payload.selection as Record<string, unknown>).selectedTitle || "").trim()
      : "";
  const effectiveTitle = selectedTitle || article.title;

  const [
    planContext,
    writingContext,
    languageGuardRules,
    authoringStyleContext,
    researchBriefArtifact,
    deepWritingArtifact,
    activeScoringProfile,
  ] = await Promise.all([
    getUserPlanContext(input.userId),
    getArticleWritingContext({
      userId: input.userId,
      articleId: article.id,
      title: effectiveTitle,
      markdownContent: article.markdown_content,
    }),
    getLanguageGuardRules(input.userId),
    getArticleAuthoringStyleContext(input.userId, article.id),
    getArticleStageArtifact(article.id, input.userId, "researchBrief"),
    getArticleStageArtifact(article.id, input.userId, "deepWriting"),
    getActiveWritingEvalScoringProfile(),
  ]);
  const bannedWords = getLanguageGuardTokenBlacklist(languageGuardRules);

  const [layoutStrategy, applyCommandTemplate] = await Promise.all([
    resolveArticleLayoutStrategy({
      userId: input.userId,
      role: input.role,
      planCode: planContext.effectivePlanCode,
    }),
    artifact.stageCode === "deepWriting"
      ? resolveArticleApplyCommandTemplate({
          userId: input.userId,
          role: input.role,
          planCode: planContext.effectivePlanCode,
        })
      : Promise.resolve(null),
  ]);
  const layoutStrategyConfig = layoutStrategy
    ? {
        name: layoutStrategy.name,
        ...layoutStrategy.config,
      }
    : null;
  const command = buildStageArtifactApplyCommand(artifact, {
    templateCode: applyCommandTemplate?.code ?? null,
    strategyCard: writingContext.strategyCard ?? null,
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: artifact.stageCode,
    payloadPatch: buildArticleArtifactRuntimeMetaPatch({
      scoringProfile: activeScoringProfile
        ? {
            code: activeScoringProfile.code,
            name: activeScoringProfile.name,
          }
        : null,
      layoutStrategy: layoutStrategy
        ? {
            id: layoutStrategy.id,
            code: layoutStrategy.code,
            name: layoutStrategy.name,
            resolutionMode: layoutStrategy.resolutionMode,
            resolutionReason: layoutStrategy.resolutionReason,
          }
        : null,
      applyCommandTemplate: applyCommandTemplate
        ? {
            code: applyCommandTemplate.code,
            name: applyCommandTemplate.name,
            resolutionMode: applyCommandTemplate.resolutionMode,
            resolutionReason: applyCommandTemplate.resolutionReason,
          }
        : null,
    }),
  });
  const rewritten =
    input.localOnly
      ? {
          markdown:
            artifact.stageCode === "prosePolish"
              ? buildLocalProsePolishMarkdown({
                  markdownContent: article.markdown_content,
                  payload: artifact.payload,
                  bannedWords,
                })
              : sanitizeBannedWordsLocal(article.markdown_content, bannedWords),
          promptVersionRefs: [],
        }
      : artifact.stageCode === "factCheck"
      ? await buildFactCheckTargetedRewrite({
          title: effectiveTitle,
          markdownContent: article.markdown_content,
          fragments: writingContext.fragments,
          bannedWords,
          promptContext: {
            userId: input.userId,
            role: input.role,
            planCode: planContext.effectivePlanCode,
          },
          persona: authoringStyleContext.persona,
          writingStyleProfile: authoringStyleContext.writingStyleProfile,
          strategyCard: writingContext.strategyCard,
          seriesInsight: writingContext.seriesInsight,
          researchBrief: researchBriefArtifact?.payload || null,
          humanSignals: writingContext.humanSignals,
          checks: Array.isArray(artifact.payload.checks)
            ? artifact.payload.checks
                .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                .filter(Boolean)
                .map((item) => ({
                  claim: String(item?.claim || "").trim(),
                  status: String(item?.status || "").trim(),
                  suggestion: String(item?.suggestion || "").trim(),
                }))
            : [],
          claimDecisions:
            artifact.payload.selection &&
            typeof artifact.payload.selection === "object" &&
            !Array.isArray(artifact.payload.selection) &&
            Array.isArray((artifact.payload.selection as Record<string, unknown>).claimDecisions)
              ? ((artifact.payload.selection as Record<string, unknown>).claimDecisions as unknown[])
                  .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                  .filter(Boolean)
                  .map((item) => ({
                    claim: String(item?.claim || "").trim(),
                    action: String(item?.action || "").trim(),
                    note: String(item?.note || "").trim(),
                  }))
                  .filter((item) => item.claim && item.action)
              : [],
          evidenceCards: Array.isArray(artifact.payload.evidenceCards)
            ? artifact.payload.evidenceCards
                .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                .filter(Boolean)
                .map((item) => ({
                  claim: String(item?.claim || "").trim(),
                  supportLevel: String(item?.supportLevel || "").trim(),
                  supportingEvidence: Array.isArray(item?.supportingEvidence)
                    ? item.supportingEvidence
                        .map((evidence) => (evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null))
                        .filter(Boolean)
                        .map((evidence) => ({
                          title: String(evidence?.title || "").trim(),
                          excerpt: String(evidence?.excerpt || "").trim(),
                          sourceType: String(evidence?.sourceType || "").trim(),
                          sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                          rationale: String(evidence?.rationale || "").trim(),
                        }))
                    : Array.isArray(item?.evidenceItems)
                      ? item.evidenceItems
                          .map((evidence) => (evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null))
                          .filter(Boolean)
                          .map((evidence) => ({
                            title: String(evidence?.title || "").trim(),
                            excerpt: String(evidence?.excerpt || "").trim(),
                            sourceType: String(evidence?.sourceType || "").trim(),
                            sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                            rationale: String(evidence?.rationale || "").trim(),
                          }))
                      : [],
                  counterEvidence: Array.isArray(item?.counterEvidence)
                    ? item.counterEvidence
                        .map((evidence) => (evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null))
                        .filter(Boolean)
                        .map((evidence) => ({
                          title: String(evidence?.title || "").trim(),
                          excerpt: String(evidence?.excerpt || "").trim(),
                          sourceType: String(evidence?.sourceType || "").trim(),
                          sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                          rationale: String(evidence?.rationale || "").trim(),
                        }))
                    : [],
                }))
            : [],
          outlineNodes: writingContext.outlineNodes,
          knowledgeCards: writingContext.knowledgeCards,
          deepWritingPayload: deepWritingArtifact?.payload || null,
          layoutStrategy: layoutStrategyConfig,
        })
      : artifact.stageCode === "prosePolish"
        ? await buildProsePolishTargetedRewrite({
            title: effectiveTitle,
            markdownContent: article.markdown_content,
            fragments: writingContext.fragments,
            bannedWords,
            promptContext: {
              userId: input.userId,
              role: input.role,
              planCode: planContext.effectivePlanCode,
            },
            rewrittenLead: String(artifact.payload.rewrittenLead || "").trim() || null,
            issues: Array.isArray(artifact.payload.issues)
              ? artifact.payload.issues
                  .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                  .filter(Boolean)
                  .map((item) => ({
                    type: String(item?.type || "").trim(),
                    example: String(item?.example || "").trim(),
                    suggestion: String(item?.suggestion || "").trim(),
                  }))
              : [],
            punchlines: Array.isArray(artifact.payload.punchlines)
              ? artifact.payload.punchlines.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            rhythmAdvice: Array.isArray(artifact.payload.rhythmAdvice)
              ? artifact.payload.rhythmAdvice.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            persona: authoringStyleContext.persona,
            writingStyleProfile: authoringStyleContext.writingStyleProfile,
            strategyCard: writingContext.strategyCard,
            seriesInsight: writingContext.seriesInsight,
            researchBrief: researchBriefArtifact?.payload || null,
            humanSignals: writingContext.humanSignals,
            outlineNodes: writingContext.outlineNodes,
            knowledgeCards: writingContext.knowledgeCards,
            deepWritingPayload: deepWritingArtifact?.payload || null,
            layoutStrategy: layoutStrategyConfig,
          })
        : await buildCommandRewrite({
            title: effectiveTitle,
            markdownContent: article.markdown_content,
            fragments: writingContext.fragments,
            bannedWords,
            command,
            promptContext: {
              userId: input.userId,
              role: input.role,
              planCode: planContext.effectivePlanCode,
            },
            persona: authoringStyleContext.persona,
            writingStyleProfile: authoringStyleContext.writingStyleProfile,
            strategyCard: writingContext.strategyCard,
            seriesInsight: writingContext.seriesInsight,
            researchBrief: researchBriefArtifact?.payload || null,
            humanSignals: writingContext.humanSignals,
            outlineNodes: writingContext.outlineNodes,
            knowledgeCards: writingContext.knowledgeCards,
            deepWritingPayload: (artifact.stageCode === "deepWriting" ? artifact.payload : deepWritingArtifact?.payload) || null,
            layoutStrategy: layoutStrategyConfig,
            skipAudit: input.skipLanguageGuardAudit,
          });
  if (rewritten.promptVersionRefs.length > 0) {
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: input.userId,
      stageCode: artifact.stageCode,
      payloadPatch: buildArticleArtifactRuntimeMetaPatch({
        promptVersionRefs: rewritten.promptVersionRefs,
      }),
    });
  }

  await createArticleSnapshot(article.id, `阶段产物应用前快照：${artifact.title}`);
  const saved = await saveArticleDraft({
    articleId: article.id,
    userId: input.userId,
    body: {
      title: effectiveTitle,
      markdownContent: rewritten.markdown,
      status: "ready",
    },
  });
  if (!saved) {
    throw new Error("稿件不存在");
  }
  if (authoringStyleContext.writingStyleProfile?.id) {
    await appendWritingStyleProfileUsageEvent({
      userId: input.userId,
      profileId: authoringStyleContext.writingStyleProfile.id,
      articleId: article.id,
      usageSource: `article.stage.apply.${artifact.stageCode}`,
      profileName: authoringStyleContext.writingStyleProfile.name,
      sampleCount: authoringStyleContext.writingStyleProfile.sampleCount,
    });
  }

  return {
    id: saved.id,
    markdownContent: saved.markdown_content || "",
    htmlContent: saved.html_content || "",
    status: saved.status || "ready",
    title: saved.title || effectiveTitle,
    command,
    stageCode: artifact.stageCode,
    stageTitle: artifact.title,
    applyMode: ["factCheck", "prosePolish"].includes(artifact.stageCode) ? "targeted" : "rewrite",
  };
}

function sanitizeBannedWordsLocal(content: string, bannedWords: string[]) {
  let next = String(content || "");
  for (const word of bannedWords) {
    const token = String(word || "").trim();
    if (!token) continue;
    next = next.split(token).join("");
  }
  return next;
}

function splitLongChineseSentence(sentence: string) {
  const trimmed = sentence.trim();
  if (trimmed.length < 42) {
    return trimmed;
  }
  let parts = trimmed
    .split(/，(?=(?:但|而|因为|所以|同时|并且|如果|只有|任何|这|它|他们|我们|系统|流程|工具|文章|图片|素材))/g)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    parts = trimmed
      .split(/，/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (parts.length <= 1) {
    return trimmed;
  }
  const rebuilt: string[] = [];
  let buffer = "";
  for (const part of parts) {
    const nextBuffer = buffer ? `${buffer}，${part}` : part;
    if (nextBuffer.length <= 34) {
      buffer = nextBuffer;
      continue;
    }
    if (buffer) {
      rebuilt.push(buffer);
    }
    buffer = part;
  }
  if (buffer) {
    rebuilt.push(buffer);
  }
  const balanced = rebuilt.flatMap((part) => {
    if (part.length < 42 || !part.includes("、")) {
      return [part];
    }
    const chunks: string[] = [];
    let rest = part;
    while (rest.length >= 42 && rest.includes("、")) {
      const separatorIndexes = Array.from(rest.matchAll(/、/g)).map((match) => match.index ?? -1).filter((index) => index >= 14 && index <= 34);
      const splitAt = separatorIndexes.at(-1);
      if (splitAt == null) {
        break;
      }
      chunks.push(rest.slice(0, splitAt).trim());
      rest = rest.slice(splitAt + 1).trim();
    }
    if (rest) {
      chunks.push(rest);
    }
    return chunks.length > 1 ? chunks : [part];
  });
  return balanced
    .map((part) => part.replace(/[，,]\s*$/g, "").trim())
    .filter(Boolean)
    .join("。\n");
}

function reduceTemplateConnectors(line: string) {
  return line
    .replace(/(^|[。！？\n])通过([^，。！？\n]{2,18})，/g, "$1$2，")
    .replace(/(^|[。！？\n])我们需要/g, "$1需要")
    .replace(/在这个([^，。！？\n]{2,18})中，/g, "$1里，");
}

export function polishMarkdownLocallyForReadability(markdown: string) {
  return String(markdown || "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^#{1,6}\s/.test(trimmed) || /^[-*]\s+/.test(trimmed) || /^```/.test(trimmed) || /^!\[/.test(trimmed)) {
        return line;
      }
      const leadingWhitespace = line.match(/^\s*/)?.[0] ?? "";
      const reduced = reduceTemplateConnectors(trimmed);
      const polished = reduced.replace(/([^。！？!?；;\n]{42,})([。！？!?；;])/g, (_match, sentence: string, punctuation: string) => {
        const split = splitLongChineseSentence(sentence);
        return `${split}${punctuation}`;
      });
      return `${leadingWhitespace}${polished}`;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function buildLocalProsePolishMarkdown(input: {
  markdownContent: string;
  payload: Record<string, unknown>;
  bannedWords: string[];
}) {
  let next = String(input.markdownContent || "").trim();
  const rewrittenLead = String(input.payload.rewrittenLead || "").trim();
  if (rewrittenLead) {
    const firstLine = next.split("\n").find((line) => line.trim()) || "";
    next = firstLine ? next.replace(firstLine, rewrittenLead) : rewrittenLead;
  }
  return polishMarkdownLocallyForReadability(sanitizeBannedWordsLocal(next, input.bannedWords));
}
