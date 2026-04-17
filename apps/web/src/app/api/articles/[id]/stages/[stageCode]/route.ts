import { ensureUserSession } from "@/lib/auth";
import {
  generateArticleStageArtifact,
  getArticleStageArtifact,
  isSupportedArticleArtifactStage,
  updateArticleStageArtifactPayload,
} from "@/lib/article-stage-artifacts";
import { fail, ok } from "@/lib/http";
import { ARTICLE_PROTOTYPE_CODES, WRITING_STATE_VARIANT_CODES, type ArticlePrototypeCode, type WritingStateVariantCode } from "@/lib/writing-state";

export async function GET(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    if (!isSupportedArticleArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持结构化产物", 400);
    }
    const artifact = await getArticleStageArtifact(Number(params.id), session.userId, params.stageCode);
    return ok(artifact);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取阶段产物失败", 400);
  }
}

export async function POST(request: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    if (!isSupportedArticleArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持结构化产物生成", 400);
    }
    const rawBody = await request.text();
    let body: Record<string, unknown> | null = null;
    if (rawBody.trim()) {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail("请求体格式错误", 400);
      }
      body = parsed as Record<string, unknown>;
    }
    const requestedPrototypeCode = typeof body?.articlePrototypeCode === "string" ? body.articlePrototypeCode.trim() : "";
    const requestedStateVariantCode = typeof body?.stateVariantCode === "string" ? body.stateVariantCode.trim() : "";
    if ((requestedPrototypeCode || requestedStateVariantCode) && params.stageCode !== "deepWriting") {
      return fail("只有深度写作阶段支持手动切换文章原型或写作状态", 400);
    }
    if (requestedPrototypeCode && !ARTICLE_PROTOTYPE_CODES.includes(requestedPrototypeCode as ArticlePrototypeCode)) {
      return fail("不支持的文章原型", 400);
    }
    if (requestedStateVariantCode && !WRITING_STATE_VARIANT_CODES.includes(requestedStateVariantCode as WritingStateVariantCode)) {
      return fail("不支持的写作状态", 400);
    }
    const artifact = await generateArticleStageArtifact({
      articleId: Number(params.id),
      userId: session.userId,
      stageCode: params.stageCode,
      deepWritingPrototypeCode: requestedPrototypeCode
        ? requestedPrototypeCode as ArticlePrototypeCode
        : null,
      deepWritingStateVariantCode: requestedStateVariantCode
        ? requestedStateVariantCode as WritingStateVariantCode
        : null,
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
    if (!isSupportedArticleArtifactStage(params.stageCode)) {
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
    const artifact = await updateArticleStageArtifactPayload({
      articleId: Number(params.id),
      userId: session.userId,
      stageCode: params.stageCode,
      payloadPatch,
    });
    return ok(artifact);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新阶段产物失败", 400);
  }
}
