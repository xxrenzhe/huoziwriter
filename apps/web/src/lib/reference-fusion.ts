export const REFERENCE_FUSION_MODES = ["inspiration", "structure", "evidence", "close_read"] as const;

export type ReferenceFusionMode = typeof REFERENCE_FUSION_MODES[number];

export type ReferenceFusionProfile = {
  mode: ReferenceFusionMode;
  modeLabel: string;
  riskLevel: "low" | "medium" | "high";
  sourceUrls: string[];
  extractionFocus: string[];
  borrowableStructure: string[];
  avoidanceList: string[];
  differentiationStrategy: string;
};

type ReferenceFusionProfileInput = {
  mode?: unknown;
  sourceUrls?: unknown;
  borrowableStructure?: unknown;
  avoidanceList?: unknown;
  differentiationStrategy?: unknown;
};

function uniqueStrings(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeReferenceFusionMode(value: unknown, fallback: ReferenceFusionMode = "evidence"): ReferenceFusionMode {
  const normalized = String(value || "").trim();
  return REFERENCE_FUSION_MODES.includes(normalized as ReferenceFusionMode) ? normalized as ReferenceFusionMode : fallback;
}

function getModeLabel(mode: ReferenceFusionMode) {
  if (mode === "inspiration") return "灵感借鉴";
  if (mode === "structure") return "结构借鉴";
  if (mode === "close_read") return "精读拆解";
  return "证据提取";
}

function getRiskLevel(mode: ReferenceFusionMode): ReferenceFusionProfile["riskLevel"] {
  if (mode === "close_read") return "high";
  if (mode === "structure") return "medium";
  return "low";
}

function getDefaultExtractionFocus(mode: ReferenceFusionMode) {
  if (mode === "inspiration") {
    return ["只提炼原文触发的新问题、新矛盾和读者情绪，不借标题、结构、段落表达。"];
  }
  if (mode === "structure") {
    return ["拆出原文推进顺序", "识别可借的结构张力", "换掉论证路径、案例和表达方式"];
  }
  if (mode === "close_read") {
    return ["提炼原文核心观点", "提炼事实、数据、案例和反证", "生成差异化策略和规避清单"];
  }
  return ["提取可核查事实", "提取数据、原话、案例和反例", "标明证据能支撑什么、不能支撑什么"];
}

function getDefaultBorrowableStructure(mode: ReferenceFusionMode) {
  if (mode === "structure") {
    return ["可以借原文的冲突递进、先后顺序或比较框架，但必须换主判断、换案例和换章节表达。"];
  }
  if (mode === "close_read") {
    return ["只能借鉴原文的问题意识和事实线索，正文结构必须重新组织。"];
  }
  return [];
}

function getDefaultAvoidanceList(mode: ReferenceFusionMode) {
  if (mode === "structure") {
    return ["不复用原文标题句式", "不复用原文章节顺序原句", "不复用原文案例作为唯一支撑", "不沿用原文结论落点"];
  }
  if (mode === "close_read") {
    return ["不改写式搬运原文段落", "不复刻原文标题、开头和结尾", "不沿用原文论证顺序", "不把原文案例当成自己的经历", "不省略差异化主判断"];
  }
  if (mode === "inspiration") {
    return ["不借原文结构", "不借原文表达", "不把灵感写成来源复述"];
  }
  return ["不把来源单口径写成事实全貌", "不摘抄原文长句", "不把未核实观点写成定论"];
}

function getDefaultDifferentiationStrategy(mode: ReferenceFusionMode) {
  if (mode === "structure") return "保留结构张力，改写论证路径：换目标读者、换核心判断、换案例组合和收束位置。";
  if (mode === "close_read") return "先承认原文提供的事实和问题意识，再用新的作者视角、读者处境和反例边界重组文章。";
  if (mode === "inspiration") return "只保留触发点，把文章写成作者自己的问题、现场和判断。";
  return "把来源当证据包使用，正文围绕新判断组织，不围绕来源文章复述。";
}

export function buildReferenceFusionProfile(input: ReferenceFusionProfileInput = {}): ReferenceFusionProfile {
  const sourceUrls = uniqueStrings(input.sourceUrls, 8);
  const mode = normalizeReferenceFusionMode(input.mode, sourceUrls.length ? "evidence" : "inspiration");
  const borrowableStructure = uniqueStrings(input.borrowableStructure, 6);
  const avoidanceList = uniqueStrings(input.avoidanceList, 8);
  const differentiationStrategy = String(input.differentiationStrategy || "").trim();

  return {
    mode,
    modeLabel: getModeLabel(mode),
    riskLevel: getRiskLevel(mode),
    sourceUrls,
    extractionFocus: getDefaultExtractionFocus(mode),
    borrowableStructure: borrowableStructure.length ? borrowableStructure : getDefaultBorrowableStructure(mode),
    avoidanceList: avoidanceList.length ? avoidanceList : getDefaultAvoidanceList(mode),
    differentiationStrategy: differentiationStrategy || getDefaultDifferentiationStrategy(mode),
  };
}

export function normalizeReferenceFusionPayload(value: unknown, fallback?: unknown) {
  const payload = getRecord(value);
  const fallbackPayload = getRecord(fallback);
  return buildReferenceFusionProfile({
    mode: payload?.mode ?? fallbackPayload?.mode,
    sourceUrls: uniqueStrings(payload?.sourceUrls, 8).length ? payload?.sourceUrls : fallbackPayload?.sourceUrls,
    borrowableStructure: uniqueStrings(payload?.borrowableStructure, 6).length ? payload?.borrowableStructure : fallbackPayload?.borrowableStructure,
    avoidanceList: uniqueStrings(payload?.avoidanceList, 8).length ? payload?.avoidanceList : fallbackPayload?.avoidanceList,
    differentiationStrategy: String(payload?.differentiationStrategy || fallbackPayload?.differentiationStrategy || "").trim(),
  });
}

export function buildReferenceFusionPromptLines(profile: ReferenceFusionProfile, stage: "topicAnalysis" | "researchBrief" | "outlinePlanning" | "deepWriting") {
  const base = [
    `参考文章融合模式：${profile.modeLabel}（${profile.mode}，风险 ${profile.riskLevel}）`,
    `提取重点：${profile.extractionFocus.join("；")}`,
  ];
  if (stage === "topicAnalysis") {
    return [
      ...base,
      "主题判断必须来自来源正文内容，不得把“自动生成流程”或用户操作描述当成文章主题。",
    ];
  }
  if (stage === "researchBrief") {
    return [
      ...base,
      profile.sourceUrls.length ? `来源链接：${profile.sourceUrls.join("；")}` : "来源链接：无",
      `差异化策略：${profile.differentiationStrategy}`,
      `规避清单：${profile.avoidanceList.join("；")}`,
    ];
  }
  if (stage === "outlinePlanning") {
    return [
      ...base,
      profile.borrowableStructure.length ? `可借结构：${profile.borrowableStructure.join("；")}` : "可借结构：无，只能借事实或灵感。",
      `必须避开：${profile.avoidanceList.join("；")}`,
      `差异化策略：${profile.differentiationStrategy}`,
    ];
  }
  return [
    ...base,
    `正文规避清单：${profile.avoidanceList.join("；")}`,
    `正文差异化策略：${profile.differentiationStrategy}`,
    "正文必须长成新文章：不围绕来源逐段复述，不把来源文章的标题、开头、结构和结尾当模板。",
  ];
}

export function evaluateReferenceFusionGuard(input: {
  researchBriefPayload?: unknown;
  outlinePayload?: unknown;
  deepWritingPayload?: unknown;
}) {
  const researchFusion = getRecord(input.researchBriefPayload)?.referenceFusion;
  const outlineFusion = getRecord(input.outlinePayload)?.referenceFusion;
  const deepFusion = getRecord(input.deepWritingPayload)?.referenceFusion;
  const selectedFusion = deepFusion || outlineFusion || researchFusion;
  const selectedRecord = getRecord(selectedFusion) || {};
  const profile = normalizeReferenceFusionPayload(selectedFusion, researchFusion);
  const highRisk = profile.mode === "structure" || profile.mode === "close_read";
  const explicitAvoidanceList = uniqueStrings(selectedRecord.avoidanceList, 8);
  const explicitDifferentiationStrategy = String(selectedRecord.differentiationStrategy || "").trim();
  const explicitBorrowableStructure = uniqueStrings(selectedRecord.borrowableStructure, 6);
  const missingAvoidance = highRisk && explicitAvoidanceList.length < (profile.mode === "close_read" ? 4 : 2);
  const missingDifferentiation = highRisk && explicitDifferentiationStrategy.length < 20;
  const missingStructurePlan = profile.mode === "structure" && explicitBorrowableStructure.length === 0;
  const issues = [
    missingAvoidance ? "缺少足够具体的参考规避清单。" : null,
    missingDifferentiation ? "缺少可执行的差异化策略。" : null,
    missingStructurePlan ? "结构借鉴模式缺少可借结构与改写边界。" : null,
  ].filter(Boolean) as string[];
  return {
    profile,
    status: issues.length ? "blocked" as const : "passed" as const,
    issues,
  };
}
