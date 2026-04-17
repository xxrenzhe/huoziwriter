"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";

type RolloutAssetType = "prompt_version" | "layout_strategy" | "apply_command_template" | "scoring_profile";
type RolloutAutoMode = "manual" | "recommendation";

type RolloutStats = {
  uniqueUserCount: number;
  totalHitCount: number;
  lastHitAt: string | null;
  observeUserCount: number;
  planUserCount: number;
  percentageUserCount: number;
  stableUserCount: number;
};

type RolloutConfig = {
  assetType: RolloutAssetType;
  assetRef: string;
  autoMode: RolloutAutoMode;
  rolloutObserveOnly: boolean;
  rolloutPercentage: number;
  rolloutPlanCodes: string[];
  isEnabled: boolean;
  notes: string | null;
  stats: RolloutStats | null;
};

type RolloutFormState = {
  isEnabled: boolean;
  autoMode: RolloutAutoMode;
  rolloutObserveOnly: boolean;
  rolloutPercentage: string;
  rolloutPlanCodes: string;
  notes: string;
};

type RolloutAuditLog = {
  id: number;
  action: string;
  managementAction: string;
  createdAt: string;
  username: string | null;
  reason: string | null;
  riskLevel: string;
  cooldownSkipped: boolean;
  changes: string[];
  previousConfig: Record<string, unknown>;
  nextConfig: Record<string, unknown>;
  signals: {
    feedbackCount: number | null;
    uniqueUsers: number | null;
    totalHitCount: number | null;
    deltaTotalScore: number | null;
    observedViralScore: number | null;
    openRate: number | null;
    readCompletionRate: number | null;
  };
};

type PromptRolloutAssessment = {
  promptId: string;
  version: string;
  ref: string;
  hasLedger: boolean;
  ledgerDecision: string | null;
  sourceVersion: string | null;
  runId: number | null;
  deltaTotalScore: number | null;
  failedCaseCount: number;
  feedbackCount: number;
  observedViralScore: number | null;
  openRate: number | null;
  readCompletionRate: number | null;
  shareRate: number | null;
  favoriteRate: number | null;
  uniqueUsers: number;
  totalHitCount: number;
  lastHitAt: string | null;
};

type VersionItem = {
  id: number;
  versionType: string;
  targetKey: string;
  sourceVersion: string;
  candidateContent: string;
  scoreSummary: Record<string, unknown>;
  decision: string;
  decisionReason: string | null;
  approvedBy: number | null;
  createdAt: string;
  sourcePreview: string | null;
  candidatePreview: string | null;
  sourceLabel: string;
  candidateLabel: string;
  rolloutStats: RolloutStats | null;
  rolloutConfig: RolloutConfig | null;
  rolloutAuditLogs: RolloutAuditLog[];
  promptRolloutConfig: RolloutConfig | null;
  promptRolloutAssessment: PromptRolloutAssessment | null;
  promptRolloutAuditLogs: RolloutAuditLog[];
  feedbackSummary: {
    feedbackCount: number;
    averageObservedViralScore: number | null;
    averageOpenRate: number | null;
    averageReadCompletionRate: number | null;
    averageShareRate: number | null;
    averageFavoriteRate: number | null;
  } | null;
  realOutcomeSummary: {
    feedbackCount: number;
    averageObservedViralScore: number | null;
    averagePredictedViralScore: number | null;
    averageCalibrationGap: number | null;
    averageOpenRate: number | null;
    averageReadCompletionRate: number | null;
    averageShareRate: number | null;
    averageFavoriteRate: number | null;
  } | null;
  experimentSource: {
    runId: number | null;
    runCode: string | null;
    datasetId: number | null;
    datasetName: string | null;
    status: string | null;
    createdAt: string | null;
    baseVersionRef: string | null;
    candidateVersionRef: string | null;
    recommendation: string | null;
    recommendationReason: string | null;
  } | null;
  isCurrentActive: boolean | null;
};

const ROLLOUT_VERSION_TYPES: RolloutAssetType[] = ["prompt_version", "layout_strategy", "apply_command_template", "scoring_profile"];

type RolloutAdvisory = {
  tone: "emerald" | "amber" | "cinnabar" | "stone";
  headline: string;
  summary: string;
  reasons: string[];
  nextSteps: string[];
};

type RolloutPreset = {
  label: string;
  description: string;
  form: Partial<RolloutFormState>;
};

type RolloutAdmission = {
  canEnable: boolean;
  blockers: string[];
};

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMetric(value: number | null | undefined, suffix = "", digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits)}${suffix}`;
}

function buildPromptPageHref(candidateRef: string, fallbackPromptId?: string | null) {
  const trimmed = String(candidateRef || "").trim();
  if (!trimmed.includes("@")) {
    return fallbackPromptId ? `/ops/prompts?promptId=${encodeURIComponent(fallbackPromptId)}&version=${encodeURIComponent(trimmed)}` : null;
  }
  const [promptId, version] = trimmed.split("@", 2);
  if (!promptId || !version) return null;
  return `/ops/prompts?promptId=${encodeURIComponent(promptId)}&version=${encodeURIComponent(version)}`;
}

function getRolloutRiskTone(value: string) {
  if (value === "emerald") return "border-emerald-800 bg-[#102017] text-emerald-400";
  if (value === "cinnabar") return "border-cinnabar bg-[#231514] text-cinnabar";
  if (value === "amber") return "border-amber-800 bg-[#221b10] text-amber-300";
  return "border-stone-800 bg-[#141414] text-stone-400";
}

function getRolloutManageActionLabel(value: string, cooldownSkipped = false) {
  if (cooldownSkipped || value === "cooldown_skip") return "冷却跳过";
  if (value === "apply") return "已自动调整";
  if (value === "noop") return "维持不变";
  return "自动审计";
}

function getRolloutManageActionTone(value: string, cooldownSkipped = false) {
  if (cooldownSkipped || value === "cooldown_skip") return "border-stone-700 text-stone-400";
  if (value === "apply") return "border-emerald-800 text-emerald-400";
  if (value === "noop") return "border-amber-800 text-amber-300";
  return "border-stone-700 text-stone-400";
}

function formatRolloutConfigSummary(value: Record<string, unknown>) {
  const enabled = Boolean(value.isEnabled);
  const observeOnly = Boolean(value.rolloutObserveOnly);
  const percentage = typeof value.rolloutPercentage === "number" ? value.rolloutPercentage : Number(value.rolloutPercentage ?? 0);
  return `${enabled ? "启用" : "关闭"} · ${observeOnly ? "观察优先" : "公开灰度"} · ${Number.isFinite(percentage) ? Math.round(percentage) : 0}%`;
}

function isRolloutVersionType(value: string): value is RolloutAssetType {
  return ROLLOUT_VERSION_TYPES.includes(value as RolloutAssetType);
}

function getVersionTypeLabel(versionType: string) {
  if (versionType === "layout_strategy") return "layout_strategy（风格策略）";
  return versionType;
}

function buildRolloutFormState(version: VersionItem | null): RolloutFormState {
  return {
    isEnabled: Boolean(version?.rolloutConfig?.isEnabled),
    autoMode: version?.rolloutConfig?.autoMode ?? "manual",
    rolloutObserveOnly: Boolean(version?.rolloutConfig?.rolloutObserveOnly),
    rolloutPercentage: String(version?.rolloutConfig?.rolloutPercentage ?? 0),
    rolloutPlanCodes: version?.rolloutConfig?.rolloutPlanCodes.join(", ") ?? "",
    notes: version?.rolloutConfig?.notes ?? "",
  };
}

function getPrimaryFeedbackSummary(version: VersionItem | null) {
  if (!version) return null;
  return version.realOutcomeSummary;
}

function getFeedbackSummaryLabel(version: VersionItem | null) {
  return version ? "真实回流" : "回流";
}

function normalizePlanCodes(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function toStatusLabel(version: VersionItem) {
  if (isRolloutVersionType(version.versionType)) {
    if (version.versionType === "prompt_version" && version.isCurrentActive) {
      return "active";
    }
    const suffix = version.rolloutConfig?.autoMode === "recommendation" ? " / auto" : " / manual";
    return `${version.rolloutConfig?.isEnabled ? "rollout-enabled" : "rollout-disabled"}${suffix}`;
  }
  if (version.isCurrentActive === null) {
    return "--";
  }
  return version.isCurrentActive ? "active" : "inactive";
}

function buildRolloutAdvisory(version: VersionItem | null): RolloutAdvisory | null {
  if (!version || !isRolloutVersionType(version.versionType)) {
    return null;
  }
  const rolloutEnabled = Boolean(version.rolloutConfig?.isEnabled);
  const rolloutObserveOnly = Boolean(version.rolloutConfig?.rolloutObserveOnly);
  const totalHits = version.rolloutStats?.totalHitCount ?? 0;
  const uniqueUsers = version.rolloutStats?.uniqueUserCount ?? 0;
  const feedbackSummary = getPrimaryFeedbackSummary(version);
  const feedbackCount = feedbackSummary?.feedbackCount ?? 0;
  const observedViral = feedbackSummary?.averageObservedViralScore ?? null;
  const openRate = feedbackSummary?.averageOpenRate ?? null;
  const readCompletionRate = feedbackSummary?.averageReadCompletionRate ?? null;
  const shareRate = feedbackSummary?.averageShareRate ?? null;
  const deltaTotalScore = getNumber(version.scoreSummary.deltaTotalScore);
  const failedCaseCount = getNumber(version.scoreSummary.failedCaseCount) ?? 0;
  const reasons: string[] = [];
  const nextSteps: string[] = [];

  if (!rolloutEnabled) {
    return {
      tone: "stone",
      headline: "尚未启用灰度",
      summary: "当前版本还没有进入线上观察窗口，先明确灰度目标与观测口径。",
      reasons: [
        "灰度开关未启用，当前只有离线实验结果。",
        `离线总分 Delta ${formatMetric(deltaTotalScore, "", 2)}，失败样本 ${formatMetric(failedCaseCount, "", 0)}。`,
      ],
      nextSteps: ["先用观察流量或白名单套餐开启小流量灰度。", "备注里写清这轮要验证的用户群、窗口期和回滚条件。"],
    };
  }

  if ((deltaTotalScore ?? 0) < 0) {
    reasons.push(`离线总分 Delta 为 ${formatMetric(deltaTotalScore, "", 2)}，候选版本没有稳定优于基线。`);
  }
  if (failedCaseCount >= 3) {
    reasons.push(`失败样本 ${failedCaseCount} 条，说明离线退化仍偏多。`);
  }
  if (feedbackCount >= 3 && observedViral !== null && observedViral < 55) {
    reasons.push(`线上爆款潜力均值仅 ${formatMetric(observedViral, "", 2)}，已低于安全观察线。`);
  }
  if (feedbackCount >= 3 && openRate !== null && openRate < 10) {
    reasons.push(`平均打开率 ${formatMetric(openRate, "%", 1)} 偏低，说明点击侧没有验证通过。`);
  }
  if (feedbackCount >= 3 && readCompletionRate !== null && readCompletionRate < 18) {
    reasons.push(`平均读完率 ${formatMetric(readCompletionRate, "%", 1)} 偏低，正文留存存在风险。`);
  }

  if (reasons.length > 0) {
    nextSteps.push("先暂停扩量，回到 Runs 页核对失败样本与离线退化原因。");
    nextSteps.push("补至少 3 条新的真实回流，再决定是否恢复灰度。");
    if (!rolloutObserveOnly) {
      nextSteps.push("把灰度范围收回到观察流量或白名单套餐，避免继续扩大误伤面。");
    }
    return {
      tone: "cinnabar",
      headline: "建议暂停放量",
      summary: "离线或线上指标已经出现明显风险信号，当前更适合收缩观察面而不是继续扩量。",
      reasons,
      nextSteps,
    };
  }

  if (feedbackCount < 3) {
    return {
      tone: "amber",
      headline: "继续观察，不要急着放量",
      summary: "灰度已经开始，但线上样本还不够，当前判断容易被偶然波动误导。",
      reasons: [
        `当前命中 ${totalHits} 次 / ${uniqueUsers} 人，但只有 ${feedbackCount} 条回流反馈。`,
        `离线总分 Delta ${formatMetric(deltaTotalScore, "", 2)}，仍需要更多真实数据验证。`,
      ],
      nextSteps: [
        "优先补齐打开率、读完率、分享率等真实反馈，再做扩量决策。",
        "把备注写成明确观察窗口，例如 3-5 条回流或 7 天后复盘。",
      ],
    };
  }

  if (uniqueUsers < 20 || totalHits < 50) {
    return {
      tone: "amber",
      headline: "样本偏少，先稳住当前灰度",
      summary: "已有回流，但触达面还小，直接放量会把偶然结果误判成稳定趋势。",
      reasons: [
        `当前仅覆盖 ${uniqueUsers} 位用户 / ${totalHits} 次命中。`,
        `线上均值：爆款 ${formatMetric(observedViral, "", 2)}，打开 ${formatMetric(openRate, "%", 1)}，读完 ${formatMetric(readCompletionRate, "%", 1)}。`,
      ],
      nextSteps: [
        "先把灰度稳定跑到至少 20 位用户、50 次命中以上。",
        "如果当前是观察优先，可先扩到白名单套餐而不是直接放大全量比例。",
      ],
    };
  }

  const strongEnough =
    (deltaTotalScore ?? 0) >= 0 &&
    (observedViral ?? 0) >= 68 &&
    (openRate ?? 0) >= 15 &&
    (readCompletionRate ?? 0) >= 25;

  if (strongEnough) {
    return {
      tone: "emerald",
      headline: "可谨慎放量",
      summary: "离线没有明显退化，线上打开和留存也已进入可扩量区间，可以逐步放大但仍保留回滚阈值。",
      reasons: [
        `离线总分 Delta ${formatMetric(deltaTotalScore, "", 2)}，失败样本 ${formatMetric(failedCaseCount, "", 0)}。`,
        `线上均值：爆款 ${formatMetric(observedViral, "", 2)}，打开 ${formatMetric(openRate, "%", 1)}，读完 ${formatMetric(readCompletionRate, "%", 1)}，分享 ${formatMetric(shareRate, "%", 1)}。`,
      ],
      nextSteps: [
        "优先从观察流量或套餐白名单扩到小比例流量，而不是直接大幅提升百分比。",
        "继续保留一键回滚条件，例如打开率或读完率连续两次跌破当前均值。",
      ],
    };
  }

  return {
    tone: "amber",
    headline: "维持灰度，继续收集样本",
    summary: "线上结果没有明显翻车，但也还不到可以激进放量的程度，继续观察更稳妥。",
    reasons: [
      `线上均值：爆款 ${formatMetric(observedViral, "", 2)}，打开 ${formatMetric(openRate, "%", 1)}，读完 ${formatMetric(readCompletionRate, "%", 1)}。`,
      `当前覆盖 ${uniqueUsers} 位用户 / ${totalHits} 次命中，仍建议继续累积更多稳定样本。`,
    ],
    nextSteps: [
      "先保持当前灰度范围，观察下一轮回流是否继续稳定。",
      "如果目标是放量，优先提升标题点击或正文留存中更弱的一项，再进入下一轮实验。",
    ],
  };
}

function buildRolloutPresets(version: VersionItem | null, advisory: RolloutAdvisory | null): RolloutPreset[] {
  if (!version || !advisory || !isRolloutVersionType(version.versionType)) {
    return [];
  }
  const currentPercentage = Math.max(0, Math.min(100, Math.round(Number(version.rolloutConfig?.rolloutPercentage ?? 0))));
  const observeWindowNote = "观察窗口：重点看打开率、读完率和分享率是否连续稳定。";

  if (advisory.tone === "stone") {
    return [
      {
        label: "小范围观察",
        description: "启用灰度，仅进入观察流量，不直接开放比例流量。",
        form: {
          isEnabled: true,
          rolloutObserveOnly: true,
          rolloutPercentage: "0",
          notes: `推荐方案：小范围观察。\n${observeWindowNote}`,
        },
      },
      {
        label: "5% 试水",
        description: "先开极小比例流量，验证是否值得继续收集反馈。",
        form: {
          isEnabled: true,
          rolloutObserveOnly: false,
          rolloutPercentage: "5",
          notes: `推荐方案：5% 试水。\n${observeWindowNote}`,
        },
      },
    ];
  }

  if (advisory.tone === "cinnabar") {
    return [
      {
        label: "收回观察",
        description: "保留灰度，但只允许观察流量继续命中。",
        form: {
          isEnabled: true,
          rolloutObserveOnly: true,
          rolloutPercentage: "0",
          notes: "推荐方案：收回到观察流量，先处理离线退化或线上风险。",
        },
      },
      {
        label: "暂停灰度",
        description: "直接关闭当前灰度，避免继续扩散风险。",
        form: {
          isEnabled: false,
          rolloutObserveOnly: true,
          rolloutPercentage: "0",
          notes: "推荐方案：暂停灰度，待 Runs 页重新验证后再恢复。",
        },
      },
    ];
  }

  if (advisory.tone === "emerald") {
    return [
      {
        label: `${Math.max(5, currentPercentage || 5)}% 谨慎放量`,
        description: "先小幅扩大比例，继续保留回滚阈值。",
        form: {
          isEnabled: true,
          rolloutObserveOnly: false,
          rolloutPercentage: String(Math.max(5, currentPercentage || 5)),
          notes: "推荐方案：谨慎放量，扩大后继续观察打开率和读完率是否稳定。",
        },
      },
      {
        label: `${Math.max(15, currentPercentage >= 15 ? currentPercentage + 10 : 15)}% 扩量`,
        description: "在已通过观察的前提下，进入下一档比例流量。",
        form: {
          isEnabled: true,
          rolloutObserveOnly: false,
          rolloutPercentage: String(Math.max(15, currentPercentage >= 15 ? currentPercentage + 10 : 15)),
          notes: "推荐方案：进入下一档扩量，同时保留连续异常即回滚的阈值。",
        },
      },
    ];
  }

  return [
    {
      label: "维持当前灰度",
      description: "保留当前观察面，不急于继续放大。",
      form: {
        isEnabled: true,
        rolloutObserveOnly: Boolean(version.rolloutConfig?.rolloutObserveOnly),
        rolloutPercentage: String(currentPercentage),
        notes: "推荐方案：维持当前灰度，继续收集回流样本。",
      },
    },
    {
      label: "观察优先",
      description: "如果不想承担额外风险，先把观察收回到小范围流量。",
      form: {
        isEnabled: true,
        rolloutObserveOnly: true,
        rolloutPercentage: "0",
        notes: "推荐方案：观察优先，先稳住观察窗口再决定是否扩量。",
      },
    },
  ];
}

function buildRolloutAdmission(version: VersionItem | null, advisory: RolloutAdvisory | null, form: RolloutFormState): RolloutAdmission {
  if (!version || !advisory || !isRolloutVersionType(version.versionType) || !form.isEnabled) {
    return { canEnable: true, blockers: [] };
  }
  const blockers: string[] = [];
  const rolloutPercentage = Math.max(0, Math.min(100, Math.round(Number(form.rolloutPercentage || 0))));
  const feedbackCount = getPrimaryFeedbackSummary(version)?.feedbackCount ?? 0;
  const uniqueUsers = version.rolloutStats?.uniqueUserCount ?? 0;
  const totalHits = version.rolloutStats?.totalHitCount ?? 0;

  if (advisory.tone === "cinnabar") {
    blockers.push("当前版本已出现明显风险信号，必须先暂停或收回灰度，不能继续启用放量。");
  }

  if (advisory.tone === "stone" && !form.rolloutObserveOnly && rolloutPercentage > 5) {
    blockers.push("尚未经过首轮线上观察时，首次灰度只允许观察优先或不超过 5% 的试水流量。");
  }

  if (advisory.tone === "amber" && feedbackCount < 3 && !form.rolloutObserveOnly && rolloutPercentage > 10) {
    blockers.push("真实回流不足 3 条前，灰度比例不能超过 10%。");
  }

  if (advisory.tone === "amber" && (uniqueUsers < 20 || totalHits < 50) && !form.rolloutObserveOnly && rolloutPercentage > 20) {
    blockers.push("样本覆盖不足 20 人 / 50 次命中前，不允许把灰度比例提升到 20% 以上。");
  }

  return {
    canEnable: blockers.length === 0,
    blockers,
  };
}

export function OpsWritingEvalVersionsClient({
  initialVersions,
  initialSelectedVersionId,
  focusAsset,
}: {
  initialVersions: VersionItem[];
  initialSelectedVersionId?: number | null;
  focusAsset?: {
    assetType: string;
    assetRef: string;
    matchedCount: number;
    clearHref: string;
  } | null;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [message, setMessage] = useState("");
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(initialSelectedVersionId ?? initialVersions[0]?.id ?? null);
  const [savingRollout, setSavingRollout] = useState(false);
  const displayedVersions = focusAsset
    ? versions.filter((item) => item.versionType === focusAsset.assetType && item.candidateContent === focusAsset.assetRef)
    : versions;
  const focusAssetPromptHref =
    focusAsset?.assetType === "prompt_version" ? buildPromptPageHref(focusAsset.assetRef) : null;
  const selectedVersion = displayedVersions.find((item) => item.id === selectedVersionId) ?? displayedVersions[0] ?? null;
  const selectedRolloutAdvisory = buildRolloutAdvisory(selectedVersion);
  const selectedRolloutPresets = buildRolloutPresets(selectedVersion, selectedRolloutAdvisory);
  const [rolloutForm, setRolloutForm] = useState<RolloutFormState>(() => buildRolloutFormState(selectedVersion));
  const selectedRolloutAdmission = buildRolloutAdmission(selectedVersion, selectedRolloutAdvisory, rolloutForm);
  const selectedRolloutAuditLogs = selectedVersion?.rolloutAuditLogs ?? [];
  const selectedRolloutAuditSummary = {
    applyCount: selectedRolloutAuditLogs.filter((item) => item.managementAction === "apply" && !item.cooldownSkipped).length,
    noopCount: selectedRolloutAuditLogs.filter((item) => item.managementAction === "noop").length,
    cooldownSkipCount: selectedRolloutAuditLogs.filter((item) => item.managementAction === "cooldown_skip" || item.cooldownSkipped).length,
    latestRiskLevel: selectedRolloutAuditLogs[0]?.riskLevel ?? "stone",
  };
  const selectedPromptRolloutConfig = selectedVersion?.promptRolloutConfig ?? null;
  const selectedPromptRolloutAssessment = selectedVersion?.promptRolloutAssessment ?? null;
  const selectedPromptRolloutAuditLogs = selectedVersion?.promptRolloutAuditLogs ?? [];
  const selectedPromptRolloutAuditSummary = {
    applyCount: selectedPromptRolloutAuditLogs.filter((item) => item.managementAction === "apply" && !item.cooldownSkipped).length,
    noopCount: selectedPromptRolloutAuditLogs.filter((item) => item.managementAction === "noop").length,
    cooldownSkipCount: selectedPromptRolloutAuditLogs.filter((item) => item.managementAction === "cooldown_skip" || item.cooldownSkipped).length,
    latestRiskLevel: selectedPromptRolloutAuditLogs[0]?.riskLevel ?? "stone",
  };
  const selectedRolloutRunHref = selectedPromptRolloutAssessment?.runId
    ? `/ops/writing-eval/runs?runId=${selectedPromptRolloutAssessment.runId}`
    : selectedVersion?.experimentSource?.runId
      ? `/ops/writing-eval/runs?runId=${selectedVersion.experimentSource.runId}`
      : null;
  const selectedRolloutDatasetHref = selectedVersion?.experimentSource?.datasetId
    ? `/ops/writing-eval/datasets?datasetId=${selectedVersion.experimentSource.datasetId}`
    : null;
  const selectedRolloutRunLabel =
    selectedRolloutAdvisory?.tone === "cinnabar" || (selectedPromptRolloutAssessment?.failedCaseCount ?? 0) > 0
      ? "回到 Runs 页排查"
      : "打开来源 Run";
  const selectedPromptPageHref = selectedVersion
    ? `/ops/prompts?promptId=${encodeURIComponent(selectedPromptRolloutAssessment?.promptId || selectedVersion.targetKey)}&version=${encodeURIComponent(selectedPromptRolloutAssessment?.version || selectedVersion.candidateLabel)}`
    : null;
  const selectedPromptAssessmentSourceHref = selectedPromptRolloutAssessment?.sourceVersion
    ? buildPromptPageHref(selectedPromptRolloutAssessment.sourceVersion, selectedPromptRolloutAssessment.promptId || selectedVersion?.targetKey)
    : null;
  const selectedSourcePromptPageHref =
    selectedVersion?.versionType === "prompt_version" ? buildPromptPageHref(selectedVersion.sourceVersion, selectedVersion.targetKey) : null;
  const selectedExperimentBasePromptHref = selectedVersion?.experimentSource?.baseVersionRef
    ? buildPromptPageHref(selectedVersion.experimentSource.baseVersionRef)
    : null;
  const selectedExperimentCandidatePromptHref = selectedVersion?.experimentSource?.candidateVersionRef
    ? buildPromptPageHref(selectedVersion.experimentSource.candidateVersionRef)
    : null;
  const selectedExperimentRunHref = selectedVersion?.experimentSource?.runId
    ? `/ops/writing-eval/runs?runId=${selectedVersion.experimentSource.runId}`
    : null;
  const selectedExperimentDatasetHref = selectedVersion?.experimentSource?.datasetId
    ? `/ops/writing-eval/datasets?datasetId=${selectedVersion.experimentSource.datasetId}`
    : null;
  const canEditRollout = Boolean(
    selectedVersion
    && isRolloutVersionType(selectedVersion.versionType)
    && selectedVersion.decision === "keep"
    && !(selectedVersion.versionType === "prompt_version" && selectedVersion.isCurrentActive === true),
  );
  const supportsRolloutNotes = Boolean(selectedVersion && selectedVersion.versionType !== "prompt_version");

  useEffect(() => {
    setRolloutForm(buildRolloutFormState(selectedVersion));
  }, [selectedVersion]);

  useEffect(() => {
    setSelectedVersionId(initialSelectedVersionId ?? displayedVersions[0]?.id ?? initialVersions[0]?.id ?? null);
  }, [initialSelectedVersionId, initialVersions, displayedVersions]);

  function applyRolloutPreset(preset: RolloutPreset) {
    setRolloutForm((prev) => ({
      ...prev,
      ...preset.form,
    }));
    setMessage(`已套用推荐方案：${preset.label}`);
  }

  async function handleRollback(versionId: number) {
    setRollingBackId(versionId);
    setMessage("");
    try {
      const response = await fetch(`/api/ops/writing-eval/versions/${versionId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; data?: { rollbackTarget?: string } };
      if (!response.ok) {
        throw new Error(json.error || "回滚失败");
      }
      setMessage(`已回滚到 ${json.data?.rollbackTarget || "目标版本"}`);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "回滚失败");
    } finally {
      setRollingBackId(null);
    }
  }

  async function handleSaveRollout() {
    if (!selectedVersion || !isRolloutVersionType(selectedVersion.versionType)) {
      return;
    }
    if (!selectedRolloutAdmission.canEnable) {
      setMessage(selectedRolloutAdmission.blockers[0] || "当前灰度配置未通过准入校验");
      return;
    }
    setSavingRollout(true);
    setMessage("");
    try {
      const response = await fetch("/api/ops/writing-eval/rollouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType: selectedVersion.versionType,
          assetRef: selectedVersion.candidateContent,
          autoMode: rolloutForm.autoMode,
          rolloutObserveOnly: rolloutForm.rolloutObserveOnly,
          rolloutPercentage: Number(rolloutForm.rolloutPercentage || 0),
          rolloutPlanCodes: normalizePlanCodes(rolloutForm.rolloutPlanCodes),
          isEnabled: rolloutForm.isEnabled,
          notes: supportsRolloutNotes ? rolloutForm.notes : null,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: {
          assetType: RolloutAssetType;
          assetRef: string;
          autoMode: RolloutAutoMode;
          rolloutObserveOnly: boolean;
          rolloutPercentage: number;
          rolloutPlanCodes: string[];
          isEnabled: boolean;
          notes: string | null;
          stats?: {
            unique_user_count: number;
            total_hit_count: number;
            last_hit_at: string | null;
            observe_user_count: number;
            plan_user_count: number;
            percentage_user_count: number;
            stable_user_count: number;
          } | null;
        } | null;
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error || "保存灰度配置失败");
      }
      const nextRolloutConfig: RolloutConfig = {
        assetType: json.data.assetType,
        assetRef: json.data.assetRef,
        autoMode: json.data.autoMode ?? "manual",
        rolloutObserveOnly: Boolean(json.data.rolloutObserveOnly),
        rolloutPercentage: Number(json.data.rolloutPercentage || 0),
        rolloutPlanCodes: Array.isArray(json.data.rolloutPlanCodes) ? json.data.rolloutPlanCodes : [],
        isEnabled: Boolean(json.data.isEnabled),
        notes: json.data.notes ?? null,
        stats: json.data.stats
          ? {
              uniqueUserCount: json.data.stats.unique_user_count,
              totalHitCount: json.data.stats.total_hit_count,
              lastHitAt: json.data.stats.last_hit_at,
              observeUserCount: json.data.stats.observe_user_count,
              planUserCount: json.data.stats.plan_user_count,
              percentageUserCount: json.data.stats.percentage_user_count,
              stableUserCount: json.data.stats.stable_user_count,
            }
          : null,
      };
      setVersions((prev) =>
        prev.map((item) =>
          item.id === selectedVersion.id
            ? {
                ...item,
                rolloutConfig: nextRolloutConfig,
                rolloutStats:
                  nextRolloutConfig.stats ??
                  item.rolloutStats ??
                  {
                    uniqueUserCount: 0,
                    totalHitCount: 0,
                    lastHitAt: null,
                    observeUserCount: 0,
                    planUserCount: 0,
                    percentageUserCount: 0,
                    stableUserCount: 0,
                  },
              }
            : item,
        ),
      );
      setMessage(`已保存 ${getVersionTypeLabel(selectedVersion.versionType)} 的灰度配置`);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存灰度配置失败");
    } finally {
      setSavingRollout(false);
    }
  }

  return (
    <section className={uiPrimitives.opsPanel + " p-5"}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">Version Ledger</div>
          <h2 className="mt-3 font-serifCn text-2xl text-stone-100">保留、丢弃与回滚记录</h2>
        </div>
        <div className="text-sm text-stone-500">{displayedVersions.length} 条记录</div>
      </div>

      {message ? <div className="mt-4 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">{message}</div> : null}
      {focusAsset ? (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border border-cinnabar bg-[#1d1413] px-4 py-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">资产聚焦模式</div>
            <div className="mt-2 text-sm leading-7 text-stone-200">
              当前只展示 <span className="font-mono">{focusAsset.assetType}</span> · <span className="font-mono">{focusAsset.assetRef}</span> 的版本账本，共 {focusAsset.matchedCount} 条。
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {focusAssetPromptHref ? (
              <Link href={focusAssetPromptHref} className={uiPrimitives.opsSecondaryButton}>
                打开 Prompts 页
              </Link>
            ) : null}
            <Link href={focusAsset.clearHref} className={uiPrimitives.opsSecondaryButton}>
              返回全量账本
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="text-stone-500">
            <tr>
              {["时间", "对象", "来源版本", "目标版本", "决策", "当前状态", "效果信号", "原因", "总分", "操作人", "操作"].map((head) => (
                <th key={head} className="pb-4 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedVersions.map((item) => (
              (() => {
                const advisory = buildRolloutAdvisory(item);
                const primaryFeedbackSummary = getPrimaryFeedbackSummary(item);
                const sourcePromptPageHref = item.versionType === "prompt_version" ? buildPromptPageHref(item.sourceVersion, item.targetKey) : null;
                const promptPageHref = item.versionType === "prompt_version" ? buildPromptPageHref(item.candidateContent, item.targetKey) : null;
                return (
              <tr
                key={item.id}
                className={`cursor-pointer border-t border-stone-800 align-top ${selectedVersionId === item.id ? "bg-[#1d1413]" : ""}`}
                onClick={() => setSelectedVersionId(item.id)}
              >
                <td className="py-4 text-stone-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                <td className="py-4 text-stone-100">
                  {getVersionTypeLabel(item.versionType)} · {item.targetKey}
                </td>
                <td className="py-4 font-mono text-xs text-stone-400">
                  {sourcePromptPageHref ? (
                    <Link href={sourcePromptPageHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                      {item.sourceVersion}
                    </Link>
                  ) : (
                    item.sourceVersion
                  )}
                </td>
                <td className="py-4 font-mono text-xs text-stone-300">
                  {promptPageHref ? (
                    <Link href={promptPageHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                      {item.candidateContent}
                    </Link>
                  ) : (
                    item.candidateContent
                  )}
                </td>
                <td className={`py-4 ${item.decision === "keep" ? "text-emerald-400" : item.decision === "discard" ? "text-cinnabar" : "text-amber-300"}`}>
                  {item.decision}
                </td>
                <td className="py-4 text-stone-400">{toStatusLabel(item)}</td>
                <td className="py-4 text-xs leading-6 text-stone-400">
                  {item.rolloutStats ? (
                    <div>
                      命中 {item.rolloutStats.totalHitCount} 次 / {item.rolloutStats.uniqueUserCount} 人
                      <br />
                      {item.rolloutStats.lastHitAt ? `最近命中 ${new Date(item.rolloutStats.lastHitAt).toLocaleString("zh-CN")}` : "尚无灰度命中"}
                    </div>
                  ) : (
                    <div>暂无灰度统计</div>
                  )}
                  {item.rolloutConfig ? <div className="mt-2 text-stone-600">自动模式：{item.rolloutConfig.autoMode}</div> : null}
                  {primaryFeedbackSummary ? (
                    <div className="mt-2 text-stone-500">
                      {getFeedbackSummaryLabel(item)} {primaryFeedbackSummary.feedbackCount} 条
                      <br />
                      爆款 {formatMetric(primaryFeedbackSummary.averageObservedViralScore, "", 2)} · 打开 {formatMetric(primaryFeedbackSummary.averageOpenRate, "%", 1)}
                    </div>
                  ) : (
                    <div className="mt-2 text-stone-600">暂无回流反馈</div>
                  )}
                  {advisory ? (
                    <div className={`mt-2 ${advisory.tone === "emerald" ? "text-emerald-400" : advisory.tone === "cinnabar" ? "text-cinnabar" : advisory.tone === "amber" ? "text-amber-300" : "text-stone-500"}`}>
                      {advisory.headline}
                    </div>
                  ) : null}
                </td>
                <td className="py-4 text-stone-400">{item.decisionReason || "暂无"}</td>
                <td className="py-4 text-stone-400">
                  {typeof getNumber(item.scoreSummary.totalScore) === "number" ? getNumber(item.scoreSummary.totalScore)?.toFixed(2) : "--"}
                </td>
                <td className="py-4 text-stone-400">{item.approvedBy ?? "--"}</td>
                <td className="py-4">
                  <div className="flex flex-wrap gap-2">
                    {promptPageHref ? (
                      <Link href={promptPageHref} className={uiPrimitives.opsSecondaryButton}>
                        Prompts
                      </Link>
                    ) : null}
                    {item.decision === "keep" ? (
                      <button
                        type="button"
                        onClick={() => void handleRollback(item.id)}
                        className={uiPrimitives.opsSecondaryButton}
                        disabled={rollingBackId === item.id}
                      >
                        {rollingBackId === item.id ? "回滚中..." : "回滚到来源版本"}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-600">不可回滚</span>
                    )}
                  </div>
                </td>
              </tr>
                );
              })()
            ))}
            {displayedVersions.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-6 text-stone-500">
                  {focusAsset ? "当前聚焦资产还没有匹配的版本账本记录。" : "当前还没有版本账本记录。"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="border border-stone-800 bg-stone-950 px-4 py-4 xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">实验来源</div>
              <div className="mt-3 text-sm leading-7 text-stone-400">
                {selectedVersion?.experimentSource ? (
                  <>
                    <div>
                      Run：
                      {selectedExperimentRunHref ? (
                        <Link href={selectedExperimentRunHref} className="ml-1 font-mono text-stone-200 transition hover:text-cinnabar">
                          {selectedVersion.experimentSource.runCode || "--"}
                        </Link>
                      ) : (
                        <span className="ml-1 font-mono text-stone-200">{selectedVersion.experimentSource.runCode || "--"}</span>
                      )}
                      {" · "}
                      数据集：
                      {selectedExperimentDatasetHref ? (
                        <Link href={selectedExperimentDatasetHref} className="ml-1 transition hover:text-cinnabar">
                          {selectedVersion.experimentSource.datasetName || "未知"}
                        </Link>
                      ) : (
                        <span className="ml-1">{selectedVersion.experimentSource.datasetName || "未知"}</span>
                      )}
                      {" · "}
                      状态：{selectedVersion.experimentSource.status || "未知"}
                    </div>
                    <div>
                      基线：
                      {selectedExperimentBasePromptHref ? (
                        <Link href={selectedExperimentBasePromptHref} className="ml-1 transition hover:text-cinnabar">
                          {selectedVersion.experimentSource.baseVersionRef || "--"}
                        </Link>
                      ) : (
                        <span className="ml-1">{selectedVersion.experimentSource.baseVersionRef || "--"}</span>
                      )}
                      {" · "}
                      候选：
                      {selectedExperimentCandidatePromptHref ? (
                        <Link href={selectedExperimentCandidatePromptHref} className="ml-1 transition hover:text-cinnabar">
                          {selectedVersion.experimentSource.candidateVersionRef || "--"}
                        </Link>
                      ) : (
                        <span className="ml-1">{selectedVersion.experimentSource.candidateVersionRef || "--"}</span>
                      )}
                    </div>
                    <div>
                      系统建议：{selectedVersion.experimentSource.recommendation || "暂无"}
                      {selectedVersion.experimentSource.recommendationReason
                        ? ` · ${selectedVersion.experimentSource.recommendationReason}`
                        : ""}
                    </div>
                    <div>
                      运行时间：
                      {selectedVersion.experimentSource.createdAt
                        ? new Date(selectedVersion.experimentSource.createdAt).toLocaleString("zh-CN")
                        : "暂无"}
                    </div>
                  </>
                ) : (
                  <div>当前账本记录缺少对应实验上下文。</div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {selectedExperimentDatasetHref ? (
                <Link href={selectedExperimentDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                  打开评测集
                </Link>
              ) : null}
              {selectedExperimentRunHref ? (
                <Link href={selectedExperimentRunHref} className={uiPrimitives.opsSecondaryButton}>
                  查看对应 Run
                </Link>
              ) : null}
              {selectedExperimentBasePromptHref ? (
                <Link href={selectedExperimentBasePromptHref} className={uiPrimitives.opsSecondaryButton}>
                  打开基线 Prompt
                </Link>
              ) : null}
              {selectedExperimentCandidatePromptHref ? (
                <Link href={selectedExperimentCandidatePromptHref} className={uiPrimitives.opsSecondaryButton}>
                  打开候选 Prompt
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border border-stone-800 bg-stone-950 px-4 py-4 xl:col-span-2">
          <div className="text-xs uppercase tracking-[0.18em] text-stone-500">运营判断</div>
          {selectedRolloutAdvisory ? (
            <div className="mt-4 space-y-4">
              <div className={`border px-4 py-4 ${selectedRolloutAdvisory.tone === "emerald" ? "border-emerald-800 bg-[#102017]" : selectedRolloutAdvisory.tone === "cinnabar" ? "border-cinnabar bg-[#231514]" : selectedRolloutAdvisory.tone === "amber" ? "border-amber-800 bg-[#221b10]" : "border-stone-800 bg-[#141414]"}`}>
                <div className={`text-xs uppercase tracking-[0.18em] ${selectedRolloutAdvisory.tone === "emerald" ? "text-emerald-400" : selectedRolloutAdvisory.tone === "cinnabar" ? "text-cinnabar" : selectedRolloutAdvisory.tone === "amber" ? "text-amber-300" : "text-stone-400"}`}>
                  {selectedRolloutAdvisory.headline}
                </div>
                <div className="mt-3 text-sm leading-7 text-stone-200">{selectedRolloutAdvisory.summary}</div>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">告警依据</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-stone-300">
                    {selectedRolloutAdvisory.reasons.map((reason) => (
                      <div key={reason}>{reason}</div>
                    ))}
                  </div>
                </div>
                <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">下一步建议</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-stone-300">
                    {selectedRolloutAdvisory.nextSteps.map((step) => (
                      <div key={step}>{step}</div>
                    ))}
                  </div>
                </div>
              </div>
              {selectedRolloutRunHref || selectedRolloutDatasetHref ? (
                <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">联动排查</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {selectedRolloutRunHref ? (
                      <Link href={selectedRolloutRunHref} className={uiPrimitives.opsSecondaryButton}>
                        {selectedRolloutRunLabel}
                      </Link>
                    ) : null}
                    {selectedRolloutDatasetHref ? (
                      <Link href={selectedRolloutDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                        打开评测集
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {canEditRollout && selectedRolloutPresets.length > 0 ? (
                <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">推荐灰度方案</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {selectedRolloutPresets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className={uiPrimitives.opsSecondaryButton}
                        onClick={() => applyRolloutPreset(preset)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-stone-400">
                    {selectedRolloutPresets.map((preset) => (
                      <div key={`${preset.label}-desc`}>
                        {preset.label}：{preset.description}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 border border-stone-800 bg-[#141414] px-4 py-4 text-sm text-stone-500">
              当前对象不是支持灰度的实验资产，暂不生成运营告警与放量建议。
            </div>
          )}
        </div>

        <div className="border border-stone-800 bg-stone-950 px-4 py-4 xl:col-span-2">
          <div className="text-xs uppercase tracking-[0.18em] text-stone-500">得分摘要</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "候选总分", value: getNumber(selectedVersion?.scoreSummary.totalScore) },
              { label: "基线总分", value: getNumber(selectedVersion?.scoreSummary.baseTotalScore) },
              { label: "总分 Delta", value: getNumber(selectedVersion?.scoreSummary.deltaTotalScore) },
              { label: "候选质量", value: getNumber(selectedVersion?.scoreSummary.qualityScore) },
              { label: "候选爆款", value: getNumber(selectedVersion?.scoreSummary.viralScore) },
              { label: "失败样本", value: getNumber(selectedVersion?.scoreSummary.failedCaseCount) },
            ].map((item) => (
              <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                <div className={`mt-3 text-2xl ${item.label === "总分 Delta" && (item.value ?? 0) < 0 ? "text-cinnabar" : item.label === "总分 Delta" ? "text-emerald-400" : "text-stone-100"}`}>
                  {item.value === null ? "--" : Number.isInteger(item.value) ? item.value : item.value.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-stone-800 bg-stone-950 px-4 py-4 xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">线上灰度</div>
              <div className="mt-3 text-sm leading-7 text-stone-400">
                {selectedVersion && isRolloutVersionType(selectedVersion.versionType)
                  ? `${getVersionTypeLabel(selectedVersion.versionType)} · ${selectedVersion.candidateContent}`
                  : "仅 prompt_version、layout_strategy（风格策略）、apply_command_template、scoring_profile 支持这里的灰度配置。"}
              </div>
            </div>
            {selectedVersion && isRolloutVersionType(selectedVersion.versionType) ? (
              <div className="flex flex-wrap gap-3">
                {selectedVersion.versionType === "prompt_version" && selectedPromptPageHref ? (
                  <Link href={selectedPromptPageHref} className={uiPrimitives.opsSecondaryButton}>
                    打开 Prompts 页
                  </Link>
                ) : null}
                <button type="button" className={uiPrimitives.opsSecondaryButton} onClick={() => void handleSaveRollout()} disabled={!canEditRollout || savingRollout || !selectedRolloutAdmission.canEnable}>
                  {savingRollout ? "保存中..." : "保存灰度配置"}
                </button>
              </div>
            ) : null}
          </div>

          {selectedVersion && isRolloutVersionType(selectedVersion.versionType) ? (
            canEditRollout ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="flex items-center gap-3 border border-stone-800 bg-[#141414] px-4 py-3 text-sm text-stone-300">
                    <input
                      type="checkbox"
                      checked={rolloutForm.isEnabled}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                    />
                    启用灰度
                  </label>
                  <label className="flex items-center gap-3 border border-stone-800 bg-[#141414] px-4 py-3 text-sm text-stone-300">
                    <input
                      type="checkbox"
                      checked={rolloutForm.rolloutObserveOnly}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, rolloutObserveOnly: event.target.checked }))}
                    />
                    仅观察流量
                  </label>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-stone-500">自动模式</div>
                    <select
                      value={rolloutForm.autoMode}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, autoMode: event.target.value as RolloutAutoMode }))}
                      className={`mt-3 ${uiPrimitives.opsInput}`}
                    >
                      <option value="manual">manual</option>
                      <option value="recommendation">recommendation</option>
                    </select>
                  </div>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-stone-500">命中比例</div>
                    <input
                      value={rolloutForm.rolloutPercentage}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, rolloutPercentage: event.target.value }))}
                      placeholder="0-100"
                      className={`mt-3 ${uiPrimitives.opsInput}`}
                    />
                  </div>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-stone-500">当前观测</div>
                    <div className="mt-3 text-sm leading-7 text-stone-300">
                      {selectedVersion.rolloutStats ? `${selectedVersion.rolloutStats.totalHitCount} 次 / ${selectedVersion.rolloutStats.uniqueUserCount} 人` : "暂无"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-stone-500">套餐白名单</div>
                    <input
                      value={rolloutForm.rolloutPlanCodes}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, rolloutPlanCodes: event.target.value }))}
                      placeholder="pro, ultra"
                      className={`mt-3 ${uiPrimitives.opsInput}`}
                    />
                    <div className="mt-2 text-xs leading-6 text-stone-600">多个套餐用逗号分隔；为空时仅看观察优先开关和比例。</div>
                  </div>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{supportsRolloutNotes ? "备注" : "治理说明"}</div>
                    {supportsRolloutNotes ? (
                      <>
                        <textarea
                          value={rolloutForm.notes}
                          onChange={(event) => setRolloutForm((prev) => ({ ...prev, notes: event.target.value }))}
                          placeholder="记录灰度目标、风险点或预计观察窗口"
                          className={`mt-3 min-h-[110px] ${uiPrimitives.opsInput}`}
                        />
                        <div className="mt-2 text-xs leading-6 text-stone-600">
                          `recommendation` 会允许 scheduler 按线上回流自动收缩、限流或谨慎扩量；`manual` 只保留提示，不自动改配置。
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-sm leading-7 text-stone-400">
                        Prompt 版本只保存自动模式、观察优先、百分比和套餐白名单；具体变更原因以审计日志为主，不单独维护 rollout notes。
                      </div>
                    )}
                  </div>
                </div>
                <div className={`mt-3 border px-4 py-4 ${selectedRolloutAdmission.canEnable ? "border-emerald-900 bg-[#102017]" : "border-cinnabar bg-[#231514]"}`}>
                  <div className={`text-xs uppercase tracking-[0.16em] ${selectedRolloutAdmission.canEnable ? "text-emerald-400" : "text-cinnabar"}`}>
                    {selectedRolloutAdmission.canEnable ? "已通过灰度准入校验" : "未通过灰度准入校验"}
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-stone-200">
                    {selectedRolloutAdmission.canEnable ? (
                      <div>当前配置满足准入门槛，可以保存灰度配置。</div>
                    ) : (
                      selectedRolloutAdmission.blockers.map((blocker) => <div key={blocker}>{blocker}</div>)
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "观察流量命中用户", value: selectedVersion.rolloutStats?.observeUserCount ?? 0 },
                    { label: "套餐命中用户", value: selectedVersion.rolloutStats?.planUserCount ?? 0 },
                    { label: "比例命中用户", value: selectedVersion.rolloutStats?.percentageUserCount ?? 0 },
                    { label: "稳定命中用户", value: selectedVersion.rolloutStats?.stableUserCount ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                      <div className="mt-3 text-2xl text-stone-100">{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-stone-500">自动放量审计</div>
                      <div className="mt-2 text-sm leading-7 text-stone-500">
                        {selectedVersion?.versionType === "prompt_version"
                          ? "只展示 scheduler 针对当前 Prompt 版本写入的 `prompt_rollout_auto_manage` 审计，用于追踪自动收缩、限流和扩量原因。"
                          : "只展示 scheduler 针对当前资产写入的 `writing_asset_rollout_auto_manage` 审计，用于追踪自动收缩、限流和扩量原因。"}
                      </div>
                    </div>
                    <div className="text-xs text-stone-500">{selectedVersion.rolloutAuditLogs.length} 条</div>
                  </div>
                  {selectedRolloutRunHref || selectedRolloutDatasetHref || (selectedVersion?.versionType === "prompt_version" && selectedPromptPageHref) ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {selectedRolloutRunHref ? (
                        <Link href={selectedRolloutRunHref} className={uiPrimitives.opsSecondaryButton}>
                          {selectedRolloutRunLabel}
                        </Link>
                      ) : null}
                      {selectedRolloutDatasetHref ? (
                        <Link href={selectedRolloutDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                          打开评测集
                        </Link>
                      ) : null}
                      {selectedVersion?.versionType === "prompt_version" && selectedPromptPageHref ? (
                        <Link href={selectedPromptPageHref} className={uiPrimitives.opsSecondaryButton}>
                          打开 Prompts 页
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "自动调整", value: selectedRolloutAuditSummary.applyCount, tone: "text-emerald-400" },
                      { label: "维持不变", value: selectedRolloutAuditSummary.noopCount, tone: "text-amber-300" },
                      { label: "冷却跳过", value: selectedRolloutAuditSummary.cooldownSkipCount, tone: "text-stone-300" },
                      { label: "最近风险", value: selectedRolloutAuditSummary.latestRiskLevel, tone: selectedRolloutAuditSummary.latestRiskLevel === "cinnabar" ? "text-cinnabar" : selectedRolloutAuditSummary.latestRiskLevel === "emerald" ? "text-emerald-400" : selectedRolloutAuditSummary.latestRiskLevel === "amber" ? "text-amber-300" : "text-stone-300" },
                    ].map((item) => (
                      <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                        <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  {selectedVersion.rolloutAuditLogs.length ? (
                    <div className="mt-4 overflow-hidden border border-stone-800 bg-stone-950 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-stone-500">审计时间线</div>
                      <div className="mt-3 flex items-end gap-2">
                        {selectedVersion.rolloutAuditLogs.slice(0, 12).reverse().map((item) => (
                          <div key={`audit-timeline-${item.id}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                            <div
                              className={`w-full rounded-sm ${item.managementAction === "apply" && !item.cooldownSkipped ? "bg-emerald-500/70" : item.managementAction === "noop" ? "bg-amber-500/70" : "bg-stone-600"}`}
                              style={{ height: `${Math.max(12, item.changes.length > 0 ? 18 + item.changes.length * 8 : 12)}px` }}
                              title={`${getRolloutManageActionLabel(item.managementAction, item.cooldownSkipped)} · ${new Date(item.createdAt).toLocaleString("zh-CN")}`}
                            />
                            <div className="text-[10px] text-stone-600">
                              {new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {selectedVersion.rolloutAuditLogs.length ? (
                      selectedVersion.rolloutAuditLogs.slice(0, 6).map((item) => (
                        <article key={item.id} className="border border-stone-800 bg-stone-950 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.16em] text-stone-500">
                                {item.username || "system"} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                              </div>
                              <div className="mt-2 text-sm leading-7 text-stone-200">{item.reason || "本次自动放量未写入原因。"}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <div className={`border px-3 py-1 text-xs uppercase tracking-[0.12em] ${getRolloutManageActionTone(item.managementAction, item.cooldownSkipped)}`}>
                                {getRolloutManageActionLabel(item.managementAction, item.cooldownSkipped)}
                              </div>
                              <div className={`border px-3 py-1 text-xs uppercase tracking-[0.12em] ${getRolloutRiskTone(item.riskLevel)}`}>
                                {item.riskLevel}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 xl:grid-cols-2">
                            <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-sm text-stone-300">
                              变更前：{formatRolloutConfigSummary(item.previousConfig)}
                            </div>
                            <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-sm text-stone-300">
                              变更后：{formatRolloutConfigSummary(item.nextConfig)}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {item.changes.length ? (
                              item.changes.map((change) => (
                                <span key={`${item.id}-${change}`} className="border border-stone-700 px-3 py-1 text-stone-400">
                                  {change}
                                </span>
                              ))
                            ) : (
                              <span className="border border-stone-700 px-3 py-1 text-stone-500">本轮没有实际改动</span>
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">回流 {formatMetric(item.signals.feedbackCount, "", 0)} 条</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">用户 {formatMetric(item.signals.uniqueUsers, "", 0)}</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">命中 {formatMetric(item.signals.totalHitCount, "", 0)}</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">Delta {formatMetric(item.signals.deltaTotalScore, "", 2)}</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">爆款 {formatMetric(item.signals.observedViralScore, "", 2)}</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">打开 {formatMetric(item.signals.openRate, "%", 1)}</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-400">读完 {formatMetric(item.signals.readCompletionRate, "%", 1)}</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">
                        {selectedVersion?.versionType === "prompt_version"
                          ? "当前 Prompt 版本还没有自动放量审计记录。若 `autoMode=recommendation` 且 scheduler 已运行，后续会在这里显示每次自动调整。"
                          : "当前资产还没有自动放量审计记录。若 `autoMode=recommendation` 且 scheduler 已运行，后续会在这里显示每次自动调整。"}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 border border-stone-800 bg-[#141414] px-4 py-4 text-sm text-stone-400">
                {selectedVersion?.versionType === "prompt_version" && selectedVersion.isCurrentActive ? (
                  "当前 Prompt 版本已经全量生效，无需再配置灰度窗口。"
                ) : (
                  <>
                    当前版本决策为 <span className="text-stone-200">{selectedVersion?.decision}</span>，仅保留版本允许配置线上灰度。
                  </>
                )}
              </div>
            )
          ) : null}
        </div>

        {selectedVersion?.versionType === "prompt_version" ? (
          <div className="border border-stone-800 bg-stone-950 px-4 py-4 xl:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Prompt 灰度治理</div>
                <div className="mt-3 text-sm leading-7 text-stone-400">
                  聚焦当前 prompt 版本的自动灰度配置、账本判断和 scheduler 审计，不和通用写作资产治理混在一起看。
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {selectedPromptRolloutAssessment?.runId ? (
                  <Link
                    href={`/ops/writing-eval/runs?runId=${selectedPromptRolloutAssessment.runId}`}
                    className={uiPrimitives.opsSecondaryButton}
                  >
                    打开来源 Run
                  </Link>
                ) : null}
                {selectedVersion?.experimentSource?.datasetId ? (
                  <Link
                    href={`/ops/writing-eval/datasets?datasetId=${selectedVersion.experimentSource.datasetId}`}
                    className={uiPrimitives.opsSecondaryButton}
                  >
                    打开评测集
                  </Link>
                ) : null}
                {selectedPromptPageHref ? (
                  <Link href={selectedPromptPageHref} className={uiPrimitives.opsSecondaryButton}>
                    打开 Prompts 页
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "自动模式", value: selectedPromptRolloutConfig?.autoMode || "manual", tone: "text-stone-100" },
                { label: "观察优先", value: selectedPromptRolloutConfig?.rolloutObserveOnly ? "仅观察流量" : "公开灰度", tone: selectedPromptRolloutConfig?.rolloutObserveOnly ? "text-amber-300" : "text-stone-100" },
                { label: "灰度比例", value: `${Math.round(Number(selectedPromptRolloutConfig?.rolloutPercentage ?? 0))}%`, tone: "text-stone-100" },
                { label: "套餐白名单", value: selectedPromptRolloutConfig?.rolloutPlanCodes.length ? selectedPromptRolloutConfig.rolloutPlanCodes.join(", ") : "--", tone: "text-stone-100" },
              ].map((item) => (
                <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                  <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "账本决策", value: selectedPromptRolloutAssessment?.ledgerDecision || (selectedPromptRolloutAssessment?.hasLedger ? "--" : "missing"), tone: selectedPromptRolloutAssessment?.ledgerDecision === "keep" ? "text-emerald-400" : selectedPromptRolloutAssessment?.ledgerDecision === "discard" ? "text-cinnabar" : "text-stone-100" },
                { label: "来源版本", value: selectedPromptRolloutAssessment?.sourceVersion || "--", tone: "text-stone-100", href: selectedPromptAssessmentSourceHref },
                { label: "总分 Delta", value: formatMetric(selectedPromptRolloutAssessment?.deltaTotalScore, "", 2), tone: (selectedPromptRolloutAssessment?.deltaTotalScore ?? 0) < 0 ? "text-cinnabar" : "text-emerald-400" },
                { label: "失败样本", value: String(selectedPromptRolloutAssessment?.failedCaseCount ?? 0), tone: "text-stone-100" },
              ].map((item) => (
                <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                  {item.href ? (
                    <Link href={item.href} className={`mt-3 block text-2xl transition hover:text-cinnabar ${item.tone}`}>
                      {item.value}
                    </Link>
                  ) : (
                    <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "爆款潜力", value: formatMetric(selectedPromptRolloutAssessment?.observedViralScore, "", 2) },
                { label: "打开率", value: formatMetric(selectedPromptRolloutAssessment?.openRate, "%", 1) },
                { label: "读完率", value: formatMetric(selectedPromptRolloutAssessment?.readCompletionRate, "%", 1) },
                { label: "反馈数", value: formatMetric(selectedPromptRolloutAssessment?.feedbackCount, "", 0) },
                { label: "唯一用户", value: formatMetric(selectedPromptRolloutAssessment?.uniqueUsers, "", 0) },
                { label: "总命中", value: formatMetric(selectedPromptRolloutAssessment?.totalHitCount, "", 0) },
                { label: "最近命中", value: selectedPromptRolloutAssessment?.lastHitAt ? new Date(selectedPromptRolloutAssessment.lastHitAt).toLocaleString("zh-CN") : "--" },
                { label: "Prompt Ref", value: selectedPromptRolloutAssessment?.ref || selectedVersion.candidateContent, href: selectedPromptPageHref },
              ].map((item) => (
                <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                  {item.href ? (
                    <Link href={item.href} className="mt-3 block text-sm leading-7 text-stone-200 transition hover:text-cinnabar">
                      {item.value}
                    </Link>
                  ) : (
                    <div className="mt-3 text-sm leading-7 text-stone-200">{item.value}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 border border-stone-800 bg-[#141414] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-stone-500">Prompt 自动治理审计</div>
                  <div className="mt-2 text-sm leading-7 text-stone-500">
                    这里单独展示 `prompt_rollout_auto_manage` 审计，便于核对 prompt scheduler 何时收缩、维持或扩量。
                  </div>
                </div>
                <div className="text-xs text-stone-500">{selectedPromptRolloutAuditLogs.length} 条</div>
              </div>
              {selectedRolloutRunHref || selectedRolloutDatasetHref || selectedPromptPageHref ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {selectedRolloutRunHref ? (
                    <Link href={selectedRolloutRunHref} className={uiPrimitives.opsSecondaryButton}>
                      {selectedRolloutRunLabel}
                    </Link>
                  ) : null}
                  {selectedRolloutDatasetHref ? (
                    <Link href={selectedRolloutDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                      打开评测集
                    </Link>
                  ) : null}
                  {selectedPromptPageHref ? (
                    <Link href={selectedPromptPageHref} className={uiPrimitives.opsSecondaryButton}>
                      打开 Prompts 页
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "自动调整", value: selectedPromptRolloutAuditSummary.applyCount, tone: "text-emerald-400" },
                  { label: "维持不变", value: selectedPromptRolloutAuditSummary.noopCount, tone: "text-amber-300" },
                  { label: "冷却跳过", value: selectedPromptRolloutAuditSummary.cooldownSkipCount, tone: "text-stone-300" },
                  { label: "最近风险", value: selectedPromptRolloutAuditSummary.latestRiskLevel, tone: selectedPromptRolloutAuditSummary.latestRiskLevel === "cinnabar" ? "text-cinnabar" : selectedPromptRolloutAuditSummary.latestRiskLevel === "emerald" ? "text-emerald-400" : selectedPromptRolloutAuditSummary.latestRiskLevel === "amber" ? "text-amber-300" : "text-stone-300" },
                ].map((item) => (
                  <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                    <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                {selectedPromptRolloutAuditLogs.length ? (
                  selectedPromptRolloutAuditLogs.slice(0, 6).map((item) => (
                    <article key={`prompt-rollout-audit-${item.id}`} className="border border-stone-800 bg-stone-950 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-stone-500">
                            {item.username || "system"} · {new Date(item.createdAt).toLocaleString("zh-CN")}
                          </div>
                          <div className="mt-2 text-sm leading-7 text-stone-200">{item.reason || "本次 prompt 自动治理未写入原因。"}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <div className={`border px-3 py-1 text-xs uppercase tracking-[0.12em] ${getRolloutManageActionTone(item.managementAction, item.cooldownSkipped)}`}>
                            {getRolloutManageActionLabel(item.managementAction, item.cooldownSkipped)}
                          </div>
                          <div className={`border px-3 py-1 text-xs uppercase tracking-[0.12em] ${getRolloutRiskTone(item.riskLevel)}`}>
                            {item.riskLevel}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-sm text-stone-300">
                          变更前：{formatRolloutConfigSummary(item.previousConfig)}
                        </div>
                        <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-sm text-stone-300">
                          变更后：{formatRolloutConfigSummary(item.nextConfig)}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {item.changes.length ? (
                          item.changes.map((change) => (
                            <span key={`${item.id}-${change}`} className="border border-stone-700 px-3 py-1 text-stone-400">
                              {change}
                            </span>
                          ))
                        ) : (
                          <span className="border border-stone-700 px-3 py-1 text-stone-500">本轮没有实际改动</span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">回流 {formatMetric(item.signals.feedbackCount, "", 0)} 条</span>
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">用户 {formatMetric(item.signals.uniqueUsers, "", 0)}</span>
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">命中 {formatMetric(item.signals.totalHitCount, "", 0)}</span>
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">Delta {formatMetric(item.signals.deltaTotalScore, "", 2)}</span>
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">爆款 {formatMetric(item.signals.observedViralScore, "", 2)}</span>
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">打开 {formatMetric(item.signals.openRate, "%", 1)}</span>
                        <span className="border border-stone-700 px-3 py-1 text-stone-400">读完 {formatMetric(item.signals.readCompletionRate, "%", 1)}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">
                    当前 prompt 版本还没有自动治理审计记录。若 `autoMode=recommendation` 且 scheduler 已运行，后续会在这里显示治理轨迹。
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="border border-stone-800 bg-stone-950 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-stone-500">来源版本预览</div>
          <div className="mt-3 text-sm text-stone-400">{selectedVersion ? selectedVersion.sourceLabel : "暂无"}</div>
          {selectedSourcePromptPageHref ? (
            <div className="mt-3">
              <Link href={selectedSourcePromptPageHref} className={uiPrimitives.opsSecondaryButton}>
                打开来源 Prompt
              </Link>
            </div>
          ) : null}
          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words border border-stone-800 bg-[#141414] px-4 py-4 text-xs leading-6 text-stone-300">
            {selectedVersion?.sourcePreview || "当前账本记录没有可展示的来源内容。"}
          </pre>
        </div>

        <div className="border border-stone-800 bg-stone-950 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">目标版本预览</div>
          <div className="mt-3 text-sm text-stone-400">{selectedVersion ? selectedVersion.candidateLabel : "暂无"}</div>
          {selectedPromptPageHref ? (
            <div className="mt-3">
              <Link href={selectedPromptPageHref} className={uiPrimitives.opsSecondaryButton}>
                打开目标 Prompt
              </Link>
            </div>
          ) : null}
          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words border border-stone-800 bg-[#141414] px-4 py-4 text-xs leading-6 text-stone-300">
            {selectedVersion?.candidatePreview || "当前账本记录没有可展示的目标内容。"}
          </pre>
        </div>
      </section>
    </section>
  );
}
