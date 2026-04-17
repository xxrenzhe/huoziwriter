import { handleArticlePublishRetry } from "@/lib/article-publish";
import { ensureUserSession } from "@/lib/auth";
import { fail } from "@/lib/http";
import { assertWechatPublishAllowed } from "@/lib/plan-access";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await assertWechatPublishAllowed(session.userId);

  const body = await request.json().catch(() => ({}));
  return handleArticlePublishRetry({
    userId: session.userId,
    articleId: Number(params.id),
    wechatConnectionId: Number.isFinite(Number(body.wechatConnectionId)) ? Number(body.wechatConnectionId) : null,
    templateId: body.templateId ? String(body.templateId) : null,
  });
}
