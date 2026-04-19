import { adminNav, marketingNav, writerNav } from "@/config/navigation";

export type CommandAction =
  | { type: "navigate"; href: string }
  | { type: "toggle-theme" }
  | { type: "toggle-focus" };

export type CommandItem = {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  badge?: string;
  keywords?: string[];
  action: CommandAction;
};

type CommandArea = "marketing" | "writer" | "admin";

type Envelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

type ArticleSearchResult = {
  id: string;
  articleId: number;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
  updatedAt: string;
  keywords: string[];
};

type FragmentSearchResult = {
  id: number;
  title: string | null;
  distilledContent: string;
  sourceType: string;
  createdAt: string;
  score: number;
};

type PlaybookSearchResult = {
  label: string;
  hitCount: number;
  nearMissCount: number;
  articleCount: number;
  latestArticleTitle: string | null;
  updatedAt: string;
};

type KnowledgeCardSearchResult = {
  id: number;
  title: string;
  cardType: string;
  summary: string | null;
  status: string;
  confidenceScore: number;
  latestChangeSummary: string | null;
  sourceFragmentCount: number;
  shared: boolean;
};

type SeriesSearchResult = {
  id: number;
  name: string;
  personaName: string;
  thesis: string | null;
  activeStatus: string;
  updatedAt: string;
};

type PersonaSearchResult = {
  id: number;
  name: string;
  summary: string | null;
  identityTags: string[];
  writingStyleTags: string[];
  isDefault: boolean;
  updatedAt: string;
};

function normalizeWriterHref(href: string) {
  if (href === "/dashboard") return "/warroom";
  if (href === "/review") return "/reviews";
  return href;
}

function resolveCommandArea(pathname: string): CommandArea {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  if (
    pathname.startsWith("/warroom")
    || pathname.startsWith("/dashboard")
    || pathname.startsWith("/articles")
    || pathname.startsWith("/reviews")
    || pathname.startsWith("/review")
    || pathname.startsWith("/settings")
  ) {
    return "writer";
  }
  return "marketing";
}

function buildNavigationCommands(pathname: string): CommandItem[] {
  const area = resolveCommandArea(pathname);
  const navItems = area === "admin"
    ? adminNav
    : area === "writer"
      ? writerNav.map((item) => ({ ...item, href: normalizeWriterHref(item.href) }))
      : marketingNav;
  const group = area === "admin" ? "后台导航" : area === "writer" ? "工作区导航" : "站点导航";

  return navItems.map((item) => ({
    id: `nav:${item.href}`,
    group,
    title: item.label,
    subtitle: item.href,
    keywords: [item.label, item.href],
    action: { type: "navigate", href: item.href },
  }));
}

function buildActionCommands(pathname: string): CommandItem[] {
  const area = resolveCommandArea(pathname);
  const actions: CommandItem[] = [
    {
      id: "action:toggle-theme",
      group: "动作",
      title: "切换日夜主题",
      subtitle: "在 Day / Night 视觉模式之间切换",
      keywords: ["主题", "theme", "夜间", "白天"],
      action: { type: "toggle-theme" },
    },
    {
      id: "action:toggle-focus",
      group: "动作",
      title: "切换专注模式",
      subtitle: "收起壳层 chrome，并尽量进入沉浸式写作视图",
      keywords: ["专注", "focus", "沉浸", "全屏"],
      action: { type: "toggle-focus" },
    },
  ];

  if (area !== "marketing") {
    actions.push(
      {
        id: "action:open-settings",
        group: "动作",
        title: "打开设置",
        subtitle: "账号、公众号、素材资产和订阅能力都从这里管理",
        keywords: ["设置", "公众号", "订阅", "connections"],
        action: { type: "navigate", href: "/settings" },
      },
      {
        id: "action:new-article",
        group: "动作",
        title: "新建稿件",
        subtitle: "跳到稿件页的新建区，直接立起内容对象",
        keywords: ["新建", "稿件", "article"],
        action: { type: "navigate", href: "/articles#create-article" },
      },
      {
        id: "action:asset-center",
        group: "动作",
        title: "打开素材资产中心",
        subtitle: "查看碎片、知识卡、图像资产与微信公众号连接",
        keywords: ["素材", "fragment", "asset", "知识卡"],
        action: { type: "navigate", href: "/settings/assets" },
      },
      {
        id: "action:author-settings",
        group: "动作",
        title: "打开作者设定",
        subtitle: "维护人设、文风与长期经营系列",
        keywords: ["作者", "人设", "系列", "风格", "persona", "series"],
        action: { type: "navigate", href: "/settings/author" },
      },
      {
        id: "action:sources-settings",
        group: "动作",
        title: "打开信源设置",
        subtitle: "维护系统源、自定义来源池与热点偏好入口",
        keywords: ["信源", "sources", "热点", "source", "topic"],
        action: { type: "navigate", href: "/settings/sources" },
      },
      {
        id: "action:publish-settings",
        group: "动作",
        title: "打开发布设置",
        subtitle: "管理公众号连接、同步诊断与 PDF 导出通道",
        keywords: ["发布", "publish", "微信", "pdf", "导出"],
        action: { type: "navigate", href: "/settings/publish" },
      },
      {
        id: "action:account-settings",
        group: "动作",
        title: "打开账号设置",
        subtitle: "查看套餐、用量、安全与账号状态",
        keywords: ["账号", "account", "套餐", "plan", "安全"],
        action: { type: "navigate", href: "/settings/account" },
      },
      {
        id: "action:language-guard",
        group: "动作",
        title: "打开语言守卫",
        subtitle: "维护死刑词库与写作硬规则",
        keywords: ["语言守卫", "language guard", "死刑词", "规则"],
        action: { type: "navigate", href: "/settings/language-guard" },
      },
    );
  } else {
    actions.push({
      id: "action:login",
      group: "动作",
      title: "进入登录页",
      subtitle: "从营销站点进入写作或后台工作区",
      keywords: ["登录", "login", "workspace"],
      action: { type: "navigate", href: "/login" },
    });
  }

  if (area === "admin") {
    actions.push(
      {
        id: "action:writer-workspace",
        group: "动作",
        title: "打开写作工作区",
        subtitle: "从管理后台快速跳回作战台",
        keywords: ["作战台", "writer", "dashboard"],
        action: { type: "navigate", href: "/warroom" },
      },
      {
        id: "action:eval-scoring",
        group: "动作",
        title: "打开评分校准",
        subtitle: "查看 scoring profile 与线上校准入口",
        keywords: ["scoring", "评分", "校准", "profile"],
        action: { type: "navigate", href: "/admin/writing-eval/scoring" },
      },
      {
        id: "action:eval-schedules",
        group: "动作",
        title: "打开自动调度",
        subtitle: "查看可执行调度、阻断规则与最近派发",
        keywords: ["schedule", "调度", "自动", "dispatch"],
        action: { type: "navigate", href: "/admin/writing-eval/schedules" },
      },
      {
        id: "action:eval-governance",
        group: "动作",
        title: "打开治理决策",
        subtitle: "查看灰度、收缩与治理动作入口",
        keywords: ["governance", "治理", "放量", "收缩", "rollout"],
        action: { type: "navigate", href: "/admin/writing-eval/governance" },
      },
    );
  }

  return actions;
}

function normalizeSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }
  const haystack = values.map((item) => normalizeSearchText(item || "")).join(" ");
  return normalizedQuery.split(/\s+/).every((token) => haystack.includes(token));
}

function summarizeFragmentSourceType(value: string) {
  if (value === "manual") return "手动摘录";
  if (value === "wechat") return "公众号";
  if (value === "url") return "网页";
  if (value === "image") return "图片";
  if (value === "video") return "视频";
  return value || "素材";
}

function summarizeKnowledgeStatus(value: string) {
  if (value === "active") return "正常";
  if (value === "conflicted") return "冲突";
  if (value === "stale") return "待刷新";
  if (value === "draft") return "草稿";
  if (value === "archived") return "归档";
  return value || "知识卡";
}

function summarizeSeriesStatus(value: string) {
  if (value === "active") return "经营中";
  if (value === "paused") return "暂停";
  if (value === "archived") return "归档";
  return value || "系列";
}

async function readEnvelope<T>(response: Response) {
  const json = await response.json() as Envelope<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.error || `请求失败：${response.status}`);
  }
  return json.data;
}

async function searchArticles(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  const response = await fetch(`/api/articles/search?query=${encodeURIComponent(query)}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    return [];
  }
  const data = await readEnvelope<ArticleSearchResult[]>(response);
  return data.map((item) => ({
    id: item.id,
    group: "稿件",
    title: item.title,
    subtitle: item.subtitle,
    badge: item.badge,
    keywords: item.keywords,
    action: { type: "navigate", href: item.href },
  }));
}

async function searchFragments(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  const response = await fetch("/api/assets/fragments/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    return [];
  }
  const data = await readEnvelope<FragmentSearchResult[]>(response);
  return data.slice(0, 6).map((item) => ({
    id: `fragment:${item.id}`,
    group: "素材",
    title: item.title?.trim() || `素材 #${item.id}`,
    subtitle: `${summarizeFragmentSourceType(item.sourceType)} · ${item.distilledContent.slice(0, 48).trim() || "打开素材资产中心查看详情"}`,
    badge: summarizeFragmentSourceType(item.sourceType),
    keywords: [item.title || "", item.distilledContent, item.sourceType],
    action: { type: "navigate", href: "/settings/assets" },
  }));
}

async function searchPlaybooks(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  const response = await fetch("/api/playbooks", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    return [];
  }
  const data = await readEnvelope<PlaybookSearchResult[]>(response);
  return data
    .filter((item) => matchesSearch(query, [item.label, item.latestArticleTitle, String(item.hitCount), String(item.articleCount)]))
    .slice(0, 6)
    .map((item) => ({
      id: `playbook:${item.label}`,
      group: "打法",
      title: item.label,
      subtitle: `命中 ${item.hitCount} · 近失 ${item.nearMissCount} · 覆盖 ${item.articleCount} 篇稿件`,
      badge: item.latestArticleTitle ? `最近：${item.latestArticleTitle}` : undefined,
      keywords: [item.label, item.latestArticleTitle || ""],
      action: { type: "navigate", href: "/reviews" },
    }));
}

async function searchKnowledgeCards(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  const response = await fetch(`/api/knowledge/cards/search?query=${encodeURIComponent(query)}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    return [];
  }
  const data = await readEnvelope<KnowledgeCardSearchResult[]>(response);
  return data.map((item) => {
    const statusLabel = summarizeKnowledgeStatus(item.status);
    return {
      id: `knowledge:${item.id}`,
      group: "知识卡",
      title: item.title,
      subtitle:
        item.summary?.trim()
          || item.latestChangeSummary?.trim()
          || `${item.cardType} · 关联 ${item.sourceFragmentCount} 条素材`,
      badge: statusLabel,
      keywords: [item.title, item.cardType, item.summary || "", item.latestChangeSummary || "", statusLabel],
      action: { type: "navigate", href: "/settings/assets" },
    };
  });
}

async function searchSeriesCatalog(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  const response = await fetch(`/api/series/search?query=${encodeURIComponent(query)}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    return [];
  }
  const data = await readEnvelope<SeriesSearchResult[]>(response);
  return data.map((item) => {
    const statusLabel = summarizeSeriesStatus(item.activeStatus);
    return {
      id: `series:${item.id}`,
      group: "系列",
      title: item.name,
      subtitle: `${item.personaName} · ${item.thesis?.trim() || "已配置系列，进入作者设置查看完整判断"}`,
      badge: statusLabel,
      keywords: [item.name, item.personaName, item.thesis || "", statusLabel],
      action: { type: "navigate", href: "/settings/author" },
    };
  });
}

async function searchPersonasCatalog(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  const response = await fetch(`/api/personas/search?query=${encodeURIComponent(query)}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) {
    return [];
  }
  const data = await readEnvelope<PersonaSearchResult[]>(response);
  return data.map((item) => ({
    id: `persona:${item.id}`,
    group: "人设",
    title: item.name,
    subtitle:
      item.summary?.trim()
        || [...item.identityTags, ...item.writingStyleTags].join(" · ")
        || "进入作者设置查看完整人设档案",
    badge: item.isDefault ? "默认" : undefined,
    keywords: [item.name, item.summary || "", ...item.identityTags, ...item.writingStyleTags],
    action: { type: "navigate", href: "/settings/author" },
  }));
}

export function getStaticCommandItems(pathname: string) {
  return [...buildNavigationCommands(pathname), ...buildActionCommands(pathname)];
}

export function filterCommandItems(items: CommandItem[], query: string) {
  if (!query.trim()) {
    return items;
  }
  return items.filter((item) => matchesSearch(query, [item.title, item.subtitle, ...(item.keywords ?? [])]));
}

export async function searchRemoteCommandSources(query: string, signal: AbortSignal) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [] as CommandItem[];
  }
  const settled = await Promise.allSettled([
    searchArticles(trimmedQuery, signal),
    searchFragments(trimmedQuery, signal),
    searchPlaybooks(trimmedQuery, signal),
    searchKnowledgeCards(trimmedQuery, signal),
    searchSeriesCatalog(trimmedQuery, signal),
    searchPersonasCatalog(trimmedQuery, signal),
  ]);

  const items: CommandItem[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    }
  }
  return items;
}
