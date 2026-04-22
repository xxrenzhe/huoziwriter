import { Button } from "@huoziwriter/ui";
import { formatKnowledgeStatus } from "@/lib/article-workspace-formatters";
import { AuthoringBlankSlate } from "./authoring-phase";

type KnowledgeBlankSlateLike = {
  eyebrow: string;
  title: string;
  detail: string;
  prompts?: string[];
};

type KnowledgeCardPanelItemLike = {
  id: number;
  cardType: string;
  title: string;
  summary: string | null;
  latestChangeSummary: string | null;
  overturnedJudgements: string[];
  keyFacts: string[];
  openQuestions: string[];
  conflictFlags: string[];
  sourceFragmentIds: number[];
  relatedCards: Array<{ id: number; title: string; linkType: string }>;
  sourceFragments: Array<{ id: number; distilledContent: string }>;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  relevanceScore: number;
  matchedFragmentCount: number;
};

type KnowledgeCardsRailProps = {
  knowledgeCardItems: KnowledgeCardPanelItemLike[];
  knowledgeBlankSlate: KnowledgeBlankSlateLike;
  expandedKnowledgeCardId: number | null;
  highlightedKnowledgeCardId: number | null;
  refreshingKnowledgeId: number | null;
  onRefreshKnowledgeCard: (cardId: number) => void | Promise<void>;
  onToggleKnowledgeCard: (cardId: number, expanded: boolean, highlighted: boolean) => void;
};

export function KnowledgeCardsRail({
  knowledgeCardItems,
  knowledgeBlankSlate,
  expandedKnowledgeCardId,
  highlightedKnowledgeCardId,
  refreshingKnowledgeId,
  onRefreshKnowledgeCard,
  onToggleKnowledgeCard,
}: KnowledgeCardsRailProps) {
  return (
    <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">相关背景卡</div>
          <div className="mt-2 text-sm leading-7 text-inkMuted">优先显示与当前稿件标题、正文和已挂载素材最相关的背景卡，减少重复总结。</div>
        </div>
        <span className="border border-lineStrong bg-surface px-3 py-1 text-xs text-inkMuted">{knowledgeCardItems.length} 张</span>
      </div>
      {knowledgeCardItems.length === 0 ? (
        <div className="mt-4">
          <AuthoringBlankSlate
            eyebrow={knowledgeBlankSlate.eyebrow}
            title={knowledgeBlankSlate.title}
            detail={knowledgeBlankSlate.detail}
            prompts={knowledgeBlankSlate.prompts}
            compact
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {knowledgeCardItems.map((card) => {
            const expanded = expandedKnowledgeCardId === card.id;
            const highlighted = highlightedKnowledgeCardId === card.id;
            return (
              <article key={card.id} className={`border bg-surface p-4 ${highlighted ? "border-cinnabar shadow-[0_0_0_1px_rgba(167,48,50,0.08)]" : "border-lineStrong"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-serifCn text-xl text-ink">{card.title}</div>
                      {highlighted ? <span className="border border-cinnabar/30 bg-surfaceWarm px-2 py-1 text-[11px] text-cinnabar">刚更新</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkMuted">
                      <span className="border border-lineStrong bg-surface px-2 py-1">{card.cardType}</span>
                      <span className="border border-lineStrong bg-surface px-2 py-1">{formatKnowledgeStatus(card.status)}</span>
                      <span className="border border-lineStrong bg-surface px-2 py-1">置信度 {Math.round(card.confidenceScore * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {card.status === "stale" || card.status === "conflicted" ? (
                      <Button
                        onClick={() => void onRefreshKnowledgeCard(card.id)}
                        disabled={refreshingKnowledgeId === card.id}
                        variant="secondary"
                        size="sm"
                        className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                      >
                        {refreshingKnowledgeId === card.id ? "刷新中…" : "刷新背景卡"}
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => onToggleKnowledgeCard(card.id, expanded, highlighted)}
                      variant="secondary"
                      size="sm"
                    >
                      {expanded ? "收起证据" : "查看证据"}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-inkSoft">{card.summary || "暂无摘要"}</p>
                {card.latestChangeSummary ? (
                  <div className="mt-3 border border-warning/40 bg-surfaceWarning px-3 py-3 text-sm leading-7 text-warning">
                    最近变化：{card.latestChangeSummary}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span>命中稿件挂载素材 {card.matchedFragmentCount} 条</span>
                  <span>来源素材 {card.sourceFragmentIds.length} 条</span>
                  <span>相关度 {card.relevanceScore}</span>
                  <span>{card.lastCompiledAt ? `最近编译 ${new Date(card.lastCompiledAt).toLocaleString("zh-CN")}` : "尚未完成编译"}</span>
                </div>
                {card.status === "conflicted" ? (
                  <div className="mt-3 border border-danger/30 bg-surface px-3 py-3 text-sm leading-7 text-danger">
                    这张档案出现了相反信号，当前只能作为待核实线索使用，建议先补充来源或立即刷新。
                  </div>
                ) : null}
                {card.status === "stale" ? (
                  <div className="mt-3 border border-warning/40 bg-surfaceWarning px-3 py-3 text-sm leading-7 text-warning">
                    这张档案超过时间阈值未更新，适合在下笔前先刷新，避免沿用过期判断。
                  </div>
                ) : null}
                {card.conflictFlags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.conflictFlags.map((flag) => (
                      <span key={`${card.id}-flag-${flag}`} className="border border-danger/30 bg-surface px-2 py-1 text-[11px] text-danger">
                        {flag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {card.keyFacts.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.keyFacts.slice(0, 3).map((fact, index) => (
                      <span key={`${card.id}-fact-${index}`} className="border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                        {fact}
                      </span>
                    ))}
                  </div>
                ) : null}
                {card.overturnedJudgements.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {card.overturnedJudgements.slice(0, 3).map((item, index) => (
                      <div key={`${card.id}-overturned-${index}`} className="border border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
                {expanded ? (
                  <div className="mt-4 space-y-4 border-t border-line pt-4">
                    {card.openQuestions.length > 0 ? (
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">待确认问题</div>
                        <div className="mt-2 space-y-2">
                          {card.openQuestions.slice(0, 2).map((question, index) => (
                            <div key={`${card.id}-question-${index}`} className="text-sm leading-7 text-inkMuted">
                              {question}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {card.relatedCards.length > 0 ? (
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">关联档案</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {card.relatedCards.slice(0, 3).map((relatedCard) => (
                            <span
                              key={`${card.id}-related-${relatedCard.id}`}
                              className="border border-line bg-paperStrong px-3 py-2 text-xs leading-6 text-inkSoft"
                            >
                              <span className="mr-2 text-inkMuted">{relatedCard.linkType}</span>
                              {relatedCard.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">来源素材摘要</div>
                      <div className="mt-2 space-y-2">
                        {card.sourceFragments.map((fragment) => (
                          <div key={fragment.id} className="border border-line bg-paperStrong px-3 py-3 text-sm leading-7 text-inkSoft">
                            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-inkMuted">素材 #{fragment.id}</div>
                            {fragment.distilledContent}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
