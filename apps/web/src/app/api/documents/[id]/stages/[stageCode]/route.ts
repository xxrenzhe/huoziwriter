import { ensureUserSession } from "@/lib/auth";
import {
  generateDocumentStageArtifact,
  getDocumentStageArtifact,
  isSupportedDocumentArtifactStage,
  updateDocumentStageArtifactPayload,
} from "@/lib/document-stage-artifacts";
import { fail, ok } from "@/lib/http";

export async function GET(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    if (!isSupportedDocumentArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持结构化产物", 400);
    }
    const artifact = await getDocumentStageArtifact(Number(params.id), session.userId, params.stageCode);
    return ok(artifact);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取阶段产物失败", 400);
  }
}

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    if (!isSupportedDocumentArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持结构化产物生成", 400);
    }
    const artifact = await generateDocumentStageArtifact({
      documentId: Number(params.id),
      userId: session.userId,
      stageCode: params.stageCode,
    });
    return ok(artifact);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "生成阶段产物失败", 400);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    if (!isSupportedDocumentArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持结构化产物更新", 400);
    }
    const body = await request.json();
    const payloadPatch =
      body && typeof body.payloadPatch === "object" && !Array.isArray(body.payloadPatch)
        ? body.payloadPatch as Record<string, unknown>
        : null;
    if (!payloadPatch) {
      return fail("payloadPatch 不能为空", 400);
    }
    const artifact = await updateDocumentStageArtifactPayload({
      documentId: Number(params.id),
      userId: session.userId,
      stageCode: params.stageCode,
      payloadPatch,
    });
    return ok(artifact);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新阶段产物失败", 400);
  }
}
