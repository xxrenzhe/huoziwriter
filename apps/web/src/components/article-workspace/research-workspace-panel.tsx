import { Button } from "@huoziwriter/ui";
import type { ArticleMainStepCode } from "@/lib/article-workflow-registry";
import {
  formatResearchCoverageSufficiencyLabel,
  formatResearchSourceTraceLabel,
} from "@/lib/article-workspace-formatters";
import {
  getPayloadRecordArray,
  getPayloadStringArray,
} from "@/lib/article-workspace-helpers";

type ResearchArtifactLike = {
  updatedAt?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
} | null;

type StrategyWritebackField = {
  key: string;
  label: string;
  value: string;
  currentValue: string;
};

type ResearchCoverageItem = {
  key: string;
  label: string;
  signals: string[];
};

type ExternalResearchDiagnostics = {
  attempted: boolean;
  query: string;
  searchUrl: string;
  discoveredCount: number;
  attachedCount: number;
  skippedCount: number;
  failed: Array<{ url: string; error: string }>;
  searchError: string;
};

type ResearchWorkspacePanelProps = {
  researchArtifact: ResearchArtifactLike;
  researchActionLabel: string;
  generatingResearchBrief: boolean;
  disableGenerateResearchBrief: boolean;
  onGenerateResearchBrief: () => void;
  researchCoverageTone: string;
  researchCoverageSufficiency: string;
  researchSourceCoverageNote: string;
  researchCoverageItems: ResearchCoverageItem[];
  researchCoverageMissing: string[];
  externalResearchDiagnostics: ExternalResearchDiagnostics | null;
  researchMustCoverAngles: string[];
  researchHypothesesToVerify: string[];
  researchForbiddenConclusions: string[];
  researchTimelineCards: Record<string, unknown>[];
  researchComparisonCards: Record<string, unknown>[];
  researchIntersectionInsights: Record<string, unknown>[];
  currentArticleMainStepCode: ArticleMainStepCode;
  strategyWritebackFields: StrategyWritebackField[];
  savingStrategyCard: boolean;
  onApplyStrategyWriteback: () => void;
  suggestedEvidenceItemsCount: number;
  savingEvidenceItems: boolean;
  onApplySuggestedEvidence: () => void;
};

function ResearchSourceReferences({ sources }: { sources: Record<string, unknown>[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">来源追溯</div>
      <div className="space-y-2">
        {sources.map((source, index) => {
          const label = String(source.label || `来源 ${index + 1}`).trim();
          const sourceType = String(source.sourceType || "").trim();
          const detail = String(source.detail || "").trim();
          const sourceUrl = String(source.sourceUrl || "").trim();
          return (
            <div key={`${label}-${sourceType}-${sourceUrl || index}`} className="border border-lineStrong/60 bg-surface px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-ink">{label}</div>
                {sourceType ? (
                  <span className="border border-lineStrong px-2 py-1 text-[11px] text-inkMuted">
                    {formatResearchSourceTraceLabel(sourceType)}
                  </span>
                ) : null}
              </div>
              {detail ? <div className="mt-2 text-xs leading-6 text-inkMuted">{detail}</div> : null}
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-cinnabar underline"
                >
                  打开原始来源
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResearchWorkspacePanel({
  researchArtifact,
  researchActionLabel,
  generatingResearchBrief,
  disableGenerateResearchBrief,
  onGenerateResearchBrief,
  researchCoverageTone,
  researchCoverageSufficiency,
  researchSourceCoverageNote,
  researchCoverageItems,
  researchCoverageMissing,
  externalResearchDiagnostics,
  researchMustCoverAngles,
  researchHypothesesToVerify,
  researchForbiddenConclusions,
  researchTimelineCards,
  researchComparisonCards,
  researchIntersectionInsights,
  currentArticleMainStepCode,
  strategyWritebackFields,
  savingStrategyCard,
  onApplyStrategyWriteback,
  suggestedEvidenceItemsCount,
  savingEvidenceItems,
  onApplySuggestedEvidence,
}: ResearchWorkspacePanelProps) {
  const needsResearchSupplement = researchCoverageMissing.length > 0 || !researchArtifact;
  const researchPrimaryActionLabel = generatingResearchBrief
    ? needsResearchSupplement
      ? "补研究中…"
      : "刷新中…"
    : needsResearchSupplement
      ? "一键补研究并刷新简报"
      : researchArtifact
        ? "刷新研究简报"
        : researchActionLabel;
  const researchActionHelperText = needsResearchSupplement
    ? "会优先补抓可用研究信源，再刷新时间脉络、横向比较和交汇洞察。"
    : "如研究底座已经够用，可直接刷新这一版研究简报。";
  return (
    <div className="space-y-4 border border-warning/30 bg-surfaceWarm px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">Research Workspace</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">hv-analysis 轻量研究面板</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            先把时间脉络、横向比较和交汇洞察补齐，再让策略卡、大纲和正文判断吃到这层研究底座。
          </div>
          <div className="mt-2 text-xs leading-6 text-inkMuted">{researchActionHelperText}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {researchArtifact?.updatedAt ? (
            <div className="text-xs leading-6 text-inkMuted">
              更新于 {new Date(researchArtifact.updatedAt).toLocaleString("zh-CN")}
            </div>
          ) : null}
          <Button
            type="button"
            onClick={onGenerateResearchBrief}
            disabled={disableGenerateResearchBrief}
            variant="primary"
            size="sm"
          >
            {researchPrimaryActionLabel}
          </Button>
        </div>
      </div>

      {researchCoverageMissing.length > 0 ? (
        <div className="border border-warning/40 bg-surface px-4 py-3 text-sm leading-7 text-inkSoft">
          当前仍缺这些研究维度：{researchCoverageMissing.join("、")}。点击上方按钮会先尝试补研究源，再刷新研究简报。
        </div>
      ) : null}

      {externalResearchDiagnostics ? (
        <div className="border border-lineStrong/70 bg-surface px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">Fetch Diagnostics</div>
              <div className="mt-2 font-medium text-ink">外部补源诊断</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                {externalResearchDiagnostics.attempted
                  ? `已尝试查询「${externalResearchDiagnostics.query || "未记录查询词"}」，发现 ${externalResearchDiagnostics.discoveredCount} 个候选链接，成功补入 ${externalResearchDiagnostics.attachedCount} 条。`
                  : "本次没有可用的搜索入口或外部链接线索，因此没有发起外部补源。"}
              </div>
              {externalResearchDiagnostics.searchUrl ? (
                <a href={externalResearchDiagnostics.searchUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-cinnabar underline">
                  查看本次搜索入口
                </a>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={onGenerateResearchBrief}
              disabled={disableGenerateResearchBrief}
              variant="secondary"
              size="sm"
            >
              重新补抓研究源
            </Button>
          </div>

          {externalResearchDiagnostics.searchError || externalResearchDiagnostics.failed.length > 0 ? (
            <div className="mt-3 border border-warning/40 bg-surfaceWarning px-3 py-3 text-sm leading-7 text-warning">
              <div className="font-medium">抓取未完全成功</div>
              {externalResearchDiagnostics.searchError ? <div className="mt-1">搜索失败：{externalResearchDiagnostics.searchError}</div> : null}
              {externalResearchDiagnostics.failed.slice(0, 3).map((item) => (
                <div key={`${item.url}-${item.error}`} className="mt-1 break-all">
                  {item.url}：{item.error}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 text-xs leading-6 text-inkMuted md:grid-cols-4">
            <div className="border border-lineStrong/60 px-3 py-2">候选链接 {externalResearchDiagnostics.discoveredCount}</div>
            <div className="border border-lineStrong/60 px-3 py-2">已补入 {externalResearchDiagnostics.attachedCount}</div>
            <div className="border border-lineStrong/60 px-3 py-2">跳过 {externalResearchDiagnostics.skippedCount}</div>
            <div className="border border-lineStrong/60 px-3 py-2">失败 {externalResearchDiagnostics.failed.length}</div>
          </div>
          <div className="mt-3 border border-dashed border-lineStrong px-3 py-3 text-xs leading-6 text-inkMuted">
            补救动作：重新补抓研究源；手动粘贴网页链接到素材；从 IMA 搜索证据；或先继续写低置信草稿并保留研究待补提示。
          </div>
        </div>
      ) : null}

      {researchArtifact ? (
        <>
          {researchArtifact.summary ? (
            <div className="border border-lineStrong/60 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
              {researchArtifact.summary}
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">Research Brief</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-inkSoft">
                {String(researchArtifact.payload?.researchObject || "").trim() ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">研究对象</div>
                    <div className="mt-1">{String(researchArtifact.payload?.researchObject)}</div>
                  </div>
                ) : null}
                {String(researchArtifact.payload?.coreQuestion || "").trim() ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">核心研究问题</div>
                    <div className="mt-1">{String(researchArtifact.payload?.coreQuestion)}</div>
                  </div>
                ) : null}
                {String(researchArtifact.payload?.authorHypothesis || "").trim() ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">待验证假设</div>
                    <div className="mt-1">{String(researchArtifact.payload?.authorHypothesis)}</div>
                  </div>
                ) : null}
                {String(researchArtifact.payload?.targetReader || "").trim() ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">默认读者</div>
                    <div className="mt-1">{String(researchArtifact.payload?.targetReader)}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`border px-4 py-4 ${researchCoverageTone}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em]">Source Sufficiency</div>
                  <div className="mt-2 font-serifCn text-2xl text-balance">
                    {formatResearchCoverageSufficiencyLabel(researchCoverageSufficiency)}
                  </div>
                </div>
                <div className="text-xs leading-6">
                  {researchCoverageItems.filter((item) => item.signals.length > 0).length} / {researchCoverageItems.length} 类来源已覆盖
                </div>
              </div>
              {researchSourceCoverageNote ? (
                <div className="mt-2 text-sm leading-7">{researchSourceCoverageNote}</div>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {researchCoverageItems.map((item) => (
                  <div key={item.key} className="border border-current/20 bg-surface/60 px-3 py-3 text-sm leading-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-ink">{item.label}</div>
                      <div className="text-xs">{item.signals.length > 0 ? "已覆盖" : "待补"}</div>
                    </div>
                    <div className="mt-2 text-xs">
                      {item.signals.length > 0 ? item.signals.slice(0, 2).join("；") : "当前还没有命中这一类信号。"}
                    </div>
                  </div>
                ))}
              </div>
              {researchCoverageMissing.length > 0 ? (
                <div className="mt-3 text-xs leading-6">
                  当前缺口：{researchCoverageMissing.join("、")}
                </div>
              ) : null}
            </div>
          </div>

          {(researchMustCoverAngles.length > 0 || researchHypothesesToVerify.length > 0 || researchForbiddenConclusions.length > 0) ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {researchMustCoverAngles.length > 0 ? (
                <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">必查维度</div>
                  <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                    {researchMustCoverAngles.map((item) => (
                      <div key={item}>- {item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {researchHypothesesToVerify.length > 0 ? (
                <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">重点验证</div>
                  <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                    {researchHypothesesToVerify.map((item) => (
                      <div key={item}>- {item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {researchForbiddenConclusions.length > 0 ? (
                <div className="border border-lineStrong/60 bg-surface px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">禁止先下结论</div>
                  <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                    {researchForbiddenConclusions.map((item) => (
                      <div key={item}>- {item}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">时间脉络</div>
                <div className="text-xs text-inkMuted">{researchTimelineCards.length} 张卡</div>
              </div>
              {researchTimelineCards.length > 0 ? (
                researchTimelineCards.map((item, index) => (
                  <div key={`${String(item.title || index)}`} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {String(item.phase || "").trim() ? (
                        <span className="border border-warning/30 bg-surfaceWarning px-2 py-1 text-[11px] text-inkSoft">
                          {String(item.phase)}
                        </span>
                      ) : null}
                      <div className="font-medium text-ink">{String(item.title || `阶段 ${index + 1}`)}</div>
                    </div>
                    {String(item.summary || "").trim() ? (
                      <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.summary)}</div>
                    ) : null}
                    {getPayloadStringArray(item, "signals").length > 0 ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">
                        线索：{getPayloadStringArray(item, "signals").join("；")}
                      </div>
                    ) : null}
                    <ResearchSourceReferences sources={getPayloadRecordArray(item, "sources")} />
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  还没有时间脉络卡。没有这层，文章会更容易只写“现在发生了什么”。
                </div>
              )}
            </div>

            <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">横向对比</div>
                <div className="text-xs text-inkMuted">{researchComparisonCards.length} 张卡</div>
              </div>
              {researchComparisonCards.length > 0 ? (
                researchComparisonCards.map((item, index) => (
                  <div key={`${String(item.subject || index)}`} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                    <div className="font-medium text-ink">{String(item.subject || `对比对象 ${index + 1}`)}</div>
                    {String(item.position || "").trim() ? (
                      <div className="mt-2 text-sm leading-7 text-inkSoft">{String(item.position)}</div>
                    ) : null}
                    {getPayloadStringArray(item, "differences").length > 0 ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">
                        关键差异：{getPayloadStringArray(item, "differences").join("；")}
                      </div>
                    ) : null}
                    {getPayloadStringArray(item, "userVoices").length > 0 ? (
                      <div className="mt-1 text-xs leading-6 text-inkMuted">
                        用户反馈：{getPayloadStringArray(item, "userVoices").join("；")}
                      </div>
                    ) : null}
                    {(getPayloadStringArray(item, "opportunities").length > 0 || getPayloadStringArray(item, "risks").length > 0) ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {getPayloadStringArray(item, "opportunities").length > 0 ? (
                          <div className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-6 text-emerald-700">
                            机会：{getPayloadStringArray(item, "opportunities").join("；")}
                          </div>
                        ) : null}
                        {getPayloadStringArray(item, "risks").length > 0 ? (
                          <div className="border border-danger/30 bg-surface px-3 py-2 text-xs leading-6 text-danger">
                            风险：{getPayloadStringArray(item, "risks").join("；")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <ResearchSourceReferences sources={getPayloadRecordArray(item, "sources")} />
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  还没有横向比较卡。没有同类或替代路径，后续判断更容易写成单点观察。
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">交汇洞察</div>
                <div className="text-xs text-inkMuted">{researchIntersectionInsights.length} 条</div>
              </div>
              {researchIntersectionInsights.length > 0 ? (
                researchIntersectionInsights.map((item, index) => (
                  <div key={`${String(item.insight || index)}`} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                    <div className="font-medium text-ink">{String(item.insight || `洞察 ${index + 1}`)}</div>
                    {String(item.whyNow || "").trim() ? (
                      <div className="mt-2 text-sm leading-7 text-inkSoft">Why now：{String(item.whyNow)}</div>
                    ) : null}
                    {getPayloadStringArray(item, "support").length > 0 ? (
                      <div className="mt-2 text-xs leading-6 text-inkMuted">
                        支撑线索：{getPayloadStringArray(item, "support").join("；")}
                      </div>
                    ) : null}
                    {String(item.caution || "").trim() ? (
                      <div className="mt-2 border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                        注意：{String(item.caution)}
                      </div>
                    ) : null}
                    <ResearchSourceReferences sources={getPayloadRecordArray(item, "sources")} />
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  还没有交汇洞察。时间脉络和横向比较没有合流前，正文主判断最好保持克制。
                </div>
              )}
            </div>

            <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">策略写回</div>
                  <div className="mt-1 text-xs text-inkMuted">
                    {currentArticleMainStepCode === "strategy" ? "可直接回填策略卡" : "会继续喂给大纲与正文"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentArticleMainStepCode === "strategy" && strategyWritebackFields.length > 0 ? (
                    <Button
                      type="button"
                      onClick={onApplyStrategyWriteback}
                      disabled={savingStrategyCard}
                      variant="secondary"
                      size="sm"
                      className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                    >
                      {savingStrategyCard ? "写回中…" : "一键写回策略卡"}
                    </Button>
                  ) : null}
                  {currentArticleMainStepCode === "evidence" && suggestedEvidenceItemsCount > 0 ? (
                    <Button
                      type="button"
                      onClick={onApplySuggestedEvidence}
                      disabled={savingEvidenceItems}
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                    >
                      {savingEvidenceItems ? "写回中…" : "一键写回证据包"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {strategyWritebackFields.length > 0 ? (
                strategyWritebackFields.map((item) => {
                  const synced = item.currentValue && item.currentValue === item.value;
                  return (
                    <div key={item.key} className="border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">{item.label}</div>
                        {item.currentValue ? (
                          <div className={`text-xs ${synced ? "text-emerald-700" : "text-warning"}`}>
                            {synced ? "已与当前策略一致" : "可用于补当前策略"}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">{item.value}</div>
                    </div>
                  );
                })
              ) : (
                <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
                  当前研究简报还没有产出可写回的策略字段。
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          当前还没有研究简报。建议先生成一版，把时间脉络、同类对比和交汇洞察补齐后，再继续策略确认或证据整理。
        </div>
      )}
    </div>
  );
}
