import type { ArticleEvidenceItem } from "./repositories";
import { resolveTopicVerticalsForTopicItem } from "./topic-source-registry";
import { verifyXExternalLinks, type VerificationHit } from "./x-cross-source-verifier";
import { resolveXThreadBundle } from "./x-thread-resolver";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export type XEvidenceBoard = {
  topic: string;
  whyNow: string;
  originSignal: {
    firstBreakHandle: string | null;
    firstBreakAt: string | null;
    firstBreakUrl: string | null;
  };
  coreClaims: Array<{
    claim: string;
    sourceTier: "primary" | "reported" | "secondary" | "social";
    sourceLabel: string;
    sourceUrl: string | null;
    confidence: "high" | "medium" | "low";
  }>;
  numberBoard: Array<{
    label: string;
    value: string;
    sourceTier: "primary" | "reported" | "secondary" | "social";
    sourceLabel: string;
    sourceUrl: string | null;
  }>;
  conflictBoard: Array<{
    sideA: string;
    sideB: string | null;
    sentence: string;
    evidenceRefs: string[];
  }>;
  quoteBoard: Array<{
    speaker: string;
    quoteStyle: "direct-short" | "paraphrased";
    content: string;
    sourceTier: "primary" | "reported" | "social";
    sourceUrl: string | null;
  }>;
  audienceImpact: Array<{
    audience: string;
    impact: string;
    urgency: "high" | "medium" | "low";
  }>;
  riskNotes: string[];
  verificationHits: VerificationHit[];
};

function buildWhyNow(input: {
  title: string;
  rootText: string;
  verificationHits: VerificationHit[];
}) {
  if (input.verificationHits.length > 0) {
    return `这条 X 讨论已经不只是社交热闹，外链证据开始把「${input.title}」往可验证事件推进。`;
  }
  if (/(just|today|now|刚刚|今天|this morning|tonight)/i.test(input.rootText)) {
    return `这条内容带有明显的即时事件信号，「${input.title}」属于刚起势的话题，而不是旧闻翻炒。`;
  }
  return `这条内容在 X 上快速聚焦到了「${input.title}」相关的变化和分歧。`;
}

function inferConflictSentence(title: string, rootText: string) {
  if (/(beat|beats|surpass|surpassed|overtake|反超|超越|replace|取代|copy|抄|vs\b)/i.test(`${title} ${rootText}`)) {
    return `${title} 背后不是简单消息更新，而是玩家之间的胜负变化开始被公开讨论。`;
  }
  if (/(revenue|arr|pricing|commission|mrr|rpm|epc|估值|收入|佣金|定价)/i.test(`${title} ${rootText}`)) {
    return `${title} 牵动的是钱从哪里来、谁赚得更多、谁的模式更扛打。`;
  }
  return `${title} 引发的不是单点讨论，而是判断标准、路径和后果上的分歧。`;
}

function inferAudienceImpact(title: string, summary: string, sourceUrl: string | null) {
  const verticals = resolveTopicVerticalsForTopicItem({
    title,
    summary,
    homepageUrl: sourceUrl,
  });
  const impacts: XEvidenceBoard["audienceImpact"] = [];
  if (verticals.includes("affiliate_marketing")) {
    impacts.push({ audience: "联盟营销从业者", impact: "要重新判断佣金结构、流量入口和 SEO 路径是否还成立。", urgency: "high" });
  }
  if (verticals.includes("side_hustles")) {
    impacts.push({ audience: "副业尝试者", impact: "要看这条案例究竟是可复制打法，还是只适合少数人。", urgency: "high" });
  }
  if (verticals.includes("overseas_income")) {
    impacts.push({ audience: "出海与赚美金人群", impact: "需要判断这个窗口是否真的能带来稳定美元收入。", urgency: "medium" });
  }
  if (verticals.includes("ai_products")) {
    impacts.push({ audience: "AI 产品从业者", impact: "需要判断竞争格局、商业化路径和产品方向有没有被改写。", urgency: "medium" });
  }
  if (impacts.length === 0) {
    impacts.push({ audience: "热点观察者", impact: "需要分清这到底是短期情绪，还是已经足以影响判断和行动的变化。", urgency: "medium" });
  }
  return impacts.slice(0, 4);
}

export async function buildXEvidenceBoard(input: {
  title: string;
  summary?: string | null;
  sourceUrl?: string | null;
  sourceMeta?: Record<string, unknown> | null;
  fetcher?: (input: { url: string }) => Promise<{ text: string }>;
}) {
  const thread = resolveXThreadBundle(input);
  const verificationHits = await verifyXExternalLinks({
    title: input.title,
    claims: thread.extractedClaims,
    externalLinks: thread.externalLinks,
    fetcher: input.fetcher,
  });
  const sourceMeta = getRecord(input.sourceMeta);
  const metrics = getRecord(sourceMeta?.metrics);
  const coreClaims = [
    ...thread.extractedClaims.slice(0, 4).map((claim) => ({
      claim,
      sourceTier: "social" as const,
      sourceLabel: thread.rootPost.authorHandle ? `@${thread.rootPost.authorHandle}` : "X.com 原帖",
      sourceUrl: input.sourceUrl || null,
      confidence: verificationHits.length > 0 ? "medium" as const : "low" as const,
    })),
    ...verificationHits.slice(0, 3),
  ].slice(0, 6);
  const numberBoard: XEvidenceBoard["numberBoard"] = [
    ...thread.extractedNumbers.slice(0, 6).map((value, index) => ({
      label: index === 0 ? "帖子核心数字" : `补充数字 ${index}`,
      value,
      sourceTier: "social" as const,
      sourceLabel: thread.rootPost.authorHandle ? `@${thread.rootPost.authorHandle}` : "X.com 原帖",
      sourceUrl: input.sourceUrl || null,
    })),
    ...(Number.isFinite(Number(metrics?.like_count))
      ? [{
          label: "点赞",
          value: String(Number(metrics?.like_count || 0)),
          sourceTier: "social" as const,
          sourceLabel: "X public metrics",
          sourceUrl: input.sourceUrl || null,
        }]
      : []),
  ].slice(0, 8);
  const riskNotes = [
    verificationHits.length === 0 ? "当前只有 X 社交信号，缺少外链验证命中。" : null,
    verificationHits.some((item) => item.sourceTier === "secondary") && !verificationHits.some((item) => item.sourceTier === "primary" || item.sourceTier === "reported")
      ? "目前验证主要来自二级媒体或分析文章，关键判断仍需降级表达。"
      : null,
  ].filter(Boolean) as string[];
  return {
    topic: input.title,
    whyNow: buildWhyNow({
      title: input.title,
      rootText: thread.rootPost.textRaw,
      verificationHits,
    }),
    originSignal: {
      firstBreakHandle: thread.rootPost.authorHandle,
      firstBreakAt: thread.rootPost.createdAt,
      firstBreakUrl: input.sourceUrl || null,
    },
    coreClaims,
    numberBoard,
    conflictBoard: [{
      sideA: thread.rootPost.authorHandle ? `@${thread.rootPost.authorHandle}` : input.title,
      sideB: verificationHits[0]?.sourceLabel || null,
      sentence: inferConflictSentence(input.title, thread.rootPost.textRaw),
      evidenceRefs: [input.sourceUrl || "", ...verificationHits.map((item) => item.sourceUrl)].filter(Boolean).slice(0, 4),
    }],
    quoteBoard: thread.rootPost.textRaw
      ? [{
          speaker: thread.rootPost.authorHandle ? `@${thread.rootPost.authorHandle}` : "X.com 原帖",
          quoteStyle: "direct-short",
          content: thread.rootPost.textRaw.slice(0, 140),
          sourceTier: "social",
          sourceUrl: input.sourceUrl || null,
        }]
      : [],
    audienceImpact: inferAudienceImpact(input.title, getString(input.summary), input.sourceUrl || null),
    riskNotes,
    verificationHits,
  } satisfies XEvidenceBoard;
}

export function buildEvidenceItemsFromXEvidenceBoard(input: {
  board: XEvidenceBoard;
  sourceUrl?: string | null;
  nodeId?: number | null;
}) {
  const items: Array<Partial<ArticleEvidenceItem>> = [];
  for (const claim of input.board.coreClaims.slice(0, 6)) {
    items.push({
      nodeId: Number(input.nodeId || 0) || null,
      claim: claim.claim,
      title: claim.sourceLabel,
      excerpt: claim.claim,
      sourceType: claim.sourceTier === "social" ? "x-hotspot" : "url",
      sourceUrl: claim.sourceUrl || input.sourceUrl || null,
      usageMode: "rewrite",
      rationale: claim.sourceTier === "social" ? "保留原始讨论口径与现场表达。" : "用于补充已验证的背景、数字或判断。",
      researchTag: claim.sourceTier === "social" ? "userVoice" : "turningPoint",
      evidenceRole: "supportingEvidence",
    });
  }
  for (const hit of input.board.verificationHits.slice(0, 3)) {
    items.push({
      nodeId: Number(input.nodeId || 0) || null,
      claim: hit.claim,
      title: hit.sourceLabel,
      excerpt: hit.matchedEvidence,
      sourceType: "url",
      sourceUrl: hit.sourceUrl,
      usageMode: "rewrite",
      rationale: hit.sourceTier === "primary" || hit.sourceTier === "reported" ? "作为高可信验证来源。" : "作为补充外链验证来源。",
      researchTag: "turningPoint",
      evidenceRole: "supportingEvidence",
    });
  }
  for (const risk of input.board.riskNotes.slice(0, 2)) {
    items.push({
      nodeId: Number(input.nodeId || 0) || null,
      claim: risk,
      title: "X 热点风险提示",
      excerpt: risk,
      sourceType: "manual",
      sourceUrl: null,
      usageMode: "rewrite",
      rationale: "提醒写作链路不要把社交信号写成确定事实。",
      researchTag: "contradiction",
      evidenceRole: "counterEvidence",
    });
  }
  return items;
}
