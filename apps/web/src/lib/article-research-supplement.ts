import { attachFragmentToArticleNode, getArticleNodes } from "./article-outline";
import { createFragment } from "./repositories";
import { distillCaptureInput } from "./distill";
import { searchResearchSources } from "./research-source-search";

function uniqueStrings(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

async function discoverSearchUrls(input: {
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  limit: number;
}) {
  const query = uniqueStrings(
    [
      input.articleTitle,
      input.knowledgeCards[0]?.title,
      input.knowledgeCards[1]?.title,
      input.outlineNodes[0]?.title,
      input.outlineNodes[1]?.title,
    ],
    5,
  ).join(" ");
  const searchResult = await searchResearchSources({
    query,
    limit: input.limit,
  });
  return {
    attempted: searchResult.attempted,
    query,
    searchUrl: searchResult.searchUrl,
    discovered: searchResult.results.map((item) => item.url).slice(0, input.limit),
    error: searchResult.error,
  };
}

function buildQuerySeeds(input: {
  articleTitle: string;
  evidenceFragments: Array<{ sourceUrl: string | null; sourceType: string }>;
}) {
  const seedUrls = uniqueStrings(
    input.evidenceFragments.map((item) => item.sourceUrl),
    3,
  );
  return {
    seedUrls,
  };
}

export async function supplementArticleResearchSources(input: {
  articleId: number;
  userId: number;
  articleTitle: string;
  evidenceFragments: Array<{
    sourceType: string;
    sourceUrl: string | null;
  }>;
  knowledgeCards: Array<{
    title: string;
    summary?: string | null;
  }>;
  outlineNodes: Array<{
    title: string;
    description?: string | null;
  }>;
}) {
  const { seedUrls } = buildQuerySeeds({
    articleTitle: input.articleTitle,
    evidenceFragments: input.evidenceFragments,
  });
  const nodes = await getArticleNodes(input.articleId);
  const existingAttachedUrls = new Set(
    nodes
      .flatMap((node) => node.fragments)
      .filter((fragment) => String(fragment.sourceType || "") === "url")
      .map((fragment) => String(fragment.sourceUrl || "").trim())
      .filter(Boolean),
  );
  const searchResult = await discoverSearchUrls({
    articleTitle: input.articleTitle,
    knowledgeCards: input.knowledgeCards,
    outlineNodes: input.outlineNodes,
    limit: 3,
  });
  const candidateUrls = uniqueStrings([
    ...seedUrls,
    ...searchResult.discovered,
  ], 4).filter((url) => !existingAttachedUrls.has(url));
  const targetNodes = nodes.slice(0, Math.min(3, nodes.length));
  const attached: Array<{
    fragmentId: number;
    nodeId: number;
    title: string;
    sourceUrl: string | null;
  }> = [];
  const failed: Array<{ url: string; error: string }> = [];
  const skipped: string[] = [];

  if (targetNodes.length === 0) {
    return {
      attempted: seedUrls.length > 0 || searchResult.attempted,
      query: searchResult.query,
      searchUrl: searchResult.searchUrl,
      discoveredUrls: candidateUrls,
      attached,
      skipped,
      failed,
      searchError: searchResult.error,
    };
  }

  const distilledResults = await Promise.all(
    candidateUrls.map(async (url) => {
      try {
        const distilled = await distillCaptureInput({
          sourceType: "url",
          title: null,
          url,
        });
        return {
          url,
          distilled,
          error: null,
        };
      } catch (error) {
        return {
          url,
          distilled: null,
          error: error instanceof Error ? error.message : "研究补源抓取失败",
        };
      }
    }),
  );

  for (const [index, result] of distilledResults.entries()) {
    if (result.error || !result.distilled) {
      failed.push({
        url: result.url,
        error: result.error || "研究补源抓取失败",
      });
      continue;
    }
    try {
      const distilled = result.distilled;
      const fragment = await createFragment({
        userId: input.userId,
        sourceType: "url",
        title: distilled.title,
        rawContent: distilled.rawContent,
        distilledContent: distilled.distilledContent,
        sourceUrl: distilled.sourceUrl || result.url,
      });
      if (!fragment?.id) {
        skipped.push(result.url);
        continue;
      }
      const targetNode = targetNodes[index % targetNodes.length];
      await attachFragmentToArticleNode({
        articleId: input.articleId,
        nodeId: targetNode.id,
        fragmentId: Number(fragment.id),
        usageMode: "rewrite",
      });
      attached.push({
        fragmentId: Number(fragment.id),
        nodeId: targetNode.id,
        title: String(fragment.title || distilled.title || "").trim(),
        sourceUrl: String(fragment.source_url || distilled.sourceUrl || result.url).trim() || null,
      });
    } catch (error) {
      failed.push({
        url: result.url,
        error: error instanceof Error ? error.message : "研究补源抓取失败",
      });
    }
  }

  return {
    attempted: seedUrls.length > 0 || searchResult.attempted,
    query: searchResult.query,
    searchUrl: searchResult.searchUrl,
    discoveredUrls: candidateUrls,
    attached,
    skipped,
    failed,
    searchError: searchResult.error,
  };
}
