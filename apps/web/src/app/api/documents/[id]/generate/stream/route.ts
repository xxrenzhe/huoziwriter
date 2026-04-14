import { ensureUserSession } from "@/lib/auth";
import { buildStageArtifactApplyCommand, getDocumentStageArtifact } from "@/lib/document-stage-artifacts";
import { getDocumentAuthoringStyleContext } from "@/lib/document-authoring-style-context";
import { getSavedDocumentHistoryReferences } from "@/lib/document-history-references";
import { getDocumentWritingContext } from "@/lib/document-writing-context";
import { buildGeneratedDocument, splitIntoChunks } from "@/lib/generation";
import { fail } from "@/lib/http";
import { getOwnedStyleGenomeById } from "@/lib/marketplace";
import { assertStyleGenomeApplyAllowed, canUseHistoryReferences, consumeDailyGenerationQuota, getUserPlanContext } from "@/lib/plan-access";
import { createDocumentSnapshot, getDocumentById } from "@/lib/repositories";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await consumeDailyGenerationQuota(session.userId);
    const document = await getDocumentById(Number(params.id), session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }
    if (document.style_genome_id) {
      await assertStyleGenomeApplyAllowed(session.userId);
    }
    const outlineArtifactPromise = getDocumentStageArtifact(document.id, session.userId, "outlinePlanning");
    const deepWritingArtifactPromise = getDocumentStageArtifact(document.id, session.userId, "deepWriting");
    const [planContext, outlineArtifact, deepWritingArtifact, writingContext, languageGuardRules, styleGenome, authoringStyleContext, historyReferences] = await Promise.all([
      getUserPlanContext(session.userId),
      outlineArtifactPromise,
      deepWritingArtifactPromise,
      getDocumentWritingContext({
        userId: session.userId,
        documentId: document.id,
        title: document.title,
        markdownContent: document.markdown_content,
      }),
      getLanguageGuardRules(session.userId),
      document.style_genome_id ? getOwnedStyleGenomeById(document.style_genome_id, session.userId) : Promise.resolve(null),
      getDocumentAuthoringStyleContext(session.userId),
      getSavedDocumentHistoryReferences(document.id),
    ]);
    const usableHistoryReferences = canUseHistoryReferences(planContext.effectivePlanCode) ? historyReferences : [];
    const deepWritingGuide = deepWritingArtifact?.payload ? buildStageArtifactApplyCommand(deepWritingArtifact) : "";
    const preferredTitle = (() => {
      const selection = outlineArtifact?.payload?.selection;
      return selection && typeof selection === "object" && !Array.isArray(selection)
        ? String((selection as Record<string, unknown>).selectedTitle || "").trim() || document.title
        : document.title;
    })();
    await createDocumentSnapshot(document.id, "流式生成前快照");
    const generated = await buildGeneratedDocument({
      title: preferredTitle,
      fragments: writingContext.fragments,
      bannedWords: getLanguageGuardTokenBlacklist(languageGuardRules),
      authorPersona: authoringStyleContext.authorPersona,
      writingStyleProfile: authoringStyleContext.writingStyleProfile,
      outlineNodes: writingContext.outlineNodes,
      knowledgeCards: writingContext.knowledgeCards,
      imageFragments: writingContext.imageFragments
        .filter((item): item is typeof item & { screenshotPath: string } => Boolean(item.screenshotPath))
        .map((item) => ({
          id: item.id,
          title: item.title,
          screenshotPath: item.screenshotPath,
        })),
      historyReferences: usableHistoryReferences.map((item) => ({
        title: item.title,
        relationReason: item.relation_reason,
        bridgeSentence: item.bridge_sentence,
      })),
      deepWritingGuide,
      styleGenome: styleGenome
        ? {
            name: styleGenome.name,
            ...(JSON.parse(styleGenome.config_json) as Record<string, unknown>),
          }
        : null,
    });
    const chunks = splitIntoChunks(generated);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({ status: "start" })}\n\n`);
        for (const chunk of chunks) {
          controller.enqueue(`data: ${JSON.stringify({ status: "writing", delta: chunk })}\n\n`);
        }
        controller.enqueue(`data: ${JSON.stringify({ status: "done" })}\n\n`);
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "流式生成失败", 400);
  }
}
