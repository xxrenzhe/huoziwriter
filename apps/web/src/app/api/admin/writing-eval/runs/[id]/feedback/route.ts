import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createArticleWritingEvalRunFeedback, getArticleWritingEvalRunFeedback } from "@/lib/writing-eval";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAccess();
    const { id } = await context.params;
    return ok(await getArticleWritingEvalRunFeedback(Number(id)));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "加载实验回流结果失败", 400);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireAdminAccess();
    const { id } = await context.params;
    const body = await request.json();
    return ok(
      await createArticleWritingEvalRunFeedback({
        runId: Number(id),
        resultId: body.resultId == null || body.resultId === "" ? null : Number(body.resultId),
        caseId: body.caseId == null || body.caseId === "" ? null : Number(body.caseId),
        articleId: body.articleId == null || body.articleId === "" ? null : Number(body.articleId),
        wechatSyncLogId: body.wechatSyncLogId == null || body.wechatSyncLogId === "" ? null : Number(body.wechatSyncLogId),
        sourceType: body.sourceType,
        sourceLabel: body.sourceLabel,
        openRate: body.openRate == null || body.openRate === "" ? null : Number(body.openRate),
        readCompletionRate: body.readCompletionRate == null || body.readCompletionRate === "" ? null : Number(body.readCompletionRate),
        shareRate: body.shareRate == null || body.shareRate === "" ? null : Number(body.shareRate),
        favoriteRate: body.favoriteRate == null || body.favoriteRate === "" ? null : Number(body.favoriteRate),
        readCount: body.readCount == null || body.readCount === "" ? null : Number(body.readCount),
        likeCount: body.likeCount == null || body.likeCount === "" ? null : Number(body.likeCount),
        commentCount: body.commentCount == null || body.commentCount === "" ? null : Number(body.commentCount),
        notes: body.notes,
        payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {},
        capturedAt: body.capturedAt,
        createdBy: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写入实验回流结果失败", 400);
  }
}
