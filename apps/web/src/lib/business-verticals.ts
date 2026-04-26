export type VerticalTopicCategory =
  | "overseas_income"
  | "career"
  | "affiliate_marketing"
  | "ai_products"
  | "side_hustles"
  | "generic";

const NON_GENERIC_VERTICALS: VerticalTopicCategory[] = [
  "overseas_income",
  "career",
  "affiliate_marketing",
  "ai_products",
  "side_hustles",
];

type VerticalRule = {
  category: VerticalTopicCategory;
  pattern: RegExp;
  score: number;
};

const VERTICAL_RULES: VerticalRule[] = [
  {
    category: "overseas_income",
    pattern:
      /(海外赚美金|赚美金|美元收入|美金收入|海外客户|出海赚钱|跨境赚钱|remote work|remote job|digital nomad|freelance|upwork|fiverr|gumroad|etsy|stripe|wise)/i,
    score: 3,
  },
  {
    category: "career",
    pattern:
      /(职场|升职|裁员|绩效|管理|老板|求职|面试|职业发展|职业安全感|团队协作|office politics|career|product manager|manager|remote job|hiring|job search)/i,
    score: 3,
  },
  {
    category: "affiliate_marketing",
    pattern:
      /(联盟营销|affiliate|cps|cpa|佣金|amazon associates|partnerstack|impact.com|seo 变现|站长|seo traffic)/i,
    score: 3,
  },
  {
    category: "ai_products",
    pattern:
      /(ai产品|ai 工具|agent 产品|模型产品|ai saas|ai创业|产品化|prompt 产品|产品发布|product hunt|llm app|agentic|大模型|llm|模型能力|ai 写作|ai writing)/i,
    score: 3,
  },
  {
    category: "side_hustles",
    pattern:
      /(副业|兼职|第二收入|side hustle|一人公司|小生意|个人品牌变现|被动收入|下班后赚钱|线上副业|creator business)/i,
    score: 3,
  },
];

function buildVerticalScores(values: string[]) {
  const seed = values.join(" ").toLowerCase();
  const scores: Record<VerticalTopicCategory, number> = {
    overseas_income: 0,
    career: 0,
    affiliate_marketing: 0,
    ai_products: 0,
    side_hustles: 0,
    generic: 0,
  };

  for (const rule of VERTICAL_RULES) {
    if (rule.pattern.test(seed)) {
      scores[rule.category] += rule.score;
    }
  }

  return scores;
}

export function normalizeVerticalTopicCategories(values: Array<string | null | undefined>) {
  const seen = new Set<VerticalTopicCategory>();
  const normalized: VerticalTopicCategory[] = [];
  for (const value of values) {
    const candidate = String(value || "").trim() as VerticalTopicCategory;
    if (!NON_GENERIC_VERTICALS.includes(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }
  return normalized;
}

export function detectVerticalTopicCategories(values: string[]) {
  const scores = buildVerticalScores(values);
  return NON_GENERIC_VERTICALS
    .filter((category) => scores[category] > 0)
    .sort((left, right) => scores[right] - scores[left]);
}

export function detectVerticalTopicCategory(values: string[]): VerticalTopicCategory {
  return detectVerticalTopicCategories(values)[0] || "generic";
}
