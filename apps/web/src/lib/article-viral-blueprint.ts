export type ArticleViralBlueprintStage =
  | "researchBrief"
  | "audienceAnalysis"
  | "outlinePlanning"
  | "titleOptimization"
  | "openingOptimization"
  | "deepWriting"
  | "factCheck"
  | "prosePolish";

export type ArticleViralBlueprintCode =
  | "ordinary_breakthrough"
  | "money_path"
  | "career_crossroads"
  | "ai_product_disruption"
  | "structural_tension";

export type ArticleViralBlueprint = {
  code: ArticleViralBlueprintCode;
  label: string;
  reason: string;
  titlePromise: string;
  openingEngine: string;
  narrativeArc: string[];
  evidenceRecipe: string[];
  emotionalCurve: string[];
  shareTrigger: string;
  materialRequirements: string[];
  premiseChecklist: string[];
  mediocrityRisk: string;
  boundaryRule: string;
};

export type ArticleViralBlueprintInput = {
  articleTitle?: string | null;
  markdownContent?: string | null;
  strategyCard?: {
    mainstreamBelief?: string | null;
    targetReader?: string | null;
    coreAssertion?: string | null;
    whyNow?: string | null;
    researchHypothesis?: string | null;
    marketPositionInsight?: string | null;
    historicalTurningPoint?: string | null;
  } | null;
  humanSignals?: {
    firstHandObservation?: string | null;
    feltMoment?: string | null;
    whyThisHitMe?: string | null;
    realSceneOrDialogue?: string | null;
    wantToComplain?: string | null;
    nonDelegableTruth?: string | null;
  } | null;
  researchBrief?: Record<string, unknown> | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function includesAny(text: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function buildSeed(input: ArticleViralBlueprintInput) {
  const researchInsights = getRecordArray(input.researchBrief?.intersectionInsights)
    .map((item) => [item.insight, item.whyNow, item.caution].map((value) => getString(value)).filter(Boolean).join(" "))
    .join(" ");
  return [
    input.articleTitle,
    input.markdownContent,
    input.strategyCard?.mainstreamBelief,
    input.strategyCard?.targetReader,
    input.strategyCard?.coreAssertion,
    input.strategyCard?.whyNow,
    input.strategyCard?.researchHypothesis,
    input.strategyCard?.marketPositionInsight,
    input.strategyCard?.historicalTurningPoint,
    input.humanSignals?.firstHandObservation,
    input.humanSignals?.feltMoment,
    input.humanSignals?.whyThisHitMe,
    input.humanSignals?.realSceneOrDialogue,
    input.humanSignals?.wantToComplain,
    input.humanSignals?.nonDelegableTruth,
    researchInsights,
  ].map((item) => getString(item)).filter(Boolean).join(" ");
}

export function inferArticleViralBlueprintCode(input: ArticleViralBlueprintInput): ArticleViralBlueprintCode {
  const seed = buildSeed(input);
  const hasLowStart = includesAny(seed, [
    /二本|三本|专科|普通学校|非名校|低学历|小镇|县城|普通人|新人|小白|学生|打工人|边缘|低起点/,
  ]);
  const hasHighOutcome = includesAny(seed, [
    /北大|清华|985|211|名校|上岸|考上|录取|逆袭|翻身|破局|拿到\s*offer|涨薪|赚到|百万|美金|出海成功/,
  ]);
  const hasToolLeverage = includesAny(seed, [
    /AI|DeepSeek|ChatGPT|Claude|豆包|讯飞|免费|工具|模型|自动化|低成本|不用付费|订阅费|API|token/i,
  ]);
  const hasFairnessFrame = includesAny(seed, [
    /公平|信息差|经济差|资源差|门槛|预算|免费|付费|订阅|阶层|机会|平等|普通人/,
  ]);
  const hasMoneyPath = includesAny(seed, [
    /海外赚美金|赚美金|美金|美元|副业|赚钱|变现|联盟营销|affiliate|出海|跨境|独立站|佣金|现金流|收入|客单价|转化率|漏斗/i,
  ]);
  const hasCareerPath = includesAny(seed, [
    /职场|裁员|跳槽|晋升|老板|同事|工资|涨薪|简历|面试|绩效|组织|团队|打工人|中年危机|职业/,
  ]);
  const hasAiProductPath = includesAny(seed, [
    /AI产品|AI 产品|AI\s*(agent|应用|工作流|SaaS|产品化|产品)|agent|智能体|SaaS|工作流|自动化|模型|OpenAI|Claude|Gemini|Cursor|产品经理|PMF|订阅/i,
  ]);

  if (hasMoneyPath) {
    return "money_path";
  }
  if (hasAiProductPath) {
    return "ai_product_disruption";
  }
  if (hasCareerPath) {
    return "career_crossroads";
  }
  if ((hasLowStart && hasHighOutcome) || (hasToolLeverage && hasFairnessFrame && (hasLowStart || hasHighOutcome))) {
    return "ordinary_breakthrough";
  }
  return "structural_tension";
}

export function buildArticleViralBlueprint(input: ArticleViralBlueprintInput): ArticleViralBlueprint {
  const code = inferArticleViralBlueprintCode(input);

  if (code === "ordinary_breakthrough") {
    return {
      code,
      label: "普通人逆袭型",
      reason: "当前题材具备低起点身份、外部工具杠杆、超预期结果或资源门槛冲突，适合写成个人命运切口加公共议题升维。",
      titlePromise: "标题必须同时给出低起点身份、关键杠杆和超预期结果，让读者立刻想知道中间路径。",
      openingEngine: "开头先讲结果和来源可信度，再交代为什么这件事不可能只靠努力解释。",
      narrativeArc: [
        "强结果开场：先抛出低起点到高结果的反差。",
        "可信背景：补年龄、身份、地域、专业、资源限制和目标难度。",
        "路径拆解：写清工具怎么介入，但重点放在人如何使用、克制和纠偏。",
        "关键反转：最打动人的不是怎么用工具，而是她知道什么时候不用工具。",
        "公共升维：从个体逆袭推到信息差、经济差、工具公平或机会结构。",
        "可转发收束：落到一句普通人也能带走的选择感或自我定义。",
      ],
      evidenceRecipe: [
        "至少准备 1 个结果锚点，例如录取、成绩、收入、转化或明确里程碑。",
        "至少准备 2 个过程锚点，例如截图、工具名、时间线、练习量、付费/免费选择。",
        "至少准备 1 句人物原话，承载价值观或边界感。",
        "必须写出工具不能替代人的部分，避免变成工具软文。",
      ],
      emotionalCurve: [
        "好奇：这么低的起点为什么能做到。",
        "佩服：她不是等工具救她，而是把工具用在关键卡点。",
        "心酸：资源门槛和经济差并没有消失。",
        "鼓舞：过去标签不能定义一个人要成为什么。",
      ],
      shareTrigger: "读者转发的理由不是学到一个工具技巧，而是想把“普通人仍然可以多争取一次机会”送给别人。",
      materialRequirements: [
        "身份差：低起点身份和外部标签。",
        "目标差：一个明显高于起点的结果。",
        "资源差：预算、信息、圈层、学校、地区或工具权限限制。",
        "方法差：具体动作、工具边界、真人反馈和自我练习。",
        "价值观原话：一句能把个人故事抬成公共情绪的表达。",
      ],
      premiseChecklist: [
        "能一句话说清：谁在低起点里拿到了什么反常结果。",
        "能说清杠杆是什么：工具、方法、信息差、关系或选择。",
        "能证明路径不是鸡汤：至少有时间线、动作和失败卡点。",
        "能升维到公共情绪：公平、机会、门槛或自我定义。",
      ],
      mediocrityRisk: "最容易写成工具软文或励志鸡汤；必须让路径、限制和边界承担可信度。",
      boundaryRule: "真实人物、学校、成绩、收入、录取和截图必须来自真实素材；素材不足时只能写成复合人物或虚构故事，不能冒充真实专访。",
    };
  }

  if (code === "money_path") {
    return {
      code,
      label: "赚钱路径拆解型",
      reason: "当前题材涉及海外赚美金、副业、联盟营销、出海变现或收入路径，爆点不在“能赚钱”，而在机会窗口、可信路径、失败成本和普通人能否复制。",
      titlePromise: "标题必须同时给出目标收益场景、具体路径或平台切口、普通读者最关心的门槛，不要只喊赚钱结果。",
      openingEngine: "开头先给一个具体账本、订单、佣金、转化或失败成本场景，再立刻说明这不是无脑暴富机会。",
      narrativeArc: [
        "结果或账本开场：先给一个可视化的钱流或成本反差。",
        "机会窗口：解释为什么这个路径现在出现，而不是一直存在。",
        "路径拆解：流量来源、信任建立、产品/Offer、转化动作和交付成本。",
        "失败成本：写清封号、退单、获客、语言、时差、合规或持续输出压力。",
        "复制边界：什么人适合做，什么人别碰。",
        "行动收束：给读者一个低风险验证动作。",
      ],
      evidenceRecipe: [
        "至少准备 1 个钱流锚点，例如订单、佣金区间、客单价、转化率或成本结构。",
        "至少准备 2 个路径锚点，例如平台规则、流量渠道、Offer 来源、落地页、邮件序列或交付流程。",
        "至少准备 1 个失败样本或反例，说明这不是稳赚机会。",
        "必须把合规、平台规则和可复制边界写清楚。",
      ],
      emotionalCurve: ["眼前一亮", "怀疑", "看懂门槛", "谨慎想试"],
      shareTrigger: "读者转发的理由是这篇文章把赚钱机会从玄学拆成了可验证路径和风险边界。",
      materialRequirements: [
        "收益差：钱从哪里来、谁付钱、为什么愿意付。",
        "路径差：流量、信任、转化、交付四段链路。",
        "成本差：时间、现金、语言、规则和试错成本。",
        "失败差：至少一个做不成或不适合的原因。",
        "验证动作：读者 24-72 小时内能做的小实验。",
      ],
      premiseChecklist: [
        "能回答：这不是暴富故事，而是哪条具体钱流。",
        "能回答：普通人第一步如何低成本验证。",
        "能回答：最大坑在哪里，为什么多数人做不成。",
        "能回答：读者凭什么相信这个路径有现实窗口。",
      ],
      mediocrityRisk: "最容易写成割韭菜式财富叙事；必须把钱流、路径、成本和失败边界同时写出来。",
      boundaryRule: "收益、佣金、转化率、平台政策和案例若来自真实主体必须可核验；素材不足时只能写成模拟账本、复合案例或假设路径。",
    };
  }

  if (code === "career_crossroads") {
    return {
      code,
      label: "职场转折型",
      reason: "当前题材涉及裁员、跳槽、晋升、组织变化或职业选择，爆点来自个人安全感和组织规则之间的冲突。",
      titlePromise: "标题必须给出一个职场关键处境、一个反常识判断和一个读者能立即对照自己的选择标准。",
      openingEngine: "开头先进入一个办公室、会议、面试、裁员通知或工资谈判场景，再抛出真正改变规则的变量。",
      narrativeArc: [
        "具体职场场景开场。",
        "表层解释：大家通常以为问题出在哪。",
        "规则反转：真正起作用的是组织激励、岗位供需或能力定价。",
        "角色分化：新人、骨干、管理者、外包或自由职业者分别受什么影响。",
        "选择标准：什么动作值得做，什么努力只是自我感动。",
        "安全感收束：给读者一个可执行判断。",
      ],
      evidenceRecipe: [
        "至少准备 1 个职场场景锚点，例如面试、绩效、裁员、汇报或薪资谈判。",
        "至少准备 2 个规则锚点，例如招聘 JD、薪资带、组织调整、岗位消失或新技能要求。",
        "至少准备 1 个角色对比，说明不同人为什么感受完全不同。",
        "必须给出可执行的职业判断标准。",
      ],
      emotionalCurve: ["代入", "不安", "看清规则", "重新评估自己"],
      shareTrigger: "读者转发的理由是这篇文章替他说清了职场焦虑背后的规则，而不是单纯安慰。",
      materialRequirements: [
        "场景差：一个读者能代入的职场瞬间。",
        "规则差：组织为什么这么做。",
        "角色差：谁受益、谁承压、谁被误伤。",
        "能力差：哪些能力被重新定价。",
        "选择标准：读者下一步该检查什么。",
      ],
      premiseChecklist: [
        "能回答：这个职场变化打到了哪类人。",
        "能回答：表面原因和真实规则有什么不同。",
        "能回答：读者如何判断自己是危险、机会还是旁观者。",
        "能回答：结尾能给出行动标准，而不是空泛鼓励。",
      ],
      mediocrityRisk: "最容易写成情绪安慰或职场鸡汤；必须把组织规则、角色分化和选择标准写硬。",
      boundaryRule: "真实公司裁员、薪资、绩效和内部对话必须有来源；素材不足时只能写成匿名化复合场景或虚构职场故事。",
    };
  }

  if (code === "ai_product_disruption") {
    return {
      code,
      label: "AI产品重排型",
      reason: "当前题材涉及 AI 产品、智能体、SaaS、工具或工作流变化，爆点来自旧流程、旧成本、旧岗位和旧产品边界被重排。",
      titlePromise: "标题必须点名具体产品/工作流/角色，并给出一个清晰的旧规则失效判断。",
      openingEngine: "开头先给一个真实使用场景、成本反差或组织动作，再说明这不是模型又强了一点，而是流程顺序变了。",
      narrativeArc: [
        "场景或产品动作开场。",
        "旧规则：过去这个流程靠什么成立。",
        "新杠杆：AI 产品具体替换了哪一步成本。",
        "组织后果：岗位、预算、采购、交付或产品形态如何变化。",
        "反例边界：哪些场景仍然跑不通。",
        "判断收束：读者应该观察哪一个领先指标。",
      ],
      evidenceRecipe: [
        "至少准备 1 个产品/工作流使用锚点。",
        "至少准备 1 个成本或效率锚点，例如时间、人力、预算、token、订阅或转化。",
        "至少准备 1 个组织后果锚点，例如岗位变化、采购变化、工具栈变化或用户行为变化。",
        "必须给出限制条件，避免写成 AI 万能叙事。",
      ],
      emotionalCurve: ["新鲜", "失控感", "理解变化", "想重新判断机会"],
      shareTrigger: "读者转发的理由是这篇文章帮他看懂 AI 产品变化背后的岗位、预算和流程重排。",
      materialRequirements: [
        "旧流程：原来怎么做、成本在哪里。",
        "新动作：AI 产品替换了哪一步。",
        "成本差：时间、人力、预算或质量变化。",
        "组织差：谁的工作被重排。",
        "边界差：哪里仍然不能自动化。",
      ],
      premiseChecklist: [
        "能回答：具体哪个旧流程失效了。",
        "能回答：AI 产品真正改变的是成本、速度、质量还是责任边界。",
        "能回答：谁会因此受益或承压。",
        "能回答：读者该看哪个指标判断趋势继续。",
      ],
      mediocrityRisk: "最容易写成产品介绍或模型新闻复述；必须落到流程、成本、组织后果和边界。",
      boundaryRule: "产品数据、公司采用情况、融资和内部使用案例必须有来源；素材不足时只能写成使用体验、模拟工作流或趋势推演。",
    };
  }

  return {
    code,
    label: "结构张力型",
    reason: "当前题材更适合围绕一个结构性误读、趋势转折或角色分化展开。",
    titlePromise: "标题要给出具体对象和反常识判断，不要只写观点口号。",
    openingEngine: "开头先给一个反常识信号、冲突现场或读者处境，再进入解释链。",
    narrativeArc: [
      "反常识信号开场。",
      "补关键背景和时间节点。",
      "拆变量和角色分化。",
      "加入反例或限制条件。",
      "收束成读者能复述的判断。",
    ],
    evidenceRecipe: [
      "至少准备时间脉络、横向比较和交汇洞察各 1 条。",
      "每个判断后面接事实锚点或谨慎边界。",
      "避免连续堆概念，必须穿插场景或读者处境。",
    ],
    emotionalCurve: ["疑问", "理解", "紧迫", "清晰"],
    shareTrigger: "读者愿意转发，是因为这篇文章替他讲清了一个原本模糊的结构性判断。",
    materialRequirements: ["时间节点", "横向比较", "反例限制", "读者行动标准"],
    premiseChecklist: [
      "能回答：被误读的对象是什么。",
      "能回答：真正起作用的结构变量是什么。",
      "能回答：为什么现在值得写。",
      "能回答：读者读完能复述哪一句判断。",
    ],
    mediocrityRisk: "最容易写成概念综述或资料搬运；必须用反常识信号、变量拆解和读者判断标准撑住。",
    boundaryRule: "事实型判断必须有来源；无法核验的内容只能写成观察、推演或复合素材。",
  };
}

export function buildArticleViralBlueprintPromptLines(
  stage: ArticleViralBlueprintStage,
  input: ArticleViralBlueprintInput,
) {
  const blueprint = buildArticleViralBlueprint(input);
  const baseLines = [
    `爆文蓝图：${blueprint.label}；${blueprint.reason}`,
    `标题承诺：${blueprint.titlePromise}`,
    `开头引擎：${blueprint.openingEngine}`,
    `情绪曲线：${blueprint.emotionalCurve.join(" -> ")}`,
    `传播触发：${blueprint.shareTrigger}`,
    `素材要求：${blueprint.materialRequirements.join("；")}`,
    `爆款前提清单：${blueprint.premiseChecklist.join("；")}`,
    `平庸风险：${blueprint.mediocrityRisk}`,
    `边界规则：${blueprint.boundaryRule}`,
  ];

  if (stage === "researchBrief") {
    return [
      ...baseLines,
      `研究阶段必须按蓝图补素材：${blueprint.evidenceRecipe.join("；")}`,
      `研究阶段必须提前标出叙事弧：${blueprint.narrativeArc.join(" -> ")}`,
    ];
  }
  if (stage === "audienceAnalysis") {
    return [
      ...baseLines,
      "受众阶段必须判断：读者是为结果反差点开、为方法路径收藏，还是为公平议题转发。",
    ];
  }
  if (stage === "outlinePlanning") {
    return [
      ...baseLines,
      `大纲阶段必须按这条叙事弧排节奏：${blueprint.narrativeArc.join(" -> ")}`,
    ];
  }
  if (stage === "titleOptimization") {
    return [
      ...baseLines,
      "标题阶段必须把低起点、关键杠杆、超预期结果或结构误读压进同一个可点击承诺里。",
    ];
  }
  if (stage === "openingOptimization") {
    return [
      ...baseLines,
      "开头阶段必须在前三句内交代结果反差、可信来源和为什么这不是普通努力故事。",
    ];
  }
  if (stage === "deepWriting") {
    return [
      ...baseLines,
      `正文执行卡必须按蓝图分配章节：${blueprint.narrativeArc.join(" -> ")}`,
      `正文执行卡必须把证据配方写入 sectionBlueprint、viralNarrativePlan 和 fictionalMaterialPlan：${blueprint.evidenceRecipe.join("；")}`,
    ];
  }
  if (stage === "factCheck") {
    return [
      ...baseLines,
      "核查阶段必须重点检查：结果锚点、身份标签、数字、截图和人物原话是否有真实来源或明确虚构边界。",
    ];
  }
  return [
    ...baseLines,
    "润色阶段只能增强蓝图节奏和情绪曲线，不能新增无来源的真实人物、结果或数字。",
  ];
}
