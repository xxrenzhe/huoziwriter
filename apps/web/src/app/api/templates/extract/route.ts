import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertCustomTemplateQuota, assertTemplateExtractAllowed } from "@/lib/plan-access";
import { extractTemplateFromUrl } from "@/lib/template-extractor";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    await assertTemplateExtractAllowed(session.userId);
    await assertCustomTemplateQuota(session.userId);
    const extracted = await extractTemplateFromUrl(String(body.url || "").trim(), session.userId);
    return ok(extracted);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "模板抽取失败", 400);
  }
}
