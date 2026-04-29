import type { ArticlePrototypeCode } from "./writing-state";
import type { AuthorOutcomeFeedbackRecommendation, AuthorOutcomeFeedbackSignal } from "./author-outcome-feedback-ledger";

export const CREATIVE_LENS_CODES = [
  "case_dissection",
  "field_observation",
  "sharp_opinion",
  "warm_personal",
  "experimental_walkthrough",
  "counterintuitive_analysis",
  "tool_operator",
  "founder_memo",
] as const;

export type CreativeLensCode = (typeof CREATIVE_LENS_CODES)[number];

export type CreativeLensDefinition = {
  code: CreativeLensCode;
  label: string;
  suitableWhen: string;
  narrativePosture: string;
  readerDistance: string;
  judgementStrength: string;
  emotionalTemperature: string;
  openingMove: string;
  sectionRhythm: string;
  evidenceMode: string;
  antiOutlineRules: string[];
  tabooPatterns: string[];
  triggerPatterns: RegExp[];
  prototypeBias?: ArticlePrototypeCode[];
};

export type CreativeLensOption = CreativeLensDefinition & {
  triggerReason: string;
  historySignal?: {
    sampleCount: number;
    positiveSampleCount: number;
    rankingAdjustment: number;
    reason: string;
  } | null;
  isRecommended?: boolean;
};

export const CREATIVE_LENS_DEFINITIONS: CreativeLensDefinition[] = [
  {
    code: "case_dissection",
    label: "案例拆解镜头",
    suitableWhen: "适合创业案例、商业案例、增长打法、产品转型和账号复盘。",
    narrativePosture: "先把一个具体样本放到台面上，像拆一家公司、一条增长路径或一个决策现场，而不是先讲大道理。",
    readerDistance: "把读者当成正在借案例校准判断的人，默认他们想知道这件事能不能迁移到自己身上。",
    judgementStrength: "判断必须落在案例里的选择、代价和边界上，不用空泛结论替代拆解。",
    emotionalTemperature: "情绪保持克制但有胜负感，让读者看到机会、压力和错过窗口的代价。",
    openingMove: "从案例里最反常的结果、动作或代价切入，第一屏就给出样本名和变化。",
    sectionRhythm: "按样本推进：结果 -> 关键动作 -> 背后约束 -> 可迁移部分 -> 不可复制边界。",
    evidenceMode: "优先使用时间线、关键数字、创始人动作、产品变化、渠道变化和外部反馈。",
    antiOutlineRules: ["不要写成泛泛行业分析", "不要只列成功因素", "不要跳过失败边界"],
    tabooPatterns: ["案例说明了", "值得所有人学习", "底层逻辑很简单"],
    triggerPatterns: [/案例|拆解|复盘|增长|创业|融资|营收|商业模式|品牌|公司|创始人/i],
    prototypeBias: ["investigation", "phenomenon_analysis"],
  },
  {
    code: "field_observation",
    label: "现场观察镜头",
    suitableWhen: "适合有亲历、对话、用户反馈、社区讨论或一线场景的文章。",
    narrativePosture: "先站到现场里说话，让判断从看见、听见、碰到的细节里长出来。",
    readerDistance: "把读者当成在旁边听你复盘的熟人，不摆讲台，不用俯视口吻。",
    judgementStrength: "判断可以晚一点出现，但必须让场景自己把冲突推出来。",
    emotionalTemperature: "保留犹豫、惊讶、尴尬或不舒服的瞬间，避免写成冷冰冰的报告。",
    openingMove: "从一个动作、一句话、一次卡顿或一个表情切入，不先报结论。",
    sectionRhythm: "按现场推进：进入场景 -> 细节异常 -> 作者反应 -> 背后问题 -> 判断落点。",
    evidenceMode: "优先使用原话、动作、界面反馈、观察时间、人物角色和具体环境。",
    antiOutlineRules: ["不要把现场压缩成观点摘要", "不要先做概念定义", "不要用全知视角替代亲历视角"],
    tabooPatterns: ["我们不难发现", "这背后说明", "给大家几点建议"],
    triggerPatterns: [/我|我们|现场|对话|原话|用户|反馈|社区|群里|评论|体验|亲历|那天|有次|当时/i],
    prototypeBias: ["personal_narrative", "product_walkthrough"],
  },
  {
    code: "sharp_opinion",
    label: "锐评判断镜头",
    suitableWhen: "适合热点争议、行业误读、平台变化、规则变化和需要快速表态的文章。",
    narrativePosture: "先把判断钉住，再用事实解释为什么这个判断比热闹本身重要。",
    readerDistance: "把读者当成已经看过热闹的人，直接帮他们识别真正的利害关系。",
    judgementStrength: "判断要早、要清楚、要有对象，但每个尖锐判断后面都要接事实承重。",
    emotionalTemperature: "情绪可以更锋利，但不要撒气；重点是让读者觉得终于有人把话说透。",
    openingMove: "第一段直接指出主流误读或最该被戳破的说法。",
    sectionRhythm: "按判断推进：误读 -> 反证 -> 利益变化 -> 谁受影响 -> 最后表态。",
    evidenceMode: "优先使用反例、利益链、规则变化、对照样本和后果推演。",
    antiOutlineRules: ["不要铺太久背景", "不要两边都对式和稀泥", "不要把锐评写成情绪宣泄"],
    tabooPatterns: ["辩证来看", "各有利弊", "时间会给答案"],
    triggerPatterns: [/争议|刷屏|热搜|规则|平台|误读|真相|不是|反而|离谱|危险|警惕/i],
    prototypeBias: ["phenomenon_analysis", "general"],
  },
  {
    code: "warm_personal",
    label: "温热个人镜头",
    suitableWhen: "适合经验分享、成长复盘、职业转折、普通人机会和作者身份感较强的文章。",
    narrativePosture: "先承认自己的处境和变化，再把判断交给读者，而不是上来教读者怎么做。",
    readerDistance: "把读者当成处境相近的人，像把一段刚想明白的经历递过去。",
    judgementStrength: "判断可以柔一点，但不能散；每个温柔表达都要落回真实代价和选择。",
    emotionalTemperature: "保留自我怀疑、松动、释然和疼痛感，让读者愿意代入。",
    openingMove: "从一个让作者改变想法的时刻切入，先有人，再有观点。",
    sectionRhythm: "按心路推进：旧看法 -> 触发时刻 -> 真实代价 -> 新判断 -> 给读者的余地。",
    evidenceMode: "优先使用个人经历、时间变化、选择成本、对话和具体生活细节。",
    antiOutlineRules: ["不要端着教人", "不要把个人经历包装成唯一正确答案", "不要强行升华"],
    tabooPatterns: ["你应该", "必须做到", "普通人只要"],
    triggerPatterns: [/普通人|经历|成长|转折|焦虑|安全感|副业|职场|后来|想明白|说实话/i],
    prototypeBias: ["personal_narrative", "ordinary_breakthrough"],
  },
  {
    code: "experimental_walkthrough",
    label: "实测走查镜头",
    suitableWhen: "适合 AI 产品、SaaS、效率工具、GitHub 项目、工作流和产品评测。",
    narrativePosture: "像带读者一起跑一遍实测流程，把手感、卡点、产出和边界讲清楚。",
    readerDistance: "把读者当成准备试用但不想浪费时间的人，默认他们关心值不值得上手。",
    judgementStrength: "判断来自试用过程，不先吹结论；能用、难用、适合谁都要说清楚。",
    emotionalTemperature: "允许有惊喜和吐槽，但必须和具体操作绑定。",
    openingMove: "从一次具体操作结果或最意外的使用卡点开始。",
    sectionRhythm: "按使用路径推进：为什么试 -> 怎么跑 -> 哪里顺 -> 哪里卡 -> 适合谁。",
    evidenceMode: "优先使用操作步骤、输入输出、截图描述、成本、耗时、替代方案和失败点。",
    antiOutlineRules: ["不要写成产品通稿", "不要只列功能", "不要跳过失败操作"],
    tabooPatterns: ["强大到离谱", "效率提升神器", "闭眼入"],
    triggerPatterns: [/实测|上手|体验|试用|评测|工具|SaaS|AI 产品|Agent|GitHub|开源|工作流|效率/i],
    prototypeBias: ["product_walkthrough", "tool_share"],
  },
  {
    code: "counterintuitive_analysis",
    label: "反常识分析镜头",
    suitableWhen: "适合旧判断失效、行业转向、用户行为变化和看起来反直觉的商业现象。",
    narrativePosture: "先拿出一个反常识现象，再解释为什么旧解释不够用了。",
    readerDistance: "把读者当成已经有旧经验的人，重点帮他们发现经验失效的瞬间。",
    judgementStrength: "判断要围绕“旧解释为什么解释不了”展开，不要只换一套新口号。",
    emotionalTemperature: "情绪来自认知落差和损失感，而不是故作高深。",
    openingMove: "从一个和常识相反的现象或结果开头，直接制造认知缝隙。",
    sectionRhythm: "按反转推进：旧共识 -> 反常现象 -> 旧解释失效 -> 新变量 -> 新判断。",
    evidenceMode: "优先使用前后对比、反例、指标变化、角色错位和边界条件。",
    antiOutlineRules: ["不要故弄玄虚", "不要把反常识写成标题党", "不要用抽象词堆解释"],
    tabooPatterns: ["真正的底层逻辑", "认知升级", "旧解释开始松动"],
    triggerPatterns: [/反常识|旧判断|失效|变化|转向|为什么|不是.*而是|看起来|反而|突然/i],
    prototypeBias: ["phenomenon_analysis", "investigation"],
  },
  {
    code: "tool_operator",
    label: "工具操盘镜头",
    suitableWhen: "适合教程、Prompt、自动化方案、效率工具组合和可执行工作流。",
    narrativePosture: "像一个刚跑通流程的人，把关键动作、坑和取舍交代清楚。",
    readerDistance: "把读者当成马上要照着试的人，默认他们需要判断顺序和避坑点。",
    judgementStrength: "少喊原则，多给动作；结论必须能转成下一步操作。",
    emotionalTemperature: "情绪保持实用和轻微兴奋，不制造虚假确定性。",
    openingMove: "从一个具体产出或节省下来的动作开始，不先解释工具背景。",
    sectionRhythm: "按执行推进：目标 -> 配置 -> 第一次跑通 -> 常见坑 -> 复用模板。",
    evidenceMode: "优先使用参数、流程、输入输出、失败提示、成本和复用条件。",
    antiOutlineRules: ["不要写成概念科普", "不要省略关键配置", "不要用一句话带过限制"],
    tabooPatterns: ["一键搞定", "万能模板", "保姆级但不讲坑"],
    triggerPatterns: [/Prompt|提示词|自动化|教程|配置|脚本|模板|流程|怎么做|步骤|workflow/i],
    prototypeBias: ["methodology", "tool_share"],
  },
  {
    code: "founder_memo",
    label: "创始人备忘录镜头",
    suitableWhen: "适合创业判断、产品方向、商业取舍、组织变化和战略复盘。",
    narrativePosture: "像写一封给团队或自己的备忘录，先讲取舍，再讲为什么此刻必须做决定。",
    readerDistance: "把读者当成也在做取舍的人，默认他们关心约束、现金流、组织和窗口期。",
    judgementStrength: "判断必须清楚，但要承认资源约束和未验证假设。",
    emotionalTemperature: "情绪保持冷静、有压力、有责任感，不写成鸡血宣言。",
    openingMove: "从一个必须取舍的决策点开始，第一屏交代约束和代价。",
    sectionRhythm: "按决策推进：约束 -> 可选路径 -> 舍弃什么 -> 为什么现在 -> 下一步验证。",
    evidenceMode: "优先使用资源约束、现金流、团队能力、用户反馈、竞争窗口和验证指标。",
    antiOutlineRules: ["不要写成成功学", "不要假装没有约束", "不要把战略写成口号"],
    tabooPatterns: ["长期主义就够了", "All in", "颠覆行业"],
    triggerPatterns: [/创始人|创业|团队|战略|现金流|融资|PMF|产品方向|取舍|组织|验证/i],
    prototypeBias: ["investigation", "general"],
  },
];

function normalizeCreativeLensCode(value: unknown): CreativeLensCode | null {
  const normalized = String(value || "").trim();
  return CREATIVE_LENS_CODES.includes(normalized as CreativeLensCode) ? normalized as CreativeLensCode : null;
}

function scoreLens(definition: CreativeLensDefinition, input: {
  seed: string;
  articlePrototype?: ArticlePrototypeCode | null;
  outcomeSignal?: Pick<AuthorOutcomeFeedbackSignal, "rankingAdjustment"> | null;
}) {
  const triggerScore = definition.triggerPatterns.reduce((sum, pattern) => sum + (pattern.test(input.seed) ? 8 : 0), 0);
  const prototypeScore = input.articlePrototype && definition.prototypeBias?.includes(input.articlePrototype) ? 6 : 0;
  const fallbackScore = definition.code === "field_observation" ? 1 : 0;
  const historyScore = input.outcomeSignal
    ? Math.max(-12, Math.min(12, -input.outcomeSignal.rankingAdjustment))
    : 0;
  return triggerScore + prototypeScore + fallbackScore + historyScore;
}

export function getCreativeLensDefinition(code: CreativeLensCode) {
  return CREATIVE_LENS_DEFINITIONS.find((definition) => definition.code === code) ?? CREATIVE_LENS_DEFINITIONS[0];
}

export function resolveCreativeLens(input: {
  title: string;
  markdownContent?: string | null;
  humanSignals?: {
    firstHandObservation?: string | null;
    feltMoment?: string | null;
    realSceneOrDialogue?: string | null;
    whyThisHitMe?: string | null;
  } | null;
  researchBrief?: {
    coreQuestion?: string | null;
    strategyWriteback?: {
      targetReader?: string | null;
      coreAssertion?: string | null;
      researchHypothesis?: string | null;
    } | null;
  } | null;
  strategyCard?: {
    archetype?: string | null;
    targetReader?: string | null;
    coreAssertion?: string | null;
    researchHypothesis?: string | null;
    whyNow?: string | null;
  } | null;
  articlePrototype?: ArticlePrototypeCode | null;
  preferredLensCode?: CreativeLensCode | null;
  outcomeSignals?: AuthorOutcomeFeedbackSignal[];
  outcomeRecommendation?: AuthorOutcomeFeedbackRecommendation;
}) {
  const seed = [
    input.title,
    input.markdownContent,
    input.humanSignals?.firstHandObservation,
    input.humanSignals?.feltMoment,
    input.humanSignals?.realSceneOrDialogue,
    input.humanSignals?.whyThisHitMe,
    input.researchBrief?.coreQuestion,
    input.researchBrief?.strategyWriteback?.targetReader,
    input.researchBrief?.strategyWriteback?.coreAssertion,
    input.researchBrief?.strategyWriteback?.researchHypothesis,
    input.strategyCard?.archetype,
    input.strategyCard?.targetReader,
    input.strategyCard?.coreAssertion,
    input.strategyCard?.researchHypothesis,
    input.strategyCard?.whyNow,
  ].map((item) => String(item || "").trim()).filter(Boolean).join(" ");
  const outcomeSignalByCode = new Map(
    (input.outcomeSignals ?? [])
      .map((signal) => [normalizeCreativeLensCode(signal.key), signal] as const)
      .filter((entry): entry is readonly [CreativeLensCode, AuthorOutcomeFeedbackSignal] => Boolean(entry[0])),
  );
  const recommendedSignalCode = normalizeCreativeLensCode(input.outcomeRecommendation?.key);
  const options = CREATIVE_LENS_DEFINITIONS
    .map((definition) => {
      const outcomeSignal =
        outcomeSignalByCode.get(definition.code)
        ?? (recommendedSignalCode === definition.code && input.outcomeRecommendation
          ? {
              key: input.outcomeRecommendation.key,
              label: input.outcomeRecommendation.label,
              sampleCount: input.outcomeRecommendation.sampleCount,
              hitCount: 0,
              nearMissCount: 0,
              missCount: 0,
              positiveSampleCount: input.outcomeRecommendation.positiveSampleCount,
              followedRecommendationSampleCount: 0,
              followedRecommendationPositiveCount: 0,
              performanceScore: 0,
              rankingAdjustment: input.outcomeRecommendation.rankingAdjustment,
              reason: input.outcomeRecommendation.reason,
            } satisfies AuthorOutcomeFeedbackSignal
          : null);
      const score = scoreLens(definition, {
        seed,
        articlePrototype: input.articlePrototype,
        outcomeSignal,
      });
      const historyReason = outcomeSignal?.reason
        ? `历史结果：${outcomeSignal.reason}`
        : "";
      const triggerReason =
        [
          score > 0
            ? `命中「${definition.label}」：${definition.suitableWhen}`
            : `可作为备选：${definition.suitableWhen}`,
          historyReason,
        ].filter(Boolean).join(" ");
      return {
        ...definition,
        triggerReason,
        historySignal: outcomeSignal
          ? {
              sampleCount: outcomeSignal.sampleCount,
              positiveSampleCount: outcomeSignal.positiveSampleCount,
              rankingAdjustment: outcomeSignal.rankingAdjustment,
              reason: outcomeSignal.reason,
            }
          : null,
        score,
      };
    })
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "zh-CN"));
  const preferredCode = normalizeCreativeLensCode(input.preferredLensCode);
  const preferred = preferredCode ? options.find((option) => option.code === preferredCode) ?? null : null;
  const selected = preferred ?? options[0] ?? { ...CREATIVE_LENS_DEFINITIONS[0], triggerReason: CREATIVE_LENS_DEFINITIONS[0].suitableWhen };
  const selectedReason =
    preferred && options[0] && preferred.code !== options[0].code
      ? `已手动切换到「${preferred.label}」。系统默认推荐是「${options[0].label}」；本次切换依据：${preferred.triggerReason}`
      : selected.triggerReason;

  return {
    selected: {
      ...selected,
      triggerReason: selectedReason,
    } satisfies CreativeLensOption,
    options: options.map(({ score: _score, ...option }, index) => ({
      ...option,
      isRecommended: index === 0,
    }) satisfies CreativeLensOption),
  };
}
