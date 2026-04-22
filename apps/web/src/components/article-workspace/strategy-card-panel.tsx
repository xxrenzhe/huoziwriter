import { Button, Input, Select, Textarea } from "@huoziwriter/ui";
import {
  ARTICLE_HUMAN_SIGNAL_FIELD_LABELS,
  ARTICLE_STRATEGY_FIELD_LABELS,
  FOUR_POINT_AUDIT_DIMENSIONS,
  STRATEGY_ARCHETYPE_OPTIONS,
} from "@/lib/article-strategy";

type StrategyField = {
  key: keyof typeof ARTICLE_STRATEGY_FIELD_LABELS;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
  suggestion: string;
  multiline?: boolean;
};

type StrategyResearchField = {
  key: "researchHypothesis" | "marketPositionInsight" | "historicalTurningPoint";
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
};

type HumanSignalField = {
  key: keyof typeof ARTICLE_HUMAN_SIGNAL_FIELD_LABELS;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
};

type StrategyCardDraftLike = {
  completion: Record<keyof typeof ARTICLE_STRATEGY_FIELD_LABELS, boolean>;
  fourPointAudit: Record<string, unknown> | null;
  strategyLockedAt: string | null;
  strategyOverride: boolean;
  whyNowHints: string[];
  humanSignalCompletion: Record<keyof typeof ARTICLE_HUMAN_SIGNAL_FIELD_LABELS, boolean>;
  humanSignalScore: number;
};

type StrategyCardPanelProps = {
  strategyStatusTone: string;
  strategyStatusText: string;
  strategyCardIsComplete: boolean;
  savedStrategyCardIsComplete: boolean;
  strategyCardHasUnsavedChanges: boolean;
  strategyCardMissingFields: string[];
  strategyViewMode: "author" | "penjian";
  onChangeStrategyViewMode: (mode: "author" | "penjian") => void;
  strategyFields: StrategyField[];
  strategyMainstreamBelief: string;
  onChangeStrategyMainstreamBelief: (value: string) => void;
  strategyCardDraft: StrategyCardDraftLike;
  savingStrategyCard: boolean;
  auditingStrategyCard: boolean;
  lockingStrategyCard: boolean;
  onRunStrategyAudit: () => void;
  onLockStrategyCard: (force: boolean) => void;
  strategyFourPointDrafts: Record<string, string>;
  onChangeStrategyFourPointDraft: (key: string, value: string) => void;
  reversingStrategyCardDimension: string | null;
  onApplyStrategyFourPointReverseWriteback: (key: string) => void;
  strategyResearchFields: StrategyResearchField[];
  humanSignalTone: string;
  humanSignalFields: HumanSignalField[];
  onAppendWhyNowHint: (value: string) => void;
  onSaveStrategyCard: () => void;
};

export function StrategyCardPanel({
  strategyStatusTone,
  strategyStatusText,
  strategyCardIsComplete,
  savedStrategyCardIsComplete,
  strategyCardHasUnsavedChanges,
  strategyCardMissingFields,
  strategyViewMode,
  onChangeStrategyViewMode,
  strategyFields,
  strategyMainstreamBelief,
  onChangeStrategyMainstreamBelief,
  strategyCardDraft,
  savingStrategyCard,
  auditingStrategyCard,
  lockingStrategyCard,
  onRunStrategyAudit,
  onLockStrategyCard,
  strategyFourPointDrafts,
  onChangeStrategyFourPointDraft,
  reversingStrategyCardDimension,
  onApplyStrategyFourPointReverseWriteback,
  strategyResearchFields,
  humanSignalTone,
  humanSignalFields,
  onAppendWhyNowHint,
  onSaveStrategyCard,
}: StrategyCardPanelProps) {
  return (
    <div className="space-y-4 border border-warning/30 bg-surfaceWarm px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">Strategy Card</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">发布前必须确认的策略卡</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            这六项会直接进入发布守门。系统会先按受众分析、大纲和系列洞察给你预填建议，但只有手动保存后才算正式确认。
          </div>
        </div>
        <div className={`border px-3 py-2 text-xs ${strategyStatusTone}`}>{strategyStatusText}</div>
      </div>

      <div className={`border px-4 py-3 text-sm leading-7 ${strategyStatusTone}`}>
        {!strategyCardIsComplete
          ? `当前还缺：${strategyCardMissingFields.join("、")}。`
          : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
            ? "草稿字段已经补齐，但还没确认保存，发布守门仍会阻断。"
            : "策略卡已经保存，后续可以围绕它继续补证据、写执行卡和发布。"}
      </div>

      <div className="border border-lineStrong/60 bg-surface px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">策略视角</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              作者视角负责补底层真话与判断，笔尖视角负责把这些底层字段聚合成四元方法论并做强度自检。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onChangeStrategyViewMode("author")}
              variant={strategyViewMode === "author" ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              作者视角
            </Button>
            <Button
              type="button"
              onClick={() => onChangeStrategyViewMode("penjian")}
              variant={strategyViewMode === "penjian" ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              笔尖视角
            </Button>
          </div>
        </div>
      </div>

      {strategyViewMode === "author" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {strategyFields.map((field) => {
              const suggestion = field.suggestion.trim();
              const isConfirmed = strategyCardDraft.completion[field.key];
              return (
                <label key={String(field.key)} className="block border border-lineStrong bg-surface px-4 py-4 text-sm text-inkSoft">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{ARTICLE_STRATEGY_FIELD_LABELS[field.key]}</div>
                    <div className={`text-xs ${isConfirmed ? "text-emerald-700" : "text-danger"}`}>
                      {isConfirmed ? "已填写" : "必填"}
                    </div>
                  </div>
                  {field.key === "archetype" ? (
                    <Select
                      aria-label={ARTICLE_STRATEGY_FIELD_LABELS[field.key]}
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      className="mt-3 px-3 py-2"
                    >
                      <option value="">选择主题原型</option>
                      {STRATEGY_ARCHETYPE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </Select>
                  ) : field.multiline ? (
                    <Textarea
                      aria-label={ARTICLE_STRATEGY_FIELD_LABELS[field.key]}
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      placeholder={field.placeholder}
                      className="mt-3 min-h-[104px] px-3 py-2"
                    />
                  ) : (
                    <Input
                      aria-label={ARTICLE_STRATEGY_FIELD_LABELS[field.key]}
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      placeholder={field.placeholder}
                      className="mt-3 px-3 py-2"
                    />
                  )}
                  {suggestion ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs leading-6 text-inkMuted">建议来源：{suggestion}</div>
                      {field.value.trim() !== suggestion ? (
                        <Button
                          type="button"
                          onClick={() => field.setValue(suggestion)}
                          variant="secondary"
                          size="sm"
                          className="text-xs"
                        >
                          用建议填入
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </label>
              );
            })}
          </div>

          <label className="block border border-lineStrong bg-surface px-4 py-4 text-sm text-inkSoft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">主流认知</div>
              <div className={`text-xs ${strategyMainstreamBelief.trim() ? "text-emerald-700" : "text-inkMuted"}`}>
                {strategyMainstreamBelief.trim() ? "已填写" : "建议填写"}
              </div>
            </div>
            <Textarea
              aria-label="主流认知"
              value={strategyMainstreamBelief}
              onChange={(event) => onChangeStrategyMainstreamBelief(event.target.value)}
              placeholder="大众通常怎么理解这件事？先把那一面说清楚，认知翻转才成立。"
              className="mt-3 min-h-[92px] px-3 py-2"
            />
          </label>
        </>
      ) : (
        <div className="border border-lineStrong/60 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
          当前切到笔尖视角。这里不新增独立持久化字段，只把作者视角里的底层字段聚合成四元方法论，并允许你把聚合后的文字反写回底层策略卡。
        </div>
      )}

      <div className="border border-lineStrong/60 bg-surface px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">笔尖四元审计</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              这部分不新增你的输入负担，只把现有策略字段聚合成方法论视角，检查认知翻转、读者快照、核心张力和发力方向是否够硬。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {strategyCardDraft.strategyLockedAt ? (
              <div className={`border px-3 py-2 text-xs ${strategyCardDraft.strategyOverride ? "border-warning/40 bg-surfaceWarning text-warning" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {strategyCardDraft.strategyOverride ? "已强行锁定" : "已锁定"}
              </div>
            ) : null}
            <div className={`border px-3 py-2 text-xs ${Boolean(strategyCardDraft.fourPointAudit?.overallLockable) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-warning/40 bg-surfaceWarning text-warning"}`}>
              {Boolean(strategyCardDraft.fourPointAudit?.overallLockable) ? "可锁定" : "仍需补强"}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onRunStrategyAudit}
            disabled={savingStrategyCard || auditingStrategyCard || lockingStrategyCard}
            variant="secondary"
            size="sm"
            className="text-xs"
          >
            {auditingStrategyCard ? "自检中…" : "重跑自检"}
          </Button>
          <Button
            type="button"
            onClick={() => onLockStrategyCard(false)}
            disabled={savingStrategyCard || auditingStrategyCard || lockingStrategyCard}
            variant="secondary"
            size="sm"
            className="text-xs"
          >
            {lockingStrategyCard ? "锁定中…" : "锁定策略"}
          </Button>
          {!Boolean(strategyCardDraft.fourPointAudit?.overallLockable) ? (
            <Button
              type="button"
              onClick={() => onLockStrategyCard(true)}
              disabled={savingStrategyCard || auditingStrategyCard || lockingStrategyCard}
              variant="secondary"
              size="sm"
              className="border-warning text-warning hover:border-warning hover:bg-surface hover:text-warning"
            >
              强行锁定
            </Button>
          ) : null}
          {strategyCardDraft.strategyLockedAt ? (
            <div className="text-xs leading-6 text-inkMuted">
              最近锁定：{new Date(strategyCardDraft.strategyLockedAt).toLocaleString("zh-CN")}
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {FOUR_POINT_AUDIT_DIMENSIONS.map((item) => {
            const detail = (strategyCardDraft.fourPointAudit?.[item.key] as Record<string, unknown> | undefined) ?? {};
            const score = typeof detail.score === "number" ? detail.score : 0;
            return (
              <div key={item.key} className="border border-lineStrong bg-surfaceWarm px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{item.label}</div>
                  <div className={`text-xs ${score >= 3 ? "text-emerald-700" : "text-warning"}`}>评分 {score}/5</div>
                </div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">{String(detail.notes || "等待聚合")}</div>
                {item.key === "readerSnapshot" && String(detail.cinematizedText || "").trim() ? (
                  <div className="mt-2 text-xs leading-6 text-inkMuted">镜头稿：{String(detail.cinematizedText)}</div>
                ) : null}
                {item.key === "coreTension" && (String(detail.forceA || "").trim() || String(detail.forceB || "").trim()) ? (
                  <div className="mt-2 text-xs leading-6 text-inkMuted">对抗面：{String(detail.forceA || "")} / {String(detail.forceB || "")}</div>
                ) : null}
                {item.key === "impactVector" && String(detail.pinnedMoment || "").trim() ? (
                  <div className="mt-2 text-xs leading-6 text-inkMuted">核弹头：{String(detail.pinnedMoment)}</div>
                ) : null}
                <Textarea
                  aria-label={`${item.label}反写内容`}
                  value={strategyFourPointDrafts[item.key] || ""}
                  onChange={(event) => onChangeStrategyFourPointDraft(item.key, event.target.value)}
                  placeholder={
                    item.key === "cognitiveFlip"
                      ? "主流认知：...\n作者判断：..."
                      : item.key === "readerSnapshot"
                        ? "场景：...\n体感：...\n观察：..."
                        : item.key === "coreTension"
                          ? "张力A：...\n张力B：..."
                          : "核弹头：...\n真话：..."
                  }
                  className="mt-3 min-h-[112px] px-3 py-2 text-sm"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => onApplyStrategyFourPointReverseWriteback(item.key)}
                    disabled={Boolean(reversingStrategyCardDimension) || !strategyFourPointDrafts[item.key]?.trim()}
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                  >
                    {reversingStrategyCardDimension === item.key ? "反写中…" : "反写到底层字段"}
                  </Button>
                  <div className="text-xs leading-6 text-inkMuted">
                    改这里会拆回策略卡底层字段，并重跑四元自检。
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {strategyViewMode === "author" ? (
        <>
          <div className="border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">研究写回字段</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  这三项不参与发布必填，但会把 research brief 的判断链正式沉到策略卡里，后续深写、事实核查和复盘都能继续引用。
                </div>
              </div>
              <div className="text-xs text-inkMuted">
                {strategyResearchFields.filter((field) => field.value.trim()).length} / {strategyResearchFields.length} 已补
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {strategyResearchFields.map((field) => (
                <label key={field.key} className="block border border-lineStrong bg-surfaceWarm px-4 py-4 text-sm text-inkSoft">
                  <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{field.label}</div>
                  <Textarea
                    aria-label={field.label}
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    placeholder={field.placeholder}
                    className="mt-3 min-h-[120px] px-3 py-2"
                  />
                </label>
              ))}
            </div>
          </div>

          {strategyCardDraft.whyNowHints.length > 0 ? (
            <div className="border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">系列给出的 Why Now 线索</div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-inkSoft">
                {strategyCardDraft.whyNowHints.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    onClick={() => onAppendWhyNowHint(item)}
                    variant="secondary"
                    size="sm"
                    className="bg-paperStrong text-left text-sm"
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">完成度</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
              {(Object.entries(ARTICLE_STRATEGY_FIELD_LABELS) as Array<[keyof typeof ARTICLE_STRATEGY_FIELD_LABELS, string]>).map(([key, label]) => (
                <span
                  key={String(key)}
                  className={`border px-3 py-2 ${
                    strategyCardDraft.completion[key]
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-danger/30 bg-surface text-danger"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">Human Only Signals</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  这里填的是 AI 不该替你编的东西。没有这些信号，系统最多只能给你一篇结构正确的稿，给不了真正像人的稿。
                </div>
              </div>
              <div className={`border px-3 py-2 text-xs ${humanSignalTone}`}>
                已补 {strategyCardDraft.humanSignalScore} / 6
              </div>
            </div>
            <div className={`border px-4 py-3 text-sm leading-7 ${humanSignalTone}`}>
              {strategyCardDraft.humanSignalScore >= 3
                ? "人类信号充足，生成时会优先按你的观察、体感和真实场景落笔。"
                : strategyCardDraft.humanSignalScore >= 2
                  ? "人类信号达到最低建议线，但还可以继续补，让正文更像你自己。"
                  : "当前人类信号偏少。系统仍能生成，但更容易写成结构正确、呼吸感不足的稿子。"}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {humanSignalFields.map((field) => {
                const isConfirmed = strategyCardDraft.humanSignalCompletion[field.key];
                return (
                  <label key={String(field.key)} className="block border border-lineStrong bg-surfaceWarm px-4 py-4 text-sm text-inkSoft">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{ARTICLE_HUMAN_SIGNAL_FIELD_LABELS[field.key]}</div>
                      <div className={`text-xs ${isConfirmed ? "text-emerald-700" : "text-inkMuted"}`}>
                        {isConfirmed ? "已填写" : "建议填写"}
                      </div>
                    </div>
                    <Textarea
                      aria-label={ARTICLE_HUMAN_SIGNAL_FIELD_LABELS[field.key]}
                      value={field.value}
                      onChange={(event) => field.setValue(event.target.value)}
                      placeholder={field.placeholder}
                      className="mt-3 min-h-[104px] px-3 py-2"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={onSaveStrategyCard}
          disabled={savingStrategyCard}
          variant="primary"
        >
          {savingStrategyCard ? "保存中…" : "确认并保存策略卡"}
        </Button>
        <div className="text-xs leading-6 text-inkMuted">
          保存后，发布预检和正式推送都会按这张卡判断是否放行。
        </div>
      </div>
    </div>
  );
}
