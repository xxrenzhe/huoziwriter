import { ensureUserSession } from "@/lib/auth";
import {
  completeArticleWorkflowStage,
  buildArticlePublicWorkflow,
  failArticleWorkflowStage,
  getArticleWorkflow,
  mapArticleMainStepToStageCode,
  setArticleWorkflowCurrentStage,
} from "@/lib/article-workflows";
import { fail, ok } from "@/lib/http";
import { isArticleMainStepCode, isArticleWorkflowStageCode } from "@/lib/article-workflow-registry";
import { getArticleById } from "@/lib/repositories";

function parseStepCode(value: unknown) {
  const stepCode = String(value || "").trim();
  if (!isArticleMainStepCode(stepCode)) {
    throw new Error("无效的稿件步骤");
  }
  return stepCode;
}

function parseStageCode(value: unknown) {
  const stageCode = String(value || "").trim();
  if (!isArticleWorkflowStageCode(stageCode)) {
    throw new Error("无效的稿件阶段");
  }
  return stageCode;
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
    const publicWorkflow = buildArticlePublicWorkflow(workflow, { articleStatus: article.status });
    return ok({
      ...workflow,
      currentStepCode: publicWorkflow.currentStepCode,
      steps: publicWorkflow.steps,
    });
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
    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    const action = String(body.action || "set").trim();
    const stageCode = body.stageCode
      ? parseStageCode(body.stageCode)
      : mapArticleMainStepToStageCode(parseStepCode(body.stepCode));
    const workflow =
      action === "complete"
        ? await completeArticleWorkflowStage({
            articleId: Number(params.id),
            userId: session.userId,
            stageCode,
          })
        : action === "fail"
          ? await failArticleWorkflowStage({
              articleId: Number(params.id),
              userId: session.userId,
              stageCode,
            })
        : await setArticleWorkflowCurrentStage({
            articleId: Number(params.id),
            userId: session.userId,
            stageCode,
          });
    const publicWorkflow = buildArticlePublicWorkflow(workflow, { articleStatus: article.status });
    return ok({
      ...workflow,
      currentStepCode: publicWorkflow.currentStepCode,
      steps: publicWorkflow.steps,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新稿件步骤失败", 400);
  }
}
