import { ensureUserSession } from "@/lib/auth";
import { generateArticleStageArtifact, getArticleStageArtifact, updateArticleStageArtifactPayload } from "@/lib/article-stage-artifacts";
import { attachFragmentToArticleNode, getArticleNodes } from "@/lib/article-outline";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { assertFragmentQuota } from "@/lib/plan-access";
import { createFragment, getArticleById, queueJob, updateFragmentReferenceFusion } from "@/lib/repositories";
import { buildReferenceFusionProfile, normalizeReferenceFusionMode } from "@/lib/reference-fusion";
import { persistScreenshot } from "@/lib/screenshot-upload";

function buildMaterialReferenceFusionSourceMeta(modeValue: unknown, sourceUrl?: string | null) {
  const mode = normalizeReferenceFusionMode(modeValue, sourceUrl ? "evidence" : "inspiration");
  return {
    referenceFusionMode: mode,
    referenceFusion: buildReferenceFusionProfile({
      mode,
      sourceUrls: sourceUrl ? [sourceUrl] : [],
    }),
  };
}

async function ensureOutlineArtifact(articleId: number, userId: number) {
  const existing = await getArticleStageArtifact(articleId, userId, "outlinePlanning");
  if (existing) {
    return existing;
  }
  return generateArticleStageArtifact({ articleId, userId, stageCode: "outlinePlanning" });
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const [artifact, nodes] = await Promise.all([
    getArticleStageArtifact(article.id, session.userId, "outlinePlanning"),
    getArticleNodes(article.id),
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
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const body = await request.json();
  await ensureOutlineArtifact(article.id, session.userId);
  const viewpoints = Array.from(
    new Set(
      ((Array.isArray(body.supplementalViewpoints) ? body.supplementalViewpoints : []) as unknown[])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);
  const artifact = await updateArticleStageArtifactPayload({
    articleId: article.id,
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
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  try {
    const body = await request.json();
    const action = String(body.action || "attachExisting").trim();
    if (action === "attachExisting") {
      await updateFragmentReferenceFusion({
        userId: session.userId,
        fragmentId: Number(body.fragmentId),
        mode: body.referenceFusionMode,
      });
      await attachFragmentToArticleNode({
        articleId: article.id,
        nodeId: Number(body.nodeId),
        fragmentId: Number(body.fragmentId),
        usageMode: body.usageMode === "image" ? "image" : "rewrite",
      });
    } else if (action === "updateReferenceFusion") {
      await updateFragmentReferenceFusion({
        userId: session.userId,
        fragmentId: Number(body.fragmentId),
        mode: body.referenceFusionMode,
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
        sourceMeta: buildMaterialReferenceFusionSourceMeta(body.referenceFusionMode, distilled.sourceUrl),
      });
      if (fragment && Number(body.nodeId) > 0) {
        await attachFragmentToArticleNode({
          articleId: article.id,
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
        sourceMeta: buildMaterialReferenceFusionSourceMeta(body.referenceFusionMode, null),
      });
      await queueJob("visionNote", {
        fragmentId: fragment?.id,
        sourceType: "screenshot",
        screenshotPath,
        title,
        note,
      });
      if (fragment && Number(body.nodeId) > 0) {
        await attachFragmentToArticleNode({
          articleId: article.id,
          nodeId: Number(body.nodeId),
          fragmentId: Number(fragment.id),
          usageMode: "image",
        });
      }
    } else {
      return fail("不支持的素材操作", 400);
    }

    return ok(await getArticleNodes(article.id));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "大纲素材更新失败", 400);
  }
}
