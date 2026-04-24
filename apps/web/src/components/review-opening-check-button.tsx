"use client";

import { useState } from "react";
import {
  Button,
  cn,
  surfaceCardStyles,
  type ButtonSize,
  type ButtonVariant,
} from "@huoziwriter/ui";
import {
  getOpeningCheckToneMeta,
  getOpeningDiagnoseRows,
  getOpeningRewriteDirections,
  resolveOpeningCheckStatus,
  type OpeningCheckPayload,
} from "@/lib/opening-check-review";

export function ReviewOpeningCheckButton({
  articleId,
  className,
  buttonVariant = "secondary",
  buttonSize = "sm",
}: {
  articleId: number;
  className?: string;
  buttonVariant?: ButtonVariant;
  buttonSize?: ButtonSize;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OpeningCheckPayload | null>(null);

  async function handleRunCheck() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/articles/${articleId}/opening-check`, {
        method: "POST",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "开头体检失败");
      }
      setResult((json.data?.check as OpeningCheckPayload | undefined) ?? null);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "开头体检失败");
    } finally {
      setLoading(false);
    }
  }

  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const diagnoseRows = getOpeningDiagnoseRows(result?.diagnose);
  const rewriteDirections = getOpeningRewriteDirections(result);
  const forbiddenHits = Array.isArray(result?.forbiddenHits)
    ? result.forbiddenHits.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const checkStatus = result ? resolveOpeningCheckStatus(checks) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <Button type="button" variant={buttonVariant} size={buttonSize} disabled={loading} onClick={handleRunCheck}>
        {loading ? "体检中…" : result ? "重新体检开头" : "开头体检"}
      </Button>
      {error ? (
        <div className={cn(surfaceCardStyles({ tone: "warning", padding: "sm" }), "max-w-md px-4 py-3 text-sm leading-6 text-warning shadow-none")}>
          {error}
        </div>
      ) : null}
      {result && checkStatus ? (
        <div className={cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "max-w-2xl space-y-4 px-4 py-3 text-sm leading-6 text-inkSoft shadow-none")}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("font-medium", checkStatus.className)}>已体检：{checkStatus.label}</span>
            {result.patternLabel ? <span>模式：{result.patternLabel}</span> : null}
            {result.qualityCeiling ? <span>上限：{result.qualityCeiling}</span> : null}
            {typeof result.hookScore === "number" ? <span>钩子分：{result.hookScore}</span> : null}
          </div>
          {result.openingText ? (
            <div className="rounded-2xl border border-lineStrong/80 bg-paper px-4 py-3 text-sm leading-7 text-ink">
              {result.openingText}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {diagnoseRows.map((item) => (
              <div key={item.key} className="rounded-2xl border border-lineStrong/80 bg-paper px-3 py-2">
                <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">{item.dimensionLabel}</div>
                <div className={cn("mt-1 text-sm font-medium", item.className)}>{item.dimensionLabel === "抽象度" ? `${item.dimensionLabel}${item.level === "danger" ? "偏高" : item.level === "warn" ? "偏高" : "正常"}` : item.dimensionLabel === "铺垫冗余" ? `${item.level === "pass" ? "控制住了" : "仍偏重"}` : item.dimensionLabel === "钩子密度" ? `${item.level === "pass" ? "足够" : "需要更前置"}` : `${item.level === "pass" ? "已前置" : "仍偏后"}`}</div>
              </div>
            ))}
          </div>
          {rewriteDirections.length > 0 ? (
            <div className="rounded-2xl border border-cinnabar/20 bg-cinnabar/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-cinnabar">推荐改写方向</div>
              {result.recommendReason ? <div className="mt-2 text-sm leading-6 text-ink">⭐ {result.recommendReason}</div> : null}
              <div className="mt-2 space-y-2">
                {rewriteDirections.map((item, index) => (
                  <div key={`${index + 1}-${item}`} className="text-sm leading-6 text-inkSoft">
                    {index + 1}. {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {forbiddenHits.length > 0 ? (
            <div className="rounded-2xl border border-warning/25 bg-warning/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.14em] text-warning">命中的死法</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {forbiddenHits.map((item) => (
                  <span key={item} className="rounded-full border border-warning/30 px-3 py-1 text-xs text-warning">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {checks.length > 0 ? (
            <div className="space-y-2">
              {checks.map((item, index) => {
                const tone = getOpeningCheckToneMeta(item.status);
                return (
                  <div key={`${item.key || "check"}-${index + 1}`} className="rounded-2xl border border-lineStrong/80 bg-paper px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn("font-medium", tone.className)}>{tone.label}</span>
                      {item.label ? <span className="text-ink">{item.label}</span> : null}
                    </div>
                    {item.detail ? <div className="mt-2 text-sm leading-6 text-inkSoft">{item.detail}</div> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
