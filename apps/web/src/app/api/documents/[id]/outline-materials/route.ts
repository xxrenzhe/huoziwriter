import { ensureUserSession } from "@/lib/auth";
import { generateDocumentStageArtifact, getDocumentStageArtifact, updateDocumentStageArtifactPayload } from "@/lib/document-stage-artifacts";
import { attachFragmentToNode, getDocumentNodes } from "@/lib/document-outline";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { assertFragmentQuota } from "@/lib/plan-access";
import { getDocumentById, createFragment, queueJob } from "@/lib/repositories";
import { persistScreenshot } from "@/lib/screenshot-upload";

async function ensureOutlineArtifact(documentId: number, userId: number) {
  const existing = await getDocumentStageArtifact(documentId, userId, "outlinePlanning");
  if (existing) {
    return existing;
  }
  return generateDocumentStageArtifact({ documentId, userId, stageCode: "outlinePlanning" });
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const [artifact, nodes] = await Promise.all([
    getDocumentStageArtifact(document.id, session.userId, "outlinePlanning"),
    getDocumentNodes(document.id),
  ]);
  return ok({
    supplementalViewpoints: Array.isArray(artifact?.payload?.supplementalViewpoints)
      ? artifact?.payload?.supplementalViewpoints
      : [],
    nodes,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const body = await request.json();
  await ensureOutlineArtifact(document.id, session.userId);
  const viewpoints = Array.from(
    new Set(
      ((Array.isArray(body.supplementalViewpoints) ? body.supplementalViewpoints : []) as unknown[])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);
  const artifact = await updateDocumentStageArtifactPayload({
    documentId: document.id,
    userId: session.userId,
    stageCode: "outlinePlanning",
    payloadPatch: {
      supplementalViewpoints: viewpoints,
    },
  });
  return ok(artifact);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  try {
    const body = await request.json();
    const action = String(body.action || "attachExisting").trim();
    if (action === "attachExisting") {
      await attachFragmentToNode({
        documentId: document.id,
        nodeId: Number(body.nodeId),
        fragmentId: Number(body.fragmentId),
        usageMode: body.usageMode === "image" ? "image" : "rewrite",
      });
    } else if (action === "createManual" || action === "createUrl") {
      await assertFragmentQuota(session.userId);
      const distilled = await distillCaptureInput({
        sourceType: action === "createUrl" ? "url" : "manual",
        title: body.title ? String(body.title) : null,
        content: action === "createManual" ? String(body.content || "") : undefined,
        url: action === "createUrl" ? String(body.url || "") : undefined,
      });
      const fragment = await createFragment({
        userId: session.userId,
        sourceType: action === "createUrl" ? "url" : "manual",
        title: distilled.title,
        rawContent: distilled.rawContent,
        distilledContent: distilled.distilledContent,
        sourceUrl: distilled.sourceUrl,
      });
      if (fragment && Number(body.nodeId) > 0) {
        await attachFragmentToNode({
          documentId: document.id,
          nodeId: Number(body.nodeId),
          fragmentId: Number(fragment.id),
          usageMode: body.usageMode === "image" ? "image" : "rewrite",
        });
      }
    } else if (action === "createScreenshot") {
      await assertFragmentQuota(session.userId);
      if (!body.imageDataUrl || typeof body.imageDataUrl !== "string") {
        return fail("截图模式必须上传真实图片文件", 400);
      }
      const title = String(body.title || "大纲截图素材").trim() || "大纲截图素材";
      const note = String(body.note || "").trim();
      const screenshotPath = await persistScreenshot(body.imageDataUrl);
      const placeholder = note || "截图已上传，等待视觉理解。";
      const fragment = await createFragment({
        userId: session.userId,
        sourceType: "screenshot",
        title,
        rawContent: placeholder,
        distilledContent: placeholder,
        screenshotPath,
      });
      await queueJob("visionNote", {
        fragmentId: fragment?.id,
        sourceType: "screenshot",
        screenshotPath,
        title,
        note,
      });
      if (fragment && Number(body.nodeId) > 0) {
        await attachFragmentToNode({
          documentId: document.id,
          nodeId: Number(body.nodeId),
          fragmentId: Number(fragment.id),
          usageMode: "image",
        });
      }
    } else {
      return fail("不支持的素材操作", 400);
    }

    return ok(await getDocumentNodes(document.id));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "大纲素材更新失败", 400);
  }
}
