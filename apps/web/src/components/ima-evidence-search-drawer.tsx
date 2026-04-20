"use client";

import { Button, Input, Select } from "@huoziwriter/ui";
import { useEffect, useMemo, useState } from "react";

type ImaKnowledgeBaseOption = {
  kbId: string;
  kbName: string;
  isDefault: boolean;
};

type ImaKnowledgeBasePayload = {
  kbId: string;
  kbName: string;
  isEnabled: boolean;
  isDefault: boolean;
};

type ImaConnectionPayload = {
  status: string;
  knowledgeBases?: ImaKnowledgeBasePayload[];
};

type ImaEvidenceSearchItem = {
  mediaId: string;
  title: string;
  excerpt: string;
  sourceUrl: string | null;
};

export type ImaEvidenceSelection = {
  title: string;
  excerpt: string;
  sourceUrl: string | null;
};

export function ImaEvidenceSearchDrawer({
  articleId,
  open,
  onClose,
  onImport,
}: {
  articleId: number;
  open: boolean;
  onClose: () => void;
  onImport: (items: ImaEvidenceSelection[]) => void;
}) {
  const [knowledgeBases, setKnowledgeBases] = useState<ImaKnowledgeBaseOption[]>([]);
  const [loadingKnowledgeBases, setLoadingKnowledgeBases] = useState(false);
  const [kbId, setKbId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImaEvidenceSearchItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cursor, setCursor] = useState("");
  const [nextCursor, setNextCursor] = useState("");
  const [isEnd, setIsEnd] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingKnowledgeBases(true);
    void (async () => {
      try {
        const response = await fetch("/api/settings/ima-connections", { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && json.success) {
          const nextKnowledgeBases: ImaKnowledgeBaseOption[] = Array.isArray(json.data?.connections)
            ? (json.data.connections as ImaConnectionPayload[]).flatMap((connection: ImaConnectionPayload) =>
              connection.status === "valid"
                ? (connection.knowledgeBases ?? [])
                    .filter((kb: ImaKnowledgeBasePayload) => kb.isEnabled)
                    .map((kb: ImaKnowledgeBasePayload) => ({
                      kbId: kb.kbId,
                      kbName: kb.kbName,
                      isDefault: Boolean(kb.isDefault),
                    }))
                : [],
            )
            : [];
          setKnowledgeBases(nextKnowledgeBases);
          setKbId((current: string) => current || nextKnowledgeBases.find((item: ImaKnowledgeBaseOption) => item.isDefault)?.kbId || nextKnowledgeBases[0]?.kbId || "");
        }
      } finally {
        if (!cancelled) {
          setLoadingKnowledgeBases(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedItems = useMemo(
    () => results.filter((item: ImaEvidenceSearchItem) => selectedMediaIds.includes(item.mediaId)),
    [results, selectedMediaIds],
  );

  function toggleItem(mediaId: string) {
    setSelectedMediaIds((current: string[]) =>
      current.includes(mediaId)
        ? current.filter((item: string) => item !== mediaId)
        : [...current, mediaId],
    );
  }

  async function runSearch(nextCursorValue = "") {
    if (!query.trim()) {
      setMessage("请输入检索关键词。");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/evidence/ima-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          kbId: kbId || undefined,
          cursor: nextCursorValue,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "IMA 检索失败");
      }
      const payload = json.data as {
        items?: ImaEvidenceSearchItem[];
        nextCursor?: string;
        isEnd?: boolean;
        degradedReason?: string | null;
      };
      setResults(Array.isArray(payload.items) ? payload.items : []);
      setSelectedMediaIds([]);
      setCursor(nextCursorValue);
      setNextCursor(String(payload.nextCursor || ""));
      setIsEnd(Boolean(payload.isEnd));
      if (payload.degradedReason) {
        setMessage(String(payload.degradedReason));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "IMA 检索失败");
    } finally {
      setLoading(false);
    }
  }

  function importSelected() {
    if (selectedItems.length === 0) {
      setMessage("先选中至少一条 IMA 结果。");
      return;
    }
    onImport(
      selectedItems.map((item) => ({
        title: item.title,
        excerpt: item.excerpt,
        sourceUrl: item.sourceUrl,
      })),
    );
    onClose();
    setSelectedMediaIds([]);
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <div
        role="dialog"
        aria-modal="true"
        className="h-full w-full max-w-[560px] overflow-y-auto border-l border-lineStrong bg-paper px-5 py-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">IMA Evidence</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">从 IMA 检索证据</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              只把命中的爆款标题和高亮片段加进当前证据草稿，真正写库仍走现有的证据包保存动作。
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="mt-6 space-y-3 border border-lineStrong/40 bg-surface p-4">
          <Select value={kbId} onChange={(event) => setKbId(event.target.value)} disabled={loadingKnowledgeBases || knowledgeBases.length === 0}>
            <option value="">
              {loadingKnowledgeBases ? "正在载入 IMA 知识库…" : knowledgeBases.length > 0 ? "选择知识库" : "还没有可用的 IMA 知识库"}
            </option>
            {knowledgeBases.map((item) => (
              <option key={item.kbId} value={item.kbId}>
                {item.kbName}{item.isDefault ? " · 默认" : ""}
              </option>
            ))}
          </Select>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：35岁危机" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runSearch("")} disabled={loading || knowledgeBases.length === 0}>
              {loading ? "检索中…" : "开始检索"}
            </Button>
            {!isEnd && nextCursor ? (
              <Button type="button" variant="secondary" onClick={() => void runSearch(nextCursor)} disabled={loading}>
                下一页
              </Button>
            ) : null}
            {cursor ? (
              <div className="flex items-center text-xs text-inkMuted">
                当前游标：{cursor}
              </div>
            ) : null}
          </div>
          {knowledgeBases.length === 0 ? (
            <div className="text-sm leading-7 text-inkMuted">
              先去
              {" "}
              <a href="/settings/intelligence-kb" className="text-cinnabar underline underline-offset-4">
                智库信源设置
              </a>
              {" "}
              绑定至少一个可用的 IMA 知识库。
            </div>
          ) : null}
        </div>

        {message ? <div className="mt-4 text-sm text-cinnabar">{message}</div> : null}

        <div className="mt-6 space-y-3">
          {results.map((item) => {
            const selected = selectedMediaIds.includes(item.mediaId);
            return (
              <label key={item.mediaId} className="block cursor-pointer border border-lineStrong/40 bg-surface px-4 py-4">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selected} onChange={() => toggleItem(item.mediaId)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{item.title}</div>
                    <div className="mt-2 text-sm leading-7 text-inkSoft">{item.excerpt}</div>
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-xs text-cinnabar underline underline-offset-4"
                        onClick={(event) => event.stopPropagation()}
                      >
                        打开原始链接
                      </a>
                    ) : null}
                  </div>
                </div>
              </label>
            );
          })}
          {results.length === 0 && !loading ? (
            <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
              还没有检索结果。输入关键词后再开始搜索。
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-lineStrong pt-4">
          <div className="text-sm text-inkSoft">已选中 {selectedItems.length} 条，导入后会先加入当前证据草稿。</div>
          <Button type="button" onClick={importSelected} disabled={selectedItems.length === 0}>
            导入选中
          </Button>
        </div>
      </div>
    </div>
  );
}
