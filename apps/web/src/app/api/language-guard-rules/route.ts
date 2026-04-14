import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createLanguageGuardRule, getLanguageGuardRules } from "@/lib/language-guard";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  return ok(await getLanguageGuardRules(session.userId));
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const created = await createLanguageGuardRule({
      userId: session.userId,
      ruleKind: body.ruleKind,
      matchMode: body.matchMode,
      patternText: body.patternText,
      rewriteHint: body.rewriteHint,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "添加语言守卫规则失败", 400);
  }
}
