import { buildFourPointAudit } from "./article-strategy";
import { buildArticleViralBlueprint, buildArticleViralBlueprintPromptLines } from "./article-viral-blueprint";

export type ArticlePromptQualityBriefStage =
  | "researchBrief"
  | "audienceAnalysis"
  | "outlinePlanning"
  | "titleOptimization"
  | "openingOptimization"
  | "deepWriting"
  | "factCheck"
  | "prosePolish";

export type ArticleMaterialRealityMode = "nonfiction" | "fiction";
export const DEFAULT_ARTICLE_MATERIAL_REALITY_MODE: ArticleMaterialRealityMode = "nonfiction";

export type ArticlePromptQualityBriefInput = {
  articleTitle?: string | null;
  materialRealityMode?: ArticleMaterialRealityMode | null;
  strategyCard?: {
    mainstreamBelief?: string | null;
    targetReader?: string | null;
    coreAssertion?: string | null;
    whyNow?: string | null;
    researchHypothesis?: string | null;
    marketPositionInsight?: string | null;
    historicalTurningPoint?: string | null;
    endingAction?: string | null;
  } | null;
  humanSignals?: {
    firstHandObservation?: string | null;
    feltMoment?: string | null;
    whyThisHitMe?: string | null;
    realSceneOrDialogue?: string | null;
    wantToComplain?: string | null;
    nonDelegableTruth?: string | null;
    score?: number | null;
  } | null;
  researchBrief?: Record<string, unknown> | null;
  outlineSelection?: {
    selectedTitle?: string | null;
    selectedOpeningHook?: string | null;
    selectedTargetEmotion?: string | null;
    selectedEndingStrategy?: string | null;
  } | null;
};

const FOUR_POINT_LABELS = {
  cognitiveFlip: "认知翻转",
  readerSnapshot: "读者快照",
  coreTension: "核心张力",
  impactVector: "发力方向",
} as const;

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function getRecordArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, limit)
    : [];
}

function unique(values: Array<string | null | undefined>, limit = 6) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

const FICTION_MODE_PATTERN = /虚构|虚构类|小说|短篇|故事|寓言|剧本|同人|架空|科幻|悬疑|人物设定|世界观|fiction|novel|screenplay/i;

export const ARTICLE_VIRAL_NARRATIVE_SYSTEM_CONTRACT = [
  "文章生长内核必须前置：上游先给作者状态、读者冲突、素材火花和作者视角，让正文从这四件事自然长出来；下游规则只做护栏，不做方向盘。",
  "爆款叙事六件套必须前置：第一人称或近距离现场感、真实世界锚点、复合信源感、故事与数据交替、连续情绪钩子、可反复回收的母题。",
  "爆款文章不能是教程姿态：不要把正文写成培训稿、方法清单或作者向读者灌输建议；先写读者正在付出的代价、误判现场和可转发的冲突句，再给判断。",
  "真实世界锚点负责可信度：可以使用公开实体、行业术语、时间节点和已验证材料建立背景，但不得编造真实主体的未证实行为、数据或采访。",
  "复合素材负责画面感：允许使用复合人物、复合场景、匿名化对话和区间化账本，但必须保持复合、重构、假设、寓言或虚构口径。",
  "故事与数据交替推进：每一个故事段后面都要接判断、区间数据或结构解释；每一个数据段后面都要接场景、人物处境或读者收益。",
  "母题回收：文章必须有一个能反复变形出现的核心母题，用来串联标题、开头、分节转折、高潮和结尾。",
].join("\n");

export function inferArticleMaterialRealityMode(input: ArticlePromptQualityBriefInput): ArticleMaterialRealityMode {
  if (input.materialRealityMode === "fiction" || input.materialRealityMode === "nonfiction") {
    return input.materialRealityMode;
  }
  const seed = [
    input.articleTitle,
    input.outlineSelection?.selectedTitle,
    input.strategyCard?.coreAssertion,
    input.strategyCard?.researchHypothesis,
  ].map((item) => getString(item)).filter(Boolean).join(" ");
  return FICTION_MODE_PATTERN.test(seed) ? "fiction" : DEFAULT_ARTICLE_MATERIAL_REALITY_MODE;
}

function getHumanSignalLabels(input: ArticlePromptQualityBriefInput["humanSignals"]) {
  return unique([
    getString(input?.realSceneOrDialogue) ? "真实场景" : null,
    getString(input?.firstHandObservation) ? "第一手观察" : null,
    getString(input?.feltMoment) ? "体感瞬间" : null,
    getString(input?.whyThisHitMe) ? "击中原因" : null,
    getString(input?.wantToComplain) ? "反向张力" : null,
    getString(input?.nonDelegableTruth) ? "不能外包的真话" : null,
  ]);
}

function getFourPointWeakLabels(input: ArticlePromptQualityBriefInput) {
  const audit = buildFourPointAudit({
    mainstreamBelief: getString(input.strategyCard?.mainstreamBelief) || null,
    coreAssertion: getString(input.strategyCard?.coreAssertion) || null,
    whyThisHitMe: getString(input.humanSignals?.whyThisHitMe) || null,
    realSceneOrDialogue: getString(input.humanSignals?.realSceneOrDialogue) || null,
    feltMoment: getString(input.humanSignals?.feltMoment) || null,
    firstHandObservation: getString(input.humanSignals?.firstHandObservation) || null,
    wantToComplain: getString(input.humanSignals?.wantToComplain) || null,
    nonDelegableTruth: getString(input.humanSignals?.nonDelegableTruth) || null,
  });
  return (Object.keys(FOUR_POINT_LABELS) as Array<keyof typeof FOUR_POINT_LABELS>).filter((key) => {
    const item = getRecord(audit[key]);
    const score = Number(item?.score ?? 0);
    return !Number.isFinite(score) || score < 3;
  }).map((key) => FOUR_POINT_LABELS[key]);
}

function buildSharedLines(input: ArticlePromptQualityBriefInput) {
  const materialRealityMode = inferArticleMaterialRealityMode(input);
  const viralBlueprint = buildArticleViralBlueprint(input);
  const researchBrief = getRecord(input.researchBrief);
  const sourceCoverage = getRecord(researchBrief?.sourceCoverage);
  const researchSufficiency = getString(sourceCoverage?.sufficiency) || "unknown";
  const missingCategories = getStringArray(sourceCoverage?.missingCategories, 5);
  const timelineCount = getRecordArray(researchBrief?.timelineCards, 8).length;
  const comparisonCount = getRecordArray(researchBrief?.comparisonCards, 8).length;
  const insightCount = getRecordArray(researchBrief?.intersectionInsights, 8).length;
  const humanSignalLabels = getHumanSignalLabels(input.humanSignals);
  const humanSignalScore =
    typeof input.humanSignals?.score === "number" && Number.isFinite(input.humanSignals.score)
      ? Number(input.humanSignals.score)
      : humanSignalLabels.length;
  const weakFourPointLabels = getFourPointWeakLabels(input);

  const realityPolicyLines = materialRealityMode === "fiction"
    ? [
        "素材现实模式：fiction；当前写作系统默认按虚构类文章处理。真实素材优先作为背景锚点；如果真实素材不足，可以生成拟真的人物、对话、场景、组织细节和区间化数据，用来增强叙事可信度。",
        "虚构素材纪律：拟真素材不得冒充真实新闻、真实采访、真实公司内部数据或可核验事实；如借用现实品牌、真实人物或公共事件，只能作为背景环境，不能编造具体未证实指控。",
        humanSignalScore >= 2
          ? `真人信号：当前可用 ${humanSignalLabels.join("、")} 作为情绪与语感参考，也可以在虚构人物身上重组，但不能说成真实当事人原话。`
          : "真人信号：当前不足，可以创造典型人物、复合场景和合理对话，但要保持虚构叙事口径。",
        "虚构数据纪律：允许生成服务剧情的估算、区间、账本、排行榜或内部指标，但必须避免绑定真实公司/真实个人的未证实精确事实。",
      ]
      : [
        humanSignalScore >= 2
          ? `真人信号：当前可用 ${humanSignalLabels.join("、")}，可以吸收进开头或段落推进，但不得扩写成输入里不存在的细节。`
          : "真人信号：当前不足，不得伪造第一人称亲历、客户案例、聊天记录或现场对话；可以从作者视角写匿名复合观察、假设场景或推演句，但必须明示这是作者推演，不冒充真实经历。",
        "事实纪律：未验证的数字、金额、比例、时间压缩、收益承诺和效率案例，只能降级为有限观察、趋势信号或待验证线索。",
        "案例纪律：不得引入素材、来源正文、研究简报或事实锚点中不存在的命名平台、品牌、产品、人物或页面案例；需要举例时只能使用来源已有案例、行业泛例、匿名化抽象例，或带边界声明的作者视角复合素材。",
      ];

  return [
    "前置质量原则：缺研究、缺张力、缺读者收益的问题必须在上游阶段暴露或补齐，不能留到终稿润色或发布守门再补。",
    "文章生长原则：深写作阶段必须先生成 organicGrowthKernel，写清作者状态、读者冲突、素材火花、作者视角和自然展开路径；规则、清单、禁词、边界只负责护栏，不负责决定文章方向。",
    `爆文结构蓝图：${viralBlueprint.label}；标题、开头、大纲、正文执行卡必须围绕同一条蓝图生成，不允许各阶段各写各的。`,
    "可写性门槛必须内化到生成结果：研究层至少输出时间脉络、横向比较、交汇洞察各 1 条；标题必须 6 个候选且推荐项打开率分不低于 35；开头必须 3 个候选且推荐项钩子分不低于 65、质量上限不低于 B、无 danger 诊断。",
    materialRealityMode === "fiction"
      ? "正文执行卡必须天然可过门槛：sectionBlueprint 至少 3 节；viralNarrativePlan 至少 2 个情绪钩子和 2 个母题回收点；fictionalMaterialPlan 至少 4 条具体素材，并覆盖场景、人物、对话、区间数据、可信锚点和虚构边界。"
      : "正文执行卡必须天然可过门槛：sectionBlueprint 至少 3 节；viralNarrativePlan 至少 2 个情绪钩子和 2 个母题回收点；fictionalMaterialPlan 可以为空；如需补人味，只能放作者视角推演、匿名复合观察或假设场景，不能补命名案例或伪真实经历。",
    materialRealityMode === "fiction"
      ? "爆款叙事前置：必须先规划现场感、真实锚点、复合素材、故事数据交替、情绪钩子和母题回收，再进入正文写作。"
      : "爆款叙事前置：必须先规划读者处境、真实锚点、事实和判断交替、情绪钩子和母题回收，再进入正文写作。",
    "反说教前置：正文不是培训课、操作手册或作者训导；每一节优先从读者损失、认知冲突、复盘现场或转发句进入，建议和方法只能放在读者已经意识到代价之后。",
    `素材现实模式：${materialRealityMode}`,
    [
      `研究底座：信源覆盖=${researchSufficiency}`,
      missingCategories.length ? `缺口=${missingCategories.join("、")}` : "缺口=暂无明确缺项",
      `时间脉络=${timelineCount}`,
      `横向比较=${comparisonCount}`,
      `交汇洞察=${insightCount}`,
    ].join("；"),
    ...realityPolicyLines,
    weakFourPointLabels.length > 0
      ? `四元强度：${weakFourPointLabels.join("、")}仍偏弱，本阶段必须主动补足，不能靠更顺的文笔掩盖。`
      : "四元强度：认知翻转、读者快照、核心张力和发力方向已具备基础可写性，但仍要避免写成模板腔。",
  ];
}

function buildStageLine(stage: ArticlePromptQualityBriefStage, input: ArticlePromptQualityBriefInput) {
  const materialRealityMode = inferArticleMaterialRealityMode(input);
  const selectedTitle = getString(input.outlineSelection?.selectedTitle);
  const selectedOpeningHook = getString(input.outlineSelection?.selectedOpeningHook);
  const selectedTargetEmotion = getString(input.outlineSelection?.selectedTargetEmotion);
  const selectedEndingStrategy = getString(input.outlineSelection?.selectedEndingStrategy);

  if (stage === "researchBrief") {
    return materialRealityMode === "fiction"
      ? "研究目标：优先搜集真实背景、行业语汇和时代细节；如果素材不足，就输出可供虚构创作的设定缺口、人物关系、场景张力、匿名化复合信源感和合理数据区间。"
      : "研究目标：先把能支撑爆款判断的证据骨架搭出来，至少交代读者为什么现在该看、主判断靠什么成立、还缺哪类信源，并提炼可用的现场感和母题。";
  }
  if (stage === "audienceAnalysis") {
    return materialRealityMode === "fiction"
      ? "受众目标：判断读者会被哪类虚构人物、困境、秘密、反转和代入感吸引，并明确哪些细节能让虚构世界更可信。"
      : "受众目标：必须写出具体读者处境、他为什么会停下来继续读、他最容易误解什么，以及应该先给事实、先给判断还是先给场景。";
  }
  if (stage === "outlinePlanning") {
    return materialRealityMode === "fiction"
      ? "大纲目标：每一节都要推进人物目标、冲突升级、信息揭示和情绪转折；真实素材不足时，用合理虚构细节补足场景密度，并让母题在每节变形出现。"
      : "大纲目标：每一节都要同时回答推进任务、读者收益和证据挂点；至少留出历史节点、横向比较、交汇洞察、故事数据交替和母题回收支撑位。";
  }
  if (stage === "titleOptimization") {
    return materialRealityMode === "fiction"
      ? "标题目标：可以强化虚构叙事的冲突和悬念，但不能暗示这是某个真实主体的真实爆料或真实数据。"
      : "标题目标：只承诺正文和证据能够兑现的收益，不能用夸张反差、具体数字或结论剧透去骗点击。";
  }
  if (stage === "openingOptimization") {
    return materialRealityMode === "fiction"
      ? "开头目标：前三秒先给读者一个可视化的虚构场景、动作或对话，让读者相信这个世界成立，但不要伪装成作者真实亲历。"
      : "开头目标：前三秒先给读者处境、反差或判断；如果没有真实场景素材，不要硬伪造“我刚经历过”的镜头。";
  }
  if (stage === "deepWriting") {
    return [
      "生长目标：先输出 organicGrowthKernel，回答这篇文章从哪种作者状态、哪一处读者冲突、哪一粒素材火花、哪一个作者视角自然长出来；不要先拿规则、清单或模板决定正文。",
      "执行卡目标：明确哪一节负责历史节点、哪一节负责横向比较、哪一节负责落主判断，并输出爆款叙事计划：现场感、锚点、复合信源、故事数据交替、情绪钩子、母题回收。",
      "反说教目标：voiceChecklist 和 sectionBlueprint 必须把“你应该/先/再/最后/不要/必须”降到低频，章节入口必须是后果、矛盾或真实处境，不得连续输出命令句和框架灌输。",
      selectedTitle ? `沿用已确认标题=${selectedTitle}` : null,
      selectedOpeningHook ? `沿用已确认开头策略=${selectedOpeningHook}` : null,
      selectedTargetEmotion ? `目标情绪=${selectedTargetEmotion}` : null,
      selectedEndingStrategy ? `结尾动作=${selectedEndingStrategy}` : null,
    ].filter(Boolean).join("；");
  }
  if (stage === "factCheck") {
    return materialRealityMode === "fiction"
      ? "核查目标：只核查虚构与事实边界是否清楚；虚构人物、场景和数据可以存在，但不得被包装成现实世界可核验事实。"
      : "核查目标：如果发现问题来自研究不足、张力虚高或人味伪造，要明确把问题打回上游阶段，而不是只给局部措辞修补。";
  }
  return materialRealityMode === "fiction"
    ? "润色目标：增强虚构素材的画面、动作、对话和因果连贯性，同时保留虚构叙事口径。"
    : "润色目标：只修表达、节奏和机器味；如果问题本质上属于研究不足、开头无钩子或结构失焦，必须明确标为上游返工。";
}

export function buildArticlePromptQualityBrief(
  stage: ArticlePromptQualityBriefStage,
  input: ArticlePromptQualityBriefInput,
) {
  return [
    ...buildSharedLines(input),
    ...buildArticleViralBlueprintPromptLines(stage, input),
    buildStageLine(stage, input),
  ];
}

export const ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT = [
  "你在全自动文章生产线里工作，必须把高质量条件前置解决，而不是把问题留给终稿补救。",
  "任何缺证据、缺读者处境、缺核心张力、缺历史脉络、缺横向比较的问题，都必须在当前阶段暴露、补齐或明确降级表达。",
  ARTICLE_VIRAL_NARRATIVE_SYSTEM_CONTRACT,
  "深写作必须输出 organicGrowthKernel，并把它放在正文执行卡的最前面；规则、事实边界、反说教约束和禁词只作为护栏，不得替代文章的生长方向。",
  "非虚构、观点、分析、商业和事实型文章：禁止伪造第一人称经历、客户案例、聊天记录、现场细节、数字来源或收益结果。",
  "非虚构文章允许作者视角的匿名复合观察、假设场景和推演句，但必须标清边界；它们只能服务读者识别感和段落呼吸，不能被写成真实采访、真实案例或作者亲历。",
  "当前写作系统默认按非虚构、观点、分析、商业和事实型文章处理；只有题目、策略或显式参数明确要求小说、虚构、故事、寓言、剧本等，才进入虚构素材模式。",
  "虚构类文章不得冒充真实新闻、真实采访、真实公司内部数据或真实个人经历；现实品牌、真实人物和公共事件只能作为背景环境，不能编造未证实指控。",
  "标题、开头、结构和正文必须兑现当前素材现实模式：非虚构只承诺证据能兑现的判断；虚构要兑现人物、情节和世界观内部一致性。",
  "如果素材不足，非虚构要指出缺口并降级表达；虚构可以补足设定、复合场景和合理区间数据。",
].join("\n");
