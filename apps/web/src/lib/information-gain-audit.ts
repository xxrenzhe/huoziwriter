type InformationGainDimension =
  | "factAnchor"
  | "judgementAnchor"
  | "counterEvidence"
  | "sceneAnchor"
  | "timeline"
  | "comparison"
  | "insight";
type InformationGainSeverity = "low" | "medium" | "high";

type ResearchBriefContext = {
  timelineCards?: Array<{
    phase?: string | null;
    title?: string | null;
    summary?: string | null;
    signals?: string[];
  }>;
  comparisonCards?: Array<{
    subject?: string | null;
    position?: string | null;
    differences?: string[];
    opportunities?: string[];
    risks?: string[];
  }>;
  intersectionInsights?: Array<{
    insight?: string | null;
    whyNow?: string | null;
    caution?: string | null;
  }>;
} | null;

type KnowledgeCardContext = {
  title: string;
  status: string;
  overturnedJudgements?: string[];
};

type HistoryReferenceContext = {
  title: string;
  relationReason?: string | null;
  bridgeSentence?: string | null;
};

export type InformationGainAuditIssue = {
  dimension: InformationGainDimension;
  severity: InformationGainSeverity;
  reason: string;
  suggestion: string;
};

export type InformationGainAuditResult = {
  riskLevel: InformationGainSeverity;
  summary: string;
  issues: InformationGainAuditIssue[];
  correctionHint: string | null;
  signals: {
    factAnchorHits: number;
    judgementAnchorHits: number;
    counterEvidenceHits: number;
    sceneAnchorHits: number;
    timelineSignalHits: number;
    comparisonSignalHits: number;
    insightSignalHits: number;
    researchTimelineCount: number;
    researchComparisonCount: number;
    researchInsightCount: number;
    knowledgeCardCount: number;
    historyReferenceCount: number;
  };
};

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function severityWeight(severity: InformationGainSeverity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function summarizeRisk(totalWeight: number, mode: "draft" | "preview") {
  const highThreshold = mode === "preview" ? 6 : 5;
  const mediumThreshold = mode === "preview" ? 3 : 2;
  if (totalWeight >= highThreshold) return "high" as const;
  if (totalWeight >= mediumThreshold) return "medium" as const;
  return "low" as const;
}

export function auditInformationGain(input: {
  title: string;
  markdown: string;
  fragments?: string[];
  researchBrief?: ResearchBriefContext;
  knowledgeCards?: KnowledgeCardContext[];
  historyReferences?: HistoryReferenceContext[];
  mode?: "draft" | "preview";
}) {
  const mode = input.mode ?? "draft";
  const plain = stripMarkdown(input.markdown);
  const fragments = input.fragments ?? [];
  const knowledgeCards = input.knowledgeCards ?? [];
  const historyReferences = input.historyReferences ?? [];
  const researchTimelineCount = input.researchBrief?.timelineCards?.length ?? 0;
  const researchComparisonCount = input.researchBrief?.comparisonCards?.length ?? 0;
  const researchInsightCount = input.researchBrief?.intersectionInsights?.length ?? 0;

  if (!plain) {
    return {
      riskLevel: "low",
      summary: "暂无可审校正文。",
      issues: [],
      correctionHint: null,
      signals: {
        factAnchorHits: 0,
        judgementAnchorHits: 0,
        counterEvidenceHits: 0,
        sceneAnchorHits: 0,
        timelineSignalHits: 0,
        comparisonSignalHits: 0,
        insightSignalHits: 0,
        researchTimelineCount,
        researchComparisonCount,
        researchInsightCount,
        knowledgeCardCount: knowledgeCards.length,
        historyReferenceCount: historyReferences.length,
      },
    } satisfies InformationGainAuditResult;
  }

  const factAnchorHits = countMatches(plain, /(19\d{2}|20\d{2}|\d+(?:\.\d+)?[%万千亿wW元人次天月年条个]|截图|财报|报告|调研|样本|转化率|成本|收入|留存|数据)/g);
  const judgementAnchorHits = countMatches(plain, /(我的判断是|真正的问题是|关键在于|说白了|我更在意的是|我认为|这意味着|不是.+而是|更值得注意的是)/g);
  const counterEvidenceHits = countMatches(plain, /(但也|但是|不过|另一面|反过来|反例|反证|争议|质疑|例外|风险在于|也有人认为|相反)/g);
  const sceneAnchorHits = countMatches(plain, /(周[一二三四五六日天]|早上|晚上|凌晨|\d{1,2}\s*点|工位|办公室|地铁|电梯|家里|咖啡馆|手机|微信|屏幕|弹出|盯着|走进|看到|发来|对话|现场)/g);
  const timelineSignalHits = countMatches(plain, /(此前|后来|当时|阶段|演化|转折|节点|去年|今年|本月|上周|历史)/g) + countMatches(plain, /(19\d{2}|20\d{2})/g);
  const comparisonSignalHits = countMatches(plain, /(对比|相比|差异|更像|不像|替代|同类|另一条路径|相较于|横向看|vs\b|versus)/gi);
  const insightSignalHits = countMatches(plain, /(这意味着|背后是|根本上|真正的问题|说明了|折射出|本质上|因此|所以更)/g);

  const hasCounterMaterial =
    knowledgeCards.some((card) => (card.overturnedJudgements?.length ?? 0) > 0 || String(card.status || "").trim() === "conflicted")
    || historyReferences.length > 0
    || (input.researchBrief?.comparisonCards ?? []).some((item) => (item.risks?.length ?? 0) > 0)
    || (input.researchBrief?.intersectionInsights ?? []).some((item) => String(item.caution || "").trim());

  const issues: InformationGainAuditIssue[] = [];

  if (factAnchorHits === 0) {
    issues.push({
      dimension: "factAnchor",
      severity: mode === "preview" ? "medium" : "high",
      reason: "正文几乎没有可落地的事实锚点，容易只剩抽象判断。",
      suggestion: "至少补 1 个数字、时间点、截图线索或可核对事实，让判断先落地。",
    });
  }

  if (judgementAnchorHits === 0) {
    issues.push({
      dimension: "judgementAnchor",
      severity: "medium",
      reason: "正文更多在堆信息，没有把作者真正想下的判断说清楚。",
      suggestion: "补一句明确判断，再让后面的素材围绕这句判断展开。",
    });
  }

  if (hasCounterMaterial && counterEvidenceHits === 0) {
    issues.push({
      dimension: "counterEvidence",
      severity: "medium",
      reason: "上下文里已有边界或反向材料，但正文没有吸收，结论容易写成单边口径。",
      suggestion: "补 1 句反证、例外或代价边界，避免把判断写满。",
    });
  }

  if (mode === "draft" && sceneAnchorHits === 0 && fragments.length > 0) {
    issues.push({
      dimension: "sceneAnchor",
      severity: "low",
      reason: "正文缺少具体场景或具身细节，信息有了，但读感不够落地。",
      suggestion: "补一个时间、地点、动作或对话片段，把抽象判断压回现场。",
    });
  }

  if (researchTimelineCount > 0 && timelineSignalHits === 0) {
    issues.push({
      dimension: "timeline",
      severity: "medium",
      reason: "研究里有时间脉络，但正文没有把“为什么是现在”写出来。",
      suggestion: "把 1 条时间节点或阶段变化写进正文，交代判断成立的时间背景。",
    });
  }

  if (researchComparisonCount > 0 && comparisonSignalHits === 0) {
    issues.push({
      dimension: "comparison",
      severity: "medium",
      reason: "研究里有横向比较，但正文没有形成对照，增益感不足。",
      suggestion: "补一个同类路径、替代方案或前后版本对比，避免素材并排堆放。",
    });
  }

  if (researchInsightCount > 0 && insightSignalHits === 0) {
    issues.push({
      dimension: "insight",
      severity: "medium",
      reason: "研究里已有交汇洞察，但正文还停在素材陈列，没有把洞察提炼出来。",
      suggestion: "补一句“这意味着什么”或“背后为什么会这样”，把事实推成判断。",
    });
  }

  const sortedIssues = issues.sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
  const riskLevel = summarizeRisk(sortedIssues.reduce((total, issue) => total + severityWeight(issue.severity), 0), mode);

  return {
    riskLevel,
    summary:
      sortedIssues.length === 0
        ? "当前正文已具备基本的信息增益和锚点配比。"
        : `检测到 ${sortedIssues.length} 个信息密度缺口，优先补 ${sortedIssues[0]?.dimension === "factAnchor" ? "事实锚点" : sortedIssues[0]?.dimension === "judgementAnchor" ? "判断锚点" : sortedIssues[0]?.dimension === "counterEvidence" ? "反证边界" : sortedIssues[0]?.dimension === "sceneAnchor" ? "场景锚点" : sortedIssues[0]?.dimension === "timeline" ? "时间脉络" : sortedIssues[0]?.dimension === "comparison" ? "横向比较" : "交汇洞察"}。`,
    issues: sortedIssues,
    correctionHint: sortedIssues[0]?.suggestion ?? null,
    signals: {
      factAnchorHits,
      judgementAnchorHits,
      counterEvidenceHits,
      sceneAnchorHits,
      timelineSignalHits,
      comparisonSignalHits,
      insightSignalHits,
      researchTimelineCount,
      researchComparisonCount,
      researchInsightCount,
      knowledgeCardCount: knowledgeCards.length,
      historyReferenceCount: historyReferences.length,
    },
  } satisfies InformationGainAuditResult;
}
