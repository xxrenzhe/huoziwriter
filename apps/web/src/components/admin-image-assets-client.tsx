"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminImageAssetMaintenance() {
  const router = useRouter();
  const [limit, setLimit] = useState("20");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    setMessage("");
    const response = await fetch("/api/admin/images/rebuild-derivatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: Number(limit || 20) }),
    });
    const json = await response.json().catch(() => null);
    setRunning(false);
    if (!response.ok || !json?.success) {
      setMessage(json?.error || "重建失败");
      return;
    }

    const data = json.data as {
      matchedCount: number;
      rebuiltCount: number;
      failureCount: number;
    };
    setMessage(`已扫描并命中 ${data.matchedCount} 条，成功重建 ${data.rebuiltCount} 条，失败 ${data.failureCount} 条。`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 border border-stone-800 bg-stone-950 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Image Maintenance</div>
      <div className="mt-2 text-sm leading-7 text-stone-300">
        对历史 `passthrough` / `passthrough-fallback` 资产执行一次重建，补齐真实压缩图和缩略图。单次建议先跑小批量。
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input aria-label="20"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          inputMode="numeric"
          className="w-24 border border-stone-700 bg-[#111214] px-3 py-2 text-sm text-stone-200"
          placeholder="20"
        />
        <button
          disabled={running}
          className="border border-cinnabar bg-cinnabar px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {running ? "重建中…" : "重建旧资产衍生"}
        </button>
      </div>
      {message ? (
        <div className={`mt-3 text-sm ${message.includes("失败") ? "text-cinnabar" : "text-stone-300"}`}>
          {message}
        </div>
      ) : null}
    </form>
  );
}
