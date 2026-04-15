import { ensureUserSession } from "@/lib/auth";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { getKnowledgeCards } from "@/lib/knowledge";
import { buildTopicAngleOptions, buildTopicJudgementShift, matchTopicToKnowledgeCards } from "@/lib/knowledge-match";
import { fetchWebpageArticle } from "@/lib/webpage-reader";

function parseJsonArray(value: string | string[] | null | undefined) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  try {
    return (JSON.parse(value) as string[]).map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function buildReferenceCandidates(input: {
  title: string;
  distilled: string;
  matches: ReturnType<typeof matchTopicToKnowledgeCards>;
}) {
  const base = input.distilled || input.title;
  const lead = input.matches[0] ?? null;
  const secondary = input.matches[1] ?? null;
  const judgementShift = buildTopicJudgementShift(input.title, input.matches);
  const anglePrompts = buildTopicAngleOptions(
    input.title,
    [
      `围绕“${input.title}”先拆这次新增变量到底推翻了什么旧判断。`,
      `把“${input.title}”放回读者处境，写影响开始落到谁身上。`,
      `不要只写现象，重点拆利益格局和隐性代价如何变化。`,
    ],
    input.matches,
  );
  const impactedJudgements = lead?.overturnedJudgements.slice(0, 2) ?? [];
  const sharedMeta = {
    matchedKnowledgeTitle: lead?.title ?? null,
    latestChangeSummary: lead?.latestChangeSummary ?? null,
    impactedJudgements,
  };

  return [
    {
      proposedTitle: lead ? `${input.title}：真正该重写的，是「${lead.title}」里那条旧判断` : `${input.title}：这篇文章真正值得重写的不是观点，而是它隐含的判断坐标`,
      angleLabel: "判断修正",
      angleReason: anglePrompts[0] || "适合从旧判断失效、叙事框架变化切入。",
      whyNow: judgementShift || "因为这类主题最值钱的不是复述原文，而是说明哪些旧判断今天已经不够用了。",
      thesis: lead
        ? `围绕“${input.title}”，重点写新事实如何修正「${lead.title}」里原先沉淀的判断。`
        : `围绕“${input.title}”，重点不是复述原文，而是拆开它背后的判断坐标为何变化。`,
      seedFacts: [base.slice(0, 80), lead?.latestChangeSummary, impactedJudgements[0]].filter(Boolean),
      ...sharedMeta,
    },
    {
      proposedTitle: `${input.title}：如果把它放回现实处境，这个问题会更刺人`,
      angleLabel: "读者处境",
      angleReason: anglePrompts[1] || "适合从用户、团队或行业参与者的现实压力切入。",
      whyNow: lead?.latestChangeSummary
        ? `主题档案最近补入的变化是：${lead.latestChangeSummary}`
        : judgementShift || "因为读者真正关心的是这件事开始怎样影响自己，而不是原文作者怎么下结论。",
      thesis: `把“${input.title}”从观点文章，转成与读者处境直接相关的现实问题。`,
      seedFacts: [base.slice(80, 160) || base.slice(0, 80), impactedJudgements[1], secondary?.latestChangeSummary].filter(Boolean),
      ...sharedMeta,
    },
    {
      proposedTitle: `${input.title}：原文说到的是现象，真正该写的是利益变化`,
      angleLabel: "利益变化",
      angleReason: anglePrompts[2] || "适合从角色关系、收益分配和隐性代价切入。",
      whyNow: impactedJudgements.length > 0
        ? `目前已受影响的旧判断包括：${impactedJudgements.join("；")}`
        : "因为一旦利益格局发生变化，旧叙事往往会失效，这正是现在值得补写的部分。",
      thesis: `不要停留在原文现象层，重点拆谁得利、谁承压、哪些叙事被掩盖。`,
      seedFacts: [base.slice(0, 60), base.slice(60, 120), secondary?.summary].filter(Boolean),
      ...sharedMeta,
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
    const title = article.sourceTitle || distilled.title;
    const knowledgeCards = await getKnowledgeCards(session.userId);
    const matches = matchTopicToKnowledgeCards(
      title,
      knowledgeCards.map((card) => ({
        id: card.id,
        title: card.title,
        summary: card.summary,
        latestChangeSummary: card.latest_change_summary,
        overturnedJudgements: parseJsonArray(card.overturned_judgements_json),
        card_type: card.card_type,
        status: card.status,
        confidence_score: card.confidence_score,
        shared: card.shared,
        owner_username: card.owner_username,
      })),
      2,
    );
    const judgementShift = buildTopicJudgementShift(title, matches);
    return ok({
      sourceUrl: url,
      sourceTitle: title,
      degradedReason: distilled.degradedReason ?? null,
      judgementShift,
      knowledgeMatches: matches,
      candidates: buildReferenceCandidates({
        title,
        distilled: distilled.distilledContent,
        matches,
      }),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "参考链接拆题失败", 400);
  }
}
