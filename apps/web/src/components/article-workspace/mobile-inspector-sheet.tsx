import { Button, Input } from "@huoziwriter/ui";
import Link from "next/link";
import { formatArticleStatusLabel } from "@/lib/article-status-label";
import { formatKnowledgeStatus } from "@/lib/article-workspace-formatters";
import type { ArticleStatus } from "@/lib/domain";
import type { LanguageGuardHit } from "@/lib/language-guard-core";

type SnapshotMetaLike = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

type KnowledgeCardPanelItemLike = {
  id: number;
  cardType: string;
  status: string;
  title: string;
  summary: string | null;
  latestChangeSummary: string | null;
};

type MainStepLike = {
  title: string;
};

type StageLike = {
  title: string;
} | null;

type MobileInspectorSheetProps = {
  open: boolean;
  currentArticleMainStep: MainStepLike;
  currentStage: StageLike;
  status: ArticleStatus | "generating";
  showLeftWorkspaceRail: boolean;
  snapshotNote: string;
  onChangeSnapshotNote: (value: string) => void;
  onCreateSnapshot: () => void | Promise<void>;
  snapshots: SnapshotMetaLike[];
  loadingDiffId: number | null;
  onLoadDiff: (snapshotId: number) => void | Promise<void>;
  onRestoreSnapshot: (snapshotId: number) => void | Promise<void>;
  showKnowledgeCardsRail: boolean;
  knowledgeCardItems: KnowledgeCardPanelItemLike[];
  showLanguageGuardRail: boolean;
  liveLanguageGuardHits: LanguageGuardHit[];
  onSwitchToAudit: () => void;
  showVisualEngineRail: boolean;
  visualSuggestion: string;
  hasNodeVisualSuggestions: boolean;
  onSaveImagePromptAssets: () => void | Promise<void>;
  savingImagePrompts: boolean;
  onGenerateCoverImage: () => void | Promise<void>;
  coverImageButtonDisabled: boolean;
  coverImageButtonLabel: string;
  coverImageButtonVariant: "primary" | "secondary";
  onClose: () => void;
};

export function MobileInspectorSheet({
  open,
  currentArticleMainStep,
  currentStage,
  status,
  showLeftWorkspaceRail,
  snapshotNote,
  onChangeSnapshotNote,
  onCreateSnapshot,
  snapshots,
  loadingDiffId,
  onLoadDiff,
  onRestoreSnapshot,
  showKnowledgeCardsRail,
  knowledgeCardItems,
  showLanguageGuardRail,
  liveLanguageGuardHits,
  onSwitchToAudit,
  showVisualEngineRail,
  visualSuggestion,
  hasNodeVisualSuggestions,
  onSaveImagePromptAssets,
  savingImagePrompts,
  onGenerateCoverImage,
  coverImageButtonDisabled,
  coverImageButtonLabel,
  coverImageButtonVariant,
  onClose,
}: MobileInspectorSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/35 md:hidden">
      <button
        type="button"
        aria-label="关闭辅助面板"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="稿件辅助面板"
        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto overscroll-contain border-t border-lineStrong bg-surface px-4 pt-4 shadow-ink"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">辅助面板</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">手机端按需唤起的工作台侧栏</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              把桌面端默认常驻的快照、背景卡、语言守卫和视觉建议压成抽屉，避免主链路被挤占。
            </div>
          </div>
          <Button type="button" onClick={onClose} variant="secondary" size="sm">
            关闭
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前阶段</div>
                <div className="mt-2 font-serifCn text-2xl text-ink">{currentArticleMainStep.title}</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  {currentStage ? `执行阶段：${currentStage.title}` : "当前阶段说明暂未生成。"}
                </div>
              </div>
              <span className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkMuted">
                {status === "generating" ? "生成中" : formatArticleStatusLabel(status)}
              </span>
            </div>
          </section>

          {!showLeftWorkspaceRail ? (
            <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">快照管理</div>
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label="快照备注"
                  value={snapshotNote}
                  onChange={(event) => onChangeSnapshotNote(event.target.value)}
                  placeholder="快照备注"
                  className="min-w-0 flex-1"
                />
                <Button onClick={() => void onCreateSnapshot()} variant="primary" size="sm">
                  存档
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {snapshots.slice(0, 3).map((snapshot) => (
                  <div key={snapshot.id} className="border border-lineStrong bg-surface p-3">
                    <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
                    <div className="mt-1 text-xs text-inkMuted">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={() => {
                          onClose();
                          void onLoadDiff(snapshot.id);
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        {loadingDiffId === snapshot.id ? "对比中…" : "差异"}
                      </Button>
                      <Button
                        onClick={() => {
                          onClose();
                          void onRestoreSnapshot(snapshot.id);
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        回滚
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {showKnowledgeCardsRail ? (
            <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">相关背景卡</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    当前共命中 {knowledgeCardItems.length} 张背景卡，辅助面板只保留摘要，完整资产仍在设置页维护。
                  </div>
                </div>
                <Link
                  href="/settings/assets"
                  className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft"
                  onClick={onClose}
                >
                  去素材资产中心
                </Link>
              </div>
              <div className="mt-3 space-y-2">
                {knowledgeCardItems.slice(0, 3).map((card) => (
                  <div key={card.id} className="border border-lineStrong bg-surface px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                      <span className="border border-lineStrong bg-paperStrong px-2 py-1">{card.cardType}</span>
                      <span className="border border-lineStrong bg-paperStrong px-2 py-1">{formatKnowledgeStatus(card.status)}</span>
                    </div>
                    <div className="mt-2 text-sm text-ink">{card.title}</div>
                    <div className="mt-2 text-xs leading-6 text-inkMuted">
                      {card.summary || card.latestChangeSummary || "进入素材资产中心查看完整摘要与证据。"}
                    </div>
                  </div>
                ))}
                {knowledgeCardItems.length === 0 ? (
                  <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                    当前还没有相关背景卡，先补素材或刷新知识卡，辅助判断才会更稳。
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {showLanguageGuardRail ? (
            <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">即时语言守卫</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    {liveLanguageGuardHits.length > 0
                      ? `当前命中 ${liveLanguageGuardHits.length} 条规则，建议切到红笔校阅逐条处理。`
                      : "当前稿件未命中语言守卫规则。"}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    onSwitchToAudit();
                    onClose();
                  }}
                  variant="secondary"
                  size="sm"
                >
                  去红笔校阅
                </Button>
              </div>
              {liveLanguageGuardHits.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {liveLanguageGuardHits.slice(0, 3).map((hit, index) => (
                    <div key={`${hit.ruleId}-${index}`} className="border border-lineStrong bg-surface px-4 py-3">
                      <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
                        <span className="border border-lineStrong bg-paperStrong px-2 py-1">
                          {hit.ruleKind === "pattern" ? "句式" : "词语"}
                        </span>
                        <span className="border border-lineStrong bg-paperStrong px-2 py-1">
                          {hit.severity === "high" ? "高风险" : "提醒"}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-ink">{hit.matchedText || hit.patternText}</div>
                      {hit.rewriteHint ? (
                        <div className="mt-2 text-xs leading-6 text-inkMuted">改写建议：{hit.rewriteHint}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {showVisualEngineRail ? (
            <section className="border border-lineStrong/40 bg-surfaceWarm p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">视觉联想引擎</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{visualSuggestion}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {hasNodeVisualSuggestions ? (
                  <Button onClick={() => void onSaveImagePromptAssets()} disabled={savingImagePrompts} variant="secondary" size="sm">
                    {savingImagePrompts ? "保存中…" : "保存配图提示词"}
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    onClose();
                    void onGenerateCoverImage();
                  }}
                  disabled={coverImageButtonDisabled}
                  variant={coverImageButtonVariant}
                  size="sm"
                >
                  {coverImageButtonLabel}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
