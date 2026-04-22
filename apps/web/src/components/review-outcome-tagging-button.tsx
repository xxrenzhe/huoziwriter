"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Select,
  Textarea,
  cn,
  fieldEyebrowClassName,
  fieldLabelClassName,
  surfaceCardStyles,
  type ButtonSize,
  type ButtonVariant,
} from "@huoziwriter/ui";
import { formatOutcomeHitStatus } from "@/lib/article-workspace-formatters";

type OutcomeHitStatus = "pending" | "hit" | "near_miss" | "miss";

function parsePlaybookTags(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatWindowSummary(windowCodes: string[]) {
  return windowCodes.length > 0 ? windowCodes.join(" / ") : "未补快照";
}

export function ReviewOutcomeTaggingButton({
  articleId,
  articleTitle,
  currentTargetPackage,
  currentHitStatus,
  currentReviewSummary,
  currentNextAction,
  currentPlaybookTags,
  completedWindowCodes,
  missingWindowCodes,
  buttonText = "打标签",
  buttonVariant = "secondary",
  buttonSize = "sm",
}: {
  articleId: number;
  articleTitle: string;
  currentTargetPackage: string | null;
  currentHitStatus: OutcomeHitStatus;
  currentReviewSummary: string | null;
  currentNextAction: string | null;
  currentPlaybookTags: string[];
  completedWindowCodes: string[];
  missingWindowCodes: string[];
  buttonText?: string;
  buttonVariant?: ButtonVariant;
  buttonSize?: ButtonSize;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPackage, setTargetPackage] = useState(currentTargetPackage ?? "");
  const [hitStatus, setHitStatus] = useState<OutcomeHitStatus>(currentHitStatus);
  const [reviewSummary, setReviewSummary] = useState(currentReviewSummary ?? "");
  const [nextAction, setNextAction] = useState(currentNextAction ?? "");
  const [playbookTags, setPlaybookTags] = useState(currentPlaybookTags.join("，"));

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setTargetPackage(currentTargetPackage ?? "");
    setHitStatus(currentHitStatus);
    setReviewSummary(currentReviewSummary ?? "");
    setNextAction(currentNextAction ?? "");
    setPlaybookTags(currentPlaybookTags.join("，"));
  }, [
    currentHitStatus,
    currentNextAction,
    currentPlaybookTags,
    currentReviewSummary,
    currentTargetPackage,
    open,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/outcomes/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetPackage,
          hitStatus,
          reviewSummary,
          nextAction,
          playbookTags: parsePlaybookTags(playbookTags),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "保存标签失败");
      }
      setOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存标签失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant={buttonVariant} size={buttonSize} onClick={() => setOpen(true)}>
        {buttonText}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`为《${articleTitle}》打标签`}
            className="flex h-full w-full max-w-[560px] flex-col border-l border-lineStrong bg-paper shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-lineStrong px-5 py-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">复盘打标签</div>
                <h2 className="mt-2 font-serifCn text-2xl text-ink text-balance">{articleTitle}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    当前判定：{formatOutcomeHitStatus(currentHitStatus)}
                  </span>
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    已补快照：{formatWindowSummary(completedWindowCodes)}
                  </span>
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    待补：{formatWindowSummary(missingWindowCodes)}
                  </span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                关闭
              </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>目标包</div>
                <Input
                  value={targetPackage}
                  onChange={(event) => setTargetPackage(event.target.value)}
                  placeholder="例如：5k / 10w+"
                />
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>命中判定</div>
                <Select value={hitStatus} onChange={(event) => setHitStatus(event.target.value as OutcomeHitStatus)}>
                  <option value="pending">待判定</option>
                  <option value="hit">已命中</option>
                  <option value="near_miss">差一点命中</option>
                  <option value="miss">未命中</option>
                </Select>
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>打法标签</div>
                <Input
                  value={playbookTags}
                  onChange={(event) => setPlaybookTags(event.target.value)}
                  placeholder="用逗号分隔，例如：反直觉开头，案例拆解，强结论收束"
                />
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>复盘结论</div>
                <Textarea
                  value={reviewSummary}
                  onChange={(event) => setReviewSummary(event.target.value)}
                  placeholder="这篇为什么命中，或为什么差一点。"
                />
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>下一步动作</div>
                <Textarea
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                  placeholder="下一篇该继续放大什么、修正什么。"
                />
              </label>

              {error ? (
                <div className={cn(surfaceCardStyles({ tone: "warning", padding: "sm" }), "px-4 py-3 text-sm leading-6 text-warning shadow-none")}>
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-lineStrong px-5 py-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button type="button" variant="primary" size="sm" loading={saving} onClick={() => void handleSave()}>
                保存标签
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
