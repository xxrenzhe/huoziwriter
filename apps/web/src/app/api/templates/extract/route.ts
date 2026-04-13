import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertStyleGenomeApplyAllowed } from "@/lib/plan-access";
import { extractTemplateFromUrl } from "@/lib/template-extractor";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    await assertStyleGenomeApplyAllowed(session.userId);
    const extracted = await extractTemplateFromUrl(body.url);
    return ok(extracted);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "模板抽取失败", 400);
  }
}
