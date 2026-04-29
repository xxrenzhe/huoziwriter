import { getDatabase } from "./db";
import { buildRetrievalQueryContext, scoreUnifiedRetrievalCandidate } from "./retrieval-ranking";
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

function buildBridgeSentence(currentTitle: string, candidateTitle: string) {
  return `前面我在《${candidateTitle}》里已经提过这个问题的另一面，这次想把它放回“${currentTitle}”的语境里继续说透。`;
}

function buildSeriesLabel(currentTitle: string, candidateTitle: string) {
  const shared = tokenize(currentTitle).filter((token) => tokenize(candidateTitle).includes(token) && token.length >= 2);
  if (shared.length === 0) {
    return "跨主题补充";
  }
  return `系列线索：${shared.slice(0, 2).join(" / ")}`;
}

export async function suggestArticleHistoryReferences(input: {
  userId: number;
  articleId: number;
  currentTitle: string;
  currentMarkdown: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const query = buildRetrievalQueryContext({
    articleTitle: input.currentTitle,
    markdownContent: input.currentMarkdown,
  });
  const candidates = await db.query<SuggestionCandidate>(
    `SELECT id, title, markdown_content, updated_at
     FROM articles
     WHERE user_id = ? AND status = ? AND id != ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 24`,
    [input.userId, "published", input.articleId],
  );

  return candidates
    .map((candidate) => {
      const ranking = scoreUnifiedRetrievalCandidate(query, {
        title: candidate.title,
        content: candidate.markdown_content,
        updatedAt: candidate.updated_at,
      });
      return {
        referencedArticleId: candidate.id,
        title: candidate.title,
        relationReason:
          ranking.semanticScore >= 0.42
            ? "语义相近且判断线连续，适合在正文里自然承接，并帮助保持系列口径一致。"
            : ranking.score >= 24
              ? "主题重叠明显，可作为旧判断的补充背景，避免这篇文章重新铺垫全部上下文。"
              : "存在可回带的议题交集，适合作为轻量旧文锚点。",
        bridgeSentence: buildBridgeSentence(input.currentTitle, candidate.title),
        seriesLabel: buildSeriesLabel(input.currentTitle, candidate.title),
        consistencyHint:
          ranking.directTitleHits > 0
            ? "当前标题与旧文存在直接主题重合，写作时要统一术语和结论口径。"
            : ranking.semanticScore >= 0.42
              ? "虽然标题不同，但判断线连续，适合在正文里说明“这次补了什么新变量”。"
              : "更适合作为背景回带，而不是主论点支撑。",
        score: ranking.score,
      };
    })
    .filter((item) => item.score >= 8)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
}

export async function getSavedArticleHistoryReferences(articleId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    referenced_article_id: number;
    title: string;
    relation_reason: string | null;
    bridge_sentence: string | null;
    sort_order: number;
  }>(
    `SELECT r.referenced_article_id AS referenced_article_id, d.title, r.relation_reason, r.bridge_sentence, r.sort_order
     FROM article_reference_articles r
     INNER JOIN articles d ON d.id = r.referenced_article_id
     WHERE r.article_id = ?
     ORDER BY r.sort_order ASC, r.id ASC`,
    [articleId],
  );
  return rows.map((item) => ({
    referencedArticleId: item.referenced_article_id,
    title: item.title,
    relationReason: item.relation_reason,
    bridgeSentence: item.bridge_sentence,
    sortOrder: item.sort_order,
  }));
}

export async function replaceArticleHistoryReferences(input: {
  userId: number;
  articleId: number;
  references: Array<{
    referencedArticleId: number;
    relationReason?: string | null;
    bridgeSentence?: string | null;
  }>;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.exec("DELETE FROM article_reference_articles WHERE article_id = ?", [input.articleId]);
  const nextRefs = input.references.slice(0, 2);
  const now = new Date().toISOString();
  for (const [index, reference] of nextRefs.entries()) {
    await db.exec(
      `INSERT INTO article_reference_articles (
        article_id, referenced_article_id, relation_reason, bridge_sentence, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.articleId,
        reference.referencedArticleId,
        reference.relationReason ?? null,
        reference.bridgeSentence ?? null,
        index + 1,
        now,
        now,
      ],
    );
  }
  return getSavedArticleHistoryReferences(input.articleId);
}
