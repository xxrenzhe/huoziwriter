import { getDocumentNodes } from "./document-outline";
import { getRelevantKnowledgeCardsForDocument } from "./knowledge";
import { getFragmentsByUser } from "./repositories";

type OutlineNodeContext = {
  title: string;
  description: string | null;
};

type KnowledgeCardContext = {
  id: number;
  title: string;
  summary: string | null;
  keyFacts: string[];
  openQuestions: string[];
  status: string;
  confidenceScore: number;
  matchedFragmentCount: number;
};

export async function getDocumentWritingContext(input: {
  userId: number;
  documentId: number;
  title: string;
  markdownContent: string;
}) {
  const nodes = await getDocumentNodes(input.documentId);
  const attachedFragments = Array.from(
    new Map(
      nodes
        .flatMap((node) => node.fragments)
        .map((fragment) => [fragment.id, fragment.distilledContent] as const),
    ).entries(),
  ).map(([id, distilledContent]) => ({ id, distilledContent }));

  const knowledgeCards = await getRelevantKnowledgeCardsForDocument(input.userId, {
    documentTitle: input.title,
    markdownContent: input.markdownContent,
    nodeTitles: nodes.map((node) => node.title),
    attachedFragmentIds: attachedFragments.map((fragment) => fragment.id),
  });

  let fragments = attachedFragments.map((fragment) => fragment.distilledContent);
  if (fragments.length === 0) {
    const fallbackFragments = await getFragmentsByUser(input.userId);
    fragments = fallbackFragments.slice(0, 6).map((fragment) => fragment.distilled_content);
  }

  return {
    fragments,
    outlineNodes: nodes.map<OutlineNodeContext>((node) => ({
      title: node.title,
      description: node.description,
    })),
    knowledgeCards: knowledgeCards.map<KnowledgeCardContext>((card) => ({
      id: card.id,
      title: card.title,
      summary: card.summary,
      keyFacts: card.keyFacts,
      openQuestions: card.openQuestions,
      status: card.status,
      confidenceScore: card.confidenceScore,
      matchedFragmentCount: card.matchedFragmentCount,
    })),
  };
}
