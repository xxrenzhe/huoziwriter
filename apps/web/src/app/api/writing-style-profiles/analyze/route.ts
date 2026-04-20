import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getUserPlanContext } from "@/lib/plan-access";
import { incrementDailyWritingStyleAnalysisUsage, getDailyWritingStyleAnalysisUsage } from "@/lib/usage";
import { extractWritingStyleFromUrls } from "@/lib/writing-style-analysis";

const SAMPLE_LIMIT_BY_PLAN = {
  free: 3,
  pro: 5,
  ultra: 10,
} as const;

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const urls = Array.from(new Set(
      (Array.isArray(body.urls) ? body.urls : [])
        .map((item: unknown) => String(item || "").trim())
        .filter(Boolean),
    )) as string[];
    if (urls.length < 3) {
      return fail("交叉分析至少需要 3 篇文章链接", 400);
    }

    const { plan, planSnapshot } = await getUserPlanContext(session.userId);
    const dailyLimit = planSnapshot.writingStyleAnalysisDailyLimit;
    const used = await getDailyWritingStyleAnalysisUsage(session.userId);
    if (dailyLimit > 0 && used >= dailyLimit) {
      return fail(`${plan.name}套餐今日文风分析额度已达上限 ${dailyLimit} 次`, 400);
    }

    const sampleLimit = SAMPLE_LIMIT_BY_PLAN[plan.code];
    if (urls.length > sampleLimit) {
      return fail(`当前套餐单次最多支持 ${sampleLimit} 篇样本交叉分析`, 400);
    }

    const analysis = await extractWritingStyleFromUrls(urls);
    const nextUsed = await incrementDailyWritingStyleAnalysisUsage(session.userId);
    return ok({
      analysis,
      quota: {
        used: nextUsed,
        limit: dailyLimit,
        remaining: dailyLimit > 0 ? Math.max(dailyLimit - nextUsed, 0) : null,
      },
      sampleLimit,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "文风交叉分析失败", 400);
  }
}
