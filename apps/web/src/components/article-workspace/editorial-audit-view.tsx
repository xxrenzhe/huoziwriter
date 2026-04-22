import type { ComponentProps } from "react";
import { useRef } from "react";
import { Button } from "@huoziwriter/ui";
import type { WorkspaceEditorialAnnotation } from "@/lib/article-workspace-helpers";
import { SentenceRhythmMap } from "../sentence-rhythm-map";
import { AuthoringBlankSlate } from "./authoring-phase";

type EditorialReviewLike = {
  html: string;
  annotations: WorkspaceEditorialAnnotation[];
};

type EditorialAuditViewProps = {
  markdown: string;
  hasDraftContent: boolean;
  liveLanguageGuardSummary: {
    tokenCount: number;
    patternCount: number;
    highSeverityCount: number;
  };
  editorialReview: EditorialReviewLike;
  reviewBlankSlate: Pick<ComponentProps<typeof AuthoringBlankSlate>, "eyebrow" | "title" | "detail" | "prompts">;
  onSwitchToEdit: () => void;
  onSwitchToWorkspace: () => void;
};

export function EditorialAuditView({
  markdown,
  hasDraftContent,
  liveLanguageGuardSummary,
  editorialReview,
  reviewBlankSlate,
  onSwitchToEdit,
  onSwitchToWorkspace,
}: EditorialAuditViewProps) {
  const editorialPreviewRef = useRef<HTMLDivElement | null>(null);

  function jumpToEditorialAnnotation(anchorId: string) {
    const target = editorialPreviewRef.current?.querySelector<HTMLElement>(`#${anchorId}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }

  return (
    <div className="mt-4 min-h-[420px] border border-lineStrong bg-surfaceWarm p-4 md:min-h-[560px] md:p-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border border-danger/20 bg-surface p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-danger/20 pb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">主编红笔</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                命中语言守卫后，不再只给规则列表，而是直接在稿纸上标出问题位置和批注编号。
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="border border-danger/30 bg-surface px-3 py-2 text-danger">高风险 {liveLanguageGuardSummary.highSeverityCount}</span>
              <span className="border border-lineStrong bg-paperStrong px-3 py-2 text-inkSoft">词语 {liveLanguageGuardSummary.tokenCount}</span>
              <span className="border border-lineStrong bg-paperStrong px-3 py-2 text-inkSoft">句式 {liveLanguageGuardSummary.patternCount}</span>
            </div>
          </div>
          {hasDraftContent && editorialReview.annotations.length === 0 ? (
            <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
              当前正文未命中语言守卫，可以切去微信预览看最终阅读体感。
            </div>
          ) : null}
          {hasDraftContent ? (
            <div
              ref={editorialPreviewRef}
              className="mt-4 whitespace-pre-wrap break-words bg-[linear-gradient(transparent_31px,rgba(167,48,50,0.05)_32px)] bg-[length:100%_32px] px-2 text-sm leading-8 text-ink"
              dangerouslySetInnerHTML={{ __html: editorialReview.html }}
            />
          ) : (
            <div className="mt-4">
              <AuthoringBlankSlate
                eyebrow={reviewBlankSlate.eyebrow}
                title={reviewBlankSlate.title}
                detail={reviewBlankSlate.detail}
                prompts={reviewBlankSlate.prompts}
              >
                <Button
                  type="button"
                  onClick={onSwitchToEdit}
                  variant="secondary"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  先回稿纸起笔
                </Button>
                <Button type="button" onClick={onSwitchToWorkspace} variant="secondary">
                  先看阶段工作台
                </Button>
              </AuthoringBlankSlate>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <SentenceRhythmMap text={markdown} />
          <div className="border border-danger/20 bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">批注清单</div>
            {!hasDraftContent ? (
              <div className="mt-3 text-sm leading-7 text-inkMuted">等正文出现后，这里会按编号列出每条红笔批注。</div>
            ) : editorialReview.annotations.length === 0 ? (
              <div className="mt-3 text-sm leading-7 text-inkMuted">没有需要批注的语言守卫命中。</div>
            ) : (
              <div className="mt-3 space-y-3">
                {editorialReview.annotations.map((annotation) => (
                  <button
                    key={annotation.id}
                    type="button"
                    onClick={() => jumpToEditorialAnnotation(annotation.anchorId)}
                    className={`border px-4 py-4 ${
                      annotation.severity === "high"
                        ? "border-danger/30 bg-surface"
                        : "border-warning/40 bg-surfaceWarning"
                    } w-full text-left transition-colors hover:border-cinnabar/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/40`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="border border-current/20 bg-surface/80 px-2 py-1 text-cinnabar">#{annotation.order}</span>
                      <span className="border border-current/20 bg-surface/80 px-2 py-1 text-inkSoft">
                        {annotation.ruleKind === "pattern" ? "句式" : "词语"}
                      </span>
                      <span className="border border-current/20 bg-surface/80 px-2 py-1 text-inkSoft">
                        {annotation.scope === "system" ? "系统规则" : "自定义规则"}
                      </span>
                    </div>
                    <div className="mt-3 text-sm leading-7 text-ink">
                      命中：<span className="font-medium">{annotation.matchedText}</span>
                      {annotation.count > 1 ? ` · 共 ${annotation.count} 处` : ""}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-inkMuted">上下文：{annotation.sampleContext}</div>
                    {annotation.rewriteHint ? (
                      <div className={`mt-2 text-sm leading-7 ${annotation.severity === "high" ? "text-danger" : "text-inkSoft"}`}>
                        改写建议：{annotation.rewriteHint}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
