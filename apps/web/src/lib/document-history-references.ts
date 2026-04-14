import { getDatabase } from "./db";
import { scoreSemanticMatch } from "./semantic-search";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

type SuggestionCandidate = {
  id: number;
  title: string;
  markdown_content: string;
  updated_at: string;
};

function tokenize(value: string) {
  return Array.from(new Set((value.toLowerCase().match(/[\u4e00-\u9fa5]{1,}|[a-z0-9]{2,}/g) ?? []).filter(Boolean)));
}

function countDirectTitleHits(currentTitle: string, candidateTitle: string) {
  const currentTokens = tokenize(currentTitle).filter((token) => token.length >= 2);
  const candidateTokens = new Set(tokenize(candidateTitle).filter((token) => token.length >= 2));
  return currentTokens.filter((token) => candidateTokens.has(token)).length;
}

function scoreCandidate(input: {
  currentTitle: string;
  currentMarkdown: string;
  candidate: SuggestionCandidate;
}) {
  const currentTokens = tokenize(`${input.currentTitle} ${input.currentMarkdown}`);
  const candidateTokens = tokenize(`${input.candidate.title} ${input.candidate.markdown_content}`);
  const overlap = candidateTokens.filter((token) => currentTokens.includes(token)).length;
  const longTokenOverlap = candidateTokens.filter((token) => token.length >= 3 && currentTokens.includes(token)).length;
  const semanticScore = scoreSemanticMatch(
    `${input.currentTitle}\n${input.currentMarkdown.slice(0, 2200)}`,
    `${input.candidate.title}\n${input.candidate.markdown_content.slice(0, 3200)}`,
  );
  const directTitleHits = countDirectTitleHits(input.currentTitle, input.candidate.title);
  const recencyBoost = Math.max(0, 30 - Math.floor((Date.now() - new Date(input.candidate.updated_at).getTime()) / (1000 * 60 * 60 * 24)));
  return overlap * 2 + longTokenOverlap * 3 + directTitleHits * 5 + semanticScore * 20 + recencyBoost;
}

function buildBridgeSentence(currentTitle: string, candidateTitle: string) {
  return `前面我在《${candidateTitle}》里已经提过这个问题的另一面，这次想把它放回“${currentTitle}”的语境里继续说透。`;
}

export async function suggestDocumentHistoryReferences(input: {
  userId: number;
  documentId: number;
  currentTitle: string;
  currentMarkdown: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const candidates = await db.query<SuggestionCandidate>(
    `SELECT id, title, markdown_content, updated_at
     FROM documents
     WHERE user_id = ? AND status = ? AND id != ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 24`,
    [input.userId, "published", input.documentId],
  );

  return candidates
    .map((candidate) => {
      const score = scoreCandidate({
        currentTitle: input.currentTitle,
        currentMarkdown: input.currentMarkdown,
        candidate,
      });
      const semanticScore = scoreSemanticMatch(
        `${input.currentTitle}\n${input.currentMarkdown.slice(0, 2200)}`,
        `${candidate.title}\n${candidate.markdown_content.slice(0, 3200)}`,
      );
      return {
        referencedDocumentId: candidate.id,
        title: candidate.title,
        relationReason:
          semanticScore >= 0.42
            ? "语义相近且判断线连续，适合在正文里自然承接。"
            : score >= 24
              ? "主题重叠明显，可作为旧判断的补充背景。"
              : "存在可回带的议题交集，适合作为轻量旧文锚点。",
        bridgeSentence: buildBridgeSentence(input.currentTitle, candidate.title),
        score,
      };
    })
    .filter((item) => item.score >= 8)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
}

export async function getSavedDocumentHistoryReferences(documentId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<{
    referenced_document_id: number;
    title: string;
    relation_reason: string | null;
    bridge_sentence: string | null;
    sort_order: number;
  }>(
    `SELECT r.referenced_document_id, d.title, r.relation_reason, r.bridge_sentence, r.sort_order
     FROM document_reference_articles r
     INNER JOIN documents d ON d.id = r.referenced_document_id
     WHERE r.document_id = ?
     ORDER BY r.sort_order ASC, r.id ASC`,
    [documentId],
  );
}

export async function replaceDocumentHistoryReferences(input: {
  userId: number;
  documentId: number;
  references: Array<{
    referencedDocumentId: number;
    relationReason?: string | null;
    bridgeSentence?: string | null;
  }>;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.exec("DELETE FROM document_reference_articles WHERE document_id = ?", [input.documentId]);
  const nextRefs = input.references.slice(0, 2);
  const now = new Date().toISOString();
  for (const [index, reference] of nextRefs.entries()) {
    await db.exec(
      `INSERT INTO document_reference_articles (
        document_id, referenced_document_id, relation_reason, bridge_sentence, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.documentId,
        reference.referencedDocumentId,
        reference.relationReason ?? null,
        reference.bridgeSentence ?? null,
        index + 1,
        now,
        now,
      ],
    );
  }
  return getSavedDocumentHistoryReferences(input.documentId);
}
