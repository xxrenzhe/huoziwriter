import { Button, Input, Select, Textarea } from "@huoziwriter/ui";
import type { ReviewSeriesPlaybook } from "@/lib/article-outcomes";
import { formatOutcomeHitStatus } from "@/lib/article-workspace-formatters";

type OutcomeWindowCode = "24h" | "72h" | "7d";

type OutcomeWindowCard = {
  code: OutcomeWindowCode;
  label: string;
  snapshot: {
    readCount: number;
    shareCount: number;
    likeCount: number;
    updatedAt: string;
  } | null;
};

type OutcomeWritingStateFeedback = {
  recommendedPrototypeLabel: string | null;
  recommendedPrototypeCode: string | null;
  adoptedPrototypeLabel: string | null;
  adoptedPrototypeCode: string | null;
  followedPrototypeRecommendation: boolean | null;
  recommendedVariantLabel: string | null;
  recommendedVariantCode: string | null;
  adoptedVariantLabel: string | null;
  adoptedVariantCode: string | null;
  followedRecommendation: boolean | null;
  recommendedOpeningPatternLabel: string | null;
  recommendedSyntaxPatternLabel: string | null;
  recommendedEndingPatternLabel: string | null;
  adoptedOpeningPatternLabel: string | null;
  adoptedSyntaxPatternLabel: string | null;
  adoptedEndingPatternLabel: string | null;
  followedPatternRecommendation: boolean | null;
  availableVariantCount: number;
  comparisonSampleCount: number;
  recommendationReason: string | null;
  adoptedReason: string | null;
};

type ArticleScorecardSummaryLike = {
  predictedScore: number | null;
  qualityScore: number | null;
  viralScore: number | null;
  riskPenalty: number | null;
  summary: string;
  blockers: string[];
  aiNoiseScore: number | null;
  aiNoiseLevel: string;
} | null;

type ArticleOutcomeAttributionSummaryLike = {
  topicSummary: string;
  predictedFlipStrength: number | null;
  archetypeLabel: string;
  fourPointAverageScore: number | null;
  humanSignalScore: number | null;
  strategyOverride: boolean;
  hookLabel: string;
  hookTagCoverageCount: number | null;
  hookStrengthAverage: number | null;
  rhythmStatusLabel: string;
  rhythmScore: number | null;
  rhythmDetail: string;
} | null;

type SelectedSeriesLike = {
  name: string;
  personaName: string;
} | null;

type LatestSyncLogLike = {
  createdAt: string;
  connectionName: string | null;
} | null;

type OutcomeWorkspacePanelProps = {
  currentHitStatus: "pending" | "hit" | "near_miss" | "miss";
  currentTargetPackage: string;
  completedWindowCodes: string[];
  missingWindowCodes: string[];
  currentReviewSummary: string;
  currentNextAction: string;
  currentPlaybookTags: string[];
  writingStateFeedback: OutcomeWritingStateFeedback | null;
  articleScorecardSummary: ArticleScorecardSummaryLike;
  articleOutcomeAttributionSummary: ArticleOutcomeAttributionSummaryLike;
  latestSyncLog: LatestSyncLogLike;
  outcomeWindowCards: OutcomeWindowCard[];
  selectedOutcomeWindowCode: OutcomeWindowCode;
  onSelectOutcomeWindowCode: (code: OutcomeWindowCode) => void;
  selectedSeries: SelectedSeriesLike;
  loadingSeriesPlaybook: boolean;
  seriesPlaybook: ReviewSeriesPlaybook | null;
  outcomeReadCount: string;
  onChangeOutcomeReadCount: (value: string) => void;
  outcomeShareCount: string;
  onChangeOutcomeShareCount: (value: string) => void;
  outcomeLikeCount: string;
  onChangeOutcomeLikeCount: (value: string) => void;
  outcomeNotes: string;
  onChangeOutcomeNotes: (value: string) => void;
  outcomeTargetPackage: string;
  onChangeOutcomeTargetPackage: (value: string) => void;
  outcomeHitStatus: "pending" | "hit" | "near_miss" | "miss";
  onChangeOutcomeHitStatus: (value: "pending" | "hit" | "near_miss" | "miss") => void;
  outcomeReviewSummary: string;
  onChangeOutcomeReviewSummary: (value: string) => void;
  outcomeNextAction: string;
  onChangeOutcomeNextAction: (value: string) => void;
  outcomePlaybookTagsInput: string;
  onChangeOutcomePlaybookTagsInput: (value: string) => void;
  savingOutcomeSnapshot: boolean;
  onSaveOutcomeSnapshot: () => void;
};

export function OutcomeWorkspacePanel({
  currentHitStatus,
  currentTargetPackage,
  completedWindowCodes,
  missingWindowCodes,
  currentReviewSummary,
  currentNextAction,
  currentPlaybookTags,
  writingStateFeedback,
  articleScorecardSummary,
  articleOutcomeAttributionSummary,
  latestSyncLog,
  outcomeWindowCards,
  selectedOutcomeWindowCode,
  onSelectOutcomeWindowCode,
  selectedSeries,
  loadingSeriesPlaybook,
  seriesPlaybook,
  outcomeReadCount,
  onChangeOutcomeReadCount,
  outcomeShareCount,
  onChangeOutcomeShareCount,
  outcomeLikeCount,
  onChangeOutcomeLikeCount,
  outcomeNotes,
  onChangeOutcomeNotes,
  outcomeTargetPackage,
  onChangeOutcomeTargetPackage,
  outcomeHitStatus,
  onChangeOutcomeHitStatus,
  outcomeReviewSummary,
  onChangeOutcomeReviewSummary,
  outcomeNextAction,
  onChangeOutcomeNextAction,
  outcomePlaybookTagsInput,
  onChangeOutcomePlaybookTagsInput,
  savingOutcomeSnapshot,
  onSaveOutcomeSnapshot,
}: OutcomeWorkspacePanelProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="border border-lineStrong bg-surfaceWarm p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">结果回流</div>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          <div className="border border-lineStrong/60 bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前判定</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{formatOutcomeHitStatus(currentHitStatus)}</div>
          </div>
          <div className="border border-lineStrong/60 bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">目标包</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">{currentTargetPackage || "未填写"}</div>
          </div>
          <div className="border border-lineStrong/60 bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">预测分</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              {articleScorecardSummary?.predictedScore != null ? `${Math.round(articleScorecardSummary.predictedScore)} / 100` : "暂未接入"}
            </div>
          </div>
          <div className="border border-lineStrong/60 bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">已补快照</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">{completedWindowCodes.length > 0 ? completedWindowCodes.join(" / ") : "暂无"}</div>
          </div>
        </div>
        <div className="mt-3 text-sm leading-7 text-inkSoft">
          {missingWindowCodes.length > 0
            ? `当前还缺 ${missingWindowCodes.join(" / ")} 快照。`
            : "24h / 72h / 7d 快照已补齐，可以专注写命中判定与复盘动作。"}
        </div>
        <div className="mt-4 border border-lineStrong/60 bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">写作状态回流</div>
          {writingStateFeedback ? (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">推荐原型</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.recommendedPrototypeLabel || writingStateFeedback.recommendedPrototypeCode || "未记录"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">采用原型</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.adoptedPrototypeLabel || writingStateFeedback.adoptedPrototypeCode || "未记录"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">原型是否跟随推荐</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.followedPrototypeRecommendation === null
                      ? "未记录"
                      : writingStateFeedback.followedPrototypeRecommendation
                        ? "跟随推荐"
                        : "覆盖推荐"}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">推荐状态</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.recommendedVariantLabel || writingStateFeedback.recommendedVariantCode || "未记录"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">采用状态</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.adoptedVariantLabel || writingStateFeedback.adoptedVariantCode || "未记录"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">状态是否跟随推荐</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.followedRecommendation === null
                      ? "未记录"
                      : writingStateFeedback.followedRecommendation
                        ? "跟随推荐"
                        : "覆盖推荐"}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">推荐写法呼吸</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {[
                      writingStateFeedback.recommendedOpeningPatternLabel,
                      writingStateFeedback.recommendedSyntaxPatternLabel,
                      writingStateFeedback.recommendedEndingPatternLabel,
                    ].filter(Boolean).join(" / ") || "未记录"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">实际写法呼吸</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {[
                      writingStateFeedback.adoptedOpeningPatternLabel,
                      writingStateFeedback.adoptedSyntaxPatternLabel,
                      writingStateFeedback.adoptedEndingPatternLabel,
                    ].filter(Boolean).join(" / ") || "未记录"}
                  </div>
                </div>
                <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">模式是否跟随推荐</div>
                  <div className="mt-2 text-sm leading-7 text-ink">
                    {writingStateFeedback.followedPatternRecommendation === null
                      ? "未记录"
                      : writingStateFeedback.followedPatternRecommendation
                        ? "跟随推荐"
                        : "覆盖推荐"}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs leading-6 text-inkMuted">
                本次回流记录覆盖 {writingStateFeedback.availableVariantCount} 个候选状态，其中纳入 {writingStateFeedback.comparisonSampleCount} 个对比样本。
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm leading-7 text-inkMuted">
              这个时间窗还没有写作回流。保存结果快照时，系统会自动记录当时采用的是不是推荐原型、推荐状态和推荐写法呼吸。
            </div>
          )}
          {writingStateFeedback?.recommendationReason ? (
            <div className="mt-3 text-xs leading-6 text-inkMuted">推荐理由：{writingStateFeedback.recommendationReason}</div>
          ) : null}
          {writingStateFeedback?.adoptedReason ? (
            <div className="mt-1 text-xs leading-6 text-inkMuted">实际采用原因：{writingStateFeedback.adoptedReason}</div>
          ) : null}
        </div>
        {articleScorecardSummary ? (
          <div className="mt-4 border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前文章分数卡</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">质量分</div>
                <div className="mt-2 text-lg text-ink">{articleScorecardSummary.qualityScore != null ? Math.round(articleScorecardSummary.qualityScore) : "--"}</div>
              </div>
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">爆款分</div>
                <div className="mt-2 text-lg text-ink">{articleScorecardSummary.viralScore != null ? Math.round(articleScorecardSummary.viralScore) : "--"}</div>
              </div>
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">风险扣分</div>
                <div className="mt-2 text-lg text-cinnabar">{articleScorecardSummary.riskPenalty != null ? Math.round(articleScorecardSummary.riskPenalty) : "--"}</div>
              </div>
            </div>
            {articleScorecardSummary.summary ? <div className="mt-3 text-sm leading-7 text-inkSoft">{articleScorecardSummary.summary}</div> : null}
            {articleScorecardSummary.blockers.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {articleScorecardSummary.blockers.map((item) => (
                  <span key={item} className="border border-cinnabar/20 bg-surfaceWarning px-2 py-1 text-xs text-cinnabar">
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            {articleScorecardSummary.aiNoiseScore != null || articleScorecardSummary.aiNoiseLevel ? (
              <div className="mt-3 text-xs leading-6 text-inkMuted">
                AI 噪声 {articleScorecardSummary.aiNoiseScore != null ? Math.round(articleScorecardSummary.aiNoiseScore) : "--"} · {articleScorecardSummary.aiNoiseLevel || "unknown"}
              </div>
            ) : null}
          </div>
        ) : null}
        {articleOutcomeAttributionSummary ? (
          <div className="mt-4 border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">结构归因</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">选题来源</div>
                <div className="mt-2 text-sm leading-7 text-ink">{articleOutcomeAttributionSummary.topicSummary}</div>
                <div className="mt-2 text-xs leading-6 text-inkMuted">
                  预估反差强度 {articleOutcomeAttributionSummary.predictedFlipStrength != null ? articleOutcomeAttributionSummary.predictedFlipStrength.toFixed(1) : "--"}
                </div>
              </div>
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">策略强度</div>
                <div className="mt-2 text-sm leading-7 text-ink">{articleOutcomeAttributionSummary.archetypeLabel}</div>
                <div className="mt-2 text-xs leading-6 text-inkMuted">
                  四元 {articleOutcomeAttributionSummary.fourPointAverageScore != null ? articleOutcomeAttributionSummary.fourPointAverageScore.toFixed(2) : "--"} ·
                  人味 {articleOutcomeAttributionSummary.humanSignalScore != null ? articleOutcomeAttributionSummary.humanSignalScore.toFixed(1) : "--"}
                  {articleOutcomeAttributionSummary.strategyOverride ? " · 有人工覆盖" : ""}
                </div>
              </div>
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">爆点组合</div>
                <div className="mt-2 text-sm leading-7 text-ink">{articleOutcomeAttributionSummary.hookLabel}</div>
                <div className="mt-2 text-xs leading-6 text-inkMuted">
                  标签覆盖 {articleOutcomeAttributionSummary.hookTagCoverageCount != null ? articleOutcomeAttributionSummary.hookTagCoverageCount : "--"} 类 ·
                  强度均值 {articleOutcomeAttributionSummary.hookStrengthAverage != null ? articleOutcomeAttributionSummary.hookStrengthAverage.toFixed(2) : "--"}
                </div>
              </div>
              <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">节奏贴合</div>
                <div className="mt-2 text-sm leading-7 text-ink">{articleOutcomeAttributionSummary.rhythmStatusLabel}</div>
                <div className="mt-2 text-xs leading-6 text-inkMuted">
                  节奏分 {articleOutcomeAttributionSummary.rhythmScore != null ? articleOutcomeAttributionSummary.rhythmScore.toFixed(2) : "--"}
                </div>
                <div className="mt-2 text-xs leading-6 text-inkMuted">{articleOutcomeAttributionSummary.rhythmDetail}</div>
              </div>
            </div>
          </div>
        ) : null}
        {latestSyncLog ? (
          <div className="mt-2 text-xs leading-6 text-inkMuted">
            最近发布记录：{new Date(latestSyncLog.createdAt).toLocaleString("zh-CN")} · {latestSyncLog.connectionName || "未命名公众号"}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-lineStrong bg-surface p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结果快照</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {outcomeWindowCards.map((windowItem) => {
              const isActive = selectedOutcomeWindowCode === windowItem.code;
              return (
                <Button
                  key={windowItem.code}
                  type="button"
                  onClick={() => onSelectOutcomeWindowCode(windowItem.code)}
                  variant="secondary"
                  fullWidth
                  className={`h-full whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                    isActive
                      ? "border-cinnabar bg-surfaceWarning hover:border-cinnabar hover:bg-surfaceWarning"
                      : windowItem.snapshot
                        ? "border-lineStrong bg-paperStrong hover:border-lineStrong hover:bg-paperStrong"
                        : "border-lineStrong/60 bg-surface"
                  }`}
                >
                  <span className="text-xs uppercase tracking-[0.18em] text-inkMuted">{windowItem.label}</span>
                  <span className="mt-2 text-sm leading-7 text-inkSoft">
                    {windowItem.snapshot
                      ? `阅读 ${windowItem.snapshot.readCount} · 分享 ${windowItem.snapshot.shareCount} · 在看 ${windowItem.snapshot.likeCount}`
                      : "尚未录入"}
                  </span>
                  <span className="mt-2 text-xs leading-6 text-inkMuted">
                    {windowItem.snapshot?.updatedAt ? `更新于 ${new Date(windowItem.snapshot.updatedAt).toLocaleString("zh-CN")}` : "点击后可开始录入"}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-lineStrong bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">命中复盘</div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-inkSoft">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">复盘结论</div>
                <div className="mt-1">{currentReviewSummary || "还没有复盘结论。先补数据，再写本次命中或失手的关键原因。"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">下一步动作</div>
                <div className="mt-1">{currentNextAction || "还没有下一步动作。建议明确下一篇继续复用或立刻停用的打法。"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">打法标签</div>
                <div className="mt-1">{currentPlaybookTags.length > 0 ? currentPlaybookTags.join(" / ") : "还没有沉淀打法标签。"}</div>
              </div>
            </div>
          </div>

          <div className="border border-lineStrong bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">当前系列推荐打法</div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              {selectedSeries
                ? `当前稿件归属「${selectedSeries.name}」，绑定人设为 ${selectedSeries.personaName}。`
                : "当前稿件还没有绑定系列，请先完成系列绑定，再沉淀可复用打法。"}
            </div>
            {loadingSeriesPlaybook ? (
              <div className="mt-4 border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                正在刷新当前系列的推荐打法...
              </div>
            ) : seriesPlaybook ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-inkSoft">
                  <span className="border border-lineStrong bg-paperStrong px-3 py-1">命中 {seriesPlaybook.hitCount} 篇</span>
                  <span className="border border-lineStrong bg-paperStrong px-3 py-1">差一点 {seriesPlaybook.nearMissCount} 篇</span>
                  <span className="border border-lineStrong bg-paperStrong px-3 py-1">已沉淀 {seriesPlaybook.articleCount} 篇</span>
                </div>
                <div className="mt-4 space-y-2">
                  {seriesPlaybook.topLabels.slice(0, 3).map((item) => (
                    <div key={item.label} className="border border-lineStrong/60 bg-surfaceWarm px-3 py-3 text-sm leading-7 text-inkSoft">
                      <div className="font-medium text-ink">{item.label}</div>
                      <div className="mt-1 text-xs leading-6 text-inkMuted">
                        命中 {item.hitCount} 篇 · 差一点 {item.nearMissCount} 篇 · 最近出现在
                        {item.latestArticleTitle ? `《${item.latestArticleTitle}》` : "结果样本中"}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-xs leading-6 text-inkMuted">
                  {seriesPlaybook.latestArticleTitle
                    ? `最近一次系列沉淀来自《${seriesPlaybook.latestArticleTitle}》。`
                    : "当前系列已有结果样本，但还缺最近命中标题。"}
                </div>
              </>
            ) : (
              <div className="mt-4 border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                当前系列还没有足够的真实回流样本。先补 24h / 72h / 7d 快照，并给结果写清楚打法标签。
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border border-lineStrong bg-surface p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">录入结果</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">时间窗</div>
              <Select
                aria-label="结果时间窗"
                value={selectedOutcomeWindowCode}
                onChange={(event) => onSelectOutcomeWindowCode(event.target.value as OutcomeWindowCode)}
                className="px-3 py-2"
              >
                {outcomeWindowCards.map((windowItem) => (
                  <option key={windowItem.code} value={windowItem.code}>{windowItem.label}</option>
                ))}
              </Select>
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">阅读</div>
                <Input aria-label="阅读数" value={outcomeReadCount} onChange={(event) => onChangeOutcomeReadCount(event.target.value)} inputMode="numeric" className="px-3 py-2" />
              </label>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">分享</div>
                <Input aria-label="分享数" value={outcomeShareCount} onChange={(event) => onChangeOutcomeShareCount(event.target.value)} inputMode="numeric" className="px-3 py-2" />
              </label>
              <label className="block text-sm text-inkSoft">
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">在看 / 点赞</div>
                <Input aria-label="在看或点赞数" value={outcomeLikeCount} onChange={(event) => onChangeOutcomeLikeCount(event.target.value)} inputMode="numeric" className="px-3 py-2" />
              </label>
            </div>
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">快照备注</div>
              <Textarea aria-label="结果快照备注" value={outcomeNotes} onChange={(event) => onChangeOutcomeNotes(event.target.value)} className="min-h-[96px] px-3 py-2" />
            </label>
          </div>

          <div className="space-y-3">
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">目标包</div>
              <Input aria-label="例如：5k / 10w+" value={outcomeTargetPackage} onChange={(event) => onChangeOutcomeTargetPackage(event.target.value)} placeholder="例如：5k / 10w+" className="px-3 py-2" />
            </label>
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">命中判定</div>
              <Select
                aria-label="命中判定"
                value={outcomeHitStatus}
                onChange={(event) => onChangeOutcomeHitStatus(event.target.value as "pending" | "hit" | "near_miss" | "miss")}
                className="px-3 py-2"
              >
                <option value="pending">待判定</option>
                <option value="hit">已命中</option>
                <option value="near_miss">差一点命中</option>
                <option value="miss">未命中</option>
              </Select>
            </label>
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">复盘结论</div>
              <Textarea aria-label="复盘结论" value={outcomeReviewSummary} onChange={(event) => onChangeOutcomeReviewSummary(event.target.value)} className="min-h-[96px] px-3 py-2" />
            </label>
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">下一步动作</div>
              <Textarea aria-label="下一步动作" value={outcomeNextAction} onChange={(event) => onChangeOutcomeNextAction(event.target.value)} className="min-h-[96px] px-3 py-2" />
            </label>
            <label className="block text-sm text-inkSoft">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-inkMuted">打法标签</div>
              <Input
                aria-label="用逗号分隔，例如：反直觉开头，案例拆解，强结论收束"
                value={outcomePlaybookTagsInput}
                onChange={(event) => onChangeOutcomePlaybookTagsInput(event.target.value)}
                placeholder="用逗号分隔，例如：反直觉开头，案例拆解，强结论收束"
                className="px-3 py-2"
              />
            </label>
            <Button type="button" onClick={onSaveOutcomeSnapshot} disabled={savingOutcomeSnapshot} variant="primary">
              {savingOutcomeSnapshot ? "保存中…" : "保存结果快照"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
