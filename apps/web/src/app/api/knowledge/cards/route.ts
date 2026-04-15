import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getKnowledgeCards } from "@/lib/knowledge";

function parseConflictFlags(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const cards = await getKnowledgeCards(session.userId);
  return ok(
    cards.map((card) => ({
      id: card.id,
      cardType: card.card_type,
      title: card.title,
      slug: card.slug,
      summary: card.summary,
      conflictFlags: parseConflictFlags(card.conflict_flags_json),
      latestChangeSummary: card.latest_change_summary,
      overturnedJudgements: parseConflictFlags(card.overturned_judgements_json),
      sourceFragmentIds: card.source_fragment_ids,
      confidenceScore: card.confidence_score,
      status: card.status,
      lastCompiledAt: card.last_compiled_at,
      lastVerifiedAt: card.last_verified_at,
      sourceFragmentCount: card.source_fragment_count,
      createdAt: card.created_at,
    })),
  );
}
