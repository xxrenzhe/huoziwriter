import { ensureUserSession } from "@/lib/auth";
import { getDocumentStageArtifact, buildStageArtifactApplyCommand, isSupportedDocumentArtifactStage } from "@/lib/document-stage-artifacts";
import { getDocumentAuthoringStyleContext } from "@/lib/document-authoring-style-context";
import { getDocumentWritingContext } from "@/lib/document-writing-context";
import { buildCommandRewrite, buildFactCheckTargetedRewrite, buildProsePolishTargetedRewrite } from "@/lib/generation";
import { fail, ok } from "@/lib/http";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { getOwnedStyleGenomeById } from "@/lib/marketplace";
import { assertStyleGenomeApplyAllowed, consumeDailyGenerationQuota } from "@/lib/plan-access";
import { createDocumentSnapshot, getDocumentById, saveDocument } from "@/lib/repositories";

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    if (!isSupportedDocumentArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持应用到正文", 400);
    }

    await consumeDailyGenerationQuota(session.userId);

    const document = await getDocumentById(Number(params.id), session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }
    if (document.style_genome_id) {
      await assertStyleGenomeApplyAllowed(session.userId);
    }

    const artifact = await getDocumentStageArtifact(document.id, session.userId, params.stageCode);
    if (!artifact?.payload) {
      return fail("当前阶段还没有可应用的结构化产物", 400);
    }

    const selectedTitle =
      artifact.payload.selection &&
      typeof artifact.payload.selection === "object" &&
      !Array.isArray(artifact.payload.selection)
        ? String((artifact.payload.selection as Record<string, unknown>).selectedTitle || "").trim()
        : "";
    const effectiveTitle = selectedTitle || document.title;

    const [writingContext, languageGuardRules, styleGenome, authoringStyleContext] = await Promise.all([
      getDocumentWritingContext({
        userId: session.userId,
        documentId: document.id,
        title: effectiveTitle,
        markdownContent: document.markdown_content,
      }),
      getLanguageGuardRules(session.userId),
      document.style_genome_id ? getOwnedStyleGenomeById(document.style_genome_id, session.userId) : Promise.resolve(null),
      getDocumentAuthoringStyleContext(session.userId),
    ]);
    const bannedWords = getLanguageGuardTokenBlacklist(languageGuardRules);

    const styleGenomeConfig = styleGenome
      ? {
          name: styleGenome.name,
          ...(JSON.parse(styleGenome.config_json) as Record<string, unknown>),
        }
      : null;
    const command = buildStageArtifactApplyCommand(artifact);
    const rewritten =
      artifact.stageCode === "factCheck"
        ? await buildFactCheckTargetedRewrite({
            title: effectiveTitle,
            markdownContent: document.markdown_content,
            fragments: writingContext.fragments,
            bannedWords,
            authorPersona: authoringStyleContext.authorPersona,
            writingStyleProfile: authoringStyleContext.writingStyleProfile,
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
                    evidenceItems: Array.isArray(item?.evidenceItems)
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
                  }))
              : [],
            outlineNodes: writingContext.outlineNodes,
            knowledgeCards: writingContext.knowledgeCards,
            styleGenome: styleGenomeConfig,
          })
        : artifact.stageCode === "prosePolish"
          ? await buildProsePolishTargetedRewrite({
              title: effectiveTitle,
              markdownContent: document.markdown_content,
              fragments: writingContext.fragments,
              bannedWords,
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
              authorPersona: authoringStyleContext.authorPersona,
              writingStyleProfile: authoringStyleContext.writingStyleProfile,
              outlineNodes: writingContext.outlineNodes,
              knowledgeCards: writingContext.knowledgeCards,
              styleGenome: styleGenomeConfig,
          })
        : await buildCommandRewrite({
            title: effectiveTitle,
            markdownContent: document.markdown_content,
            fragments: writingContext.fragments,
            bannedWords,
            command,
            authorPersona: authoringStyleContext.authorPersona,
            writingStyleProfile: authoringStyleContext.writingStyleProfile,
            outlineNodes: writingContext.outlineNodes,
            knowledgeCards: writingContext.knowledgeCards,
            styleGenome: styleGenomeConfig,
          });

    await createDocumentSnapshot(document.id, `阶段产物应用前快照：${artifact.title}`);
    const saved = await saveDocument({
      documentId: document.id,
      userId: session.userId,
      title: effectiveTitle,
      markdownContent: rewritten,
      status: "reviewed",
    });

    return ok({
      id: saved?.id,
      markdownContent: saved?.markdown_content,
      htmlContent: saved?.html_content,
      status: saved?.status,
      title: saved?.title,
      command,
      stageCode: artifact.stageCode,
      stageTitle: artifact.title,
      applyMode: ["factCheck", "prosePolish"].includes(artifact.stageCode) ? "targeted" : "rewrite",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "应用阶段产物失败", 400);
  }
}
