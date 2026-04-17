import { ensureUserSession } from "@/lib/auth";
import {
  clearArticleWorkflowPendingPublishIntent,
  getArticleWorkflow,
  setArticleWorkflowPendingPublishIntent,
} from "@/lib/article-workflows";
import { fail, ok } from "@/lib/http";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const workflow = await getArticleWorkflow(Number(params.id), session.userId);
    return ok({ pendingPublishIntent: workflow.pendingPublishIntent });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取待恢复发布意图失败", 400);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const workflow = await setArticleWorkflowPendingPublishIntent({
      articleId: Number(params.id),
      userId: session.userId,
      intent: {
        createdAt: body.createdAt ? String(body.createdAt) : null,
        templateId: body.templateId ? String(body.templateId) : null,
        reason: body.reason ? String(body.reason) : null,
      },
    });
    return ok({ pendingPublishIntent: workflow.pendingPublishIntent });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "保存待恢复发布意图失败", 400);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const workflow = await clearArticleWorkflowPendingPublishIntent({
      articleId: Number(params.id),
      userId: session.userId,
    });
    return ok({ pendingPublishIntent: workflow.pendingPublishIntent, cleared: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "清除待恢复发布意图失败", 400);
  }
}
