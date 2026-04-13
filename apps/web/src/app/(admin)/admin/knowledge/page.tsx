import { KnowledgeGovernanceClient } from "@/components/knowledge-client";
import { getAdminKnowledgeCards } from "@/lib/knowledge";
import { requireAdminSession } from "@/lib/page-auth";

export default async function AdminKnowledgePage() {
  await requireAdminSession();
  const cards = await getAdminKnowledgeCards();

  return (
    <KnowledgeGovernanceClient
      cards={cards.map((card) => ({
        id: card.id,
        username: card.username,
        title: card.title,
        cardType: card.card_type,
        summary: card.summary,
        confidenceScore: card.confidence_score,
        status: card.status,
        lastCompiledAt: card.last_compiled_at,
        sourceFragmentCount: card.source_fragment_count,
        revisionCount: card.revision_count,
      }))}
    />
  );
}
