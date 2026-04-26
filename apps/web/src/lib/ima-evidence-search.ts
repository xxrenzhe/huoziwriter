import { getActiveImaContext, listImaConnections, markImaConnectionInvalid, normalizeImaError } from "./ima-connections";
import { ImaApiError, searchKnowledge } from "./ima-client";

export type ImaEvidenceSearchResult = {
  items: Array<{
    mediaId: string;
    title: string;
    excerpt: string;
    sourceUrl: string | null;
  }>;
  nextCursor: string;
  isEnd: boolean;
  degradedReason: string | null;
};

function tokenizeQuery(value: string) {
  return Array.from(new Set((String(value || "").toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{3,}/g) ?? []).filter(Boolean)));
}

export function buildImaQueryVariants(value: string) {
  const normalized = String(value || "").trim();
  const tokens = Array.from(new Set((normalized.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9]{2,}/g) ?? []).filter(Boolean)));
  const prioritizedTokens = tokens
    .sort((left, right) => right.length - left.length)
    .slice(0, 4);
  return Array.from(new Set([normalized, ...prioritizedTokens].filter(Boolean)));
}

export function scoreKnowledgeBaseForQuery(input: {
  query: string;
  kbName: string;
  description: string | null;
  isDefault: boolean;
}) {
  const tokens = tokenizeQuery(input.query);
  const seed = `${input.kbName} ${input.description || ""}`.toLowerCase();
  let score = input.isDefault ? 4 : 0;
  for (const token of tokens) {
    if (seed.includes(token)) {
      score += /[\u4e00-\u9fa5]/.test(token) ? 10 : 6;
    }
  }
  if (/(公众号|爆文|内容|写作|创作)/.test(seed) && /(公众号|内容|写作|爆文|文章)/.test(input.query)) {
    score += 12;
  }
  if (/(ai|人工智能|自动化|工作流|出海)/.test(seed) && /(ai|人工智能|自动化|工作流|出海)/.test(input.query.toLowerCase())) {
    score += 8;
  }
  if (/(海外赚美金|赚美金|美元|海外客户|跨境|出海|remote|freelance|digital nomad)/i.test(input.query) && /(赚美金|美元|出海|跨境|remote|freelance)/i.test(seed)) {
    score += 12;
  }
  if (/(职场|升职|裁员|绩效|管理|求职|职业)/i.test(input.query) && /(职场|升职|裁员|绩效|管理|求职|职业)/i.test(seed)) {
    score += 12;
  }
  if (/(联盟营销|affiliate|佣金|cps|cpa|站长|seo 变现)/i.test(input.query) && /(联盟营销|affiliate|佣金|cps|cpa|站长|seo)/i.test(seed)) {
    score += 12;
  }
  if (/(ai产品|ai 工具|agent|模型产品|saas|product hunt)/i.test(input.query) && /(ai|agent|模型|saas|product hunt|产品)/i.test(seed)) {
    score += 10;
  }
  if (/(副业|side hustle|第二收入|兼职|下班后赚钱|个人品牌变现)/i.test(input.query) && /(副业|side hustle|第二收入|兼职|变现|个人品牌)/i.test(seed)) {
    score += 12;
  }
  if (/(10w\+|10w\+爆文|爆文素材库|公众号10w)/i.test(seed)) {
    score += 6;
  }
  return score;
}

export function rankImaKnowledgeBasesForQuery(input: {
  query: string;
  knowledgeBases: Array<{
    kbId: string;
    kbName: string;
    description: string | null;
    isDefault: boolean;
  }>;
}) {
  return input.knowledgeBases
    .map((kb) => ({
      kbId: kb.kbId,
      score: scoreKnowledgeBaseForQuery({
        query: input.query,
        kbName: kb.kbName,
        description: kb.description,
        isDefault: kb.isDefault,
      }),
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.kbId);
}

async function buildImaSearchContexts(input: {
  userId: number;
  kbId?: string | null;
  query: string;
}) {
  if (input.kbId) {
    return [await getActiveImaContext(input.userId, { preferredKbId: input.kbId })];
  }

  const connections = await listImaConnections(input.userId);
  const rankedKbIds = rankImaKnowledgeBasesForQuery({
    query: input.query,
    knowledgeBases: connections
      .filter((connection) => connection.status === "valid")
      .flatMap((connection) =>
        connection.knowledgeBases
          .filter((kb) => kb.isEnabled)
          .map((kb) => ({
            kbId: kb.kbId,
            kbName: kb.kbName,
            description: kb.description,
            isDefault: kb.isDefault,
          })),
      ),
  });

  const uniqueKbIds = Array.from(new Set(rankedKbIds)).slice(0, 3);
  if (uniqueKbIds.length === 0) {
    return [await getActiveImaContext(input.userId)];
  }

  const contexts = [];
  for (const kbId of uniqueKbIds) {
    contexts.push(await getActiveImaContext(input.userId, { preferredKbId: kbId }));
  }
  return contexts;
}

async function searchAcrossContexts(input: {
  contexts: Awaited<ReturnType<typeof buildImaSearchContexts>>;
  query: string;
  cursor?: string;
}) {
  const mergedItems: ImaEvidenceSearchResult["items"] = [];
  let lastNextCursor = "";
  let lastIsEnd = true;
  for (const active of input.contexts) {
    const result = await searchKnowledge(active.creds, active.kbId, input.query, String(input.cursor || ""));
    lastNextCursor = result.nextCursor;
    lastIsEnd = result.isEnd;
    for (const item of result.items.slice(0, 20)) {
      if (mergedItems.some((existing) => existing.mediaId === item.mediaId)) {
        continue;
      }
      mergedItems.push({
        mediaId: item.mediaId,
        title: item.title,
        excerpt: item.highlightContent || item.title,
        sourceUrl: item.sourceUrl,
      });
    }
    if (mergedItems.length >= 20) {
      break;
    }
  }
  return {
    items: mergedItems.slice(0, 20),
    nextCursor: lastNextCursor,
    isEnd: lastIsEnd,
  };
}

export async function runImaEvidenceSearch(input: {
  userId: number;
  kbId?: string | null;
  query: string;
  cursor?: string;
}): Promise<ImaEvidenceSearchResult> {
  try {
    const trimmedQuery = input.query.trim();
    const contexts = await buildImaSearchContexts({
      userId: input.userId,
      kbId: input.kbId,
      query: trimmedQuery,
    });
    let result = await searchAcrossContexts({
      contexts,
      query: trimmedQuery,
      cursor: input.cursor,
    });
    if (result.items.length === 0) {
      const variants = buildImaQueryVariants(trimmedQuery).slice(1);
      for (const variant of variants) {
        result = await searchAcrossContexts({
          contexts,
          query: variant,
          cursor: input.cursor,
        });
        if (result.items.length > 0) {
          break;
        }
      }
    }
    return {
      items: result.items,
      nextCursor: result.nextCursor,
      isEnd: result.isEnd,
      degradedReason: null,
    };
  } catch (error) {
    if (error instanceof ImaApiError && (error.code === 1100 || error.code === 1101)) {
      try {
        const active = await getActiveImaContext(input.userId, { preferredKbId: input.kbId });
        await markImaConnectionInvalid({
          userId: input.userId,
          connectionId: active.connectionId,
          error: error.message,
        });
      } catch {
        // Ignore best-effort invalid marking.
      }
    }
    return {
      items: [],
      nextCursor: "",
      isEnd: true,
      degradedReason: normalizeImaError(error),
    };
  }
}
