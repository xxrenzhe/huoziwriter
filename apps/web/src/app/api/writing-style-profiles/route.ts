import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertWritingStyleProfileSaveAllowed } from "@/lib/plan-access";
import { createWritingStyleProfile, getWritingStyleProfiles } from "@/lib/writing-style-profiles";
import type { WritingStyleAnalysis } from "@/lib/writing-style-analysis";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const profiles = await getWritingStyleProfiles(session.userId);
  return ok(profiles);
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertWritingStyleProfileSaveAllowed(session.userId);
    const body = await request.json();
    const analysis = body.analysis as WritingStyleAnalysis | undefined;
    if (!analysis?.sourceUrl || !analysis?.summary || !analysis?.imitationPrompt) {
      return fail("风格分析结果不完整，无法保存", 400);
    }
    const id = await createWritingStyleProfile(session.userId, analysis, body.name ? String(body.name) : null);
    return ok({ id, saved: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作风格资产保存失败", 400);
  }
}
