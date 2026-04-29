import { attachFragmentToArticleNode, getArticleNodes } from "./article-outline";
import { runImaEvidenceSearch } from "./ima-evidence-search";
import { createFragment } from "./repositories";
import { distillCaptureInput } from "./distill";
import { searchResearchSources } from "./research-source-search";
import { fetchWebpageArticle } from "./webpage-reader";
import {
  detectVerticalTopicCategories,
  detectVerticalTopicCategory,
  type VerticalTopicCategory,
} from "./business-verticals";
import { inferPlan24Vertical } from "./article-viral-genome-corpus";
import { localizeSourceMaterialToChinese } from "./source-localization";
export { detectVerticalTopicCategory } from "./business-verticals";

type ResearchCoverageCategory = "official" | "industry" | "comparison" | "userVoice" | "timeline";

type ResearchSearchHints = {
  topicTheme?: string | null;
  coreAssertion?: string | null;
  whyNow?: string | null;
  researchObject?: string | null;
  coreQuestion?: string | null;
  mustCoverAngles?: string[];
  missingCategories?: string[];
};

type SearchPlan = {
  category: ResearchCoverageCategory;
  label: string;
  query: string;
  preferredDomains: string[];
  siteQueries: string[];
};

type ImaSearchPlan = {
  purpose: string;
  query: string;
};

type ImaDiscoveredItem = {
  mediaId: string;
  title: string;
  excerpt: string;
  sourceUrl: string | null;
  query: string;
  score: number;
};

type CuratedSourcePlan = {
  category: ResearchCoverageCategory;
  label: string;
  url: string;
};

type CuratedSourceReachability = {
  ok: boolean;
  checkedAt: number;
  reason: string | null;
};

type VerticalSourcePack = {
  domains: Record<ResearchCoverageCategory, string[]>;
  facets: Record<ResearchCoverageCategory, string[]>;
  curatedSources: CuratedSourcePlan[];
};

const CURATED_SOURCE_REACHABILITY_TTL_MS = 1000 * 60 * 60 * 12;
const curatedSourceReachabilityCache = new Map<string, CuratedSourceReachability>();

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

const RESEARCH_SOURCE_LOCALIZATION_CONCURRENCY = readPositiveIntegerEnv("ARTICLE_RESEARCH_SOURCE_LOCALIZATION_CONCURRENCY", 3);
const RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS = readPositiveIntegerEnv("ARTICLE_RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS", 6);
const SPARSE_RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS = readPositiveIntegerEnv("ARTICLE_SPARSE_RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS", Math.max(9, RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS));

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }));
  return results;
}

function tokenizeSeed(value: string) {
  return Array.from(new Set((String(value || "").toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/g) ?? []).filter(Boolean)));
}

export function selectResearchCandidateUrls(input: {
  seedUrls: string[];
  curatedPlans: CuratedSourcePlan[];
  discoveredUrls: string[];
  limit?: number;
}) {
  const limit = Math.max(1, Math.round(Number(input.limit ?? RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS) || RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS));
  const selected: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | null | undefined) => {
    const normalized = String(url || "").trim();
    if (!normalized || seen.has(normalized) || selected.length >= limit) {
      return;
    }
    seen.add(normalized);
    selected.push(normalized);
  };

  for (const url of input.seedUrls) {
    add(url);
  }

  const categoryOrder: ResearchCoverageCategory[] = ["official", "industry", "comparison", "userVoice", "timeline"];
  for (const category of categoryOrder) {
    const plan = input.curatedPlans.find((item) => item.category === category && !seen.has(item.url));
    add(plan?.url);
  }

  for (const plan of input.curatedPlans) {
    add(plan.url);
  }
  for (const url of input.discoveredUrls) {
    add(url);
  }

  return selected;
}

function isGenericResearchLandingPage(input: {
  title?: string | null;
  url?: string | null;
  content?: string | null;
}) {
  const title = String(input.title || "").trim().toLowerCase();
  const content = String(input.content || "").trim().toLowerCase();
  const url = String(input.url || "").trim().toLowerCase();
  const path = url ? getHostname(url) + "/" + url.replace(/^https?:\/\/[^/]+\/?/i, "") : "";
  const genericTitle = /^(overview|docs|documentation|images|news|templates|workflows|guide|帮助|文档|概览|总览|模板)$/.test(title);
  const genericPath = /(?:^|\/)(overview|docs|images|news|templates|workflows|guide)\/?$/.test(path);
  const thinContent = content.length > 0 && content.length <= 48;
  return (genericTitle || genericPath) && thinContent;
}

function hasSubstantiveResearchSignals(seed: string) {
  return /(案例|实战|复盘|经验|方法|流程|工作流|报告|白皮书|评测|对比|差异|数据|调研|benchmark|analysis|report|case study|retrospective|review|workflow|release|changelog|版本|演进|更新)/i.test(seed);
}

function hasFirstHandSignals(seed: string) {
  return /(我|我们|自己|踩坑|教训|实测|亲测|复盘|经历|感受|吐槽|评论|反馈|讨论|issue|discussion|experience|review)/i.test(seed);
}

const BASE_CURATED_SOURCE_URLS_BY_DOMAIN: Record<string, Array<{ url: string; label: string; category: ResearchCoverageCategory }>> = {
  "developers.weixin.qq.com": [
    {
      url: "https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html",
      label: "微信公众平台开发者文档总览",
      category: "official",
    },
  ],
  "platform.openai.com": [
    {
      url: "https://platform.openai.com/docs/overview",
      label: "OpenAI Platform Docs",
      category: "official",
    },
    {
      url: "https://platform.openai.com/docs/guides/images",
      label: "OpenAI Images Guide",
      category: "official",
    },
  ],
  "openai.com": [
    {
      url: "https://openai.com/news/",
      label: "OpenAI News",
      category: "timeline",
    },
  ],
  "docs.anthropic.com": [
    {
      url: "https://docs.anthropic.com/en/docs/overview",
      label: "Anthropic Docs Overview",
      category: "official",
    },
  ],
  "ai.google.dev": [
    {
      url: "https://ai.google.dev/gemini-api/docs",
      label: "Gemini API Docs",
      category: "official",
    },
  ],
  "n8n.io": [
    {
      url: "https://n8n.io/workflows/",
      label: "n8n Workflows",
      category: "comparison",
    },
  ],
  "make.com": [
    {
      url: "https://www.make.com/en/templates",
      label: "Make Templates",
      category: "comparison",
    },
  ],
  "langchain.com": [
    {
      url: "https://docs.langchain.com/",
      label: "LangChain Docs",
      category: "comparison",
    },
  ],
};

const EMPTY_RESEARCH_BUCKET = (): Record<ResearchCoverageCategory, string[]> => ({
  official: [],
  industry: [],
  comparison: [],
  userVoice: [],
  timeline: [],
});

const VERTICAL_SOURCE_PACKS: Record<VerticalTopicCategory, VerticalSourcePack> = {
  business_case: {
    domains: {
      official: ["openai.com", "anthropic.com", "about.meta.com", "blog.google"],
      industry: ["a16z.com", "cbinsights.com", "techcrunch.com", "fortune.com"],
      comparison: ["a16z.com", "techcrunch.com", "cbinsights.com", "fortune.com"],
      userVoice: ["news.ycombinator.com", "reddit.com", "zhihu.com", "v2ex.com"],
      timeline: ["openai.com", "anthropic.com", "blog.google", "techcrunch.com"],
    },
    facets: {
      official: ["公司动作", "创始人", "融资", "营收"],
      industry: ["商业案例", "创业拆解", "品牌策略", "组织变化"],
      comparison: ["模式对比", "增长路径", "公司对比", "产品路线"],
      userVoice: ["创业复盘", "行业讨论", "用户反馈", "管理评论"],
      timeline: ["公司时间线", "融资进展", "产品演进", "组织变化"],
    },
    curatedSources: [
      { category: "industry", label: "a16z Startups", url: "https://a16z.com/tag/startups/" },
      { category: "industry", label: "TechCrunch Startups", url: "https://techcrunch.com/category/startups/" },
      { category: "timeline", label: "OpenAI News", url: "https://openai.com/news/" },
      { category: "timeline", label: "Anthropic News", url: "https://www.anthropic.com/news" },
    ],
  },
  tool_evaluation: {
    domains: {
      official: ["openai.com", "anthropic.com", "notion.so", "figma.com"],
      industry: ["zapier.com", "g2.com", "capterra.com", "lennysnewsletter.com"],
      comparison: ["g2.com", "capterra.com", "zapier.com", "toolfinder.co"],
      userVoice: ["reddit.com", "youtube.com", "github.com", "news.ycombinator.com"],
      timeline: ["openai.com", "anthropic.com", "github.com", "figma.com"],
    },
    facets: {
      official: ["产品说明", "功能更新", "定价", "能力边界"],
      industry: ["工具评测", "效率工具", "产品对比", "替代方案"],
      comparison: ["好不好用", "值不值得", "最佳场景", "最差场景"],
      userVoice: ["真实体验", "续费反馈", "吐槽点", "试用感受"],
      timeline: ["版本更新", "功能变化", "定价变化", "能力演进"],
    },
    curatedSources: [
      { category: "comparison", label: "G2 Reviews", url: "https://www.g2.com/" },
      { category: "comparison", label: "Capterra", url: "https://www.capterra.com/" },
      { category: "industry", label: "Zapier Blog", url: "https://zapier.com/blog/" },
      { category: "timeline", label: "GitHub Changelog", url: "https://github.blog/changelog/" },
    ],
  },
  operator_log: {
    domains: {
      official: ["docs.anthropic.com", "platform.openai.com", "developers.weixin.qq.com", "docs.github.com"],
      industry: ["indiehackers.com", "zapier.com", "n8n.io", "make.com"],
      comparison: ["zapier.com", "n8n.io", "make.com", "langchain.com"],
      userVoice: ["reddit.com", "news.ycombinator.com", "v2ex.com", "zhihu.com"],
      timeline: ["github.com", "platform.openai.com", "docs.anthropic.com", "developers.weixin.qq.com"],
    },
    facets: {
      official: ["接口限制", "官方文档", "发布变化", "错误边界"],
      industry: ["实操复盘", "工作流", "自动化", "案例记录"],
      comparison: ["方案对比", "流程差异", "成本差异", "适用场景"],
      userVoice: ["踩坑", "亲测", "复盘", "体验反馈"],
      timeline: ["更新日志", "版本变化", "能力演进", "修复记录"],
    },
    curatedSources: [
      { category: "industry", label: "Indie Hackers", url: "https://www.indiehackers.com/" },
      { category: "comparison", label: "n8n Workflows", url: "https://n8n.io/workflows/" },
      { category: "comparison", label: "Make Templates", url: "https://www.make.com/en/templates" },
      { category: "official", label: "OpenAI Platform Docs", url: "https://platform.openai.com/docs/overview" },
    ],
  },
  saas_growth: {
    domains: {
      official: ["stripe.com", "intercom.com", "hubspot.com", "profitwell.com"],
      industry: ["openviewpartners.com", "profitwell.com", "forentrepreneurs.com", "saastr.com"],
      comparison: ["profitwell.com", "saastr.com", "openviewpartners.com", "chartmogul.com"],
      userVoice: ["reddit.com", "indiehackers.com", "news.ycombinator.com", "saastr.com"],
      timeline: ["stripe.com", "intercom.com", "hubspot.com", "chartmogul.com"],
    },
    facets: {
      official: ["ARR", "MRR", "留存", "续费"],
      industry: ["SaaS 增长", "PLG", "定价策略", "获客成本"],
      comparison: ["套餐对比", "留存对比", "渠道对比", "转化差异"],
      userVoice: ["SaaS 复盘", "定价吐槽", "客户反馈", "续费体验"],
      timeline: ["定价更新", "增长变化", "产品演进", "PLG 趋势"],
    },
    curatedSources: [
      { category: "industry", label: "SaaStr", url: "https://www.saastr.com/" },
      { category: "comparison", label: "ProfitWell", url: "https://www.paddle.com/resources" },
      { category: "industry", label: "OpenView", url: "https://openviewpartners.com/blog/" },
      { category: "timeline", label: "Intercom Blog", url: "https://www.intercom.com/blog/" },
    ],
  },
  github_tools: {
    domains: {
      official: ["github.com", "docs.github.com", "github.blog", "marketplace.visualstudio.com"],
      industry: ["github.blog", "stackshare.io", "libhunt.com", "news.ycombinator.com"],
      comparison: ["stackshare.io", "libhunt.com", "github.com", "producthunt.com"],
      userVoice: ["reddit.com", "news.ycombinator.com", "v2ex.com", "github.com"],
      timeline: ["github.blog", "github.com", "docs.github.com", "marketplace.visualstudio.com"],
    },
    facets: {
      official: ["仓库", "版本说明", "发布记录", "文档"],
      industry: ["GitHub 项目", "开发工具", "开源工具", "效率插件"],
      comparison: ["star 对比", "功能对比", "替代关系", "上手门槛"],
      userVoice: ["issue 反馈", "discussion", "上手体验", "踩坑"],
      timeline: ["release", "changelog", "star 变化", "维护状态"],
    },
    curatedSources: [
      { category: "official", label: "GitHub Docs", url: "https://docs.github.com/" },
      { category: "timeline", label: "GitHub Blog Changelog", url: "https://github.blog/changelog/" },
      { category: "comparison", label: "LibHunt", url: "https://www.libhunt.com/" },
      { category: "comparison", label: "StackShare", url: "https://stackshare.io/" },
    ],
  },
  solution_playbook: {
    domains: {
      official: ["developers.weixin.qq.com", "platform.openai.com", "docs.anthropic.com", "docs.github.com"],
      industry: ["zapier.com", "n8n.io", "make.com", "langchain.com"],
      comparison: ["zapier.com", "n8n.io", "make.com", "coda.io"],
      userVoice: ["reddit.com", "v2ex.com", "zhihu.com", "news.ycombinator.com"],
      timeline: ["github.com", "platform.openai.com", "developers.weixin.qq.com", "docs.anthropic.com"],
    },
    facets: {
      official: ["解决方案", "官方示例", "接口限制", "实施文档"],
      industry: ["工作流", "最佳实践", "自动化方案", "落地路径"],
      comparison: ["方案对比", "实施成本", "替代路径", "工具组合"],
      userVoice: ["落地踩坑", "一线反馈", "效果复盘", "团队经验"],
      timeline: ["版本演进", "模板更新", "能力变化", "方案变化"],
    },
    curatedSources: [
      { category: "comparison", label: "Zapier Blog", url: "https://zapier.com/blog/" },
      { category: "comparison", label: "n8n Workflows", url: "https://n8n.io/workflows/" },
      { category: "comparison", label: "Make Templates", url: "https://www.make.com/en/templates" },
      { category: "official", label: "Weixin Dev Docs", url: "https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html" },
    ],
  },
  overseas_income: {
    domains: {
      official: ["wise.com", "stripe.com", "shopify.com", "indiehackers.com"],
      industry: ["indiehackers.com", "shopify.com", "wise.com", "stripe.com"],
      comparison: ["shopify.com", "wise.com", "stripe.com", "indiehackers.com"],
      userVoice: ["indiehackers.com", "reddit.com", "zhihu.com", "shopify.com"],
      timeline: ["stripe.com", "wise.com", "shopify.com", "indiehackers.com"],
    },
    facets: {
      official: ["赚美金", "海外客户", "平台规则", "收款合规"],
      industry: ["出海变现", "远程接单", "数字产品", "creator economy"],
      comparison: ["平台抽成", "收款方式", "变现路径", "渠道对比"],
      userVoice: ["赚美元复盘", "接海外单经历", "独立开发收入", "remote 工作体验"],
      timeline: ["平台政策更新", "抽成变化", "收款政策", "出海趋势"],
    },
    curatedSources: [
      { category: "official", label: "Wise Blog", url: "https://wise.com/us/blog" },
      { category: "industry", label: "Indie Hackers Interviews", url: "https://www.indiehackers.com/interviews" },
      { category: "comparison", label: "Shopify Ecommerce Blog", url: "https://www.shopify.com/blog" },
      { category: "timeline", label: "Stripe Blog", url: "https://stripe.com/blog" },
    ],
  },
  career: {
    domains: {
      official: ["linkedin.com", "hbr.org", "onetonline.org", "worldeconomicforum.org"],
      industry: ["hbr.org", "worldeconomicforum.org", "linkedin.com", "onetonline.org"],
      comparison: ["levels.fyi", "glassdoor.com", "resume.io", "linkedin.com"],
      userVoice: ["teamblind.com", "reddit.com", "zhihu.com", "v2ex.com"],
      timeline: ["linkedin.com", "worldeconomicforum.org", "hbr.org", "onetonline.org"],
    },
    facets: {
      official: ["岗位要求", "求职规则", "升职路径", "职业发展"],
      industry: ["职场趋势", "未来工作", "管理实践", "绩效变化"],
      comparison: ["岗位对比", "薪资对比", "公司差异", "职业路径"],
      userVoice: ["裁员经历", "升职复盘", "绩效压力", "管理者反馈"],
      timeline: ["就业趋势", "岗位变化", "技能迁移", "组织演进"],
    },
    curatedSources: [
      { category: "official", label: "LinkedIn Talent Blog", url: "https://www.linkedin.com/business/talent/blog" },
      { category: "comparison", label: "HBR Career Planning", url: "https://hbr.org/topic/career-planning" },
      { category: "timeline", label: "World Economic Forum Future of Work", url: "https://www.weforum.org/stories/series/future-of-work/" },
      { category: "official", label: "O*NET OnLine", url: "https://www.onetonline.org/" },
    ],
  },
  affiliate_marketing: {
    domains: {
      official: ["affiliate-program.amazon.com", "ahrefs.com", "backlinko.com", "authorityhacker.com"],
      industry: ["ahrefs.com", "backlinko.com", "authorityhacker.com", "affiliate-program.amazon.com"],
      comparison: ["ahrefs.com", "backlinko.com", "affiliate-program.amazon.com", "authorityhacker.com"],
      userVoice: ["reddit.com", "indiehackers.com", "medium.com", "authorityhacker.com"],
      timeline: ["affiliate-program.amazon.com", "ahrefs.com", "backlinko.com", "authorityhacker.com"],
    },
    facets: {
      official: ["联盟营销规则", "佣金政策", "归因规则", "平台条款"],
      industry: ["SEO 流量", "Affiliate funnel", "选品策略", "站外获客"],
      comparison: ["平台对比", "佣金差异", "cookie 窗口", "归因方式"],
      userVoice: ["联盟营销复盘", "站长收入", "佣金被砍", "实战经验"],
      timeline: ["政策更新", "佣金调整", "平台变更", "归因变化"],
    },
    curatedSources: [
      { category: "official", label: "Amazon Associates Help", url: "https://affiliate-program.amazon.com/help" },
      { category: "industry", label: "Ahrefs Affiliate Marketing", url: "https://www.ahrefs.com/blog/affiliate-marketing/" },
      { category: "comparison", label: "Backlinko Affiliate Marketing", url: "https://www.backlinko.com/affiliate-marketing" },
      { category: "industry", label: "Authority Hacker Blog", url: "https://www.authorityhacker.com/blog/" },
    ],
  },
  search_marketing: {
    domains: {
      official: ["support.google.com", "ads.google.com", "thinkwithgoogle.com", "learn.microsoft.com"],
      industry: ["searchengineland.com", "wordstream.com", "semrush.com", "ahrefs.com"],
      comparison: ["searchengineland.com", "wordstream.com", "semrush.com", "ahrefs.com"],
      userVoice: ["reddit.com", "support.google.com", "ppcchat.co", "zhihu.com"],
      timeline: ["support.google.com", "ads.google.com", "searchengineland.com", "thinkwithgoogle.com"],
    },
    facets: {
      official: ["Google Ads", "search intent", "keyword match types", "ad relevance", "Quality Score"],
      industry: ["PPC", "search intent", "keyword intent", "conversion rate", "paid search"],
      comparison: ["keyword match types", "broad match vs exact match", "Google Ads vs Microsoft Ads", "PPC strategy"],
      userVoice: ["PPC experience", "Google Ads community", "keyword intent", "conversion feedback"],
      timeline: ["Google Ads match type update", "broad match evolution", "smart bidding", "keyword matching"],
    },
    curatedSources: [
      { category: "official", label: "Google Ads keyword matching help", url: "https://support.google.com/google-ads/answer/7478529?hl=en" },
      { category: "official", label: "Google Ads Quality Score help", url: "https://support.google.com/google-ads/answer/6167118?hl=en" },
      { category: "industry", label: "WordStream PPC University", url: "https://www.wordstream.com/ppc" },
      { category: "comparison", label: "Search Engine Land PPC", url: "https://searchengineland.com/library/paid-search" },
      { category: "userVoice", label: "Reddit PPC community", url: "https://www.reddit.com/r/PPC/" },
    ],
  },
  ai_products: {
    domains: {
      official: ["openai.com", "anthropic.com", "a16z.com", "lennysnewsletter.com"],
      industry: ["a16z.com", "lennysnewsletter.com", "openai.com", "anthropic.com"],
      comparison: ["openai.com", "anthropic.com", "a16z.com", "lennysnewsletter.com"],
      userVoice: ["reddit.com", "indiehackers.com", "openai.com", "anthropic.com"],
      timeline: ["openai.com", "anthropic.com", "a16z.com", "lennysnewsletter.com"],
    },
    facets: {
      official: ["AI 产品", "模型能力", "定价策略", "发布说明"],
      industry: ["AI 创业", "产品机会", "distribution", "PMF"],
      comparison: ["工具对比", "定价对比", "场景差异", "替代方案"],
      userVoice: ["用户反馈", "上手体验", "续费意愿", "吐槽点"],
      timeline: ["版本更新", "能力演进", "模型发布", "产品迭代"],
    },
    curatedSources: [
      { category: "industry", label: "a16z AI", url: "https://a16z.com/tag/ai/" },
      { category: "industry", label: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com/" },
      { category: "timeline", label: "Anthropic News", url: "https://www.anthropic.com/news" },
      { category: "official", label: "OpenAI News", url: "https://openai.com/news/" },
    ],
  },
  side_hustles: {
    domains: {
      official: ["shopify.com", "sidehustlenation.com", "wise.com", "stripe.com"],
      industry: ["shopify.com", "sidehustlenation.com", "wise.com", "stripe.com"],
      comparison: ["shopify.com", "sidehustlenation.com", "wise.com", "stripe.com"],
      userVoice: ["indiehackers.com", "reddit.com", "zhihu.com", "shopify.com"],
      timeline: ["shopify.com", "sidehustlenation.com", "wise.com", "stripe.com"],
    },
    facets: {
      official: ["副业平台", "开店规则", "创作者变现", "平台抽成"],
      industry: ["副业案例", "第二收入", "个人品牌变现", "线上变现"],
      comparison: ["渠道对比", "平台佣金", "时间投入", "现金流差异"],
      userVoice: ["副业复盘", "失败教训", "真实收入", "时间管理"],
      timeline: ["平台更新", "抽成调整", "变现政策", "平台趋势"],
    },
    curatedSources: [
      { category: "industry", label: "Shopify Ecommerce Blog", url: "https://www.shopify.com/blog" },
      { category: "industry", label: "Side Hustle Nation", url: "https://sidehustlenation.com/" },
      { category: "official", label: "Wise Blog", url: "https://wise.com/us/blog" },
      { category: "timeline", label: "Stripe Blog", url: "https://stripe.com/blog" },
    ],
  },
  generic: {
    domains: EMPTY_RESEARCH_BUCKET(),
    facets: EMPTY_RESEARCH_BUCKET(),
    curatedSources: [],
  },
};

function uniqueStrings(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function mergeResearchTerms(target: Record<ResearchCoverageCategory, string[]>, source?: Partial<Record<ResearchCoverageCategory, string[]>>) {
  if (!source) {
    return target;
  }
  for (const category of Object.keys(target) as ResearchCoverageCategory[]) {
    target[category] = uniqueStrings([...(target[category] || []), ...((source[category] || []) as string[])], 6);
  }
  return target;
}

async function probeCuratedSourceUrl(url: string) {
  const cached = curatedSourceReachabilityCache.get(url);
  const now = Date.now();
  if (cached && now - cached.checkedAt <= CURATED_SOURCE_REACHABILITY_TTL_MS) {
    return cached;
  }

  try {
    const article = await fetchWebpageArticle(url);
    const rawLength = String(article.rawText || "").trim().length;
    const title = String(article.sourceTitle || "").trim();
    const result = {
      ok: rawLength >= 180 || title.length >= 8,
      checkedAt: now,
      reason: rawLength >= 180 || title.length >= 8 ? null : "页面正文过短",
    } satisfies CuratedSourceReachability;
    curatedSourceReachabilityCache.set(url, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      checkedAt: now,
      reason: error instanceof Error ? error.message : "直达信源探针失败",
    } satisfies CuratedSourceReachability;
    curatedSourceReachabilityCache.set(url, result);
    return result;
  }
}

export async function filterReachableCuratedResearchPlans(plans: CuratedSourcePlan[]) {
  const uniquePlans = Array.from(new Map(plans.map((plan) => [plan.url, plan])).values());
  const reachable = await Promise.all(
    uniquePlans.map(async (plan) => ({
      plan,
      reachability: await probeCuratedSourceUrl(plan.url),
    })),
  );

  return reachable
    .filter((item) => item.reachability.ok)
    .map((item) => item.plan);
}

function normalizeSeedText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^请(?:帮我)?(?:生成|写)(?:一篇)?关于/u, "")
    .replace(/^生成(?:一篇)?关于/u, "")
    .replace(/^写(?:一篇)?关于/u, "")
    .replace(/并同步到(?:微信)?草稿箱[。！!]?$/u, "")
    .replace(/的公众号文章[。！!]?$/u, "")
    .replace(/公众号文章[。！!]?$/u, "")
    .trim();
}

function compactSearchSeed(value: string | null | undefined, maxLength = 24) {
  const normalized = normalizeSeedText(value)
    .replace(/[“”"'`]/g, " ")
    .replace(/[()（）【】\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  const clauses = normalized
    .split(/[。！？!?；;：:\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const primary = clauses.find((item) => item.length <= maxLength) || clauses[0] || normalized;
  return primary.slice(0, maxLength).trim();
}

function isLowSignalTopicFragment(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return /(这个选题的核心价值|核心价值|于讨论|讨论|当前|真正|已经|是否|为什么|如何|能够|可以|区别于|普通|场景|形成|需要|值得写|研究层|研究对象|工作场景|痛点引入|核心反转|默认起手|节奏插件)/i.test(normalized);
}

function explodeSearchSegments(value: string | null | undefined) {
  const compact = compactSearchSeed(value, 32);
  if (!compact) {
    return [] as string[];
  }
  const segments = compact
    .replace(/\s+/g, " ")
    .split(/在|中的|中|场景里|场景中|是否|为什么|如何|什么|以及|并且|并|从|到|与|和|对|把/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !isLowSignalTopicFragment(item))
    .map((item) => item.slice(0, 16));
  const shouldKeepRaw = segments.length === 0 || compact.length <= 14;
  return uniqueStrings(
    [...(shouldKeepRaw ? [compactSearchSeed(compact, 18)] : []), ...segments].filter((item) => !isLowSignalTopicFragment(item || "")),
    4,
  );
}

function buildCrossLanguageHints(values: string[]) {
  const seed = values.join(" ");
  const hints: string[] = [];
  if (/(^|[^a-z])ai([^a-z]|$)|人工智能|自动写作|写作/u.test(seed)) {
    hints.push("AI writing workflow");
  }
  if (/生产线|工作流|闭环|自动化/u.test(seed)) {
    hints.push("workflow automation pipeline");
  }
  if (/内容生产|内容团队|创作/u.test(seed)) {
    hints.push("content operations");
  }
  if (/搜索广告|搜索意图|关键词|谷歌广告|投放|质量得分|广告相关性|需求阶段/u.test(seed)) {
    hints.push("Google Ads search intent keyword match types");
    hints.push("PPC search intent conversion");
  }
  if (/公众号|微信/u.test(seed)) {
    hints.push("WeChat Official Account");
  }
  if (/草稿箱|发布/u.test(seed)) {
    hints.push("draft API publishing");
  }
  if (/研究|检索/u.test(seed)) {
    hints.push("research retrieval");
  }
  if (/核查|事实/u.test(seed)) {
    hints.push("fact check");
  }
  return uniqueStrings(hints, 4);
}

function hasKeyword(seed: string, pattern: RegExp) {
  return pattern.test(seed);
}

function resolveVerticalCategories(values: string[]) {
  const detected = detectVerticalTopicCategories(values);
  if (detected.length > 0) {
    return detected;
  }
  const fallback = detectVerticalTopicCategory(values);
  return fallback === "generic" ? [] : [fallback];
}

function buildDomainStrategy(values: string[]) {
  const seed = values.join(" ").toLowerCase();
  const verticalCategories = resolveVerticalCategories(values);
  const domains = verticalCategories.reduce(
    (bucket, category) => mergeResearchTerms(bucket, VERTICAL_SOURCE_PACKS[category].domains),
    EMPTY_RESEARCH_BUCKET(),
  );

  if (hasKeyword(seed, /(微信|公众号|wechat)/i)) {
    domains.official.push("developers.weixin.qq.com", "mp.weixin.qq.com");
    domains.timeline.push("developers.weixin.qq.com", "mp.weixin.qq.com");
    domains.userVoice.push("zhihu.com", "v2ex.com");
  }

  if (verticalCategories.includes("ai_products") || hasKeyword(seed, /(自动写作|写作工作流|内容工作流|workflow|automation|pipeline|research retrieval|fact check|ai writing workflow)/i)) {
    domains.official.push("openai.com", "platform.openai.com", "docs.anthropic.com", "ai.google.dev");
    domains.industry.push("infoq.cn", "36kr.com", "venturebeat.com", "techcrunch.com");
    domains.comparison.push("zapier.com", "n8n.io", "make.com", "langchain.com");
    domains.userVoice.push("reddit.com", "github.com", "news.ycombinator.com");
    domains.timeline.push("openai.com", "platform.openai.com", "docs.anthropic.com", "ai.google.dev");
  }
  if (verticalCategories.includes("business_case") || hasKeyword(seed, /(商业案例|案例拆解|创业案例|创始人|融资|营收|估值|收购|品牌动作|公司战略)/i)) {
    domains.official.push("openai.com", "anthropic.com", "about.meta.com", "blog.google");
    domains.industry.push("a16z.com", "techcrunch.com", "fortune.com", "cbinsights.com");
    domains.comparison.push("a16z.com", "fortune.com", "cbinsights.com");
    domains.userVoice.push("news.ycombinator.com", "reddit.com", "zhihu.com");
    domains.timeline.push("openai.com", "anthropic.com", "techcrunch.com", "fortune.com");
  }
  if (verticalCategories.includes("tool_evaluation") || hasKeyword(seed, /(工具评测|产品评测|效率工具|值不值得|替代方案|横向对比|上手体验)/i)) {
    domains.official.push("openai.com", "anthropic.com", "figma.com", "notion.so");
    domains.industry.push("zapier.com", "g2.com", "capterra.com", "lennysnewsletter.com");
    domains.comparison.push("g2.com", "capterra.com", "zapier.com", "toolfinder.co");
    domains.userVoice.push("reddit.com", "github.com", "news.ycombinator.com");
    domains.timeline.push("github.com", "openai.com", "anthropic.com", "figma.com");
  }
  if (
    verticalCategories.includes("operator_log")
    || verticalCategories.includes("solution_playbook")
    || hasKeyword(seed, /(实操复盘|踩坑复盘|解决方案|工作流|自动化方案|落地方案|最佳实践|流程设计)/i)
  ) {
    domains.official.push("platform.openai.com", "docs.anthropic.com", "developers.weixin.qq.com", "docs.github.com");
    domains.industry.push("n8n.io", "make.com", "zapier.com", "indiehackers.com");
    domains.comparison.push("n8n.io", "make.com", "zapier.com", "langchain.com");
    domains.userVoice.push("reddit.com", "v2ex.com", "news.ycombinator.com", "zhihu.com");
    domains.timeline.push("github.com", "platform.openai.com", "developers.weixin.qq.com", "docs.anthropic.com");
  }
  if (verticalCategories.includes("saas_growth") || hasKeyword(seed, /(saas|arr|mrr|留存|续费|获客成本|plg|试用转化|定价策略)/i)) {
    domains.official.push("stripe.com", "intercom.com", "hubspot.com", "chartmogul.com");
    domains.industry.push("saastr.com", "openviewpartners.com", "forentrepreneurs.com", "profitwell.com");
    domains.comparison.push("profitwell.com", "chartmogul.com", "saastr.com");
    domains.userVoice.push("indiehackers.com", "reddit.com", "news.ycombinator.com");
    domains.timeline.push("stripe.com", "intercom.com", "hubspot.com", "chartmogul.com");
  }
  if (verticalCategories.includes("github_tools") || hasKeyword(seed, /(github 项目|开源项目|github star|repo|repository|开发工具|cli 工具|vscode 插件|mcp|model context protocol)/i)) {
    domains.official.push("github.com", "docs.github.com", "github.blog", "marketplace.visualstudio.com");
    domains.industry.push("github.blog", "stackshare.io", "libhunt.com", "producthunt.com");
    domains.comparison.push("stackshare.io", "libhunt.com", "github.com");
    domains.userVoice.push("github.com", "reddit.com", "news.ycombinator.com", "v2ex.com");
    domains.timeline.push("github.blog", "github.com", "docs.github.com", "marketplace.visualstudio.com");
  }
  if (verticalCategories.includes("search_marketing") || hasKeyword(seed, /(搜索广告|搜索意图|关键词|谷歌广告|google ads|ppc|sem|quality score|ad relevance|keyword match|search intent)/i)) {
    domains.official.push("support.google.com", "ads.google.com", "thinkwithgoogle.com");
    domains.industry.push("searchengineland.com", "wordstream.com", "semrush.com", "ahrefs.com");
    domains.comparison.push("wordstream.com", "semrush.com", "searchengineland.com");
    domains.userVoice.push("reddit.com", "support.google.com", "zhihu.com");
    domains.timeline.push("support.google.com", "ads.google.com", "searchengineland.com");
  }

  if (hasKeyword(seed, /(github|开源)/i)) {
    domains.official.push("github.com");
    domains.userVoice.push("github.com");
    domains.timeline.push("github.com");
  }

  return mergeResearchTerms(EMPTY_RESEARCH_BUCKET(), domains);
}

function buildTopicFacetKeywords(values: string[]) {
  const seed = values.join(" ");
  const verticalCategories = resolveVerticalCategories(values);
  const facets = verticalCategories.reduce(
    (bucket, category) => mergeResearchTerms(bucket, VERTICAL_SOURCE_PACKS[category].facets),
    EMPTY_RESEARCH_BUCKET(),
  );

  if (hasKeyword(seed, /(微信|公众号|wechat)/i)) {
    facets.official.push("公众号", "微信", "草稿箱", "发布接口");
    facets.timeline.push("公众号", "微信", "草稿箱", "更新");
    facets.userVoice.push("公众号", "微信运营");
  }
  if (verticalCategories.includes("ai_products") || hasKeyword(seed, /(自动写作|写作工作流|内容工作流|workflow|automation|pipeline|agent 产品|ai 工具)/i)) {
    facets.official.push("AI写作", "内容工作流");
    facets.industry.push("AI写作", "内容工作流", "自动化");
    facets.comparison.push("AI写作工具", "工作流平台");
    facets.userVoice.push("AI写作", "使用体验");
    facets.timeline.push("AI写作", "版本更新");
  }
  if (verticalCategories.includes("business_case") || hasKeyword(seed, /(商业案例|案例拆解|创业案例|创始人|融资|营收|估值|商业模式)/i)) {
    facets.official.push("公司动作", "财报", "创始人", "产品路线");
    facets.industry.push("商业案例", "创业拆解", "品牌策略", "组织变化");
    facets.comparison.push("公司对比", "增长路径", "模式差异");
    facets.userVoice.push("创业复盘", "行业讨论", "用户反馈");
    facets.timeline.push("融资进展", "产品演进", "组织变化");
  }
  if (verticalCategories.includes("tool_evaluation") || hasKeyword(seed, /(工具评测|产品评测|效率工具|值不值得|替代方案|上手体验)/i)) {
    facets.official.push("功能说明", "定价", "能力边界");
    facets.industry.push("工具评测", "效率工具", "产品对比");
    facets.comparison.push("最佳场景", "最差场景", "替代关系");
    facets.userVoice.push("真实体验", "吐槽点", "续费反馈");
    facets.timeline.push("版本更新", "定价变化", "能力演进");
  }
  if (
    verticalCategories.includes("operator_log")
    || verticalCategories.includes("solution_playbook")
    || hasKeyword(seed, /(实操复盘|解决方案|工作流|自动化方案|落地方案|最佳实践)/i)
  ) {
    facets.official.push("接口限制", "官方示例", "错误边界");
    facets.industry.push("实操复盘", "自动化", "落地路径");
    facets.comparison.push("方案对比", "流程差异", "成本差异");
    facets.userVoice.push("踩坑", "亲测", "复盘");
    facets.timeline.push("更新日志", "版本变化", "能力演进");
  }
  if (verticalCategories.includes("saas_growth") || hasKeyword(seed, /(saas|arr|mrr|留存|续费|获客成本|plg|定价策略)/i)) {
    facets.official.push("ARR", "MRR", "留存", "续费");
    facets.industry.push("SaaS 增长", "PLG", "定价策略", "获客成本");
    facets.comparison.push("套餐对比", "留存对比", "渠道对比");
    facets.userVoice.push("续费体验", "客户反馈", "SaaS 复盘");
    facets.timeline.push("定价更新", "增长变化", "产品演进");
  }
  if (verticalCategories.includes("github_tools") || hasKeyword(seed, /(github 项目|开源项目|github star|repo|repository|开发工具|cli 工具|vscode 插件|mcp|model context protocol)/i)) {
    facets.official.push("release", "changelog", "readme");
    facets.industry.push("GitHub 项目", "开发工具", "开源工具");
    facets.comparison.push("star 对比", "功能对比", "替代关系");
    facets.userVoice.push("issue 反馈", "discussion", "上手体验");
    facets.timeline.push("release", "维护状态", "star 变化");
  }
  if (verticalCategories.includes("search_marketing") || hasKeyword(seed, /(搜索广告|搜索意图|关键词|谷歌广告|google ads|ppc|sem|quality score|ad relevance|keyword match|search intent)/i)) {
    facets.official.push("Google Ads", "搜索意图", "关键词匹配", "广告相关性", "质量得分");
    facets.industry.push("PPC", "搜索意图", "关键词意图", "转化率");
    facets.comparison.push("精准匹配", "广泛匹配", "搜索广告平台对比");
    facets.userVoice.push("投手复盘", "PPC 经验", "Google Ads 社区");
    facets.timeline.push("关键词匹配演进", "智能出价", "搜索广告更新");
  }
  if (hasKeyword(seed, /(研究|检索|核查|事实|fact check|research retrieval)/i)) {
    facets.official.push("事实核查");
    facets.industry.push("事实核查", "内容审核");
    facets.comparison.push("事实核查", "检索");
    facets.userVoice.push("事实核查");
  }
  if (hasKeyword(seed, /(排版|发布|draft|草稿箱)/i)) {
    facets.official.push("排版", "发布");
    facets.industry.push("发布流程");
    facets.timeline.push("发布", "草稿箱");
  }

  return mergeResearchTerms(EMPTY_RESEARCH_BUCKET(), facets);
}

function buildSiteScopedQueries(input: {
  category: ResearchCoverageCategory;
  focusTerms: string[];
  preferredDomains: string[];
  facetTerms: string[];
}) {
  const categoryTerms: Record<ResearchCoverageCategory, string[]> = {
    official: ["官方", "文档", "API"],
    industry: ["行业", "分析", "报告"],
    comparison: ["对比", "竞品", "替代"],
    userVoice: ["反馈", "评测", "体验"],
    timeline: ["更新时间", "版本", "release"],
  };
  return input.preferredDomains.slice(0, 2).map((domain) =>
    buildQueryText([
      `site:${domain}`,
      ...categoryTerms[input.category],
      ...input.facetTerms.slice(0, 3),
      ...input.focusTerms.slice(0, 2),
    ]),
  ).filter(Boolean);
}

function normalizeCategoryName(value: string | null | undefined): ResearchCoverageCategory | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["official", "官方", "官方源", "官方来源"].includes(normalized)) {
    return "official";
  }
  if (["industry", "行业", "行业源", "行业来源"].includes(normalized)) {
    return "industry";
  }
  if (["comparison", "对比", "对比源", "同类", "竞品", "比较"].includes(normalized)) {
    return "comparison";
  }
  if (["uservoice", "uservoice", "用户", "用户源", "用户声音", "用户反馈"].includes(normalized)) {
    return "userVoice";
  }
  if (["timeline", "时间", "时间线", "历史", "时间源", "时间来源"].includes(normalized)) {
    return "timeline";
  }
  return null;
}

function buildCoreSearchTerms(input: {
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  searchHints?: ResearchSearchHints;
}) {
  return uniqueStrings(
    [
      ...explodeSearchSegments(input.articleTitle),
      ...explodeSearchSegments(input.searchHints?.topicTheme),
      ...explodeSearchSegments(input.searchHints?.researchObject),
      ...input.knowledgeCards.slice(0, 2).flatMap((item) => explodeSearchSegments(item.title)),
      ...input.outlineNodes.slice(0, 2).flatMap((item) => explodeSearchSegments(item.title)),
      ...uniqueStrings(input.searchHints?.mustCoverAngles ?? [], 3).flatMap((item) => explodeSearchSegments(item)),
    ],
    8,
  );
}

function buildQueryText(parts: Array<string | null | undefined>) {
  return uniqueStrings(parts, 6).join(" ").slice(0, 96);
}

function truncateText(text: string, limit = 160) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function buildTopicRelevanceTerms(values: string[]) {
  return uniqueStrings(
    values
      .flatMap((value) => explodeSearchSegments(value))
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length >= 4),
    6,
  );
}

export function getResearchSupplementIntensity(input: {
  articleTitle: string;
  searchHints?: ResearchSearchHints;
}) {
  const signature = [
    input.articleTitle,
    input.searchHints?.topicTheme || "",
    input.searchHints?.researchObject || "",
    input.searchHints?.coreQuestion || "",
    input.searchHints?.coreAssertion || "",
    ...(input.searchHints?.mustCoverAngles ?? []),
  ].map((item) => String(item || "").trim()).filter(Boolean).join(" ");
  const profile = inferPlan24Vertical(signature || input.articleTitle);
  const sparseTrack = Boolean(profile.sparseTrack);
  return {
    vertical: profile.key,
    category: profile.category,
    sparseTrack,
    coverageNote: profile.coverageNote,
    imaLimit: sparseTrack ? 6 : 4,
    imaPlanLimit: sparseTrack ? 5 : 3,
    searchLimit: sparseTrack ? 10 : 6,
    curatedLimit: sparseTrack ? 10 : 6,
    candidateUrlLimit: sparseTrack ? SPARSE_RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS : RESEARCH_SUPPLEMENT_MAX_DISTILL_URLS,
    targetNodeLimit: sparseTrack ? 5 : 4,
    requiredAngles: sparseTrack
      ? ["钱从哪里来", "为什么现在", "谁不适合做", "平台规则", "真实案例"]
      : ["钱流/成本", "why now", "适用边界"],
  };
}

export function buildResearchSearchPlans(input: {
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  searchHints?: ResearchSearchHints;
}) {
  const coreTerms = buildCoreSearchTerms(input);
  const focusTerms = coreTerms.slice(0, 3);
  const crossLanguageHints = buildCrossLanguageHints(coreTerms);
  const topicFacets = buildTopicFacetKeywords([
    ...coreTerms,
    ...crossLanguageHints,
    input.articleTitle,
    input.searchHints?.topicTheme || "",
    input.searchHints?.researchObject || "",
  ]);
  const domainStrategy = buildDomainStrategy([
    ...coreTerms,
    ...crossLanguageHints,
    ...uniqueStrings(input.searchHints?.mustCoverAngles ?? [], 3),
  ]);
  const outlineTerms = input.outlineNodes
    .slice(0, 2)
    .map((item) => compactSearchSeed(item.title || item.description || "", 14))
    .filter(Boolean);
  const knowledgeTerms = input.knowledgeCards
    .slice(0, 2)
    .map((item) => compactSearchSeed(item.title || item.summary || "", 14))
    .filter(Boolean);
  const prioritizedCategories = uniqueStrings(input.searchHints?.missingCategories ?? [], 5)
    .map((item) => normalizeCategoryName(item))
    .filter((item): item is ResearchCoverageCategory => Boolean(item));
  const defaultOrder: ResearchCoverageCategory[] = ["official", "industry", "comparison", "userVoice", "timeline"];
  const orderedCategories = [
    ...prioritizedCategories,
    ...defaultOrder.filter((item) => !prioritizedCategories.includes(item)),
  ];
  const queryByCategory: Record<ResearchCoverageCategory, string> = {
    official: buildQueryText([
      "官网 官方 文档 公告 API docs documentation announcement whitepaper",
      ...topicFacets.official,
      ...focusTerms,
      ...crossLanguageHints.slice(0, 2),
      ...knowledgeTerms.slice(0, 1),
    ]),
    industry: buildQueryText([
      "行业 分析 报告 趋势 市场 案例 insight report analysis",
      ...topicFacets.industry,
      ...focusTerms,
      ...crossLanguageHints.slice(0, 2),
      ...outlineTerms.slice(0, 1),
    ]),
    comparison: buildQueryText([
      "竞品 对比 替代 方案 差异 benchmark versus comparison",
      ...topicFacets.comparison,
      ...focusTerms,
      ...crossLanguageHints.slice(0, 2),
      ...outlineTerms,
    ]),
    userVoice: buildQueryText([
      "用户 反馈 体验 评论 社区 forum reddit github discussions review",
      ...topicFacets.userVoice,
      ...focusTerms,
      ...crossLanguageHints.slice(0, 2),
      ...knowledgeTerms.slice(0, 1),
    ]),
    timeline: buildQueryText([
      "时间线 历史 更新 版本 演进 milestone timeline changelog release",
      ...topicFacets.timeline,
      ...focusTerms,
      ...crossLanguageHints.slice(0, 2),
      ...outlineTerms.slice(0, 1),
    ]),
  };
  const labelByCategory: Record<ResearchCoverageCategory, string> = {
    official: "官方口径",
    industry: "行业口径",
    comparison: "横向对比",
    userVoice: "用户反馈",
    timeline: "时间脉络",
  };
  return orderedCategories
    .map((category) => {
      const preferredDomains = domainStrategy[category];
      return {
        category,
        label: labelByCategory[category],
        query: queryByCategory[category],
        preferredDomains,
        siteQueries: buildSiteScopedQueries({
          category,
          focusTerms,
          preferredDomains,
          facetTerms: topicFacets[category],
        }),
      };
    })
    .filter((plan) => Boolean(plan.query));
}

export function buildImaResearchPlans(input: {
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  searchHints?: ResearchSearchHints;
}) {
  const coreTerms = buildCoreSearchTerms(input);
  const mustCoverAngles = uniqueStrings(input.searchHints?.mustCoverAngles ?? [], 3)
    .flatMap((item) => explodeSearchSegments(item));
  const plans: ImaSearchPlan[] = [
    {
      purpose: "主题主检索",
      query: buildQueryText(coreTerms.slice(0, 2)),
    },
    {
      purpose: "核心问题检索",
      query: buildQueryText([
        ...explodeSearchSegments(input.searchHints?.coreQuestion),
        ...explodeSearchSegments(input.searchHints?.coreAssertion),
        ...coreTerms.slice(0, 1),
      ]),
    },
    {
      purpose: "必查切面检索",
      query: buildQueryText([
        ...mustCoverAngles.slice(0, 2),
        ...coreTerms.slice(0, 1),
      ]),
    },
  ];

  return plans.filter((item) => Boolean(item.query));
}

export function buildCuratedResearchPlans(input: {
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  searchHints?: ResearchSearchHints;
  limit?: number;
}) {
  const coreTerms = buildCoreSearchTerms(input);
  const crossLanguageHints = buildCrossLanguageHints(coreTerms);
  const verticalCategories = resolveVerticalCategories([
    ...coreTerms,
    ...crossLanguageHints,
    input.articleTitle,
    input.searchHints?.topicTheme || "",
    input.searchHints?.researchObject || "",
    input.searchHints?.coreQuestion || "",
  ]);
  const domainStrategy = buildDomainStrategy([
    ...coreTerms,
    ...crossLanguageHints,
    input.articleTitle,
    input.searchHints?.topicTheme || "",
    input.searchHints?.researchObject || "",
  ]);

  const plans: CuratedSourcePlan[] = verticalCategories.flatMap(
    (category) => VERTICAL_SOURCE_PACKS[category].curatedSources,
  );
  for (const category of Object.keys(domainStrategy) as ResearchCoverageCategory[]) {
    for (const domain of domainStrategy[category]) {
      for (const source of BASE_CURATED_SOURCE_URLS_BY_DOMAIN[domain] ?? []) {
        plans.push({
          category: source.category,
          label: source.label,
          url: source.url,
        });
      }
    }
  }

  const deduped = new Map<string, CuratedSourcePlan>();
  for (const item of plans) {
    deduped.set(item.url, item);
  }
  return Array.from(deduped.values()).slice(0, Math.max(1, input.limit ?? 6));
}

export function scoreImaResult(input: {
  title: string;
  excerpt: string;
  sourceUrl: string | null;
  topicTerms: string[];
}) {
  const seed = `${input.title} ${input.excerpt} ${input.sourceUrl || ""}`.toLowerCase();
  const seedTokens = new Set(tokenizeSeed(`${input.title} ${input.excerpt}`));
  let score = 0;
  const matchedTopicTerms = input.topicTerms.filter((term) => {
    const normalized = term.toLowerCase();
    if (seed.includes(normalized)) {
      return true;
    }
    const termTokens = normalized.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/g) ?? [];
    return termTokens.some((token) => seedTokens.has(token));
  });
  score += matchedTopicTerms.length * 10;
  if (matchedTopicTerms.length === 0 && input.topicTerms.length > 0) {
    score -= 20;
  }
  if (hasSubstantiveResearchSignals(seed)) {
    score += 12;
  }
  if (hasFirstHandSignals(seed)) {
    score += 8;
  }
  if (input.sourceUrl) {
    score += 4;
  }
  if (/(案例|实战|复盘|踩坑|经验|方法|流程|工作流|自动化|发布|草稿箱|公众号|微信|研究|核查|用户|反馈|版本|演进|搜索广告|搜索意图|关键词|google ads|ppc|quality score|match type|ad relevance)/i.test(seed)) {
    score += 8;
  }
  if (isGenericResearchLandingPage({
    title: input.title,
    url: input.sourceUrl,
    content: input.excerpt,
  })) {
    score -= 18;
  }
  if (String(input.title || "").trim().length <= 4 && String(input.excerpt || "").trim().length <= 24) {
    score -= 12;
  }
  if (/(广告|招生|加盟|下载|破解版|优惠券|黄页|导航)/i.test(seed)) {
    score -= 30;
  }
  return score;
}

async function discoverImaResearchItems(input: {
  userId: number;
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  limit: number;
  planLimit?: number;
  searchHints?: ResearchSearchHints;
}) {
  const plans = buildImaResearchPlans({
    articleTitle: input.articleTitle,
    knowledgeCards: input.knowledgeCards,
    outlineNodes: input.outlineNodes,
    searchHints: input.searchHints,
  }).slice(0, Math.max(1, input.planLimit ?? 3));
  const topicTerms = buildTopicRelevanceTerms([
    input.articleTitle,
    input.searchHints?.topicTheme || "",
    input.searchHints?.researchObject || "",
    input.searchHints?.coreQuestion || "",
    input.searchHints?.coreAssertion || "",
    ...input.outlineNodes.map((item) => item.title || item.description || ""),
  ]);
  const discovered: ImaDiscoveredItem[] = [];
  const seenMediaIds = new Set<string>();
  const seenSignatures = new Set<string>();
  let attempted = false;
  let degradedReason: string | null = null;

  for (const plan of plans) {
    const result = await runImaEvidenceSearch({
      userId: input.userId,
      query: plan.query,
    });
    attempted = true;
    if (result.degradedReason && !degradedReason) {
      degradedReason = result.degradedReason;
    }
    for (const item of result.items) {
      const signature = [
        String(item.title || "").trim().toLowerCase(),
        String(item.excerpt || "").trim().toLowerCase().slice(0, 120),
      ].join("::");
      if (seenMediaIds.has(item.mediaId) || seenSignatures.has(signature)) {
        continue;
      }
      const score = scoreImaResult({
        title: item.title,
        excerpt: item.excerpt,
        sourceUrl: item.sourceUrl,
        topicTerms,
      });
      if (score <= -12) {
        continue;
      }
      seenMediaIds.add(item.mediaId);
      seenSignatures.add(signature);
      discovered.push({
        mediaId: item.mediaId,
        title: item.title,
        excerpt: item.excerpt,
        sourceUrl: item.sourceUrl,
        query: plan.query,
        score,
      });
    }
    if (discovered.length >= input.limit * 2) {
      break;
    }
  }

  return {
    attempted,
    queries: plans.map((item) => item.query),
    degradedReason,
    items: discovered
      .sort((left, right) => right.score - left.score || left.title.length - right.title.length)
      .slice(0, input.limit),
  };
}

export function scoreResultForCategory(category: ResearchCoverageCategory, input: {
  title: string;
  url: string;
  content?: string | null;
  score?: number | null;
}, preferredDomains: string[] = [], sourceKind: "base" | "site" = "base", topicTerms: string[] = []) {
  const seed = `${input.title} ${input.content || ""} ${input.url}`.toLowerCase();
  let score = Number(input.score || 0);
  const hostname = getHostname(input.url);
  if (category === "official" && /(官网|官方|公告|文档|开发者|白皮书|政策|api|docs|documentation|help|announcement|official|policy|developer|github\.com\/[^/]+\/[^/]+(?:\/releases|\/wiki|$))/i.test(seed)) {
    score += 8;
  }
  if (category === "industry" && /(行业|报告|分析|趋势|市场|洞察|report|analysis|insight|market|research)/i.test(seed)) {
    score += 6;
  }
  if (category === "comparison" && /(对比|比较|竞品|替代|差异|vs\b|versus|benchmark|alternative)/i.test(seed)) {
    score += 8;
  }
  if (category === "userVoice" && /(用户|反馈|评论|口碑|体验|社区|论坛|review|reddit|forum|community|discussion|github\.com\/[^/]+\/[^/]+\/(?:issues|discussions))/i.test(seed)) {
    score += 8;
  }
  if (category === "timeline" && /(时间线|历史|更新|版本|演进|里程碑|发布|changelog|timeline|history|release|milestone|20\d{2})/i.test(seed)) {
    score += 8;
  }
  if (hasSubstantiveResearchSignals(seed)) {
    score += 10;
  }
  if (category === "userVoice" && hasFirstHandSignals(seed)) {
    score += 8;
  }
  if (preferredDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    score += 18;
  } else if (preferredDomains.length > 0) {
    score -= (
      category === "official" || category === "comparison" || category === "timeline"
        ? 20
        : category === "industry"
          ? 14
          : 10
    );
  }
  if (sourceKind === "site") {
    score += 10;
  }
  const matchedTopicTerms = topicTerms.filter((term) => seed.includes(term.toLowerCase()));
  if (matchedTopicTerms.length > 0) {
    score += Math.min(18, matchedTopicTerms.length * 8);
  } else if (topicTerms.length > 0) {
    score -= 30;
  }
  if (isLowSignalSearchResult(category, input)) {
    score -= 50;
  }
  if (isGenericResearchLandingPage(input)) {
    score -= category === "timeline" ? 10 : 18;
  }
  return score;
}

function isLowSignalSearchResult(category: ResearchCoverageCategory, input: {
  title: string;
  url: string;
  content?: string | null;
}) {
  const seed = `${input.title} ${input.content || ""} ${input.url}`.toLowerCase();
  if (/(clock|当前时间|北京时间|世界时间|time\.|onlinealarm|bjtime|syiban)/i.test(seed)) {
    return true;
  }
  if (category !== "userVoice" && /(zhihu\.com|tieba|bbs\.|forum|reddit|quora)/i.test(seed)) {
    return true;
  }
  if (category === "official" && /(zhihu\.com|tieba|bbs\.|forum|reddit|quora)/i.test(seed)) {
    return true;
  }
  if (category === "timeline" && !/(更新时间|版本|changelog|release|milestone|历史|时间线|演进|20\d{2})/i.test(seed)) {
    return true;
  }
  return false;
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

async function discoverSearchUrls(input: {
  articleTitle: string;
  knowledgeCards: Array<{ title: string; summary?: string | null }>;
  outlineNodes: Array<{ title: string; description?: string | null }>;
  limit: number;
  searchHints?: ResearchSearchHints;
}) {
  const plans = buildResearchSearchPlans({
    articleTitle: input.articleTitle,
    knowledgeCards: input.knowledgeCards,
    outlineNodes: input.outlineNodes,
    searchHints: input.searchHints,
  }).slice(0, 5);
  const topicTerms = buildTopicRelevanceTerms([
    input.articleTitle,
    input.searchHints?.topicTheme || "",
    input.searchHints?.researchObject || "",
    input.searchHints?.coreQuestion || "",
    input.searchHints?.coreAssertion || "",
    ...input.outlineNodes.map((item) => item.title || item.description || ""),
  ]);
  const responses = await Promise.all(
    plans.map(async (plan) => {
      const queryVariants = [
        { query: plan.query, kind: "base" as const },
        ...plan.siteQueries.map((query) => ({ query, kind: "site" as const })),
      ];
      const variantResults = await Promise.all(
        queryVariants.map(async (variant) => ({
          variant,
          searchResult: await searchResearchSources({
            query: variant.query,
            limit: Math.max(4, input.limit),
          }),
        })),
      );
      const ranked = variantResults
        .flatMap(({ variant, searchResult }) =>
          searchResult.results.map((item) => ({
            ...item,
            searchKind: variant.kind,
            categoryScore: scoreResultForCategory(plan.category, item, plan.preferredDomains, variant.kind, topicTerms),
          })),
        )
        .sort((left, right) => right.categoryScore - left.categoryScore);
      return {
        ...plan,
        variantResults,
        ranked,
      };
    }),
  );
  const discoveredUrls: string[] = [];
  const seenHosts = new Set<string>();
  for (const response of responses) {
    for (const result of response.ranked) {
      if (result.categoryScore <= 0 || isLowSignalSearchResult(response.category, result)) {
        continue;
      }
      if (discoveredUrls.includes(result.url)) {
        continue;
      }
      const host = getHostname(result.url);
      if (host && seenHosts.has(host) && discoveredUrls.length >= 3) {
        continue;
      }
      discoveredUrls.push(result.url);
      if (host) {
        seenHosts.add(host);
      }
      if (discoveredUrls.length >= input.limit) {
        break;
      }
    }
    if (discoveredUrls.length >= input.limit) {
      break;
    }
  }

  return {
    attempted: responses.some((item) => item.variantResults.some((variant) => variant.searchResult.attempted)),
    query: plans.map((item) => `${item.label}:${item.query}`).join(" | "),
    searchUrl: responses.flatMap((item) => item.variantResults).find((item) => item.searchResult.searchUrl)?.searchResult.searchUrl ?? null,
    discovered: discoveredUrls.slice(0, input.limit),
    error: responses.every((item) => item.variantResults.every((variant) => variant.searchResult.error))
      ? responses.flatMap((item) => item.variantResults.map((variant) => variant.searchResult.error)).filter(Boolean).join(" | ")
      : null,
    searches: responses.map((item) => ({
      category: item.category,
      label: item.label,
      query: item.query,
      preferredDomains: item.preferredDomains,
      searchUrl: item.variantResults.find((variant) => variant.variant.kind === "base")?.searchResult.searchUrl ?? null,
      resultCount: item.variantResults.reduce((sum, variant) => sum + variant.searchResult.results.length, 0),
      error: item.variantResults.every((variant) => variant.searchResult.error)
        ? item.variantResults.map((variant) => variant.searchResult.error).filter(Boolean).join(" | ")
        : null,
      siteQueries: item.siteQueries,
      topUrls: item.ranked.slice(0, 3).map((result) => result.url),
    })),
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
  searchHints?: ResearchSearchHints;
}) {
  const { seedUrls } = buildQuerySeeds({
    articleTitle: input.articleTitle,
    evidenceFragments: input.evidenceFragments,
  });
  const supplementIntensity = getResearchSupplementIntensity({
    articleTitle: input.articleTitle,
    searchHints: input.searchHints,
  });
  const nodes = await getArticleNodes(input.articleId);
  const existingAttachedUrls = new Set(
    nodes
      .flatMap((node) => node.fragments)
      .filter((fragment) => String(fragment.sourceType || "") === "url")
      .map((fragment) => String(fragment.sourceUrl || "").trim())
      .filter(Boolean),
  );
  const existingAttachedImaSignatures = new Set(
    nodes
      .flatMap((node) => node.fragments)
      .filter((fragment) => String(fragment.sourceType || "").trim() === "ima_kb")
      .map((fragment) =>
        [
          String(fragment.title || "").trim(),
          String(fragment.sourceUrl || "").trim(),
          truncateText(String(fragment.distilledContent || "").trim(), 80),
        ].join("::"),
      )
      .filter(Boolean),
  );
  const [imaResult, curatedPlans, broadSearchResult] = await Promise.all([
    discoverImaResearchItems({
      userId: input.userId,
      articleTitle: input.articleTitle,
      knowledgeCards: input.knowledgeCards,
      outlineNodes: input.outlineNodes,
      limit: supplementIntensity.imaLimit,
      planLimit: supplementIntensity.imaPlanLimit,
      searchHints: input.searchHints,
    }),
    filterReachableCuratedResearchPlans(buildCuratedResearchPlans({
      articleTitle: input.articleTitle,
      knowledgeCards: input.knowledgeCards,
      outlineNodes: input.outlineNodes,
      searchHints: input.searchHints,
      limit: supplementIntensity.curatedLimit,
    })),
    discoverSearchUrls({
      articleTitle: input.articleTitle,
      knowledgeCards: input.knowledgeCards,
      outlineNodes: input.outlineNodes,
      limit: supplementIntensity.searchLimit,
      searchHints: input.searchHints,
    }),
  ]);
  const searchResult = {
    ...broadSearchResult,
    discovered: broadSearchResult.discovered.slice(0, imaResult.items.length > 0 ? 4 : 6),
  };
  const candidateUrls = selectResearchCandidateUrls({
    seedUrls,
    curatedPlans,
    discoveredUrls: searchResult.discovered,
    limit: supplementIntensity.candidateUrlLimit,
  }).filter((url) => !existingAttachedUrls.has(url));
  const targetNodes = nodes.slice(0, Math.min(supplementIntensity.targetNodeLimit, nodes.length));
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
      attempted: seedUrls.length > 0 || searchResult.attempted || imaResult.attempted || curatedPlans.length > 0,
      query: uniqueStrings([imaResult.queries.join(" | "), searchResult.query], 2).join(" || "),
      searchUrl: searchResult.searchUrl,
      discoveredUrls: candidateUrls,
      imaQueries: imaResult.queries,
      imaDiscoveredTitles: imaResult.items.map((item) => item.title),
      imaError: imaResult.degradedReason,
      curatedSourceUrls: curatedPlans.map((item) => item.url),
      attached,
      skipped,
      failed,
      searchError: searchResult.error,
      searches: searchResult.searches,
      supplementIntensity,
    };
  }

  const imaItemsToAttach = imaResult.items.filter((item) => {
    const signature = [
      String(item.title || "").trim(),
      String(item.sourceUrl || "").trim(),
      truncateText(String(item.excerpt || "").trim(), 80),
    ].join("::");
    if (existingAttachedImaSignatures.has(signature)) {
      skipped.push(`ima:${item.mediaId}`);
      return false;
    }
    return true;
  });
  const localizedImaItems = await mapWithConcurrency(
    imaItemsToAttach,
    RESEARCH_SOURCE_LOCALIZATION_CONCURRENCY,
    async (item) => {
      try {
        return {
          item,
          localized: await localizeSourceMaterialToChinese({
            title: item.title,
            excerpt: item.excerpt,
            sourceUrl: item.sourceUrl,
          }),
          error: null as string | null,
        };
      } catch (error) {
        return {
          item,
          localized: null,
          error: error instanceof Error ? error.message : "IMA 研究补源失败",
        };
      }
    },
  );

  for (const [index, localizedItem] of localizedImaItems.entries()) {
    const item = localizedItem.item;
    const signature = [
      String(item.title || "").trim(),
      String(item.sourceUrl || "").trim(),
      truncateText(String(item.excerpt || "").trim(), 80),
    ].join("::");
    if (localizedItem.error || !localizedItem.localized) {
      failed.push({
        url: item.sourceUrl || `ima:${item.mediaId}`,
        error: localizedItem.error || "IMA 研究补源失败",
      });
      continue;
    }
    try {
      const localized = localizedItem.localized;
      const fragment = await createFragment({
        userId: input.userId,
        sourceType: "ima_kb",
        title: localized.localizedTitle || item.title,
        rawContent: item.excerpt,
        distilledContent: localized.composedChineseContent || item.excerpt,
        sourceUrl: item.sourceUrl,
        sourceMeta: {
          localization: localized,
          originalTitle: item.title,
          originalExcerpt: item.excerpt,
          sourceQuery: item.query,
        },
      });
      if (!fragment?.id) {
        skipped.push(`ima:${item.mediaId}`);
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
        title: String(fragment.title || item.title || "").trim(),
        sourceUrl: String(fragment.source_url || item.sourceUrl || "").trim() || null,
      });
      existingAttachedImaSignatures.add(signature);
    } catch (error) {
      failed.push({
        url: item.sourceUrl || `ima:${item.mediaId}`,
        error: error instanceof Error ? error.message : "IMA 研究补源失败",
      });
    }
  }

  const distilledResults = await Promise.all(
    candidateUrls.map(async (url) => {
      try {
        const distilled = await distillCaptureInput({
          sourceType: "url",
          title: null,
          url,
        });
        if (distilled.retryRecommended || distilled.degradedReason) {
          return {
            url,
            distilled: null,
            error: distilled.degradedReason || "研究补源链接不可用",
          };
        }
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

  const localizableDistilledResults = distilledResults
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => {
      if (result.error || !result.distilled) {
        failed.push({
          url: result.url,
          error: result.error || "研究补源抓取失败",
        });
        return false;
      }
      return true;
    });
  const localizedDistilledResults = await mapWithConcurrency(
    localizableDistilledResults,
    RESEARCH_SOURCE_LOCALIZATION_CONCURRENCY,
    async ({ result, index }) => {
      const distilled = result.distilled!;
      try {
        return {
          result,
          index,
          localized: await localizeSourceMaterialToChinese({
            title: distilled.title,
            excerpt: distilled.distilledContent,
            rawContent: distilled.rawContent,
            sourceUrl: distilled.sourceUrl || result.url,
          }),
          error: null as string | null,
        };
      } catch (error) {
        return {
          result,
          index,
          localized: null,
          error: error instanceof Error ? error.message : "研究补源抓取失败",
        };
      }
    },
  );

  for (const localizedResult of localizedDistilledResults) {
    const { result, index } = localizedResult;
    if (result.error || !result.distilled) {
      failed.push({
        url: result.url,
        error: result.error || "研究补源抓取失败",
      });
      continue;
    }
    if (localizedResult.error || !localizedResult.localized) {
      failed.push({
        url: result.url,
        error: localizedResult.error || "研究补源抓取失败",
      });
      continue;
    }
    try {
      const distilled = result.distilled;
      const localized = localizedResult.localized;
      const fragment = await createFragment({
        userId: input.userId,
        sourceType: "url",
        title: localized.localizedTitle || distilled.title,
        rawContent: distilled.rawContent,
        distilledContent: localized.composedChineseContent || distilled.distilledContent,
        sourceUrl: distilled.sourceUrl || result.url,
        sourceMeta: {
          localization: localized,
          originalTitle: distilled.title,
          originalDistilledContent: distilled.distilledContent,
        },
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
    attempted: seedUrls.length > 0 || searchResult.attempted || imaResult.attempted || curatedPlans.length > 0,
    query: uniqueStrings([imaResult.queries.join(" | "), searchResult.query], 2).join(" || "),
    searchUrl: searchResult.searchUrl,
    discoveredUrls: candidateUrls,
    imaQueries: imaResult.queries,
    imaDiscoveredTitles: imaResult.items.map((item) => item.title),
    imaError: imaResult.degradedReason,
    curatedSourceUrls: curatedPlans.map((item) => item.url),
    attached,
    skipped,
    failed,
    searchError: searchResult.error,
    searches: searchResult.searches,
    supplementIntensity,
  };
}
