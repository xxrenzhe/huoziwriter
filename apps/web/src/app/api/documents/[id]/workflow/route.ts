import { ensureUserSession } from "@/lib/auth";
import {
  completeDocumentWorkflowStage,
  DocumentWorkflowStageCode,
  failDocumentWorkflowStage,
  getDocumentWorkflow,
  setDocumentWorkflowCurrentStage,
} from "@/lib/document-workflows";
import { fail, ok } from "@/lib/http";

function parseStageCode(value: unknown) {
  const stageCode = String(value || "") as DocumentWorkflowStageCode;
  if (![
    "topicRadar",
    "audienceAnalysis",
    "outlinePlanning",
    "deepWriting",
    "factCheck",
    "prosePolish",
    "coverImage",
    "layout",
    "publish",
  ].includes(stageCode)) {
    throw new Error("无效的工作流阶段");
  }
  return stageCode;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    return ok(await getDocumentWorkflow(Number(params.id), session.userId));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取文稿工作流失败", 400);
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
        ? await completeDocumentWorkflowStage({ documentId: Number(params.id), userId: session.userId, stageCode })
        : action === "fail"
          ? await failDocumentWorkflowStage({ documentId: Number(params.id), userId: session.userId, stageCode })
          : await setDocumentWorkflowCurrentStage({ documentId: Number(params.id), userId: session.userId, stageCode });
    return ok(workflow);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新文稿工作流失败", 400);
  }
}
