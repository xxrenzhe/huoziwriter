"use client";

import { Button, Input, Select, Textarea, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useEffect, useState } from "react";
import { ArrowUpRight, Bot, ChevronDown, Loader2, Play, RotateCcw, Square } from "lucide-react";
import {
  buildStageDetailSections,
  buildStageSummary,
  formatDuration,
  formatRelativeTime,
  getAutomationLevelLabel,
  getStageQualityGateClassName,
  getStageQualityGateState,
  getRunStatusClassName,
  getStageSearchMetrics,
  mergeRun,
  readJson,
  stageLabels,
  type AutomationLevel,
  type AutomationRun,
  type AutomationRunDetail,
  type SeriesOption,
  type WechatConnectionOption,
} from "@/components/article-automation-cockpit-shared";

const shellCardClassName = cn(surfaceCardStyles({ padding: "lg" }), "border-lineStrong shadow-none");
const subtleCardClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "md" }), "border-lineStrong shadow-none");
const warmCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "border-lineStrong shadow-none");
const interactiveCardClassName = cn(surfaceCardStyles({ interactive: true, padding: "md" }), "border-lineStrong shadow-none");

export function ArticleAutomationCockpit({
  initialRuns,
  initialRunDetail,
  seriesOptions,
  wechatConnections,
}: {
  initialRuns: AutomationRun[];
  initialRunDetail: AutomationRunDetail | null;
  seriesOptions: SeriesOption[];
  wechatConnections: WechatConnectionOption[];
}) {
  const router = useRouter();
  const defaultSeriesId = seriesOptions.length === 1 ? String(seriesOptions[0].id) : "";
  const defaultWechatConnectionId = wechatConnections.find((item) => item.isDefault)?.id ?? wechatConnections[0]?.id ?? null;
  const [inputMode, setInputMode] = useState<AutomationRun["inputMode"]>("brief");
  const [inputText, setInputText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>("draftPreview");
  const [seriesId, setSeriesId] = useState(defaultSeriesId);
  const [wechatConnectionId, setWechatConnectionId] = useState(defaultWechatConnectionId ? String(defaultWechatConnectionId) : "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actioningKey, setActioningKey] = useState("");
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(initialRunDetail?.run.id ?? initialRuns[0]?.id ?? null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<AutomationRunDetail | null>(initialRunDetail);

  useEffect(() => {
    if (!selectedRunId) return;
    let disposed = false;
    const syncDetail = async () => {
      try {
        const detail = await readJson<AutomationRunDetail>(await fetch(`/api/articles/automation-runs/${selectedRunId}`));
        if (disposed) return;
        setSelectedRunDetail(detail);
        setRuns((current) => mergeRun(current, detail.run));
      } catch (error) {
        if (!disposed) {
          setMessage(error instanceof Error ? error.message : "读取自动化运行详情失败");
        }
      }
    };

    void syncDetail();
    const source = new EventSource(`/api/articles/automation-runs/${selectedRunId}/events`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; data?: AutomationRunDetail };
        const detail = payload.data;
        if (payload.type !== "snapshot" || !detail || disposed) {
          return;
        }
        setSelectedRunDetail(detail);
        setRuns((current) => mergeRun(current, detail.run));
      } catch {
        return;
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => {
      disposed = true;
      source.close();
    };
  }, [selectedRunId]);

  const currentRun = selectedRunDetail?.run ?? null;
  const qualitySourceStage = selectedRunDetail?.stages.find((stage) => stage.stageCode === "researchBrief") ?? null;
  const qualityTitleStage = selectedRunDetail?.stages.find((stage) => stage.stageCode === "titleOptimization") ?? null;
  const qualityFactStage = selectedRunDetail?.stages.find((stage) => stage.stageCode === "factCheck") ?? null;
  const qualityPublishStage = selectedRunDetail?.stages.find((stage) => stage.stageCode === "publishGuard") ?? null;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const resolvedInputText = inputMode === "url" ? inputText.trim() || sourceUrl.trim() : inputText.trim();
    if (!resolvedInputText) {
      setMessage(inputMode === "url" ? "至少提供 1 个可抓取链接或写作目标。" : "先给 AI 一个主题、一句话观点或推荐选题描述。");
      return;
    }
    if (inputMode === "url" && !sourceUrl.trim()) {
      setMessage("链接起稿需要一个真实 URL。");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const detail = await readJson<AutomationRunDetail>(
        await fetch("/api/articles/automation-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputMode,
            inputText: resolvedInputText,
            sourceUrl: inputMode === "url" ? sourceUrl.trim() : null,
            targetSeriesId: seriesId ? Number(seriesId) : null,
            targetWechatConnectionId: automationLevel === "wechatDraft" && wechatConnectionId ? Number(wechatConnectionId) : null,
            automationLevel,
            autoStart: true,
          }),
        }),
      );
      setRuns((current) => mergeRun(current, detail.run));
      setSelectedRunId(detail.run.id);
      setSelectedRunDetail(detail);
      setMessage(`运行 #${detail.run.id} 已启动，当前阶段：${stageLabels[detail.run.currentStageCode] || detail.run.currentStageCode}。`);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建自动化运行失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRunAction(action: "resume" | "cancel" | "retry", stageCode?: string) {
    if (!selectedRunId) return;
    const actionKey = stageCode ? `${action}:${stageCode}` : action;
    setActioningKey(actionKey);
    setMessage("");
    try {
      const path =
        action === "resume"
          ? `/api/articles/automation-runs/${selectedRunId}/resume`
          : action === "cancel"
            ? `/api/articles/automation-runs/${selectedRunId}/cancel`
            : `/api/articles/automation-runs/${selectedRunId}/stages/${stageCode}/retry`;
      const detail = await readJson<AutomationRunDetail>(
        await fetch(path, {
          method: "POST",
        }),
      );
      setSelectedRunDetail(detail);
      setRuns((current) => mergeRun(current, detail.run));
      setMessage(
        action === "resume"
          ? "自动化运行已继续。"
          : action === "cancel"
            ? "自动化运行已取消。"
            : `${stageLabels[stageCode || ""] || stageCode} 已重跑。`,
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "自动化操作失败");
    } finally {
      setActioningKey("");
    }
  }

  return (
    <div className="space-y-6">
      <section className={cn(shellCardClassName, "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,241,236,0.96))]")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
          <div>
            <div className="text-xs uppercase tracking-[0.26em] text-cinnabar">Automation Cockpit</div>
            <h1 className="mt-3 font-serifCn text-4xl text-ink text-balance">少量输入后，把选题、研究、写作、核查、排版和草稿箱交给 AI 连续执行。</h1>
            <p className="mt-4 max-w-3xl text-sm leading-8 text-inkSoft">
              默认自动决策，只有遇到事实阻塞、发布阻塞或你主动接管时才需要介入。每个阶段都保留专有 Prompt、可追踪产物和单阶段重跑能力。
            </p>
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  ["brief", "一句话起稿"],
                  ["url", "链接起稿"],
                  ["recommendedTopic", "推荐选题"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setInputMode(value as AutomationRun["inputMode"])}
                    className={cn(
                      buttonStyles({ variant: inputMode === value ? "primary" : "secondary", size: "sm" }),
                      "min-h-0 px-4 py-2 text-xs",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {inputMode === "url" ? (
                <div className="grid gap-3">
                  <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="粘贴 1 个真实网页 URL" />
                  <Textarea value={inputText} onChange={(event) => setInputText(event.target.value)} rows={4} placeholder="可选：告诉 AI 你最想提炼什么观点、写给谁看。" />
                </div>
              ) : (
                <Textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  rows={5}
                  placeholder={inputMode === "recommendedTopic" ? "输入今日推荐题，或补一句你想主打的判断。" : "输入一句话主题、观点或你想写清楚的问题。"}
                />
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <Select value={automationLevel} onChange={(event) => setAutomationLevel(event.target.value as AutomationLevel)}>
                  <option value="draftPreview">自动到预览</option>
                  <option value="wechatDraft">自动推送草稿箱</option>
                  <option value="strategyOnly">只跑策略链路</option>
                </Select>
                <Select value={seriesId} onChange={(event) => setSeriesId(event.target.value)}>
                  <option value="">自动选择系列（可选）</option>
                  {seriesOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  value={wechatConnectionId}
                  onChange={(event) => setWechatConnectionId(event.target.value)}
                  disabled={automationLevel !== "wechatDraft"}
                >
                  <option value="">{automationLevel === "wechatDraft" ? "选择目标公众号" : "仅草稿箱模式需要公众号"}</option>
                  {wechatConnections.map((item) => (
                    <option key={item.id} value={item.id}>
                      {(item.accountName || item.originalId || `连接 #${item.id}`) + (item.isDefault ? " · 默认" : "")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" loading={submitting} iconLeft={<Play size={16} />}>
                  开始自动生成高质量草稿
                </Button>
                <div className="text-sm text-inkMuted">14 个阶段串行执行，默认停在终稿预览；需要时再手动切到草稿箱。</div>
              </div>
              {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
            </form>
          </div>
          <div className={warmCardClassName}>
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">当前焦点</div>
            {currentRun ? (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-sm text-inkMuted">运行 #{currentRun.id}</div>
                  <div className="mt-2 text-xl font-medium text-ink">{stageLabels[currentRun.currentStageCode] || currentRun.currentStageCode}</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{currentRun.inputText}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={cn("rounded-full border px-2.5 py-1", getRunStatusClassName(currentRun.status))}>{currentRun.status}</span>
                  <span className="rounded-full border border-lineStrong bg-surface px-2.5 py-1 text-inkSoft">{getAutomationLevelLabel(currentRun.automationLevel)}</span>
                  <span className="rounded-full border border-lineStrong bg-surface px-2.5 py-1 text-inkSoft">{formatRelativeTime(currentRun.updatedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={actioningKey === "resume"}
                    iconLeft={actioningKey === "resume" ? <Loader2 size={16} /> : <Play size={16} />}
                    onClick={() => handleRunAction("resume")}
                    disabled={currentRun.status === "running"}
                  >
                    继续运行
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={actioningKey === "cancel"}
                    iconLeft={<Square size={16} />}
                    onClick={() => handleRunAction("cancel")}
                    disabled={currentRun.status !== "queued" && currentRun.status !== "running" && currentRun.status !== "blocked"}
                  >
                    取消
                  </Button>
                  {selectedRunDetail?.article ? (
                    <Link href={`/articles/${selectedRunDetail.article.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                      打开稿件
                    </Link>
                  ) : null}
                </div>
                {currentRun.blockedReason ? <div className="rounded-2xl border border-cinnabar/20 bg-cinnabar/5 px-4 py-3 text-sm leading-7 text-cinnabar">{currentRun.blockedReason}</div> : null}
                {currentRun.finalWechatMediaId ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">微信草稿 mediaId：{currentRun.finalWechatMediaId}</div> : null}
              </div>
            ) : (
              <div className="mt-4 text-sm leading-7 text-inkSoft">还没有自动化运行。给 AI 一句话主题、一个链接或一个推荐题，系统就会开始整条生产线。</div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className={subtleCardClassName}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">运行列表</div>
                <div className="mt-2 text-lg font-medium text-ink">最近自动化任务</div>
              </div>
              <div className="text-xs text-inkMuted">{runs.length} 条</div>
            </div>
            <div className="mt-4 space-y-3">
              {runs.length === 0 ? <div className="text-sm leading-7 text-inkSoft">暂无运行记录。</div> : null}
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    interactiveCardClassName,
                    "w-full text-left",
                    selectedRunId === run.id ? "border-cinnabar bg-surfaceHighlight" : "",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">#{run.id} · {stageLabels[run.currentStageCode] || run.currentStageCode}</div>
                      <div className="mt-2 line-clamp-3 text-sm leading-7 text-inkSoft">{run.inputText}</div>
                    </div>
                    <span className={cn("rounded-full border px-2 py-1 text-[11px]", getRunStatusClassName(run.status))}>{run.status}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-inkMuted">
                    <span>{getAutomationLevelLabel(run.automationLevel)}</span>
                    <span>{formatRelativeTime(run.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <div className="space-y-6">
          <section className={shellCardClassName}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Stage Timeline</div>
                <h2 className="mt-2 font-serifCn text-3xl text-ink">阶段时间线</h2>
              </div>
              {currentRun ? <div className="text-sm text-inkMuted">当前阶段：{stageLabels[currentRun.currentStageCode] || currentRun.currentStageCode}</div> : null}
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {selectedRunDetail?.stages.map((stage) => (
                <article key={stage.stageCode} className={subtleCardClassName}>
                  {(() => {
                    const detailSections = buildStageDetailSections(stage);
                    const searchMetrics = getStageSearchMetrics(stage);
                    const qualityGateState = getStageQualityGateState(stage);
                    const quickAction = qualityGateState?.action ?? null;
                    return (
                      <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{stage.sceneCode}</div>
                      <div className="mt-1 text-lg font-medium text-ink">{stageLabels[stage.stageCode] || stage.stageCode}</div>
                    </div>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px]", getRunStatusClassName(stage.status))}>{stage.status}</span>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-inkSoft">{buildStageSummary(stage)}</div>
                  {qualityGateState ? (
                    <div className={cn("mt-3 rounded-2xl border px-3 py-2 text-xs leading-6", getStageQualityGateClassName(qualityGateState.tone))}>
                      <div className="font-medium">{qualityGateState.label}</div>
                      <div className="mt-1">{qualityGateState.detail}</div>
                      {quickAction ? (
                        <div className="mt-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actioningKey === `retry:${quickAction.stageCode}`}
                            iconLeft={<RotateCcw size={14} />}
                            onClick={() => handleRunAction("retry", quickAction.stageCode)}
                          >
                            {quickAction.label}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-inkMuted">
                    <span>{stage.promptId}@{stage.promptVersion}</span>
                    <span>{stage.provider || "待路由"}{stage.model ? ` · ${stage.model}` : ""}</span>
                    <span>{formatDuration(stage.startedAt, stage.completedAt)}</span>
                    {searchMetrics ? <span>{searchMetrics.queryCount} 查询 · {searchMetrics.domainCount} 域</span> : null}
                  </div>
                  {stage.errorMessage ? <div className="mt-3 rounded-2xl border border-cinnabar/20 bg-cinnabar/5 px-3 py-2 text-xs leading-6 text-cinnabar">{stage.errorMessage}</div> : null}
                  {detailSections.length > 0 ? (
                    <details className="mt-4 rounded-[1.25rem] border border-lineStrong/80 bg-white/70 p-3">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 text-sm font-medium text-ink marker:hidden">
                        <span>查看决策、信源与质量细节</span>
                        <span className="flex items-center gap-2 text-xs font-normal text-inkMuted">
                          {detailSections.length} 组信息
                          <ChevronDown size={14} />
                        </span>
                      </summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {detailSections.map((section) => (
                          <div key={`${stage.stageCode}-${section.title}`} className="rounded-[1rem] border border-lineStrong/70 bg-surface px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-inkMuted">{section.title}</div>
                            <div className="mt-2 space-y-2">
                              {section.items.map((item) => (
                                <div key={item} className="text-sm leading-6 text-inkSoft">
                                  {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={actioningKey === `retry:${stage.stageCode}`}
                      iconLeft={<RotateCcw size={14} />}
                      onClick={() => handleRunAction("retry", stage.stageCode)}
                    >
                      {quickAction?.stageCode === stage.stageCode ? "重新运行本阶段" : "重跑本阶段"}
                    </Button>
                  </div>
                      </>
                    );
                  })()}
                </article>
              )) || <div className="text-sm leading-7 text-inkSoft">选中一个运行后，这里会展示完整阶段时间线、状态和重跑入口。</div>}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className={shellCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Quality Panel</div>
              <h2 className="mt-2 font-serifCn text-3xl text-ink">质量闸门</h2>
              <div className="mt-5 space-y-3">
                <div className={subtleCardClassName}>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">研究覆盖</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    {qualitySourceStage ? buildStageSummary(qualitySourceStage) : "运行后展示实际搜索覆盖、证据缺口和自动补源结果。"}
                  </div>
                </div>
                <div className={subtleCardClassName}>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">标题选择</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    {qualityTitleStage ? buildStageSummary(qualityTitleStage) : "自动筛标题后，这里会显示最终推荐题。"}
                  </div>
                </div>
                <div className={subtleCardClassName}>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">事实风险</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    {qualityFactStage ? buildStageSummary(qualityFactStage) : "事实核查完成后，这里会显示高风险断言和补证情况。"}
                  </div>
                </div>
                <div className={subtleCardClassName}>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">发布守门</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    {qualityPublishStage ? buildStageSummary(qualityPublishStage) : "发布前会检查阻塞、提醒和可修复动作。"}
                  </div>
                </div>
              </div>
            </section>

            <section className={shellCardClassName}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Preview</div>
                  <h2 className="mt-2 font-serifCn text-3xl text-ink">终稿预览</h2>
                </div>
                {selectedRunDetail?.article ? (
                  <Link href={`/articles/${selectedRunDetail.article.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    <ArrowUpRight size={14} />
                    打开完整稿件
                  </Link>
                ) : null}
              </div>
              {selectedRunDetail?.article ? (
                <div className="mt-5 space-y-4">
                  <div className={warmCardClassName}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                      <span>{selectedRunDetail.article.status}</span>
                      <span>{formatRelativeTime(selectedRunDetail.article.updated_at)}</span>
                      <span>#{selectedRunDetail.article.id}</span>
                    </div>
                    <div className="mt-3 text-2xl font-medium text-ink">{selectedRunDetail.article.title}</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-8 text-inkSoft">
                      {(selectedRunDetail.article.markdown_content || "正文还未落库。").slice(0, 1200)}
                    </div>
                  </div>
                  <div className={subtleCardClassName}>
                    <div className="flex items-center gap-2 text-sm text-ink">
                      <Bot size={16} />
                      最终状态
                    </div>
                    <div className="mt-3 text-sm leading-7 text-inkSoft">
                      {currentRun?.status === "completed"
                        ? currentRun.finalWechatMediaId
                          ? `整条链路已完成，并已推送到微信草稿箱，mediaId=${currentRun.finalWechatMediaId}。`
                          : "整条链路已完成，当前停留在预览可交付状态。"
                        : currentRun?.blockedReason || "当前仍在执行中。"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[1.75rem] border border-dashed border-lineStrong px-6 py-10 text-sm leading-8 text-inkSoft">
                  运行创建后，这里会展示自动写出的正文、排版后状态和微信草稿箱结果。
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
