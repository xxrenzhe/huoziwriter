import { useEffect, useMemo, useRef, useState } from "react";

export function WechatNativePreview({
  html,
  title = "文章标题未设置",
  authorName = "作者名",
  accountName = "公众号名称",
}: {
  html: string;
  title?: string;
  authorName?: string;
  accountName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredScreens, setMeasuredScreens] = useState<number | null>(null);

  const previewDate = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(new Date()),
    [],
  );

  const previewMetrics = useMemo(() => {
    const safeHtml = String(html || "");
    const paragraphCount = (safeHtml.match(/<p\b/gi) || []).length || (safeHtml.match(/<br\s*\/?>/gi) || []).length;
    const imageCount = (safeHtml.match(/<img\b/gi) || []).length;
    const quoteCount = (safeHtml.match(/<blockquote\b/gi) || []).length;
    const headingCount = (safeHtml.match(/<h[1-6]\b/gi) || []).length;
    const plainText = safeHtml
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const textLength = plainText.replace(/\s+/g, "").length;
    const hasRenderableContent = textLength > 0 || imageCount > 0 || quoteCount > 0 || headingCount > 0;
    const estimatedScreens = hasRenderableContent
      ? Math.max(1, Number((textLength / 820 + imageCount * 0.75 + quoteCount * 0.35).toFixed(1)))
      : 0;
    const screenLoad = estimatedScreens / Math.max(1, imageCount + 1);
    const fatigueLevel =
      !hasRenderableContent
        ? "empty"
        : estimatedScreens >= 5.5 || screenLoad >= 2.6
        ? "high"
        : estimatedScreens >= 3.5 || screenLoad >= 1.8
          ? "medium"
          : "low";
    const fatigueHint =
      fatigueLevel === "empty"
        ? "正文还没进入真机阅读区。先写下首段，再回来确认屏数和划屏负担。"
        : fatigueLevel === "high"
        ? "正文连续滑动偏长，建议插入 1-2 张配图或拆出更短段落。"
        : fatigueLevel === "medium"
          ? "篇幅已进入长阅读区，最好在关键信息段之间留出视觉停顿。"
          : "当前阅读负担较轻，适合继续保持这种段落呼吸。";

    return {
      paragraphCount,
      imageCount,
      quoteCount,
      headingCount,
      hasRenderableContent,
      textLength,
      estimatedScreens,
      fatigueLevel,
      fatigueHint,
    };
  }, [html]);

  useEffect(() => {
    if (containerRef.current) {
      const viewportHeight = containerRef.current.clientHeight || 620;
      const screens = containerRef.current.scrollHeight / viewportHeight;
      setMeasuredScreens(Number(screens.toFixed(1)));
    }
  }, [accountName, html, title]);

  const screenCount = measuredScreens ?? previewMetrics.estimatedScreens;
  const readCountStr = previewMetrics.hasRenderableContent ? (screenCount >= 4.5 ? "10万+" : screenCount >= 3 ? "5.2万" : "1.6万") : "--";
  const wowCountStr = previewMetrics.hasRenderableContent ? (screenCount >= 4.5 ? "1824" : screenCount >= 3 ? "926" : "312") : "--";
  const fatigueToneClass =
    previewMetrics.fatigueLevel === "empty"
      ? "border-lineStrong bg-surface/80 text-inkSoft"
      : previewMetrics.fatigueLevel === "high"
      ? "border-danger/30 bg-surface text-danger"
      : previewMetrics.fatigueLevel === "medium"
        ? "border-warning/40 bg-surfaceWarning text-warning"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className="grid gap-6 bg-[radial-gradient(circle_at_top,rgba(196,138,58,0.12),transparent_32%),linear-gradient(180deg,rgba(245,239,226,1)_0%,rgba(248,245,238,1)_100%)] p-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="border border-lineStrong/70 bg-surface/80 p-4 shadow-ink">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">微信原生预览</div>
          <div className="mt-3 font-serifCn text-2xl text-ink text-balance">{title}</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            用接近手机真机的框体、字阶和底栏去看最终呈现，避免在桌面编辑区里误判阅读负担。
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="border border-lineStrong/70 bg-surface/80 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">估算屏数</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{previewMetrics.hasRenderableContent ? screenCount.toFixed(1) : "0.0"}</div>
            <div className="mt-1 text-xs leading-6 text-inkMuted">
              {previewMetrics.hasRenderableContent ? "按 375px 宽手机视口估算连续阅读距离。" : "正文出现后，这里会开始估算真实划屏距离。"}
            </div>
          </div>
          <div className="border border-lineStrong/70 bg-surface/80 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">段落 / 配图</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
              {previewMetrics.paragraphCount} / {previewMetrics.imageCount}
            </div>
            <div className="mt-1 text-xs leading-6 text-inkMuted">段落过密且配图偏少时，更容易出现划屏疲劳。</div>
          </div>
          <div className="border border-lineStrong/70 bg-surface/80 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">内容骨架</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              小标题 {previewMetrics.headingCount} 个
              <br />
              引文 {previewMetrics.quoteCount} 处
              <br />
              正文约 {previewMetrics.textLength} 字
            </div>
          </div>
        </div>
        <div className={`border p-4 text-sm leading-7 ${fatigueToneClass}`}>
          <div className="text-xs uppercase tracking-[0.18em]">划屏疲劳度</div>
          <div className="mt-2 font-medium">
            {previewMetrics.fatigueLevel === "empty"
              ? "待成稿"
              : previewMetrics.fatigueLevel === "high"
              ? "偏高"
              : previewMetrics.fatigueLevel === "medium"
                ? "可控"
                : "轻"}
          </div>
          <div className="mt-2">{previewMetrics.fatigueHint}</div>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="relative flex h-[812px] w-[375px] shrink-0 flex-col overflow-hidden rounded-[44px] border-[10px] border-slate-900 bg-slate-100 shadow-[0_30px_80px_rgba(36,28,18,0.28)]">
          <div className="absolute left-1/2 top-0 z-50 h-[32px] w-[154px] -translate-x-1/2 rounded-b-[22px] bg-slate-900" />
          <div className="flex h-9 shrink-0 items-end justify-between bg-slate-900 px-7 pb-1 pt-2 text-[11px] text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <span className="block h-2 w-2 rounded-full bg-slate-50/70" />
              <span className="block h-2 w-2 rounded-full bg-slate-50/70" />
              <span className="block h-2 w-2 rounded-full bg-slate-50" />
            </div>
          </div>

          <div className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-slate-300 bg-slate-200 px-4">
            <div className="flex items-center gap-2 text-slate-700">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
              <span className="text-[13px]">返回</span>
            </div>
            <div className="text-[17px] font-medium text-slate-900">{accountName}</div>
            <div className="flex items-center gap-2 text-slate-700">
              <div className="flex h-7 w-16 items-center justify-between rounded-full border border-slate-300 bg-slate-50 px-2">
                <div className="h-1 w-1 rounded-full bg-slate-900" />
                <div className="h-1 w-1 rounded-full bg-slate-900" />
                <div className="h-1 w-1 rounded-full bg-slate-900" />
                <div className="mx-1 h-3 w-px bg-slate-300" />
                <div className="h-3 w-3 rounded-full border border-slate-900" />
              </div>
            </div>
          </div>

          <div ref={containerRef} className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 pb-8">
            <div className="p-4">
              <h1 className="text-[23px] font-bold leading-[1.45] text-slate-800 text-balance">{title}</h1>
              <div className="mt-4 flex items-center justify-between gap-3 text-[14px] leading-6">
                <div>
                  <span className="text-sky-700">{accountName}</span>
                  <span className="ml-2 text-slate-500">{previewDate}</span>
                </div>
                <span className="text-slate-400">{authorName}</span>
              </div>

              {previewMetrics.hasRenderableContent ? (
                <div
                  className="wechat-content-body mt-5 break-words text-[17px] leading-[1.8] text-slate-800"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <div className="mt-6 overflow-hidden rounded-[24px] border border-lineStrong/50 bg-[linear-gradient(180deg,rgba(253,251,246,1)_0%,rgba(247,242,232,1)_100%)] px-5 py-6">
                  <div className="text-[12px] uppercase tracking-[0.2em] text-warning">真机占位态</div>
                  <div className="mt-4 font-serifCn text-[24px] leading-[1.5] text-slate-800">这块屏幕会在你写下首段后，开始呈现真正的阅读体感。</div>
                  <div className="mt-3 text-[15px] leading-7 text-inkSoft">
                    先回稿纸写出第一段判断，或在阶段工作台生成执行卡。再回来时，这里会显示真实段落、屏数和划屏疲劳度。
                  </div>
                  <div className="mt-5 space-y-3">
                    {[
                      "先落一个明确判断，不必等整篇结构完全想清楚。",
                      "写到 3 至 5 句后再看真机预览，体感会比空白页可靠得多。",
                    ].map((tip) => (
                      <div key={tip} className="border border-lineStrong/50 bg-surface/80 px-4 py-3 text-[13px] leading-6 text-inkSoft">
                        {tip}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 rounded-[20px] bg-slate-100 px-4 py-3 text-[13px] leading-6 text-slate-600">
                上文为预估发布效果，真实渲染仍以当前模板和微信稿箱接收结果为准。
              </div>

              <div className="mt-8 flex items-center justify-between text-[14px] text-slate-500">
                <div className="flex items-center gap-4">
                  <span>阅读 {readCountStr}</span>
                  <span className="text-sky-700">分享</span>
                  <span className="flex items-center gap-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                    赞
                  </span>
                  <span className="flex items-center gap-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                    在看 {wowCountStr}
                  </span>
                </div>
              </div>
              <div className="mt-6 border-t border-slate-200 pt-4 text-[12px] leading-6 text-slate-500">
                <div>喜欢作者</div>
                <div className="mt-2 flex items-center justify-between">
                  <span>{authorName}</span>
                  <button type="button" className="rounded-full bg-green-500 px-4 py-1.5 text-white">
                    关注
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center justify-around border-t border-slate-300 bg-slate-100 text-[11px] text-slate-500">
            <div className="text-center">
              <div className="text-lg text-slate-700">◦</div>
              <div>微信</div>
            </div>
            <div className="text-center">
              <div className="text-lg text-slate-700">◦</div>
              <div>发现</div>
            </div>
            <div className="text-center text-green-600">
              <div className="text-lg">◦</div>
              <div>公众号</div>
            </div>
            <div className="text-center">
              <div className="text-lg text-slate-700">◦</div>
              <div>我</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
