import {
  detectVerticalTopicCategories,
  normalizeVerticalTopicCategories,
  type VerticalTopicCategory,
} from "./business-verticals";

export type RegisteredTopicSource = {
  name: string;
  homepageUrl: string;
  sourceType: "news" | "rss" | "blog" | "podcast" | "spotify" | "youtube" | "reddit" | "community";
  priority: number;
  verticals: VerticalTopicCategory[];
};

export const VERIFIED_SYSTEM_TOPIC_SOURCES: RegisteredTopicSource[] = [
  {
    name: "Hacker News Top Stories",
    homepageUrl: "https://hacker-news.firebaseio.com/v0/topstories.json",
    sourceType: "news",
    priority: 95,
    verticals: ["ai_products"],
  },
  {
    name: "Hacker News Jobs",
    homepageUrl: "https://hacker-news.firebaseio.com/v0/jobstories.json",
    sourceType: "news",
    priority: 93,
    verticals: ["career", "overseas_income"],
  },
  {
    name: "V2EX Hot Topics",
    homepageUrl: "https://www.v2ex.com/api/topics/hot.json",
    sourceType: "community",
    priority: 94,
    verticals: ["ai_products", "career", "side_hustles", "overseas_income"],
  },
  {
    name: "Remotive Remote Jobs",
    homepageUrl: "https://remotive.com/api/remote-jobs",
    sourceType: "news",
    priority: 92,
    verticals: ["career", "overseas_income", "side_hustles"],
  },
  {
    name: "Side Hustle Nation Feed",
    homepageUrl: "https://www.sidehustlenation.com/feed/",
    sourceType: "rss",
    priority: 91,
    verticals: ["side_hustles", "overseas_income"],
  },
  {
    name: "Location Rebel Feed",
    homepageUrl: "https://www.locationrebel.com/feed/",
    sourceType: "rss",
    priority: 90,
    verticals: ["overseas_income", "side_hustles", "career"],
  },
  {
    name: "Ahrefs Blog Feed",
    homepageUrl: "https://ahrefs.com/blog/feed/",
    sourceType: "rss",
    priority: 89,
    verticals: ["affiliate_marketing", "ai_products"],
  },
  {
    name: "Backlinko Feed",
    homepageUrl: "https://backlinko.com/feed",
    sourceType: "rss",
    priority: 88,
    verticals: ["affiliate_marketing"],
  },
  {
    name: "Niche Pursuits Feed",
    homepageUrl: "https://www.nichepursuits.com/feed/",
    sourceType: "rss",
    priority: 87,
    verticals: ["affiliate_marketing", "side_hustles", "overseas_income"],
  },
  {
    name: "Social Media Examiner Feed",
    homepageUrl: "https://www.socialmediaexaminer.com/feed/",
    sourceType: "rss",
    priority: 86,
    verticals: ["affiliate_marketing", "side_hustles"],
  },
  {
    name: "HubSpot Marketing Feed",
    homepageUrl: "https://blog.hubspot.com/marketing/rss.xml",
    sourceType: "rss",
    priority: 85,
    verticals: ["affiliate_marketing"],
  },
  {
    name: "Lenny's Newsletter Feed",
    homepageUrl: "https://www.lennysnewsletter.com/feed",
    sourceType: "rss",
    priority: 84,
    verticals: ["ai_products", "career"],
  },
  {
    name: "n8n Releases",
    homepageUrl: "https://github.com/n8n-io/n8n/releases.atom",
    sourceType: "rss",
    priority: 83,
    verticals: ["ai_products"],
  },
  {
    name: "Flowise Releases",
    homepageUrl: "https://github.com/FlowiseAI/Flowise/releases.atom",
    sourceType: "rss",
    priority: 82,
    verticals: ["ai_products"],
  },
  {
    name: "Dify Releases",
    homepageUrl: "https://github.com/langgenius/dify/releases.atom",
    sourceType: "rss",
    priority: 81,
    verticals: ["ai_products"],
  },
  {
    name: "GitHub Changelog Feed",
    homepageUrl: "https://github.blog/changelog/feed/",
    sourceType: "rss",
    priority: 80,
    verticals: ["ai_products"],
  },
];

export const LEGACY_SYSTEM_TOPIC_SOURCE_NAMES_TO_DEACTIVATE = [
  "YouTube Official Blog",
  "Reddit r/technology",
  "The Vergecast RSS",
  "Spotify Newsroom Podcasts",
  "晚点 LatePost",
  "OpenAI News",
  "36Kr",
] as const;

const REGISTERED_SOURCES_BY_NAME = new Map(VERIFIED_SYSTEM_TOPIC_SOURCES.map((item) => [item.name, item]));
const REGISTERED_SOURCES_BY_URL = new Map(VERIFIED_SYSTEM_TOPIC_SOURCES.map((item) => [item.homepageUrl, item]));

export function getRegisteredTopicSourceByName(name: string) {
  return REGISTERED_SOURCES_BY_NAME.get(String(name || "").trim()) || null;
}

export function getVerifiedSystemTopicSources() {
  return VERIFIED_SYSTEM_TOPIC_SOURCES;
}

export function resolveTopicVerticalsForTopicItem(input: {
  sourceName?: string | null;
  homepageUrl?: string | null;
  title?: string | null;
  summary?: string | null;
}) {
  const registered =
    getRegisteredTopicSourceByName(String(input.sourceName || ""))
    || REGISTERED_SOURCES_BY_URL.get(String(input.homepageUrl || "").trim())
    || null;
  const detected = detectVerticalTopicCategories([
    String(input.sourceName || ""),
    String(input.title || ""),
    String(input.summary || ""),
  ]);
  return normalizeVerticalTopicCategories([
    ...(registered?.verticals || []),
    ...detected,
  ]);
}
