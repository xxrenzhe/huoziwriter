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
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [savingNodeId, setSavingNodeId] = useState<number | null>(null);
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

  function beginEdit(node: NodeItem) {
    setEditingNodeId(node.id);
    setEditingTitle(node.title);
    setEditingDescription(node.description || "");
  }

  function cancelEdit() {
    setEditingNodeId(null);
    setEditingTitle("");
    setEditingDescription("");
  }

  async function saveNode(nodeId: number) {
    setSavingNodeId(nodeId);
    await fetch(`/api/documents/${documentId}/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editingTitle.trim() || "未命名节点",
        description: editingDescription.trim() || null,
      }),
    });
    cancelEdit();
    setSavingNodeId(null);
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
              <div className="flex items-center gap-3">
                <button onClick={() => beginEdit(node)} className="text-xs text-stone-500">
                  编辑
                </button>
                <button onClick={() => deleteNode(node.id)} className="text-xs text-stone-500">
                  删除
                </button>
              </div>
            </div>
            {editingNodeId === node.id ? (
              <div className="mt-3 space-y-2 border border-stone-300 bg-[#faf7f0] p-3">
                <input
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  className="w-full border border-stone-300 bg-white px-3 py-2 text-sm"
                />
                <textarea
                  value={editingDescription}
                  onChange={(event) => setEditingDescription(event.target.value)}
                  placeholder="补充这个节点要写的事实、判断或写作提醒"
                  className="min-h-[88px] w-full border border-stone-300 bg-white px-3 py-2 text-sm leading-7"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveNode(node.id)}
                    disabled={savingNodeId === node.id}
                    className="bg-cinnabar px-3 py-2 text-xs text-white disabled:opacity-60"
                  >
                    {savingNodeId === node.id ? "保存中..." : "保存节点"}
                  </button>
                  <button onClick={cancelEdit} className="border border-stone-300 px-3 py-2 text-xs text-stone-700">
                    取消
                  </button>
                </div>
              </div>
            ) : node.description ? (
              <div className="mt-3 border border-stone-200 bg-[#faf7f0] px-3 py-3 text-sm leading-7 text-stone-700">
                {node.description}
              </div>
            ) : (
              <div className="mt-3 border border-dashed border-stone-200 px-3 py-3 text-sm leading-7 text-stone-500">
                这个节点还没有写作说明。点击“编辑”补充这一段应该承接的事实和判断。
              </div>
            )}
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
