import { ensureUserSession } from "@/lib/auth";
import { getDocumentWritingContext } from "@/lib/document-writing-context";
import { buildCommandRewrite } from "@/lib/generation";
import { fail, ok } from "@/lib/http";
import { getStyleGenomeById } from "@/lib/marketplace";
import { consumeDailyGenerationQuota } from "@/lib/plan-access";
import { createDocumentSnapshot, getBannedWords, getDocumentById, saveDocument } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await consumeDailyGenerationQuota(session.userId);
    const body = await request.json();
    const command = String(body.command || "").trim();
    if (!command) {
      return fail("命令不能为空", 400);
    }

    const document = await getDocumentById(Number(params.id), session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }

    const [writingContext, bannedWords, styleGenome] = await Promise.all([
      getDocumentWritingContext({
        userId: session.userId,
        documentId: document.id,
        title: document.title,
        markdownContent: document.markdown_content,
      }),
      getBannedWords(session.userId),
      document.style_genome_id ? getStyleGenomeById(document.style_genome_id, { userId: session.userId }) : Promise.resolve(null),
    ]);

    const rewritten = await buildCommandRewrite({
      title: document.title,
      markdownContent: document.markdown_content,
      fragments: writingContext.fragments,
      bannedWords: bannedWords.map((item) => item.word),
      command,
      outlineNodes: writingContext.outlineNodes,
      knowledgeCards: writingContext.knowledgeCards,
      styleGenome: styleGenome
        ? {
            name: styleGenome.name,
            ...(JSON.parse(styleGenome.config_json) as Record<string, unknown>),
          }
        : null,
    });

    await createDocumentSnapshot(document.id, `命令执行前快照：${command.slice(0, 24)}`);
    const saved = await saveDocument({
      documentId: document.id,
      userId: session.userId,
      markdownContent: rewritten,
      status: "reviewed",
    });

    return ok({
      id: saved?.id,
      markdownContent: saved?.markdown_content,
      htmlContent: saved?.html_content,
      status: saved?.status,
      command,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "命令执行失败", 400);
  }
}
