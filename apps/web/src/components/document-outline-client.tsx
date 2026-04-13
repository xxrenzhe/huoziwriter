"use client";

import { useEffect, useState } from "react";

type NodeItem = {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: Array<{ id: number; distilledContent: string; shared?: boolean }>;
};

type FragmentOption = {
  id: number;
  title?: string | null;
  distilledContent: string;
  shared?: boolean;
};

export function DocumentOutlineClient({
  documentId,
  nodes,
  fragments,
  onChange,
}: {
  documentId: number;
  nodes: NodeItem[];
  fragments: FragmentOption[];
  onChange: () => Promise<void>;
}) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<FragmentOption & { score?: number }>>([]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch("/api/fragments/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedQuery }),
        });
        const json = await response.json();
        if (response.ok && json.success) {
          setSearchResults(json.data);
        }
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  const fragmentPool = searchQuery.trim() ? searchResults : fragments;

  async function addNode() {
    if (!newTitle.trim()) return;
    await fetch(`/api/documents/${documentId}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    await onChange();
  }

  async function moveNode(targetId: number) {
    if (!draggedId || draggedId === targetId) return;
    const order = [...nodes];
    const fromIndex = order.findIndex((node) => node.id === draggedId);
    const toIndex = order.findIndex((node) => node.id === targetId);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    await fetch(`/api/documents/${documentId}/nodes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeIds: order.map((node) => node.id) }),
    });
    await onChange();
  }

  async function attachFragment(nodeId: number, fragmentId: number) {
    await fetch(`/api/documents/${documentId}/nodes/${nodeId}/fragments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentId }),
    });
    await onChange();
  }

  async function detachFragment(nodeId: number, fragmentId: number) {
    await fetch(`/api/documents/${documentId}/nodes/${nodeId}/fragments?fragmentId=${fragmentId}`, {
      method: "DELETE",
    });
    await onChange();
  }

  async function deleteNode(nodeId: number) {
    await fetch(`/api/documents/${documentId}/nodes/${nodeId}`, { method: "DELETE" });
    await onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="新增大纲节点"
          className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <button onClick={addNode} className="bg-cinnabar px-3 py-2 text-sm text-white">
          添加
        </button>
      </div>
      <div className="border border-stone-300 bg-[#faf7f0] px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">语义召回</div>
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜观点、时间、人物或事件，不必完全匹配原文"
          className="mt-2 w-full border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <div className="mt-2 text-xs leading-6 text-stone-500">
          {searchQuery.trim()
            ? searching
              ? "正在按语义相近度重新排序碎片..."
              : `当前显示 ${fragmentPool.length} 条相关碎片，可直接挂载到任一节点。`
            : "留空时展示最近碎片；输入后会按语义相近度优先显示候选。"}
        </div>
      </div>
      <div className="space-y-3">
        {nodes.map((node) => (
          <div
            key={node.id}
            draggable
            onDragStart={() => setDraggedId(node.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void moveNode(node.id)}
            className="border border-stone-300 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-serifCn text-xl text-ink">{node.title}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">节点 {node.sortOrder}</div>
              </div>
              <button onClick={() => deleteNode(node.id)} className="text-xs text-stone-500">
                删除
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {node.fragments.map((fragment) => (
                <button
                  key={fragment.id}
                  onClick={() => detachFragment(node.id, fragment.id)}
                  className="block w-full border border-[#eadfb9] bg-[#fdf6d7] px-3 py-2 text-left text-xs leading-6 text-stone-700"
                >
                  {fragment.shared ? <span className="mr-2 inline-block border border-stone-300 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-stone-500">共享</span> : null}
                  {fragment.distilledContent}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <select
                value=""
                onChange={(event) => {
                  const fragmentId = Number(event.target.value);
                  if (fragmentId) {
                    void attachFragment(node.id, fragmentId);
                  }
                }}
                className="w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs"
              >
                <option value="">挂载碎片到该节点</option>
                {fragmentPool
                  .filter((fragment) => !node.fragments.some((item) => item.id === fragment.id))
                  .map((fragment) => (
                    <option key={fragment.id} value={fragment.id}>
                      {fragment.shared ? "[共享] " : ""}
                      {fragment.title ? `${fragment.title} · ` : ""}
                      {fragment.distilledContent.slice(0, 30)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
