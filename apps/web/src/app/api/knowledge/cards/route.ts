import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getKnowledgeCards } from "@/lib/knowledge";

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
