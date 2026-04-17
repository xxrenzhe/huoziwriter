import { ensureUserSession } from "@/lib/auth";
import {
  completeArticleWorkflowStage,
  ArticleWorkflowStageCode,
  failArticleWorkflowStage,
  getArticleWorkflow,
  setArticleWorkflowCurrentStage,
} from "@/lib/article-workflows";
import { fail, ok } from "@/lib/http";

function parseStageCode(value: unknown) {
  const stageCode = String(value || "") as ArticleWorkflowStageCode;
  if (![
    "topicRadar",
    "researchBrief",
    "audienceAnalysis",
    "outlinePlanning",
    "deepWriting",
    "factCheck",
    "prosePolish",
    "coverImage",
    "layout",
    "publish",
  ].includes(stageCode)) {
    throw new Error("无效的稿件步骤");
  }
  return stageCode;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    return ok(await getArticleWorkflow(Number(params.id), session.userId));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取稿件步骤失败", 400);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const stageCode = parseStageCode(body.stageCode);
    const action = String(body.action || "set");
    const workflow =
      action === "complete"
        ? await completeArticleWorkflowStage({ articleId: Number(params.id), userId: session.userId, stageCode })
        : action === "fail"
          ? await failArticleWorkflowStage({ articleId: Number(params.id), userId: session.userId, stageCode })
          : await setArticleWorkflowCurrentStage({ articleId: Number(params.id), userId: session.userId, stageCode });
    return ok(workflow);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新稿件步骤失败", 400);
  }
}
