import {
  detectVerticalTopicCategory,
  type VerticalTopicCategory,
} from "./business-verticals";

export type Plan24MechanismLabel =
  | "数字锚点"
  | "实体事件解释"
  | "反常识翻转"
  | "问题悬念"
  | "风险提醒"
  | "场景实测";

export type AuthorPostureMode =
  | "case_breakdown"
  | "operator_test"
  | "analysis_interpreter";

export type BusinessMonetizationCorpusProfile = {
  topicMix: {
    aiProducts: number;
    businessCases: number;
    toolEvaluations: number;
    operatorLogs: number;
    githubTools: number;
    overseasIncome: number;
    saasGrowth: number;
    sideHustles: number;
  };
  dominantTitleMechanisms: string[];
  dominantAuthorPostures: string[];
  dominantEmotionVectors: string[];
  sparseTracks: string[];
  firstScreenRules: string[];
  evidenceRecipes: string[];
  visualRules: string[];
};

export type Plan24VerticalProfile = {
  key: VerticalTopicCategory | "generic_business";
  category: string;
  sampleCount: number;
  accountCount: number;
  sparseTrack: boolean;
  coverageNote: string;
  keywords: string[];
  dominantMechanisms: Plan24MechanismLabel[];
  openingJobs: string[];
  openingEngines: string[];
  readerShareReasons: string[];
  materialJobs: string[];
  evidencePriorities: string[];
  evidenceRecipes: string[];
  emotionVectors: string[];
  negativePatterns: string[];
  readerSceneAnchors: string[];
  abstractToConcretePairs: Array<{
    abstract: string;
    concrete: string;
  }>;
  openingMicroScenes: string[];
  businessQuestions: string[];
  authorPostureModes: AuthorPostureMode[];
  narrativeSkeletons: string[];
  visualProfile: {
    averageImageCount: number;
    dominantFirstImageTiming: "opening_hook" | "first_screen_support";
    firstScreenImageRole: string;
  };
};

export const PLAN24_CORPUS_SUMMARY = {
  source: "plan24_business_monetization_100",
  generatedAt: "2026-04-29",
  sampleCount: 100,
  categoryCount: 8,
  accountCount: 15,
  maxCategoryRatio: 0.35,
  maxAccountRatio: 0.14,
  averageTextLength: 5772,
  averageImageCount: 13.4,
  averageDidacticSignal: 0.83,
  globalMechanisms: [
    { label: "数字锚点" as const, count: 42 },
    { label: "实体事件解释" as const, count: 28 },
    { label: "反常识翻转" as const, count: 25 },
    { label: "问题悬念" as const, count: 18 },
    { label: "风险提醒" as const, count: 10 },
    { label: "场景实测" as const, count: 10 },
  ],
};

export const BUSINESS_MONETIZATION_CORPUS_PROFILE: BusinessMonetizationCorpusProfile = {
  topicMix: {
    aiProducts: 35,
    businessCases: 23,
    toolEvaluations: 14,
    operatorLogs: 5,
    githubTools: 11,
    overseasIncome: 2,
    saasGrowth: 9,
    sideHustles: 1,
  },
  dominantTitleMechanisms: ["数字结果", "工具产品名", "反常识翻转", "身份实体", "实体事件解释"],
  dominantAuthorPostures: ["案例拆解者", "实测者", "分析解释者"],
  dominantEmotionVectors: ["身份代入", "好奇心", "机会感", "效率冲动"],
  sparseTracks: ["GitHub项目与开发工具", "出海与赚美金", "副业与个人变现", "SaaS与软件增长"],
  firstScreenRules: [
    "前 120 字先交代具体对象、正在发生的变化和读者会感到的后果。",
    "前 200 字必须给出半步答案，不用趋势背景暖场。",
    "数字、截图、产品动作和案例角色优先于抽象结论。",
  ],
  evidenceRecipes: [
    "数字/结果 + 案例主体 + 原话引用",
    "实测动作 + 工具平台 + 成本/差异",
    "变化结论 + 钱流结构 + 不适合谁",
  ],
  visualRules: [
    "首图优先承担 opening hook 或 first screen support。",
    "中段图片优先承担对比、截图、账本或结构换气。",
    "尾段图片优先承担总结、保存或行动回收，不做装饰图。",
  ],
};

const SHARED_BUSINESS_QUESTIONS = [
  "这篇文章里，谁在赚钱、亏钱、降本或抢时间？",
  "钱具体从哪里来，或者成本具体卡在哪里？",
  "为什么这个变化是现在，不是去年？",
  "这个机会或问题影响的是哪一类人？",
  "哪些人不适合照着做，或者不该跟进？",
  "一条最可信的案例、账本、截图或原话证据是什么？",
  "读者读完后最可能转发给谁，为什么？",
];

const SHARED_NEGATIVE_PATTERNS = [
  "先讲趋势背景再慢慢落地",
  "把全文写成操作课或方法清单",
  "只有判断没有账本、角色或产品动作",
  "抽象词堆叠，读者看不到对象、变化和后果",
];

const PLAN24_VERTICAL_PROFILES: Plan24VerticalProfile[] = [
  {
    key: "ai_products",
    category: "AI产品与Agent",
    sampleCount: 35,
    accountCount: 10,
    sparseTrack: false,
    coverageNote: "当前样本对 AI 产品、Agent、模型能力变化和产品动作已有足够覆盖。",
    keywords: ["ai产品", "agent", "模型", "智能体", "发布", "开源", "提示词", "产品化", "推理", "算力", "大模型"],
    dominantMechanisms: ["数字锚点", "反常识翻转", "实体事件解释"],
    openingJobs: [
      "先给出一个产品、模型、团队或发布动作已经改写流程的瞬间。",
      "把能力提升翻译成时间差、成本差或责任迁移，而不是重复参数。",
      "第一屏让读者看到旧流程哪里开始显得笨重。",
    ],
    openingEngines: ["工具实测结论先抛", "公司/创始人/产品动作先抛", "账本/结果先抛"],
    readerShareReasons: [
      "文章替读者判断一个 AI 变化是真机会还是热闹。",
      "文章把复杂技术动作翻译成产品、团队或预算层面的现实后果。",
      "文章给了一个能转给同事的判断句，而不是一串参数。",
    ],
    materialJobs: ["产品动作", "数字结果", "使用场景", "角色分化", "时间窗口"],
    evidencePriorities: ["产品发布或开源动作", "关键数字", "前后对照", "适用场景", "限制条件"],
    evidenceRecipes: ["数字/结果 + 案例主体 + 原话引用", "产品动作 + 工作流变化 + 谁受益谁吃亏"],
    emotionVectors: ["身份代入", "好奇心", "机会感", "效率冲动"],
    negativePatterns: ["只复述发布内容", "堆模型黑话", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["产品后台", "团队试用群", "演示视频", "发布会当天", "工位上的复盘"],
    abstractToConcretePairs: [
      { abstract: "能力变强", concrete: "原来要两个人盯的环节，现在一个人半小时就能跑完第一轮" },
      { abstract: "旧流程失效", concrete: "团队还在按老顺序补材料，结果卡在核查和发布这一步" },
      { abstract: "产品机会", concrete: "不是又多一个工具，而是有人开始省下一整段协作成本" },
    ],
    openingMicroScenes: [
      "从一次产品动作、一次测试结果或一次团队试用反馈起手。",
      "先写谁的工作被改快了，谁的旧经验开始不够用。",
      "第一句就让读者看到这次变化已经落到工具、时间或责任上。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["case_breakdown", "operator_test", "analysis_interpreter"],
    narrativeSkeletons: [
      "一个新动作 -> 旧规则失效 -> 哪类人先受影响 -> 真实代价 -> 新判断标准",
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 13.9,
      dominantFirstImageTiming: "opening_hook",
      firstScreenImageRole: "优先用产品截图、结果图或对照图把变化先摆到读者眼前。",
    },
  },
  {
    key: "business_case",
    category: "商业案例与创业",
    sampleCount: 23,
    accountCount: 7,
    sparseTrack: false,
    coverageNote: "当前样本对公司动作、创始人判断、创业案例和商业后果已有较强覆盖。",
    keywords: ["创业", "公司", "品牌", "创始人", "融资", "估值", "收购", "营收", "商业模式", "案例拆解", "创业者"],
    dominantMechanisms: ["数字锚点", "实体事件解释", "反常识翻转"],
    openingJobs: [
      "先把公司、创始人、组织动作或账本结果抛出来。",
      "尽快交代谁在承压、谁在受益、老解释为什么不够用了。",
      "第一屏先写谁在为这次误判买单。",
    ],
    openingEngines: ["公司/创始人/产品动作先抛", "账本/结果先抛", "误判代价先抛"],
    readerShareReasons: [
      "文章替读者说清一场业务复盘里不好直说的错位。",
      "文章把专业指标翻译成真实经营代价。",
      "文章给同行一个能在会上复述的判断，而不是一套培训话术。",
    ],
    materialJobs: ["公司动作", "账本数字", "组织冲突", "时间窗口", "后果代价"],
    evidencePriorities: ["经营结果", "组织动作", "关键变量", "同类对照", "边界条件"],
    evidenceRecipes: ["数字/结果 + 案例主体 + 原话引用", "对象动作 + 表面解释 + 真正变量"],
    emotionVectors: ["身份代入", "机会感", "好奇心", "效率冲动"],
    negativePatterns: ["把商业问题写成课堂笔记", "只谈趋势不谈账本", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["复盘会", "预算表", "老板追问", "团队周会", "经营日报"],
    abstractToConcretePairs: [
      { abstract: "商业后果", concrete: "不是品牌声量变了，而是这笔预算花出去有没有换回更值钱的动作" },
      { abstract: "组织错位", concrete: "会上的人都在修执行细节，却没人先问真正影响结果的是不是这个变量" },
      { abstract: "机会窗口", concrete: "别人已经换了打法，你还在按去年的顺序做判断" },
    ],
    openingMicroScenes: [
      "从一次复盘会、一张预算表或一句老板追问起手。",
      "先把钱花了但结果没来的那一下写出来。",
      "不要先讲行业趋势，先写谁在为这次判断付代价。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["case_breakdown", "analysis_interpreter"],
    narrativeSkeletons: [
      "对象动作 -> 表面解释 -> 真正变量 -> 后果/代价 -> 读者如何对照自己",
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 14.7,
      dominantFirstImageTiming: "opening_hook",
      firstScreenImageRole: "优先用数据表、组织图或业务流程图降低抽象度。",
    },
  },
  {
    key: "tool_evaluation",
    category: "产品评测与效率工具",
    sampleCount: 14,
    accountCount: 5,
    sparseTrack: false,
    coverageNote: "当前样本对工具评测、效率工具和是否值得换的判断已有中等覆盖。",
    keywords: ["评测", "测评", "工具", "效率", "对比", "值不值", "替代", "推荐", "上手", "体验"],
    dominantMechanisms: ["数字锚点", "反常识翻转", "场景实测"],
    openingJobs: [
      "先给出实测结论，再补过程。",
      "第一屏把最强场景、最差场景或替代关系说清楚。",
      "让读者先知道这是不是一个值得换的工具。",
    ],
    openingEngines: ["工具实测结论先抛", "误判代价先抛", "账本/结果先抛"],
    readerShareReasons: [
      "文章替读者节省试错时间。",
      "文章说清工具到底适合谁、不适合谁。",
      "文章把使用门槛和成本差写得能直接转给同事。",
    ],
    materialJobs: ["实测动作", "工具界面", "对比对象", "成本差异", "适用边界"],
    evidencePriorities: ["实测结果", "对比样本", "成本或时长差", "最佳场景", "最差场景"],
    evidenceRecipes: ["实测动作 + 工具平台 + 成本/差异", "最佳场景 + 最差场景 + 是否值得换"],
    emotionVectors: ["效率冲动", "好奇心", "机会感", "身份代入"],
    negativePatterns: ["种草清单口吻", "只夸功能不写门槛", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["工具面板", "对比表", "第一次上手", "团队协作页", "付款前的那一分钟"],
    abstractToConcretePairs: [
      { abstract: "效率提升", concrete: "不是感觉更顺手，而是同样一轮工作少切了三四次页面" },
      { abstract: "不适合谁", concrete: "如果你还没跑到这个规模，这个工具大概率只会让流程更重" },
      { abstract: "值得换", concrete: "你换完之后第二天还会继续用，而不是装完就放那儿" },
    ],
    openingMicroScenes: [
      "从一次实测结果或一次替换前后的差异起手。",
      "第一句先说值不值，再说为什么。",
      "让读者马上知道这是不是自己该试的那类工具。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "实测结论 -> 使用门槛 -> 最强场景 -> 最差场景 -> 是否值得换",
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 10.6,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "首图优先证明界面、结果或对比，而不是做装饰配图。",
    },
  },
  {
    key: "operator_log",
    category: "实操复盘与解决方案",
    sampleCount: 5,
    accountCount: 4,
    sparseTrack: false,
    coverageNote: "当前样本对实操复盘、亲测踩坑和解决方案文章已有中等覆盖。",
    keywords: ["复盘", "踩坑", "实操", "亲测", "记录", "流程", "实践", "方案", "操作", "实验"],
    dominantMechanisms: ["数字锚点", "问题悬念", "场景实测"],
    openingJobs: [
      "先给读者已经发生的卡点、误判或试错代价。",
      "尽早把这次复盘里最硬的一条结论抛出来。",
      "先写动作和结果，再解释为什么。",
    ],
    openingEngines: ["误判代价先抛", "工具实测结论先抛", "岗位/行业变化现场先抛"],
    readerShareReasons: [
      "文章替读者少走一遍弯路。",
      "文章把踩坑和有效路径都写成可判断的边界。",
      "文章能被转给正在做同件事的人直接参考。",
    ],
    materialJobs: ["复盘现场", "步骤动作", "关键截图", "账本差异", "适用边界"],
    evidencePriorities: ["复盘动作", "结果变化", "为什么有效或失效", "不适用人群", "反例"],
    evidenceRecipes: ["实测动作 + 工具平台 + 成本/差异", "变化结论 + 钱流结构 + 不适合谁"],
    emotionVectors: ["身份代入", "效率冲动", "机会感", "好奇心"],
    negativePatterns: ["流水账记录", "一上来教读者做事", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["后台截图", "流程节点", "失败的那一轮", "复盘笔记", "重新跑通的那一下"],
    abstractToConcretePairs: [
      { abstract: "踩坑经验", concrete: "不是提醒你小心，而是把我在哪一步多花了钱、卡了多久写给你看" },
      { abstract: "解决方案", concrete: "不是给一套万能模板，而是说清哪种条件下这条路能跑通" },
      { abstract: "方法有效", concrete: "结果不是‘感觉变好了’，而是关键指标真的抬了一截" },
    ],
    openingMicroScenes: [
      "从一次踩坑、一段后台记录或一次重跑成功的瞬间起手。",
      "先写哪一步最疼，再写怎么转过来。",
      "前两句把动作和结果交代清楚，不先讲原理。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
      "实测结论 -> 使用门槛 -> 最强场景 -> 最差场景 -> 是否值得换",
    ],
    visualProfile: {
      averageImageCount: 10.6,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "首图优先证明卡点、结果或对比，帮助第一屏直接降低理解成本。",
    },
  },
  {
    key: "solution_playbook",
    category: "实操复盘与解决方案",
    sampleCount: 5,
    accountCount: 4,
    sparseTrack: false,
    coverageNote: "当前样本对解决方案、工作流和落地路径有中等覆盖，但仍需真实场景驱动。",
    keywords: ["解决方案", "工作流", "自动化", "最佳实践", "落地", "路线图", "方案", "模板", "交付"],
    dominantMechanisms: ["数字锚点", "问题悬念", "实体事件解释"],
    openingJobs: [
      "先写为什么旧办法不够用了，再给半步新路径。",
      "第一屏把对象、变化和读者会承担的代价钉住。",
      "不要把开头写成操作导语。",
    ],
    openingEngines: ["误判代价先抛", "岗位/行业变化现场先抛", "账本/结果先抛"],
    readerShareReasons: [
      "文章替读者判断这套方案值不值得上。",
      "文章把流程写成有边界的判断，不是无差别模板。",
      "文章适合转给同事做对齐，而不是做培训材料。",
    ],
    materialJobs: ["现状卡点", "方案动作", "成本差", "角色分工", "不适合谁"],
    evidencePriorities: ["旧办法卡点", "方案动作", "结果差异", "适用边界", "需要额外投入的地方"],
    evidenceRecipes: ["变化结论 + 钱流结构 + 不适合谁", "实测动作 + 工具平台 + 成本/差异"],
    emotionVectors: ["身份代入", "效率冲动", "机会感"],
    negativePatterns: ["模板口吻", "泛最佳实践", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["流程图", "交接点", "出问题的节点", "切换前后", "周会对齐"],
    abstractToConcretePairs: [
      { abstract: "落地路径", concrete: "不是给你一张大图，而是说清先换哪个节点最省钱" },
      { abstract: "方案价值", concrete: "不是看起来更先进，而是少掉哪几个反复返工的步骤" },
      { abstract: "边界", concrete: "如果团队规模和数据量没到这一步，这套方案会先变成额外负担" },
    ],
    openingMicroScenes: [
      "从旧方案卡住的一刻起手。",
      "先写谁在返工、谁在等结果、谁在继续付成本。",
      "第一屏先给半步解法，再交代为什么轮到现在。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
      "一个新动作 -> 原规则失效 -> 哪类人先受影响 -> 真实代价 -> 新判断标准",
    ],
    visualProfile: {
      averageImageCount: 10.6,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先使用路径图、流程图或截图承接解释，不做“痛点引入”式装饰图。",
    },
  },
  {
    key: "github_tools",
    category: "GitHub项目与开发工具",
    sampleCount: 11,
    accountCount: 5,
    sparseTrack: true,
    coverageNote: "GitHub 项目与开发工具在当前百篇里只有少量样本，生成时必须提高外部研究补源强度。",
    keywords: ["github", "star", "repo", "开源项目", "开发工具", "cli", "sdk", "仓库", "插件", "编程工具"],
    dominantMechanisms: ["数字锚点", "问题悬念", "风险提醒"],
    openingJobs: [
      "先抛出项目、仓库或工具动作带来的具体变化。",
      "把 star、issue、速度或体验差翻译成真正相关的开发者后果。",
      "第一屏不要把开源热闹写成抽象趋势。",
    ],
    openingEngines: ["工具实测结论先抛", "公司/创始人/产品动作先抛", "误判代价先抛"],
    readerShareReasons: [
      "文章帮开发者判断一个项目到底是热闹还是真能用。",
      "文章把 GitHub 指标翻译成上手门槛和真实收益。",
    ],
    materialJobs: ["仓库动作", "star/issue 数字", "上手结果", "开发场景", "适用边界"],
    evidencePriorities: ["仓库动作", "关键指标", "上手结果", "对比项目", "不适用场景"],
    evidenceRecipes: ["实测动作 + 工具平台 + 成本/差异", "数字/结果 + 案例主体 + 原话引用"],
    emotionVectors: ["好奇心", "效率冲动", "机会感"],
    negativePatterns: ["只报 star 不写能不能用", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["仓库页", "issue 区", "readme", "本地终端", "开发环境"],
    abstractToConcretePairs: [
      { abstract: "项目很火", concrete: "不是 star 多就完了，而是你装完十分钟内能不能跑出结果" },
      { abstract: "开发效率", concrete: "不是听说更强，而是少写了多少胶水代码、少踩了几个坑" },
      { abstract: "风险", concrete: "readme 漂亮不代表维护稳定，真正麻烦的是关键 issue 一直没人收" },
    ],
    openingMicroScenes: [
      "从一次上手结果或一次仓库动作起手。",
      "先写值不值得点开、装上、接入，而不是先讲开源趋势。",
      "第一句就把仓库指标和开发后果连起来。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "实测结论 -> 使用门槛 -> 最强场景 -> 最差场景 -> 是否值得换",
      "对象动作 -> 表面解释 -> 真正变量 -> 后果/代价 -> 读者如何对照自己",
    ],
    visualProfile: {
      averageImageCount: 18.3,
      dominantFirstImageTiming: "opening_hook",
      firstScreenImageRole: "首图优先放仓库页、对比图或结果图，帮助读者快速建立判断。",
    },
  },
  {
    key: "overseas_income",
    category: "出海与赚美金",
    sampleCount: 2,
    accountCount: 2,
    sparseTrack: true,
    coverageNote: "出海与赚美金在当前百篇中覆盖偏薄，必须补平台规则、收款方式和真实案例。",
    keywords: ["赚美金", "出海", "海外客户", "remote", "freelance", "gumroad", "stripe", "wise", "etsy"],
    dominantMechanisms: ["数字锚点", "问题悬念", "风险提醒"],
    openingJobs: [
      "先写钱从哪里来，或者钱卡在了哪里。",
      "第一屏就把平台、客户或收款节点写出来。",
      "不要把出海写成热词，要写成一笔具体现金流。",
    ],
    openingEngines: ["账本/结果先抛", "误判代价先抛", "岗位/行业变化现场先抛"],
    readerShareReasons: [
      "文章帮读者判断这条收入路径到底稳不稳。",
      "文章替读者把平台规则、抽成和收款门槛说清楚。",
    ],
    materialJobs: ["钱流路径", "平台规则", "真实案例", "成本节点", "适用边界"],
    evidencePriorities: ["收入路径", "收款方式", "平台规则", "真实案例", "不适合谁"],
    evidenceRecipes: ["变化结论 + 钱流结构 + 不适合谁", "数字/结果 + 案例主体 + 原话引用"],
    emotionVectors: ["机会感", "身份代入", "好奇心"],
    negativePatterns: ["只喊出海机会", "只讲副业想象不讲钱流", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["收款后台", "平台条款", "报价单", "海外客户邮件", "提现那一步"],
    abstractToConcretePairs: [
      { abstract: "赚美金机会", concrete: "不是说有市场，而是这笔钱最后能不能稳稳进你账户" },
      { abstract: "平台门槛", concrete: "不是注册就能开始，而是抽成、税务和提现哪一步最容易卡住" },
      { abstract: "适合谁", concrete: "如果你还没有稳定交付能力，这条路先来的可能是退款和焦虑" },
    ],
    openingMicroScenes: [
      "从一笔收入、一段平台规则或一次提现卡点起手。",
      "第一句先给钱流，不先讲全球趋势。",
      "先写读者最想确认的那一步：钱到底怎么进来。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 6.5,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先用账本、平台后台或路径图承接钱流判断。",
    },
  },
  {
    key: "side_hustles",
    category: "副业与个人变现",
    sampleCount: 1,
    accountCount: 1,
    sparseTrack: true,
    coverageNote: "副业与个人变现在当前百篇中覆盖极薄，生成时不能假装已有充分样本支撑。",
    keywords: ["副业", "第二收入", "个人变现", "一人公司", "接单", "个人品牌", "creator business"],
    dominantMechanisms: ["数字锚点", "问题悬念", "风险提醒"],
    openingJobs: [
      "先把副业里的钱流、时间投入或失败代价摆到台面上。",
      "第一屏就写清这件事影响的是哪类人。",
      "不要一上来承诺结果。",
    ],
    openingEngines: ["账本/结果先抛", "误判代价先抛", "岗位/行业变化现场先抛"],
    readerShareReasons: [
      "文章替读者判断这条副业路是不是值得开始。",
      "文章把时间、现金流和不适合谁说清楚了。",
    ],
    materialJobs: ["钱流路径", "时间投入", "真实案例", "失败代价", "边界条件"],
    evidencePriorities: ["收入结构", "投入时间", "真实案例", "失败原因", "不适合谁"],
    evidenceRecipes: ["变化结论 + 钱流结构 + 不适合谁", "数字/结果 + 案例主体 + 原话引用"],
    emotionVectors: ["机会感", "身份代入", "风险感"],
    negativePatterns: ["副业鸡汤", "只讲可能性不讲代价", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["下班后的两个小时", "接第一单", "提现记录", "朋友圈试水", "周末复盘"],
    abstractToConcretePairs: [
      { abstract: "副业机会", concrete: "不是听起来能赚，而是你下班后有没有精力把它做成一笔稳定收入" },
      { abstract: "个人变现", concrete: "不是发几条内容就行，而是第一笔钱到底从哪里来" },
      { abstract: "时间成本", concrete: "如果这件事每周要吞掉你两个晚上，它到底值不值那点回报" },
    ],
    openingMicroScenes: [
      "从第一笔钱、第一次试水或一次失败复盘起手。",
      "先写代价和边界，不先画饼。",
      "第一句要让读者看到‘这件事和我这类人到底有没有关系’。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 16.0,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先用收支表、时间分配图或案例截图承接第一屏判断。",
    },
  },
  {
    key: "saas_growth",
    category: "SaaS与软件增长",
    sampleCount: 9,
    accountCount: 4,
    sparseTrack: true,
    coverageNote: "SaaS 与软件增长在当前百篇中几乎没有直接样本，必须强补留存、续费、获客和定价证据。",
    keywords: ["saas", "arr", "mrr", "续费", "留存", "churn", "plg", "定价", "试用转化", "软件增长"],
    dominantMechanisms: ["数字锚点", "反常识翻转"],
    openingJobs: [
      "先写 ARR、续费、留存或获客成本里的那个关键数字。",
      "第一屏把谁在增长、谁在失血写清楚。",
      "不要把 SaaS 增长写成泛增长黑话。",
    ],
    openingEngines: ["账本/结果先抛", "误判代价先抛", "公司/创始人/产品动作先抛"],
    readerShareReasons: [
      "文章把留存、续费和获客成本翻译成可对照的经营判断。",
      "文章适合转给产品、增长和销售一起看边界。",
    ],
    materialJobs: ["ARR/MRR", "留存续费", "获客路径", "定价动作", "不适合谁"],
    evidencePriorities: ["核心增长数字", "定价动作", "获客路径", "留存变化", "边界条件"],
    evidenceRecipes: ["数字/结果 + 案例主体 + 原话引用", "变化结论 + 钱流结构 + 不适合谁"],
    emotionVectors: ["身份代入", "机会感", "好奇心"],
    negativePatterns: ["增长黑话", "只写框架不写数字", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["定价页", "留存表", "销售漏斗", "续费周报", "试用转化页"],
    abstractToConcretePairs: [
      { abstract: "增长", concrete: "不是用户多了一点，而是续费和新增哪一个真的在把收入往上推" },
      { abstract: "定价策略", concrete: "不是改个价签，而是哪个套餐开始吃掉你原本能赚到的钱" },
      { abstract: "PLG", concrete: "不是大家都在说产品驱动，而是试用到付费这一步到底怎么过" },
    ],
    openingMicroScenes: [
      "从一个 ARR、续费或获客数字起手。",
      "第一句先让读者看到钱在往哪边流。",
      "前 120 字就写出增长和失血的分界线。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["case_breakdown", "analysis_interpreter"],
    narrativeSkeletons: [
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 9.6,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先用账本、漏斗或定价图把增长问题具体化。",
    },
  },
  {
    key: "search_marketing",
    category: "联盟营销与搜索变现（稀疏）",
    sampleCount: 0,
    accountCount: 0,
    sparseTrack: true,
    coverageNote: "搜索营销在当前百篇商业样本中缺少直接覆盖，正文必须补广告后台、关键词分层和转化链路证据。",
    keywords: ["搜索广告", "搜索意图", "关键词", "google ads", "ppc", "sem", "投放", "线索", "转化"],
    dominantMechanisms: ["反常识翻转", "数字锚点", "风险提醒"],
    openingJobs: [
      "先写账户里已经发生的错位、花掉的预算或没来的线索。",
      "把词面精准和需求阶段错位的那一下写出来。",
    ],
    openingEngines: ["误判代价先抛", "账本/结果先抛", "岗位/行业变化现场先抛"],
    readerShareReasons: [
      "文章替读者把后台里最难说清的错位讲明白。",
      "文章把搜索投放问题翻成读者能复盘的真实代价。",
    ],
    materialJobs: ["预算代价", "账户数据", "搜索场景", "需求阶段", "边界条件"],
    evidencePriorities: ["预算或转化数字", "词表分层", "搜索场景", "线索质量对照", "不适合谁"],
    evidenceRecipes: ["变化结论 + 钱流结构 + 不适合谁", "数字/结果 + 案例主体 + 原话引用"],
    emotionVectors: ["身份代入", "风险感", "效率冲动"],
    negativePatterns: ["只讲关键词方法论", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["广告后台", "线索表", "关键词列表", "复盘会", "老板追问"],
    abstractToConcretePairs: [
      { abstract: "搜索意图错位", concrete: "词看着很准，但进来的人根本还没准备行动" },
      { abstract: "预算浪费", concrete: "花出去的是点击钱，买回来的却是解释不清的无效线索" },
      { abstract: "优化方向", concrete: "不是继续修词面，而是先把需求阶段重新分层" },
    ],
    openingMicroScenes: [
      "从一次复盘会或一次后台截图起手。",
      "先把钱花了但单没来的那一下写出来。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "对象动作 -> 表面解释 -> 真正变量 -> 后果/代价 -> 读者如何对照自己",
    ],
    visualProfile: {
      averageImageCount: 9.5,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先用后台表、漏斗或对比图把错位证据放到第一屏。",
    },
  },
  {
    key: "affiliate_marketing",
    category: "联盟营销与搜索变现（稀疏）",
    sampleCount: 0,
    accountCount: 0,
    sparseTrack: true,
    coverageNote: "联盟营销在当前百篇商业样本中缺少直接覆盖，正文必须额外补佣金规则、平台条款和真实收入路径。",
    keywords: ["联盟营销", "affiliate", "佣金", "amazon associates", "partnerstack", "impact.com", "seo 变现", "站长"],
    dominantMechanisms: ["数字锚点", "问题悬念", "风险提醒"],
    openingJobs: [
      "先写佣金、抽成或归因被改动的那一下。",
      "第一屏让读者看到钱流怎么来、怎么断。",
    ],
    openingEngines: ["账本/结果先抛", "误判代价先抛"],
    readerShareReasons: [
      "文章替读者算清联盟营销里最容易被忽略的条款代价。",
      "文章把赚佣金这件事讲成真实钱流，而不是流量幻想。",
    ],
    materialJobs: ["佣金规则", "钱流路径", "平台条款", "真实案例", "边界条件"],
    evidencePriorities: ["佣金或抽成数字", "平台条款", "真实案例", "归因规则", "不适合谁"],
    evidenceRecipes: ["变化结论 + 钱流结构 + 不适合谁", "数字/结果 + 案例主体 + 原话引用"],
    emotionVectors: ["机会感", "风险感", "身份代入"],
    negativePatterns: ["只讲 SEO/流量梦想", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["联盟后台", "佣金报表", "条款页", "站长复盘", "收款记录"],
    abstractToConcretePairs: [
      { abstract: "联盟营销机会", concrete: "不是有流量就行，而是这笔佣金最后能不能按你以为的规则进账" },
      { abstract: "平台变化", concrete: "不是条款有点调整，而是原本算得过来的账突然开始不对" },
      { abstract: "边界", concrete: "如果你的流量来源不稳，这条路先来的可能是归因争议不是收入" },
    ],
    openingMicroScenes: [
      "从一次佣金变化或一次归因争议起手。",
      "先写钱流变化，不先讲大机会。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "operator_test"],
    narrativeSkeletons: [
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 9.5,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先用联盟后台、规则页或账本截图承接第一屏判断。",
    },
  },
  {
    key: "career",
    category: "岗位与组织变化",
    sampleCount: 13,
    accountCount: 4,
    sparseTrack: false,
    coverageNote: "岗位与组织变化可借当前商业案例和实操样本得到中等强度支撑。",
    keywords: ["岗位", "组织变化", "职场", "团队", "管理者", "绩效", "职业", "招聘", "工作流"],
    dominantMechanisms: ["反常识翻转", "实体事件解释", "数字锚点"],
    openingJobs: [
      "先写哪个岗位、团队或规则正在变化。",
      "第一屏让读者看到自己会先在哪一步受影响。",
    ],
    openingEngines: ["岗位/行业变化现场先抛", "误判代价先抛"],
    readerShareReasons: [
      "文章替读者看懂岗位变化，不把组织问题写成鸡汤。",
      "文章适合转给团队做共识而不是做培训。",
    ],
    materialJobs: ["岗位对象", "组织动作", "代价", "新旧规则", "边界"],
    evidencePriorities: ["岗位变化", "组织动作", "后果", "谁先受影响", "新判断标准"],
    evidenceRecipes: ["对象动作 + 表面解释 + 真正变量", "变化结论 + 钱流结构 + 不适合谁"],
    emotionVectors: ["身份代入", "风险感", "机会感"],
    negativePatterns: ["职场导师腔", ...SHARED_NEGATIVE_PATTERNS],
    readerSceneAnchors: ["周会", "绩效沟通", "岗位说明", "协作流程", "团队复盘"],
    abstractToConcretePairs: [
      { abstract: "岗位变化", concrete: "不是行业在变，而是你手上哪块活先被替掉、先被重排" },
      { abstract: "组织动作", concrete: "不是协同更重要，而是哪些环节开始要重新对齐责任" },
      { abstract: "影响范围", concrete: "不是所有人都一样受影响，而是某类岗位会先感到压力" },
    ],
    openingMicroScenes: [
      "从一次周会、一条新规则或一次绩效对话起手。",
      "先写哪类人先受影响，再讲原因。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["analysis_interpreter", "case_breakdown"],
    narrativeSkeletons: [
      "一个新动作 -> 原规则失效 -> 哪类人先受影响 -> 真实代价 -> 新判断标准",
    ],
    visualProfile: {
      averageImageCount: 11.2,
      dominantFirstImageTiming: "first_screen_support",
      firstScreenImageRole: "优先用流程图、组织图或示意截图帮读者快速进入判断。",
    },
  },
  {
    key: "generic_business",
    category: "商业变现综合样本层",
    sampleCount: 100,
    accountCount: 15,
    sparseTrack: false,
    coverageNote: "当主题无法清晰归类时，回退到商业聚焦综合样本层，但仍需优先回答商业七问。",
    keywords: ["商业", "赚钱", "产品", "工具", "创业", "复盘", "案例", "增长"],
    dominantMechanisms: ["数字锚点", "实体事件解释", "反常识翻转"],
    openingJobs: [
      "前 120 字必须出现具体对象、正在发生的变化和读者可感知的后果。",
      "前 200 字必须给半步答案，不用背景介绍暖场。",
    ],
    openingEngines: ["账本/结果先抛", "误判代价先抛", "公司/创始人/产品动作先抛"],
    readerShareReasons: [
      "文章替读者看懂一个正在变化的对象、机会或代价。",
      "文章让复杂判断变得可复述、可转发。",
    ],
    materialJobs: ["具体对象", "变化信号", "后果代价", "证据", "边界"],
    evidencePriorities: ["具体对象", "变化事件", "数字或账本", "案例主体", "边界条件"],
    evidenceRecipes: BUSINESS_MONETIZATION_CORPUS_PROFILE.evidenceRecipes,
    emotionVectors: BUSINESS_MONETIZATION_CORPUS_PROFILE.dominantEmotionVectors,
    negativePatterns: SHARED_NEGATIVE_PATTERNS,
    readerSceneAnchors: ["复盘会", "后台截图", "工位", "对比表", "第一屏"],
    abstractToConcretePairs: [
      { abstract: "变化", concrete: "不是行业变了，而是某个具体对象已经开始让旧判断失灵" },
      { abstract: "代价", concrete: "不是说可能有风险，而是读者已经在哪一笔钱、哪一步流程上吃亏了" },
      { abstract: "机会", concrete: "不是泛机会，而是这一类人现在多赚、少花或更快的那个口子" },
    ],
    openingMicroScenes: [
      "从对象、动作、结果三件事同时入场。",
      "先让读者看到这件事为什么现在和自己有关。",
    ],
    businessQuestions: SHARED_BUSINESS_QUESTIONS,
    authorPostureModes: ["case_breakdown", "operator_test", "analysis_interpreter"],
    narrativeSkeletons: [
      "对象动作 -> 表面解释 -> 真正变量 -> 后果/代价 -> 读者如何对照自己",
      "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法",
    ],
    visualProfile: {
      averageImageCount: 13.4,
      dominantFirstImageTiming: "opening_hook",
      firstScreenImageRole: "首图优先证明变化，不做背景图和装饰图。",
    },
  },
];

const PROFILE_BY_KEY = new Map(PLAN24_VERTICAL_PROFILES.map((profile) => [profile.key, profile]));

function normalizeSeed(value: string) {
  return value.toLowerCase();
}

function scoreProfileByKeywords(profile: Plan24VerticalProfile, seed: string) {
  return profile.keywords.reduce((sum, keyword) => sum + (seed.includes(keyword.toLowerCase()) ? 1 : 0), 0);
}

export function inferPlan24Vertical(seed: string): Plan24VerticalProfile {
  const normalized = normalizeSeed(seed);
  const detected = detectVerticalTopicCategory([seed]);
  if (detected !== "generic") {
    return PROFILE_BY_KEY.get(detected) || PROFILE_BY_KEY.get("generic_business")!;
  }
  const scored = PLAN24_VERTICAL_PROFILES
    .map((profile) => ({
      profile,
      score: scoreProfileByKeywords(profile, normalized),
    }))
    .sort((left, right) => right.score - left.score);
  return scored[0]?.score ? scored[0].profile : PROFILE_BY_KEY.get("generic_business")!;
}

export function getPlan24TopicSignature(input: {
  title?: string | null;
  centralThesis?: string | null;
  targetReader?: string | null;
  materialSpark?: string | null;
  viralBlueprintLabel?: string | null;
}) {
  return [
    input.title,
    input.centralThesis,
    input.targetReader,
    input.materialSpark,
    input.viralBlueprintLabel,
  ].map((item) => String(item || "").trim()).filter(Boolean).join(" / ");
}
