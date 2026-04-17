import { attachFragmentToArticleNode, getArticleNodes } from "./article-outline";
import { createFragment } from "./repositories";
import { distillCaptureInput } from "./distill";
import { fetchExternalText } from "./external-fetch";

function uniqueStrings(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function resolveSearchEndpoint(query: string) {
  const template = String(process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT || "").trim();
  if (!template) {
    return null;
  }
  if (template.includes("{q}")) {
    return template.replaceAll("{q}", encodeURIComponent(query));
  }
  return `${template}${template.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`;
}

function normalizeCandidateUrl(value: string, baseUrl: string) {
  const normalized = decodeHtml(value).trim();
  if (!normalized || normalized.startsWith("#") || normalized.startsWith("javascript:")) {
    return null;
  }
  try {
    const resolved = new URL(normalized, baseUrl);
    const redirected = resolved.searchParams.get("uddg");
    const finalUrl = redirected ? decodeURIComponent(redirected) : resolved.toString();
    if (!/^https?:\/\//i.test(finalUrl)) {
      return null;
    }
    return finalUrl;
  } catch {
    return null;
  }
}

function parseSearchResultUrls(html: string, baseUrl: string) {
  const anchorMatches = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const candidates = anchorMatches
    .map((match) => {
      const url = normalizeCandidateUrl(match[1] || "", baseUrl);
      const label = stripTags(match[2] || "");
      if (!url) {
        return null;
      }
      return {
        url,
        label,
      };
    })
    .filter(Boolean) as Array<{ url: string; label: string }>;
  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return Array.from(
    new Map(
      candidates
        .filter((item) => {
          try {
            const host = new URL(item.url).hostname.replace(/^www\./, "");
            return host !== baseHost || item.url.includes("/api/tools/mock-research-source/");
          } catch {
            return false;
          }
        })
        .map((item) => [item.url, item] as const),
    ).values(),
  );
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
  const searchUrl = resolveSearchEndpoint(query);
  if (!searchUrl) {
    return {
      attempted: false,
      query,
      searchUrl: null,
      discovered: [] as string[],
      error: null as string | null,
    };
  }
  try {
    const response = await fetchExternalText({
      url: searchUrl,
      timeoutMs: 15_000,
      maxAttempts: 2,
      cache: "no-store",
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
    });
    return {
      attempted: true,
      query,
      searchUrl,
      discovered: parseSearchResultUrls(response.text, response.finalUrl || searchUrl)
        .map((item) => item.url)
        .slice(0, input.limit),
      error: null as string | null,
    };
  } catch (error) {
    return {
      attempted: true,
      query,
      searchUrl,
      discovered: [] as string[],
      error: error instanceof Error ? error.message : "研究补源搜索失败",
    };
  }
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

  for (const [index, url] of candidateUrls.entries()) {
    try {
      const distilled = await distillCaptureInput({
        sourceType: "url",
        title: null,
        url,
      });
      const fragment = await createFragment({
        userId: input.userId,
        sourceType: "url",
        title: distilled.title,
        rawContent: distilled.rawContent,
        distilledContent: distilled.distilledContent,
        sourceUrl: distilled.sourceUrl || url,
      });
      if (!fragment?.id) {
        skipped.push(url);
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
        sourceUrl: String(fragment.source_url || distilled.sourceUrl || url).trim() || null,
      });
    } catch (error) {
      failed.push({
        url,
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
