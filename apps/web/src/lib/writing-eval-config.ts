export const WRITING_EVAL_AGENT_STRATEGY_PRESETS = [
  {
    code: "default",
    label: "常规巡检",
    description: "默认离线评测 lane，用于持续跑基线对比与常规实验。",
    recommendedPriority: 100,
    includeInScheduler: true,
  },
  {
    code: "title_lab",
    label: "标题实验",
    description: "优先推进标题点击力和开头 hook 的快节奏实验。",
    recommendedPriority: 180,
    includeInScheduler: true,
  },
  {
    code: "calibration",
    label: "回流校准",
    description: "优先处理线上反馈校准与评分画像修正实验。",
    recommendedPriority: 220,
    includeInScheduler: true,
  },
  {
    code: "regression_guard",
    label: "回归守卫",
    description: "用于高风险回归检查，优先保证质量和事实边界不退化。",
    recommendedPriority: 260,
    includeInScheduler: true,
  },
  {
    code: "rollout_watch",
    label: "灰度观察",
    description: "围绕灰度版本做观测、复核和谨慎放量前的守卫实验。",
    recommendedPriority: 240,
    includeInScheduler: true,
  },
] as const;

export type WritingEvalAgentStrategyPreset = (typeof WRITING_EVAL_AGENT_STRATEGY_PRESETS)[number];

export function normalizeWritingEvalAgentStrategyCode(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9:_-]/g, "");
  return normalized || "default";
}

export function getWritingEvalAgentStrategyPreset(value: string | null | undefined) {
  const normalized = normalizeWritingEvalAgentStrategyCode(value);
  return WRITING_EVAL_AGENT_STRATEGY_PRESETS.find((item) => item.code === normalized) ?? null;
}

export function getWritingEvalAgentStrategyLabel(value: string | null | undefined) {
  const preset = getWritingEvalAgentStrategyPreset(value);
  return preset ? preset.label : normalizeWritingEvalAgentStrategyCode(value);
}

export function getDefaultWritingEvalAgentStrategies() {
  return WRITING_EVAL_AGENT_STRATEGY_PRESETS.filter((item) => item.includeInScheduler).map((item) => item.code);
}
