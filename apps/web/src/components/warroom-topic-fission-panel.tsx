"use client";

import { Button, Select, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import type { TopicFissionCandidate, TopicFissionEngine, TopicFissionMode, TopicFissionResult } from "@/lib/topic-fission";

const panelClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "mt-5 border-lineStrong shadow-none");
const actionRowClassName = "mt-3 flex flex-wrap gap-2";
const modeButtonClassName = "min-h-0 px-3 py-2 text-xs";
const signalCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "border-lineStrong bg-surface shadow-none");
const candidateCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-lineStrong bg-surface shadow-none");
const weakCandidateCardClassName = cn(candidateCardClassName, "opacity-70");
const engineToggleClassName = "min-h-0 px-3 py-2 text-xs";

type WarroomTopicLite = {
  id: number;
  title: string;
  suggestedSeriesId: number | null;
};

type SeriesOptionLite = {
  id: number;
  name: string;
  personaName: string;
  activeStatus: string;
};

type TopicBacklogOptionLite = {
  id: number;
  name: string;
  seriesId: number | null;
  itemCount: number;
};

type ImaConnectionLite = {
  id: number;
  label: string;
  status: string;
  knowledgeBases: Array<{
    id: number;
    kbId: string;
    kbName: string;
    isEnabled: boolean;
    isDefault: boolean;
  }>;
};

const MODE_ACTIONS: Array<{ mode: TopicFissionMode; label: string }> = [
  { mode: "regularity", label: "深挖赛道" },
  { mode: "contrast", label: "找差异化" },
  { mode: "cross-domain", label: "跨赛道迁移" },
];

type TopicFissionStreamEvent =
  | { status: "start"; message?: string }
  | { status: "done"; result?: TopicFissionResult }
  | { status: "error"; error?: string };

function formatStrength(value: number) {
  return `${Math.max(0, Math.min(5, Math.round(value)))} / 5`;
}

export function WarroomTopicFissionPanel({
  topic,
  seriesOptions,
  backlogOptions,
}: {
  topic: WarroomTopicLite;
  seriesOptions: SeriesOptionLite[];
  backlogOptions: TopicBacklogOptionLite[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<TopicFissionMode>("regularity");
  const [engine, setEngine] = useState<TopicFissionEngine>("local");
  const [seriesId, setSeriesId] = useState(() => {
    if (topic.suggestedSeriesId) return String(topic.suggestedSeriesId);
    if (seriesOptions.length === 1) return String(seriesOptions[0].id);
    return "";
  });
  const [result, setResult] = useState<TopicFissionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [startingRadar, setStartingRadar] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [backloggingRadar, setBackloggingRadar] = useState(false);
  const [backlogId, setBacklogId] = useState(() => {
    if (backlogOptions.length === 1) return String(backlogOptions[0].id);
    return "";
  });
  const [backloggingId, setBackloggingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loadingImaConnections, setLoadingImaConnections] = useState(true);
  const [imaConnections, setImaConnections] = useState<ImaConnectionLite[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/settings/ima-connections", { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && json.success) {
          setImaConnections(Array.isArray(json.data?.connections) ? json.data.connections : []);
        }
      } finally {
        if (!cancelled) {
          setLoadingImaConnections(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const imaKnowledgeBases = useMemo(
    () =>
      imaConnections
        .flatMap((connection) =>
          connection.status === "valid"
            ? connection.knowledgeBases
                .filter((item) => item.isEnabled)
                .map((item) => ({ ...item, connectionLabel: connection.label }))
            : [],
        ),
    [imaConnections],
  );
  const hasImaKnowledgeBase = imaKnowledgeBases.length > 0;
  const defaultImaKnowledgeBase = imaKnowledgeBases.find((item) => item.isDefault) ?? imaKnowledgeBases[0] ?? null;

  async function runFission(nextMode: TopicFissionMode) {
    const nextEngine = engine === "ima" && hasImaKnowledgeBase ? "ima" : "local";
    if (engine === "ima" && !hasImaKnowledgeBase) {
      setMessage("还没有可用的 IMA 知识库，请先去设置完成绑定。");
      setEngine("local");
    }
    setMode(nextMode);
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/topic-recommendations/${topic.id}/fission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode, engine: nextEngine }),
    });
    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => ({}));
      setLoading(false);
      setMessage(json.error || "裂变生成失败");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let nextResult: TopicFissionResult | null = null;
    let nextError = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim()) as TopicFissionStreamEvent;
        if (payload.status === "start") {
          setMessage(payload.message || "裂变生成中…");
        } else if (payload.status === "done" && payload.result) {
          nextResult = payload.result;
        } else if (payload.status === "error") {
          nextError = payload.error || "裂变生成失败";
        }
      }
    }

    setLoading(false);
    if (nextResult) {
      setResult(nextResult);
      if (nextEngine === "ima" && nextResult.engine !== "ima") {
        setEngine("local");
      }
      setMessage(nextResult.degradedReason || "");
      return;
    }
    setMessage(nextError || "裂变生成失败");
  }

  async function startFromCandidate(candidate: TopicFissionCandidate) {
    if (!seriesId) {
      setMessage(seriesOptions.length > 0 ? "先选一个系列，再从裂变候选起稿。" : "当前没有可用系列，先去设置里创建系列。");
      return;
    }
    setStartingId(candidate.id);
    setMessage("");
    const response = await fetch(`/api/topic-recommendations/${topic.id}/fission/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate,
        seriesId: Number(seriesId),
      }),
    });
    const json = await response.json().catch(() => ({}));
    setStartingId(null);
    if (response.ok && json.success) {
      startTransition(() => {
        router.push(`/articles/${json.data.articleId}`);
        router.refresh();
      });
      return;
    }
    setMessage(json.error || "裂变起稿失败");
  }

  async function startFromOriginalTopic() {
    if (!seriesId) {
      setMessage(seriesOptions.length > 0 ? "先选一个系列，再从原题起稿。" : "当前没有可用系列，先去设置里创建系列。");
      return;
    }
    setStartingRadar(true);
    setMessage("");
    const response = await fetch(`/api/topic-leads/${topic.id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seriesId: Number(seriesId),
      }),
    });
    const json = await response.json().catch(() => ({}));
    setStartingRadar(false);
    if (response.ok && json.success) {
      startTransition(() => {
        router.push(`/articles/${json.data.articleId}`);
        router.refresh();
      });
      return;
    }
    setMessage(json.error || "原题起稿失败");
  }

  async function addCandidateToBacklog(candidate: TopicFissionCandidate) {
    if (!backlogId) {
      setMessage(backlogOptions.length > 0 ? "先选一个选题库，再把裂变候选入库。" : "当前还没有选题库，先去设置页创建。");
      return;
    }
    setBackloggingId(candidate.id);
    setMessage("");
    const response = await fetch(`/api/topic-recommendations/${topic.id}/fission/backlog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate,
        backlogId: Number(backlogId),
        status: "ready",
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBackloggingId(null);
    if (response.ok && json.success) {
      setMessage(`已将《${candidate.title}》加入选题库。`);
      startTransition(() => router.refresh());
      return;
    }
    setMessage(json.error || "裂变候选入库失败");
  }

  async function addOriginalTopicToBacklog() {
    if (!backlogId) {
      setMessage(backlogOptions.length > 0 ? "先选一个选题库，再把原题入库。" : "当前还没有选题库，先去设置页创建。");
      return;
    }
    setBackloggingRadar(true);
    setMessage("");
    const response = await fetch(`/api/topic-recommendations/${topic.id}/backlog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backlogId: Number(backlogId),
        status: "ready",
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBackloggingRadar(false);
    if (response.ok && json.success) {
      setMessage(`已将原题《${topic.title}》加入选题库。`);
      startTransition(() => router.refresh());
      return;
    }
    setMessage(json.error || "原题入库失败");
  }

  return (
    <div className={panelClassName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-cinnabar">选题裂变</div>
          <p className="mt-2 text-sm leading-7 text-inkSoft">
            不改原始优先位，先沿当前题目做强度加工，再决定是不是直接起稿。
          </p>
        </div>
        <div className="grid gap-2 sm:min-w-[220px]">
          <Select
            aria-label="选择裂变起稿系列"
            value={seriesId}
            onChange={(event) => setSeriesId(event.target.value)}
            className="min-w-[220px] bg-surface"
          >
            <option value="">{seriesOptions.length > 0 ? "选择裂变稿件归属系列" : "请先创建系列"}</option>
            {seriesOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
              </option>
            ))}
          </Select>
          <Select
            aria-label="选择原题或裂变候选入库选题库"
            value={backlogId}
            onChange={(event) => setBacklogId(event.target.value)}
            className="min-w-[220px] bg-surface"
          >
            <option value="">{backlogOptions.length > 0 ? "选择原题或裂变候选入库选题库" : "请先创建选题库"}</option>
            {backlogOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.itemCount} 条
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className={actionRowClassName}>
        <Button
          type="button"
          onClick={startFromOriginalTopic}
          variant="secondary"
          disabled={startingRadar || seriesOptions.length === 0}
          className={modeButtonClassName}
        >
          {startingRadar ? "起稿中…" : "原题直接起稿"}
        </Button>
        <Button
          type="button"
          onClick={addOriginalTopicToBacklog}
          variant="secondary"
          disabled={backloggingRadar || backlogOptions.length === 0}
          className={modeButtonClassName}
        >
          {backloggingRadar ? "入库中…" : "原题加入选题库"}
        </Button>
        <Button
          type="button"
          onClick={() => setEngine("local")}
          variant={engine === "local" ? "primary" : "secondary"}
          className={engineToggleClassName}
        >
          本地裂变
        </Button>
        <Button
          type="button"
          onClick={() => setEngine("ima")}
          variant={engine === "ima" ? "primary" : "secondary"}
          disabled={loadingImaConnections}
          className={engineToggleClassName}
        >
          {loadingImaConnections ? "检查 IMA…" : "IMA 真实爆款"}
        </Button>
        {engine === "ima" ? (
          <div className="flex items-center text-xs text-inkMuted">
            {hasImaKnowledgeBase
              ? `默认知识库：${defaultImaKnowledgeBase?.kbName || "未命名知识库"}`
              : "还没有可用的 IMA 知识库，先去设置绑定。"}
          </div>
        ) : null}
      </div>

      {engine === "ima" && !hasImaKnowledgeBase ? (
        <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
          当前还没有可用的 IMA 知识库。先去
          {" "}
          <a href="/settings/intelligence-kb" className="text-cinnabar underline underline-offset-4">
            智库信源设置
          </a>
          {" "}
          绑定至少一个可用知识库，再回来跑真实爆款裂变。
        </div>
      ) : null}

      <div className={actionRowClassName}>
        {MODE_ACTIONS.map((action) => (
          <Button
            key={action.mode}
            onClick={() => runFission(action.mode)}
            variant={mode === action.mode ? "primary" : "secondary"}
            disabled={loading}
            className={modeButtonClassName}
          >
            {loading && mode === action.mode ? "生成中…" : action.label}
          </Button>
        ))}
      </div>

      {result ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {result.signalGroups.map((group) => (
              <section key={group.label} className={signalCardClassName}>
                <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">{group.label}</div>
                <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
                  {group.items.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-3">
            {result.candidates.map((candidate) => {
              const isWeak = candidate.predictedFlipStrength < 3;
              return (
                <article key={candidate.id} className={isWeak ? weakCandidateCardClassName : candidateCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-cinnabar">{candidate.modeLabel}</div>
                      <h4 className="mt-2 font-serifCn text-xl text-ink text-balance">{candidate.title}</h4>
                    </div>
                    <div className="text-right text-xs text-inkMuted">
                      <div>翻转强度 {formatStrength(candidate.predictedFlipStrength)}</div>
                      {isWeak ? <div className="mt-1">可能是弱翻转</div> : null}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-inkSoft">{candidate.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                    <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">目标读者 · {candidate.targetReader}</span>
                    <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">原赛道 · {candidate.sourceTrackLabel}</span>
                    {candidate.targetTrackLabel ? (
                      <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">迁移到 · {candidate.targetTrackLabel}</span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs leading-6 text-inkMuted">
                      起稿后会自动回填标题、目标读者、主流信念与核心判断。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => addCandidateToBacklog(candidate)}
                        disabled={backloggingId === candidate.id || backlogOptions.length === 0}
                        variant="secondary"
                      >
                        {backloggingId === candidate.id ? "入库中…" : "加入选题库"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => startFromCandidate(candidate)}
                        disabled={startingId === candidate.id || seriesOptions.length === 0}
                        variant="primary"
                      >
                        {startingId === candidate.id ? "起稿中…" : "直接起稿"}
                      </Button>
                    </div>
                  </div>
                  {Array.isArray(candidate.corpusEvidence) && candidate.corpusEvidence.length > 0 ? (
                    <div className="mt-4 border border-lineStrong/60 bg-surfaceWarm px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">参考爆款</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {candidate.corpusEvidence.map((evidence) => (
                          evidence.sourceUrl ? (
                            <a
                              key={`${candidate.id}-${evidence.title}`}
                              href={evidence.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="border border-lineStrong bg-surface px-2 py-1 text-xs text-inkSoft hover:border-cinnabar hover:text-cinnabar"
                            >
                              {evidence.title}
                            </a>
                          ) : (
                            <span
                              key={`${candidate.id}-${evidence.title}`}
                              className="border border-lineStrong bg-surface px-2 py-1 text-xs text-inkSoft"
                            >
                              {evidence.title}
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-7 text-inkMuted">
          从《{topic.title}》继续往下挖，默认先做规律裂变。每次生成都会给出可直接采纳的候选，不额外占一个新页面。
        </p>
      )}

      {message ? <div className="mt-3 text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
