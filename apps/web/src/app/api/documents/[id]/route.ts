import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getSnapshotRetentionDays } from "@/lib/plan-access";
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
  const snapshots = await getDocumentSnapshots(Number(params.id), { retentionDays });
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
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const body = await request.json();
  const document = await saveDocument({
    documentId: Number(params.id),
    userId: session.userId,
    title: body.title,
    markdownContent: body.markdownContent,
    status: body.status,
    styleGenomeId: body.styleGenomeId === undefined ? undefined : body.styleGenomeId === null ? null : Number(body.styleGenomeId),
    wechatTemplateId: body.wechatTemplateId === undefined ? undefined : body.wechatTemplateId === null ? null : String(body.wechatTemplateId),
  });
  return ok({
    id: document?.id,
    title: document?.title,
    htmlContent: document?.html_content,
    status: document?.status,
    styleGenomeId: document?.style_genome_id,
    wechatTemplateId: document?.wechat_template_id,
    updatedAt: document?.updated_at,
  });
}
