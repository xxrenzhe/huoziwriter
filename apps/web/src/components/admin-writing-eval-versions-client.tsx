"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";
import {
  buildAdminPromptVersionHref,
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
  buildAdminWritingEvalVersionsHref,
} from "@/lib/admin-writing-eval-links";
import { formatWritingEvalDateTime, formatWritingEvalMetric, formatWritingEvalMonthDay } from "@/lib/writing-eval-format";

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

type RolloutAuditSummary = {
  applyCount: number;
  noopCount: number;
  cooldownSkipCount: number;
  latestRiskLevel: string;
};

type SecondaryActionLink = {
  key: string;
  href: string;
  label: string;
};

type SummaryStatItem = {
  label: string;
  value: ReactNode;
  href?: string;
  tone?: string;
  valueClassName?: string;
};

type ForkPromptCandidateResponse = {
  success?: boolean;
  error?: string;
  data?: {
    candidate?: { promptVersionRef?: string };
    run?: { id?: number; runCode?: string };
  };
};

const adminVersionsPanelBaseClassName = cn(
  surfaceCardStyles(),
  "border-line bg-paperStrong shadow-none",
);
const adminVersionsSectionClassName = cn(adminVersionsPanelBaseClassName, "p-5");
const adminVersionsWideSectionClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-4 py-4 shadow-none xl:col-span-2",
);
const adminVersionsInsetCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-4 py-4 shadow-none",
);
const adminVersionsInsetCardCompactClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-4 py-3 shadow-none",
);
const adminVersionsRaisedCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surfaceWarm px-4 py-4 shadow-none",
);
const adminVersionsRaisedCardCompactClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surfaceWarm px-4 py-3 shadow-none",
);
const adminVersionsFocusCardClassName = cn(
  surfaceCardStyles(),
  "border-cinnabar/40 bg-surfaceWarning px-4 py-4 shadow-none",
);
const adminVersionsMutedNoticeClassName = cn(
  adminVersionsInsetCardClassName,
  "text-sm text-inkMuted",
);
const adminVersionsDashedNoticeClassName = cn(
  surfaceCardStyles(),
  "border-dashed border-lineStrong bg-surface px-4 py-6 text-sm text-inkMuted shadow-none",
);
const adminVersionsTableDesktopShellClassName = "hidden overflow-x-auto md:block";
const adminVersionsTableMobileListClassName = "grid gap-3 p-4 md:hidden";
const adminVersionsMobileCardClassName = cn(
  surfaceCardStyles({ padding: "md" }),
  "border-lineStrong bg-surface text-ink shadow-none transition-colors",
);
const adminVersionsAuditChangeCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-3 py-3 text-sm text-inkSoft shadow-none",
);
const adminVersionsPreviewClassName = cn(
  adminVersionsInsetCardClassName,
  "mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-inkSoft",
);
const adminVersionsInfoChipClassName = "border border-lineStrong bg-surface px-3 py-1 text-inkSoft";
const adminVersionsMutedChipClassName = "border border-line bg-surface px-3 py-1 text-inkMuted";
const adminVersionsInputClassName = cn("mt-3", uiPrimitives.adminInput);
const adminVersionsSelectClassName = cn("mt-3", uiPrimitives.adminSelect);
const adminVersionsTextareaClassName = cn("mt-3 min-h-[110px]", uiPrimitives.adminInput);
const adminVersionsSecondaryButtonClassName = uiPrimitives.adminSecondaryButton;
const adminVersionsPrimaryButtonClassName = uiPrimitives.primaryButton;

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRolloutRiskTextTone(value: string) {
  if (value === "cinnabar") return "text-cinnabar";
  if (value === "emerald") return "text-emerald-400";
  if (value === "amber") return "text-amber-300";
  return "text-inkSoft";
}

function getVersionsMobileCardClassName(selected: boolean) {
  return cn(
    adminVersionsMobileCardClassName,
    selected ? "border-cinnabar/40 bg-surfaceWarning" : "hover:border-lineStrong hover:bg-surfaceWarm",
  );
}

function handleSelectableCardKeyDown(event: KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (event.currentTarget !== event.target) {
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

function getDecisionTextTone(value: string) {
  if (value === "keep") return "text-emerald-400";
  if (value === "discard") return "text-cinnabar";
  return "text-amber-300";
}

function getAdvisoryTextTone(tone: RolloutAdvisory["tone"]) {
  if (tone === "emerald") return "text-emerald-400";
  if (tone === "cinnabar") return "text-cinnabar";
  if (tone === "amber") return "text-amber-300";
  return "text-inkMuted";
}

function getAdvisoryInlineTone(tone: RolloutAdvisory["tone"]) {
  if (tone === "emerald") return "text-emerald-400";
  if (tone === "cinnabar") return "text-cinnabar";
  if (tone === "amber") return "text-amber-300";
  return "text-inkMuted";
}

function getAdvisoryPanelTone(tone: RolloutAdvisory["tone"]) {
  if (tone === "emerald") return "border-emerald-500/30 bg-emerald-500/10";
  if (tone === "cinnabar") return "border-cinnabar/40 bg-surfaceWarning";
  if (tone === "amber") return "border-warning/40 bg-surfaceWarning";
  return "border-lineStrong bg-surface";
}

function getRolloutRiskTone(value: string) {
  if (value === "emerald") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (value === "cinnabar") return "border-cinnabar/40 bg-surfaceWarning text-cinnabar";
  if (value === "amber") return "border-warning/40 bg-surfaceWarning text-warning";
  return "border-lineStrong bg-surface text-inkMuted";
}

function getRolloutManageActionLabel(value: string, cooldownSkipped = false) {
  if (cooldownSkipped || value === "cooldown_skip") return "冷却跳过";
  if (value === "apply") return "已自动调整";
  if (value === "noop") return "维持不变";
  return "自动审计";
}

function getRolloutManageActionTone(value: string, cooldownSkipped = false) {
  if (cooldownSkipped || value === "cooldown_skip") return "border-lineStrong text-inkMuted";
  if (value === "apply") return "border-emerald-800 text-emerald-400";
  if (value === "noop") return "border-amber-800 text-amber-300";
  return "border-lineStrong text-inkMuted";
}

function formatRolloutConfigSummary(value: Record<string, unknown>) {
  const enabled = Boolean(value.isEnabled);
  const observeOnly = Boolean(value.rolloutObserveOnly);
  const percentage = typeof value.rolloutPercentage === "number" ? value.rolloutPercentage : Number(value.rolloutPercentage ?? 0);
  return `${enabled ? "启用" : "关闭"} · ${observeOnly ? "观察优先" : "公开灰度"} · ${Number.isFinite(percentage) ? Math.round(percentage) : 0}%`;
}

function getRolloutAuditTimelineTone(item: RolloutAuditLog) {
  if (item.managementAction === "apply" && !item.cooldownSkipped) return "bg-emerald-500/70";
  if (item.managementAction === "noop") return "bg-amber-500/70";
  return "bg-surfaceMuted";
}

function buildRolloutAuditSummary(logs: RolloutAuditLog[]): RolloutAuditSummary {
  return {
    applyCount: logs.filter((item) => item.managementAction === "apply" && !item.cooldownSkipped).length,
    noopCount: logs.filter((item) => item.managementAction === "noop").length,
    cooldownSkipCount: logs.filter((item) => item.managementAction === "cooldown_skip" || item.cooldownSkipped).length,
    latestRiskLevel: logs[0]?.riskLevel ?? "stone",
  };
}

function getAdmissionPanelTone(canEnable: boolean) {
  return canEnable ? "border-emerald-500/30 bg-emerald-500/10" : "border-cinnabar/40 bg-surfaceWarning";
}

function getAdmissionTextTone(canEnable: boolean) {
  return canEnable ? "text-emerald-400" : "text-cinnabar";
}

function SectionEyebrow({
  tone = "stone",
  children,
}: {
  tone?: "stone" | "cinnabar";
  children: ReactNode;
}) {
  return (
    <div className={cn("text-xs uppercase tracking-[0.18em]", tone === "cinnabar" ? "text-cinnabar" : "text-inkMuted")}>
      {children}
    </div>
  );
}

function SecondaryActionLinks({ items }: { items: SecondaryActionLink[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className={adminVersionsSecondaryButtonClassName}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function SummaryStatGrid({
  items,
  className,
}: {
  items: SummaryStatItem[];
  className: string;
}) {
  return (
    <div className={className}>
      {items.map((item) => (
        <div key={item.label} className={adminVersionsInsetCardClassName}>
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{item.label}</div>
          {item.href ? (
            <Link
              href={item.href}
              className={cn("mt-3 block transition hover:text-cinnabar", item.valueClassName || "text-2xl", item.tone || "text-ink")}
            >
              {item.value}
            </Link>
          ) : (
            <div className={cn("mt-3", item.valueClassName || "text-2xl", item.tone || "text-ink")}>{item.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdvisoryPanel({
  title,
  children,
  contentClassName = "mt-3",
}: {
  title: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className={adminVersionsInsetCardClassName}>
      <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{title}</div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

function VersionPreviewPanel({
  title,
  tone = "stone",
  label,
  actionLinks,
  preview,
  emptyPreview,
}: {
  title: string;
  tone?: "stone" | "cinnabar";
  label: string;
  actionLinks: SecondaryActionLink[];
  preview: string | null | undefined;
  emptyPreview: string;
}) {
  return (
    <div className={adminVersionsRaisedCardClassName}>
      <SectionEyebrow tone={tone}>{title}</SectionEyebrow>
      <div className="mt-3 text-sm text-inkSoft">{label}</div>
      {actionLinks.length ? (
        <div className="mt-3">
          <SecondaryActionLinks items={actionLinks} />
        </div>
      ) : null}
      <pre className={adminVersionsPreviewClassName}>
        {preview || emptyPreview}
      </pre>
    </div>
  );
}

function ConfigCard({
  title,
  compact = false,
  children,
}: {
  title?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={compact ? adminVersionsInsetCardCompactClassName : adminVersionsInsetCardClassName}>
      {title ? <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{title}</div> : null}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </div>
  );
}

function ToggleConfigCard({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn(adminVersionsInsetCardCompactClassName, "flex items-center gap-3 text-sm text-inkSoft")}>
      <input aria-label="input control" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function RolloutAuditSection({
  title,
  description,
  logs,
  actionLinks,
  emptyState,
  emptyReasonFallback,
  showTimeline = false,
}: {
  title: string;
  description: string;
  logs: RolloutAuditLog[];
  actionLinks: SecondaryActionLink[];
  emptyState: string;
  emptyReasonFallback: string;
  showTimeline?: boolean;
}) {
  const summary = buildRolloutAuditSummary(logs);

  return (
    <div className={cn(adminVersionsInsetCardClassName, "mt-3")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{title}</div>
          <div className="mt-2 text-sm leading-7 text-inkMuted">{description}</div>
        </div>
        <div className="text-xs text-inkMuted">{logs.length} 条</div>
      </div>
      {actionLinks.length ? <div className="mt-4"><SecondaryActionLinks items={actionLinks} /></div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "自动调整", value: summary.applyCount, tone: "text-emerald-400" },
          { label: "维持不变", value: summary.noopCount, tone: "text-amber-300" },
          { label: "冷却跳过", value: summary.cooldownSkipCount, tone: "text-inkSoft" },
          { label: "最近风险", value: summary.latestRiskLevel, tone: getRolloutRiskTextTone(summary.latestRiskLevel) },
        ].map((item) => (
          <div key={item.label} className={adminVersionsRaisedCardClassName}>
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{item.label}</div>
            <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>
      {showTimeline && logs.length ? (
        <div className={cn(adminVersionsRaisedCardClassName, "mt-4 overflow-hidden")}>
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">审计时间线</div>
          <div className="mt-3 flex items-end gap-2">
            {logs.slice(0, 12).reverse().map((item) => (
              <div key={`audit-timeline-${item.id}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-sm ${getRolloutAuditTimelineTone(item)}`}
                  style={{ height: `${Math.max(12, item.changes.length > 0 ? 18 + item.changes.length * 8 : 12)}px` }}
                  title={`${getRolloutManageActionLabel(item.managementAction, item.cooldownSkipped)} · ${formatWritingEvalDateTime(item.createdAt)}`}
                />
                <div className="text-[10px] text-inkMuted">
                              {formatWritingEvalMonthDay(item.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {logs.length ? (
          logs.slice(0, 6).map((item) => (
            <article key={item.id} className={adminVersionsRaisedCardClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">
                    {item.username || "system"} · {formatWritingEvalDateTime(item.createdAt)}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-ink">{item.reason || emptyReasonFallback}</div>
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
                <div className={adminVersionsAuditChangeCardClassName}>
                  变更前：{formatRolloutConfigSummary(item.previousConfig)}
                </div>
                <div className={adminVersionsAuditChangeCardClassName}>
                  变更后：{formatRolloutConfigSummary(item.nextConfig)}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {item.changes.length ? (
                  item.changes.map((change) => (
                    <span key={`${item.id}-${change}`} className={adminVersionsInfoChipClassName}>
                      {change}
                    </span>
                  ))
                ) : (
                  <span className={adminVersionsMutedChipClassName}>本轮没有实际改动</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className={adminVersionsInfoChipClassName}>回流 {formatWritingEvalMetric(item.signals.feedbackCount, "", 0)} 条</span>
                <span className={adminVersionsInfoChipClassName}>用户 {formatWritingEvalMetric(item.signals.uniqueUsers, "", 0)}</span>
                <span className={adminVersionsInfoChipClassName}>命中 {formatWritingEvalMetric(item.signals.totalHitCount, "", 0)}</span>
                <span className={adminVersionsInfoChipClassName}>Delta {formatWritingEvalMetric(item.signals.deltaTotalScore, "", 2)}</span>
                <span className={adminVersionsInfoChipClassName}>爆款 {formatWritingEvalMetric(item.signals.observedViralScore, "", 2)}</span>
                <span className={adminVersionsInfoChipClassName}>打开 {formatWritingEvalMetric(item.signals.openRate, "%", 1)}</span>
                <span className={adminVersionsInfoChipClassName}>读完 {formatWritingEvalMetric(item.signals.readCompletionRate, "%", 1)}</span>
              </div>
            </article>
          ))
        ) : (
          <div className={adminVersionsDashedNoticeClassName}>{emptyState}</div>
        )}
      </div>
    </div>
  );
}

function isRolloutVersionType(value: string): value is RolloutAssetType {
  return ROLLOUT_VERSION_TYPES.includes(value as RolloutAssetType);
}

function isPromptBackedVersionType(value: string) {
  return value === "prompt_version" || value === "fact_check" || value === "title_template" || value === "lead_template";
}

function getExperimentModeFromVersionType(versionType: string) {
  if (versionType === "title_template") return "title_only";
  if (versionType === "lead_template") return "lead_only";
  return "full_article";
}

function buildPromptOptimizationGoalFromVersion(version: VersionItem) {
  return [
    `基于账本 #${version.id} 的结果继续优化 ${version.targetKey}。`,
    `当前账本决策：${version.decision}。`,
    version.decisionReason || "",
    typeof getNumber(version.scoreSummary.deltaTotalScore) === "number"
      ? `上一轮总分 Delta：${getNumber(version.scoreSummary.deltaTotalScore)!.toFixed(2)}。`
      : "",
    "要求延续已有输出契约，优先做小步、可归因、可回滚的 Prompt 调整。",
  ]
    .filter(Boolean)
    .join(" ");
}

function getVersionTypeLabel(versionType: string) {
  if (versionType === "fact_check") return "fact_check（事实核查 Prompt）";
  if (versionType === "title_template") return "title_template（标题模板 Prompt）";
  if (versionType === "lead_template") return "lead_template（开头模板 Prompt）";
  if (versionType === "layout_strategy") return "layout_strategy（写作风格资产）";
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
        `离线总分 Delta ${formatWritingEvalMetric(deltaTotalScore, "", 2)}，失败样本 ${formatWritingEvalMetric(failedCaseCount, "", 0)}。`,
      ],
      nextSteps: ["先用观察流量或白名单套餐开启小流量灰度。", "备注里写清这轮要验证的用户群、窗口期和回滚条件。"],
    };
  }

  if ((deltaTotalScore ?? 0) < 0) {
    reasons.push(`离线总分 Delta 为 ${formatWritingEvalMetric(deltaTotalScore, "", 2)}，候选版本没有稳定优于基线。`);
  }
  if (failedCaseCount >= 3) {
    reasons.push(`失败样本 ${failedCaseCount} 条，说明离线退化仍偏多。`);
  }
  if (feedbackCount >= 3 && observedViral !== null && observedViral < 55) {
    reasons.push(`线上爆款潜力均值仅 ${formatWritingEvalMetric(observedViral, "", 2)}，已低于安全观察线。`);
  }
  if (feedbackCount >= 3 && openRate !== null && openRate < 10) {
    reasons.push(`平均打开率 ${formatWritingEvalMetric(openRate, "%", 1)} 偏低，说明点击侧没有验证通过。`);
  }
  if (feedbackCount >= 3 && readCompletionRate !== null && readCompletionRate < 18) {
    reasons.push(`平均读完率 ${formatWritingEvalMetric(readCompletionRate, "%", 1)} 偏低，正文留存存在风险。`);
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
        `离线总分 Delta ${formatWritingEvalMetric(deltaTotalScore, "", 2)}，仍需要更多真实数据验证。`,
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
        `线上均值：爆款 ${formatWritingEvalMetric(observedViral, "", 2)}，打开 ${formatWritingEvalMetric(openRate, "%", 1)}，读完 ${formatWritingEvalMetric(readCompletionRate, "%", 1)}。`,
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
        `离线总分 Delta ${formatWritingEvalMetric(deltaTotalScore, "", 2)}，失败样本 ${formatWritingEvalMetric(failedCaseCount, "", 0)}。`,
        `线上均值：爆款 ${formatWritingEvalMetric(observedViral, "", 2)}，打开 ${formatWritingEvalMetric(openRate, "%", 1)}，读完 ${formatWritingEvalMetric(readCompletionRate, "%", 1)}，分享 ${formatWritingEvalMetric(shareRate, "%", 1)}。`,
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
      `线上均值：爆款 ${formatWritingEvalMetric(observedViral, "", 2)}，打开 ${formatWritingEvalMetric(openRate, "%", 1)}，读完 ${formatWritingEvalMetric(readCompletionRate, "%", 1)}。`,
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

export function AdminWritingEvalVersionsClient({
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
  const [forkingVersionId, setForkingVersionId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(initialSelectedVersionId ?? initialVersions[0]?.id ?? null);
  const [savingRollout, setSavingRollout] = useState(false);
  const displayedVersions = focusAsset
    ? versions.filter((item) => item.versionType === focusAsset.assetType && item.candidateContent === focusAsset.assetRef)
    : versions;
  const focusAssetPromptHref =
    focusAsset && isPromptBackedVersionType(focusAsset.assetType) ? buildAdminPromptVersionHref(focusAsset.assetRef) : null;
  const selectedVersion = displayedVersions.find((item) => item.id === selectedVersionId) ?? displayedVersions[0] ?? null;
  const selectedRolloutAdvisory = buildRolloutAdvisory(selectedVersion);
  const selectedRolloutPresets = buildRolloutPresets(selectedVersion, selectedRolloutAdvisory);
  const [rolloutForm, setRolloutForm] = useState<RolloutFormState>(() => buildRolloutFormState(selectedVersion));
  const selectedRolloutAdmission = buildRolloutAdmission(selectedVersion, selectedRolloutAdvisory, rolloutForm);
  const selectedRolloutAuditLogs = selectedVersion?.rolloutAuditLogs ?? [];
  const selectedPromptRolloutConfig = selectedVersion?.promptRolloutConfig ?? null;
  const selectedPromptRolloutAssessment = selectedVersion?.promptRolloutAssessment ?? null;
  const selectedPromptRolloutAuditLogs = selectedVersion?.promptRolloutAuditLogs ?? [];
  const selectedRolloutRunHref = selectedPromptRolloutAssessment?.runId
    ? buildAdminWritingEvalRunsHref({ runId: selectedPromptRolloutAssessment.runId })
    : selectedVersion?.experimentSource?.runId
      ? buildAdminWritingEvalRunsHref({ runId: selectedVersion.experimentSource.runId })
      : null;
  const selectedRolloutDatasetHref = selectedVersion?.experimentSource?.datasetId
    ? buildAdminWritingEvalDatasetsHref({ datasetId: selectedVersion.experimentSource.datasetId })
    : null;
  const selectedRolloutRunLabel =
    selectedRolloutAdvisory?.tone === "cinnabar" || (selectedPromptRolloutAssessment?.failedCaseCount ?? 0) > 0
      ? "回到 Runs 页排查"
      : "打开来源 Run";
  const selectedPromptPageHref = selectedVersion && isPromptBackedVersionType(selectedVersion.versionType)
    ? buildAdminPromptVersionHref(
        selectedPromptRolloutAssessment?.version || selectedVersion.candidateLabel,
        selectedPromptRolloutAssessment?.promptId || selectedVersion.targetKey,
      )
    : null;
  const selectedPromptAssessmentSourceHref = selectedPromptRolloutAssessment?.sourceVersion
    ? buildAdminPromptVersionHref(selectedPromptRolloutAssessment.sourceVersion, selectedPromptRolloutAssessment.promptId || selectedVersion?.targetKey)
    : null;
  const focusAssetActionLinks = [
    focusAssetPromptHref ? { key: "prompt", href: focusAssetPromptHref, label: "打开 Prompts 页" } : null,
    focusAsset ? { key: "clear", href: focusAsset.clearHref, label: "返回全量账本" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedRolloutAuditActionLinks = [
    selectedRolloutRunHref ? { key: "run", href: selectedRolloutRunHref, label: selectedRolloutRunLabel } : null,
    selectedRolloutDatasetHref ? { key: "dataset", href: selectedRolloutDatasetHref, label: "打开评测集" } : null,
    selectedVersion && isPromptBackedVersionType(selectedVersion.versionType) && selectedPromptPageHref
      ? { key: "prompt", href: selectedPromptPageHref, label: "打开 Prompts 页" }
      : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedPromptRolloutAuditActionLinks = [
    selectedRolloutRunHref ? { key: "run", href: selectedRolloutRunHref, label: selectedRolloutRunLabel } : null,
    selectedRolloutDatasetHref ? { key: "dataset", href: selectedRolloutDatasetHref, label: "打开评测集" } : null,
    selectedPromptPageHref ? { key: "prompt", href: selectedPromptPageHref, label: "打开 Prompts 页" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedRolloutFollowupActionLinks = [
    selectedRolloutRunHref ? { key: "run", href: selectedRolloutRunHref, label: selectedRolloutRunLabel } : null,
    selectedRolloutDatasetHref ? { key: "dataset", href: selectedRolloutDatasetHref, label: "打开评测集" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedPromptGovernanceActionLinks = [
    selectedPromptRolloutAssessment?.runId ? { key: "run", href: buildAdminWritingEvalRunsHref({ runId: selectedPromptRolloutAssessment.runId }), label: "打开来源 Run" } : null,
    selectedVersion?.experimentSource?.datasetId ? { key: "dataset", href: buildAdminWritingEvalDatasetsHref({ datasetId: selectedVersion.experimentSource.datasetId }), label: "打开评测集" } : null,
    selectedPromptPageHref ? { key: "prompt", href: selectedPromptPageHref, label: "打开 Prompts 页" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedSourcePromptPageHref =
    selectedVersion && isPromptBackedVersionType(selectedVersion.versionType)
      ? buildAdminPromptVersionHref(selectedVersion.sourceVersion, selectedVersion.targetKey)
      : null;
  const selectedExperimentBasePromptHref = selectedVersion?.experimentSource?.baseVersionRef
    ? buildAdminPromptVersionHref(selectedVersion.experimentSource.baseVersionRef)
    : null;
  const selectedExperimentCandidatePromptHref = selectedVersion?.experimentSource?.candidateVersionRef
    ? buildAdminPromptVersionHref(selectedVersion.experimentSource.candidateVersionRef)
    : null;
  const selectedExperimentRunHref = selectedVersion?.experimentSource?.runId
    ? buildAdminWritingEvalRunsHref({ runId: selectedVersion.experimentSource.runId })
    : null;
  const selectedExperimentDatasetHref = selectedVersion?.experimentSource?.datasetId
    ? buildAdminWritingEvalDatasetsHref({ datasetId: selectedVersion.experimentSource.datasetId })
    : null;
  const selectedExperimentActionLinks = [
    selectedExperimentDatasetHref ? { key: "dataset", href: selectedExperimentDatasetHref, label: "打开评测集" } : null,
    selectedExperimentRunHref ? { key: "run", href: selectedExperimentRunHref, label: "查看对应 Run" } : null,
    selectedExperimentBasePromptHref ? { key: "base-prompt", href: selectedExperimentBasePromptHref, label: "打开基线 Prompt" } : null,
    selectedExperimentCandidatePromptHref ? { key: "candidate-prompt", href: selectedExperimentCandidatePromptHref, label: "打开候选 Prompt" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedSourcePreviewActionLinks = [
    selectedSourcePromptPageHref ? { key: "source-prompt", href: selectedSourcePromptPageHref, label: "打开来源 Prompt" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedTargetPreviewActionLinks = [
    selectedPromptPageHref ? { key: "target-prompt", href: selectedPromptPageHref, label: "打开目标 Prompt" } : null,
  ].filter((item): item is SecondaryActionLink => Boolean(item));
  const selectedCanForkPromptCandidate = Boolean(
    selectedVersion
    && isPromptBackedVersionType(selectedVersion.versionType)
    && selectedVersion.experimentSource?.datasetId,
  );
  const selectedForkRunHref = selectedVersion?.experimentSource?.datasetId
    ? buildAdminWritingEvalRunsHref({ datasetId: selectedVersion.experimentSource.datasetId })
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
      const response = await fetch(`/api/admin/writing-eval/versions/${versionId}/rollback`, {
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

  async function handleForkPromptCandidate(version: VersionItem) {
    if (!isPromptBackedVersionType(version.versionType) || !version.experimentSource?.datasetId) {
      setMessage("当前账本缺少可复用的数据集或不是 Prompt 类对象，无法继续迭代");
      return;
    }
    setForkingVersionId(version.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/writing-eval/runs/fork-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: version.experimentSource.datasetId,
          baseVersionType: version.versionType,
          baseVersionRef: version.candidateContent,
          experimentMode: getExperimentModeFromVersionType(version.versionType),
          triggerMode: "manual",
          decisionMode: "manual_review",
          summary: [
            `fork from ledger#${version.id}`,
            `source:${version.candidateContent}`,
            version.decisionReason || "",
          ]
            .filter(Boolean)
            .join(" · "),
          optimizationGoal: buildPromptOptimizationGoalFromVersion(version),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as ForkPromptCandidateResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.error || "继续迭代并发起实验失败");
      }
      const nextRunId = Number(json.data?.run?.id);
      const nextRunCode = String(json.data?.run?.runCode || "").trim();
      const nextCandidateRef = String(json.data?.candidate?.promptVersionRef || "").trim();
      setMessage(`已从 ${version.candidateContent} fork 候选 ${nextCandidateRef || ""} 并创建实验 ${nextRunCode || ""}`.trim());
      if (Number.isInteger(nextRunId) && nextRunId > 0) {
        startTransition(() => {
          router.push(buildAdminWritingEvalRunsHref({ runId: nextRunId, datasetId: version.experimentSource?.datasetId ?? null }));
        });
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "继续迭代并发起实验失败");
    } finally {
      setForkingVersionId(null);
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
      const response = await fetch("/api/admin/writing-eval/rollouts", {
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
    <section className={adminVersionsSectionClassName}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">Version Ledger</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">保留、丢弃与回滚记录</h2>
        </div>
        <div className="text-sm text-inkMuted">{displayedVersions.length} 条记录</div>
      </div>

      {message ? <div className={cn(adminVersionsRaisedCardCompactClassName, "mt-4 text-sm text-inkSoft")}>{message}</div> : null}
      {focusAsset ? (
        <div className={cn(adminVersionsFocusCardClassName, "mt-4 flex flex-wrap items-start justify-between gap-3")}>
          <div>
            <SectionEyebrow tone="cinnabar">资产聚焦模式</SectionEyebrow>
            <div className="mt-2 text-sm leading-7 text-ink">
              当前只展示 <span className="font-mono">{focusAsset.assetType}</span> · <span className="font-mono">{focusAsset.assetRef}</span> 的版本账本，共 {focusAsset.matchedCount} 条。
            </div>
          </div>
          <SecondaryActionLinks items={focusAssetActionLinks} />
        </div>
      ) : null}

      <div className={cn(adminVersionsPanelBaseClassName, "mt-5 overflow-hidden")}>
        <div className={adminVersionsTableMobileListClassName}>
          {displayedVersions.length ? (
            displayedVersions.map((item) => {
              const advisory = buildRolloutAdvisory(item);
              const primaryFeedbackSummary = getPrimaryFeedbackSummary(item);
              const sourcePromptPageHref = isPromptBackedVersionType(item.versionType) ? buildAdminPromptVersionHref(item.sourceVersion, item.targetKey) : null;
              const promptPageHref = isPromptBackedVersionType(item.versionType) ? buildAdminPromptVersionHref(item.candidateContent, item.targetKey) : null;
              const selected = selectedVersionId === item.id;
              return (
                <article
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setSelectedVersionId(item.id)}
                  onKeyDown={(event) => handleSelectableCardKeyDown(event, () => setSelectedVersionId(item.id))}
                  className={getVersionsMobileCardClassName(selected)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                        {formatWritingEvalDateTime(item.createdAt)}
                      </div>
                      <div className="mt-3 font-serifCn text-2xl text-ink text-balance">
                        {getVersionTypeLabel(item.versionType)}
                      </div>
                      <div className="mt-2 text-sm text-inkSoft">{item.targetKey}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn("text-xs uppercase tracking-[0.18em]", getDecisionTextTone(item.decision))}>
                        {item.decision}
                      </div>
                      <div className="mt-2 text-xs text-inkMuted">{toStatusLabel(item)}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-inkSoft sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">来源版本</div>
                      <div className="mt-1 break-all font-mono text-xs text-inkSoft">
                        {sourcePromptPageHref ? (
                          <Link
                            href={sourcePromptPageHref}
                            onClick={(event) => event.stopPropagation()}
                            className="transition hover:text-cinnabar"
                          >
                            {item.sourceVersion}
                          </Link>
                        ) : (
                          item.sourceVersion
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">目标版本</div>
                      <div className="mt-1 break-all font-mono text-xs text-ink">
                        {promptPageHref ? (
                          <Link
                            href={promptPageHref}
                            onClick={(event) => event.stopPropagation()}
                            className="transition hover:text-cinnabar"
                          >
                            {item.candidateContent}
                          </Link>
                        ) : (
                          item.candidateContent
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">总分</div>
                      <div className="mt-1 text-inkSoft">
                        {typeof getNumber(item.scoreSummary.totalScore) === "number" ? getNumber(item.scoreSummary.totalScore)?.toFixed(2) : "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">操作人</div>
                      <div className="mt-1 text-inkSoft">{item.approvedBy ?? "--"}</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm leading-7 text-inkSoft">
                    {item.rolloutStats ? (
                      <div>
                        命中 {item.rolloutStats.totalHitCount} 次 / {item.rolloutStats.uniqueUserCount} 人
                        <br />
                        {item.rolloutStats.lastHitAt ? `最近命中 ${formatWritingEvalDateTime(item.rolloutStats.lastHitAt)}` : "尚无灰度命中"}
                      </div>
                    ) : (
                      <div>暂无灰度统计</div>
                    )}
                    {item.rolloutConfig ? <div className="mt-2 text-inkMuted">自动模式：{item.rolloutConfig.autoMode}</div> : null}
                    {primaryFeedbackSummary ? (
                      <div className="mt-2 text-inkMuted">
                        {getFeedbackSummaryLabel(item)} {primaryFeedbackSummary.feedbackCount} 条
                        <br />
                        爆款 {formatWritingEvalMetric(primaryFeedbackSummary.averageObservedViralScore, "", 2)} · 打开 {formatWritingEvalMetric(primaryFeedbackSummary.averageOpenRate, "%", 1)}
                      </div>
                    ) : (
                      <div className="mt-2 text-inkMuted">暂无回流反馈</div>
                    )}
                    {advisory ? (
                      <div className={cn("mt-2", getAdvisoryInlineTone(advisory.tone))}>
                        {advisory.headline}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">原因</div>
                    <div className="mt-2 text-sm leading-7 text-inkSoft">{item.decisionReason || "暂无"}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {promptPageHref ? (
                      <Link
                        href={promptPageHref}
                        onClick={(event) => event.stopPropagation()}
                        className={adminVersionsSecondaryButtonClassName}
                      >
                        Prompts
                      </Link>
                    ) : null}
                    {item.decision === "keep" ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRollback(item.id);
                        }}
                        className={adminVersionsSecondaryButtonClassName}
                        disabled={rollingBackId === item.id}
                      >
                        {rollingBackId === item.id ? "回滚中…" : "回滚到来源版本"}
                      </button>
                    ) : (
                      <span className="text-xs text-inkMuted">不可回滚</span>
                    )}
                    {isPromptBackedVersionType(item.versionType) && item.experimentSource?.datasetId ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleForkPromptCandidate(item);
                        }}
                        className={adminVersionsSecondaryButtonClassName}
                        disabled={forkingVersionId === item.id}
                      >
                        {forkingVersionId === item.id ? "创建中…" : "继续迭代并发起实验"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className={adminVersionsDashedNoticeClassName}>
              {focusAsset ? "当前聚焦资产还没有匹配的版本账本记录。" : "当前还没有版本账本记录。"}
            </div>
          )}
        </div>
        <div className={adminVersionsTableDesktopShellClassName}>
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="text-inkMuted">
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
                  const sourcePromptPageHref = isPromptBackedVersionType(item.versionType) ? buildAdminPromptVersionHref(item.sourceVersion, item.targetKey) : null;
                  const promptPageHref = isPromptBackedVersionType(item.versionType) ? buildAdminPromptVersionHref(item.candidateContent, item.targetKey) : null;
                  return (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-t border-line align-top ${selectedVersionId === item.id ? "bg-surfaceWarning" : ""}`}
                      onClick={() => setSelectedVersionId(item.id)}
                    >
                      <td className="py-4 text-inkSoft">{formatWritingEvalDateTime(item.createdAt)}</td>
                      <td className="py-4 text-ink">
                        {getVersionTypeLabel(item.versionType)} · {item.targetKey}
                      </td>
                      <td className="py-4 font-mono text-xs text-inkSoft">
                        {sourcePromptPageHref ? (
                          <Link href={sourcePromptPageHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                            {item.sourceVersion}
                          </Link>
                        ) : (
                          item.sourceVersion
                        )}
                      </td>
                      <td className="py-4 font-mono text-xs text-ink">
                        {promptPageHref ? (
                          <Link href={promptPageHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                            {item.candidateContent}
                          </Link>
                        ) : (
                          item.candidateContent
                        )}
                      </td>
                      <td className={`py-4 ${getDecisionTextTone(item.decision)}`}>
                        {item.decision}
                      </td>
                      <td className="py-4 text-inkSoft">{toStatusLabel(item)}</td>
                      <td className="py-4 text-xs leading-6 text-inkSoft">
                        {item.rolloutStats ? (
                          <div>
                            命中 {item.rolloutStats.totalHitCount} 次 / {item.rolloutStats.uniqueUserCount} 人
                            <br />
                            {item.rolloutStats.lastHitAt ? `最近命中 ${formatWritingEvalDateTime(item.rolloutStats.lastHitAt)}` : "尚无灰度命中"}
                          </div>
                        ) : (
                          <div>暂无灰度统计</div>
                        )}
                        {item.rolloutConfig ? <div className="mt-2 text-inkMuted">自动模式：{item.rolloutConfig.autoMode}</div> : null}
                        {primaryFeedbackSummary ? (
                          <div className="mt-2 text-inkMuted">
                            {getFeedbackSummaryLabel(item)} {primaryFeedbackSummary.feedbackCount} 条
                            <br />
                            爆款 {formatWritingEvalMetric(primaryFeedbackSummary.averageObservedViralScore, "", 2)} · 打开 {formatWritingEvalMetric(primaryFeedbackSummary.averageOpenRate, "%", 1)}
                          </div>
                        ) : (
                          <div className="mt-2 text-inkMuted">暂无回流反馈</div>
                        )}
                        {advisory ? (
                          <div className={`mt-2 ${getAdvisoryInlineTone(advisory.tone)}`}>
                            {advisory.headline}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-4 text-inkSoft">{item.decisionReason || "暂无"}</td>
                      <td className="py-4 text-inkSoft">
                        {typeof getNumber(item.scoreSummary.totalScore) === "number" ? getNumber(item.scoreSummary.totalScore)?.toFixed(2) : "--"}
                      </td>
                      <td className="py-4 text-inkSoft">{item.approvedBy ?? "--"}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-2">
                          {promptPageHref ? (
                            <Link href={promptPageHref} className={adminVersionsSecondaryButtonClassName}>
                              Prompts
                            </Link>
                          ) : null}
                          {item.decision === "keep" ? (
                            <button
                              type="button"
                              onClick={() => void handleRollback(item.id)}
                              className={adminVersionsSecondaryButtonClassName}
                              disabled={rollingBackId === item.id}
                            >
                              {rollingBackId === item.id ? "回滚中…" : "回滚到来源版本"}
                            </button>
                          ) : (
                            <span className="text-xs text-inkMuted">不可回滚</span>
                          )}
                          {isPromptBackedVersionType(item.versionType) && item.experimentSource?.datasetId ? (
                            <button
                              type="button"
                              onClick={() => void handleForkPromptCandidate(item)}
                              className={adminVersionsSecondaryButtonClassName}
                              disabled={forkingVersionId === item.id}
                            >
                              {forkingVersionId === item.id ? "创建中…" : "继续迭代并发起实验"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })()
              ))}
              {displayedVersions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-6 text-inkMuted">
                    {focusAsset ? "当前聚焦资产还没有匹配的版本账本记录。" : "当前还没有版本账本记录。"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className={adminVersionsWideSectionClassName}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionEyebrow>实验来源</SectionEyebrow>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {selectedVersion?.experimentSource ? (
                  <>
                    <div>
                      Run：
                      {selectedExperimentRunHref ? (
                        <Link href={selectedExperimentRunHref} className="ml-1 font-mono text-ink transition hover:text-cinnabar">
                          {selectedVersion.experimentSource.runCode || "--"}
                        </Link>
                      ) : (
                        <span className="ml-1 font-mono text-ink">{selectedVersion.experimentSource.runCode || "--"}</span>
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
                        ? formatWritingEvalDateTime(selectedVersion.experimentSource.createdAt)
                        : "暂无"}
                    </div>
                  </>
                ) : (
                  <div>当前账本记录缺少对应实验上下文。</div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <SecondaryActionLinks items={selectedExperimentActionLinks} />
              {selectedVersion && selectedCanForkPromptCandidate ? (
                <button
                  type="button"
                  className={adminVersionsPrimaryButtonClassName}
                  onClick={() => void handleForkPromptCandidate(selectedVersion)}
                  disabled={forkingVersionId === selectedVersion.id}
                >
                  {forkingVersionId === selectedVersion.id ? "创建中…" : "继续迭代并发起实验"}
                </button>
              ) : null}
              {selectedVersion && isPromptBackedVersionType(selectedVersion.versionType) ? (
                <Link
                  href={buildAdminWritingEvalVersionsHref({
                    assetType: selectedVersion.versionType,
                    assetRef: selectedVersion.candidateContent,
                    versionId: selectedVersion.id,
                  })}
                  className={adminVersionsSecondaryButtonClassName}
                >
                  聚焦当前资产账本
                </Link>
              ) : null}
              {!selectedCanForkPromptCandidate && selectedForkRunHref ? (
                <Link href={selectedForkRunHref} className={adminVersionsSecondaryButtonClassName}>
                  去 Runs 手动发起
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className={adminVersionsWideSectionClassName}>
          <SectionEyebrow>运营判断</SectionEyebrow>
          {selectedRolloutAdvisory ? (
            <div className="mt-4 space-y-4">
              <div className={`border px-4 py-4 ${getAdvisoryPanelTone(selectedRolloutAdvisory.tone)}`}>
                <div className={`text-xs uppercase tracking-[0.18em] ${getAdvisoryTextTone(selectedRolloutAdvisory.tone)}`}>
                  {selectedRolloutAdvisory.headline}
                </div>
                <div className="mt-3 text-sm leading-7 text-ink">{selectedRolloutAdvisory.summary}</div>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <AdvisoryPanel title="告警依据" contentClassName="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
                  <>
                    {selectedRolloutAdvisory.reasons.map((reason) => (
                      <div key={reason}>{reason}</div>
                    ))}
                  </>
                </AdvisoryPanel>
                <AdvisoryPanel title="下一步建议" contentClassName="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
                  <>
                    {selectedRolloutAdvisory.nextSteps.map((step) => (
                      <div key={step}>{step}</div>
                    ))}
                  </>
                </AdvisoryPanel>
              </div>
              {selectedRolloutFollowupActionLinks.length ? (
                <AdvisoryPanel title="联动排查">
                  <div>
                    <SecondaryActionLinks items={selectedRolloutFollowupActionLinks} />
                  </div>
                </AdvisoryPanel>
              ) : null}
              {canEditRollout && selectedRolloutPresets.length > 0 ? (
                <AdvisoryPanel title="推荐灰度方案" contentClassName="mt-3 space-y-3">
                  <>
                    <div className="flex flex-wrap gap-3">
                      {selectedRolloutPresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className={adminVersionsSecondaryButtonClassName}
                          onClick={() => applyRolloutPreset(preset)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2 text-sm text-inkSoft">
                      {selectedRolloutPresets.map((preset) => (
                        <div key={`${preset.label}-desc`}>
                          {preset.label}：{preset.description}
                        </div>
                      ))}
                    </div>
                  </>
                </AdvisoryPanel>
              ) : null}
            </div>
          ) : (
            <div className={cn(adminVersionsMutedNoticeClassName, "mt-4")}>
              当前对象不是支持灰度的实验资产，暂不生成运营告警与放量建议。
            </div>
          )}
        </div>

        <div className={adminVersionsWideSectionClassName}>
          <SectionEyebrow>得分摘要</SectionEyebrow>
          <SummaryStatGrid
            className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6"
            items={[
              { label: "候选总分", value: typeof getNumber(selectedVersion?.scoreSummary.totalScore) === "number" ? getNumber(selectedVersion?.scoreSummary.totalScore)!.toFixed(2) : "--" },
              { label: "基线总分", value: typeof getNumber(selectedVersion?.scoreSummary.baseTotalScore) === "number" ? getNumber(selectedVersion?.scoreSummary.baseTotalScore)!.toFixed(2) : "--" },
              {
                label: "总分 Delta",
                value: typeof getNumber(selectedVersion?.scoreSummary.deltaTotalScore) === "number" ? getNumber(selectedVersion?.scoreSummary.deltaTotalScore)!.toFixed(2) : "--",
                tone: (getNumber(selectedVersion?.scoreSummary.deltaTotalScore) ?? 0) < 0 ? "text-cinnabar" : "text-emerald-400",
              },
              { label: "候选质量", value: typeof getNumber(selectedVersion?.scoreSummary.qualityScore) === "number" ? getNumber(selectedVersion?.scoreSummary.qualityScore)!.toFixed(2) : "--" },
              { label: "候选爆款", value: typeof getNumber(selectedVersion?.scoreSummary.viralScore) === "number" ? getNumber(selectedVersion?.scoreSummary.viralScore)!.toFixed(2) : "--" },
              {
                label: "失败样本",
                value:
                  typeof getNumber(selectedVersion?.scoreSummary.failedCaseCount) === "number"
                    ? String(getNumber(selectedVersion?.scoreSummary.failedCaseCount))
                    : "--",
              },
            ]}
          />
        </div>

        <div className={adminVersionsWideSectionClassName}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionEyebrow tone="cinnabar">线上灰度</SectionEyebrow>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {selectedVersion && isRolloutVersionType(selectedVersion.versionType)
                  ? `${getVersionTypeLabel(selectedVersion.versionType)} · ${selectedVersion.candidateContent}`
                  : "仅 prompt_version、layout_strategy（写作风格资产）、apply_command_template、scoring_profile 支持这里的灰度配置。"}
              </div>
            </div>
            {selectedVersion && isRolloutVersionType(selectedVersion.versionType) ? (
              <div className="flex flex-wrap gap-3">
                {selectedVersion.versionType === "prompt_version" && selectedPromptPageHref ? (
                  <Link href={selectedPromptPageHref} className={adminVersionsSecondaryButtonClassName}>
                    打开 Prompts 页
                  </Link>
                ) : null}
                <button
                  type="button"
                  className={adminVersionsSecondaryButtonClassName}
                  onClick={() => void handleSaveRollout()}
                  disabled={!canEditRollout || savingRollout || !selectedRolloutAdmission.canEnable}
                >
                  {savingRollout ? "保存中…" : "保存灰度配置"}
                </button>
              </div>
            ) : null}
          </div>

          {selectedVersion && isRolloutVersionType(selectedVersion.versionType) ? (
            canEditRollout ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ToggleConfigCard
                    label="启用灰度"
                    checked={rolloutForm.isEnabled}
                    onChange={(checked) => setRolloutForm((prev) => ({ ...prev, isEnabled: checked }))}
                  />
                  <ToggleConfigCard
                    label="仅观察流量"
                    checked={rolloutForm.rolloutObserveOnly}
                    onChange={(checked) => setRolloutForm((prev) => ({ ...prev, rolloutObserveOnly: checked }))}
                  />
                  <ConfigCard title="自动模式" compact>
                    <select aria-label="select control"
                      value={rolloutForm.autoMode}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, autoMode: event.target.value as RolloutAutoMode }))}
                      className={adminVersionsSelectClassName}
                    >
                      <option value="manual">manual</option>
                      <option value="recommendation">recommendation</option>
                    </select>
                  </ConfigCard>
                  <ConfigCard title="命中比例" compact>
                    <input aria-label="0-100"
                      value={rolloutForm.rolloutPercentage}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, rolloutPercentage: event.target.value }))}
                      placeholder="0-100"
                      className={adminVersionsInputClassName}
                    />
                  </ConfigCard>
                  <ConfigCard title="当前观测" compact>
                    <div className="mt-3 text-sm leading-7 text-inkSoft">
                      {selectedVersion.rolloutStats ? `${selectedVersion.rolloutStats.totalHitCount} 次 / ${selectedVersion.rolloutStats.uniqueUserCount} 人` : "暂无"}
                    </div>
                  </ConfigCard>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <ConfigCard title="套餐白名单">
                    <input aria-label="pro, ultra"
                      value={rolloutForm.rolloutPlanCodes}
                      onChange={(event) => setRolloutForm((prev) => ({ ...prev, rolloutPlanCodes: event.target.value }))}
                      placeholder="pro, ultra"
                      className={adminVersionsInputClassName}
                    />
                    <div className="mt-2 text-xs leading-6 text-inkMuted">多个套餐用逗号分隔；为空时仅看观察优先开关和比例。</div>
                  </ConfigCard>
                  <ConfigCard title={supportsRolloutNotes ? "备注" : "治理说明"}>
                    {supportsRolloutNotes ? (
                      <>
                        <textarea aria-label="记录灰度目标、风险点或预计观察窗口"
                          value={rolloutForm.notes}
                          onChange={(event) => setRolloutForm((prev) => ({ ...prev, notes: event.target.value }))}
                          placeholder="记录灰度目标、风险点或预计观察窗口"
                          className={adminVersionsTextareaClassName}
                        />
                        <div className="mt-2 text-xs leading-6 text-inkMuted">
                          `recommendation` 会允许 scheduler 按线上回流自动收缩、限流或谨慎扩量；`manual` 只保留提示，不自动改配置。
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-sm leading-7 text-inkSoft">
                        Prompt 版本只保存自动模式、观察优先、百分比和套餐白名单；具体变更原因以审计日志为主，不单独维护 rollout notes。
                      </div>
                    )}
                  </ConfigCard>
                </div>
                <div className={`mt-3 border px-4 py-4 ${getAdmissionPanelTone(selectedRolloutAdmission.canEnable)}`}>
                  <div className={`text-xs uppercase tracking-[0.16em] ${getAdmissionTextTone(selectedRolloutAdmission.canEnable)}`}>
                    {selectedRolloutAdmission.canEnable ? "已通过灰度准入校验" : "未通过灰度准入校验"}
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-ink">
                    {selectedRolloutAdmission.canEnable ? (
                      <div>当前配置满足准入门槛，可以保存灰度配置。</div>
                    ) : (
                      selectedRolloutAdmission.blockers.map((blocker) => <div key={blocker}>{blocker}</div>)
                    )}
                  </div>
                </div>
                <SummaryStatGrid
                  className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                  items={[
                    { label: "观察流量命中用户", value: selectedVersion.rolloutStats?.observeUserCount ?? 0 },
                    { label: "套餐命中用户", value: selectedVersion.rolloutStats?.planUserCount ?? 0 },
                    { label: "比例命中用户", value: selectedVersion.rolloutStats?.percentageUserCount ?? 0 },
                    { label: "稳定命中用户", value: selectedVersion.rolloutStats?.stableUserCount ?? 0 },
                  ]}
                />
                <RolloutAuditSection
                  title="自动放量审计"
                  description={
                    selectedVersion?.versionType === "prompt_version"
                      ? "只展示 scheduler 针对当前 Prompt 版本写入的 `prompt_rollout_auto_manage` 审计，用于追踪自动收缩、限流和扩量原因。"
                      : "只展示 scheduler 针对当前资产写入的 `writing_asset_rollout_auto_manage` 审计，用于追踪自动收缩、限流和扩量原因。"
                  }
                  logs={selectedRolloutAuditLogs}
                  actionLinks={selectedRolloutAuditActionLinks}
                  emptyState={
                    selectedVersion?.versionType === "prompt_version"
                      ? "当前 Prompt 版本还没有自动放量审计记录。若 `autoMode=recommendation` 且 scheduler 已运行，后续会在这里显示每次自动调整。"
                      : "当前资产还没有自动放量审计记录。若 `autoMode=recommendation` 且 scheduler 已运行，后续会在这里显示每次自动调整。"
                  }
                  emptyReasonFallback="本次自动放量未写入原因。"
                  showTimeline
                />
              </>
            ) : (
              <div className={cn(adminVersionsInsetCardClassName, "mt-4 text-sm text-inkSoft")}>
                {selectedVersion?.versionType === "prompt_version" && selectedVersion.isCurrentActive ? (
                  "当前 Prompt 版本已经全量生效，无需再配置灰度窗口。"
                ) : (
                  <>
                    当前版本决策为 <span className="text-ink">{selectedVersion?.decision}</span>，仅保留版本允许配置线上灰度。
                  </>
                )}
              </div>
            )
          ) : null}
        </div>

        {selectedVersion?.versionType === "prompt_version" ? (
          <div className={adminVersionsWideSectionClassName}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionEyebrow tone="cinnabar">Prompt 灰度治理</SectionEyebrow>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  聚焦当前 prompt 版本的自动灰度配置、账本判断和 scheduler 审计，不和通用写作资产治理混在一起看。
                </div>
              </div>
              <SecondaryActionLinks items={selectedPromptGovernanceActionLinks} />
            </div>

            <SummaryStatGrid
              className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              items={[
                { label: "自动模式", value: selectedPromptRolloutConfig?.autoMode || "manual" },
                { label: "观察优先", value: selectedPromptRolloutConfig?.rolloutObserveOnly ? "仅观察流量" : "公开灰度", tone: selectedPromptRolloutConfig?.rolloutObserveOnly ? "text-amber-300" : "text-ink" },
                { label: "灰度比例", value: `${Math.round(Number(selectedPromptRolloutConfig?.rolloutPercentage ?? 0))}%` },
                { label: "套餐白名单", value: selectedPromptRolloutConfig?.rolloutPlanCodes.length ? selectedPromptRolloutConfig.rolloutPlanCodes.join(", ") : "--" },
              ]}
            />

            <SummaryStatGrid
              className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              items={[
                {
                  label: "账本决策",
                  value: selectedPromptRolloutAssessment?.ledgerDecision || (selectedPromptRolloutAssessment?.hasLedger ? "--" : "missing"),
                  tone:
                    selectedPromptRolloutAssessment?.ledgerDecision
                      ? getDecisionTextTone(selectedPromptRolloutAssessment.ledgerDecision)
                      : "text-ink",
                },
                {
                  label: "来源版本",
                  value: selectedPromptRolloutAssessment?.sourceVersion || "--",
                  href: selectedPromptAssessmentSourceHref || undefined,
                },
                {
                  label: "总分 Delta",
                  value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.deltaTotalScore, "", 2),
                  tone: (selectedPromptRolloutAssessment?.deltaTotalScore ?? 0) < 0 ? "text-cinnabar" : "text-emerald-400",
                },
                { label: "失败样本", value: String(selectedPromptRolloutAssessment?.failedCaseCount ?? 0) },
              ]}
            />

            <SummaryStatGrid
              className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              items={[
                { label: "爆款潜力", value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.observedViralScore, "", 2), valueClassName: "text-sm leading-7" },
                { label: "打开率", value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.openRate, "%", 1), valueClassName: "text-sm leading-7" },
                { label: "读完率", value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.readCompletionRate, "%", 1), valueClassName: "text-sm leading-7" },
                { label: "反馈数", value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.feedbackCount, "", 0), valueClassName: "text-sm leading-7" },
                { label: "唯一用户", value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.uniqueUsers, "", 0), valueClassName: "text-sm leading-7" },
                { label: "总命中", value: formatWritingEvalMetric(selectedPromptRolloutAssessment?.totalHitCount, "", 0), valueClassName: "text-sm leading-7" },
                {
                  label: "最近命中",
                  value: selectedPromptRolloutAssessment?.lastHitAt ? formatWritingEvalDateTime(selectedPromptRolloutAssessment.lastHitAt) : "--",
                  valueClassName: "text-sm leading-7",
                },
                {
                  label: "Prompt Ref",
                  value: selectedPromptRolloutAssessment?.ref || selectedVersion.candidateContent,
                  href: selectedPromptPageHref || undefined,
                  valueClassName: "text-sm leading-7 text-ink",
                },
              ]}
            />

            <RolloutAuditSection
              title="Prompt 自动治理审计"
              description="这里单独展示 `prompt_rollout_auto_manage` 审计，便于核对 prompt scheduler 何时收缩、维持或扩量。"
              logs={selectedPromptRolloutAuditLogs}
              actionLinks={selectedPromptRolloutAuditActionLinks}
              emptyState="当前 prompt 版本还没有自动治理审计记录。若 `autoMode=recommendation` 且 scheduler 已运行，后续会在这里显示治理轨迹。"
              emptyReasonFallback="本次 prompt 自动治理未写入原因。"
            />
          </div>
        ) : null}

        <VersionPreviewPanel
          title="来源版本预览"
          label={selectedVersion ? selectedVersion.sourceLabel : "暂无"}
          actionLinks={selectedSourcePreviewActionLinks}
          preview={selectedVersion?.sourcePreview}
          emptyPreview="当前账本记录没有可展示的来源内容。"
        />

        <VersionPreviewPanel
          title="目标版本预览"
          tone="cinnabar"
          label={selectedVersion ? selectedVersion.candidateLabel : "暂无"}
          actionLinks={selectedTargetPreviewActionLinks}
          preview={selectedVersion?.candidatePreview}
          emptyPreview="当前账本记录没有可展示的目标内容。"
        />
      </section>
    </section>
  );
}
