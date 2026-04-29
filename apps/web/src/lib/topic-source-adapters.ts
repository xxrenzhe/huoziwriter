import { fetchExternalText } from "./external-fetch";
import {
  inferChineseHotspotProvider,
  mapChineseHotspotItemsToCandidates,
  parseChineseHotspotPayload,
} from "./chinese-hotspot-sources";
import { searchRecentXPosts, type XApiMedia, type XApiPost, type XApiUser } from "./x-api";
import { resolveXSourceSeed } from "./x-source-registry";

export type FetchedTopicCandidate = {
  title: string;
  sourceUrl: string | null;
  summary?: string | null;
  publishedAt?: string | null;
  sourceMeta?: Record<string, unknown> | null;
};

type TopicSourceAdapterInput = {
  name: string;
  homepageUrl: string;
  sourceType?: string | null;
  limit: number;
};

type HackerNewsStory = {
  id?: number;
  title?: string;
  url?: string;
  text?: string;
  time?: number;
  type?: string;
};

type RemotiveJob = {
  title?: string;
  url?: string;
  company_name?: string;
  category?: string;
  publication_date?: string;
  candidate_required_location?: string;
  job_type?: string;
  salary?: string | null;
};

type V2exTopic = {
  id?: number;
  title?: string;
  url?: string;
  content?: string;
  content_rendered?: string;
  replies?: number;
  created?: number;
  last_touched?: number;
  node?: {
    name?: string;
    title?: string;
  };
  member?: {
    username?: string;
  };
};

function decodeHtml(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function uniqueCandidates(items: FetchedTopicCandidate[]) {
  const seen = new Set<string>();
  const deduped: FetchedTopicCandidate[] = [];
  for (const item of items) {
    const title = String(item.title || "").trim();
    if (!title) continue;
    const key = `${title.toLowerCase()}::${String(item.sourceUrl || "").trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      title,
      sourceUrl: item.sourceUrl ? String(item.sourceUrl).trim() : null,
      summary: item.summary ? String(item.summary).trim() : null,
      publishedAt: item.publishedAt ? String(item.publishedAt).trim() : null,
      sourceMeta: item.sourceMeta && typeof item.sourceMeta === "object" && !Array.isArray(item.sourceMeta) ? item.sourceMeta : null,
    });
  }
  return deduped;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function asIsoDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toAbsoluteUrl(baseUrl: string, href: string | null | undefined) {
  const value = String(href || "").trim();
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseRssItems(xml: string, baseUrl: string, limit: number) {
  const items = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .map((match) => match[0])
    .slice(0, limit * 2)
    .map((block) => {
      const title = decodeHtml((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
      const link = decodeHtml((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim());
      const description = block.match(/<(?:description|content:encoded)>([\s\S]*?)<\/(?:description|content:encoded)>/i)?.[1] || "";
      const pubDate = decodeHtml((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim());
      if (!title) return null;
      return {
        title,
        sourceUrl: toAbsoluteUrl(baseUrl, link) || link || baseUrl,
        summary: stripHtml(description).slice(0, 240) || null,
        publishedAt: asIsoDate(pubDate),
      } satisfies FetchedTopicCandidate;
    })
    .filter(isPresent);
  return uniqueCandidates(items).slice(0, limit);
}

function parseAtomEntries(xml: string, baseUrl: string, limit: number) {
  const entries = Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi))
    .map((match) => match[0])
    .slice(0, limit * 2)
    .map((block) => {
      const title = decodeHtml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
      const href =
        block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1]
        || block.match(/<id>([\s\S]*?)<\/id>/i)?.[1]
        || "";
      const summary =
        block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
        || block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1]
        || "";
      const published =
        block.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1]
        || block.match(/<published>([\s\S]*?)<\/published>/i)?.[1]
        || "";
      if (!title) return null;
      return {
        title,
        sourceUrl: toAbsoluteUrl(baseUrl, decodeHtml(href).trim()) || decodeHtml(href).trim() || baseUrl,
        summary: stripHtml(summary).slice(0, 240) || null,
        publishedAt: asIsoDate(decodeHtml(published).trim()),
      } satisfies FetchedTopicCandidate;
    })
    .filter(isPresent);
  return uniqueCandidates(entries).slice(0, limit);
}

async function fetchRssFeedTopics(input: TopicSourceAdapterInput) {
  const response = await fetchExternalText({
    url: input.homepageUrl,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
    accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5",
  });
  const xml = response.text;
  const baseUrl = response.finalUrl || input.homepageUrl;
  const rssItems = parseRssItems(xml, baseUrl, input.limit);
  if (rssItems.length > 0) {
    return rssItems;
  }
  return parseAtomEntries(xml, baseUrl, input.limit);
}

async function fetchHackerNewsTopics(input: TopicSourceAdapterInput) {
  const response = await fetchExternalText({
    url: input.homepageUrl,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
    accept: "application/json,text/json;q=0.9,*/*;q=0.5",
  });
  const ids = JSON.parse(response.text) as number[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return [] as FetchedTopicCandidate[];
  }
  const stories = await Promise.all(
    ids.slice(0, Math.max(input.limit * 2, 10)).map(async (id) => {
      const itemResponse = await fetchExternalText({
        url: `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        timeoutMs: 20_000,
        maxAttempts: 2,
        cache: "no-store",
        accept: "application/json,text/json;q=0.9,*/*;q=0.5",
      });
      return JSON.parse(itemResponse.text) as HackerNewsStory;
    }),
  );

  return uniqueCandidates(
    stories
      .map((story) => {
        const title = String(story.title || "").trim();
        if (!title) return null;
        return {
          title,
          sourceUrl: toAbsoluteUrl("https://news.ycombinator.com/", story.url || `item?id=${story.id || ""}`),
          summary: stripHtml(String(story.text || "")).slice(0, 240) || "Hacker News 热门讨论",
          publishedAt: story.time ? new Date(story.time * 1000).toISOString() : null,
        } satisfies FetchedTopicCandidate;
      })
      .filter(isPresent),
  ).slice(0, input.limit);
}

async function fetchRemotiveTopics(input: TopicSourceAdapterInput) {
  const response = await fetchExternalText({
    url: input.homepageUrl,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
    accept: "application/json,text/json;q=0.9,*/*;q=0.5",
  });
  const payload = JSON.parse(response.text) as { jobs?: RemotiveJob[] };
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  return uniqueCandidates(
    jobs.map((job) => {
      const title = String(job.title || "").trim();
      if (!title) return null;
      const company = String(job.company_name || "").trim();
      const category = String(job.category || "").trim();
      const location = String(job.candidate_required_location || "").trim();
      const salary = String(job.salary || "").trim();
      const jobType = String(job.job_type || "").trim();
      const summary = [company, category, location, jobType, salary]
        .filter(Boolean)
        .join(" · ");
      return {
        title: company ? `${title} · ${company}` : title,
        sourceUrl: toAbsoluteUrl("https://remotive.com/", job.url || null),
        summary: summary || "Remotive 远程岗位",
        publishedAt: asIsoDate(job.publication_date),
      } satisfies FetchedTopicCandidate;
    }).filter(isPresent),
  ).slice(0, input.limit);
}

async function fetchV2exTopics(input: TopicSourceAdapterInput) {
  const response = await fetchExternalText({
    url: input.homepageUrl,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
    accept: "application/json,text/json;q=0.9,*/*;q=0.5",
    headers: {
      Referer: "https://www.v2ex.com/",
    },
  });
  const payload = JSON.parse(response.text) as V2exTopic[];
  const topics = Array.isArray(payload) ? payload : [];
  return uniqueCandidates(
    topics
      .map((topic) => {
        const title = String(topic.title || "").trim();
        if (!title) return null;
        const nodeTitle = String(topic.node?.title || topic.node?.name || "").trim();
        const author = String(topic.member?.username || "").trim();
        const replyCount = Number(topic.replies || 0);
        const content = stripHtml(String(topic.content_rendered || topic.content || "")).slice(0, 180);
        const context = [
          nodeTitle ? `节点：${nodeTitle}` : null,
          author ? `作者：${author}` : null,
          Number.isFinite(replyCount) && replyCount > 0 ? `回复：${replyCount}` : null,
          content || null,
        ].filter(Boolean).join(" · ");
        return {
          title,
          sourceUrl: toAbsoluteUrl("https://www.v2ex.com/", topic.url || (topic.id ? `/t/${topic.id}` : null)),
          summary: context || "V2EX 热门社区讨论",
          publishedAt: topic.created ? new Date(topic.created * 1000).toISOString() : null,
        } satisfies FetchedTopicCandidate;
      })
      .filter(isPresent),
  ).slice(0, input.limit);
}

async function fetchChineseHotspotTopics(input: TopicSourceAdapterInput) {
  const provider = inferChineseHotspotProvider(input);
  if (!provider) {
    return null;
  }
  const response = await fetchExternalText({
    url: input.homepageUrl,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
    accept: "application/json,text/json;q=0.9,text/html;q=0.8,*/*;q=0.5",
  });
  const capturedAt = new Date().toISOString();
  const items = parseChineseHotspotPayload({
    provider,
    text: response.text,
    sourceUrl: response.finalUrl || input.homepageUrl,
    capturedAt,
    limit: input.limit,
  });
  return mapChineseHotspotItemsToCandidates(items);
}

function buildXPostTitle(text: string) {
  const normalized = String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= 88) return normalized;
  return `${normalized.slice(0, 87).trimEnd()}…`;
}

function buildXPostSummary(input: {
  authorHandle: string | null;
  metrics?: XApiPost["public_metrics"];
  mediaCount: number;
  text: string;
}) {
  const fragments = [
    input.authorHandle ? `作者：@${input.authorHandle}` : null,
    Number.isFinite(Number(input.metrics?.like_count)) ? `赞：${Number(input.metrics?.like_count || 0)}` : null,
    Number.isFinite(Number(input.metrics?.retweet_count)) ? `转推：${Number(input.metrics?.retweet_count || 0)}` : null,
    Number.isFinite(Number(input.metrics?.reply_count)) ? `回复：${Number(input.metrics?.reply_count || 0)}` : null,
    input.mediaCount > 0 ? `配图：${input.mediaCount}` : null,
  ].filter(Boolean);
  const excerpt = buildXPostTitle(input.text);
  return [fragments.join(" · "), excerpt && excerpt !== input.text ? excerpt : null].filter(Boolean).join(" · ") || "X.com 热点讨论";
}

async function fetchXHotspotTopics(input: TopicSourceAdapterInput) {
  const source = resolveXSourceSeed(input);
  if (!source || String(input.sourceType || "").trim().toLowerCase() !== "x-hotspot") {
    return null;
  }
  const response = await searchRecentXPosts({
    query: source.query,
    maxResults: Math.max(10, Math.min(100, input.limit * 4)),
  });
  const usersById = new Map((response.includes?.users || []).map((item: XApiUser) => [item.id, item]));
  const mediaByKey = new Map((response.includes?.media || []).map((item: XApiMedia) => [item.media_key, item]));
  const referencedPostsById = new Map((response.includes?.tweets || []).map((item: XApiPost) => [item.id, item]));
  const posts = Array.isArray(response.data) ? response.data : [];
  return uniqueCandidates(
    posts.map((post) => {
      const title = buildXPostTitle(String(post.text || ""));
      if (!title || title.length < 12) return null;
      const author = post.author_id ? usersById.get(post.author_id) : null;
      const media = (post.attachments?.media_keys || [])
        .map((key) => mediaByKey.get(key))
        .filter((item): item is XApiMedia => Boolean(item));
      const externalLinks = (post.entities?.urls || [])
        .map((item) => String(item.expanded_url || item.url || "").trim())
        .filter(Boolean);
      const referencedPosts = (post.referenced_tweets || [])
        .map((item) => referencedPostsById.get(item.id))
        .filter((item): item is XApiPost => Boolean(item))
        .map((item) => {
          const referencedAuthor = item.author_id ? usersById.get(item.author_id) : null;
          return {
            postId: item.id,
            textRaw: String(item.text || ""),
            authorHandle: referencedAuthor?.username || null,
            authorName: referencedAuthor?.name || null,
            createdAt: item.created_at || null,
          };
        });
      return {
        title,
        sourceUrl: author?.username ? `https://x.com/${author.username}/status/${post.id}` : `https://x.com/i/status/${post.id}`,
        summary: buildXPostSummary({
          authorHandle: author?.username || null,
          metrics: post.public_metrics,
          mediaCount: media.length,
          text: String(post.text || ""),
        }),
        publishedAt: asIsoDate(post.created_at),
        sourceMeta: {
          sourceKind: "x_hotspot",
          query: source.query,
          seedCode: source.code,
          trustTier: source.trustTier,
          postId: post.id,
          textRaw: String(post.text || ""),
          postedAt: post.created_at || null,
          conversationId: post.conversation_id || null,
          authorId: post.author_id || null,
          authorHandle: author?.username || null,
          authorName: author?.name || null,
          metrics: post.public_metrics || null,
          media: media.map((item) => ({
            mediaKey: item.media_key,
            type: item.type || null,
            url: item.url || null,
            previewImageUrl: item.preview_image_url || null,
            width: item.width ?? null,
            height: item.height ?? null,
            altText: item.alt_text || null,
          })),
          externalLinks: externalLinks.slice(0, 8),
          referencedPosts: referencedPosts.slice(0, 6),
        },
      } satisfies FetchedTopicCandidate;
    }).filter(isPresent),
  ).slice(0, input.limit);
}

function shouldUseRssAdapter(input: TopicSourceAdapterInput) {
  const sourceType = String(input.sourceType || "").trim().toLowerCase();
  return sourceType === "rss" || /\/feed\/?$|\.xml(?:\?|$)|feeds\./i.test(input.homepageUrl);
}

function shouldUseHackerNewsAdapter(input: TopicSourceAdapterInput) {
  return /hacker-news\.firebaseio\.com\/v0\/(?:topstories|jobstories)\.json/i.test(input.homepageUrl);
}

function shouldUseRemotiveAdapter(input: TopicSourceAdapterInput) {
  return /remotive\.com\/api\/remote-jobs/i.test(input.homepageUrl);
}

function shouldUseV2exAdapter(input: TopicSourceAdapterInput) {
  return /v2ex\.com\/api\/topics\/hot\.json/i.test(input.homepageUrl);
}

export async function fetchTopicsFromSourceAdapter(input: TopicSourceAdapterInput) {
  const hotspotTopics = await fetchChineseHotspotTopics(input);
  if (hotspotTopics) {
    return uniqueCandidates(hotspotTopics).slice(0, input.limit);
  }
  const xHotspotTopics = await fetchXHotspotTopics(input);
  if (xHotspotTopics) {
    return uniqueCandidates(xHotspotTopics).slice(0, input.limit);
  }
  if (shouldUseHackerNewsAdapter(input)) {
    return fetchHackerNewsTopics(input);
  }
  if (shouldUseV2exAdapter(input)) {
    return fetchV2exTopics(input);
  }
  if (shouldUseRemotiveAdapter(input)) {
    return fetchRemotiveTopics(input);
  }
  if (shouldUseRssAdapter(input)) {
    return fetchRssFeedTopics(input);
  }
  return null;
}
