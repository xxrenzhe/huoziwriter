import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { requireAdminSession } from "@/lib/page-auth";
import { getPlan17BusinessReport } from "@/lib/plan17-business";

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const mutedPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted p-5 text-adminInk shadow-none");
const metricValueClassName = "mt-3 font-serifCn text-4xl text-adminInk text-balance";
const eyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const accentEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminAccent";
const titleClassName = "mt-4 font-serifCn text-4xl text-adminInk text-balance";
const descriptionClassName = "mt-4 text-sm leading-7 text-adminInkSoft";
const actionClassName = "inline-flex items-center justify-center rounded-full border border-adminLineStrong bg-adminSurfaceAlt px-4 py-2 text-sm text-adminInk transition hover:border-adminAccent hover:text-adminAccent";
const tableCellClassName = "px-4 py-4 align-top";
const mobileDetailListClassName = "mt-6 grid gap-3 md:hidden";
const mobileDetailCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-adminLineStrong bg-adminSurfaceMuted text-adminInk shadow-none");
const mobileDetailLabelClassName = "text-xs uppercase tracking-[0.18em] text-adminInkMuted";
const mobileDetailValueClassName = "mt-2 text-sm leading-7 text-adminInkSoft";

function formatPercent(value: number | null) {
  return value == null ? "--" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatFissionModeBreakdown(modes: Array<{ key: string; reviewedCount: number; hitCount: number }>) {
  if (modes.length === 0) {
    return "暂无裂变回收";
  }
  return modes.map((mode) => `${mode.key} ${mode.hitCount}/${mode.reviewedCount}`).join(" · ");
}

function formatStyleUsageSourceLabel(value: string | null) {
  if (!value) {
    return "--";
  }
  if (value === "article.generate") {
    return "普通生成";
  }
  if (value === "article.generate.stream") {
    return "流式生成后保存";
  }
  if (value === "article.command.rewrite") {
    return "旧 command 改写";
  }
  if (value.startsWith("article.stage.apply.")) {
    return `阶段应用 · ${value.slice("article.stage.apply.".length)}`;
  }
  return value;
}

function formatGapReasons(reasons: string[]) {
  return reasons.length > 0 ? reasons.join(" / ") : "已具备可比性";
}

function GapSummaryList({
  items,
  emptyText,
}: {
  items: Array<{ key: string; label: string; count: number }>;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <div className="mt-4 text-sm leading-7 text-adminInkSoft">{emptyText}</div>;
  }
  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-3 border-t border-adminLineStrong pt-2 text-sm">
          <span className="text-adminInkSoft">{item.label}</span>
          <span className="font-serifCn text-lg text-adminInk">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminPlan17BusinessPage() {
  await requireAdminSession();
  const report = await getPlan17BusinessReport();
  const { batchDrilldown } = report;
  const topAuthorLiftItems = report.authorLiftDrilldown.slice(0, 8);
  const topFissionItems = report.fissionVsRadarDrilldown.slice(0, 8);
  const topMatrixItems = report.matrixAuthorDrilldown.slice(0, 8);
  const topStyleItems = report.styleUsageDrilldown.slice(0, 8);

  const batchMetrics = [
    ["批次数", String(batchDrilldown.batchCount), "已写入 generated_batch_id 的真实批次总数"],
    ["关联稿件", String(batchDrilldown.linkedArticleCount), "批次内已经绑定到稿件的去重文章数"],
    ["回收覆盖率", formatPercent(batchDrilldown.reviewCoverage), "已回收结果稿件 / 已关联稿件"],
    ["回收命中率", formatPercent(batchDrilldown.hitRate), "命中稿件 / 已回收稿件"],
  ] as const;

  return (
    <section className="space-y-6">
      <article className={cn(panelClassName, "grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end")}>
        <div>
          <div className={accentEyebrowClassName}>Plan 17 Business</div>
          <h1 className={titleClassName}>批次回流与导出</h1>
          <p className={descriptionClassName}>
            这个入口只展示数据库里已经落表的真实批次，不补造 backlog、不推断命中。重点看每个 batch 绑定了多少稿件、回收了多少结果、命中率如何，以及对应的裂变模式分布。
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-adminInkMuted">
            生成于 {formatDateTime(report.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a className={actionClassName} href="/api/admin/plan17/business?view=batch-drilldown" target="_blank" rel="noreferrer">
            打开 JSON
          </a>
          <a className={actionClassName} href="/api/admin/plan17/business/export?scope=batch-drilldown&format=csv">
            下载 CSV
          </a>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {batchMetrics.map(([label, value, note]) => (
          <article key={label} className={mutedPanelClassName}>
            <div className={eyebrowClassName}>{label}</div>
            <div className={metricValueClassName}>{value}</div>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">{note}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article className={panelClassName}>
          <div className={eyebrowClassName}>业务上下文</div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>裂变 vs Radar</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatPercent(report.fissionVsRadar.hitRateDeltaPp)}</div>
              <p className="mt-3 text-sm leading-7 text-adminInkSoft">
                裂变 {report.fissionVsRadar.fissionReviewedCount} 篇，radar {report.fissionVsRadar.radarReviewedCount} 篇。
              </p>
            </div>
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>矩阵产能</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatPercent(report.matrixWeeklyOutput.weeklyOutputGrowthPp)}</div>
              <p className="mt-3 text-sm leading-7 text-adminInkSoft">
                周中位数 {report.matrixWeeklyOutput.weeklyOutputMedianBefore ?? "--"} → {report.matrixWeeklyOutput.weeklyOutputMedianAfter ?? "--"}。
              </p>
            </div>
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>3+ 样本画像真实使用</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatPercent(report.styleHeatmapUsage.recent30dMultiSampleUsageShare)}</div>
              <p className="mt-3 text-sm leading-7 text-adminInkSoft">
                近 30 天真实使用 {report.styleHeatmapUsage.recent30dMultiSampleUsageEventCount}/{report.styleHeatmapUsage.recent30dUsageEventCount}。
              </p>
            </div>
          </div>
        </article>

        <article className={panelClassName}>
          <div className={eyebrowClassName}>回收构成</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>已回收</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">{batchDrilldown.reviewedArticleCount}</div>
            </div>
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>待回收</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">{batchDrilldown.pendingReviewArticleCount}</div>
            </div>
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>命中</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">{batchDrilldown.hitArticleCount}</div>
            </div>
            <div className={mutedPanelClassName}>
              <div className={eyebrowClassName}>差一点 / 未命中</div>
              <div className="mt-3 font-serifCn text-3xl text-adminInk">
                {batchDrilldown.nearMissArticleCount} / {batchDrilldown.missArticleCount}
              </div>
            </div>
          </div>
        </article>
      </div>

      <article className={panelClassName}>
        <div className={eyebrowClassName}>Observation Gaps</div>
        <h2 className="mt-4 font-serifCn text-3xl text-adminInk text-balance">下一步补样方向</h2>
        <p className="mt-3 text-sm leading-7 text-adminInkSoft">
          这里把 `11.3` 业务验收的阻塞拆成可执行的样本缺口：先补前后窗复盘，再补 radar / 裂变对照，最后补 3+ 样本文风真实使用。
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={mutedPanelClassName}>
            <div className={eyebrowClassName}>作者抬升</div>
            <GapSummaryList items={report.observationGaps.authorLift} emptyText="作者前后窗样本已具备可比性。" />
          </div>
          <div className={mutedPanelClassName}>
            <div className={eyebrowClassName}>裂变 vs Radar</div>
            <GapSummaryList items={report.observationGaps.fissionVsRadar} emptyText="裂变与 radar 的最低回收样本已满足。" />
          </div>
          <div className={mutedPanelClassName}>
            <div className={eyebrowClassName}>矩阵产能</div>
            <GapSummaryList items={report.observationGaps.matrixOutput} emptyText="矩阵作者产能与质量窗口已具备可比性。" />
          </div>
          <div className={mutedPanelClassName}>
            <div className={eyebrowClassName}>风格真实使用</div>
            <GapSummaryList items={report.observationGaps.styleUsage} emptyText="近 30 天 3+ 样本画像使用占比已达目标。" />
          </div>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className={panelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={eyebrowClassName}>Author Lift Drilldown</div>
              <div className="mt-3 text-sm leading-7 text-adminInkSoft">30 天前后窗按作者展开，先看谁还不具备可比样本。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={actionClassName} href="/api/admin/plan17/business?view=author-lift" target="_blank" rel="noreferrer">JSON</a>
              <a className={actionClassName} href="/api/admin/plan17/business/export?scope=author-lift&format=csv">CSV</a>
            </div>
          </div>
          {topAuthorLiftItems.length === 0 ? (
            <div className="mt-6 text-sm leading-7 text-adminInkSoft">当前没有作者启用样本。</div>
          ) : (
            <>
              <div className={mobileDetailListClassName}>
                {topAuthorLiftItems.map((item) => (
                  <article key={`mobile-${item.userId}-${item.activationAt || "none"}`} className={mobileDetailCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={eyebrowClassName}>作者 {item.userId}</div>
                        <div className={mobileDetailValueClassName}>启用时间 {formatDateTime(item.activationAt)}</div>
                      </div>
                      <div className={cn("text-sm", item.comparable ? "text-adminAccent" : "text-adminInkMuted")}>
                        {item.comparable ? "可比" : "待补样"}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className={mobileDetailLabelClassName}>前窗 / 后窗</div>
                        <div className={mobileDetailValueClassName}>{item.baselineReviewedCount} / {item.currentReviewedCount}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>命中率</div>
                        <div className={mobileDetailValueClassName}>{formatPercent(item.baselineHitRate)} / {formatPercent(item.currentHitRate)}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>抬升</div>
                        <div className={mobileDetailValueClassName}>{formatPercent(item.liftPp)}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>缺口</div>
                        <div className={mobileDetailValueClassName}>{formatGapReasons(item.gapReasons)}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-adminBg text-adminInkMuted">
                    <tr>
                      {["作者", "启用时间", "前窗", "后窗", "命中率", "抬升", "可比", "缺口"].map((head) => (
                        <th key={head} className="px-4 py-3 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topAuthorLiftItems.map((item) => (
                      <tr key={`${item.userId}-${item.activationAt || "none"}`} className="border-t border-adminLineStrong">
                        <td className={tableCellClassName}>{item.userId}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatDateTime(item.activationAt)}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.baselineReviewedCount}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.currentReviewedCount}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatPercent(item.baselineHitRate)} / {formatPercent(item.currentHitRate)}</td>
                        <td className={tableCellClassName}>{formatPercent(item.liftPp)}</td>
                        <td className={cn(tableCellClassName, item.comparable ? "text-adminAccent" : "text-adminInkMuted")}>{item.comparable ? "是" : "否"}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatGapReasons(item.gapReasons)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>

        <article className={panelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={eyebrowClassName}>Fission Vs Radar Drilldown</div>
              <div className="mt-3 text-sm leading-7 text-adminInkSoft">把裂变和 radar 的真实 7 天复盘样本摊开，先定位来源和模式分布。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={actionClassName} href="/api/admin/plan17/business?view=fission-vs-radar" target="_blank" rel="noreferrer">JSON</a>
              <a className={actionClassName} href="/api/admin/plan17/business/export?scope=fission-vs-radar&format=csv">CSV</a>
            </div>
          </div>
          {topFissionItems.length === 0 ? (
            <div className="mt-6 text-sm leading-7 text-adminInkSoft">当前没有裂变或 radar 的真实 7 天回收样本。</div>
          ) : (
            <>
              <div className={mobileDetailListClassName}>
                {topFissionItems.map((item) => (
                  <article key={`mobile-${item.userId}-${item.articleId}`} className={mobileDetailCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={eyebrowClassName}>作者 {item.userId}</div>
                        <div className={mobileDetailValueClassName}>文章 {item.articleId}</div>
                      </div>
                      <div className={cn("text-sm", item.topicSource === "topicFission" ? "text-adminAccent" : "text-adminInkSoft")}>
                        {item.topicSource ?? "--"}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className={mobileDetailLabelClassName}>创建时间</div>
                        <div className={mobileDetailValueClassName}>{formatDateTime(item.articleCreatedAt)}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>裂变模式</div>
                        <div className={mobileDetailValueClassName}>{item.topicFissionMode ?? "--"}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className={mobileDetailLabelClassName}>结果</div>
                        <div className={mobileDetailValueClassName}>{item.hitStatus}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-adminBg text-adminInkMuted">
                    <tr>
                      {["作者", "文章", "创建时间", "来源", "裂变模式", "结果"].map((head) => (
                        <th key={head} className="px-4 py-3 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topFissionItems.map((item) => (
                      <tr key={`${item.userId}-${item.articleId}`} className="border-t border-adminLineStrong">
                        <td className={tableCellClassName}>{item.userId}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.articleId}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatDateTime(item.articleCreatedAt)}</td>
                        <td className={cn(tableCellClassName, item.topicSource === "topicFission" ? "text-adminAccent" : "text-adminInkSoft")}>{item.topicSource ?? "--"}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.topicFissionMode ?? "--"}</td>
                        <td className={tableCellClassName}>{item.hitStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>

        <article className={panelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={eyebrowClassName}>Matrix Output Drilldown</div>
              <div className="mt-3 text-sm leading-7 text-adminInkSoft">矩阵作者周发文和质量回流按作者展开，优先看对照窗是否成立。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={actionClassName} href="/api/admin/plan17/business?view=matrix-output" target="_blank" rel="noreferrer">JSON</a>
              <a className={actionClassName} href="/api/admin/plan17/business/export?scope=matrix-output&format=csv">CSV</a>
            </div>
          </div>
          {topMatrixItems.length === 0 ? (
            <div className="mt-6 text-sm leading-7 text-adminInkSoft">当前没有矩阵批次样本。</div>
          ) : (
            <>
              <div className={mobileDetailListClassName}>
                {topMatrixItems.map((item) => (
                  <article key={`mobile-${item.userId}-${item.activationAt || "none"}`} className={mobileDetailCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={eyebrowClassName}>作者 {item.userId}</div>
                        <div className={mobileDetailValueClassName}>启用时间 {formatDateTime(item.activationAt)}</div>
                      </div>
                      <div className={cn("text-sm", item.comparableQuality ? "text-adminAccent" : "text-adminInkMuted")}>
                        {item.comparableOutput ? (item.comparableQuality ? "完整对照" : "仅产能") : "不足"}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className={mobileDetailLabelClassName}>前 / 后发文</div>
                        <div className={mobileDetailValueClassName}>{item.beforeArticleCount} / {item.afterArticleCount}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>周中位数</div>
                        <div className={mobileDetailValueClassName}>{item.beforeMedian ?? "--"} / {item.afterMedian ?? "--"}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>增长</div>
                        <div className={mobileDetailValueClassName}>{formatPercent(item.outputGrowthPp)}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>质量前 / 后</div>
                        <div className={mobileDetailValueClassName}>{formatPercent(item.beforeHitRate)} / {formatPercent(item.afterHitRate)}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className={mobileDetailLabelClassName}>缺口</div>
                        <div className={mobileDetailValueClassName}>{formatGapReasons(item.gapReasons)}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-adminBg text-adminInkMuted">
                    <tr>
                      {["作者", "启用时间", "前/后发文", "周中位数", "增长", "质量前/后", "质量对照", "缺口"].map((head) => (
                        <th key={head} className="px-4 py-3 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topMatrixItems.map((item) => (
                      <tr key={`${item.userId}-${item.activationAt || "none"}`} className="border-t border-adminLineStrong">
                        <td className={tableCellClassName}>{item.userId}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatDateTime(item.activationAt)}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.beforeArticleCount} / {item.afterArticleCount}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.beforeMedian ?? "--"} / {item.afterMedian ?? "--"}</td>
                        <td className={tableCellClassName}>{formatPercent(item.outputGrowthPp)}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatPercent(item.beforeHitRate)} / {formatPercent(item.afterHitRate)}</td>
                        <td className={cn(tableCellClassName, item.comparableQuality ? "text-adminAccent" : "text-adminInkMuted")}>{item.comparableOutput ? (item.comparableQuality ? "完整" : "仅产能") : "不足"}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatGapReasons(item.gapReasons)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>

        <article className={panelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={eyebrowClassName}>风格画像真实使用明细</div>
              <div className="mt-3 text-sm leading-7 text-adminInkSoft">这里只统计真正写正文成功后的风格画像使用事件；按画像样本数、触发动作和最近 30 天状态展开，区分单样本画像与 3+ 样本画像。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={actionClassName} href="/api/admin/plan17/business?view=style-usage" target="_blank" rel="noreferrer">JSON</a>
              <a className={actionClassName} href="/api/admin/plan17/business/export?scope=style-usage&format=csv">CSV</a>
            </div>
          </div>
          {topStyleItems.length === 0 ? (
            <div className="mt-6 text-sm leading-7 text-adminInkSoft">当前还没有风格资产真实 usage event。</div>
          ) : (
            <>
              <div className={mobileDetailListClassName}>
                {topStyleItems.map((item) => (
                  <article key={`mobile-${item.userId}-${item.profileId || "none"}-${item.usedAt || "none"}`} className={mobileDetailCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={eyebrowClassName}>作者 {item.userId}</div>
                        <div className={mobileDetailValueClassName}>画像 {item.profileId ?? "--"} · 文章 {item.articleId ?? "--"}</div>
                      </div>
                      <div className={cn("text-sm", item.isMultiSample ? "text-adminAccent" : "text-adminInkMuted")}>
                        {item.isMultiSample ? "3+ 样本" : "单样本"}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className={mobileDetailLabelClassName}>触发动作</div>
                        <div className={mobileDetailValueClassName}>{formatStyleUsageSourceLabel(item.usageSource)}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>画像样本数</div>
                        <div className={mobileDetailValueClassName}>{item.sampleCount}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>近 30 天</div>
                        <div className={mobileDetailValueClassName}>{item.isRecent30d ? "是" : "否"}</div>
                      </div>
                      <div>
                        <div className={mobileDetailLabelClassName}>使用时间</div>
                        <div className={mobileDetailValueClassName}>{formatDateTime(item.usedAt)}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-adminBg text-adminInkMuted">
                    <tr>
                      {["作者", "画像", "文章", "触发动作", "画像样本数", "3+ 样本", "近 30 天", "使用时间"].map((head) => (
                        <th key={head} className="px-4 py-3 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topStyleItems.map((item) => (
                      <tr key={`${item.userId}-${item.profileId || "none"}-${item.usedAt || "none"}`} className="border-t border-adminLineStrong">
                        <td className={tableCellClassName}>{item.userId}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.profileId ?? "--"}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.articleId ?? "--"}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatStyleUsageSourceLabel(item.usageSource)}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.sampleCount}</td>
                        <td className={cn(tableCellClassName, item.isMultiSample ? "text-adminAccent" : "text-adminInkMuted")}>{item.isMultiSample ? "3+ 篇" : "单篇"}</td>
                        <td className={cn(tableCellClassName, item.isRecent30d ? "text-adminAccent" : "text-adminInkMuted")}>{item.isRecent30d ? "是" : "否"}</td>
                        <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatDateTime(item.usedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      </div>

      <article className={panelClassName}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className={eyebrowClassName}>Batch Drilldown</div>
            <h2 className="mt-4 font-serifCn text-3xl text-adminInk text-balance">批次明细</h2>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">
              按最近生成时间倒序排列。覆盖率只看已绑定稿件，不把未落稿的 backlog 项伪装成已回收结果。
            </p>
          </div>
          <div className="text-sm text-adminInkSoft">
            共 {batchDrilldown.items.length} 个 batch
          </div>
        </div>

        {batchDrilldown.items.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-adminLineStrong bg-adminBg px-5 py-10 text-sm leading-7 text-adminInkSoft">
            当前没有带 `generated_batch_id` 的真实批次数据，页面不会补造空行。可以先通过业务链路产出 batch，再回来查看 drilldown 或导出。
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 md:hidden">
              {batchDrilldown.items.map((item) => (
                <article key={item.batchId} className={mutedPanelClassName}>
                  <div className={eyebrowClassName}>Batch</div>
                  <div className="mt-2 break-all font-mono text-xs text-adminInk">{item.batchId}</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className={eyebrowClassName}>绑定稿件</div>
                      <div className="mt-2 text-lg text-adminInk">{item.linkedArticleCount}</div>
                    </div>
                    <div>
                      <div className={eyebrowClassName}>覆盖率 / 命中率</div>
                      <div className="mt-2 text-lg text-adminInk">{formatPercent(item.reviewCoverage)} / {formatPercent(item.hitRate)}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-adminInkSoft">
                    backlog {item.backlogIds.length > 0 ? item.backlogIds.join(", ") : "--"} · 回收 {item.reviewedArticleCount}/{item.linkedArticleCount} · 命中 {item.hitArticleCount} · 差一点 {item.nearMissArticleCount} · 未命中 {item.missArticleCount}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-adminInkSoft">{formatFissionModeBreakdown(item.fissionModeBreakdown)}</p>
                </article>
              ))}
            </div>

            <div className="mt-6 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-adminBg text-adminInkMuted">
                  <tr>
                    {["批次", "用户", "backlog", "生成区间", "绑定稿件", "回收", "命中率", "命中/差一点/未命中", "裂变模式"].map((head) => (
                      <th key={head} className="px-4 py-3 font-medium">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchDrilldown.items.map((item) => (
                    <tr key={item.batchId} className="border-t border-adminLineStrong">
                      <td className={cn(tableCellClassName, "max-w-[220px] break-all font-mono text-xs text-adminInk")}>{item.batchId}</td>
                      <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.userId}</td>
                      <td className={cn(tableCellClassName, "text-adminInkSoft")}>{item.backlogIds.length > 0 ? item.backlogIds.join(", ") : "--"}</td>
                      <td className={cn(tableCellClassName, "text-adminInkSoft")}>
                        <div>{formatDateTime(item.firstGeneratedAt)}</div>
                        <div className="mt-1 text-xs text-adminInkMuted">latest {formatDateTime(item.lastGeneratedAt)}</div>
                      </td>
                      <td className={cn(tableCellClassName, "text-adminInk")}>
                        <div>{item.linkedArticleCount} 篇</div>
                        <div className="mt-1 text-xs text-adminInkMuted">latest article {formatDateTime(item.latestLinkedArticleCreatedAt)}</div>
                      </td>
                      <td className={cn(tableCellClassName, "text-adminInkSoft")}>
                        <div>{item.reviewedArticleCount}/{item.linkedArticleCount}</div>
                        <div className="mt-1 text-xs text-adminInkMuted">待回收 {item.pendingReviewArticleCount} · 覆盖率 {formatPercent(item.reviewCoverage)}</div>
                      </td>
                      <td className={cn(tableCellClassName, "text-adminInk")}>{formatPercent(item.hitRate)}</td>
                      <td className={cn(tableCellClassName, "text-adminInkSoft")}>
                        {item.hitArticleCount} / {item.nearMissArticleCount} / {item.missArticleCount}
                      </td>
                      <td className={cn(tableCellClassName, "text-adminInkSoft")}>{formatFissionModeBreakdown(item.fissionModeBreakdown)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
