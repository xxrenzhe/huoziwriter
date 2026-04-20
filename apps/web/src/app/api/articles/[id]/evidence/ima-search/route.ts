import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { consumeImaEvidenceSearchQuota } from "@/lib/plan-access";
import { getArticleById } from "@/lib/repositories";
import { runImaEvidenceSearch } from "@/lib/ima-evidence-search";

function sanitizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const articleId = Number(params.id);
    if (!Number.isFinite(articleId)) {
      throw new Error("稿件不存在");
    }
    const article = await getArticleById(articleId, session.userId);
    if (!article) {
      throw new Error("稿件不存在");
    }

    const body = await request.json().catch(() => ({}));
    const query = sanitizeText(body.query, 120);
    if (!query) {
      throw new Error("请输入检索关键词");
    }

    await consumeImaEvidenceSearchQuota(session.userId);

    return ok(await runImaEvidenceSearch({
      userId: session.userId,
      kbId: sanitizeText(body.kbId, 120) || null,
      query,
      cursor: sanitizeText(body.cursor, 200),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMA 证据检索失败";
    return fail(message, /上限/.test(message) ? 429 : 400);
  }
}
