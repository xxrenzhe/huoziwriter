import { ensureUserSession } from "@/lib/auth";
import { getDocumentWritingContext } from "@/lib/document-writing-context";
import { buildGeneratedDocument, splitIntoChunks } from "@/lib/generation";
import { fail } from "@/lib/http";
import { getOwnedStyleGenomeById } from "@/lib/marketplace";
import { assertStyleGenomeApplyAllowed, consumeDailyGenerationQuota } from "@/lib/plan-access";
import { createDocumentSnapshot, getBannedWords, getDocumentById } from "@/lib/repositories";

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
    const [writingContext, bannedWords, styleGenome] = await Promise.all([
      getDocumentWritingContext({
        userId: session.userId,
        documentId: document.id,
        title: document.title,
        markdownContent: document.markdown_content,
      }),
      getBannedWords(session.userId),
      document.style_genome_id ? getOwnedStyleGenomeById(document.style_genome_id, session.userId) : Promise.resolve(null),
    ]);
    await createDocumentSnapshot(document.id, "流式生成前快照");
    const generated = await buildGeneratedDocument({
      title: document.title,
      fragments: writingContext.fragments,
      bannedWords: bannedWords.map((item) => item.word),
      outlineNodes: writingContext.outlineNodes,
      knowledgeCards: writingContext.knowledgeCards,
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
