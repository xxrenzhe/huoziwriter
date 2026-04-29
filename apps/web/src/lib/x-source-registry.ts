import type { VerticalTopicCategory } from "./business-verticals";
import { buildXSearchQuery, buildXSearchUrl, parseXSearchQueryFromUrl } from "./x-query-builder";

export type XTrustTier = "primary" | "reporter" | "operator" | "watcher";

export type XSourceSeed = {
  code: string;
  sourceName: string;
  label: string;
  homepageUrl: string;
  query: string;
  verticals: VerticalTopicCategory[];
  priority: number;
  trustTier: XTrustTier;
  isActive?: boolean;
};

const X_SYSTEM_SOURCE_SEEDS: XSourceSeed[] = [
  {
    code: "x-ai-founders-watch",
    sourceName: "X.com AI Founders Watch",
    label: "AI 创始人观察",
    homepageUrl: buildXSearchUrl(
      buildXSearchQuery({
        keywords: ["OpenAI", "Anthropic", "Claude", "GPT-5", "Perplexity", "Cursor"],
        anyOf: ["launch", "revenue", "ARR", "enterprise", "training", "model"],
        lang: "en",
        excludeRetweets: true,
      }),
    ),
    query: buildXSearchQuery({
      keywords: ["OpenAI", "Anthropic", "Claude", "GPT-5", "Perplexity", "Cursor"],
      anyOf: ["launch", "revenue", "ARR", "enterprise", "training", "model"],
      lang: "en",
      excludeRetweets: true,
    }),
    verticals: ["ai_products"],
    priority: 96,
    trustTier: "operator",
  },
  {
    code: "x-ai-reporters-watch",
    sourceName: "X.com AI Reporters Watch",
    label: "AI 记者观察",
    homepageUrl: buildXSearchUrl(
      buildXSearchQuery({
        keywords: ["OpenAI", "Anthropic", "Google DeepMind", "Meta AI", "xAI"],
        anyOf: ["breaking", "exclusive", "report", "IPO", "funding", "revenue"],
        lang: "en",
        excludeRetweets: true,
      }),
    ),
    query: buildXSearchQuery({
      keywords: ["OpenAI", "Anthropic", "Google DeepMind", "Meta AI", "xAI"],
      anyOf: ["breaking", "exclusive", "report", "IPO", "funding", "revenue"],
      lang: "en",
      excludeRetweets: true,
    }),
    verticals: ["ai_products", "career"],
    priority: 95,
    trustTier: "reporter",
  },
  {
    code: "x-ai-product-watch",
    sourceName: "X.com AI Product Watch",
    label: "AI 产品发布观察",
    homepageUrl: buildXSearchUrl(
      buildXSearchQuery({
        keywords: ["Claude", "ChatGPT", "Gemini", "Cursor", "Lovable", "Windsurf"],
        anyOf: ["launch", "rollout", "shipping", "pricing", "benchmark", "workflow"],
        lang: "en",
        excludeRetweets: true,
      }),
    ),
    query: buildXSearchQuery({
      keywords: ["Claude", "ChatGPT", "Gemini", "Cursor", "Lovable", "Windsurf"],
      anyOf: ["launch", "rollout", "shipping", "pricing", "benchmark", "workflow"],
      lang: "en",
      excludeRetweets: true,
    }),
    verticals: ["ai_products", "side_hustles"],
    priority: 94,
    trustTier: "watcher",
  },
  {
    code: "x-saas-growth-watch",
    sourceName: "X.com SaaS & Growth Watch",
    label: "SaaS 与增长观察",
    homepageUrl: buildXSearchUrl(
      buildXSearchQuery({
        keywords: ["SaaS", "ARR", "pricing", "growth", "enterprise software"],
        anyOf: ["case study", "playbook", "retention", "benchmark", "distribution"],
        lang: "en",
        excludeRetweets: true,
      }),
    ),
    query: buildXSearchQuery({
      keywords: ["SaaS", "ARR", "pricing", "growth", "enterprise software"],
      anyOf: ["case study", "playbook", "retention", "benchmark", "distribution"],
      lang: "en",
      excludeRetweets: true,
    }),
    verticals: ["ai_products", "affiliate_marketing", "side_hustles", "overseas_income"],
    priority: 92,
    trustTier: "watcher",
  },
  {
    code: "x-side-hustles-watch",
    sourceName: "X.com Side Hustles Watch",
    label: "副业赚钱观察",
    homepageUrl: buildXSearchUrl(
      buildXSearchQuery({
        keywords: ["side hustle", "solopreneur", "indie hacker", "make money online", "micro saas"],
        anyOf: ["MRR", "revenue", "case study", "playbook", "funnel", "automation"],
        lang: "en",
        excludeRetweets: true,
      }),
    ),
    query: buildXSearchQuery({
      keywords: ["side hustle", "solopreneur", "indie hacker", "make money online", "micro saas"],
      anyOf: ["MRR", "revenue", "case study", "playbook", "funnel", "automation"],
      lang: "en",
      excludeRetweets: true,
    }),
    verticals: ["side_hustles", "overseas_income"],
    priority: 91,
    trustTier: "watcher",
  },
  {
    code: "x-affiliate-marketing-watch",
    sourceName: "X.com Affiliate Marketing Watch",
    label: "联盟营销观察",
    homepageUrl: buildXSearchUrl(
      buildXSearchQuery({
        keywords: ["affiliate marketing", "SEO affiliate", "niche site", "programmatic SEO", "affiliate offer"],
        anyOf: ["commission", "EPC", "RPM", "revenue", "case study", "SEO"],
        lang: "en",
        excludeRetweets: true,
      }),
    ),
    query: buildXSearchQuery({
      keywords: ["affiliate marketing", "SEO affiliate", "niche site", "programmatic SEO", "affiliate offer"],
      anyOf: ["commission", "EPC", "RPM", "revenue", "case study", "SEO"],
      lang: "en",
      excludeRetweets: true,
    }),
    verticals: ["affiliate_marketing", "side_hustles", "overseas_income"],
    priority: 90,
    trustTier: "watcher",
  },
];

const X_SEEDS_BY_NAME = new Map(X_SYSTEM_SOURCE_SEEDS.map((item) => [item.sourceName, item]));

export function getXSystemSourceSeeds() {
  return X_SYSTEM_SOURCE_SEEDS;
}

export function resolveXSourceSeed(input: {
  sourceName?: string | null;
  homepageUrl?: string | null;
  sourceType?: string | null;
}) {
  const sourceType = String(input.sourceType || "").trim().toLowerCase();
  const sourceName = String(input.sourceName || "").trim();
  const homepageUrl = String(input.homepageUrl || "").trim();
  if (sourceName && X_SEEDS_BY_NAME.has(sourceName)) {
    return X_SEEDS_BY_NAME.get(sourceName) || null;
  }
  const query = parseXSearchQueryFromUrl(homepageUrl);
  if (!query || sourceType !== "x-hotspot") {
    return null;
  }
  return {
    code: `custom-${Buffer.from(query).toString("base64").slice(0, 12)}`,
    sourceName: sourceName || "Custom X.com Search",
    label: sourceName || "自定义 X 搜索",
    homepageUrl,
    query,
    verticals: [],
    priority: 80,
    trustTier: "watcher" as const,
    isActive: true,
  } satisfies XSourceSeed;
}
