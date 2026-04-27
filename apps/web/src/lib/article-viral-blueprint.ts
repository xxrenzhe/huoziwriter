export type ArticleViralBlueprintStage =
  | "researchBrief"
  | "audienceAnalysis"
  | "outlinePlanning"
  | "titleOptimization"
  | "openingOptimization"
  | "deepWriting"
  | "factCheck"
  | "prosePolish";

export type ArticleViralBlueprintCode = "ordinary_breakthrough" | "structural_tension";

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
      boundaryRule: "真实人物、学校、成绩、收入、录取和截图必须来自真实素材；素材不足时只能写成复合人物或虚构故事，不能冒充真实专访。",
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
