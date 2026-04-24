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
type OutcomeWindowCode = "24h" | "72h" | "7d";

const outcomeWindowLabelMap: Record<OutcomeWindowCode, string> = {
  "24h": "24 小时",
  "72h": "72 小时",
  "7d": "7 天",
};

function parsePlaybookTags(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatWindowSummary(windowCodes: string[]) {
  return windowCodes.length > 0 ? windowCodes.join(" / ") : "已补齐";
}

function pickDefaultWindowCode(
  nextWindowCode: OutcomeWindowCode | null,
  missingWindowCodes: string[],
): OutcomeWindowCode {
  if (nextWindowCode) {
    return nextWindowCode;
  }
  if (missingWindowCodes.includes("24h")) return "24h";
  if (missingWindowCodes.includes("72h")) return "72h";
  if (missingWindowCodes.includes("7d")) return "7d";
  return "24h";
}

function shouldRequireClosureReview(
  missingWindowCodes: string[],
  currentHitStatus: OutcomeHitStatus,
) {
  return missingWindowCodes.length <= 1 || (missingWindowCodes.length === 0 && currentHitStatus === "pending");
}

function buildClosureHint(
  missingWindowCodes: string[],
  currentHitStatus: OutcomeHitStatus,
) {
  if (missingWindowCodes.length === 0 && currentHitStatus === "pending") {
    return "这篇已经没有缺失时间窗，下一步只剩命中判定、复盘结论和下一步动作。";
  }
  if (missingWindowCodes.length === 1) {
    return `当前只剩 ${formatWindowSummary(missingWindowCodes)} 这个缺口，建议这次顺手补齐命中判定和复盘结论。`;
  }
  return "先录核心数字，再按需要补完复盘字段。";
}

export function ArticleOutcomeQuickCaptureButton({
  articleId,
  articleTitle,
  nextWindowCode,
  completedWindowCodes,
  missingWindowCodes,
  currentTargetPackage,
  currentHitStatus,
  currentReviewSummary,
  currentNextAction,
  currentPlaybookTags,
  buttonText = "快速录入结果",
  buttonVariant = "secondary",
  buttonSize = "sm",
}: {
  articleId: number;
  articleTitle: string;
  nextWindowCode: OutcomeWindowCode | null;
  completedWindowCodes: string[];
  missingWindowCodes: string[];
  currentTargetPackage: string | null;
  currentHitStatus: OutcomeHitStatus;
  currentReviewSummary: string | null;
  currentNextAction: string | null;
  currentPlaybookTags: string[];
  buttonText?: string;
  buttonVariant?: ButtonVariant;
  buttonSize?: ButtonSize;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allowWindowOverride, setAllowWindowOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowCode, setWindowCode] = useState<OutcomeWindowCode>(
    pickDefaultWindowCode(nextWindowCode, missingWindowCodes),
  );
  const [readCount, setReadCount] = useState("");
  const [shareCount, setShareCount] = useState("");
  const [likeCount, setLikeCount] = useState("");
  const [notes, setNotes] = useState("");
  const [targetPackage, setTargetPackage] = useState(currentTargetPackage ?? "");
  const [hitStatus, setHitStatus] = useState<OutcomeHitStatus>(currentHitStatus);
  const [reviewSummary, setReviewSummary] = useState(currentReviewSummary ?? "");
  const [nextAction, setNextAction] = useState(currentNextAction ?? "");
  const [playbookTags, setPlaybookTags] = useState(currentPlaybookTags.join("，"));
  const requiresClosureReview = shouldRequireClosureReview(missingWindowCodes, currentHitStatus);
  const closureReady =
    hitStatus !== "pending"
    && Boolean(reviewSummary.trim())
    && Boolean(nextAction.trim());
  const saveOutcomeLabel = requiresClosureReview && !closureReady ? "保存并继续待回流" : "保存并完成回流";
  const closureHint = buildClosureHint(missingWindowCodes, currentHitStatus);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setShowAdvanced(shouldRequireClosureReview(missingWindowCodes, currentHitStatus));
    setAllowWindowOverride(false);
    setWindowCode(pickDefaultWindowCode(nextWindowCode, missingWindowCodes));
    setReadCount("");
    setShareCount("");
    setLikeCount("");
    setNotes("");
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
    missingWindowCodes,
    nextWindowCode,
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
      const response = await fetch(`/api/articles/${articleId}/outcomes/snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          windowCode,
          readCount: Number(readCount || 0),
          shareCount: Number(shareCount || 0),
          likeCount: Number(likeCount || 0),
          notes,
          targetPackage,
          hitStatus,
          reviewSummary,
          nextAction,
          playbookTags: parsePlaybookTags(playbookTags),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "保存结果快照失败");
      }
      setOpen(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存结果快照失败");
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
            aria-label={`为《${articleTitle}》快速录入结果`}
            className="flex h-full w-full max-w-[560px] flex-col border-l border-lineStrong bg-paper shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-lineStrong px-5 py-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">待回流快速录入</div>
                <h2 className="mt-2 font-serifCn text-2xl text-ink text-balance">{articleTitle}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    当前判定：{formatOutcomeHitStatus(currentHitStatus)}
                  </span>
                  <span className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 shadow-none")}>
                    已补：{formatWindowSummary(completedWindowCodes)}
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
              <div className={cn(surfaceCardStyles({ tone: "warm", padding: "sm" }), "px-4 py-4 text-sm leading-7 text-inkSoft shadow-none")}>
                {closureHint}
              </div>

              {allowWindowOverride ? (
                <label className={fieldLabelClassName}>
                  <div className={fieldEyebrowClassName}>时间窗</div>
                  <Select
                    value={windowCode}
                    onChange={(event) => setWindowCode(event.target.value as OutcomeWindowCode)}
                  >
                    {(Object.keys(outcomeWindowLabelMap) as OutcomeWindowCode[]).map((item) => (
                      <option key={item} value={item}>
                        {outcomeWindowLabelMap[item]}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <div className={fieldLabelClassName}>
                  <div className={fieldEyebrowClassName}>时间窗</div>
                  <div className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-none")}>
                    <div className="text-sm leading-7 text-inkSoft">
                      本次默认录入 {outcomeWindowLabelMap[windowCode]}，对应当前下一缺口。
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setAllowWindowOverride(true)}>
                      改填其他时间窗
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <label className={fieldLabelClassName}>
                  <div className={fieldEyebrowClassName}>阅读</div>
                  <Input
                    value={readCount}
                    onChange={(event) => setReadCount(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>
                <label className={fieldLabelClassName}>
                  <div className={fieldEyebrowClassName}>分享</div>
                  <Input
                    value={shareCount}
                    onChange={(event) => setShareCount(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>
                <label className={fieldLabelClassName}>
                  <div className={fieldEyebrowClassName}>在看 / 点赞</div>
                  <Input
                    value={likeCount}
                    onChange={(event) => setLikeCount(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>
              </div>

              <label className={fieldLabelClassName}>
                <div className={fieldEyebrowClassName}>快照备注</div>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="例如：后台截图来自 4 月第 4 周周报。"
                />
              </label>

              <div className="border-t border-lineStrong pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAdvanced((current) => !current)}
                >
                  {showAdvanced ? "收起复盘字段" : "展开目标包 / 命中判定 / 复盘字段"}
                </Button>
              </div>

              {showAdvanced ? (
                <div className="space-y-5">
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
                      placeholder="下一篇继续放大什么、立刻停掉什么。"
                    />
                  </label>

                  <label className={fieldLabelClassName}>
                    <div className={fieldEyebrowClassName}>打法标签</div>
                    <Input
                      value={playbookTags}
                      onChange={(event) => setPlaybookTags(event.target.value)}
                      placeholder="用逗号分隔，例如：反直觉开头，案例拆解，强结论收束"
                    />
                  </label>
                </div>
              ) : null}

              {error ? (
                <div className={cn(surfaceCardStyles({ tone: "warning", padding: "sm" }), "px-4 py-3 text-sm leading-6 text-warning shadow-none")}>
                  {error}
                </div>
              ) : null}

              {requiresClosureReview && !closureReady ? (
                <div className={cn(surfaceCardStyles({ tone: "warning", padding: "sm" }), "px-4 py-3 text-sm leading-6 text-warning shadow-none")}>
                  如果现在直接保存，这篇仍会留在待回流。请尽量补齐命中判定、复盘结论和下一步动作。
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-lineStrong px-5 py-4">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button type="button" variant="primary" size="sm" loading={saving} onClick={() => void handleSave()}>
                {saveOutcomeLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
