import { ensureUserSession } from "@/lib/auth";
import { applyArticleStageArtifact } from "@/lib/article-stage-apply";
import { isSupportedArticleArtifactStage } from "@/lib/article-stage-artifacts";
import { fail, ok } from "@/lib/http";

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    if (!isSupportedArticleArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持应用到正文", 400);
    }
    const result = await applyArticleStageArtifact({
      articleId: Number(params.id),
      userId: session.userId,
      role: session.role,
      stageCode: params.stageCode,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "应用阶段产物失败", 400);
  }
}
