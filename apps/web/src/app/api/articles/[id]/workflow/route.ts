import { ensureUserSession } from "@/lib/auth";
import {
  ArticleWorkflowMainStepCode,
  buildArticlePublicWorkflow,
  getArticleWorkflow,
  mapArticleMainStepToStageCode,
  setArticleWorkflowCurrentStage,
} from "@/lib/article-workflows";
import { fail, ok } from "@/lib/http";
import { isArticleMainStepCode } from "@/lib/article-workflow-registry";
import { getArticleById } from "@/lib/repositories";

function parseStepCode(value: unknown) {
  const stepCode = String(value || "").trim();
  if (!isArticleMainStepCode(stepCode)) {
    throw new Error("无效的稿件步骤");
  }
  return stepCode;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const [article, workflow] = await Promise.all([
      getArticleById(Number(params.id), session.userId),
      getArticleWorkflow(Number(params.id), session.userId),
    ]);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    return ok(buildArticlePublicWorkflow(workflow, { articleStatus: article.status }));
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
    const stepCode = parseStepCode(body.stepCode);
    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    const workflow = await setArticleWorkflowCurrentStage({
      articleId: Number(params.id),
      userId: session.userId,
      stageCode: mapArticleMainStepToStageCode(stepCode),
    });
    return ok(buildArticlePublicWorkflow(workflow, { articleStatus: article.status }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新稿件步骤失败", 400);
  }
}
