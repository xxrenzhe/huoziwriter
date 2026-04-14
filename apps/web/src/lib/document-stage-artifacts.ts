import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { getDatabase } from "./db";
import { getDocumentAuthoringStyleContext } from "./document-authoring-style-context";
import { getSavedDocumentHistoryReferences } from "./document-history-references";
import { getDocumentWritingContext } from "./document-writing-context";
import type { DocumentWorkflowStageCode } from "./document-workflows";
import { collectLanguageGuardHits, getLanguageGuardRules, getLanguageGuardTokenBlacklist, type LanguageGuardRule } from "./language-guard";
import { canUseHistoryReferences, getUserPlanContext } from "./plan-access";
import { loadPrompt } from "./prompt-loader";
import { getDocumentById } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type DocumentArtifactStageCode = Extract<
  DocumentWorkflowStageCode,
  "audienceAnalysis" | "outlinePlanning" | "deepWriting" | "factCheck" | "prosePolish"
>;

export type DocumentStageArtifactStatus = "ready" | "failed";

export type DocumentStageArtifact = {
  stageCode: DocumentArtifactStageCode;
  title: string;
  status: DocumentStageArtifactStatus;
  summary: string | null;
  payload: Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type ArtifactRow = {
  id: number;
  document_id: number;
  stage_code: DocumentArtifactStageCode;
  status: DocumentStageArtifactStatus;
  summary: string | null;
  payload_json: string | Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationContext = {
  userId: number;
  document: {
    id: number;
    title: string;
    markdownContent: string;
  };
  persona: {
    name: string;
    summary?: string | null;
    identityTags: string[];
    writingStyleTags: string[];
    domainKeywords?: string[];
    argumentPreferences?: string[];
    toneConstraints?: string[];
    audienceHints?: string[];
    sourceMode?: string;
    boundWritingStyleProfileName?: string | null;
  } | null;
  writingStyleProfile: {
    name: string;
    summary: string;
    toneKeywords: string[];
    structurePatterns: string[];
    languageHabits: string[];
    openingPatterns: string[];
    endingPatterns: string[];
    doNotWrite: string[];
    imitationPrompt: string;
  } | null;
  fragments: string[];
  evidenceFragments: Array<{
    id: number;
    title: string | null;
    distilledContent: string;
    sourceType: string;
    sourceUrl: string | null;
    screenshotPath: string | null;
    usageMode: string;
  }>;
  imageFragments: Array<{
    id: number;
    title: string | null;
    screenshotPath: string;
  }>;
  outlineNodes: Array<{ title: string; description: string | null }>;
  knowledgeCards: Array<{
    title: string;
    summary: string | null;
    keyFacts: string[];
    openQuestions: string[];
    status: string;
    confidenceScore: number;
    matchedFragmentCount: number;
  }>;
  bannedWords: string[];
  languageGuardRules: LanguageGuardRule[];
  audienceSelection: {
    selectedReaderLabel: string | null;
    selectedLanguageGuidance: string | null;
    selectedBackgroundAwareness: string | null;
    selectedReadabilityLevel: string | null;
    selectedCallToAction: string | null;
  } | null;
  outlineSelection: {
    selectedTitle: string | null;
    selectedTitleStyle: string | null;
    selectedOpeningHook: string | null;
    selectedTargetEmotion: string | null;
    selectedEndingStrategy: string | null;
  } | null;
  outlinePlan: Record<string, unknown> | null;
  supplementalViewpoints: string[];
  historyReferences: Array<{
    referencedDocumentId: number;
    title: string;
    relationReason: string | null;
    bridgeSentence: string | null;
  }>;
};

const STAGE_TITLES: Record<DocumentArtifactStageCode, string> = {
  audienceAnalysis: "受众分析",
  outlinePlanning: "大纲规划",
  deepWriting: "深度写作",
  factCheck: "事实核查",
  prosePolish: "文笔润色",
};

const SUPPORTED_STAGE_CODES = Object.keys(STAGE_TITLES) as DocumentArtifactStageCode[];

function parsePayload(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function uniqueStrings(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text: string, limit = 160) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function listPersonaSummary(context: GenerationContext) {
  if (!context.persona) {
    return "未配置作者人设，按通用中文专栏读者分析。";
  }
  const identity = context.persona.identityTags.join(" / ");
  const writingStyle = context.persona.writingStyleTags.join(" / ");
  return `${context.persona.name}（身份：${identity || "未设置"}；风格：${writingStyle || "未设置"}${context.persona.summary ? `；摘要：${context.persona.summary}` : ""}${context.persona.boundWritingStyleProfileName ? `；绑定文风资产：${context.persona.boundWritingStyleProfileName}` : ""}${context.persona.sourceMode === "analyzed" ? "；资料建模人设" : ""}）`;
}

function listWritingStyleProfileSummary(context: GenerationContext) {
  if (!context.writingStyleProfile) {
    return "未绑定文风资产，仅按作者人设和正文上下文生成。";
  }

  const profile = context.writingStyleProfile;
  return [
    `名称：${profile.name}`,
    profile.summary ? `摘要：${profile.summary}` : null,
    profile.toneKeywords.length ? `语气关键词：${profile.toneKeywords.join("、")}` : null,
    profile.structurePatterns.length ? `结构习惯：${profile.structurePatterns.join("；")}` : null,
    profile.languageHabits.length ? `语言习惯：${profile.languageHabits.join("；")}` : null,
    profile.openingPatterns.length ? `开头习惯：${profile.openingPatterns.join("；")}` : null,
    profile.endingPatterns.length ? `结尾习惯：${profile.endingPatterns.join("；")}` : null,
    profile.doNotWrite.length ? `明确规避：${profile.doNotWrite.join("；")}` : null,
    profile.imitationPrompt ? `模仿提示：${profile.imitationPrompt}` : null,
  ].filter(Boolean).join("\n");
}

function getSourceFacts(context: GenerationContext, limit = 6) {
  return Array.from(
    new Set([
      ...context.knowledgeCards.flatMap((card) => card.keyFacts),
      ...context.fragments,
    ].map((item) => truncateText(String(item || "").trim(), 120)).filter(Boolean)),
  ).slice(0, limit);
}

function getMaterialBundle(context: GenerationContext, limit = 8) {
  return [
    ...context.evidenceFragments.slice(0, limit).map((fragment) => ({
      fragmentId: fragment.id,
      title: String(fragment.title || "").trim() || `Fragment #${fragment.id}`,
      usageMode: fragment.usageMode,
      sourceType: fragment.sourceType,
      summary: truncateText(fragment.distilledContent, 120),
      screenshotPath: fragment.screenshotPath,
    })),
  ];
}

function getDocumentClaims(context: GenerationContext, limit = 6) {
  const plain = stripMarkdown(context.document.markdownContent);
  const sentenceClaims = plain
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
    .filter((item) => /\d|%|倍|年|月|日|增长|下降|发布|宣布|融资|亏损|收入|用户|成本/.test(item))
    .slice(0, limit);
  return Array.from(new Set([...sentenceClaims, ...getSourceFacts(context, limit)])).slice(0, limit);
}

function deriveClaimTokens(text: string) {
  const normalized = String(text || "").trim();
  const tokens = Array.from(new Set([
    ...normalized.match(/[\d.]+%?/g) ?? [],
    ...normalized.match(/[A-Za-z]{2,}/g) ?? [],
    ...normalized.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [],
  ])).filter(Boolean);
  return tokens.slice(0, 12);
}

function scoreEvidenceMatch(claim: string, evidence: { title: string | null; distilledContent: string }) {
  const claimText = claim.trim();
  const evidenceText = [evidence.title, evidence.distilledContent].filter(Boolean).join(" ");
  if (!claimText || !evidenceText) {
    return 0;
  }
  if (evidenceText.includes(claimText) || claimText.includes(evidenceText.slice(0, 16))) {
    return 100;
  }
  const tokens = deriveClaimTokens(claimText);
  let score = 0;
  for (const token of tokens) {
    if (token.length >= 2 && evidenceText.includes(token)) {
      score += /\d/.test(token) ? 5 : 2;
    }
  }
  return score;
}

function buildFactCheckEvidenceCards(
  context: GenerationContext,
  checks: Array<{ claim: string; status: string; suggestion: string }>,
) {
  return checks.slice(0, 8).map((check) => {
    const matchedEvidence = context.evidenceFragments
      .map((fragment) => ({
        fragment,
        score: scoreEvidenceMatch(check.claim, fragment),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((item) => ({
        fragmentId: item.fragment.id,
        title: String(item.fragment.title || "").trim() || `Fragment #${item.fragment.id}`,
        excerpt: truncateText(item.fragment.distilledContent, 120),
        sourceType: item.fragment.sourceType,
        sourceUrl: item.fragment.sourceUrl,
        rationale:
          item.fragment.sourceType === "url" && item.fragment.sourceUrl
            ? "可回到原链接核对一手表述。"
            : item.fragment.sourceType === "screenshot"
              ? "可回到截图或原始记录核对数字与时间。"
              : "可作为现有素材锚点，但最好补充外部来源。",
      }));

    const supportLevel = matchedEvidence.length >= 2 ? "strong" : matchedEvidence.length === 1 ? "partial" : "missing";
    return {
      claim: check.claim,
      supportLevel,
      evidenceItems: matchedEvidence,
    };
  });
}

function fallbackAudienceAnalysis(context: GenerationContext) {
  const identity = context.persona?.identityTags[0] || "内容创作者";
  const style = context.persona?.writingStyleTags[0] || "经验分享文";
  const sourceFacts = getSourceFacts(context, 3);
  return {
    summary: `这篇稿子更适合面向希望快速形成判断的 ${identity} 型读者，表达应保持结论前置与事实支撑并行。`,
    coreReaderLabel: `${identity} / ${style}受众`,
    readerSegments: [
      {
        label: "核心关注者",
        painPoint: `已经关注“${context.document.title}”相关话题，但缺少一篇能快速形成判断的整合稿。`,
        motivation: "想迅速知道该关注什么、忽略什么、下一步如何行动。",
        preferredTone: "结论前置、少铺垫、避免空话。",
      },
      {
        label: "行动决策者",
        painPoint: "需要把零散信息转成可执行建议或内部沟通材料。",
        motivation: "想拿到可复述的论点、证据和风险提醒。",
        preferredTone: "结构清晰、语气克制、重点高亮。",
      },
      {
        label: "外围读者",
        painPoint: "对行业背景不熟，容易被术语和前情信息劝退。",
        motivation: "想先理解这件事为什么值得看。",
        preferredTone: "提供必要背景解释，减少黑话。",
      },
    ],
    languageGuidance: [
      "开头 3 句内先说清这件事为什么重要。",
      "每一段只推进一个判断，并配一个事实锚点。",
      context.persona?.writingStyleTags.includes("科普文") ? "适度使用类比，降低理解门槛。" : "优先使用行业内熟悉的术语，但别连续堆砌。",
    ],
    backgroundAwarenessOptions: [
      "默认读者知道行业背景，只补最关键的前情。",
      "适度补背景，让跨行业但持续关注此议题的读者能跟上。",
      "按行业外行也能读懂的标准补充概念、前情与角色关系。",
    ],
    readabilityOptions: [
      "保持专业密度，适合行业内读者快速扫描。",
      "专业与通俗平衡，减少黑话堆叠。",
      "尽量口语化，多用短句、类比和直白判断。",
    ],
    contentWarnings: [
      "不要默认读者已经掌握全部背景。",
      "避免只有态度，没有时间、数据或案例支撑。",
      sourceFacts.length ? `优先引用这些已知素材：${sourceFacts.join("；")}` : "优先回到用户已采集的碎片与主题档案。",
    ],
    recommendedCallToAction: "结尾给出一个明确动作：继续观察什么、验证什么、如何利用这篇稿子做下一步表达。",
  } satisfies Record<string, unknown>;
}

function fallbackOutlinePlanning(context: GenerationContext) {
  const seedFacts = getSourceFacts(context, 4);
  const materialBundle = getMaterialBundle(context, 8);
  const baseTitle = truncateText(String(context.document.title || "").trim(), 28) || "这件事";
  const viewpointIntegration = context.supplementalViewpoints.map((viewpoint) => ({
    viewpoint,
    action: "adopted",
    note: "作为补充观点参与结构规划，但不替代主论点。",
  }));
  const sections = context.outlineNodes.length > 0
    ? context.outlineNodes.slice(0, 6).map((node, index) => ({
        heading: node.title,
        goal: node.description || `推进第 ${index + 1} 个论证层次`,
        keyPoints: [
          truncateText(seedFacts[index] || `围绕“${node.title}”先给出判断，再放事实。`, 80),
        ],
        evidenceHints: seedFacts.slice(index, index + 2),
        materialRefs: materialBundle.slice(index, index + 2).map((item) => item.fragmentId),
        transition: index === 0 ? "从现象切入" : "承接上一段判断，继续加深因果关系",
      }))
    : [
        {
          heading: "先说这件事为什么值得写",
          goal: "交代现象与冲突，快速建立读者兴趣。",
          keyPoints: ["一句话点题", "一句话说清变化", "一句话说明影响对象"],
          evidenceHints: seedFacts.slice(0, 2),
          materialRefs: materialBundle.slice(0, 2).map((item) => item.fragmentId),
          transition: "从表面现象转入真正矛盾",
        },
        {
          heading: "拆原因，不要只复述结果",
          goal: "把推动变化的关键变量说清楚。",
          keyPoints: ["主体是谁", "变量是什么", "为什么现在发生"],
          evidenceHints: seedFacts.slice(1, 3),
          materialRefs: materialBundle.slice(1, 3).map((item) => item.fragmentId),
          transition: "从原因转向影响",
        },
        {
          heading: "写影响与分化",
          goal: "说明谁受益、谁承压、哪些判断最容易误读。",
          keyPoints: ["直接影响", "次级影响", "潜在误判"],
          evidenceHints: seedFacts.slice(2, 4),
          materialRefs: materialBundle.slice(2, 4).map((item) => item.fragmentId),
          transition: "从影响转向作者观点",
        },
        {
          heading: "落回读者：怎么理解、怎么行动",
          goal: "给出结论、提醒与行动建议。",
          keyPoints: ["核心结论", "保留意见", "下一步建议"],
          evidenceHints: seedFacts.slice(0, 2),
          materialRefs: materialBundle.slice(0, 2).map((item) => item.fragmentId),
          transition: "以行动建议收束全文",
        },
      ];

  return {
    summary: "建议采用“现象—原因—影响—行动”的递进结构，保证读者先看懂，再形成判断，最后拿到行动建议。",
    workingTitle: context.document.title,
    titleOptions: [
      {
        title: `${baseTitle}：别只盯表面变化，真正该看的只有这一层`,
        styleLabel: "观点判断型",
        angle: "先给判断，再补证据",
        reason: "直接亮出主判断，适合快速建立立场和信息密度。",
        riskHint: "信息密度偏高，正文第一段必须尽快补事实锚点。",
      },
      {
        title: `为什么说${baseTitle}，最容易被误读的不是结果`,
        styleLabel: "场景问题型",
        angle: "用误读和疑问把读者拉进来",
        reason: "先激活问题意识，再承接后续拆解过程。",
        riskHint: "冲突感够强，但如果后文拆解不具体，容易显得问题大于答案。",
      },
      {
        title: `${baseTitle}之后，谁会先受益，谁会先承压`,
        styleLabel: "结果反差型",
        angle: "把结果分化直接摆出来",
        reason: "突出影响分化，更适合承接影响与行动建议。",
        riskHint: "要确保正文真的展开“谁受益、谁承压”，否则会有轻微标题先行风险。",
      },
    ],
    titleStrategyNotes: [
      "3 个标题分别抓住主判断、误读冲突和结果分化，但都围绕同一主题主轴。",
      "标题只放大正文里会真正展开的矛盾和收益点，不拿正文无法兑现的结果做诱饵。",
    ],
    centralThesis: `围绕“${context.document.title}”，用一条主判断串起事实，不做散点式罗列。`,
    openingHook: "开头先抛出现象或冲突，再给出一句判断，避免平铺背景。",
    openingHookOptions: [
      "开头先抛出现象或冲突，再给出一句判断，避免平铺背景。",
      "开头直接抛出反常识判断，再用一个事实把读者拉住。",
      "先写读者最关心的现实处境，再倒回解释这件事为何成立。",
    ],
    targetEmotion: "先建立紧迫感，再转入清晰感，最后以确定性的建议收束。",
    targetEmotionOptions: [
      "先建立紧迫感，再转入清晰感，最后以确定性的建议收束。",
      "先制造疑问感，再逐步拆解，最后落到冷静判断。",
      "先写冲突和压力，再把情绪导向可执行的行动感。",
    ],
    supplementalViewpoints: context.supplementalViewpoints,
    viewpointIntegration,
    materialBundle,
    outlineSections: sections,
    materialGapHints: materialBundle.length > 0 ? [] : ["当前还没有挂载到大纲阶段的核心素材，至少补 2 条事实碎片再继续。"],
    endingStrategy: "结尾用一句硬判断 + 一句行动提示收束，避免口号式升华。",
    endingStrategyOptions: [
      "结尾用一句硬判断 + 一句行动提示收束，避免口号式升华。",
      "结尾回到读者处境，给一个保留意见和一个观察点。",
      "结尾不喊口号，只保留清晰结论和下一步判断标准。",
    ],
  } satisfies Record<string, unknown>;
}

function fallbackDeepWriting(context: GenerationContext) {
  const outlinePlan = context.outlinePlan || {};
  const selectedTitle =
    context.outlineSelection?.selectedTitle ||
    String(outlinePlan.workingTitle || "").trim() ||
    context.document.title;
  const centralThesis =
    String(outlinePlan.centralThesis || "").trim() ||
    `围绕“${selectedTitle}”把素材重新组织成一条清晰判断，不做散点式复述。`;
  const openingStrategy =
    context.outlineSelection?.selectedOpeningHook ||
    String(outlinePlan.openingHook || "").trim() ||
    "第一段先抛现象或冲突，再给一句硬判断，不要先铺背景。";
  const targetEmotion =
    context.outlineSelection?.selectedTargetEmotion ||
    String(outlinePlan.targetEmotion || "").trim() ||
    "先建立值得继续读下去的紧迫感，再把读者带到清晰判断。";
  const endingStrategy =
    context.outlineSelection?.selectedEndingStrategy ||
    String(outlinePlan.endingStrategy || "").trim() ||
    context.audienceSelection?.selectedCallToAction ||
    "结尾回到读者动作，给一个判断标准或下一步观察点。";
  const sectionSource = getRecordArray(outlinePlan.outlineSections);
  const sectionBlueprint = (sectionSource.length
    ? sectionSource
    : context.outlineNodes.slice(0, 6).map((node, index) => ({
        heading: node.title,
        goal: node.description || `推进第 ${index + 1} 层论证`,
        keyPoints: [`围绕“${node.title}”先下判断，再补事实。`],
        evidenceHints: getSourceFacts(context, 4).slice(index, index + 2),
        materialRefs: [],
        transition: index === 0 ? "从现象切入" : "承接上一段继续推进判断",
      })))
    .slice(0, 6)
    .map((section, index) => ({
      heading: String(section.heading || "").trim() || `章节 ${index + 1}`,
      goal: String(section.goal || "").trim() || `推进第 ${index + 1} 段论证`,
      paragraphMission:
        getStringArray((section as Record<string, unknown>).keyPoints, 3).join("；") ||
        `围绕“${String(section.heading || "").trim() || `章节 ${index + 1}` }”写出一段结论先行的正文。`,
      evidenceHints: getStringArray((section as Record<string, unknown>).evidenceHints, 3),
      materialRefs: Array.isArray((section as Record<string, unknown>).materialRefs)
        ? ((section as Record<string, unknown>).materialRefs as unknown[])
            .map((ref) => Number(ref || 0))
            .filter((ref) => Number.isInteger(ref) && ref > 0)
            .slice(0, 4)
        : [],
      transition: String((section as Record<string, unknown>).transition || "").trim(),
    }));

  return {
    summary: `正文建议按“${selectedTitle}”直接进入完整写作，先沿用已确认大纲和素材，不要离题扩写。`,
    selectedTitle,
    centralThesis,
    writingAngle: context.audienceSelection?.selectedReaderLabel
      ? `写给 ${context.audienceSelection.selectedReaderLabel}，先给判断，再补证据与行动意义。`
      : "写给希望快速形成判断的读者，先给结论，再拆证据和影响。",
    openingStrategy,
    targetEmotion,
    endingStrategy,
    voiceChecklist: Array.from(
      new Set([
        context.audienceSelection?.selectedLanguageGuidance,
        context.audienceSelection?.selectedBackgroundAwareness,
        context.audienceSelection?.selectedReadabilityLevel,
        "短句优先，避免解释腔和机器腔。",
        "每一段只推进一个判断，并挂一个事实锚点。",
        context.persona?.summary ? `贴近人设表达：${context.persona.summary}` : null,
      ].map((item) => String(item || "").trim()).filter(Boolean)),
    ).slice(0, 6),
    mustUseFacts: getSourceFacts(context, 6),
    bannedWordWatchlist: context.bannedWords.slice(0, 8),
    sectionBlueprint,
    historyReferencePlan: context.historyReferences.slice(0, 2).map((item) => ({
      title: item.title,
      useWhen: item.relationReason || "当需要补前情、延伸判断或形成自然承接时再引用。",
      bridgeSentence: item.bridgeSentence || "",
    })),
    finalChecklist: [
      "标题、开头、结尾与已确认大纲保持一致，不要临时换题。",
      "先写判断，再写事实，不要把背景介绍铺满前两段。",
      "截图素材只能作为原图插入，不要改写成伪引用。",
      "历史文章只能自然带出，不要生成“相关文章”区块。",
      "有数字、时间、案例的句子优先保留来源锚点或谨慎语气。",
    ],
  } satisfies Record<string, unknown>;
}

function fallbackFactCheck(context: GenerationContext) {
  const claims = getDocumentClaims(context, 6);
  const factSet = new Set(getSourceFacts(context, 10));
  const checks = claims.map((claim) => {
    const verified = Array.from(factSet).some((fact) => fact.includes(claim.slice(0, 12)) || claim.includes(fact.slice(0, 12)));
    return {
      claim,
      status: verified ? "verified" : /\d|%|倍|年|月|日/.test(claim) ? "needs_source" : "opinion",
      suggestion: verified
        ? "可直接引用，但最好补上来源名称或时间。"
        : /\d|%|倍|年|月|日/.test(claim)
          ? "补一手来源、时间点或原始截图链接。"
          : "标注为判断或经验总结，避免写成绝对事实。",
    };
  });
  const riskCount = checks.filter((item) => item.status !== "verified").length;
  return {
    summary: riskCount > 0 ? `当前稿子里至少有 ${riskCount} 条表述需要补来源或改成判断语气。` : "当前主要事实表述基本可站住脚，进入终稿前仍建议补齐来源锚点。",
    overallRisk: riskCount >= 4 ? "high" : riskCount >= 2 ? "medium" : "low",
    checks,
    evidenceCards: buildFactCheckEvidenceCards(context, checks),
    missingEvidence: checks.filter((item) => item.status === "needs_source").map((item) => item.claim),
    personaAlignment: context.persona ? `当前文风与“${context.persona.name}”基本匹配，但要避免为了人设而牺牲证据密度。` : "当前没有明确人设约束，建议统一为克制、可信的专栏口吻。",
    topicAlignment: `正文整体围绕“${context.document.title}”，建议删掉与主判断弱相关的旁支信息。`,
  } satisfies Record<string, unknown>;
}

function fallbackProsePolish(context: GenerationContext) {
  const plain = stripMarkdown(context.document.markdownContent);
  const paragraphs = context.document.markdownContent.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const longParagraph = paragraphs.find((item) => stripMarkdown(item).length > 180);
  const firstSentence = plain.split(/[。！？!?]/).map((item) => item.trim()).find(Boolean) || context.document.title;
  const bannedHits = context.bannedWords.filter((word) => plain.includes(word)).slice(0, 4);
  const languageGuardHits = collectLanguageGuardHits(plain, context.languageGuardRules).slice(0, 6);
  return {
    summary: "这版稿子适合继续做语言降噪与节奏修整，重点是缩短重句、增强首段抓力，并把判断句打得更硬。",
    overallDiagnosis: longParagraph ? "段落偏长，节奏略闷，需要切分。" : "整体节奏可用，但还可以再提升开头与收尾的记忆点。",
    strengths: [
      plain.length >= 240 ? "正文已经具备一定信息密度。" : "正文简洁，方便继续扩写。",
      context.knowledgeCards.length > 0 ? "已经有主题档案可作为事实支撑。" : "主题集中，易于继续打磨单一观点。",
      context.persona ? `人设方向较明确：${context.persona.name}。` : "文稿口吻还留有较大可塑空间。",
    ],
    issues: [
      longParagraph
        ? {
            type: "段落过长",
            example: truncateText(stripMarkdown(longParagraph), 60),
            suggestion: "把一个段落拆成“判断句 + 事实句 + 结论句”三拍节奏。",
          }
        : null,
      bannedHits.length
        ? {
            type: "机器腔词汇",
            example: bannedHits.join("、"),
            suggestion: "用更具体的动作、结果和对象替换抽象黑话。",
          }
        : null,
      {
        type: "开头抓力不足",
        example: truncateText(firstSentence, 60),
        suggestion: "开头先抛现象或反常识判断，再补背景。",
      },
    ].filter(Boolean),
    languageGuardHits,
    rewrittenLead: `${truncateText(firstSentence, 28)}。先把结论扔出来，再补证据，不要让背景介绍抢走前两段的位置。`,
    punchlines: [
      `这篇稿子最该强化的，不是态度，而是“${context.document.title}”背后的证据密度。`,
      "先让读者看见变化，再让他接受判断。",
    ],
    rhythmAdvice: [
      "连续两段解释之后，插入一句短结论换气。",
      "每个二级标题下优先保留 2-3 个事实锚点，不要把判断埋进长段落。",
    ],
  } satisfies Record<string, unknown>;
}

function normalizeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeAudiencePayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackSegments = Array.isArray(fallback.readerSegments) ? fallback.readerSegments : [];
  const segments = Array.isArray(payload?.readerSegments)
    ? payload.readerSegments
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          label: String(item?.label || "").trim(),
          painPoint: String(item?.painPoint || "").trim(),
          motivation: String(item?.motivation || "").trim(),
          preferredTone: String(item?.preferredTone || "").trim(),
        }))
        .filter((item) => item.label && item.painPoint)
        .slice(0, 4)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    coreReaderLabel: String(payload?.coreReaderLabel || fallback.coreReaderLabel || "").trim(),
    readerSegments: segments.length ? segments : fallbackSegments,
    languageGuidance: uniqueStrings(payload?.languageGuidance, 5).length ? uniqueStrings(payload?.languageGuidance, 5) : uniqueStrings(fallback.languageGuidance, 5),
    backgroundAwarenessOptions:
      uniqueStrings(payload?.backgroundAwarenessOptions, 4).length
        ? uniqueStrings(payload?.backgroundAwarenessOptions, 4)
        : uniqueStrings(fallback.backgroundAwarenessOptions, 4),
    readabilityOptions:
      uniqueStrings(payload?.readabilityOptions, 4).length
        ? uniqueStrings(payload?.readabilityOptions, 4)
        : uniqueStrings(fallback.readabilityOptions, 4),
    contentWarnings: uniqueStrings(payload?.contentWarnings, 5).length ? uniqueStrings(payload?.contentWarnings, 5) : uniqueStrings(fallback.contentWarnings, 5),
    recommendedCallToAction: String(payload?.recommendedCallToAction || fallback.recommendedCallToAction || "").trim(),
  } satisfies Record<string, unknown>;
}

function normalizeOutlinePayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackSections = Array.isArray(fallback.outlineSections) ? fallback.outlineSections : [];
  const fallbackTitleOptions = getRecordArray(fallback.titleOptions)
    .map((item) => ({
      title: String(item.title || "").trim(),
      styleLabel: String(item.styleLabel || "").trim(),
      angle: String(item.angle || "").trim(),
      reason: String(item.reason || "").trim(),
      riskHint: String(item.riskHint || "").trim(),
    }))
    .filter((item) => item.title)
    .slice(0, 3);
  const sections = Array.isArray(payload?.outlineSections)
    ? payload.outlineSections
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          heading: String(item?.heading || "").trim(),
          goal: String(item?.goal || "").trim(),
          keyPoints: uniqueStrings(item?.keyPoints, 4),
          evidenceHints: uniqueStrings(item?.evidenceHints, 4),
          materialRefs: Array.isArray(item?.materialRefs)
            ? item.materialRefs.map((ref) => Number(ref || 0)).filter((ref) => Number.isInteger(ref) && ref > 0).slice(0, 4)
            : [],
          transition: String(item?.transition || "").trim(),
        }))
        .filter((item) => item.heading)
        .slice(0, 8)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    workingTitle: String(payload?.workingTitle || fallback.workingTitle || "").trim(),
    titleOptions: getRecordArray(payload?.titleOptions).length
      ? getRecordArray(payload?.titleOptions)
          .map((item) => ({
            title: String(item.title || "").trim(),
            styleLabel: String(item.styleLabel || "").trim(),
            angle: String(item.angle || "").trim(),
            reason: String(item.reason || "").trim(),
            riskHint: String(item.riskHint || "").trim(),
          }))
          .filter((item) => item.title)
          .slice(0, 3)
      : fallbackTitleOptions,
    titleStrategyNotes:
      uniqueStrings(payload?.titleStrategyNotes, 4).length
        ? uniqueStrings(payload?.titleStrategyNotes, 4)
        : uniqueStrings(fallback.titleStrategyNotes, 4),
    centralThesis: String(payload?.centralThesis || fallback.centralThesis || "").trim(),
    openingHook: String(payload?.openingHook || fallback.openingHook || "").trim(),
    openingHookOptions:
      uniqueStrings(payload?.openingHookOptions, 4).length
        ? uniqueStrings(payload?.openingHookOptions, 4)
        : uniqueStrings(fallback.openingHookOptions, 4),
    targetEmotion: String(payload?.targetEmotion || fallback.targetEmotion || "").trim(),
    targetEmotionOptions:
      uniqueStrings(payload?.targetEmotionOptions, 4).length
        ? uniqueStrings(payload?.targetEmotionOptions, 4)
        : uniqueStrings(fallback.targetEmotionOptions, 4),
    supplementalViewpoints:
      uniqueStrings(payload?.supplementalViewpoints, 3).length
        ? uniqueStrings(payload?.supplementalViewpoints, 3)
        : uniqueStrings(fallback.supplementalViewpoints, 3),
    viewpointIntegration: getRecordArray(payload?.viewpointIntegration).length
      ? getRecordArray(payload?.viewpointIntegration).map((item) => ({
          viewpoint: String(item.viewpoint || "").trim(),
          action: String(item.action || "").trim() || "adopted",
          note: String(item.note || "").trim(),
        })).filter((item) => item.viewpoint)
      : getRecordArray(fallback.viewpointIntegration),
    materialBundle: getRecordArray(payload?.materialBundle).length
      ? getRecordArray(payload?.materialBundle)
      : getRecordArray(fallback.materialBundle),
    outlineSections: sections.length ? sections : fallbackSections,
    materialGapHints:
      uniqueStrings(payload?.materialGapHints, 5).length
        ? uniqueStrings(payload?.materialGapHints, 5)
        : uniqueStrings(fallback.materialGapHints, 5),
    endingStrategy: String(payload?.endingStrategy || fallback.endingStrategy || "").trim(),
    endingStrategyOptions:
      uniqueStrings(payload?.endingStrategyOptions, 4).length
        ? uniqueStrings(payload?.endingStrategyOptions, 4)
        : uniqueStrings(fallback.endingStrategyOptions, 4),
  } satisfies Record<string, unknown>;
}

function normalizeDeepWritingPayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackSectionBlueprint = getRecordArray(fallback.sectionBlueprint);
  const sectionBlueprint = Array.isArray(payload?.sectionBlueprint)
    ? payload.sectionBlueprint
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          heading: String(item?.heading || "").trim(),
          goal: String(item?.goal || "").trim(),
          paragraphMission: String(item?.paragraphMission || "").trim(),
          evidenceHints: uniqueStrings(item?.evidenceHints, 4),
          materialRefs: Array.isArray(item?.materialRefs)
            ? item.materialRefs.map((ref) => Number(ref || 0)).filter((ref) => Number.isInteger(ref) && ref > 0).slice(0, 4)
            : [],
          transition: String(item?.transition || "").trim(),
        }))
        .filter((item) => item.heading)
        .slice(0, 6)
    : [];
  const fallbackHistoryReferencePlan = getRecordArray(fallback.historyReferencePlan);
  const historyReferencePlan = Array.isArray(payload?.historyReferencePlan)
    ? payload.historyReferencePlan
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          title: String(item?.title || "").trim(),
          useWhen: String(item?.useWhen || "").trim(),
          bridgeSentence: String(item?.bridgeSentence || "").trim(),
        }))
        .filter((item) => item.title)
        .slice(0, 2)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    selectedTitle: String(payload?.selectedTitle || fallback.selectedTitle || "").trim(),
    centralThesis: String(payload?.centralThesis || fallback.centralThesis || "").trim(),
    writingAngle: String(payload?.writingAngle || fallback.writingAngle || "").trim(),
    openingStrategy: String(payload?.openingStrategy || fallback.openingStrategy || "").trim(),
    targetEmotion: String(payload?.targetEmotion || fallback.targetEmotion || "").trim(),
    endingStrategy: String(payload?.endingStrategy || fallback.endingStrategy || "").trim(),
    voiceChecklist:
      uniqueStrings(payload?.voiceChecklist, 6).length
        ? uniqueStrings(payload?.voiceChecklist, 6)
        : uniqueStrings(fallback.voiceChecklist, 6),
    mustUseFacts:
      uniqueStrings(payload?.mustUseFacts, 6).length
        ? uniqueStrings(payload?.mustUseFacts, 6)
        : uniqueStrings(fallback.mustUseFacts, 6),
    bannedWordWatchlist:
      uniqueStrings(payload?.bannedWordWatchlist, 8).length
        ? uniqueStrings(payload?.bannedWordWatchlist, 8)
        : uniqueStrings(fallback.bannedWordWatchlist, 8),
    sectionBlueprint: sectionBlueprint.length ? sectionBlueprint : fallbackSectionBlueprint,
    historyReferencePlan: historyReferencePlan.length ? historyReferencePlan : fallbackHistoryReferencePlan,
    finalChecklist:
      uniqueStrings(payload?.finalChecklist, 6).length
        ? uniqueStrings(payload?.finalChecklist, 6)
        : uniqueStrings(fallback.finalChecklist, 6),
  } satisfies Record<string, unknown>;
}

function normalizeFactCheckPayload(value: unknown, fallback: Record<string, unknown>, context: GenerationContext) {
  const payload = normalizeRecord(value);
  const fallbackChecks = Array.isArray(fallback.checks) ? fallback.checks : [];
  const checks = Array.isArray(payload?.checks)
    ? payload.checks
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          claim: String(item?.claim || "").trim(),
          status: ["verified", "needs_source", "risky", "opinion"].includes(String(item?.status || "").trim())
            ? String(item?.status || "").trim()
            : "needs_source",
          suggestion: String(item?.suggestion || "").trim(),
        }))
        .filter((item) => item.claim)
        .slice(0, 8)
    : [];
  const normalizedChecks = checks.length ? checks : fallbackChecks;
  const fallbackEvidenceCards = Array.isArray(fallback.evidenceCards) ? fallback.evidenceCards : [];
  const evidenceCards = Array.isArray(payload?.evidenceCards)
    ? payload.evidenceCards
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          claim: String(item?.claim || "").trim(),
          supportLevel: ["strong", "partial", "missing"].includes(String(item?.supportLevel || "").trim())
            ? String(item?.supportLevel || "").trim()
            : "missing",
          evidenceItems: Array.isArray(item?.evidenceItems)
            ? item.evidenceItems
                .map((evidence) => normalizeRecord(evidence))
                .filter(Boolean)
                .map((evidence) => ({
                  fragmentId: Number(evidence?.fragmentId || 0) || null,
                  title: String(evidence?.title || "").trim(),
                  excerpt: String(evidence?.excerpt || "").trim(),
                  sourceType: String(evidence?.sourceType || "manual").trim(),
                  sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                  rationale: String(evidence?.rationale || "").trim(),
                }))
                .filter((evidence) => evidence.title && evidence.excerpt)
                .slice(0, 3)
            : [],
        }))
        .filter((item) => item.claim)
        .slice(0, 8)
    : [];
  const derivedEvidenceCards = buildFactCheckEvidenceCards(
    context,
    normalizedChecks as Array<{ claim: string; status: string; suggestion: string }>,
  );

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    overallRisk: ["low", "medium", "high"].includes(String(payload?.overallRisk || "").trim())
      ? String(payload?.overallRisk || "").trim()
      : String(fallback.overallRisk || "medium"),
    checks: normalizedChecks,
    evidenceCards: evidenceCards.length ? evidenceCards : fallbackEvidenceCards.length ? fallbackEvidenceCards : derivedEvidenceCards,
    missingEvidence: uniqueStrings(payload?.missingEvidence, 6).length ? uniqueStrings(payload?.missingEvidence, 6) : uniqueStrings(fallback.missingEvidence, 6),
    personaAlignment: String(payload?.personaAlignment || fallback.personaAlignment || "").trim(),
    topicAlignment: String(payload?.topicAlignment || fallback.topicAlignment || "").trim(),
  } satisfies Record<string, unknown>;
}

function normalizeProsePolishPayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackIssues = Array.isArray(fallback.issues) ? fallback.issues : [];
  const issues = Array.isArray(payload?.issues)
    ? payload.issues
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          type: String(item?.type || "").trim(),
          example: String(item?.example || "").trim(),
          suggestion: String(item?.suggestion || "").trim(),
        }))
        .filter((item) => item.type && item.suggestion)
        .slice(0, 6)
    : [];
  const languageGuardHits = Array.isArray(payload?.languageGuardHits)
    ? payload.languageGuardHits
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          ruleId: String(item?.ruleId || "").trim(),
          ruleKind: String(item?.ruleKind || "").trim(),
          matchMode: String(item?.matchMode || "").trim(),
          matchedText: String(item?.matchedText || "").trim(),
          patternText: String(item?.patternText || "").trim(),
          rewriteHint: String(item?.rewriteHint || "").trim(),
          severity: String(item?.severity || "").trim() || "medium",
          scope: String(item?.scope || "").trim() || "user",
        }))
        .filter((item) => item.matchedText && item.patternText)
        .slice(0, 8)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    overallDiagnosis: String(payload?.overallDiagnosis || fallback.overallDiagnosis || "").trim(),
    strengths: uniqueStrings(payload?.strengths, 5).length ? uniqueStrings(payload?.strengths, 5) : uniqueStrings(fallback.strengths, 5),
    issues: issues.length ? issues : fallbackIssues,
    languageGuardHits: languageGuardHits.length ? languageGuardHits : getRecordArray(fallback.languageGuardHits),
    rewrittenLead: String(payload?.rewrittenLead || fallback.rewrittenLead || "").trim(),
    punchlines: uniqueStrings(payload?.punchlines, 5).length ? uniqueStrings(payload?.punchlines, 5) : uniqueStrings(fallback.punchlines, 5),
    rhythmAdvice: uniqueStrings(payload?.rhythmAdvice, 5).length ? uniqueStrings(payload?.rhythmAdvice, 5) : uniqueStrings(fallback.rhythmAdvice, 5),
  } satisfies Record<string, unknown>;
}

function getStringArray(value: unknown, limit = 6) {
  return uniqueStrings(value, limit);
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getAudienceSelection(payload: Record<string, unknown> | null | undefined) {
  const selection = normalizeRecord(payload?.selection);
  if (!selection) {
    return null;
  }
  return {
    selectedReaderLabel: String(selection.selectedReaderLabel || "").trim() || null,
    selectedLanguageGuidance: String(selection.selectedLanguageGuidance || "").trim() || null,
    selectedBackgroundAwareness: String(selection.selectedBackgroundAwareness || "").trim() || null,
    selectedReadabilityLevel: String(selection.selectedReadabilityLevel || "").trim() || null,
    selectedCallToAction: String(selection.selectedCallToAction || "").trim() || null,
  };
}

function getOutlineSelection(payload: Record<string, unknown> | null | undefined) {
  const selection = normalizeRecord(payload?.selection);
  if (!selection) {
    return null;
  }
  return {
    selectedTitle: String(selection.selectedTitle || "").trim() || null,
    selectedTitleStyle: String(selection.selectedTitleStyle || "").trim() || null,
    selectedOpeningHook: String(selection.selectedOpeningHook || "").trim() || null,
    selectedTargetEmotion: String(selection.selectedTargetEmotion || "").trim() || null,
    selectedEndingStrategy: String(selection.selectedEndingStrategy || "").trim() || null,
  };
}

function toArtifact(row: ArtifactRow) {
  return {
    stageCode: row.stage_code,
    title: STAGE_TITLES[row.stage_code],
    status: row.status,
    summary: row.summary,
    payload: parsePayload(row.payload_json),
    model: row.model,
    provider: row.provider,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies DocumentStageArtifact;
}

async function ensureDocumentAccess(documentId: number, userId: number) {
  const document = await getDocumentById(documentId, userId);
  if (!document) {
    throw new Error("文稿不存在");
  }
  return document;
}

async function buildGenerationContext(documentId: number, userId: number): Promise<GenerationContext> {
  await ensureExtendedProductSchema();
  const document = await ensureDocumentAccess(documentId, userId);
  const [planContext, authoringStyleContext, writingContext, languageGuardRules, audienceArtifact, outlineArtifact, historyReferences] = await Promise.all([
    getUserPlanContext(userId),
    getDocumentAuthoringStyleContext(userId),
    getDocumentWritingContext({
      userId,
      documentId,
      title: document.title,
      markdownContent: document.markdown_content,
    }),
    getLanguageGuardRules(userId),
    getDocumentStageArtifact(documentId, userId, "audienceAnalysis"),
    getDocumentStageArtifact(documentId, userId, "outlinePlanning"),
    getSavedDocumentHistoryReferences(documentId),
  ]);
  const supplementalViewpoints = uniqueStrings(outlineArtifact?.payload?.supplementalViewpoints, 3);
  const canUseSavedHistoryReferences = canUseHistoryReferences(planContext.effectivePlanCode);

  return {
    userId,
    document: {
      id: document.id,
      title: document.title,
      markdownContent: document.markdown_content,
    },
    persona: authoringStyleContext.authorPersona,
    writingStyleProfile: authoringStyleContext.writingStyleProfile,
    fragments: writingContext.fragments,
    evidenceFragments: writingContext.evidenceFragments,
    imageFragments: writingContext.imageFragments
      .filter((item): item is typeof item & { screenshotPath: string } => Boolean(item.screenshotPath))
      .map((item) => ({
        id: item.id,
        title: item.title,
        screenshotPath: item.screenshotPath,
      })),
    outlineNodes: writingContext.outlineNodes,
    knowledgeCards: writingContext.knowledgeCards,
    bannedWords: getLanguageGuardTokenBlacklist(languageGuardRules),
    languageGuardRules,
    audienceSelection: getAudienceSelection(audienceArtifact?.payload),
    outlineSelection: getOutlineSelection(outlineArtifact?.payload),
    outlinePlan: outlineArtifact?.payload || null,
    supplementalViewpoints,
    historyReferences: canUseSavedHistoryReferences
      ? historyReferences.map((item) => ({
          referencedDocumentId: item.referenced_document_id,
          title: item.title,
          relationReason: item.relation_reason,
          bridgeSentence: item.bridge_sentence,
        }))
      : [],
  };
}

async function upsertArtifact(input: {
  documentId: number;
  stageCode: DocumentArtifactStageCode;
  status: DocumentStageArtifactStatus;
  summary: string | null;
  payload: Record<string, unknown>;
  model?: string | null;
  provider?: string | null;
  errorMessage?: string | null;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM document_stage_artifacts WHERE document_id = ? AND stage_code = ?",
    [input.documentId, input.stageCode],
  );

  if (!existing) {
    await db.exec(
      `INSERT INTO document_stage_artifacts (
        document_id, stage_code, status, summary, payload_json, model, provider, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.documentId,
        input.stageCode,
        input.status,
        input.summary,
        JSON.stringify(input.payload),
        input.model ?? null,
        input.provider ?? null,
        input.errorMessage ?? null,
        now,
        now,
      ],
    );
  } else {
    await db.exec(
      `UPDATE document_stage_artifacts
       SET status = ?, summary = ?, payload_json = ?, model = ?, provider = ?, error_message = ?, updated_at = ?
       WHERE document_id = ? AND stage_code = ?`,
      [
        input.status,
        input.summary,
        JSON.stringify(input.payload),
        input.model ?? null,
        input.provider ?? null,
        input.errorMessage ?? null,
        now,
        input.documentId,
        input.stageCode,
      ],
    );
  }

  const saved = await db.queryOne<ArtifactRow>(
    "SELECT * FROM document_stage_artifacts WHERE document_id = ? AND stage_code = ?",
    [input.documentId, input.stageCode],
  );
  if (!saved) {
    throw new Error("阶段产物保存失败");
  }
  return toArtifact(saved);
}

async function generateWithPrompt(input: {
  stageCode: DocumentArtifactStageCode;
  promptId: string;
  sceneCode: "documentWrite" | "bannedWordAudit";
  userPrompt: string;
  fallback: Record<string, unknown>;
  normalize: (value: unknown, fallback: Record<string, unknown>) => Record<string, unknown>;
  context: GenerationContext;
}) {
  const existingArtifact = await getDocumentStageArtifact(input.context.document.id, input.context.userId, input.stageCode);
  const preservedSelection = normalizeRecord(existingArtifact?.payload?.selection);
  try {
    const systemPrompt = await loadPrompt(input.promptId);
    const result = await generateSceneText({
      sceneCode: input.sceneCode,
      systemPrompt,
      userPrompt: input.userPrompt,
      temperature: 0.2,
    });
    const normalized = input.normalize(extractJsonObject(result.text), input.fallback);
    return upsertArtifact({
      documentId: input.context.document.id,
      stageCode: input.stageCode,
      status: "ready",
      summary: String(normalized.summary || input.fallback.summary || "").trim() || null,
      payload: preservedSelection ? { ...normalized, selection: preservedSelection } : normalized,
      model: result.model,
      provider: result.provider,
      errorMessage: null,
    });
  } catch (error) {
    return upsertArtifact({
      documentId: input.context.document.id,
      stageCode: input.stageCode,
      status: "ready",
      summary: String(input.fallback.summary || "").trim() || null,
      payload: preservedSelection ? { ...input.fallback, selection: preservedSelection } : input.fallback,
      model: "fallback-local",
      provider: "local",
      errorMessage: error instanceof Error ? error.message : "stage artifact generation failed",
    });
  }
}

async function generateAudienceAnalysis(context: GenerationContext) {
  const fallback = fallbackAudienceAnalysis(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","coreReaderLabel":"字符串","readerSegments":[{"label":"字符串","painPoint":"字符串","motivation":"字符串","preferredTone":"字符串"}],"languageGuidance":[""],"backgroundAwarenessOptions":[""],"readabilityOptions":[""],"contentWarnings":[""],"recommendedCallToAction":"字符串"}',
    "readerSegments 返回 2-4 项，其余数组返回 2-5 项。",
    "你是在做真实的内容策略判断，不是在写宽泛画像。",
    "优先判断谁最可能点开、读完、转发这篇内容，再给表达建议。",
    "readerSegments 不要写年龄、性别这类空泛人口学标签，必须写成可执行的读者类型。",
    "languageGuidance 必须是具体表达策略，例如先讲事实还是先下判断、术语是否需要翻译、是否适合对话式表达。",
    "backgroundAwarenessOptions 必须覆盖至少三档认知背景，例如小白、半熟悉、行业内。",
    "readabilityOptions 必须覆盖至少三档通俗度，例如新手可读、兼顾专业、高信息密度。",
    "contentWarnings 只写真正会造成理解偏差、争议或阅读门槛的风险点。",
    "recommendedCallToAction 要能指导结尾动作，例如评论区讨论、收藏转发、继续观察某指标。",
    `文稿标题：${context.document.title}`,
    `作者人设：${listPersonaSummary(context)}`,
    `绑定文风资产细节：\n${listWritingStyleProfileSummary(context)}`,
    `当前正文摘要：${truncateText(stripMarkdown(context.document.markdownContent), 600) || "暂无正文，请结合标题、碎片与大纲推断。"}`,
    `大纲锚点：${context.outlineNodes.map((item) => `${item.title}${item.description ? `（${item.description}）` : ""}`).join("；") || "暂无大纲锚点"}`,
    `已知事实：${getSourceFacts(context, 6).join("；") || "暂无事实素材"}`,
    `开放问题：${context.knowledgeCards.flatMap((card) => card.openQuestions).slice(0, 4).join("；") || "暂无"}`,
    context.audienceSelection?.selectedBackgroundAwareness ? `已确认背景预设：${context.audienceSelection.selectedBackgroundAwareness}` : null,
    context.audienceSelection?.selectedReadabilityLevel ? `已确认通俗度：${context.audienceSelection.selectedReadabilityLevel}` : null,
  ].filter(Boolean).join("\n");

  return generateWithPrompt({
    stageCode: "audienceAnalysis",
    promptId: "audience_analysis",
    sceneCode: "documentWrite",
    userPrompt,
    fallback,
    normalize: normalizeAudiencePayload,
    context,
  });
}

async function generateOutlinePlanning(context: GenerationContext) {
  const fallback = fallbackOutlinePlanning(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","workingTitle":"字符串","titleOptions":[{"title":"字符串","styleLabel":"字符串","angle":"字符串","reason":"字符串","riskHint":"字符串"}],"titleStrategyNotes":[""],"centralThesis":"字符串","openingHook":"字符串","openingHookOptions":[""],"targetEmotion":"字符串","targetEmotionOptions":[""],"supplementalViewpoints":[""],"viewpointIntegration":[{"viewpoint":"字符串","action":"adopted|softened|deferred|conflicted","note":"字符串"}],"materialBundle":[{"fragmentId":1,"title":"字符串","usageMode":"rewrite|image","sourceType":"manual|url|screenshot","summary":"字符串","screenshotPath":"字符串或空"}],"outlineSections":[{"heading":"字符串","goal":"字符串","keyPoints":[""],"evidenceHints":[""],"materialRefs":[1],"transition":"字符串"}],"materialGapHints":[""],"endingStrategy":"字符串","endingStrategyOptions":[""]}',
    "outlineSections 返回 3-6 节，每节 2-4 个关键点。",
    "titleOptions 固定返回 3 项，且 3 个标题必须围绕同一主轴，但风格明显区分，例如观点判断型、场景问题型、结果反差型。",
    "titleOptions.title 必须主题明确、有读者收益感，但不能承诺正文无法兑现的结果，也不能夸大事实。",
    "titleOptions.riskHint 必须指出这个标题最需要防的风险，例如信息密度偏高、冲突感偏弱、轻微标题先行，不要写空话。",
    "titleStrategyNotes 说明这 3 个标题分别抓住了什么价值点，以及为什么不属于标题党。",
    "大纲要体现论证递进，不允许各节只是并列堆料。",
    "主论点必须由系统综合选题、人设、受众和素材形成，用户补充观点只能作为校准或强调，不能直接取代主论点。",
    "openingHookOptions 给出不同开头策略，例如事实冲突、反常识判断、人物切口、问题切口。",
    "targetEmotionOptions 给出读者读完后的情绪目标，例如警惕、被说服、想转发、愿意行动。",
    "outlineSections.goal 必须说明这一节承担什么推进任务，而不是重复标题。",
    "outlineSections.keyPoints 必须具体到观点或信息点，避免“展开分析”“补充背景”这类空话。",
    "outlineSections.evidenceHints 优先引用现有素材、碎片、主题档案和待补事实，不要虚构来源。",
    "outlineSections.materialRefs 必须尽量引用 materialBundle 中的 fragmentId；截图素材只能作为原图使用，不可改写成伪原文。",
    "viewpointIntegration 必须逐条说明用户补充观点是被采纳、弱化、暂缓还是判定冲突。",
    "transition 必须说明如何从上一节自然推进到下一节。",
    "endingStrategy 与 recommendedCallToAction 保持一致，结尾要么收束判断，要么给动作，要么留下观察点。",
    `文稿标题：${context.document.title}`,
    `作者人设：${listPersonaSummary(context)}`,
    `绑定文风资产细节：\n${listWritingStyleProfileSummary(context)}`,
    context.audienceSelection?.selectedReaderLabel ? `已确认目标读者：${context.audienceSelection.selectedReaderLabel}` : null,
    context.audienceSelection?.selectedLanguageGuidance ? `已确认表达方式：${context.audienceSelection.selectedLanguageGuidance}` : null,
    context.audienceSelection?.selectedBackgroundAwareness ? `已确认背景预设：${context.audienceSelection.selectedBackgroundAwareness}` : null,
    context.audienceSelection?.selectedReadabilityLevel ? `已确认通俗度：${context.audienceSelection.selectedReadabilityLevel}` : null,
    context.audienceSelection?.selectedCallToAction ? `已确认结尾动作：${context.audienceSelection.selectedCallToAction}` : null,
    context.supplementalViewpoints.length ? `用户补充观点：${context.supplementalViewpoints.join("；")}` : "用户暂未补充额外观点。",
    `当前正文摘要：${truncateText(stripMarkdown(context.document.markdownContent), 800) || "暂无正文，请先根据素材规划结构。"}`,
    `大纲草稿：${context.outlineNodes.map((item) => `${item.title}${item.description ? `（${item.description}）` : ""}`).join("；") || "暂无大纲草稿"}`,
    `主题档案事实：${getSourceFacts(context, 6).join("；") || "暂无主题档案事实"}`,
    `当前可用素材包：${getMaterialBundle(context, 8).map((item) => `${item.fragmentId}. ${item.title}（${item.usageMode}/${item.sourceType}）${item.screenshotPath ? `，原图：${item.screenshotPath}` : ""}：${item.summary}`).join("；") || "暂无已挂载素材"}`,
  ].filter(Boolean).join("\n");

  return generateWithPrompt({
    stageCode: "outlinePlanning",
    promptId: "outline_planning",
    sceneCode: "documentWrite",
    userPrompt,
    fallback,
    normalize: normalizeOutlinePayload,
    context,
  });
}

async function generateDeepWriting(context: GenerationContext) {
  const fallback = fallbackDeepWriting(context);
  const outlineSections = getRecordArray(context.outlinePlan?.outlineSections)
    .map((section, index) =>
      [
        `${index + 1}. ${String(section.heading || "").trim() || `章节 ${index + 1}`}`,
        String(section.goal || "").trim() ? `目标：${String(section.goal).trim()}` : null,
        getStringArray(section.keyPoints, 4).length ? `关键点：${getStringArray(section.keyPoints, 4).join("；")}` : null,
        getStringArray(section.evidenceHints, 4).length ? `证据提示：${getStringArray(section.evidenceHints, 4).join("；")}` : null,
      ].filter(Boolean).join(" / "),
    );
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","selectedTitle":"字符串","centralThesis":"字符串","writingAngle":"字符串","openingStrategy":"字符串","targetEmotion":"字符串","endingStrategy":"字符串","voiceChecklist":[""],"mustUseFacts":[""],"bannedWordWatchlist":[""],"sectionBlueprint":[{"heading":"字符串","goal":"字符串","paragraphMission":"字符串","evidenceHints":[""],"materialRefs":[1],"transition":"字符串"}],"historyReferencePlan":[{"title":"字符串","useWhen":"字符串","bridgeSentence":"字符串"}],"finalChecklist":[""]}',
    "你是在给正文生成器准备一张可执行的写作执行卡，不是在复述大纲。",
    "sectionBlueprint 返回 3-6 节，每节都要写清本节任务、段落推进方式和证据提示。",
    "voiceChecklist 返回 3-6 条，必须是可执行的表达约束，不要写空泛风格形容词。",
    "mustUseFacts 只保留真正值得写进正文的事实锚点，不超过 6 条。",
    "historyReferencePlan 最多 2 条，没有可用旧文时返回空数组。",
    "finalChecklist 必须覆盖标题一致性、事实密度、死刑词规避、结尾动作或判断收束。",
    "如果大纲里已经确认了标题、开头、目标情绪、结尾策略，必须优先沿用。",
    `文稿标题：${context.document.title}`,
    `作者人设：${listPersonaSummary(context)}`,
    `绑定文风资产细节：\n${listWritingStyleProfileSummary(context)}`,
    context.audienceSelection?.selectedReaderLabel ? `已确认目标读者：${context.audienceSelection.selectedReaderLabel}` : null,
    context.audienceSelection?.selectedLanguageGuidance ? `已确认表达方式：${context.audienceSelection.selectedLanguageGuidance}` : null,
    context.audienceSelection?.selectedBackgroundAwareness ? `已确认背景预设：${context.audienceSelection.selectedBackgroundAwareness}` : null,
    context.audienceSelection?.selectedReadabilityLevel ? `已确认通俗度：${context.audienceSelection.selectedReadabilityLevel}` : null,
    context.outlineSelection?.selectedTitle ? `已确认标题：${context.outlineSelection.selectedTitle}` : null,
    context.outlineSelection?.selectedOpeningHook ? `已确认开头策略：${context.outlineSelection.selectedOpeningHook}` : null,
    context.outlineSelection?.selectedTargetEmotion ? `已确认目标情绪：${context.outlineSelection.selectedTargetEmotion}` : null,
    context.outlineSelection?.selectedEndingStrategy ? `已确认结尾策略：${context.outlineSelection.selectedEndingStrategy}` : null,
    String(context.outlinePlan?.centralThesis || "").trim() ? `大纲核心观点：${String(context.outlinePlan?.centralThesis).trim()}` : null,
    outlineSections.length ? `大纲章节：\n${outlineSections.join("\n")}` : "暂无结构化大纲章节。",
    `现有事实素材：${getSourceFacts(context, 6).join("；") || "暂无"}`,
    `可用素材包：${getMaterialBundle(context, 8).map((item) => `${item.fragmentId}. ${item.title}（${item.usageMode}/${item.sourceType}）：${item.summary}`).join("；") || "暂无"}`,
    context.historyReferences.length
      ? `已保存历史文章自然引用：${context.historyReferences.map((item) => `《${item.title}》${item.relationReason ? `：${item.relationReason}` : ""}${item.bridgeSentence ? `；桥接句：${item.bridgeSentence}` : ""}`).join("；")}`
      : "暂无历史文章自然引用设置。",
    `死刑词名单：${context.bannedWords.join("、") || "无"}`,
    `当前正文摘要：${truncateText(stripMarkdown(context.document.markdownContent), 800) || "暂无正文，请按大纲和素材组织初稿。"}`,
  ].filter(Boolean).join("\n");

  return generateWithPrompt({
    stageCode: "deepWriting",
    promptId: "document_write",
    sceneCode: "documentWrite",
    userPrompt,
    fallback,
    normalize: normalizeDeepWritingPayload,
    context,
  });
}

async function generateFactCheck(context: GenerationContext) {
  const fallback = fallbackFactCheck(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","overallRisk":"low|medium|high","checks":[{"claim":"字符串","status":"verified|needs_source|risky|opinion","suggestion":"字符串"}],"evidenceCards":[{"claim":"字符串","supportLevel":"strong|partial|missing","evidenceItems":[{"title":"字符串","excerpt":"字符串","sourceType":"url|manual|screenshot","sourceUrl":"字符串或空","rationale":"字符串"}]}],"missingEvidence":[""],"personaAlignment":"字符串","topicAlignment":"字符串"}',
    "只针对正文里的具体事实、时间、数字、案例与因果判断给出核查结果。",
    "如果提供的事实素材里没有足够依据，不能标 verified，应该标 needs_source 或 risky。",
    "opinion 只用于明显属于作者判断、价值评价或预测的句子，不要滥用。",
    "checks 优先覆盖最关键、最容易出错、最影响发布风险的 5-12 条表述。",
    "suggestion 必须可执行，例如补什么证据、改成什么语气、删掉哪一层因果推断。",
    "evidenceCards 只允许使用已提供的碎片、知识卡、URL 证据，不要编造外部来源。",
    "missingEvidence 只列真正阻碍发布的缺口，例如时间、数字口径、案例出处。",
    "personaAlignment 和 topicAlignment 要判断当前正文是否偏离作者人设和主题主轴，必要时直接指出跑题或语气失配。",
    `文稿标题：${context.document.title}`,
    `作者人设：${listPersonaSummary(context)}`,
    `绑定文风资产细节：\n${listWritingStyleProfileSummary(context)}`,
    `当前正文：${context.document.markdownContent || "暂无正文"}`,
    `可对照事实：${getSourceFacts(context, 8).join("；") || "暂无对照事实"}`,
  ].join("\n");

  return generateWithPrompt({
    stageCode: "factCheck",
    promptId: "fact_check",
    sceneCode: "bannedWordAudit",
    userPrompt,
    fallback,
    normalize: (value, baseFallback) => normalizeFactCheckPayload(value, baseFallback, context),
    context,
  });
}

async function generateProsePolish(context: GenerationContext) {
  const fallback = fallbackProsePolish(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","overallDiagnosis":"字符串","strengths":[""],"issues":[{"type":"字符串","example":"字符串","suggestion":"字符串"}],"languageGuardHits":[{"ruleId":"字符串","ruleKind":"token|pattern","matchMode":"contains|template","matchedText":"字符串","patternText":"字符串","rewriteHint":"字符串","severity":"high|medium","scope":"system|user"}],"rewrittenLead":"字符串","punchlines":[""],"rhythmAdvice":[""]}',
    "润色只负责表达，不负责新增事实、数据、案例和结论。",
    "结合正文、禁词、人设口吻和目标读者，给出可执行的润色建议。",
    "strengths 返回 2-4 条，说明当前稿子已经成立的表达优势。",
    "issues 返回 3-6 条，优先指出机器腔、抽象空话、节奏拖沓、情绪转折不顺、术语过密、起手无力等问题。",
    "languageGuardHits 必须优先返回语言守卫命中项，句式命中也要列出来。",
    "suggestion 必须具体到改法，不要只写“更自然一点”“更有感染力”。",
    "rewrittenLead 要保留原文事实立场，只重写开头表达，长度控制在 80-160 字。",
    "punchlines 提炼 2-4 条可直接入稿的金句或判断句，但不能编造新事实。",
    "rhythmAdvice 给出段落长短、断句、留白、强调句位置等节奏建议。",
    `文稿标题：${context.document.title}`,
    `作者人设：${listPersonaSummary(context)}`,
    `绑定文风资产细节：\n${listWritingStyleProfileSummary(context)}`,
    `禁用词：${context.bannedWords.join("、") || "无"}`,
    `语言守卫规则：${context.languageGuardRules.slice(0, 12).map((rule) => `${rule.patternText}${rule.rewriteHint ? `（${rule.rewriteHint}）` : ""}`).join("；")}`,
    `当前正文：${context.document.markdownContent || "暂无正文"}`,
  ].join("\n");

  return generateWithPrompt({
    stageCode: "prosePolish",
    promptId: "prose_polish",
    sceneCode: "bannedWordAudit",
    userPrompt,
    fallback,
    normalize: normalizeProsePolishPayload,
    context,
  });
}

export function isSupportedDocumentArtifactStage(stageCode: string): stageCode is DocumentArtifactStageCode {
  return SUPPORTED_STAGE_CODES.includes(stageCode as DocumentArtifactStageCode);
}

export async function getDocumentStageArtifacts(documentId: number, userId: number) {
  await ensureExtendedProductSchema();
  await ensureDocumentAccess(documentId, userId);
  const db = getDatabase();
  const rows = await db.query<ArtifactRow>(
    `SELECT *
     FROM document_stage_artifacts
     WHERE document_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [documentId],
  );
  return rows.map(toArtifact);
}

export async function getDocumentStageArtifact(documentId: number, userId: number, stageCode: DocumentArtifactStageCode) {
  await ensureExtendedProductSchema();
  await ensureDocumentAccess(documentId, userId);
  const row = await getDatabase().queryOne<ArtifactRow>(
    `SELECT *
     FROM document_stage_artifacts
     WHERE document_id = ? AND stage_code = ?`,
    [documentId, stageCode],
  );
  return row ? toArtifact(row) : null;
}

export async function updateDocumentStageArtifactPayload(input: {
  documentId: number;
  userId: number;
  stageCode: DocumentArtifactStageCode;
  payloadPatch: Record<string, unknown>;
}) {
  const current = await getDocumentStageArtifact(input.documentId, input.userId, input.stageCode);
  if (!current) {
    await ensureDocumentAccess(input.documentId, input.userId);
    const summary =
      typeof input.payloadPatch.summary === "string" && input.payloadPatch.summary.trim()
        ? input.payloadPatch.summary.trim()
        : null;
    return upsertArtifact({
      documentId: input.documentId,
      stageCode: input.stageCode,
      status: "ready",
      summary,
      payload: input.payloadPatch,
      model: "manual-seed",
      provider: "manual",
      errorMessage: null,
    });
  }
  const nextPayload = {
    ...(current.payload || {}),
    ...input.payloadPatch,
  };
  return upsertArtifact({
    documentId: input.documentId,
    stageCode: input.stageCode,
    status: current.status,
    summary: current.summary,
    payload: nextPayload,
    model: current.model,
    provider: current.provider,
    errorMessage: current.errorMessage,
  });
}

export async function generateDocumentStageArtifact(input: {
  documentId: number;
  userId: number;
  stageCode: DocumentArtifactStageCode;
}) {
  const context = await buildGenerationContext(input.documentId, input.userId);
  if (input.stageCode === "audienceAnalysis") {
    return generateAudienceAnalysis(context);
  }
  if (input.stageCode === "outlinePlanning") {
    return generateOutlinePlanning(context);
  }
  if (input.stageCode === "deepWriting") {
    return generateDeepWriting(context);
  }
  if (input.stageCode === "factCheck") {
    return generateFactCheck(context);
  }
  return generateProsePolish(context);
}

export function buildStageArtifactApplyCommand(artifact: DocumentStageArtifact) {
  const payload = artifact.payload || {};

  if (artifact.stageCode === "audienceAnalysis") {
    const selection = getAudienceSelection(payload);
    const selectedSegment = getRecordArray(payload.readerSegments).find(
      (segment) => String(segment.label || "").trim() === selection?.selectedReaderLabel,
    );
    const readerSegments = (selectedSegment ? [selectedSegment] : getRecordArray(payload.readerSegments).slice(0, 3))
      .map((segment) =>
        [
          `人群：${String(segment.label || "").trim() || "未命名读者"}`,
          `痛点：${String(segment.painPoint || "").trim() || "暂无"}`,
          `动机：${String(segment.motivation || "").trim() || "暂无"}`,
          `语气：${String(segment.preferredTone || "").trim() || "暂无"}`,
        ].join("；"),
      );
    const languageGuidance = selection?.selectedLanguageGuidance
      ? [selection.selectedLanguageGuidance]
      : getStringArray(payload.languageGuidance, 5);
    const backgroundAwareness = selection?.selectedBackgroundAwareness
      ? [selection.selectedBackgroundAwareness]
      : getStringArray(payload.backgroundAwarenessOptions, 4);
    const readabilityLevel = selection?.selectedReadabilityLevel
      ? [selection.selectedReadabilityLevel]
      : getStringArray(payload.readabilityOptions, 4);
    const warnings = getStringArray(payload.contentWarnings, 5);
    return [
      "请根据以下受众分析重写全文，但不要改动核心事实，不要新增未经验证的信息。",
      selection?.selectedReaderLabel
        ? `已确认目标读者：${selection.selectedReaderLabel}`
        : String(payload.coreReaderLabel || "").trim()
          ? `核心受众：${String(payload.coreReaderLabel).trim()}`
          : null,
      readerSegments.length ? `重点人群：${readerSegments.join(" | ")}` : null,
      languageGuidance.length ? `表达方式：${languageGuidance.join("；")}` : null,
      backgroundAwareness.length ? `背景预设：${backgroundAwareness.join("；")}` : null,
      readabilityLevel.length ? `语言通俗度：${readabilityLevel.join("；")}` : null,
      warnings.length ? `写作限制：${warnings.join("；")}` : null,
      selection?.selectedCallToAction
        ? `结尾动作：${selection.selectedCallToAction}`
        : String(payload.recommendedCallToAction || "").trim()
          ? `结尾动作：${String(payload.recommendedCallToAction).trim()}`
          : null,
      "要求：增强背景解释层次、调整表达通俗度、让正文更贴近目标读者，但保留当前主题判断。",
    ].filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "outlinePlanning") {
    const selection = getOutlineSelection(payload);
    const sections = getRecordArray(payload.outlineSections)
      .slice(0, 6)
      .map((section, index) =>
        [
          `${index + 1}. ${String(section.heading || "").trim() || `章节${index + 1}`}`,
          String(section.goal || "").trim() ? `目标：${String(section.goal).trim()}` : null,
          getStringArray(section.keyPoints, 4).length ? `关键点：${getStringArray(section.keyPoints, 4).join("；")}` : null,
          getStringArray(section.evidenceHints, 4).length ? `证据提示：${getStringArray(section.evidenceHints, 4).join("；")}` : null,
          String(section.transition || "").trim() ? `衔接：${String(section.transition).trim()}` : null,
        ].filter(Boolean).join(" / "),
      );
    return [
      "请按照下面的大纲规划重组整篇正文，输出完整 Markdown。",
      selection?.selectedTitle
        ? `采用标题：${selection.selectedTitle}${selection.selectedTitleStyle ? `（${selection.selectedTitleStyle}）` : ""}`
        : String(payload.workingTitle || "").trim()
          ? `采用标题：${String(payload.workingTitle).trim()}`
          : null,
      String(payload.centralThesis || "").trim() ? `核心观点：${String(payload.centralThesis).trim()}` : null,
      selection?.selectedOpeningHook
        ? `开头策略：${selection.selectedOpeningHook}`
        : String(payload.openingHook || "").trim()
          ? `开头策略：${String(payload.openingHook).trim()}`
          : null,
      selection?.selectedTargetEmotion
        ? `目标情绪：${selection.selectedTargetEmotion}`
        : String(payload.targetEmotion || "").trim()
          ? `目标情绪：${String(payload.targetEmotion).trim()}`
          : null,
      sections.length ? `大纲结构：\n${sections.join("\n")}` : null,
      selection?.selectedEndingStrategy
        ? `结尾策略：${selection.selectedEndingStrategy}`
        : String(payload.endingStrategy || "").trim()
          ? `结尾策略：${String(payload.endingStrategy).trim()}`
          : null,
      "要求：保留原有可用事实，调整段落顺序与层次，必要时补充小标题，但不要空泛扩写。",
    ].filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "deepWriting") {
    const sections = getRecordArray(payload.sectionBlueprint)
      .slice(0, 6)
      .map((section, index) =>
        [
          `${index + 1}. ${String(section.heading || "").trim() || `章节 ${index + 1}`}`,
          String(section.goal || "").trim() ? `目标：${String(section.goal).trim()}` : null,
          String(section.paragraphMission || "").trim() ? `段落任务：${String(section.paragraphMission).trim()}` : null,
          getStringArray(section.evidenceHints, 4).length ? `证据提示：${getStringArray(section.evidenceHints, 4).join("；")}` : null,
          String(section.transition || "").trim() ? `衔接：${String(section.transition).trim()}` : null,
        ].filter(Boolean).join(" / "),
      );
    const historyReferencePlan = getRecordArray(payload.historyReferencePlan)
      .slice(0, 2)
      .map((item) =>
        [
          `旧文：${String(item.title || "").trim() || "未命名旧文"}`,
          String(item.useWhen || "").trim() ? `使用时机：${String(item.useWhen).trim()}` : null,
          String(item.bridgeSentence || "").trim() ? `桥接句：${String(item.bridgeSentence).trim()}` : null,
        ].filter(Boolean).join("；"),
      );
    return [
      "请直接输出完整 Markdown 正文，不要解释，不要列步骤。",
      String(payload.selectedTitle || "").trim() ? `采用标题：${String(payload.selectedTitle).trim()}` : null,
      String(payload.centralThesis || "").trim() ? `核心观点：${String(payload.centralThesis).trim()}` : null,
      String(payload.writingAngle || "").trim() ? `写作角度：${String(payload.writingAngle).trim()}` : null,
      String(payload.openingStrategy || "").trim() ? `开头策略：${String(payload.openingStrategy).trim()}` : null,
      String(payload.targetEmotion || "").trim() ? `目标情绪：${String(payload.targetEmotion).trim()}` : null,
      sections.length ? `写作结构：\n${sections.join("\n")}` : null,
      getStringArray(payload.mustUseFacts, 6).length ? `必须吃透的事实：${getStringArray(payload.mustUseFacts, 6).join("；")}` : null,
      getStringArray(payload.voiceChecklist, 6).length ? `表达约束：${getStringArray(payload.voiceChecklist, 6).join("；")}` : null,
      getStringArray(payload.bannedWordWatchlist, 8).length ? `重点避开这些死刑词：${getStringArray(payload.bannedWordWatchlist, 8).join("、")}` : null,
      historyReferencePlan.length ? `历史文章自然引用：${historyReferencePlan.join(" | ")}` : null,
      String(payload.endingStrategy || "").trim() ? `结尾策略：${String(payload.endingStrategy).trim()}` : null,
      getStringArray(payload.finalChecklist, 6).length ? `终稿自检：${getStringArray(payload.finalChecklist, 6).join("；")}` : null,
    ].filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "factCheck") {
    const checks = getRecordArray(payload.checks)
      .slice(0, 6)
      .map((check) =>
        [
          `表述：${String(check.claim || "").trim() || "未命名核查项"}`,
          `状态：${String(check.status || "").trim() || "needs_source"}`,
          `处理：${String(check.suggestion || "").trim() || "请改写为更稳妥的表达"}`,
        ].join("；"),
      );
    const evidenceCards = getRecordArray(payload.evidenceCards)
      .slice(0, 4)
      .map((card, index) => {
        const evidenceItems = getRecordArray(card.evidenceItems)
          .slice(0, 2)
          .map((item) =>
            [
              `证据：${String(item.title || "").trim() || "未命名证据"}`,
              String(item.excerpt || "").trim() ? `摘要：${String(item.excerpt).trim()}` : null,
              String(item.sourceUrl || "").trim() ? `链接：${String(item.sourceUrl).trim()}` : null,
            ].filter(Boolean).join("；"),
          );
        return [
          `${index + 1}. 表述：${String(card.claim || "").trim() || "未命名核查项"}`,
          `证据强度：${String(card.supportLevel || "").trim() || "missing"}`,
          evidenceItems.length ? `命中证据：${evidenceItems.join(" | ")}` : "命中证据：暂无",
        ].join(" / ");
      });
    const missingEvidence = getStringArray(payload.missingEvidence, 6);
    return [
      "请根据以下事实核查结果改写全文，输出完整 Markdown。",
      String(payload.summary || "").trim() ? `核查摘要：${String(payload.summary).trim()}` : null,
      checks.length ? `逐项处理：${checks.join(" | ")}` : null,
      evidenceCards.length ? `证据摘要卡：\n${evidenceCards.join("\n")}` : null,
      missingEvidence.length ? `待补证据：${missingEvidence.join("；")}` : null,
      String(payload.personaAlignment || "").trim() ? `人设提醒：${String(payload.personaAlignment).trim()}` : null,
      String(payload.topicAlignment || "").trim() ? `主题提醒：${String(payload.topicAlignment).trim()}` : null,
      "要求：没有证据的绝对化表述改成判断语气；高风险数字、时间、案例请弱化或删除；保留已经有事实支撑的核心结论。",
    ].filter(Boolean).join("\n");
  }

  const issues = getRecordArray(payload.issues)
    .slice(0, 6)
    .map((issue) =>
      [
        `问题：${String(issue.type || "").trim() || "未命名问题"}`,
        String(issue.example || "").trim() ? `示例：${String(issue.example).trim()}` : null,
        `建议：${String(issue.suggestion || "").trim() || "请直接改得更清晰有力"}`,
      ].filter(Boolean).join("；"),
    );
  const strengths = getStringArray(payload.strengths, 4);
  const punchlines = getStringArray(payload.punchlines, 4);
  const rhythmAdvice = getStringArray(payload.rhythmAdvice, 4);
  return [
    "请根据以下文笔润色建议重写全文，输出完整 Markdown。",
    strengths.length ? `保留优点：${strengths.join("；")}` : null,
    String(payload.overallDiagnosis || "").trim() ? `整体诊断：${String(payload.overallDiagnosis).trim()}` : null,
    issues.length ? `重点修改：${issues.join(" | ")}` : null,
    String(payload.rewrittenLead || "").trim() ? `首段建议：${String(payload.rewrittenLead).trim()}` : null,
    punchlines.length ? `金句候选：${punchlines.join("；")}` : null,
    rhythmAdvice.length ? `节奏建议：${rhythmAdvice.join("；")}` : null,
    "要求：主要优化语言节奏、句子力度和开头抓力，不改变文章主旨与事实边界。",
  ].filter(Boolean).join("\n");
}
