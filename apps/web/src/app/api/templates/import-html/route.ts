import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertCustomTemplateQuota, assertTemplateExtractAllowed } from "@/lib/plan-access";
import { importHtmlTemplate } from "@/lib/template-import";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    await assertTemplateExtractAllowed(session.userId);
    await assertCustomTemplateQuota(session.userId);
    const result = await importHtmlTemplate({
      userId: session.userId,
      html: String(body.html || ""),
      name: body.name == null ? null : String(body.name),
      sourceUrl: body.sourceUrl == null ? null : String(body.sourceUrl),
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "HTML 模板导入失败", 400);
  }
}
