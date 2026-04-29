import type { FetchedTopicCandidate } from "./topic-source-adapters";

export type ChineseHotspotProviderCode =
  | "weibo"
  | "douyin"
  | "xiaohongshu"
  | "zhihu"
  | "bilibili"
  | "toutiao"
  | "baidu"
  | "thepaper"
  | "hupu"
  | "douban";

export type ChineseHotspotItem = {
  provider: ChineseHotspotProviderCode;
  providerLabel: string;
  title: string;
  url: string | null;
  rank: number | null;
  heatValue: number | null;
  heatLabel: string | null;
  summary: string | null;
  capturedAt: string;
};

const PROVIDER_LABELS: Record<ChineseHotspotProviderCode, string> = {
  weibo: "微博热搜",
  douyin: "抖音热点",
  xiaohongshu: "小红书趋势",
  zhihu: "知乎热榜",
  bilibili: "B站热门",
  toutiao: "今日头条热榜",
  baidu: "百度热点",
  thepaper: "澎湃新闻",
  hupu: "虎扑热榜",
  douban: "豆瓣热门",
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "").replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = getRecord(value);
  if (!record) return [];
  for (const key of ["data", "items", "list", "cards", "content", "results", "hotwords"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
    const nestedRecord = getRecord(nested);
    if (nestedRecord) {
      const nestedArray = asArray(nestedRecord);
      if (nestedArray.length > 0) return nestedArray;
    }
  }
  return [];
}

function flattenCandidateRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenCandidateRecords(item, depth + 1));
  }
  const record = getRecord(value);
  if (!record) return [];
  const title = inferTitle(record);
  const nested = ["data", "items", "list", "cards", "content", "results", "hotwords"]
    .flatMap((key) => flattenCandidateRecords(record[key], depth + 1));
  return title ? [record, ...nested] : nested;
}

function inferTitle(record: Record<string, unknown>) {
  return (
    getString(record.title)
    || getString(record.word)
    || getString(record.query)
    || getString(record.keyword)
    || getString(record.name)
    || getString(record.hotWord)
    || getString(record.desc)
  );
}

function inferUrl(record: Record<string, unknown>, sourceUrl: string) {
  const raw =
    getString(record.url)
    || getString(record.link)
    || getString(record.href)
    || getString(record.mobileUrl)
    || getString(record.pcUrl);
  if (!raw) return null;
  try {
    return new URL(raw, sourceUrl).toString();
  } catch {
    return null;
  }
}

function inferRank(record: Record<string, unknown>, fallbackRank: number) {
  return getNumber(record.rank) ?? getNumber(record.index) ?? getNumber(record.order) ?? fallbackRank;
}

function inferHeatValue(record: Record<string, unknown>) {
  return (
    getNumber(record.heatValue)
    ?? getNumber(record.hotValue)
    ?? getNumber(record.hotScore)
    ?? getNumber(record.score)
    ?? getNumber(record.rawHot)
  );
}

function inferHeatLabel(record: Record<string, unknown>) {
  return (
    getString(record.heatLabel)
    || getString(record.hotLabel)
    || getString(record.label)
    || getString(record.hotTag)
    || null
  );
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsonPayload(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function parseHtmlHotspots(input: {
  provider: ChineseHotspotProviderCode;
  text: string;
  sourceUrl: string;
  capturedAt: string;
  limit: number;
}) {
  const anchors = Array.from(input.text.matchAll(/<a\b[^>]*href=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/a>/gi));
  const items: ChineseHotspotItem[] = [];
  for (const [index, match] of anchors.entries()) {
    const title = stripHtml(match[2] || "");
    if (!title || title.length < 2 || title.length > 80) continue;
    const url = inferUrl({ url: match[1] }, input.sourceUrl);
    items.push({
      provider: input.provider,
      providerLabel: PROVIDER_LABELS[input.provider],
      title,
      url,
      rank: index + 1,
      heatValue: null,
      heatLabel: null,
      summary: null,
      capturedAt: input.capturedAt,
    });
    if (items.length >= input.limit) break;
  }
  return items;
}

export function inferChineseHotspotProvider(input: {
  name?: string | null;
  homepageUrl?: string | null;
  sourceType?: string | null;
}): ChineseHotspotProviderCode | null {
  const sourceType = getString(input.sourceType).toLowerCase();
  const seed = `${getString(input.name)} ${getString(input.homepageUrl)}`.toLowerCase();
  if (sourceType !== "chinese-hotspot" && !/热搜|热点|热榜|趋势|hotspot|hot|top/.test(seed)) return null;
  if (/weibo|微博/.test(seed)) return "weibo";
  if (/douyin|抖音/.test(seed)) return "douyin";
  if (/xiaohongshu|小红书|xhs/.test(seed)) return "xiaohongshu";
  if (/zhihu|知乎/.test(seed)) return "zhihu";
  if (/bilibili|b站|bili/.test(seed)) return "bilibili";
  if (/toutiao|头条/.test(seed)) return "toutiao";
  if (/thepaper|澎湃/.test(seed)) return "thepaper";
  if (/hupu|虎扑/.test(seed)) return "hupu";
  if (/douban|豆瓣/.test(seed)) return "douban";
  if (/baidu|百度/.test(seed)) return "baidu";
  return sourceType === "chinese-hotspot" ? "baidu" : null;
}

export function parseChineseHotspotPayload(input: {
  provider: ChineseHotspotProviderCode;
  text: string;
  sourceUrl: string;
  capturedAt: string;
  limit: number;
}) {
  const payload = parseJsonPayload(input.text);
  if (!payload) {
    return parseHtmlHotspots(input);
  }
  const records = flattenCandidateRecords(asArray(payload).length > 0 ? asArray(payload) : payload);
  const seen = new Set<string>();
  const items: ChineseHotspotItem[] = [];
  for (const record of records) {
    const title = inferTitle(record);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    items.push({
      provider: input.provider,
      providerLabel: PROVIDER_LABELS[input.provider],
      title,
      url: inferUrl(record, input.sourceUrl),
      rank: inferRank(record, items.length + 1),
      heatValue: inferHeatValue(record),
      heatLabel: inferHeatLabel(record),
      summary: getString(record.summary) || getString(record.description) || null,
      capturedAt: input.capturedAt,
    });
    if (items.length >= input.limit) break;
  }
  return items;
}

export function mapChineseHotspotItemsToCandidates(items: ChineseHotspotItem[]): FetchedTopicCandidate[] {
  return items.map((item) => ({
    title: item.title,
    sourceUrl: item.url,
    summary: [item.providerLabel, item.rank ? `第 ${item.rank} 位` : null, item.heatLabel, item.summary]
      .filter(Boolean)
      .join(" · ") || null,
    publishedAt: item.capturedAt,
    sourceMeta: {
      provider: item.provider,
      providerLabel: item.providerLabel,
      rank: item.rank,
      heatValue: item.heatValue,
      heatLabel: item.heatLabel,
      capturedAt: item.capturedAt,
      sourceKind: "chinese_hotspot",
    },
  }));
}
