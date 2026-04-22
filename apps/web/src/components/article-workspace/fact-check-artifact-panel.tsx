import { Button, Input, Textarea } from "@huoziwriter/ui";
import {
  formatEvidenceResearchTagLabel,
  formatEvidenceRoleLabel,
} from "@/lib/article-evidence";
import {
  formatEvidenceSupportLevel,
  formatFactCheckActionLabel,
  formatFactCheckStatusLabel,
  formatFactRiskLabel,
  formatFragmentSourceType,
  formatResearchCoverageSufficiencyLabel,
  formatResearchSupportStatusLabel,
} from "@/lib/article-workspace-formatters";

type FactCheckAction = "keep" | "source" | "soften" | "remove" | "mark_opinion";

type FactCheckResearchReview = {
  summary: string;
  sourceCoverage: string;
  timelineSupport: string;
  comparisonSupport: string;
  intersectionSupport: string;
  strongestAnchor: string;
  gaps: string[];
  isWarning: boolean;
} | null;

type FactCheckEvidenceIssue = {
  id: string;
  title: string | null;
  url: string;
  degradedReason: string;
  retryRecommended: boolean;
  createdAt: string;
  resolvedAt: string | null;
  recoveryCount: number;
};

type FactCheckLatestEvidenceIssue = {
  url: string;
  degradedReason: string;
  retryRecommended: boolean;
} | null;

type FactCheckEvidenceCardItem = {
  title: string;
  sourceType: string;
  evidenceRole: string;
  researchTag: string;
  confidenceLabel: string;
  excerpt: string;
  rationale: string;
  fragmentId: number;
  knowledgeTitle: string;
  knowledgeCardId: number;
  sourceUrl: string;
};

type FactCheckCheckItem = {
  claim: string;
  status: string;
  suggestion: string;
  currentDecision: {
    action: FactCheckAction;
    note: string;
  };
  actionOptions: Array<{
    value: FactCheckAction;
    label: string;
  }>;
  evidenceCard: {
    supportLevel: string;
    supportingEvidence: FactCheckEvidenceCardItem[];
    counterEvidence: FactCheckEvidenceCardItem[];
  } | null;
};

type FactCheckArtifactPanelProps = {
  overallRisk: string;
  hasResearchReviewSummary: boolean;
  hasTopicAlignment: boolean;
  resolvedCount: number;
  totalCount: number;
  researchReview: FactCheckResearchReview;
  evidenceUrl: string;
  onChangeEvidenceUrl: (value: string) => void;
  addingEvidence: boolean;
  onAddEvidenceSource: (urlOverride?: string) => void;
  evidenceIssue: FactCheckLatestEvidenceIssue;
  onClearEvidenceIssue: () => void;
  recentEvidenceIssues: FactCheckEvidenceIssue[];
  retryableIssueCount: number;
  recoveredIssueCount: number;
  onDismissEvidenceIssue: (issueId: string) => void;
  checks: FactCheckCheckItem[];
  onUpdateCheckDecision: (
    claim: string,
    status: string,
    patch: Partial<{
      action: FactCheckAction;
      note: string;
    }>,
  ) => void;
  onOpenKnowledgeCard: (knowledgeCardId: number) => void;
  selectionPreview: Array<{
    claim: string;
    action: FactCheckAction;
    note: string;
  }>;
  savingSelection: boolean;
  onSaveSelection: () => void;
  personaAlignment: string;
  topicAlignment: string;
};

export function FactCheckArtifactPanel({
  overallRisk,
  hasResearchReviewSummary,
  hasTopicAlignment,
  resolvedCount,
  totalCount,
  researchReview,
  evidenceUrl,
  onChangeEvidenceUrl,
  addingEvidence,
  onAddEvidenceSource,
  evidenceIssue,
  onClearEvidenceIssue,
  recentEvidenceIssues,
  retryableIssueCount,
  recoveredIssueCount,
  onDismissEvidenceIssue,
  checks,
  onUpdateCheckDecision,
  onOpenKnowledgeCard,
  selectionPreview,
  savingSelection,
  onSaveSelection,
  personaAlignment,
  topicAlignment,
}: FactCheckArtifactPanelProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
        <span className="border border-lineStrong bg-surface px-2 py-1">{formatFactRiskLabel(overallRisk)}</span>
        {hasResearchReviewSummary ? <span className="border border-lineStrong bg-surface px-2 py-1">研究支撑已复核</span> : null}
        {hasTopicAlignment ? <span className="border border-lineStrong bg-surface px-2 py-1">主题匹配已评估</span> : null}
        <span className="border border-lineStrong bg-surface px-2 py-1">已确认处置 {resolvedCount}/{totalCount}</span>
      </div>

      {researchReview ? (
        <div className={`border px-4 py-4 ${researchReview.isWarning ? "border-warning/40 bg-surfaceWarning" : "border-lineStrong/60 bg-paperStrong"}`}>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究支撑复核</div>
          {researchReview.summary ? <div className="mt-2 text-sm leading-7 text-inkSoft">{researchReview.summary}</div> : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
            <span className="border border-lineStrong bg-surface px-3 py-2">信源覆盖：{formatResearchCoverageSufficiencyLabel(researchReview.sourceCoverage)}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">纵向脉络：{formatResearchSupportStatusLabel(researchReview.timelineSupport)}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">横向比较：{formatResearchSupportStatusLabel(researchReview.comparisonSupport)}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">交汇洞察：{formatResearchSupportStatusLabel(researchReview.intersectionSupport)}</span>
          </div>
          {researchReview.strongestAnchor ? (
            <div className="mt-3 text-xs leading-6 text-inkMuted">当前复核锚点：{researchReview.strongestAnchor}</div>
          ) : null}
          {researchReview.gaps.length > 0 ? (
            <div className="mt-3 space-y-1 text-sm leading-7 text-inkSoft">
              {researchReview.gaps.map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="border border-lineStrong/60 bg-paperStrong px-4 py-4">
        <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">补充外部证据</div>
        <div className="mt-2 text-sm leading-7 text-inkSoft">
          输入一篇报道、公告或原始资料链接，系统会自动抓取、提纯并挂到当前稿件，再立即刷新事实核查结果。
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="https://…"
            value={evidenceUrl}
            onChange={(event) => onChangeEvidenceUrl(event.target.value)}
            placeholder="https://…"
            className="min-w-0 flex-1 min-h-10 px-3 py-2"
          />
          <Button
            type="button"
            onClick={() => onAddEvidenceSource()}
            disabled={addingEvidence}
            variant="primary"
            size="sm"
          >
            {addingEvidence ? "抓取中…" : "抓取补证并刷新核查"}
          </Button>
        </div>
        {evidenceIssue ? (
          <div className="mt-3 space-y-3 border border-warning/40 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-warning">
            <div className="text-xs uppercase tracking-[0.18em] text-warning">补证链接降级</div>
            <div>最近一次补证抓取已降级写入：{evidenceIssue.degradedReason}</div>
            <div className="break-all text-xs leading-6 text-inkMuted">{evidenceIssue.url}</div>
            <div className="flex flex-wrap gap-2">
              {evidenceIssue.retryRecommended ? (
                <Button
                  type="button"
                  onClick={() => onAddEvidenceSource(evidenceIssue.url)}
                  disabled={addingEvidence}
                  variant="secondary"
                  size="sm"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {addingEvidence ? "重试中…" : "重试补证抓取"}
                </Button>
              ) : null}
              <Button type="button" onClick={() => onChangeEvidenceUrl(evidenceIssue.url)} variant="secondary" size="sm">
                回填链接
              </Button>
              <Button type="button" onClick={onClearEvidenceIssue} variant="secondary" size="sm">
                清除提示
              </Button>
            </div>
          </div>
        ) : null}
        {recentEvidenceIssues.length > 0 ? (
          <div className="mt-3 space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近补证异常记录</div>
            <div className="text-xs leading-6 text-inkMuted">
              来源分类：事实核查补证 · 共 {recentEvidenceIssues.length} 条 · 待重试 {retryableIssueCount} 条 · 最近恢复成功 {recoveredIssueCount} 次
            </div>
            {recentEvidenceIssues.map((issue) => (
              <div key={issue.id} className="border border-lineStrong/60 bg-paperStrong px-4 py-4 text-sm leading-7 text-inkSoft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-ink">{issue.title || "补证链接异常"}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                    <span>{new Date(issue.createdAt).toLocaleString("zh-CN")}</span>
                    <span className={`border px-2 py-1 ${issue.resolvedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-warning/40 bg-surfaceWarning text-warning"}`}>
                      {issue.resolvedAt ? "已恢复" : "待处理"}
                    </span>
                  </div>
                </div>
                <div className="mt-2">{issue.degradedReason}</div>
                <div className="mt-2 break-all text-xs leading-6 text-inkMuted">{issue.url}</div>
                {issue.resolvedAt ? (
                  <div className="mt-2 text-xs leading-6 text-emerald-700">
                    最近恢复：{new Date(issue.resolvedAt).toLocaleString("zh-CN")} · 成功恢复 {issue.recoveryCount} 次
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {issue.retryRecommended ? (
                    <Button
                      type="button"
                      onClick={() => onAddEvidenceSource(issue.url)}
                      disabled={addingEvidence}
                      variant="secondary"
                      size="sm"
                      className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                    >
                      {addingEvidence ? "重试中…" : "再次重试"}
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => onChangeEvidenceUrl(issue.url)} variant="secondary" size="sm">
                    回填链接
                  </Button>
                  <Button type="button" onClick={() => onDismissEvidenceIssue(issue.id)} variant="secondary" size="sm">
                    删除记录
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
        每条核查项都可以单独指定处理策略。保存后，“精修高风险句子”会按这些策略回写正文，而不是统一保守弱化。
      </div>

      {checks.length > 0 ? (
        <div className="space-y-3">
          {checks.map((check, index) => (
            <div key={`${check.claim || index}`} className="border border-lineStrong/60 bg-surface px-4 py-3">
              <div className="font-medium text-ink">{check.claim || `核查项 ${index + 1}`}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkMuted">
                <span>状态：{formatFactCheckStatusLabel(check.status)}</span>
                <span className="border border-lineStrong bg-surface px-2 py-1">当前处置：{formatFactCheckActionLabel(check.currentDecision.action)}</span>
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{check.suggestion || "暂无建议"}</div>
              <div className="mt-4">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">逐条处置策略</div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {check.actionOptions.map((option) => (
                    <Button
                      key={`${check.claim}-${option.value}`}
                      type="button"
                      onClick={() => onUpdateCheckDecision(check.claim, check.status, { action: option.value })}
                      variant={check.currentDecision.action === option.value ? "primary" : "secondary"}
                      size="sm"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <Textarea
                  aria-label="可选：补充处理备注，例如“等官方公告出来再补数据”"
                  value={check.currentDecision.note}
                  onChange={(event) => onUpdateCheckDecision(check.claim, check.status, { note: event.target.value })}
                  placeholder="可选：补充处理备注，例如“等官方公告出来再补数据”"
                  className="mt-3 min-h-[80px] px-3 py-2"
                />
              </div>
              {check.evidenceCard ? (
                <div className="mt-4 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                    <span className="uppercase tracking-[0.18em]">证据摘要卡</span>
                    <span className="border border-lineStrong bg-surface px-2 py-1">{formatEvidenceSupportLevel(check.evidenceCard.supportLevel)}</span>
                  </div>
                  {check.evidenceCard.supportingEvidence.length > 0 || check.evidenceCard.counterEvidence.length > 0 ? (
                    <div className="mt-3 space-y-4">
                      {[
                        { label: "支持证据", items: check.evidenceCard.supportingEvidence },
                        { label: "反向证据", items: check.evidenceCard.counterEvidence },
                      ]
                        .filter((group) => group.items.length > 0)
                        .map((group) => (
                          <div key={group.label} className="space-y-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{group.label}</div>
                            {group.items.map((item, evidenceIndex) => (
                              <div key={`${group.label}-${item.title || evidenceIndex}`} className="border border-lineStrong/60 bg-paperStrong px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="text-sm font-medium text-ink">{item.title || `证据 ${evidenceIndex + 1}`}</div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-inkMuted">
                                    <span>{formatFragmentSourceType(item.sourceType)}</span>
                                    <span className="border border-lineStrong bg-surface px-2 py-1 normal-case tracking-normal">
                                      {formatEvidenceRoleLabel(item.evidenceRole || (group.label === "反向证据" ? "counterEvidence" : "supportingEvidence"))}
                                    </span>
                                    {formatEvidenceResearchTagLabel(item.researchTag) ? (
                                      <span className="border border-lineStrong bg-surface px-2 py-1 normal-case tracking-normal">
                                        {formatEvidenceResearchTagLabel(item.researchTag)}
                                      </span>
                                    ) : null}
                                    {item.confidenceLabel ? (
                                      <span className="border border-lineStrong bg-surface px-2 py-1 normal-case tracking-normal">
                                        {item.confidenceLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-2 text-sm leading-7 text-inkSoft">{item.excerpt || "暂无摘要"}</div>
                                {item.rationale ? <div className="mt-2 text-xs leading-6 text-inkMuted">{item.rationale}</div> : null}
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                                  {item.fragmentId > 0 ? (
                                    <span className="border border-lineStrong bg-surface px-3 py-2">原始素材回链 · 素材 #{item.fragmentId}</span>
                                  ) : null}
                                  {item.knowledgeTitle ? (
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        if (item.knowledgeCardId > 0) {
                                          onOpenKnowledgeCard(item.knowledgeCardId);
                                        }
                                      }}
                                      variant="secondary"
                                      size="sm"
                                    >
                                      背景卡回链 · {item.knowledgeTitle}
                                    </Button>
                                  ) : null}
                                </div>
                                {item.sourceUrl ? (
                                  <a
                                    href={item.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-block border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft"
                                  >
                                    打开原始链接
                                  </a>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="mt-3 border border-dashed border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                      当前没有命中的可核对证据，建议补充原始链接、截图或数据来源。
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {selectionPreview.length > 0 ? (
        <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
          {selectionPreview.map((item) => (
            <div key={item.claim}>
              {item.claim}：{formatFactCheckActionLabel(item.action)}{item.note ? `；备注：${item.note}` : ""}
            </div>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        onClick={onSaveSelection}
        disabled={savingSelection}
        variant="secondary"
        size="sm"
        className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
      >
        {savingSelection ? "保存中…" : "确认这组核查处置"}
      </Button>

      {personaAlignment ? <div className="text-sm leading-7 text-inkSoft">人设匹配：{personaAlignment}</div> : null}
      {topicAlignment ? <div className="text-sm leading-7 text-inkSoft">选题匹配：{topicAlignment}</div> : null}
    </>
  );
}
