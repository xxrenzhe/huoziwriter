"use client";

import Link from "next/link";
import { startTransition, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";

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

function formatMetric(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

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

function getExecutionTone(state: StrategyRecommendation["executionState"]) {
  if (state === "executable") return "text-emerald-300 border-emerald-500/40";
  if (state === "blocked") return "text-cinnabar border-cinnabar/40";
  return "text-stone-400 border-stone-700";
}

function getStrategyActionLabel(item: Pick<StrategyRecommendation, "executionState" | "primaryExecutableScheduleId">) {
  if (item.primaryExecutableScheduleId) return "打开可执行调度";
  if (item.executionState === "blocked") return "修复阻断规则";
  if (item.executionState === "missing") return "创建或启用调度";
  return "打开对应调度";
}

function buildRunHref(runId: number | null, resultId: number | null) {
  if (!runId) return "/ops/writing-eval/runs";
  const params = new URLSearchParams({ runId: String(runId) });
  if (resultId) params.set("resultId", String(resultId));
  return `/ops/writing-eval/runs?${params.toString()}`;
}

function buildDatasetHref(datasetId: number | null, caseId: number | null) {
  if (!datasetId) return "/ops/writing-eval/datasets";
  const params = new URLSearchParams({ datasetId: String(datasetId) });
  if (caseId) params.set("caseId", String(caseId));
  return `/ops/writing-eval/datasets?${params.toString()}`;
}

export function OpsWritingEvalInsightsClient({
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
    const response = await fetch("/api/ops/writing-eval/scoring-profiles/calibrate", {
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
    <section className={uiPrimitives.opsPanel + " p-5"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Online Calibration</div>
          <h2 className="mt-3 font-serifCn text-2xl text-stone-100">线上回流校准面板</h2>
        </div>
        <div className="text-sm text-stone-500">
          {onlineCalibration.feedbackCount} 条反馈 · {onlineCalibration.linkedResultCount} 条已绑定样本
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        {[
          {
            label: "观察爆款分",
            value: onlineCalibration.averageObservedViralScore,
            tone: "text-stone-100",
          },
          {
            label: "离线预测爆款分",
            value: onlineCalibration.averagePredictedViralScore,
            tone: "text-stone-300",
          },
          {
            label: "平均校准偏差",
            value: onlineCalibration.averageCalibrationGap,
            tone: (onlineCalibration.averageCalibrationGap ?? 0) >= 0 ? "text-emerald-400" : "text-cinnabar",
          },
          {
            label: "可用绑定样本",
            value: onlineCalibration.linkedResultCount,
            tone: "text-stone-100",
          },
        ].map((item) => (
          <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
            <div className={`mt-3 text-2xl ${item.tone}`}>
              {typeof item.value === "number" ? item.value.toFixed(2) : "--"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">agentStrategy 动态建议</div>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {strategyRecommendations.map((item) => (
              <div key={item.code} className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.code}</div>
                    <div className="mt-2 text-lg text-stone-100">{item.label}</div>
                  </div>
                  <div className="text-right text-xs text-stone-500">
                    紧急度 {(item.urgencyScore * 100).toFixed(0)}%
                    <br />
                    置信度 {(item.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="mt-3 text-sm leading-6 text-stone-400">{item.description}</div>
                <div className="mt-4 rounded border border-stone-800 bg-[#141414] px-3 py-3 text-sm leading-6 text-stone-300">
                  <div>{item.recommendation}</div>
                  <div className="mt-1 text-stone-500">{item.reason}</div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-stone-400">
                  <div>
                    当前：P{item.currentPriority ?? "--"} · {item.currentCadenceHours ?? "--"}h · {getDecisionModeLabel(item.currentDecisionMode)}
                  </div>
                  <div>
                    建议：P{item.recommendedPriority} · {item.recommendedCadenceHours}h · {getDecisionModeLabel(item.recommendedDecisionMode)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                  <span>已启用规则 {item.enabledScheduleCount} 条</span>
                  <span>可执行 {item.executableScheduleCount} 条</span>
                  {item.blockedScheduleCount > 0 ? <span>阻断 {item.blockedScheduleCount} 条</span> : null}
                  <span className={`border px-2 py-1 uppercase tracking-[0.16em] ${getExecutionTone(item.executionState)}`}>{item.executionState}</span>
                </div>
                {item.executionBlocker ? (
                  <div className={`mt-2 text-xs leading-6 ${item.executionState === "blocked" ? "text-cinnabar" : "text-stone-500"}`}>
                    执行提示：{item.executionBlocker}
                  </div>
                ) : null}
                {item.triggers.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.triggers.map((trigger) => (
                      <span key={trigger} className="border border-stone-700 px-2 py-1 text-xs text-stone-400">
                        {trigger}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3">
                  <Link
                    href={(item.primaryExecutableScheduleId ?? item.primaryScheduleId) ? `/ops/writing-eval/runs?scheduleId=${item.primaryExecutableScheduleId ?? item.primaryScheduleId}` : "/ops/writing-eval/runs"}
                    className={uiPrimitives.opsSecondaryButton}
                  >
                    {getStrategyActionLabel(item)}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={handleCreateCalibratedProfile} className="border border-stone-800 bg-stone-950 px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500">生成校准版画像</div>
          <div className="mt-4 space-y-3">
            <select value={form.baseProfileId} onChange={(event) => setForm((prev) => ({ ...prev, baseProfileId: event.target.value }))} className={uiPrimitives.opsSelect}>
              <option value="">选择基线评分画像</option>
              {scoringProfiles.map((profile) => (
                <option key={profile.id} value={String(profile.id)}>
                  {profile.name} · {profile.code}
                  {profile.isActive ? " · active" : ""}
                </option>
              ))}
            </select>
            <input value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="新画像编码，可留空自动生成" className={uiPrimitives.opsInput} />
            <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="新画像名称，可留空自动生成" className={uiPrimitives.opsInput} />
            <label className="flex items-center gap-2 text-sm text-stone-400">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
              创建后立即设为 active
            </label>
            <div className="rounded border border-stone-800 bg-[#141414] px-3 py-3 text-sm leading-6 text-stone-400">
              当前会基于线上回流建议与原画像权重做 50% / 50% 混合，优先降低误判风险，再生成一个可回滚的新画像版本。
            </div>
            <button disabled={submitting || !form.baseProfileId} className={uiPrimitives.primaryButton}>
              {submitting ? "生成中..." : "生成校准版评分画像"}
            </button>
            {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
          </div>
        </form>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="xl:col-span-2">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">爆款分项权重建议</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-stone-500">
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
                  <tr key={item.key} className="border-t border-stone-800">
                    <td className="py-4 text-stone-100">{item.label}</td>
                    <td className="py-4 text-stone-400">{(item.currentWeight * 100).toFixed(1)}%</td>
                    <td className="py-4 text-stone-100">{(item.recommendedWeight * 100).toFixed(1)}%</td>
                    <td className={`py-4 ${item.deltaWeight >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                      {item.deltaWeight >= 0 ? "+" : ""}
                      {(item.deltaWeight * 100).toFixed(1)}%
                    </td>
                    <td className="py-4 text-stone-400">{typeof item.correlation === "number" ? item.correlation.toFixed(2) : "--"}</td>
                    <td className="py-4 text-stone-400">{typeof item.lift === "number" ? item.lift.toFixed(2) : "--"}</td>
                    <td className="py-4 text-stone-400">{(item.confidence * 100).toFixed(0)}%</td>
                    <td className="py-4 text-stone-300">
                      <div>{item.recommendation}</div>
                      <div className="mt-1 text-xs text-stone-500">{item.reason}</div>
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
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">离线高分但线上不爆</div>
          <div className="space-y-3">
            {onlineCalibration.falsePositiveCases.map((item) => (
              <div key={`fp-${item.feedbackId}`} className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="font-mono text-xs text-stone-300">{formatCaseSource(item)}</div>
                <div className="mt-2 text-stone-100">{item.topicTitle || item.articleTitle || "未命名样本"}</div>
                <div className="mt-2 text-sm text-cinnabar">
                  离线 {formatMetric(item.predictedViralScore)} → 线上 {formatMetric(item.observedViralScore)} · 偏差 {formatMetric(item.calibrationGap)}
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  打开率 {typeof item.openRate === "number" ? `${item.openRate.toFixed(1)}%` : "--"} · 读完率{" "}
                  {typeof item.readCompletionRate === "number" ? `${item.readCompletionRate.toFixed(1)}%` : "--"} · 分享率{" "}
                  {typeof item.shareRate === "number" ? `${item.shareRate.toFixed(1)}%` : "--"}
                </div>
                {item.runId || item.datasetId ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.runId ? (
                      <Link href={buildRunHref(item.runId, item.resultId)} className={uiPrimitives.opsSecondaryButton}>
                        {item.resultId ? "打开对应样本" : "打开对应 Run"}
                      </Link>
                    ) : null}
                    {item.datasetId ? (
                      <Link href={buildDatasetHref(item.datasetId, item.caseId)} className={uiPrimitives.opsSecondaryButton}>
                        打开评测样本
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {onlineCalibration.falsePositiveCases.length === 0 ? <div className="text-sm text-stone-500">暂无明显误判样本。</div> : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">离线低估但线上表现更强</div>
          <div className="space-y-3">
            {onlineCalibration.falseNegativeCases.map((item) => (
              <div key={`fn-${item.feedbackId}`} className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="font-mono text-xs text-stone-300">{formatCaseSource(item)}</div>
                <div className="mt-2 text-stone-100">{item.topicTitle || item.articleTitle || "未命名样本"}</div>
                <div className="mt-2 text-sm text-emerald-400">
                  离线 {formatMetric(item.predictedViralScore)} → 线上 {formatMetric(item.observedViralScore)} · 偏差 +{formatMetric(item.calibrationGap)}
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  打开率 {typeof item.openRate === "number" ? `${item.openRate.toFixed(1)}%` : "--"} · 读完率{" "}
                  {typeof item.readCompletionRate === "number" ? `${item.readCompletionRate.toFixed(1)}%` : "--"} · 分享率{" "}
                  {typeof item.shareRate === "number" ? `${item.shareRate.toFixed(1)}%` : "--"}
                </div>
                {item.runId || item.datasetId ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.runId ? (
                      <Link href={buildRunHref(item.runId, item.resultId)} className={uiPrimitives.opsSecondaryButton}>
                        {item.resultId ? "打开对应样本" : "打开对应 Run"}
                      </Link>
                    ) : null}
                    {item.datasetId ? (
                      <Link href={buildDatasetHref(item.datasetId, item.caseId)} className={uiPrimitives.opsSecondaryButton}>
                        打开评测样本
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {onlineCalibration.falseNegativeCases.length === 0 ? <div className="text-sm text-stone-500">暂无明显低估样本。</div> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
