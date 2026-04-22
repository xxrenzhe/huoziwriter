import { Button, Input, Select, Textarea } from "@huoziwriter/ui";
import type { ChangeEvent, Ref } from "react";

type OutlineMaterialReadiness = {
  status: "passed" | "warning" | "blocked";
  score: string;
  detail: string;
  fragmentCount: number;
  sourceTypeCount: number;
  screenshotCount: number;
  flags: string[];
};

type OutlineKnowledgeCard = {
  id: number;
  title: string;
  confidenceLabel: string;
  summary: string;
  latestChangeSummary: string;
  conflictFlags: string[];
  overturnedJudgement: string;
};

type OutlineMaterialNodeOption = {
  id: string;
  title: string;
};

type OutlineMaterialFragmentOption = {
  id: string;
  label: string;
};

type OutlineNodeFragmentSummary = {
  nodeId: number;
  title: string;
  fragments: Array<{
    id: number;
    label: string;
  }>;
};

type OutlineMaterialsArtifactPanelProps = {
  loadingMaterials: boolean;
  savingMaterials: boolean;
  onRefreshMaterials: () => void;
  readiness: OutlineMaterialReadiness;
  knowledgeCards: OutlineKnowledgeCard[];
  supplementalViewpoints: string[];
  onChangeSupplementalViewpoint: (index: number, value: string) => void;
  onSaveSupplementalViewpoints: () => void;
  selectedNodeId: string;
  onChangeSelectedNodeId: (value: string) => void;
  selectedUsageMode: "rewrite" | "image";
  onChangeSelectedUsageMode: (value: "rewrite" | "image") => void;
  selectedFragmentId: string;
  onChangeSelectedFragmentId: (value: string) => void;
  nodeOptions: OutlineMaterialNodeOption[];
  fragmentOptions: OutlineMaterialFragmentOption[];
  onAttachExisting: () => void;
  createMode: "manual" | "url" | "screenshot";
  onChangeCreateMode: (value: "manual" | "url" | "screenshot") => void;
  materialTitle: string;
  onChangeMaterialTitle: (value: string) => void;
  materialContent: string;
  onChangeMaterialContent: (value: string) => void;
  materialUrl: string;
  onChangeMaterialUrl: (value: string) => void;
  screenshotInputRef: Ref<HTMLInputElement>;
  onScreenshotFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  screenshotFileName: string;
  onSubmitCreate: () => void;
  nodeFragmentSummaries: OutlineNodeFragmentSummary[];
};

export function OutlineMaterialsArtifactPanel({
  loadingMaterials,
  savingMaterials,
  onRefreshMaterials,
  readiness,
  knowledgeCards,
  supplementalViewpoints,
  onChangeSupplementalViewpoint,
  onSaveSupplementalViewpoints,
  selectedNodeId,
  onChangeSelectedNodeId,
  selectedUsageMode,
  onChangeSelectedUsageMode,
  selectedFragmentId,
  onChangeSelectedFragmentId,
  nodeOptions,
  fragmentOptions,
  onAttachExisting,
  createMode,
  onChangeCreateMode,
  materialTitle,
  onChangeMaterialTitle,
  materialContent,
  onChangeMaterialContent,
  materialUrl,
  onChangeMaterialUrl,
  screenshotInputRef,
  onScreenshotFileChange,
  screenshotFileName,
  onSubmitCreate,
  nodeFragmentSummaries,
}: OutlineMaterialsArtifactPanelProps) {
  return (
    <div className="space-y-4 border border-lineStrong/60 bg-paperStrong px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">补充观点与素材注入</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            这里的“用户观点”只作为补充校正，不会覆盖整篇文章的主判断。素材可以是可改写文字，也可以是必须原样插入的截图。
          </div>
        </div>
        <Button
          type="button"
          onClick={onRefreshMaterials}
          disabled={loadingMaterials || savingMaterials}
          variant="secondary"
          size="sm"
        >
          {loadingMaterials ? "刷新中…" : "刷新素材面板"}
        </Button>
      </div>

      <div
        className={`border px-4 py-4 text-sm leading-7 ${
          readiness.status === "passed"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : readiness.status === "warning"
              ? "border-warning/40 bg-surfaceWarning text-warning"
              : "border-danger/30 bg-surface text-danger"
        }`}
      >
        <div className="text-xs uppercase tracking-[0.18em]">素材可用性评分</div>
        <div className="mt-2 font-serifCn text-2xl text-balance">{readiness.score}</div>
        <div className="mt-2">{readiness.detail}</div>
        <div className="mt-2 text-xs">
          挂载素材 {readiness.fragmentCount} 条 · 来源类型 {readiness.sourceTypeCount} 类 · 截图证据 {readiness.screenshotCount} 条
        </div>
        {readiness.flags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {readiness.flags.map((flag) => (
              <span key={flag} className="border border-current/30 px-2 py-1">
                {flag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3">
          {knowledgeCards.slice(0, 2).map((card) => (
            <div key={`outline-knowledge-${card.id}`} className="border border-lineStrong bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-ink">{card.title}</div>
                <span className="border border-lineStrong px-2 py-1 text-[11px] text-inkMuted">{card.confidenceLabel}</span>
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{card.summary || "暂无主题摘要"}</div>
              {card.latestChangeSummary ? (
                <div className="mt-2 border border-warning/30 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-inkSoft">
                  最近变化：{card.latestChangeSummary}
                </div>
              ) : null}
              {card.conflictFlags.length > 0 ? (
                <div className="mt-2 border border-danger/30 bg-surface px-3 py-2 text-xs leading-6 text-danger">
                  冲突提醒：{card.conflictFlags.join("；")}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="border border-lineStrong bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">背景卡摘要侧栏</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            大纲阶段优先参考当前命中的背景卡，先判断这次新增变量修正了什么旧结论，再决定章节顺序和证据挂载。
          </div>
          {knowledgeCards.length > 0 ? (
            <div className="mt-3 space-y-2 text-xs leading-6 text-inkMuted">
              {knowledgeCards.slice(0, 3).map((card) => (
                <div key={`outline-side-${card.id}`}>
                  {card.title}
                  {card.overturnedJudgement ? ` · 旧判断受影响 ${card.overturnedJudgement}` : ""}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-xs leading-6 text-inkMuted">当前还没有命中的背景卡，先补素材后再刷新。</div>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Textarea
            aria-label={`补充观点 ${index + 1}`}
            key={`viewpoint-${index}`}
            value={supplementalViewpoints[index] || ""}
            onChange={(event) => onChangeSupplementalViewpoint(index, event.target.value)}
            placeholder={`补充观点 ${index + 1}，例如：这篇不要只讲结论，要补清楚代价落在谁身上`}
            className="min-h-[72px] bg-surface px-3 py-2"
          />
        ))}
      </div>

      <Button
        type="button"
        onClick={onSaveSupplementalViewpoints}
        disabled={savingMaterials}
        variant="primary"
      >
        {savingMaterials ? "保存中…" : "保存补充观点"}
      </Button>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-lineStrong bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">挂载已有素材</div>
          <Select
            aria-label="大纲节点"
            value={selectedNodeId}
            onChange={(event) => onChangeSelectedNodeId(event.target.value)}
            className="mt-3 bg-paperStrong px-3 py-2"
          >
            <option value="">选择大纲节点</option>
            {nodeOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title}
              </option>
            ))}
          </Select>
          <Select
            aria-label="素材挂载方式"
            value={selectedUsageMode}
            onChange={(event) => onChangeSelectedUsageMode(event.target.value === "image" ? "image" : "rewrite")}
            className="mt-3 bg-paperStrong px-3 py-2"
          >
            <option value="rewrite">作为可改写素材</option>
            <option value="image">作为原样截图插入</option>
          </Select>
          <Select
            aria-label="已有素材"
            value={selectedFragmentId}
            onChange={(event) => onChangeSelectedFragmentId(event.target.value)}
            className="mt-3 bg-paperStrong px-3 py-2"
          >
            <option value="">选择已有素材</option>
            {fragmentOptions.map((fragment) => (
              <option key={fragment.id} value={fragment.id}>
                {fragment.label}
              </option>
            ))}
          </Select>
          <div className="mt-2 text-xs leading-6 text-inkMuted">如果截图已经在素材库里，可直接在这里选择“原样截图插入”；也可以在右侧直接上传新截图。</div>
          <Button
            type="button"
            onClick={onAttachExisting}
            disabled={savingMaterials}
            variant="primary"
            className="mt-3"
          >
            {savingMaterials ? "处理中…" : "挂到当前节点"}
          </Button>
        </div>

        <div className="border border-lineStrong bg-surface px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onChangeCreateMode("manual")}
              variant={createMode === "manual" ? "primary" : "secondary"}
              size="sm"
              className="flex-1"
            >
              新建文字素材
            </Button>
            <Button
              type="button"
              onClick={() => onChangeCreateMode("url")}
              variant={createMode === "url" ? "primary" : "secondary"}
              size="sm"
              className="flex-1"
            >
              新建链接素材
            </Button>
            <Button
              type="button"
              onClick={() => onChangeCreateMode("screenshot")}
              variant={createMode === "screenshot" ? "primary" : "secondary"}
              size="sm"
              className="flex-1"
            >
              新建截图素材
            </Button>
          </div>

          <Input
            aria-label="素材标题，可选"
            value={materialTitle}
            onChange={(event) => onChangeMaterialTitle(event.target.value)}
            placeholder="素材标题，可选"
            className="mt-3 bg-paperStrong px-3 py-2"
          />

          {createMode === "manual" ? (
            <Textarea
              aria-label="新建文字素材内容"
              value={materialContent}
              onChange={(event) => onChangeMaterialContent(event.target.value)}
              placeholder="输入要补进大纲的文字片段，系统会提纯后挂到节点。"
              className="mt-3 min-h-[120px] bg-paperStrong px-3 py-2"
            />
          ) : createMode === "url" ? (
            <Input
              aria-label="https://…"
              value={materialUrl}
              onChange={(event) => onChangeMaterialUrl(event.target.value)}
              placeholder="https://…"
              className="mt-3 bg-paperStrong px-3 py-2"
            />
          ) : (
            <div className="mt-3 space-y-3">
              <input
                aria-label="input control"
                ref={screenshotInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onScreenshotFileChange}
                className="block w-full text-sm text-inkMuted file:mr-3 file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:text-white"
              />
              <div className="text-xs leading-6 text-inkMuted">
                {screenshotFileName
                  ? `已选择截图：${screenshotFileName}。创建后会自动以“原样截图插入”挂到当前节点。`
                  : "支持 png/jpg/webp，上传后会直接创建截图素材并挂到当前节点。"}
              </div>
              <Textarea
                aria-label="可选：补一句截图上下文，帮助后续视觉理解和节点归位。"
                value={materialContent}
                onChange={(event) => onChangeMaterialContent(event.target.value)}
                placeholder="可选：补一句截图上下文，帮助后续视觉理解和节点归位。"
                className="min-h-[96px] bg-paperStrong px-3 py-2"
              />
            </div>
          )}

          <Button
            type="button"
            onClick={onSubmitCreate}
            disabled={savingMaterials}
            variant="primary"
            className="mt-3"
          >
            {savingMaterials ? "处理中…" : "创建并挂到节点"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {nodeFragmentSummaries.map((node) => (
          <div key={`outline-material-node-${node.nodeId}`} className="border border-lineStrong bg-surface px-4 py-4">
            <div className="font-medium text-ink">{node.title}</div>
            {node.fragments.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {node.fragments.map((fragment) => (
                  <span key={`${node.nodeId}-${fragment.id}`} className="border border-lineStrong bg-paperStrong px-3 py-2 text-xs leading-6 text-inkSoft">
                    {fragment.label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-inkMuted">这个节点还没有挂载素材。</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
