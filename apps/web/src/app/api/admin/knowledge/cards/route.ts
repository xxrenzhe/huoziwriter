import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAdminKnowledgeCards } from "@/lib/knowledge";

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
  try {
    await requireAdminAccess();
    const cards = await getAdminKnowledgeCards();
    return ok(
      cards.map((card) => ({
        id: card.id,
        userId: card.user_id,
        username: card.username,
        cardType: card.card_type,
        title: card.title,
        summary: card.summary,
        conflictFlags: parseConflictFlags(card.conflict_flags_json),
        sourceFragmentIds: card.source_fragment_ids,
        confidenceScore: card.confidence_score,
        status: card.status,
        lastCompiledAt: card.last_compiled_at,
        lastVerifiedAt: card.last_verified_at,
        sourceFragmentCount: card.source_fragment_count,
        revisionCount: card.revision_count,
        createdAt: card.created_at,
        updatedAt: card.updated_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}
