import { KnowledgeGovernanceClient } from "@/components/knowledge-client";
import { getOpsKnowledgeCards } from "@/lib/knowledge";
import { requireOpsSession } from "@/lib/page-auth";

function parseStringList(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export default async function OpsKnowledgePage() {
  await requireOpsSession();
  const cards = await getOpsKnowledgeCards();

  return (
    <KnowledgeGovernanceClient
      cards={cards.map((card) => ({
        id: card.id,
        username: card.username,
        title: card.title,
        cardType: card.card_type,
        summary: card.summary,
        conflictFlags: parseStringList(card.conflict_flags_json),
        confidenceScore: card.confidence_score,
        status: card.status,
        lastCompiledAt: card.last_compiled_at,
        sourceFragmentCount: card.source_fragment_count,
        revisionCount: card.revision_count,
      }))}
    />
  );
}
