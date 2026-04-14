import { ensureUserSession } from "@/lib/auth";
import { getDocumentStageArtifacts } from "@/lib/document-stage-artifacts";
import { getDocumentWorkflow } from "@/lib/document-workflows";
import { fail, ok } from "@/lib/http";
import { getOwnedStyleGenomeById } from "@/lib/marketplace";
import { assertStyleGenomeApplyAllowed, assertWechatTemplateAllowed, getSnapshotRetentionDays } from "@/lib/plan-access";
import { getDocumentById, getDocumentSnapshots, saveDocument } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const retentionDays = await getSnapshotRetentionDays(session.userId);
  const [snapshots, workflow, stageArtifacts] = await Promise.all([
    getDocumentSnapshots(Number(params.id), { retentionDays }),
    getDocumentWorkflow(Number(params.id), session.userId),
    getDocumentStageArtifacts(Number(params.id), session.userId),
  ]);
  return ok({
    id: document.id,
    title: document.title,
    markdownContent: document.markdown_content,
    htmlContent: document.html_content,
    status: document.status,
    styleGenomeId: document.style_genome_id,
    wechatTemplateId: document.wechat_template_id,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      snapshotNote: snapshot.snapshot_note,
      createdAt: snapshot.created_at,
    })),
    snapshotRetentionDays: retentionDays,
    workflow,
    stageArtifacts,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const currentDocument = await getDocumentById(Number(params.id), session.userId);
    if (!currentDocument) {
      return fail("文稿不存在", 404);
    }
    const styleGenomeId = body.styleGenomeId === undefined ? undefined : body.styleGenomeId === null ? null : Number(body.styleGenomeId);
    if (styleGenomeId !== undefined && styleGenomeId !== null) {
      await assertStyleGenomeApplyAllowed(session.userId);
      const ownedGenome = await getOwnedStyleGenomeById(styleGenomeId, session.userId);
      if (!ownedGenome) {
        return fail("文稿只能使用你自己的排版基因。若要使用公开基因，请先 Fork 到私有区。", 400);
      }
    }
    const wechatTemplateId =
      body.wechatTemplateId === undefined
        ? currentDocument.wechat_template_id
        : body.wechatTemplateId === null
          ? null
          : String(body.wechatTemplateId);
    await assertWechatTemplateAllowed(session.userId, wechatTemplateId);
    const savedDocument = await saveDocument({
      documentId: Number(params.id),
      userId: session.userId,
      title: body.title,
      markdownContent: body.markdownContent,
      status: body.status,
      styleGenomeId,
      wechatTemplateId,
    });
    return ok({
      id: savedDocument?.id,
      title: savedDocument?.title,
      htmlContent: savedDocument?.html_content,
      status: savedDocument?.status,
      styleGenomeId: savedDocument?.style_genome_id,
      wechatTemplateId: savedDocument?.wechat_template_id,
      updatedAt: savedDocument?.updated_at,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "文稿保存失败", 400);
  }
}
