"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Textarea,
  cn,
  fieldEyebrowClassName,
  fieldLabelClassName,
  surfaceCardStyles,
  type ButtonSize,
  type ButtonVariant,
} from "@huoziwriter/ui";

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatTags(value: string[]) {
  return value.length > 0 ? value.join("，") : "";
}

export function ReviewPlan17QualityLabelingButton({
  caseId,
  topicTitle,
  datasetName,
  focusLabel,
  taskCode,
  currentStrategyManualScore,
  currentEvidenceExpectedTags,
  currentEvidenceDetectedTags,
  currentNotes,
  buttonText = "补质量标注",
  buttonVariant = "secondary",
  buttonSize = "sm",
}: {
  caseId: number;
  topicTitle: string;
  datasetName: string;
  focusLabel: string;
  taskCode: string;
  currentStrategyManualScore: number | null;
  currentEvidenceExpectedTags: string[];
  currentEvidenceDetectedTags: string[];
  currentNotes: string | null;
  buttonText?: string;
  buttonVariant?: ButtonVariant;
  buttonSize?: ButtonSize;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategyManualScore, setStrategyManualScore] = useState(currentStrategyManualScore == null ? "" : String(currentStrategyManualScore));
  const [evidenceExpectedTags, setEvidenceExpectedTags] = useState(formatTags(currentEvidenceExpectedTags));
  const [evidenceDetectedTags, setEvidenceDetectedTags] = useState(formatTags(currentEvidenceDetectedTags));
  const [notes, setNotes] = useState(currentNotes ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setStrategyManualScore(currentStrategyManualScore == null ? "" : String(currentStrategyManualScore));
    setEvidenceExpectedTags(formatTags(currentEvidenceExpectedTags));
    setEvidenceDetectedTags(formatTags(currentEvidenceDetectedTags));
    setNotes(currentNotes ?? "");
  }, [
    currentEvidenceDetectedTags,
    currentEvidenceExpectedTags,
    currentNotes,
    currentStrategyManualScore,
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
      const response = await fetch("/api/reviews/plan17/quality/labels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseId,
          strategyManualScore: strategyManualScore.trim() === "" ? null : Number(strategyManualScore),
          evidenceExpectedTags: parseTags(evidenceExpectedTags),
          evidenceDetectedTags: parseTags(evidenceDetectedTags),
          notes: notes.trim() || null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "保存质量标注失败");
      }
      setOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存质量标注失败");
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
            aria-label={`为《${topicTitle}》补 plan17 质量标注`}
            className="flex h-full w-full max-w-[560px] flex-col border-l border-lineStrong bg-paper shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-lineStrong px-5 py-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Plan 17 质量标注</div>
                <h2 className="mt-2 font-serifCn text-2xl text-ink text-balance">{topicTitle}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    {focusLabel}
                  </span>
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    {datasetName}
                  </span>
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    {taskCode}
                  </span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                关闭
              </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>策略人工分</div>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  inputMode="decimal"
                  value={strategyManualScore}
                  onChange={(event) => setStrategyManualScore(event.target.value)}
                  placeholder="例如：4.5"
                />
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>预期证据标签</div>
                <Input
                  value={evidenceExpectedTags}
                  onChange={(event) => setEvidenceExpectedTags(event.target.value)}
                  placeholder="例如：反常识，行业对比，一手观察"
                />
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>实际命中标签</div>
                <Input
                  value={evidenceDetectedTags}
                  onChange={(event) => setEvidenceDetectedTags(event.target.value)}
                  placeholder="例如：案例拆解，数据锚点，情绪张力"
                />
              </label>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>补充说明</div>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="记录为什么这样打分，或者当前样本还缺什么。"
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
                保存标注
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
