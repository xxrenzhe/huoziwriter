type PersonaAuditDimension = "stance" | "audience" | "rhetoricalPosture" | "tone";
type PersonaAuditSeverity = "low" | "medium" | "high";

type PersonaAuditPersonaContext = {
  name: string;
  summary?: string | null;
  writingStyleTags: string[];
  argumentPreferences?: string[];
  toneConstraints?: string[];
  audienceHints?: string[];
};

type PersonaAuditStrategyContext = {
  targetReader?: string | null;
};

export type PersonaConsistencyAuditIssue = {
  dimension: PersonaAuditDimension;
  severity: PersonaAuditSeverity;
  reason: string;
  suggestion: string;
};

export type PersonaConsistencyAuditResult = {
  riskLevel: PersonaAuditSeverity;
  summary: string;
  issues: PersonaConsistencyAuditIssue[];
  correctionHint: string | null;
  signals: {
    genericStructureHits: number;
    tutorialHits: number;
    judgementHits: number;
    broadAudienceHits: number;
    exclamationHits: number;
    absoluteToneHits: number;
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

function hasTag(values: string[] | undefined, pattern: RegExp) {
  return (values ?? []).some((value) => pattern.test(String(value || "").trim()));
}

function severityWeight(severity: PersonaAuditSeverity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function summarizeRisk(totalWeight: number) {
  if (totalWeight >= 5) return "high" as const;
  if (totalWeight >= 2) return "medium" as const;
  return "low" as const;
}

export function auditPersonaConsistency(input: {
  title: string;
  markdown: string;
  persona?: PersonaAuditPersonaContext | null;
  strategyCard?: PersonaAuditStrategyContext | null;
}) {
  if (!input.persona) {
    return null;
  }

  const plain = stripMarkdown(`${input.title}\n${input.markdown}`);
  if (!plain) {
    return {
      riskLevel: "low",
      summary: "暂无可审校正文。",
      issues: [],
      correctionHint: null,
      signals: {
        genericStructureHits: 0,
        tutorialHits: 0,
        judgementHits: 0,
        broadAudienceHits: 0,
        exclamationHits: 0,
        absoluteToneHits: 0,
      },
    } satisfies PersonaConsistencyAuditResult;
  }

  const genericStructureHits = countMatches(plain, /(首先|其次|再次|最后|总之|综上|下面|本文将|让我们|一方面|另一方面|第一[，、]|第二[，、]|第三[，、])/g);
  const tutorialHits = countMatches(plain, /(你应该|你可以|建议你|需要你|可以通过|步骤|教程|方法如下|总结一下|记住一点)/g);
  const judgementHits = countMatches(plain, /(我的判断是|我更想说|我更在意的是|真正的问题是|关键在于|说白了|坦白讲|我不认为|我更倾向于|我后来发现|我见过)/g);
  const broadAudienceHits = countMatches(plain, /(所有人|每个人|任何人|大家都|普通人|小白都能|适合所有人)/g);
  const exclamationHits = countMatches(plain, /[!！]/g);
  const absoluteToneHits = countMatches(plain, /(一定|绝对|注定|彻底|完全|唯一|所有)/g);

  const issues: PersonaConsistencyAuditIssue[] = [];
  const wantsJudgement =
    hasTag(input.persona.argumentPreferences, /(先判断|先下判断|先给结论|立场|判断)/)
    || hasTag(input.persona.writingStyleTags, /(评论|观点|判断|犀利|批评)/)
    || /(判断|观点|评论)/.test(String(input.persona.summary || ""));
  const expectsRestrainedTone = hasTag(input.persona.toneConstraints, /(克制|冷静|不煽情|不夸张|少喊口号|平实)/);
  const hasAudienceTarget = Boolean(input.strategyCard?.targetReader) || (input.persona.audienceHints?.length ?? 0) > 0;

  if (wantsJudgement && judgementHits === 0 && genericStructureHits + tutorialHits >= 2) {
    issues.push({
      dimension: "stance",
      severity: genericStructureHits + tutorialHits >= 4 ? "high" : "medium",
      reason: "正文更像通用说明或教程，没有先站在作者惯常判断位发言。",
      suggestion: "开头先给作者判断，再用 1-2 个素材承接，不要先铺概念或步骤。",
    });
  }

  if (hasAudienceTarget && broadAudienceHits >= 2) {
    issues.push({
      dimension: "audience",
      severity: "medium",
      reason: "正文把读者描述得过宽，容易冲淡既定受众处境。",
      suggestion: "把“大家/所有人”收回到目标读者处境，用一个具体场景替换泛称。",
    });
  }

  if (genericStructureHits + tutorialHits >= 3) {
    issues.push({
      dimension: "rhetoricalPosture",
      severity: genericStructureHits + tutorialHits >= 5 ? "high" : "medium",
      reason: "出现较多施工词和教程腔，容易漂到通用 AI 说明文。",
      suggestion: "删掉“首先/其次/最后/本文将”等施工词，把段落入口改成后果、矛盾或判断。",
    });
  }

  if (expectsRestrainedTone && (exclamationHits >= 2 || absoluteToneHits >= 4)) {
    issues.push({
      dimension: "tone",
      severity: exclamationHits >= 4 || absoluteToneHits >= 6 ? "high" : "medium",
      reason: "语气偏热或过度绝对化，和人设要求的克制表达不一致。",
      suggestion: "压低感叹和绝对化措辞，把结论收回到可验证、可讨论的判断强度。",
    });
  }

  const sortedIssues = issues.sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
  const riskLevel = summarizeRisk(sortedIssues.reduce((total, issue) => total + severityWeight(issue.severity), 0));

  return {
    riskLevel,
    summary:
      sortedIssues.length === 0
        ? `当前正文仍基本贴合「${input.persona.name}」的人设口径。`
        : `检测到 ${sortedIssues.length} 个可能的人设漂移点，优先处理${sortedIssues[0]?.dimension === "rhetoricalPosture" ? "表达姿态" : sortedIssues[0]?.dimension === "stance" ? "立场" : sortedIssues[0]?.dimension === "audience" ? "受众" : "语气"}问题。`,
    issues: sortedIssues,
    correctionHint: sortedIssues[0]?.suggestion ?? null,
    signals: {
      genericStructureHits,
      tutorialHits,
      judgementHits,
      broadAudienceHits,
      exclamationHits,
      absoluteToneHits,
    },
  } satisfies PersonaConsistencyAuditResult;
}
