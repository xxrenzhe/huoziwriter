"use client";

import { Button, Input, Select, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { createTopicSourceAction, disableTopicSourceAction, restoreTopicSourceAction, updateTopicSourceAction } from "@/app/(writer)/writer-actions";
import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";

const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "text-sm leading-7 text-inkSoft shadow-none");
const createFormClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "sm" }),
  "grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_140px_120px_140px]",
);
const sourceCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "flex flex-wrap items-center justify-between gap-3");
const sourceBadgeClassName = "border border-lineStrong bg-surfaceWarm px-2 py-1";
const messageCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "text-sm text-cinnabar");

function buildSourceDrafts(
  sources: Array<{
    id: number;
    sourceType: string;
    priority: number;
  }>,
) {
  return Object.fromEntries(
    sources.map((source) => [
      source.id,
      {
        sourceType: source.sourceType,
        priority: String(source.priority),
      },
    ]),
  );
}

export function TopicSourceManagerClient({
  sources,
  canManage,
  currentCustomCount = 0,
  maxCustomCount = 0,
  planName = "",
}: {
  sources: Array<{
    id: number;
    name: string;
    homepageUrl: string | null;
    sourceType: string;
    priority: number;
    scope: "system" | "custom";
    isActive: boolean;
    status?: string;
    attemptCount?: number;
    consecutiveFailures?: number;
    lastError?: string | null;
    lastHttpStatus?: number | null;
    nextRetryAt?: string | null;
    healthScore?: number;
    degradedReason?: string | null;
  }>;
  canManage: boolean;
  currentCustomCount?: number;
  maxCustomCount?: number;
  planName?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [sourceType, setSourceType] = useState("news");
  const [priority, setPriority] = useState("100");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const reachedLimit = canManage && maxCustomCount > 0 && currentCustomCount >= maxCustomCount;
  const [drafts, setDrafts] = useState(() => buildSourceDrafts(sources));

  function formatSourceTypeLabel(value: string) {
    if (value === "youtube") return "YouTube";
    if (value === "reddit") return "Reddit";
    if (value === "podcast") return "Podcast";
    if (value === "spotify") return "Spotify";
    if (value === "rss") return "RSS";
    if (value === "blog") return "Blog";
    return "News";
  }

  function formatSourceStatusLabel(value: string | undefined) {
    if (value === "degraded") return "降级";
    if (value === "failed") return "失败";
    if (value === "paused") return "暂停";
    return "健康";
  }

  const activeSources = sources.filter((source) => source.isActive);
  const inactiveCustomSources = sources.filter((source) => source.scope === "custom" && !source.isActive);
  const customActiveSources = activeSources.filter((source) => source.scope === "custom");
  const rankingBySourceId = useMemo(
    () =>
      new Map(
        [...customActiveSources]
          .sort((left, right) => {
            if (right.priority !== left.priority) {
              return right.priority - left.priority;
            }
            return left.id - right.id;
          })
          .map((source, index) => [source.id, index + 1] as const),
      ),
    [customActiveSources],
  );

  useEffect(() => {
    setDrafts(buildSourceDrafts(sources));
  }, [sources]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (reachedLimit) {
      setMessage(`${planName || "当前"}套餐最多只能启用 ${maxCustomCount} 个自定义信息源。先停用旧源，再新增新的来源。`);
      return;
    }
    try {
      await createTopicSourceAction({
        name,
        homepageUrl,
        sourceType,
        priority: Number(priority || 100),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增信息源失败");
      return;
    }
    setName("");
    setHomepageUrl("");
    setSourceType("news");
    setPriority("100");
    setMessage("信息源已创建，并已尝试同步最新热点。");
    startTransition(() => router.refresh());
  }

  async function updateSource(sourceId: number, payload: { sourceType?: string; priority?: number }) {
    setUpdatingId(sourceId);
    try {
      await updateTopicSourceAction(sourceId, payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新信息源失败");
      setUpdatingId(null);
      return;
    }
    setMessage("信息源配置已更新。");
    setUpdatingId(null);
    startTransition(() => router.refresh());
  }

  function updateDraft(sourceId: number, patch: Partial<{ sourceType: string; priority: string }>) {
    setDrafts((current) => ({
      ...current,
      [sourceId]: {
        sourceType: patch.sourceType ?? current[sourceId]?.sourceType ?? "news",
        priority: patch.priority ?? current[sourceId]?.priority ?? "100",
      },
    }));
  }

  async function saveDraft(source: (typeof sources)[number]) {
    const draft = drafts[source.id] ?? {
      sourceType: source.sourceType,
      priority: String(source.priority),
    };
    const nextPriority = Number(draft.priority);
    if (!Number.isInteger(nextPriority) || nextPriority < 0 || nextPriority > 999) {
      setMessage("优先级只能填写 0 到 999 的整数。");
      return;
    }
    await updateSource(source.id, {
      sourceType: draft.sourceType,
      priority: nextPriority,
    });
  }

  async function disableSource(id: number) {
    try {
      await disableTopicSourceAction(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "停用失败");
      return;
    }
    setMessage("信息源已停用。");
    startTransition(() => router.refresh());
  }

  async function restoreSource(id: number) {
    try {
      await restoreTopicSourceAction(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败");
      return;
    }
    setMessage("信息源已恢复并重新参与热点同步。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className={summaryCardClassName}>
          当前已启用 {currentCustomCount} / {maxCustomCount} 个自定义信息源。系统默认源不占额度；停用后即可释放启用名额。
        </div>
      ) : null}
      {canManage ? (
        <form onSubmit={handleSubmit} className={createFormClassName}>
          <Input aria-label="信息源名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="信息源名称" disabled={reachedLimit} className="bg-surface disabled:bg-surfaceMuted" />
          <Input aria-label="https://example.com 或 RSS 地址" value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} placeholder="https://example.com 或 RSS 地址" disabled={reachedLimit} className="bg-surface disabled:bg-surfaceMuted" />
          <Select aria-label="select control" value={sourceType} onChange={(event) => setSourceType(event.target.value)} disabled={reachedLimit} className="bg-surface disabled:bg-surfaceMuted">
            <option value="youtube">YouTube</option>
            <option value="reddit">Reddit</option>
            <option value="podcast">Podcast</option>
            <option value="spotify">Spotify</option>
            <option value="news">News</option>
            <option value="blog">Blog</option>
            <option value="rss">RSS</option>
          </Select>
          <Input aria-label="优先级" value={priority} onChange={(event) => setPriority(event.target.value)} placeholder="优先级" disabled={reachedLimit} className="bg-surface disabled:bg-surfaceMuted" />
          <Button type="submit" disabled={reachedLimit} variant="primary">
            {reachedLimit ? "已达上限" : "新增信息源"}
          </Button>
        </form>
      ) : (
        <div className={cn(surfaceCardStyles({ tone: "warm", padding: "sm" }), "text-sm leading-7 text-inkSoft")}>
          当前套餐只能读取系统信息源。升级到 `pro` 或 `ultra` 后，才可新增自己的外部源。
        </div>
      )}
      <div className="space-y-3">
        {activeSources.map((source) => (
          <article key={source.id} className={sourceCardClassName}>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">
                {source.scope === "system" ? "系统源" : "自定义源"}
              </div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{source.name}</div>
              <div className="mt-2 text-sm text-inkSoft">{source.homepageUrl || "未配置主页地址"}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                <span className={sourceBadgeClassName}>
                  类型 · {formatSourceTypeLabel(source.sourceType)}
                </span>
                <span className={sourceBadgeClassName}>
                  优先级 · {source.priority}
                </span>
                <span className={sourceBadgeClassName}>
                  状态 · {formatSourceStatusLabel(source.status)}
                </span>
                <span className={sourceBadgeClassName}>
                  健康分 · {Math.round(Number(source.healthScore ?? 100))}
                </span>
              </div>
              {source.degradedReason || source.lastError || source.nextRetryAt ? (
                <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                  {source.degradedReason ? <div>降级原因：{source.degradedReason}</div> : null}
                  {source.lastError ? <div>最近错误：{source.lastError}{source.lastHttpStatus ? `（HTTP ${source.lastHttpStatus}）` : ""}</div> : null}
                  {source.nextRetryAt ? <div>下次重试：{new Date(source.nextRetryAt).toLocaleString("zh-CN")}</div> : null}
                  {typeof source.attemptCount === "number" || typeof source.consecutiveFailures === "number" ? (
                    <div>尝试次数：{source.attemptCount ?? 0} · 连续失败：{source.consecutiveFailures ?? 0}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {canManage && source.scope !== "system" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="select control"
                  value={drafts[source.id]?.sourceType ?? source.sourceType}
                  onChange={(event) => updateDraft(source.id, { sourceType: event.target.value })}
                  disabled={updatingId === source.id}
                  className="w-auto min-w-[140px] px-3"
                >
                  <option value="youtube">YouTube</option>
                  <option value="reddit">Reddit</option>
                  <option value="podcast">Podcast</option>
                  <option value="spotify">Spotify</option>
                  <option value="news">News</option>
                  <option value="blog">Blog</option>
                  <option value="rss">RSS</option>
                </Select>
                <Input
                  aria-label={`${source.name} 优先级`}
                  value={drafts[source.id]?.priority ?? String(source.priority)}
                  onChange={(event) => updateDraft(source.id, { priority: event.target.value })}
                  disabled={updatingId === source.id}
                  className="w-28 bg-surface"
                  inputMode="numeric"
                  placeholder="0-999"
                />
                <Button
                  onClick={() => void saveDraft(source)}
                  disabled={
                    updatingId === source.id
                    || (
                      (drafts[source.id]?.sourceType ?? source.sourceType) === source.sourceType
                      && (drafts[source.id]?.priority ?? String(source.priority)) === String(source.priority)
                    )
                  }
                  variant="secondary"
                >
                  保存排序
                </Button>
                <Button onClick={() => disableSource(source.id)} variant="secondary">
                  停用
                </Button>
                <div className="w-full text-xs leading-6 text-inkMuted">
                  当前排位 {rankingBySourceId.get(source.id) ?? "-"} / {customActiveSources.length}，优先级越高越靠前。
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {inactiveCustomSources.length > 0 ? (
        <div className="space-y-3">
          <div className={summaryCardClassName}>
            已停用 {inactiveCustomSources.length} 个自定义信息源。恢复后会重新参与热点同步与排序，并重新占用启用名额。
          </div>
          {inactiveCustomSources.map((source) => (
            <article key={`inactive-${source.id}`} className={sourceCardClassName}>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">已停用来源</div>
                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{source.name}</div>
                <div className="mt-2 text-sm text-inkSoft">{source.homepageUrl || "未配置主页地址"}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span className={sourceBadgeClassName}>
                    类型 · {formatSourceTypeLabel(source.sourceType)}
                  </span>
                  <span className={sourceBadgeClassName}>
                    优先级 · {source.priority}
                  </span>
                  <span className={sourceBadgeClassName}>
                    状态 · 已停用
                  </span>
                </div>
                {source.degradedReason || source.lastError ? (
                  <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                    {source.degradedReason ? <div>停用前异常：{source.degradedReason}</div> : null}
                    {source.lastError ? <div>最近错误：{source.lastError}{source.lastHttpStatus ? `（HTTP ${source.lastHttpStatus}）` : ""}</div> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => restoreSource(source.id)} variant="secondary">
                  恢复来源
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {message ? <div className={messageCardClassName}>{message}</div> : null}
    </div>
  );
}
