type PublishGuardCheckLike = {
  key: string;
  label: string;
  status: "passed" | "warning" | "blocked";
  detail: string;
  targetStageCode?: string;
  actionLabel?: string;
};

export type PublishMethodologyGate = {
  code: "researchSufficiency" | "evidencePackage" | "hookCoverage" | "fourPointAudit" | "languageGuard" | "archetypeRhythmConsistency";
  label: string;
  status: "passed" | "warning" | "blocked";
  detail: string;
  targetStageCode?: string;
  actionLabel?: string;
};

const GATE_DEFINITIONS: Array<{
  code: PublishMethodologyGate["code"];
  label: string;
  keys: string[];
  fallback: Omit<PublishMethodologyGate, "code" | "label">;
}> = [
  {
    code: "researchSufficiency",
    label: "研究充分性",
    keys: ["researchSourceCoverage", "researchHollowRisk", "researchBrief"],
    fallback: {
      status: "warning",
      detail: "研究简报还没形成完整信源覆盖，建议先补齐五维信源与交汇洞察。",
      targetStageCode: "researchBrief",
      actionLabel: "去补研究",
    },
  },
  {
    code: "evidencePackage",
    label: "证据最小包",
    keys: ["evidencePackage"],
    fallback: {
      status: "warning",
      detail: "证据最小包还没确认，发布前至少补到 3 条证据并覆盖外部来源。",
      targetStageCode: "evidence",
      actionLabel: "去补证据包",
    },
  },
  {
    code: "hookCoverage",
    label: "爆点覆盖度",
    keys: ["hookCoverage"],
    fallback: {
      status: "warning",
      detail: "爆点覆盖度还没达标，至少要覆盖 2 类 hook 标签。",
      targetStageCode: "evidence",
      actionLabel: "去补爆点标签",
    },
  },
  {
    code: "fourPointAudit",
    label: "策略卡四元强度",
    keys: ["fourPointAudit"],
    fallback: {
      status: "warning",
      detail: "四元强度还没确认，先补齐认知翻转、读者快照、核心张力和发力方向。",
      targetStageCode: "audienceAnalysis",
      actionLabel: "去补四元强度",
    },
  },
  {
    code: "languageGuard",
    label: "语言守卫",
    keys: ["language_guard"],
    fallback: {
      status: "passed",
      detail: "当前未命中语言守卫规则。",
    },
  },
  {
    code: "archetypeRhythmConsistency",
    label: "原型节奏一致性",
    keys: ["archetypeRhythmConsistency"],
    fallback: {
      status: "warning",
      detail: "原型节奏还没完成校准，建议先让执行卡和策略原型对齐。",
      targetStageCode: "deepWriting",
      actionLabel: "去校准执行卡",
    },
  },
];

function getStatusPriority(status: PublishGuardCheckLike["status"]) {
  if (status === "blocked") return 2;
  if (status === "warning") return 1;
  return 0;
}

function pickRepresentativeCheck(checks: PublishGuardCheckLike[]) {
  if (checks.length === 0) {
    return null;
  }
  return checks
    .slice()
    .sort((left, right) => {
      const priorityDelta = getStatusPriority(right.status) - getStatusPriority(left.status);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return Number(Boolean(right.actionLabel)) - Number(Boolean(left.actionLabel));
    })[0] ?? null;
}

export function buildPublishMethodologyGates(checks: PublishGuardCheckLike[]) {
  const checkLookup = new Map(checks.map((check) => [check.key, check] as const));
  return GATE_DEFINITIONS.map((gate) => {
    const matchedChecks = gate.keys
      .map((key) => checkLookup.get(key))
      .filter((check): check is PublishGuardCheckLike => Boolean(check));
    const representative = pickRepresentativeCheck(matchedChecks);
    if (!representative) {
      return {
        code: gate.code,
        label: gate.label,
        ...gate.fallback,
      } satisfies PublishMethodologyGate;
    }
    return {
      code: gate.code,
      label: gate.label,
      status: representative.status,
      detail: representative.detail,
      targetStageCode: representative.targetStageCode,
      actionLabel: representative.actionLabel,
    } satisfies PublishMethodologyGate;
  });
}
