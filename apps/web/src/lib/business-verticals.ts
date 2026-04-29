export type VerticalTopicCategory =
  | "business_case"
  | "tool_evaluation"
  | "operator_log"
  | "saas_growth"
  | "github_tools"
  | "solution_playbook"
  | "overseas_income"
  | "career"
  | "affiliate_marketing"
  | "search_marketing"
  | "ai_products"
  | "side_hustles"
  | "generic";

const NON_GENERIC_VERTICALS: VerticalTopicCategory[] = [
  "business_case",
  "tool_evaluation",
  "operator_log",
  "saas_growth",
  "github_tools",
  "solution_playbook",
  "overseas_income",
  "career",
  "affiliate_marketing",
  "search_marketing",
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
    category: "business_case",
    pattern:
      /(商业案例|案例拆解|公司案例|创业案例|商业分析|品牌案例|公司为什么|创始人|ceo|融资|估值|营收|收入结构|利润|收购|上市|护城河|商业模式|增长飞轮|创业公司|独角兽)/i,
    score: 4,
  },
  {
    category: "tool_evaluation",
    pattern:
      /(产品评测|工具评测|工具推荐|效率工具|评测|测评|上手|对比评测|值不值得|好不好用|替代方案|横向对比|体验报告|开箱|测了一圈|实用工具|试用后|体验完|用了两周|实际体验|替代谁)/i,
    score: 4,
  },
  {
    category: "operator_log",
    pattern:
      /(实操记录|实操复盘|复盘记录|操作复盘|踩坑复盘|增长复盘|我试了|我跑了一遍|亲测|实测|从零做到|手把手记录|一周记录|项目记录|增长日志|实验记录)/i,
    score: 4,
  },
  {
    category: "saas_growth",
    pattern:
      /(saas|mrr|arr|churn|留存|续费|获客成本|ltv|plg|seat-based|定价页|定价策略|试用转化|企业付费|客户成功|续约|订阅收入|软件增长)/i,
    score: 4,
  },
  {
    category: "github_tools",
    pattern:
      /(github\s*项目|github\s*仓库|github\s*star|开源项目|开源工具|\brepo\b|\brepository\b|\bcli\b\s*工具|\bsdk\b|插件项目|脚手架|开发工具|程序员工具|chrome extension|vscode 插件|\bmcp\b|model context protocol|协议层|开发者工作流|开源神器|\bstar\b|星标|多模型切换)/i,
    score: 4,
  },
  {
    category: "solution_playbook",
    pattern:
      /(解决方案|工作流|自动化方案|实践方案|落地方案|操作手册|实施路径|最佳实践|打法拆解|流程设计|方案选型|模板方案|增长方案|交付方案|落地手册|进生产|生产环境|接入方案|接入成本|流程改造|自动化闭环|落地路径)/i,
    score: 4,
  },
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
    category: "search_marketing",
    pattern:
      /(搜索广告|搜索意图|关键词|谷歌广告|google ads|adwords|sem|ppc|投放|质量得分|quality score|match type|keyword match|search intent|landing page experience|广告相关性)/i,
    score: 5,
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
    business_case: 0,
    tool_evaluation: 0,
    operator_log: 0,
    saas_growth: 0,
    github_tools: 0,
    solution_playbook: 0,
    overseas_income: 0,
    career: 0,
    affiliate_marketing: 0,
    search_marketing: 0,
    ai_products: 0,
    side_hustles: 0,
    generic: 0,
  };

  for (const rule of VERTICAL_RULES) {
    if (rule.pattern.test(seed)) {
      scores[rule.category] += rule.score;
    }
  }

  if (/(\bmcp\b|model context protocol|协议|\bsdk\b|\bcli\b|插件|脚手架|仓库|\bstar\b|星标|开源神器|开发者工作流)/i.test(seed)) {
    scores.github_tools += 2;
  }
  if (/(工作流|进生产|生产环境|接入|落地|流程改造|自动化闭环|最佳实践)/i.test(seed)) {
    scores.solution_playbook += 2;
  }
  if (/(值不值得|上手|体验完|对比|替代|测了一圈|实际体验|试用后)/i.test(seed)) {
    scores.tool_evaluation += 2;
  }
  if (
    scores.ai_products > 0
    && [
      scores.business_case,
      scores.tool_evaluation,
      scores.operator_log,
      scores.saas_growth,
      scores.github_tools,
      scores.solution_playbook,
      scores.overseas_income,
      scores.affiliate_marketing,
      scores.search_marketing,
      scores.side_hustles,
    ].some((value) => value >= 4)
  ) {
    scores.ai_products = Math.max(0, scores.ai_products - 2);
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
