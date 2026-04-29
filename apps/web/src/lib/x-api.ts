const DEFAULT_X_API_BASE_URL = "https://api.x.com/2";
const DEFAULT_POST_FIELDS = [
  "author_id",
  "attachments",
  "conversation_id",
  "created_at",
  "entities",
  "lang",
  "public_metrics",
  "referenced_tweets",
  "text",
] as const;
const DEFAULT_EXPANSIONS = [
  "attachments.media_keys",
  "author_id",
  "referenced_tweets.id",
  "referenced_tweets.id.author_id",
] as const;
const DEFAULT_MEDIA_FIELDS = [
  "alt_text",
  "duration_ms",
  "height",
  "media_key",
  "preview_image_url",
  "type",
  "url",
  "width",
] as const;
const DEFAULT_USER_FIELDS = ["description", "name", "profile_image_url", "username", "verified"] as const;

export type XApiUser = {
  id: string;
  name?: string;
  username?: string;
  description?: string;
  verified?: boolean;
};

export type XApiMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
};

export type XApiPost = {
  id: string;
  text?: string;
  author_id?: string;
  conversation_id?: string;
  created_at?: string;
  lang?: string;
  attachments?: {
    media_keys?: string[];
  };
  entities?: {
    urls?: Array<{ expanded_url?: string; url?: string }>;
  };
  referenced_tweets?: Array<{ id: string; type?: string }>;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    impression_count?: number;
  };
};

type XRecentSearchResponse = {
  data?: XApiPost[];
  includes?: {
    users?: XApiUser[];
    media?: XApiMedia[];
    tweets?: XApiPost[];
  };
  meta?: {
    next_token?: string;
    result_count?: number;
  };
};

function getStringEnv(key: string, fallback = "") {
  return String(process.env[key] || fallback).trim();
}

function getNumberEnv(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getXApiConfig() {
  return {
    bearerToken: getStringEnv("X_API_BEARER_TOKEN"),
    baseUrl: trimTrailingSlash(getStringEnv("X_API_BASE_URL", DEFAULT_X_API_BASE_URL)) || DEFAULT_X_API_BASE_URL,
    timeoutMs: Math.max(1_000, getNumberEnv("X_API_TIMEOUT_MS", 20_000)),
    maxRetries: Math.max(0, Math.min(4, getNumberEnv("X_API_MAX_RETRIES", 2))),
  };
}

function assertXApiConfigured() {
  const config = getXApiConfig();
  if (!config.bearerToken) {
    throw new Error("X_API_BEARER_TOKEN 未配置，无法抓取 X.com 热点源");
  }
  return config;
}

async function requestXApi(path: string, params: URLSearchParams) {
  const config = assertXApiConfigured();
  const url = `${config.baseUrl}${path}?${params.toString()}`;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.bearerToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`X API 请求失败，HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
      }
      return await response.json() as XRecentSearchResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("X API 请求失败");
      if (attempt >= config.maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError || new Error("X API 请求失败");
}

export async function searchRecentXPosts(input: {
  query: string;
  maxResults?: number;
  nextToken?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const query = String(input.query || "").trim();
  if (!query) {
    throw new Error("X 搜索 query 不能为空");
  }
  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10, Math.min(100, Math.round(input.maxResults || 10)))),
    "tweet.fields": DEFAULT_POST_FIELDS.join(","),
    expansions: DEFAULT_EXPANSIONS.join(","),
    "media.fields": DEFAULT_MEDIA_FIELDS.join(","),
    "user.fields": DEFAULT_USER_FIELDS.join(","),
  });
  if (input.nextToken) params.set("next_token", String(input.nextToken).trim());
  if (input.startTime) params.set("start_time", String(input.startTime).trim());
  if (input.endTime) params.set("end_time", String(input.endTime).trim());
  return requestXApi("/tweets/search/recent", params);
}
