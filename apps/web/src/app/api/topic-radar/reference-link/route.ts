import { ensureUserSession } from "@/lib/auth";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { fetchWebpageArticle } from "@/lib/webpage-reader";

function buildReferenceCandidates(input: { title: string; distilled: string }) {
  const base = input.distilled || input.title;
  return [
    {
      proposedTitle: `${input.title}：这篇文章真正值得重写的不是观点，而是它隐含的判断坐标`,
      angleLabel: "判断坐标",
      angleReason: "适合从旧判断失效、叙事框架变化切入。",
      thesis: `围绕“${input.title}”，重点不是复述原文，而是拆开它背后的判断坐标为何变化。`,
      seedFacts: [base.slice(0, 80)],
    },
    {
      proposedTitle: `${input.title}：如果把它放回现实处境，这个问题会更刺人`,
      angleLabel: "读者处境",
      angleReason: "适合从用户、团队或行业参与者的现实压力切入。",
      thesis: `把“${input.title}”从观点文章，转成与读者处境直接相关的现实问题。`,
      seedFacts: [base.slice(80, 160) || base.slice(0, 80)],
    },
    {
      proposedTitle: `${input.title}：原文说到的是现象，真正该写的是利益变化`,
      angleLabel: "利益变化",
      angleReason: "适合从角色关系、收益分配和隐性代价切入。",
      thesis: `不要停留在原文现象层，重点拆谁得利、谁承压、哪些叙事被掩盖。`,
      seedFacts: [base.slice(0, 60), base.slice(60, 120)].filter(Boolean),
    },
  ];
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const url = String(body.url || "").trim();
    if (!url) {
      return fail("参考链接不能为空", 400);
    }
    const article = await fetchWebpageArticle(url);
    const distilled = await distillCaptureInput({
      sourceType: "manual",
      title: article.sourceTitle,
      content: article.rawText,
    });
    return ok({
      sourceUrl: url,
      sourceTitle: article.sourceTitle || distilled.title,
      degradedReason: distilled.degradedReason ?? null,
      candidates: buildReferenceCandidates({
        title: article.sourceTitle || distilled.title,
        distilled: distilled.distilledContent,
      }),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "参考链接拆题失败", 400);
  }
}
