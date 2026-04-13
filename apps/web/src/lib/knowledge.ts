import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getUserAccessScope } from "./access-scope";

type KnowledgeCardStatus = "draft" | "active" | "conflicted" | "stale" | "archived";

type CompileFragment = {
  id: number;
  title: string | null;
  source_type: string;
  distilled_content: string;
  created_at: string;
};

type KnowledgeCardListItem = {
  id: number;
  card_type: string;
  title: string;
  slug: string;
  summary: string | null;
  confidence_score: number;
  status: string;
  last_compiled_at: string | null;
  last_verified_at: string | null;
  created_at: string;
  source_fragment_count: number;
  source_fragment_ids: number[];
};

type AdminKnowledgeCardListItem = KnowledgeCardListItem & {
  user_id: number;
  username: string | null;
  updated_at: string;
  revision_count: number;
};

type KnowledgeCardDetail = Awaited<ReturnType<typeof getKnowledgeCardDetail>>;

function tokenizeSearchText(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, " ")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  ).slice(0, 36);
}

function scoreKnowledgeCard(card: KnowledgeCardListItem, context: { attachedFragmentIds: number[]; tokens: string[] }) {
  let score = 0;
  const attachedFragmentSet = new Set(context.attachedFragmentIds);
  const overlapCount = card.source_fragment_ids.filter((fragmentId) => attachedFragmentSet.has(fragmentId)).length;
  score += overlapCount * 8;

  const haystack = `${card.title} ${card.summary || ""}`.toLowerCase();
  for (const token of context.tokens) {
    if (haystack.includes(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
  }

  if (card.status === "active") score += 4;
  if (card.status === "stale") score -= 2;
  if (card.status === "conflicted") score -= 3;
  score += Math.round(card.confidence_score * 10);
  return score;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function parseList(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function pickCardType(fragment: { source_type: string; title: string | null }) {
  const title = fragment.title || "";
  if (title.includes("公司") || title.includes("集团")) return "company";
  if (title.includes("人物") || title.includes("创始人")) return "person";
  if (title.includes("产品") || title.includes("工具")) return "product";
  if (fragment.source_type === "url") return "topic";
  return "event";
}

function analyzeKnowledgeConsensus(fragments: CompileFragment[]) {
  const signalGroups = [
    {
      label: "走势判断",
      positive: ["增长", "上涨", "盈利", "扩张", "回暖", "创新高", "提振"],
      negative: ["下滑", "下跌", "亏损", "收缩", "裁员", "暴跌", "承压"],
    },
    {
      label: "真实性判断",
      positive: ["确认", "证实", "宣布", "落地", "达成", "发布"],
      negative: ["否认", "辟谣", "澄清", "叫停", "取消", "未落地"],
    },
    {
      label: "风险判断",
      positive: ["安全", "合规", "通过", "获批", "改善", "修复"],
      negative: ["风险", "违规", "处罚", "争议", "调查", "事故"],
    },
  ];

  const conflictSignals = signalGroups
    .map((group) => {
      const positiveHits = fragments.filter((fragment) => group.positive.some((token) => fragment.distilled_content.includes(token))).length;
      const negativeHits = fragments.filter((fragment) => group.negative.some((token) => fragment.distilled_content.includes(token))).length;
      return positiveHits > 0 && negativeHits > 0 ? group.label : null;
    })
    .filter((item): item is string => Boolean(item));

  const fragmentCount = fragments.length;
  const hasConflict = conflictSignals.length > 0;
  const confidenceScore = Math.max(0.42, Math.min(0.9, 0.58 + Math.min(fragmentCount, 4) * 0.07 - conflictSignals.length * 0.14));
  const status: KnowledgeCardStatus = hasConflict ? "conflicted" : "active";
  const openQuestions = hasConflict
    ? [
        `检测到潜在冲突：${conflictSignals.join("、")}，需要补充相反事实来源并确认最新时间线。`,
        "哪些判断已经过期，哪些只是不同口径下的阶段性差异？",
      ]
    : fragmentCount >= 3
      ? ["是否还缺少相反事实来源？", "下一轮需要补充时间线和关键人信息。"]
      : ["当前证据仍偏少，需要继续补充碎片。", "是否已经出现与现有判断相反的新事实？"];
  const changeSummary = hasConflict ? `检测到潜在冲突：${conflictSignals.join("、")}，档案已转为 conflicted。` : "基于最新碎片重新编译主题档案";

  return {
    status,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    openQuestions,
    changeSummary,
  };
}

async function loadFragmentsForCompile(userId: number, fragmentIds?: number[]) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const scopePlaceholders = scope.userIds.map(() => "?").join(", ");
  if (!fragmentIds || fragmentIds.length === 0) {
    return db.query<CompileFragment>(
      `SELECT id, title, source_type, distilled_content, created_at
       FROM fragments
       WHERE user_id IN (${scopePlaceholders})
       ORDER BY id DESC
       LIMIT 5`,
      scope.userIds,
    );
  }

  const placeholders = fragmentIds.map(() => "?").join(", ");
  return db.query<CompileFragment>(
    `SELECT id, title, source_type, distilled_content, created_at
     FROM fragments
     WHERE user_id IN (${scopePlaceholders}) AND id IN (${placeholders})
     ORDER BY id DESC`,
    [...scope.userIds, ...fragmentIds],
  );
}

async function loadKnowledgeCardSourceFragmentIds(cardIds: number[]) {
  if (cardIds.length === 0) {
    return new Map<number, number[]>();
  }

  const db = getDatabase();
  const placeholders = cardIds.map(() => "?").join(", ");
  const rows = await db.query<{
    knowledge_card_id: number;
    fragment_id: number;
  }>(
    `SELECT knowledge_card_id, fragment_id
     FROM knowledge_card_fragments
     WHERE knowledge_card_id IN (${placeholders})
     ORDER BY knowledge_card_id ASC, id ASC`,
    cardIds,
  );

  const fragmentMap = new Map<number, number[]>();
  for (const row of rows) {
    const current = fragmentMap.get(row.knowledge_card_id) ?? [];
    current.push(row.fragment_id);
    fragmentMap.set(row.knowledge_card_id, current);
  }

  return fragmentMap;
}

async function getKnowledgeCardRecord(userId: number, cardId: number) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  return db.queryOne<{
    id: number;
    user_id: number;
    card_type: string;
    title: string;
    slug: string;
    summary: string | null;
    key_facts_json: string | string[] | null;
    open_questions_json: string | string[] | null;
    confidence_score: number;
    status: string;
    last_compiled_at: string | null;
    last_verified_at: string | null;
    created_at: string;
  }>(`SELECT * FROM knowledge_cards WHERE user_id IN (${placeholders}) AND id = ?`, [...scope.userIds, cardId]);
}

export async function compileKnowledgeCardFromFragments(
  userId: number,
  options: {
    fragmentIds?: number[];
    preferredTitle?: string | null;
    existingCardId?: number | null;
  } = {},
) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const fragments = await loadFragmentsForCompile(userId, options.fragmentIds);

  if (fragments.length === 0) {
    throw new Error("当前没有可编译的碎片");
  }

  const existingCard = options.existingCardId ? await getKnowledgeCardRecord(userId, options.existingCardId) : null;
  const primary = fragments[0];
  const title = options.preferredTitle || existingCard?.title || primary.title || primary.distilled_content.slice(0, 18) || "未命名主题档案";
  const slug = existingCard?.slug || `${slugify(title)}-${userId}`;
  const now = new Date().toISOString();
  const summary = fragments.map((fragment) => fragment.distilled_content).join("；").slice(0, 300);
  const keyFacts = fragments.slice(0, 4).map((fragment) => fragment.distilled_content);
  const consensus = analyzeKnowledgeConsensus(fragments);

  const scope = await getUserAccessScope(userId);
  const scopePlaceholders = scope.userIds.map(() => "?").join(", ");
  const existing =
    existingCard ||
    (await db.queryOne<{ id: number }>(
      `SELECT id FROM knowledge_cards WHERE user_id IN (${scopePlaceholders}) AND slug = ?`,
      [...scope.userIds, slug],
    ));
  let cardId = existing?.id;

  if (!cardId) {
    await db.exec(
      `INSERT INTO knowledge_cards (
        user_id, card_type, title, slug, summary, key_facts_json, open_questions_json, confidence_score, status, last_compiled_at, last_verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        pickCardType(primary),
        title,
        slug,
        summary,
        keyFacts,
        consensus.openQuestions,
        consensus.confidenceScore,
        consensus.status,
        now,
        now,
        now,
        now,
      ],
    );
    const inserted = await db.queryOne<{ id: number }>("SELECT id FROM knowledge_cards WHERE user_id = ? AND slug = ?", [userId, slug]);
    cardId = inserted?.id;
  } else {
    await db.exec(
      `UPDATE knowledge_cards
       SET card_type = ?, title = ?, summary = ?, key_facts_json = ?, open_questions_json = ?, confidence_score = ?, status = ?, last_compiled_at = ?, updated_at = ?
       WHERE id = ?`,
      [pickCardType(primary), title, summary, keyFacts, consensus.openQuestions, consensus.confidenceScore, consensus.status, now, now, cardId],
    );
    await db.exec("DELETE FROM knowledge_card_fragments WHERE knowledge_card_id = ?", [cardId]);
  }

  if (!cardId) {
    throw new Error("主题档案写入失败");
  }

  for (const fragment of fragments) {
    await db.exec(
      `INSERT INTO knowledge_card_fragments (knowledge_card_id, fragment_id, relation_type, evidence_weight, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [cardId, fragment.id, "evidence", 1, now],
    );
  }

  const revisionCount = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM knowledge_card_revisions WHERE knowledge_card_id = ?",
    [cardId],
  );
  await db.exec(
    `INSERT INTO knowledge_card_revisions (knowledge_card_id, revision_no, compiled_payload_json, change_summary, compiled_by_job_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      cardId,
      (revisionCount?.count ?? 0) + 1,
      {
        summary,
        keyFacts,
        openQuestions: consensus.openQuestions,
        sourceFragmentIds: fragments.map((fragment) => fragment.id),
        relatedCardIds: [],
        status: consensus.status,
        confidenceScore: consensus.confidenceScore,
      },
      consensus.changeSummary,
      null,
      now,
    ],
  );

  return getKnowledgeCardDetail(userId, cardId);
}

export async function getKnowledgeCards(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const cards = await db.query<Omit<KnowledgeCardListItem, "source_fragment_ids">>(
    `SELECT
       kc.*,
       (SELECT COUNT(*) FROM knowledge_card_fragments f WHERE f.knowledge_card_id = kc.id) as source_fragment_count
     FROM knowledge_cards kc
     WHERE kc.user_id IN (${placeholders})
     ORDER BY kc.updated_at DESC, kc.id DESC`,
    scope.userIds,
  );
  const fragmentMap = await loadKnowledgeCardSourceFragmentIds(cards.map((card) => card.id));
  return cards.map((card) => ({
    ...card,
    source_fragment_ids: fragmentMap.get(card.id) ?? [],
  }));
}

export async function getKnowledgeCardDetail(userId: number, cardId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const card = await getKnowledgeCardRecord(userId, cardId);
  if (!card) {
    return null;
  }

  const fragments = await db.query<{
    fragment_id: number;
    distilled_content: string;
  }>(
    `SELECT k.fragment_id, f.distilled_content
     FROM knowledge_card_fragments k
     INNER JOIN fragments f ON f.id = k.fragment_id
     WHERE k.knowledge_card_id = ?
     ORDER BY k.id ASC`,
    [cardId],
  );

  const relatedCards = await db.query<{ related_card_id: number }>(
    `SELECT
       CASE
         WHEN source_card_id = ? THEN target_card_id
         ELSE source_card_id
       END as related_card_id
     FROM knowledge_card_links
     WHERE source_card_id = ? OR target_card_id = ?
     ORDER BY id ASC`,
    [cardId, cardId, cardId],
  );

  const revisions = await db.query<{
    id: number;
    revision_no: number;
    change_summary: string | null;
    created_at: string;
  }>(
    `SELECT id, revision_no, change_summary, created_at
     FROM knowledge_card_revisions
     WHERE knowledge_card_id = ?
     ORDER BY revision_no DESC`,
    [cardId],
  );

  return {
    id: card.id,
    cardType: card.card_type,
    title: card.title,
    slug: card.slug,
    summary: card.summary,
    keyFacts: parseList(card.key_facts_json),
    openQuestions: parseList(card.open_questions_json),
    sourceFragmentIds: fragments.map((fragment) => fragment.fragment_id),
    relatedCardIds: relatedCards.map((item) => item.related_card_id),
    sourceFragments: fragments.map((fragment) => ({
      id: fragment.fragment_id,
      distilledContent: fragment.distilled_content,
    })),
    confidenceScore: card.confidence_score,
    status: card.status,
    lastCompiledAt: card.last_compiled_at,
    lastVerifiedAt: card.last_verified_at,
    createdAt: card.created_at,
    revisions,
  };
}

export async function getRelevantKnowledgeCardsForDocument(
  userId: number,
  input: {
    documentTitle: string;
    markdownContent: string;
    nodeTitles?: string[];
    attachedFragmentIds?: number[];
    limit?: number;
  },
) {
  const attachedFragmentIds = Array.from(new Set((input.attachedFragmentIds ?? []).filter(Boolean)));
  const tokens = tokenizeSearchText([input.documentTitle, input.markdownContent, ...(input.nodeTitles ?? [])].join(" "));
  const cards = await getKnowledgeCards(userId);

  const ranked = cards
    .map((card) => ({
      card,
      relevanceScore: scoreKnowledgeCard(card, { attachedFragmentIds, tokens }),
    }))
    .filter((item) => item.relevanceScore > 0)
    .sort((left, right) => right.relevanceScore - left.relevanceScore || right.card.confidence_score - left.card.confidence_score || right.card.id - left.card.id)
    .slice(0, input.limit ?? 4);

  const details = await Promise.all(ranked.map((item) => getKnowledgeCardDetail(userId, item.card.id)));
  return ranked
    .map((item, index) => {
      const detail = details[index] as KnowledgeCardDetail;
      if (!detail) {
        return null;
      }
      const overlapCount = detail.sourceFragmentIds.filter((fragmentId) => attachedFragmentIds.includes(fragmentId)).length;
      return {
        ...detail,
        relevanceScore: item.relevanceScore,
        matchedFragmentCount: overlapCount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function getAdminKnowledgeCards() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const cards = await db.query<Omit<AdminKnowledgeCardListItem, "source_fragment_ids">>(
    `SELECT
       kc.*,
       u.username,
       (SELECT COUNT(*) FROM knowledge_card_fragments f WHERE f.knowledge_card_id = kc.id) as source_fragment_count,
       (SELECT COUNT(*) FROM knowledge_card_revisions r WHERE r.knowledge_card_id = kc.id) as revision_count
     FROM knowledge_cards kc
     LEFT JOIN users u ON u.id = kc.user_id
     ORDER BY
       CASE kc.status
         WHEN 'conflicted' THEN 0
         WHEN 'stale' THEN 1
         WHEN 'draft' THEN 2
         ELSE 3
       END ASC,
       kc.updated_at DESC,
       kc.id DESC`,
  );
  const fragmentMap = await loadKnowledgeCardSourceFragmentIds(cards.map((card) => card.id));
  return cards.map((card) => ({
    ...card,
    source_fragment_ids: fragmentMap.get(card.id) ?? [],
  }));
}

export async function getAdminKnowledgeCardRevisions(cardId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<{
    id: number;
    revision_no: number;
    compiled_payload_json: string | Record<string, unknown> | null;
    change_summary: string | null;
    created_at: string;
  }>(
    `SELECT id, revision_no, compiled_payload_json, change_summary, created_at
     FROM knowledge_card_revisions
     WHERE knowledge_card_id = ?
     ORDER BY revision_no DESC`,
    [cardId],
  );
}

export async function updateKnowledgeCardStatus(cardId: number, status: KnowledgeCardStatus) {
  await ensureExtendedProductSchema();
  if (!["draft", "active", "conflicted", "stale", "archived"].includes(status)) {
    throw new Error("无效的主题档案状态");
  }
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("UPDATE knowledge_cards SET status = ?, updated_at = ? WHERE id = ?", [status, now, cardId]);
  const updated = await db.queryOne<{
    id: number;
    status: string;
    updated_at: string;
  }>("SELECT id, status, updated_at FROM knowledge_cards WHERE id = ?", [cardId]);
  if (!updated) {
    throw new Error("主题档案不存在");
  }
  return updated;
}

export async function rebuildKnowledgeCard(cardId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const card = await db.queryOne<{
    id: number;
    user_id: number;
    title: string;
  }>("SELECT id, user_id, title FROM knowledge_cards WHERE id = ?", [cardId]);
  if (!card) {
    throw new Error("主题档案不存在");
  }

  const sourceFragments = await db.query<{ fragment_id: number }>(
    "SELECT fragment_id FROM knowledge_card_fragments WHERE knowledge_card_id = ? ORDER BY id ASC",
    [cardId],
  );

  return compileKnowledgeCardFromFragments(card.user_id, {
    existingCardId: card.id,
    preferredTitle: card.title,
    fragmentIds: sourceFragments.map((item) => item.fragment_id),
  });
}

export const rebuildKnowledgeCardByAdmin = rebuildKnowledgeCard;
