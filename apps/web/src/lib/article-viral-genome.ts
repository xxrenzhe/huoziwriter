import {
  BUSINESS_MONETIZATION_CORPUS_PROFILE,
  getPlan24TopicSignature,
  inferPlan24Vertical,
  PLAN24_CORPUS_SUMMARY,
  type AuthorPostureMode,
  type Plan24MechanismLabel,
  type Plan24VerticalProfile,
} from "./article-viral-genome-corpus";

export type ArticleViralGenomeStage =
  | "researchBrief"
  | "audienceAnalysis"
  | "outlinePlanning"
  | "titleOptimization"
  | "openingOptimization"
  | "deepWriting"
  | "factCheck"
  | "prosePolish";

export type ArticleViralGenomeInput = {
  title?: string | null;
  centralThesis?: string | null;
  targetReader?: string | null;
  authorLens?: string | null;
  materialSpark?: string | null;
  viralBlueprintLabel?: string | null;
  materialRealityMode?: "nonfiction" | "fiction" | null;
};

export type ViralVisualRhythmSlotCode =
  | "early_evidence"
  | "middle_pacing"
  | "late_reinforcement"
  | "saveable_summary";

export type ViralVisualRhythmSlot = {
  code: ViralVisualRhythmSlotCode;
  label: string;
  preferredPosition: "early" | "middle" | "late";
  purpose: string;
};

export type ArticleViralGenomePack = {
  sampleSummary: string;
  sampleSourceProfile: {
    source: "plan24_business_monetization_100";
    generatedAt: string;
    topicSignature: string;
    vertical: string;
    categorySampleCount: number;
    accountCount: number;
    matchedMechanisms: string[];
    visualProfile: string;
    sparseTrack: boolean;
    coverageNote: string;
    dominantPostures: string[];
  };
  mechanismBias: {
    code: "number_anchor" | "entity_event" | "counter_intuition" | "question_gap" | "risk_alert" | "scene_test";
    label: string;
    reason: string;
  };
  upstreamDirections: string[];
  openingDirections: string[];
  narrativeMechanics: string[];
  antiDidacticContracts: string[];
  firstScreenPromise: string;
  shareTrigger: string;
  authorPosture: string;
  authorPostureMode: AuthorPostureMode;
  businessQuestions: string[];
  titleDirections: string[];
  openingEngine: string;
  narrativeSkeleton: string;
  sparseTrackAlert: string;
  evidencePriorities: string[];
  emotionVectors: string[];
  readerShareReasons: string[];
  materialJobs: string[];
  negativePatterns: string[];
  readerSceneAnchors: string[];
  abstractToConcretePairs: Array<{
    abstract: string;
    concrete: string;
  }>;
  openingMicroScenes: string[];
  visualRhythmSlots: ViralVisualRhythmSlot[];
};

const SAMPLE_SUMMARY =
  `商业变现聚焦百篇样本：${PLAN24_CORPUS_SUMMARY.sampleCount} 篇全文、${PLAN24_CORPUS_SUMMARY.categoryCount} 个题材、${PLAN24_CORPUS_SUMMARY.accountCount} 个账号，单题材最高 ${Math.round(PLAN24_CORPUS_SUMMARY.maxCategoryRatio * 100)}%、单账号最高 ${Math.round(PLAN24_CORPUS_SUMMARY.maxAccountRatio * 100)}%；样本平均正文约 ${PLAN24_CORPUS_SUMMARY.averageTextLength} 字、平均配图 ${PLAN24_CORPUS_SUMMARY.averageImageCount} 张、开头导师式指令信号均值 ${PLAN24_CORPUS_SUMMARY.averageDidacticSignal}。`;

const MECHANISM_SUMMARY = `高频机制：${PLAN24_CORPUS_SUMMARY.globalMechanisms.map((item) => `${item.label} ${item.count}`).join("、")}。`;
const POSTURE_SUMMARY = `高频作者姿态：${BUSINESS_MONETIZATION_CORPUS_PROFILE.dominantAuthorPostures.join("、")}。`;
const SPARSE_TRACK_SUMMARY = `稀疏题材：${BUSINESS_MONETIZATION_CORPUS_PROFILE.sparseTracks.join("、")}。`;

const VISUAL_RHYTHM_SLOTS: ViralVisualRhythmSlot[] = [
  {
    code: "early_evidence",
    label: "早段证据位",
    preferredPosition: "early",
    purpose: "在读者刚进入判断时补一张可信证据图，降低继续阅读的怀疑成本。",
  },
  {
    code: "middle_pacing",
    label: "中段换气位",
    preferredPosition: "middle",
    purpose: "在信息密度上升处用图承接比较、结构或现场变化，避免正文连续说理。",
  },
  {
    code: "late_reinforcement",
    label: "后段强化位",
    preferredPosition: "late",
    purpose: "在主判断落地前后强化结论、代价或角色分化，让读者更容易保存和转发。",
  },
  {
    code: "saveable_summary",
    label: "可保存总结位",
    preferredPosition: "late",
    purpose: "把最终判断压成可复述的视觉资产，但不替正文下教学式结论。",
  },
];

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(values: Array<string | null | undefined>, limit = 8) {
  return Array.from(new Set(values.map((item) => getString(item)).filter(Boolean))).slice(0, limit);
}

function inferReader(input: ArticleViralGenomeInput) {
  return getString(input.targetReader) || "目标读者";
}

function inferSubject(input: ArticleViralGenomeInput) {
  return getString(input.title) || getString(input.centralThesis) || "当前主题";
}

function mechanismLabelToBias(label: Plan24MechanismLabel): ArticleViralGenomePack["mechanismBias"] {
  if (label === "数字锚点") {
    return {
      code: "number_anchor",
      label,
      reason: "同题材样本高频用数字、比例、时间或结果先建立信息量，第一屏要把数字翻译成真实钱流、效率差或决策压力。",
    };
  }
  if (label === "问题悬念") {
    return {
      code: "question_gap",
      label,
      reason: "同题材样本常用具体问题打开阅读，正文前 200 字必须先回答半步，不要把答案一直拖后。",
    };
  }
  if (label === "反常识翻转") {
    return {
      code: "counter_intuition",
      label,
      reason: "同题材样本常靠旧判断失效制造传播张力，开头必须先让读者看见错位发生在哪里。",
    };
  }
  if (label === "风险提醒") {
    return {
      code: "risk_alert",
      label,
      reason: "同题材样本用风险和代价提高停留，第一屏必须把已经发生的损失或误判写具体。",
    };
  }
  if (label === "场景实测") {
    return {
      code: "scene_test",
      label,
      reason: "同题材样本用动作、体验或现场结果建立可信度，正文先给动作和结果，再进入解释。",
    };
  }
  return {
    code: "entity_event",
    label,
    reason: "同题材样本优先让读者看清具体人、公司、产品、岗位或事件发生了什么变化。",
  };
}

function inferMechanismBias(
  input: ArticleViralGenomeInput,
  verticalProfile: Plan24VerticalProfile,
): ArticleViralGenomePack["mechanismBias"] {
  const seed = [input.title, input.centralThesis, input.viralBlueprintLabel]
    .map((item) => getString(item))
    .filter(Boolean)
    .join(" ");
  if (/\d|%|倍|万|亿|年|月|天|小时|分钟|ARR|MRR|GMV|ROI/i.test(seed)) {
    return {
      code: "number_anchor",
      label: "数字锚点",
      reason: "标题或主判断带有明确数字、比例、时间或结果区间，第一屏必须尽快解释这个数字为什么对读者有现实后果。",
    };
  }
  if (/为什么|如何|凭什么|到底|吗|\?|\？/.test(seed)) {
    return {
      code: "question_gap",
      label: "问题悬念",
      reason: "标题以问题方式打开，正文前 200 字必须先给读者半步答案，而不是只吊胃口。",
    };
  }
  if (/不是|却|反而|终于|原来|没想到|竟然|而是|别再|真正|只盯|只看|表面|失效/.test(seed)) {
    return {
      code: "counter_intuition",
      label: "反常识翻转",
      reason: "主题天然适合用旧判断失效推进，开头不能平铺背景，要先把错位亮出来。",
    };
  }
  if (/风险|危险|代价|失控|崩|坑|警惕|别轻易|不要|删掉|亏钱|踩坑/.test(seed)) {
    return {
      code: "risk_alert",
      label: "风险提醒",
      reason: "读者点开是为了确认自己是否正在吃亏，第一屏必须先让代价可见。",
    };
  }
  if (/实测|试了|复盘|现场|对话|亲测|体验|跑了一遍/.test(seed)) {
    return {
      code: "scene_test",
      label: "场景实测",
      reason: "题目自带现场或测试感，正文优先给动作与结果，不先抽象总结。",
    };
  }
  return mechanismLabelToBias(verticalProfile.dominantMechanisms[0] || "实体事件解释");
}

function selectAuthorPostureMode(
  input: ArticleViralGenomeInput,
  verticalProfile: Plan24VerticalProfile,
): AuthorPostureMode {
  const seed = [
    input.title,
    input.centralThesis,
    input.authorLens,
    input.materialSpark,
  ].map((item) => getString(item)).join(" ");
  if (/实测|试了|复盘|亲测|踩坑|跑了一遍|体验|上手/.test(seed)) {
    return verticalProfile.authorPostureModes.includes("operator_test")
      ? "operator_test"
      : verticalProfile.authorPostureModes[0] || "analysis_interpreter";
  }
  if (/公司|创始人|ceo|融资|估值|营收|品牌|收购|案例|拆解|组织|岗位/.test(seed)) {
    return verticalProfile.authorPostureModes.includes("case_breakdown")
      ? "case_breakdown"
      : verticalProfile.authorPostureModes[0] || "analysis_interpreter";
  }
  if (/解释|判断|意味着|背后|变量|结构/.test(seed)) {
    return verticalProfile.authorPostureModes.includes("analysis_interpreter")
      ? "analysis_interpreter"
      : verticalProfile.authorPostureModes[0] || "analysis_interpreter";
  }
  return verticalProfile.authorPostureModes[0] || "analysis_interpreter";
}

function buildOpeningEngine(input: {
  mechanismBias: ArticleViralGenomePack["mechanismBias"];
  verticalProfile: Plan24VerticalProfile;
}) {
  if (input.mechanismBias.code === "number_anchor") return "账本/结果先抛";
  if (input.mechanismBias.code === "risk_alert") return "误判代价先抛";
  if (input.mechanismBias.code === "scene_test") return "工具实测结论先抛";
  if (input.verticalProfile.key === "business_case") return "公司/创始人/产品动作先抛";
  if (input.verticalProfile.key === "career") return "岗位/行业变化现场先抛";
  return input.verticalProfile.openingEngines[0] || "账本/结果先抛";
}

function buildNarrativeSkeleton(input: {
  verticalProfile: Plan24VerticalProfile;
  authorPostureMode: AuthorPostureMode;
}) {
  if (input.authorPostureMode === "operator_test") {
    return input.verticalProfile.narrativeSkeletons.find((item) => /实测结论/.test(item))
      || input.verticalProfile.narrativeSkeletons[0]
      || "实测结论 -> 使用门槛 -> 最强场景 -> 最差场景 -> 是否值得换";
  }
  if (input.authorPostureMode === "case_breakdown") {
    return input.verticalProfile.narrativeSkeletons.find((item) => /对象动作/.test(item))
      || input.verticalProfile.narrativeSkeletons[0]
      || "对象动作 -> 表面解释 -> 真正变量 -> 后果/代价 -> 读者如何对照自己";
  }
  return input.verticalProfile.narrativeSkeletons.find((item) => /变化出现/.test(item))
    || input.verticalProfile.narrativeSkeletons[0]
    || "变化出现 -> 为什么现在 -> 钱从哪里来 -> 谁能做/谁别碰 -> 最低风险试法";
}

function buildSparseTrackAlert(verticalProfile: Plan24VerticalProfile) {
  if (!verticalProfile.sparseTrack) return "";
  return `当前题材落在样本稀疏区：${verticalProfile.coverageNote} 研究阶段必须优先补外部案例、平台规则、账本数字和不适合谁，不能直接套高覆盖赛道的文章手感。`;
}

function buildTitleDirections(input: {
  mechanismBias: ArticleViralGenomePack["mechanismBias"];
  subject: string;
  reader: string;
  verticalProfile: Plan24VerticalProfile;
}) {
  const shared = [
    "标题先压具体对象，再压变化或后果，避免只写抽象判断和口号。",
    "优先把对象、变化、代价/机会放进同一条承诺里，不要把信息拆散到副标题思路。",
    `标题必须让 ${input.reader} 一眼知道这件事和谁有关、现在变了什么。`,
  ];
  if (input.mechanismBias.code === "number_anchor") {
    return compact([
      "优先使用数字结果、比例、时间或成本差，但数字后面必须跟真实后果，不准悬浮。",
      `把「${input.subject}」里的数字翻译成预算、转化、留存、效率或机会窗口。`,
      ...shared,
    ], 5);
  }
  if (input.mechanismBias.code === "question_gap") {
    return compact([
      "问题型标题必须把问题问在具体对象和真实误判上，不能泛问“为什么/如何”。",
      "问题里最好藏一个读者已经感到的卡点、代价或错位。",
      ...shared,
    ], 5);
  }
  if (input.mechanismBias.code === "counter_intuition") {
    return compact([
      "优先写旧判断失效、常识翻转或表面解释不够用的那一下。",
      "翻转不是抖机灵，必须让读者看到对象、旧解释和真正变量同时出现。",
      ...shared,
    ], 5);
  }
  if (input.mechanismBias.code === "risk_alert") {
    return compact([
      "风险型标题先写已经发生的损失、误判路径或代价，不要泛写“警惕”“注意”。",
      "最好让读者感到：这不是别人的坑，而是自己下一步可能踩到的坑。",
      ...shared,
    ], 5);
  }
  if (input.mechanismBias.code === "scene_test") {
    return compact([
      "实测型标题优先压入测试对象、结果差异和是否值得换的判断。",
      "让标题像一次真实试用后的判断，不像产品说明书。",
      ...shared,
    ], 5);
  }
  return compact([
    "优先使用数字结果、工具产品名、实体事件解释、身份实体或案例拆解这几类高频标题驱动。",
    `把「${input.subject}」写成一个具体对象正在发生的变化，而不是泛行业趋势。`,
    ...shared,
  ], 5);
}

function buildFirstScreenPromise(input: {
  mechanismBias: ArticleViralGenomePack["mechanismBias"];
  reader: string;
  subject: string;
  verticalProfile: Plan24VerticalProfile;
  openingEngine: string;
}) {
  const materialJobs = input.verticalProfile.materialJobs.slice(0, 3).join("、");
  const base = `前 120 字必须出现：一个具体对象、一处正在发生的变化、一个 ${input.reader} 能感到的后果；前 200 字必须补上半步答案。开头发动机=${input.openingEngine}；素材优先覆盖 ${materialJobs}。`;
  if (input.mechanismBias.code === "number_anchor") {
    return `${base} 数字不能悬浮，必须翻译成预算、时间、转化、留存或机会窗口。`;
  }
  if (input.mechanismBias.code === "question_gap") {
    return `${base} 先回答「${input.subject}」里的关键问题半步，不用背景介绍磨蹭。`;
  }
  if (input.mechanismBias.code === "counter_intuition") {
    return `${base} 先给旧判断失效的那一刻，再让 ${input.reader} 看见错位已经发生。`;
  }
  if (input.mechanismBias.code === "risk_alert") {
    return `${base} 先把误判路径、预算代价或效率损失写给 ${input.reader} 看。`;
  }
  if (input.mechanismBias.code === "scene_test") {
    return `${base} 先给测试动作、现场结果或复盘切口，再进入解释。`;
  }
  return `${base} 先交代「${input.subject}」里的具体变化和它为什么已经影响到 ${input.reader}。`;
}

function buildShareTrigger(input: {
  mechanismBias: ArticleViralGenomePack["mechanismBias"];
  reader: string;
  verticalProfile: Plan24VerticalProfile;
  sparseTrackAlert: string;
}) {
  const reason = input.verticalProfile.readerShareReasons[0] || "文章替读者讲清一个具体变化";
  const suffix = input.verticalProfile.sparseTrack
    ? "稀疏题材更需要把证据写硬，读者才敢转。"
    : "读者能拿这篇文章替自己在会上、群里或朋友圈说话。";
  if (input.mechanismBias.code === "number_anchor") {
    return `${input.reader} 愿意转发，是因为${reason}，并把悬浮数字翻译成真实代价或机会窗口。${suffix}`;
  }
  if (input.mechanismBias.code === "question_gap") {
    return `${input.reader} 愿意转发，是因为${reason}，还提前回答了一个很多人都在问的问题。${suffix}`;
  }
  if (input.mechanismBias.code === "counter_intuition") {
    return `${input.reader} 愿意转发，是因为${reason}，并把“原来不是那样”的识别感讲清楚。${suffix}`;
  }
  if (input.mechanismBias.code === "risk_alert") {
    return `${input.reader} 愿意转发，是因为${reason}，而且警报具体，不是泛泛提醒。${suffix}`;
  }
  if (input.mechanismBias.code === "scene_test") {
    return `${input.reader} 愿意转发，是因为${reason}，并给了一个带现场感的可复述案例。${suffix}`;
  }
  return `${input.reader} 愿意转发，是因为${reason}，让一个具体对象的变化变得可复述。${suffix}`;
}

function buildAuthorPosture(input: {
  authorPostureMode: AuthorPostureMode;
  authorLens: string;
}) {
  if (input.authorPostureMode === "operator_test") {
    return `${input.authorLens}，像刚做完一次实测或复盘的人，先把自己看到的结果端上来，而不是在讲课。`;
  }
  if (input.authorPostureMode === "case_breakdown") {
    return `${input.authorLens}，像替读者拆一个案例、算一笔账的人，不站在高处发指令。`;
  }
  return `${input.authorLens}，像正在替读者解释变化、翻译后果的人，不急着把全文降成方法论。`;
}

function buildBusinessQuestions(input: {
  reader: string;
  subject: string;
  verticalProfile: Plan24VerticalProfile;
}) {
  return compact(
    input.verticalProfile.businessQuestions.map((question) =>
      question
        .replace(/这篇文章/g, `这篇关于「${input.subject}」的文章`)
        .replace(/读者/g, input.reader),
    ),
    7,
  );
}

function buildEvidencePriorities(
  mechanismBias: ArticleViralGenomePack["mechanismBias"],
  verticalProfile: Plan24VerticalProfile,
) {
  const profilePriorities = verticalProfile.evidencePriorities.slice(0, 3);
  const evidenceRecipe = verticalProfile.evidenceRecipes[0] || "";
  if (mechanismBias.code === "number_anchor") {
    return compact([...profilePriorities, "数字或比例锚点", "对应代价或收益", "一组对照事实", evidenceRecipe], 6);
  }
  if (mechanismBias.code === "question_gap") {
    return compact([...profilePriorities, "问题对应的真实处境", "第一层答案", "反例或限制条件", evidenceRecipe], 6);
  }
  if (mechanismBias.code === "counter_intuition") {
    return compact([...profilePriorities, "旧常识", "翻转信号", "关键变量", "谁因此受益或吃亏"], 6);
  }
  if (mechanismBias.code === "risk_alert") {
    return compact([...profilePriorities, "已发生的代价", "误判路径", "风险边界", "避免继续吃亏的判断"], 6);
  }
  if (mechanismBias.code === "scene_test") {
    return compact([...profilePriorities, "动作或测试场景", "结果", "为什么有效或失效", "可推广与不可推广部分"], 6);
  }
  return compact([...profilePriorities, "具体对象", "变化事件", "结构解释", "读者收益或损失"], 6);
}

function buildEmotionVectors(
  mechanismBias: ArticleViralGenomePack["mechanismBias"],
  verticalProfile: Plan24VerticalProfile,
) {
  const profileVectors = verticalProfile.emotionVectors.slice(0, 3);
  if (mechanismBias.code === "number_anchor") return compact([...profileVectors, "意外", "算清代价", "看懂窗口"], 5);
  if (mechanismBias.code === "question_gap") return compact([...profileVectors, "好奇", "被回答", "终于讲明白"], 5);
  if (mechanismBias.code === "counter_intuition") return compact([...profileVectors, "错愕", "识别感", "判断翻转"], 5);
  if (mechanismBias.code === "risk_alert") return compact([...profileVectors, "警醒", "代入损失", "及时止损"], 5);
  if (mechanismBias.code === "scene_test") return compact([...profileVectors, "在场感", "信服", "想复述"], 5);
  return compact([...profileVectors, "看见变化", "理解原因", "愿意转发"], 5);
}

function buildVisualSlotCount(verticalProfile: Plan24VerticalProfile) {
  return verticalProfile.visualProfile.averageImageCount >= 15 ? 4 : 3;
}

export function buildViralVisualRhythmSlots(count: number): ViralVisualRhythmSlot[] {
  const normalizedCount = Math.max(0, Math.min(4, Math.floor(count)));
  if (normalizedCount <= 0) return [];
  if (normalizedCount === 1) return [VISUAL_RHYTHM_SLOTS[1]];
  if (normalizedCount === 2) return [VISUAL_RHYTHM_SLOTS[0], VISUAL_RHYTHM_SLOTS[2]];
  if (normalizedCount === 3) return [VISUAL_RHYTHM_SLOTS[0], VISUAL_RHYTHM_SLOTS[1], VISUAL_RHYTHM_SLOTS[2]];
  return VISUAL_RHYTHM_SLOTS;
}

export function buildArticleViralGenomePack(input: ArticleViralGenomeInput = {}): ArticleViralGenomePack {
  const reader = inferReader(input);
  const subject = inferSubject(input);
  const topicSignature = getPlan24TopicSignature({
    title: input.title,
    centralThesis: input.centralThesis,
    targetReader: input.targetReader,
    materialSpark: input.materialSpark,
    viralBlueprintLabel: input.viralBlueprintLabel,
  });
  const verticalProfile = inferPlan24Vertical(topicSignature || subject);
  const mechanismBias = inferMechanismBias(input, verticalProfile);
  const blueprintLabel = getString(input.viralBlueprintLabel) || "当前爆文蓝图";
  const authorLens = getString(input.authorLens) || "作者从自己真正盯住的问题进入";
  const materialSpark = getString(input.materialSpark) || "选出一粒能让判断站住的事实、场景、账本或作者推演";
  const authorPostureMode = selectAuthorPostureMode(input, verticalProfile);
  const titleDirections = buildTitleDirections({ mechanismBias, subject, reader, verticalProfile });
  const openingEngine = buildOpeningEngine({ mechanismBias, verticalProfile });
  const narrativeSkeleton = buildNarrativeSkeleton({ verticalProfile, authorPostureMode });
  const sparseTrackAlert = buildSparseTrackAlert(verticalProfile);
  const firstScreenPromise = buildFirstScreenPromise({
    mechanismBias,
    reader,
    subject,
    verticalProfile,
    openingEngine,
  });
  const shareTrigger = buildShareTrigger({ mechanismBias, reader, verticalProfile, sparseTrackAlert });
  const authorPosture = buildAuthorPosture({ authorPostureMode, authorLens });
  const businessQuestions = buildBusinessQuestions({ reader, subject, verticalProfile });
  const evidencePriorities = buildEvidencePriorities(mechanismBias, verticalProfile);
  const emotionVectors = buildEmotionVectors(mechanismBias, verticalProfile);
  const visualProfile = `样本垂类「${verticalProfile.category}」平均配图 ${verticalProfile.visualProfile.averageImageCount} 张；首图高频位置=${verticalProfile.visualProfile.dominantFirstImageTiming}；作用=${verticalProfile.visualProfile.firstScreenImageRole}`;

  return {
    sampleSummary: `${SAMPLE_SUMMARY} ${MECHANISM_SUMMARY} ${POSTURE_SUMMARY} ${SPARSE_TRACK_SUMMARY}`,
    sampleSourceProfile: {
      source: "plan24_business_monetization_100",
      generatedAt: PLAN24_CORPUS_SUMMARY.generatedAt,
      topicSignature: topicSignature || subject,
      vertical: verticalProfile.category,
      categorySampleCount: verticalProfile.sampleCount,
      accountCount: verticalProfile.accountCount,
      matchedMechanisms: verticalProfile.dominantMechanisms,
      visualProfile,
      sparseTrack: verticalProfile.sparseTrack,
      coverageNote: verticalProfile.coverageNote,
      dominantPostures: BUSINESS_MONETIZATION_CORPUS_PROFILE.dominantAuthorPostures,
    },
    mechanismBias,
    upstreamDirections: compact([
      `这篇文章先服务「${blueprintLabel}」，并按商业聚焦样本垂类「${verticalProfile.category}」生长；正文方向由处境、冲突、素材、钱流和作者视角共同长出来。`,
      `先写 ${reader} 已经付出的代价、误判或复盘现场，再让「${subject}」的判断浮出来；素材优先覆盖 ${verticalProfile.materialJobs.slice(0, 4).join("、")}。`,
      `把 ${materialSpark} 放到上游，不等正文阶段再临时补“人味”或补“案例感”。`,
      `${authorPosture}`,
      ...BUSINESS_MONETIZATION_CORPUS_PROFILE.firstScreenRules,
      sparseTrackAlert,
    ], 6),
    openingDirections: compact([
      ...verticalProfile.openingJobs,
      `开头发动机优先使用「${openingEngine}」。`,
      "首句必须有具体对象，前 120 字必须出现后果、代价或机会，前 200 字必须给半步答案。",
      "不要先写趋势背景、方法导语、概念解释，也不要一上来教读者怎么做。",
      "如果没有真实现场，就写作者视角的匿名观察或判断句，不伪造亲历镜头。",
    ], 6),
    narrativeMechanics: compact([
      `同题材样本高频转发理由：${verticalProfile.readerShareReasons.join("；")}。`,
      `商业型叙事骨架：${narrativeSkeleton}。`,
      `高频证据配方：${verticalProfile.evidenceRecipes.join("；")}。`,
      "高概率爆点不是观点更响，而是读者能看见对象、变化和后果正在发生。",
      "结构按承诺兑现顺序推进：可见信号、误判代价、关键变量、角色分化、反例边界、可转发判断。",
      "中段用数字锚点、实体事件、反转或问题句轮换推进，避免连续概念解释。",
    ], 6),
    antiDidacticContracts: compact([
      `正文作者姿态必须先锁定为「${authorPostureMode}」，不能写着写着滑回导师口吻。`,
      "正文不以“你应该/首先/其次/最后/必须/不要”作为主节奏。",
      "建议必须藏在读者已看见的代价之后，以判断、边界或复盘口吻出现。",
      "下游规则只校正事实、边界、禁词和风险，不替代作者状态与读者冲突。",
      `避开同题材低质模式：${verticalProfile.negativePatterns.join("；")}。`,
    ], 5),
    firstScreenPromise,
    shareTrigger,
    authorPosture,
    authorPostureMode,
    businessQuestions,
    titleDirections,
    openingEngine,
    narrativeSkeleton,
    sparseTrackAlert,
    evidencePriorities,
    emotionVectors,
    readerShareReasons: verticalProfile.readerShareReasons,
    materialJobs: verticalProfile.materialJobs,
    negativePatterns: verticalProfile.negativePatterns,
    readerSceneAnchors: verticalProfile.readerSceneAnchors,
    abstractToConcretePairs: verticalProfile.abstractToConcretePairs,
    openingMicroScenes: verticalProfile.openingMicroScenes,
    visualRhythmSlots: buildViralVisualRhythmSlots(buildVisualSlotCount(verticalProfile)),
  };
}

export function buildArticleViralGenomePromptLines(
  stage: ArticleViralGenomeStage,
  input: ArticleViralGenomeInput = {},
) {
  const pack = buildArticleViralGenomePack(input);
  const sharedLines = [
    `百篇样本基因：${pack.sampleSummary}`,
    `样本垂类画像：${pack.sampleSourceProfile.vertical}；样本数=${pack.sampleSourceProfile.categorySampleCount}；账号数=${pack.sampleSourceProfile.accountCount}；机制=${pack.sampleSourceProfile.matchedMechanisms.join("、")}`,
    `高频机制偏向：${pack.mechanismBias.label}；${pack.mechanismBias.reason}`,
    `作者姿态：${pack.authorPostureMode}；${pack.authorPosture}`,
    `第一屏兑付：${pack.firstScreenPromise}`,
    `转发触发：${pack.shareTrigger}`,
    `商业七问：${pack.businessQuestions.join("；")}`,
    `素材任务：${pack.materialJobs.join("、")}`,
    `读者转发理由：${pack.readerShareReasons.join("；")}`,
    `贴近现场词：${pack.readerSceneAnchors.join("、")}`,
    `上游方向：${pack.upstreamDirections.join("；")}`,
    `反说教契约：${pack.antiDidacticContracts.join("；")}`,
    pack.sparseTrackAlert ? `稀疏题材提示：${pack.sparseTrackAlert}` : "",
  ].filter(Boolean);

  if (stage === "openingOptimization") {
    return [
      ...sharedLines,
      `开头方向：${pack.openingDirections.join("；")}`,
      `开头发动机：${pack.openingEngine}`,
    ];
  }

  if (stage === "titleOptimization") {
    return [
      ...sharedLines,
      `标题方向：${pack.titleDirections.join("；")}`,
      "标题推荐项必须优先体现：具体对象 + 正在发生的变化 + 读者可感知的后果/机会。",
    ];
  }

  if (stage === "deepWriting") {
    return [
      ...sharedLines,
      `叙事机制：${pack.narrativeMechanics.join("；")}`,
      `商业骨架：${pack.narrativeSkeleton}`,
      `证据优先级：${pack.evidencePriorities.join("；")}`,
      `情绪向量：${pack.emotionVectors.join("；")}`,
      `开头微场景：${pack.openingMicroScenes.join("；")}`,
      `抽象翻译：${pack.abstractToConcretePairs.map((item) => `${item.abstract}=>${item.concrete}`).join("；")}`,
      `负面模式：${pack.negativePatterns.join("；")}`,
      `配图节奏：${pack.visualRhythmSlots.map((slot) => `${slot.label}=${slot.purpose}`).join("；")}`,
    ];
  }

  if (stage === "outlinePlanning") {
    return [
      ...sharedLines,
      `结构方向：${pack.narrativeMechanics.join("；")}`,
      `商业骨架：${pack.narrativeSkeleton}`,
    ];
  }

  if (stage === "researchBrief") {
    return [
      ...sharedLines,
      "研究阶段先把商业七问答出来，再补数字锚点、实体事件、问题句、反转材料、风险边界和可视化素材来源。",
    ];
  }

  if (stage === "factCheck") {
    return [
      ...sharedLines,
      "核查阶段只做护栏：事实、来源、虚构边界、钱流表述和说教腔风险；不得把文章改回教程口吻。",
    ];
  }

  return sharedLines;
}

export function scoreVisualRhythmPosition(input: {
  nodeIndex: number;
  totalNodes: number;
  slots: ViralVisualRhythmSlot[];
}) {
  if (!input.slots.length) return 0;
  const denominator = Math.max(1, input.totalNodes - 1);
  const ratio = input.nodeIndex / denominator;
  return Math.max(
    ...input.slots.map((slot) => {
      if (slot.preferredPosition === "early") {
        return ratio <= 0.35 ? 3 : ratio <= 0.55 ? 1 : 0;
      }
      if (slot.preferredPosition === "middle") {
        return ratio >= 0.25 && ratio <= 0.75 ? 3 : 1;
      }
      return ratio >= 0.6 ? 3 : ratio >= 0.4 ? 1 : 0;
    }),
  );
}
