import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertPersonaSourceAnalysisAllowed } from "@/lib/plan-access";
import { createPersonaFromSourceAnalysis } from "@/lib/personas";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertPersonaSourceAnalysisAllowed(session.userId);
    const body = await request.json();
    const sources = Array.isArray(body.sources)
      ? body.sources
      : [
          {
            sourceType: "text",
            title: body.sourceTitle ? String(body.sourceTitle) : null,
            sourceUrl: body.sourceUrl ? String(body.sourceUrl) : null,
            sourceText: String(body.sourceText || ""),
          },
        ];
    const persona = await createPersonaFromSourceAnalysis({
      userId: session.userId,
      name: body.name ? String(body.name) : null,
      sources,
      isDefault: body.isDefault ?? false,
    });
    return ok(persona);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "资料人设分析失败", 400);
  }
}
