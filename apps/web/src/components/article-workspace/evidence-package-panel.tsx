import { Button, Input } from "@huoziwriter/ui";
import {
  EVIDENCE_HOOK_TAG_OPTIONS,
  formatEvidenceResearchTagLabel,
  formatEvidenceRoleLabel,
} from "@/lib/article-evidence";
import { formatFragmentSourceType } from "@/lib/article-workspace-formatters";

type EvidenceItemLike = {
  id: number;
  articleId: number;
  userId: number;
  fragmentId: number | null;
  nodeId: number | null;
  claim: string | null;
  title: string;
  excerpt: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  usageMode: string | null;
  rationale: string | null;
  researchTag: string | null;
  hookTags: string[];
  hookStrength: number | null;
  hookTaggedBy: string | null;
  hookTaggedAt: string | null;
  evidenceRole: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type EvidenceDraftStatsLike = {
  itemCount: number;
  uniqueSourceTypeCount: number;
  hookTagCoverage: string[];
  hookTagCoverageCount: number;
  externalEvidenceCount: number;
  screenshotEvidenceCount: number;
  ready: boolean;
  flags: string[];
};

type EvidencePackagePanelProps = {
  evidenceStatusTone: string;
  evidenceStatusText: string;
  draftStats: EvidenceDraftStatsLike;
  savedReady: boolean;
  hasUnsavedChanges: boolean;
  saving: boolean;
  tagging: boolean;
  missingHookTags: string[];
  items: EvidenceItemLike[];
  availableSuggestedItems: EvidenceItemLike[];
  getItemSignature: (item: EvidenceItemLike) => string;
  onOpenImaDrawer: () => void;
  onUseSuggestedPackage: () => void;
  onClearDraft: () => void;
  onToggleItem: (item: EvidenceItemLike) => void;
  onToggleHookTag: (signature: string, tag: string) => void;
  onChangeHookStrength: (signature: string, value: string) => void;
  onAutoTag: () => void;
  onSave: () => void;
};

export function EvidencePackagePanel({
  evidenceStatusTone,
  evidenceStatusText,
  draftStats,
  savedReady,
  hasUnsavedChanges,
  saving,
  tagging,
  missingHookTags,
  items,
  availableSuggestedItems,
  getItemSignature,
  onOpenImaDrawer,
  onUseSuggestedPackage,
  onClearDraft,
  onToggleItem,
  onToggleHookTag,
  onChangeHookStrength,
  onAutoTag,
  onSave,
}: EvidencePackagePanelProps) {
  return (
    <div className="space-y-4 border border-warning/30 bg-surfaceWarm px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">Evidence Package</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">发布前必须确认的证据包</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            证据步骤不再只看素材挂载数量。这里需要明确保存一组真正用于发布守门的证据条目，至少 3 条，且至少 1 条外部来源或截图证据。
          </div>
        </div>
        <div className={`border px-3 py-2 text-xs ${evidenceStatusTone}`}>{evidenceStatusText}</div>
      </div>

      <div className={`border px-4 py-3 text-sm leading-7 ${evidenceStatusTone}`}>
        {!draftStats.ready
          ? `当前证据包还缺：${draftStats.flags.join("、")}。`
          : !savedReady || hasUnsavedChanges
            ? "证据包草稿已达到最低标准，但还没保存，发布守门仍会阻断。"
            : "证据包已经保存，后续可继续处理事实核查和发布准备。"}
      </div>

      <div className="border border-lineStrong/60 bg-surface px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">爆点覆盖度</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              发布前建议至少覆盖 2 类爆点标签，让正文既有传播钩子，也有情绪密度和读者代入。
            </div>
          </div>
          <div
            className={`border px-3 py-2 text-xs ${draftStats.hookTagCoverageCount >= 2 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-warning/40 bg-surfaceWarning text-warning"}`}
          >
            已覆盖 {draftStats.hookTagCoverageCount} / {EVIDENCE_HOOK_TAG_OPTIONS.length}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EVIDENCE_HOOK_TAG_OPTIONS.map((tag) => {
            const covered = draftStats.hookTagCoverage.includes(tag);
            return (
              <span
                key={tag}
                className={`border px-3 py-2 text-xs ${covered ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-lineStrong bg-paperStrong text-inkMuted"}`}
              >
                {tag}
              </span>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={onAutoTag}
            disabled={saving || tagging || items.length === 0}
            variant="secondary"
            size="sm"
            className="text-xs"
          >
            {tagging ? "标注中…" : "自动标注爆点"}
          </Button>
          <div className="text-xs leading-6 text-inkMuted">
            {missingHookTags.length > 0 ? `当前还缺：${missingHookTags.join("、")}。` : "四类爆点标签都已覆盖。"}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="border border-lineStrong bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">已选证据</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{draftStats.itemCount}</div>
        </div>
        <div className="border border-lineStrong bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">外部来源</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{draftStats.externalEvidenceCount}</div>
        </div>
        <div className="border border-lineStrong bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">截图证据</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{draftStats.screenshotEvidenceCount}</div>
        </div>
        <div className="border border-lineStrong bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">来源类型</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{draftStats.uniqueSourceTypeCount}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">当前已选证据</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onOpenImaDrawer} variant="secondary" size="sm" className="text-xs">
              从 IMA 导入
            </Button>
            <Button type="button" onClick={onUseSuggestedPackage} variant="secondary" size="sm" className="text-xs">
              采用当前建议包
            </Button>
            <Button type="button" onClick={onClearDraft} variant="secondary" size="sm" className="text-xs">
              清空草稿
            </Button>
          </div>
        </div>
        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item, index) => {
              const signature = getItemSignature(item);
              return (
                <div key={`${signature}-${index}`} className="border border-lineStrong bg-surface px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{item.title || `证据 ${index + 1}`}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-inkMuted">
                        <span>{formatFragmentSourceType(item.sourceType)}</span>
                        <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">
                          {formatEvidenceRoleLabel(item.evidenceRole)}
                        </span>
                        {formatEvidenceResearchTagLabel(item.researchTag) ? (
                          <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">
                            {formatEvidenceResearchTagLabel(item.researchTag)}
                          </span>
                        ) : null}
                        {Array.isArray(item.hookTags) && item.hookTags.length > 0 ? (
                          <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">
                            爆点：{item.hookTags.join(" / ")}
                          </span>
                        ) : null}
                        {typeof item.hookStrength === "number" ? (
                          <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">强度 {item.hookStrength}/5</span>
                        ) : null}
                        {item.claim ? (
                          <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">支撑判断：{item.claim}</span>
                        ) : null}
                      </div>
                    </div>
                    <Button type="button" onClick={() => onToggleItem(item)} variant="secondary" size="sm" className="text-xs">
                      移出证据包
                    </Button>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">{item.excerpt}</div>
                  {item.rationale ? <div className="mt-2 text-xs leading-6 text-inkMuted">{item.rationale}</div> : null}
                  <div className="mt-3 border border-lineStrong/60 bg-surfaceWarm px-3 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">爆点标签</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {EVIDENCE_HOOK_TAG_OPTIONS.map((tag) => {
                        const active = Array.isArray(item.hookTags) && item.hookTags.includes(tag);
                        return (
                          <Button
                            key={tag}
                            type="button"
                            onClick={() => onToggleHookTag(signature, tag)}
                            variant="secondary"
                            size="sm"
                            className={`text-xs ${active ? "border-cinnabar text-cinnabar hover:border-cinnabar hover:text-cinnabar" : ""}`}
                          >
                            {tag}
                          </Button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <label className="text-xs leading-6 text-inkMuted">
                        强度
                        <Input
                          aria-label={`证据 ${index + 1} 爆点强度`}
                          type="number"
                          min="0"
                          max="5"
                          step="1"
                          value={item.hookStrength ?? ""}
                          onChange={(event) => onChangeHookStrength(signature, event.target.value)}
                          className="mt-1 w-20 px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="text-xs leading-6 text-inkMuted">
                        {item.hookTaggedBy === "author"
                          ? "当前为作者手动覆盖"
                          : item.hookTaggedBy === "ai"
                            ? "当前为自动标注结果"
                            : "尚未标注"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                    {item.fragmentId ? <span className="border border-lineStrong bg-paperStrong px-3 py-2">素材 #{item.fragmentId}</span> : null}
                    {item.nodeId ? <span className="border border-lineStrong bg-paperStrong px-3 py-2">节点 #{item.nodeId}</span> : null}
                    {item.screenshotPath ? <span className="border border-lineStrong bg-paperStrong px-3 py-2">截图证据</span> : null}
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
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
            当前还没有选入证据包的条目。你可以先采用建议包，再手动删减到真正要守门的证据。
          </div>
        )}
      </div>

      {availableSuggestedItems.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">可追加的建议证据</div>
          <div className="space-y-3">
            {availableSuggestedItems.slice(0, 8).map((item, index) => (
              <div key={`${getItemSignature(item)}-suggested-${index}`} className="border border-lineStrong/60 bg-surface px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{item.title || `建议证据 ${index + 1}`}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-inkMuted">
                      <span>{formatFragmentSourceType(item.sourceType)}</span>
                      <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">
                        {formatEvidenceRoleLabel(item.evidenceRole)}
                      </span>
                      {formatEvidenceResearchTagLabel(item.researchTag) ? (
                        <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">
                          {formatEvidenceResearchTagLabel(item.researchTag)}
                        </span>
                      ) : null}
                      {Array.isArray(item.hookTags) && item.hookTags.length > 0 ? (
                        <span className="border border-lineStrong px-2 py-1 normal-case tracking-normal">
                          爆点：{item.hookTags.join(" / ")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => onToggleItem(item)}
                    variant="secondary"
                    size="sm"
                    className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                  >
                    加入证据包
                  </Button>
                </div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">{item.excerpt}</div>
                {item.rationale ? <div className="mt-2 text-xs leading-6 text-inkMuted">{item.rationale}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSave} disabled={saving} variant="primary">
          {saving ? "保存中…" : "确认并保存证据包"}
        </Button>
        <div className="text-xs leading-6 text-inkMuted">发布预检只看已保存的证据包，不看临时草稿。</div>
      </div>
    </div>
  );
}
