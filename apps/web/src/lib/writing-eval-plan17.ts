export const WRITING_EVAL_TASK_TYPE_OPTIONS = [
  "tech_commentary",
  "business_breakdown",
  "experience_recap",
  "series_observation",
  "topic_fission",
  "strategy_strength_audit",
  "evidence_hook_tagging",
  "rhythm_consistency",
] as const;

export type WritingEvalTaskType = (typeof WRITING_EVAL_TASK_TYPE_OPTIONS)[number];

export const PLAN17_PROMPT_SCENE_DEFINITIONS = [
  {
    promptId: "topicFission.regularity",
    label: "规律裂变",
    groupLabel: "选题裂变",
    datasetFocusKey: "topic_fission" as const,
  },
  {
    promptId: "topicFission.contrast",
    label: "差异化角度",
    groupLabel: "选题裂变",
    datasetFocusKey: "topic_fission" as const,
  },
  {
    promptId: "topicFission.crossDomain",
    label: "跨赛道迁移",
    groupLabel: "选题裂变",
    datasetFocusKey: "topic_fission" as const,
  },
  {
    promptId: "strategyCard.autoDraft",
    label: "策略卡自动初稿",
    groupLabel: "策略卡",
    datasetFocusKey: "strategy_strength" as const,
  },
  {
    promptId: "strategyCard.fourPointAggregate",
    label: "四元聚合",
    groupLabel: "策略卡",
    datasetFocusKey: "strategy_strength" as const,
  },
  {
    promptId: "strategyCard.strengthAudit",
    label: "四元强度自检",
    groupLabel: "策略卡",
    datasetFocusKey: "strategy_strength" as const,
  },
  {
    promptId: "strategyCard.reverseWriteback",
    label: "反写回底层字段",
    groupLabel: "策略卡",
    datasetFocusKey: "strategy_strength" as const,
  },
  {
    promptId: "evidenceHookTagging",
    label: "证据爆点自动标注",
    groupLabel: "证据爆点",
    datasetFocusKey: "evidence_hook" as const,
  },
  {
    promptId: "styleDna.crossCheck",
    label: "多篇风格交叉比对",
    groupLabel: "风格 DNA",
    datasetFocusKey: null,
  },
  {
    promptId: "publishGate.rhythmConsistency",
    label: "原型节奏一致性",
    groupLabel: "发布前总控",
    datasetFocusKey: "rhythm_consistency" as const,
  },
] as const;

export type Plan17PromptSceneDefinition = (typeof PLAN17_PROMPT_SCENE_DEFINITIONS)[number];

const WRITING_EVAL_TASK_TYPE_LABELS: Record<string, string> = {
  tech_commentary: "技术评论",
  business_breakdown: "商业拆解",
  experience_recap: "经验复盘",
  series_observation: "系列观察",
  topic_fission: "选题裂变",
  strategy_strength_audit: "策略强度审计",
  evidence_hook_tagging: "证据爆点标注",
  rhythm_consistency: "原型节奏一致性",
};

export type WritingEvalDatasetFocusKey =
  | "general"
  | "topic_fission"
  | "strategy_strength"
  | "evidence_hook"
  | "rhythm_consistency";

type DatasetFocusDefinition = {
  key: WritingEvalDatasetFocusKey;
  label: string;
  description: string;
  promptIds: string[];
  recommendedSourceTypes: Array<"article" | "knowledge_card" | "topic_item" | "fragment">;
  targetTaskTypes: string[];
  createPreset?: {
    code: string;
    name: string;
    description: string;
    status: "draft" | "active" | "archived";
  };
  matchers: string[];
};

const DATASET_FOCUS_DEFINITIONS: DatasetFocusDefinition[] = [
  {
    key: "topic_fission",
    label: "选题裂变评测",
    description: "围绕 topicFission 三场景收集离线样本，用于规律裂变、差异化和跨赛道迁移实验。",
    promptIds: ["topicFission.regularity", "topicFission.contrast", "topicFission.crossDomain"],
    recommendedSourceTypes: ["topic_item"],
    targetTaskTypes: ["topic_fission"],
    createPreset: {
      code: "plan17-topic-fission-v1",
      name: "Plan17 · Topic Fission",
      description: "用于 topicFission.regularity / contrast / crossDomain 的离线评测集，优先导入主题档案样本。",
      status: "draft",
    },
    matchers: ["topic-fission", "topic_fission", "选题裂变", "topicfission"],
  },
  {
    key: "strategy_strength",
    label: "策略强度评测",
    description: "覆盖策略卡四元聚合、强度审计和反写回底层字段的离线回归。",
    promptIds: ["strategyCard.fourPointAggregate", "strategyCard.strengthAudit", "strategyCard.reverseWriteback"],
    recommendedSourceTypes: ["article", "topic_item", "knowledge_card"],
    targetTaskTypes: ["strategy_strength_audit"],
    createPreset: {
      code: "plan17-strategy-strength-v1",
      name: "Plan17 · Strategy Strength",
      description: "用于 strategyCard.fourPointAggregate / strengthAudit / reverseWriteback 的离线评测集。",
      status: "draft",
    },
    matchers: ["strategy-strength", "strategy_strength", "四元强度", "策略强度", "strengthaudit", "strength-audit"],
  },
  {
    key: "evidence_hook",
    label: "证据爆点评测",
    description: "围绕 evidenceHookTagging 的标签召回与强度判断建立独立评测桶。",
    promptIds: ["evidenceHookTagging"],
    recommendedSourceTypes: ["fragment"],
    targetTaskTypes: ["evidence_hook_tagging"],
    createPreset: {
      code: "plan17-evidence-hook-v1",
      name: "Plan17 · Evidence Hook Tagging",
      description: "用于 evidenceHookTagging 的离线评测集，优先导入素材与截图片段。",
      status: "draft",
    },
    matchers: ["evidence-hook", "evidence_hook", "爆点标注", "证据爆点", "hooktagging", "evidencehooktagging"],
  },
  {
    key: "rhythm_consistency",
    label: "原型节奏评测",
    description: "围绕 publishGate.rhythmConsistency 校验策略原型与执行卡节奏是否一致。",
    promptIds: ["publishGate.rhythmConsistency"],
    recommendedSourceTypes: ["article"],
    targetTaskTypes: ["rhythm_consistency"],
    createPreset: {
      code: "plan17-rhythm-consistency-v1",
      name: "Plan17 · Rhythm Consistency",
      description: "用于 publishGate.rhythmConsistency 的离线评测集，优先导入历史稿件样本。",
      status: "draft",
    },
    matchers: ["rhythm-consistency", "rhythm_consistency", "节奏一致性", "原型节奏", "publishgate.rhythmconsistency"],
  },
];

const DATASET_FOCUS_DEFINITION_MAP = new Map(
  DATASET_FOCUS_DEFINITIONS.map((definition) => [definition.key, definition]),
);

function buildDatasetSearchText(input: {
  code?: string | null;
  name?: string | null;
  description?: string | null;
}) {
  return [input.code, input.name, input.description]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();
}

export function getWritingEvalTaskTypeLabel(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return WRITING_EVAL_TASK_TYPE_LABELS[normalized] ?? (normalized || "未命名类型");
}

export function inferWritingEvalDatasetFocus(input: {
  code?: string | null;
  name?: string | null;
  description?: string | null;
}) {
  const haystack = buildDatasetSearchText(input);
  const matched = DATASET_FOCUS_DEFINITIONS.find((definition) =>
    definition.matchers.some((matcher) => haystack.includes(matcher)),
  );
  if (matched) {
    return {
      key: matched.key,
      label: matched.label,
      description: matched.description,
      promptIds: matched.promptIds,
      recommendedSourceTypes: matched.recommendedSourceTypes,
      targetTaskTypes: matched.targetTaskTypes,
    };
  }
  return {
    key: "general" as const,
    label: "全文评测",
    description: "默认全文写作评测桶，覆盖标题、开头、传播目标和事实素材的综合质量。",
    promptIds: [],
    recommendedSourceTypes: ["article", "knowledge_card", "topic_item", "fragment"],
    targetTaskTypes: ["tech_commentary", "business_breakdown", "experience_recap", "series_observation"],
  };
}

export function getWritingEvalDatasetCreatePresets() {
  return DATASET_FOCUS_DEFINITIONS
    .filter((definition): definition is DatasetFocusDefinition & { createPreset: NonNullable<DatasetFocusDefinition["createPreset"]> } => Boolean(definition.createPreset))
    .map((definition) => ({
      ...definition.createPreset,
      key: definition.key,
      label: definition.label,
      promptIds: definition.promptIds,
      recommendedSourceTypes: definition.recommendedSourceTypes,
      targetTaskTypes: definition.targetTaskTypes,
    }));
}

export function getWritingEvalDatasetFocusMeta(
  key: WritingEvalDatasetFocusKey | null | undefined,
) {
  return DATASET_FOCUS_DEFINITION_MAP.get(key ?? "general") ?? null;
}

export function getPlan17PromptSceneMeta(promptId: string | null | undefined) {
  const normalized = String(promptId || "").trim();
  return PLAN17_PROMPT_SCENE_DEFINITIONS.find((definition) => definition.promptId === normalized) ?? null;
}

export function resolveWritingEvalTaskTypeForDatasetFocus(input: {
  datasetFocusKey?: WritingEvalDatasetFocusKey | null;
  baseTaskType: string;
  sourceType?: string | null;
}) {
  const datasetFocusKey = input.datasetFocusKey ?? "general";
  const sourceType = String(input.sourceType || "").trim();
  if (datasetFocusKey === "topic_fission" && sourceType === "topic_item") {
    return "topic_fission";
  }
  if (datasetFocusKey === "strategy_strength" && (sourceType === "article" || sourceType === "knowledge_card" || sourceType === "topic_item")) {
    return "strategy_strength_audit";
  }
  if (datasetFocusKey === "evidence_hook" && sourceType === "fragment") {
    return "evidence_hook_tagging";
  }
  if (datasetFocusKey === "rhythm_consistency" && sourceType === "article") {
    return "rhythm_consistency";
  }
  return input.baseTaskType;
}

export function getWritingEvalImportFocusBoost(input: {
  datasetFocusKey?: WritingEvalDatasetFocusKey | null;
  candidateSourceType: string;
  candidateTaskType: string;
}) {
  const focus = input.datasetFocusKey ?? "general";
  if (focus === "general") return { score: 0, reasons: [] as string[] };
  const meta = inferWritingEvalDatasetFocus({ code: focus });
  let score = 0;
  const reasons: string[] = [];
  if (meta.recommendedSourceTypes.includes(input.candidateSourceType as "article" | "knowledge_card" | "topic_item" | "fragment")) {
    score += 24;
    reasons.push(`匹配 ${meta.label} 的推荐来源`);
  }
  if (meta.targetTaskTypes.includes(input.candidateTaskType)) {
    score += 18;
    reasons.push(`匹配 ${meta.label} 的目标题型`);
  }
  return { score, reasons };
}
