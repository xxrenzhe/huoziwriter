"use client";

import Link from "next/link";
import { startTransition, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";
import {
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
} from "@/lib/admin-writing-eval-links";
import { formatWritingEvalMetric } from "@/lib/writing-eval-format";
import { getWritingEvalExecutionTone } from "@/lib/writing-eval-view";

type WeightRecommendation = {
  key: string;
  label: string;
  currentWeight: number;
  recommendedWeight: number;
  deltaWeight: number;
  sampleCount: number;
  correlation: number | null;
  lift: number | null;
  confidence: number;
  recommendation: string;
  reason: string;
};

type CalibrationCase = {
  feedbackId: number;
  runId: number | null;
  resultId: number | null;
  datasetId: number | null;
  caseId: number | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
  taskCode: string | null;
  topicTitle: string | null;
  articleTitle: string | null;
  predictedViralScore: number | null;
  observedViralScore: number | null;
  calibrationGap: number | null;
  openRate: number | null;
  readCompletionRate: number | null;
  shareRate: number | null;
};

type OnlineCalibration = {
  feedbackCount: number;
  linkedResultCount: number;
  averageObservedViralScore: number | null;
  averagePredictedViralScore: number | null;
  averageCalibrationGap: number | null;
  weightRecommendations: WeightRecommendation[];
  falsePositiveCases: CalibrationCase[];
  falseNegativeCases: CalibrationCase[];
};

type StrategyRecommendation = {
  code: string;
  label: string;
  description: string;
  primaryScheduleId: number | null;
  primaryExecutableScheduleId: number | null;
  scheduleIds: number[];
  enabledScheduleCount: number;
  executableScheduleCount: number;
  blockedScheduleCount: number;
  currentPriority: number | null;
  currentCadenceHours: number | null;
  currentDecisionMode: string | null;
  recommendedPriority: number;
  recommendedCadenceHours: number;
  recommendedDecisionMode: string;
  urgencyScore: number;
  confidence: number;
  recommendation: string;
  reason: string;
  triggers: string[];
  executionState: "executable" | "blocked" | "missing";
  executionBlocker: string | null;
};

type ScoringProfileItem = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
};

function formatCaseSource(item: CalibrationCase) {
  if (item.sourceLabel) return item.sourceLabel;
  if (item.runId) return `${item.taskCode || "unknown"} · run#${item.runId}`;
  if (item.taskCode) return item.taskCode;
  if (item.sourceType) return item.sourceType;
  return "unknown";
}

function getDecisionModeLabel(value: string | null | undefined) {
  if (value === "auto_keep") return "自动 keep";
  if (value === "auto_keep_or_discard") return "自动 keep/discard";
  return "人工审核";
}

function getStrategyActionLabel(item: Pick<StrategyRecommendation, "executionState" | "primaryExecutableScheduleId">) {
  if (item.primaryExecutableScheduleId) return "打开可执行调度";
  if (item.executionState === "blocked") return "修复阻断规则";
  if (item.executionState === "missing") return "创建或启用调度";
  return "打开对应调度";
}

const adminInsightsSectionClassName = cn(
  surfaceCardStyles(),
  "border-line bg-paperStrong p-5 shadow-none",
);
const adminInsightsInsetCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-4 py-4 shadow-none",
);
const adminInsightsSubcardClassName = cn(
  surfaceCardStyles(),
  "rounded border-lineStrong bg-surfaceWarm px-3 py-3 shadow-none",
);
const adminInsightsTriggerBadgeClassName = "border border-lineStrong bg-surface px-2 py-1 text-xs text-inkSoft";
const adminInsightsFeedbackBaseClassName = cn(
  surfaceCardStyles(),
  "mt-3 px-3 py-3 text-sm leading-6 shadow-none",
);
const adminInsightsFeedbackDangerClassName = cn(
  adminInsightsFeedbackBaseClassName,
  "border-cinnabar/40 bg-surfaceWarning text-cinnabar",
);
const adminInsightsFeedbackSuccessClassName = cn(
  adminInsightsFeedbackBaseClassName,
  "border-emerald-900 bg-emerald-950/30 text-emerald-300",
);

function getFeedbackClassName(message: string) {
  return message.includes("失败")
    ? adminInsightsFeedbackDangerClassName
    : adminInsightsFeedbackSuccessClassName;
}

export function AdminWritingEvalInsightsClient({
  onlineCalibration,
  strategyRecommendations,
  scoringProfiles,
}: {
  onlineCalibration: OnlineCalibration;
  strategyRecommendations: StrategyRecommendation[];
  scoringProfiles: ScoringProfileItem[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    baseProfileId: String(scoringProfiles.find((item) => item.isActive)?.id ?? scoringProfiles[0]?.id ?? ""),
    code: "",
    name: "",
    isActive: false,
  });

  async function handleCreateCalibratedProfile(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/admin/writing-eval/scoring-profiles/calibrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseProfileId: Number(form.baseProfileId),
        code: form.code || undefined,
        name: form.name || undefined,
        isActive: form.isActive,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      data?: { code?: string; name?: string };
    };
    setSubmitting(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "创建校准版评分画像失败");
      return;
    }
    setMessage(`已创建校准版评分画像 ${json.data?.code || json.data?.name || ""}`.trim());
    setForm((prev) => ({ ...prev, code: "", name: "", isActive: false }));
    startTransition(() => router.refresh());
  }

  return (
    <section className={adminInsightsSectionClassName}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Online Calibration</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">线上回流校准面板</h2>
        </div>
        <div className="text-sm text-inkMuted">
          {onlineCalibration.feedbackCount} 条反馈 · {onlineCalibration.linkedResultCount} 条已绑定样本
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {[
          {
            label: "观察爆款分",
            value: onlineCalibration.averageObservedViralScore,
            tone: "text-ink",
          },
          {
            label: "离线预测爆款分",
            value: onlineCalibration.averagePredictedViralScore,
            tone: "text-inkSoft",
          },
          {
            label: "平均校准偏差",
            value: onlineCalibration.averageCalibrationGap,
            tone: (onlineCalibration.averageCalibrationGap ?? 0) >= 0 ? "text-emerald-400" : "text-cinnabar",
          },
          {
            label: "可用绑定样本",
            value: onlineCalibration.linkedResultCount,
            tone: "text-ink",
          },
        ].map((item) => (
          <div key={item.label} className={adminInsightsInsetCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
            <div className={`mt-3 text-2xl ${item.tone}`}>
              {typeof item.value === "number" ? item.value.toFixed(2) : "--"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">agentStrategy 动态建议</div>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {strategyRecommendations.map((item) => (
              <div key={item.code} className={adminInsightsInsetCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.code}</div>
                    <div className="mt-2 text-lg text-ink">{item.label}</div>
                  </div>
                  <div className="text-right text-xs text-inkMuted">
                    紧急度 {(item.urgencyScore * 100).toFixed(0)}%
                    <br />
                    置信度 {(item.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="mt-3 text-sm leading-6 text-inkSoft">{item.description}</div>
                <div className={cn("mt-4 text-sm leading-6 text-inkSoft", adminInsightsSubcardClassName)}>
                  <div>{item.recommendation}</div>
                  <div className="mt-1 text-inkMuted">{item.reason}</div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-inkSoft md:grid-cols-2">
                  <div>
                    当前：P{item.currentPriority ?? "--"} · {item.currentCadenceHours ?? "--"}h · {getDecisionModeLabel(item.currentDecisionMode)}
                  </div>
                  <div>
                    建议：P{item.recommendedPriority} · {item.recommendedCadenceHours}h · {getDecisionModeLabel(item.recommendedDecisionMode)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-inkMuted">
                  <span>已启用规则 {item.enabledScheduleCount} 条</span>
                  <span>可执行 {item.executableScheduleCount} 条</span>
                  {item.blockedScheduleCount > 0 ? <span>阻断 {item.blockedScheduleCount} 条</span> : null}
                  <span className={`border px-2 py-1 uppercase tracking-[0.16em] ${getWritingEvalExecutionTone(item.executionState)}`}>{item.executionState}</span>
                </div>
                {item.executionBlocker ? (
                  <div className={`mt-2 text-xs leading-6 ${item.executionState === "blocked" ? "text-cinnabar" : "text-inkMuted"}`}>
                    执行提示：{item.executionBlocker}
                  </div>
                ) : null}
                {item.triggers.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.triggers.map((trigger) => (
                      <span key={trigger} className={adminInsightsTriggerBadgeClassName}>
                        {trigger}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3">
                  <Link
                    href={buildAdminWritingEvalRunsHref({ scheduleId: item.primaryExecutableScheduleId ?? item.primaryScheduleId })}
                    className={uiPrimitives.adminSecondaryButton}
                  >
                    {getStrategyActionLabel(item)}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={handleCreateCalibratedProfile} className={adminInsightsInsetCardClassName}>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">生成校准版画像</div>
          <div className="mt-4 space-y-3">
            <select aria-label="select control" value={form.baseProfileId} onChange={(event) => setForm((prev) => ({ ...prev, baseProfileId: event.target.value }))} className={uiPrimitives.adminSelect}>
              <option value="">选择基线评分画像</option>
              {scoringProfiles.map((profile) => (
                <option key={profile.id} value={String(profile.id)}>
                  {profile.name} · {profile.code}
                  {profile.isActive ? " · active" : ""}
                </option>
              ))}
            </select>
            <input aria-label="新画像编码，可留空自动生成" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="新画像编码，可留空自动生成" className={uiPrimitives.adminInput} />
            <input aria-label="新画像名称，可留空自动生成" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="新画像名称，可留空自动生成" className={uiPrimitives.adminInput} />
            <label className="flex items-center gap-2 text-sm text-inkSoft">
              <input aria-label="input control" type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
              创建后立即设为 active
            </label>
            <div className={cn("text-sm leading-6 text-inkSoft", adminInsightsSubcardClassName)}>
              当前会基于线上回流建议与原画像权重做 50% / 50% 混合，优先降低误判风险，再生成一个可回滚的新画像版本。
            </div>
            <button disabled={submitting || !form.baseProfileId} className={uiPrimitives.primaryButton}>
              {submitting ? "生成中…" : "生成校准版评分画像"}
            </button>
            {message ? (
              <div aria-live="polite" className={getFeedbackClassName(message)}>
                {message}
              </div>
            ) : null}
          </div>
        </form>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="xl:col-span-2">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">爆款分项权重建议</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-inkMuted">
                <tr>
                  {["分项", "当前权重", "建议权重", "Delta", "相关性", "Lift", "置信度", "建议"].map((head) => (
                    <th key={head} className="pb-4 font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {onlineCalibration.weightRecommendations.map((item) => (
                  <tr key={item.key} className="border-t border-line">
                    <td className="py-4 text-ink">{item.label}</td>
                    <td className="py-4 text-inkSoft">{(item.currentWeight * 100).toFixed(1)}%</td>
                    <td className="py-4 text-ink">{(item.recommendedWeight * 100).toFixed(1)}%</td>
                    <td className={`py-4 ${item.deltaWeight >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                      {item.deltaWeight >= 0 ? "+" : ""}
                      {(item.deltaWeight * 100).toFixed(1)}%
                    </td>
                    <td className="py-4 text-inkSoft">{typeof item.correlation === "number" ? item.correlation.toFixed(2) : "--"}</td>
                    <td className="py-4 text-inkSoft">{typeof item.lift === "number" ? item.lift.toFixed(2) : "--"}</td>
                    <td className="py-4 text-inkSoft">{(item.confidence * 100).toFixed(0)}%</td>
                    <td className="py-4 text-inkSoft">
                      <div>{item.recommendation}</div>
                      <div className="mt-1 text-xs text-inkMuted">{item.reason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">离线高分但线上不爆</div>
          <div className="space-y-3">
            {onlineCalibration.falsePositiveCases.map((item) => (
              <div key={`fp-${item.feedbackId}`} className={adminInsightsInsetCardClassName}>
                <div className="font-mono text-xs text-inkSoft">{formatCaseSource(item)}</div>
                <div className="mt-2 text-ink">{item.topicTitle || item.articleTitle || "未命名样本"}</div>
                <div className="mt-2 text-sm text-cinnabar">
                  离线 {formatWritingEvalMetric(item.predictedViralScore)} → 线上 {formatWritingEvalMetric(item.observedViralScore)} · 偏差 {formatWritingEvalMetric(item.calibrationGap)}
                </div>
                <div className="mt-2 text-xs text-inkMuted">
                  打开率 {typeof item.openRate === "number" ? `${item.openRate.toFixed(1)}%` : "--"} · 读完率{" "}
                  {typeof item.readCompletionRate === "number" ? `${item.readCompletionRate.toFixed(1)}%` : "--"} · 分享率{" "}
                  {typeof item.shareRate === "number" ? `${item.shareRate.toFixed(1)}%` : "--"}
                </div>
                {item.runId || item.datasetId ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.runId ? (
                      <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId, resultId: item.resultId })} className={uiPrimitives.adminSecondaryButton}>
                        {item.resultId ? "打开对应样本" : "打开对应 Run"}
                      </Link>
                    ) : null}
                    {item.datasetId ? (
                      <Link href={buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId, caseId: item.caseId })} className={uiPrimitives.adminSecondaryButton}>
                        打开评测样本
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {onlineCalibration.falsePositiveCases.length === 0 ? <div className="text-sm text-inkMuted">暂无明显误判样本。</div> : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">离线低估但线上表现更强</div>
          <div className="space-y-3">
            {onlineCalibration.falseNegativeCases.map((item) => (
              <div key={`fn-${item.feedbackId}`} className={adminInsightsInsetCardClassName}>
                <div className="font-mono text-xs text-inkSoft">{formatCaseSource(item)}</div>
                <div className="mt-2 text-ink">{item.topicTitle || item.articleTitle || "未命名样本"}</div>
                <div className="mt-2 text-sm text-emerald-400">
                  离线 {formatWritingEvalMetric(item.predictedViralScore)} → 线上 {formatWritingEvalMetric(item.observedViralScore)} · 偏差 +{formatWritingEvalMetric(item.calibrationGap)}
                </div>
                <div className="mt-2 text-xs text-inkMuted">
                  打开率 {typeof item.openRate === "number" ? `${item.openRate.toFixed(1)}%` : "--"} · 读完率{" "}
                  {typeof item.readCompletionRate === "number" ? `${item.readCompletionRate.toFixed(1)}%` : "--"} · 分享率{" "}
                  {typeof item.shareRate === "number" ? `${item.shareRate.toFixed(1)}%` : "--"}
                </div>
                {item.runId || item.datasetId ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.runId ? (
                      <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId, resultId: item.resultId })} className={uiPrimitives.adminSecondaryButton}>
                        {item.resultId ? "打开对应样本" : "打开对应 Run"}
                      </Link>
                    ) : null}
                    {item.datasetId ? (
                      <Link href={buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId, caseId: item.caseId })} className={uiPrimitives.adminSecondaryButton}>
                        打开评测样本
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {onlineCalibration.falseNegativeCases.length === 0 ? <div className="text-sm text-inkMuted">暂无明显低估样本。</div> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
