import { getDocumentNodes } from "./document-outline";
import { getRelevantKnowledgeCardsForDocument } from "./knowledge";
import { getFragmentsByUser } from "./repositories";

type OutlineNodeContext = {
  title: string;
  description: string | null;
};

type EvidenceFragmentContext = {
  id: number;
  title: string | null;
  distilledContent: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  usageMode: string;
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
        .map((fragment) => [
          fragment.id,
          {
            id: fragment.id,
            title: "title" in fragment ? (fragment.title as string | null) : null,
            distilledContent: fragment.distilledContent,
            sourceType: "sourceType" in fragment ? String(fragment.sourceType || "manual") : "manual",
            sourceUrl: "sourceUrl" in fragment ? (fragment.sourceUrl as string | null) : null,
            screenshotPath: "screenshotPath" in fragment ? (fragment.screenshotPath as string | null) : null,
            usageMode: "usageMode" in fragment ? String(fragment.usageMode || "rewrite") : "rewrite",
          },
        ] as const),
    ).entries(),
  ).map(([, fragment]) => fragment);

  const knowledgeCards = await getRelevantKnowledgeCardsForDocument(input.userId, {
    documentTitle: input.title,
    markdownContent: input.markdownContent,
    nodeTitles: nodes.map((node) => node.title),
    attachedFragmentIds: attachedFragments.map((fragment) => fragment.id),
  });

  let fragments = attachedFragments.filter((fragment) => fragment.usageMode !== "image").map((fragment) => fragment.distilledContent);
  let evidenceFragments = attachedFragments;
  if (fragments.length === 0) {
    const fallbackFragments = await getFragmentsByUser(input.userId);
    fragments = fallbackFragments
      .filter((fragment) => fragment.source_type !== "screenshot")
      .slice(0, 6)
      .map((fragment) => fragment.distilled_content);
    evidenceFragments = fallbackFragments.slice(0, 8).map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilled_content,
      sourceType: fragment.source_type,
      sourceUrl: fragment.source_url,
      screenshotPath: fragment.screenshot_path,
      usageMode: fragment.source_type === "screenshot" ? "image" : "rewrite",
    }));
  }

  return {
    fragments,
    evidenceFragments: evidenceFragments.map<EvidenceFragmentContext>((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilledContent,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
      screenshotPath: fragment.screenshotPath,
      usageMode: fragment.usageMode,
    })),
    imageFragments: evidenceFragments
      .filter((fragment) => fragment.usageMode === "image" && fragment.screenshotPath)
      .map((fragment) => ({
        id: fragment.id,
        title: fragment.title,
        screenshotPath: fragment.screenshotPath,
      })),
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
