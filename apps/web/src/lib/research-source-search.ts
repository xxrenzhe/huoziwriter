import { fetchExternalText } from "./external-fetch";

export type ResearchSourceSearchResult = {
  title: string;
  url: string;
  content: string | null;
  engine: string | null;
  category: string | null;
  publishedDate: string | null;
  score: number | null;
};

export type ResearchSourceSearchResponse = {
  attempted: boolean;
  provider: "searxng";
  query: string;
  searchUrl: string | null;
  results: ResearchSourceSearchResult[];
  error: string | null;
};

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engine?: unknown;
  engines?: unknown;
  category?: unknown;
  publishedDate?: unknown;
  published_date?: unknown;
  score?: unknown;
};

type SearxngResponse = {
  results?: unknown;
};

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(String(process.env[name] || "").trim());
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function normalizeExtractedDate(value: string) {
  const chineseDate = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (chineseDate) {
    const [, year, month, day] = chineseDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const isoDate = value.match(/(\d{4}-\d{1,2}-\d{1,2})/);
  if (isoDate) {
    return isoDate[1];
  }

  const englishDate = value.match(
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s+\d{4}\b/i,
  );
  if (englishDate) {
    const parsed = Date.parse(englishDate[0]);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
  }

  return null;
}

function normalizePublishedDate(result: SearxngResult) {
  return normalizeNullableString(result.publishedDate ?? result.published_date)
    ?? normalizeExtractedDate(normalizeString(result.content));
}

function normalizeEngine(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean).join(", ") || null;
  }
  return normalizeNullableString(value);
}

function normalizeUrl(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  try {
    const url = new URL(normalized);
    return /^https?:$/i.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function buildSearchUrl(input: {
  endpoint: string;
  query: string;
  language?: string;
  timeRange?: string;
  engines?: string;
}) {
  const endpoint = input.endpoint.trim();
  const encodedQuery = encodeURIComponent(input.query);

  if (endpoint.includes("{q}")) {
    const templated = endpoint.replaceAll("{q}", encodedQuery);
    const url = new URL(templated);
    if (!url.searchParams.has("format")) {
      url.searchParams.set("format", "json");
    }
    return url.toString();
  }

  const url = new URL(endpoint);
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = "/search";
  }
  url.searchParams.set("q", input.query);
  if (!url.searchParams.has("format")) {
    url.searchParams.set("format", "json");
  }
  if (input.language && !url.searchParams.has("language")) {
    url.searchParams.set("language", input.language);
  }
  if (input.timeRange && !url.searchParams.has("time_range")) {
    url.searchParams.set("time_range", input.timeRange);
  }
  if (input.engines && !url.searchParams.has("engines")) {
    url.searchParams.set("engines", input.engines);
  }
  return url.toString();
}

function normalizeSearxngResults(payload: SearxngResponse) {
  const results = Array.isArray(payload.results) ? payload.results : [];
  const uniqueResults = new Map<string, ResearchSourceSearchResult>();

  for (const rawResult of results) {
    if (!rawResult || typeof rawResult !== "object") {
      continue;
    }
    const result = rawResult as SearxngResult;
    const url = normalizeUrl(result.url);
    if (!url || uniqueResults.has(url)) {
      continue;
    }
    uniqueResults.set(url, {
      title: normalizeString(result.title) || url,
      url,
      content: normalizeNullableString(result.content),
      engine: normalizeEngine(result.engine ?? result.engines),
      category: normalizeNullableString(result.category),
      publishedDate: normalizePublishedDate(result),
      score: normalizeScore(result.score),
    });
  }

  return Array.from(uniqueResults.values());
}

export function getResearchSourceSearchConfig() {
  const endpoint = String(process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT || "").trim();
  const engines = String(process.env.RESEARCH_SOURCE_SEARCH_ENGINES || "").trim();
  const timeRange = String(process.env.RESEARCH_SOURCE_SEARCH_TIME_RANGE || "").trim();
  return {
    endpoint,
    engines,
    timeRange,
    timeoutMs: readPositiveIntegerEnv("RESEARCH_SOURCE_SEARCH_TIMEOUT_MS", 12_000),
    maxResults: readPositiveIntegerEnv("RESEARCH_SOURCE_SEARCH_MAX_RESULTS", 12),
    recencyDays: readPositiveIntegerEnv("RESEARCH_SOURCE_SEARCH_RECENCY_DAYS", 30),
  };
}

export function buildResearchSourceSearchUrl(query: string) {
  const config = getResearchSourceSearchConfig();
  if (!config.endpoint) {
    return null;
  }
  return buildSearchUrl({
    endpoint: config.endpoint,
    query,
    language: "zh-CN",
    timeRange: config.timeRange || undefined,
    engines: config.engines || undefined,
  });
}

export async function searchResearchSources(input: {
  query: string;
  limit?: number;
  strictJson?: boolean;
}): Promise<ResearchSourceSearchResponse> {
  const query = normalizeString(input.query);
  const config = getResearchSourceSearchConfig();
  const searchUrl = query ? buildResearchSourceSearchUrl(query) : null;

  if (!query || !searchUrl) {
    return {
      attempted: false,
      provider: "searxng",
      query,
      searchUrl,
      results: [],
      error: config.endpoint ? "搜索 query 为空" : "缺少 RESEARCH_SOURCE_SEARCH_ENDPOINT",
    };
  }

  try {
    const response = await fetchExternalText({
      url: searchUrl,
      timeoutMs: config.timeoutMs,
      maxAttempts: 2,
      cache: "no-store",
      accept: "application/json,text/json;q=0.9,*/*;q=0.5",
      headers: {
        "X-Real-IP": "127.0.0.1",
      },
    });
    const contentType = String(response.contentType || "").toLowerCase();
    const text = response.text.trim();
    if (input.strictJson && !contentType.includes("json") && !text.startsWith("{")) {
      throw new Error(`搜索端点未返回 JSON：${response.contentType || "unknown content-type"}`);
    }
    const payload = JSON.parse(text) as SearxngResponse;
    const results = normalizeSearxngResults(payload).slice(0, input.limit ?? config.maxResults);
    return {
      attempted: true,
      provider: "searxng",
      query,
      searchUrl,
      results,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      provider: "searxng",
      query,
      searchUrl,
      results: [],
      error: error instanceof Error ? error.message : "SearXNG 搜索失败",
    };
  }
}
