"use client";

import { useEffect, useState } from "react";

type AuditLogItem = {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

function formatPayload(payload: Record<string, unknown> | null) {
  if (!payload) {
    return "无附加载荷";
  }
  return JSON.stringify(payload, null, 2);
}

export function OpsAuditClient({
  initialLogs,
  actions,
  targetTypes,
}: {
  initialLogs: AuditLogItem[];
  actions: string[];
  targetTypes: string[];
}) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [logs, setLogs] = useState(initialLogs);
  const [selectedId, setSelectedId] = useState<number | null>(initialLogs[0]?.id ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const search = new URLSearchParams();
        if (query.trim()) search.set("query", query.trim());
        if (action) search.set("action", action);
        if (targetType) search.set("targetType", targetType);
        const response = await fetch(`/api/ops/audit-logs?${search.toString()}`);
        const json = await response.json();
        if (response.ok && json.success) {
          setLogs(json.data.logs);
          setSelectedId((current: number | null) => {
            if (json.data.logs.some((item: AuditLogItem) => item.id === current)) {
              return current;
            }
            return json.data.logs[0]?.id ?? null;
          });
        }
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query, action, targetType]);

  const selected = logs.find((item) => item.id === selectedId) ?? null;
  const recentCount = logs.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 24 * 60 * 60 * 1000).length;
  const uniqueOperators = new Set(logs.map((item) => item.username || `user#${item.userId ?? 0}`)).size;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["当前日志", String(logs.length), "默认回看最近 120 条操作，用于追踪后台治理和关键业务动作。"],
          ["24 小时内", String(recentCount), "用于快速判断今天是否有高频配置变更、重编译或分发动作。"],
          ["操作人", String(uniqueOperators), "区分运营后台账号与实际发起用户，避免把业务数据和系统审计混在一起。"],
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-800 bg-[#171718] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_380px]">
        <div className="border border-stone-800 bg-[#171718]">
          <div className="grid gap-3 border-b border-stone-800 p-5 md:grid-cols-[minmax(0,1fr)_200px_200px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 action / target / payload / 用户名"
              className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-100"
            />
            <select value={action} onChange={(event) => setAction(event.target.value)} className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-100">
              <option value="">全部动作</option>
              {actions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-100">
              <option value="">全部目标</option>
              {targetTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-950 text-stone-500">
                <tr>
                  {["时间", "操作人", "动作", "目标类型", "目标 ID", "载荷摘要"].map((head) => (
                    <th key={head} className="px-6 py-4 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedId(log.id)}
                    className={`cursor-pointer border-t border-stone-800 ${selectedId === log.id ? "bg-stone-900/80" : ""}`}
                  >
                    <td className="px-6 py-4 text-stone-400">{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="px-6 py-4 text-stone-400">{log.username || (log.userId ? `user#${log.userId}` : "system")}</td>
                    <td className="px-6 py-4 text-stone-100">{log.action}</td>
                    <td className="px-6 py-4 text-stone-400">{log.targetType}</td>
                    <td className="px-6 py-4 font-mono text-xs text-stone-500">{log.targetId || "-"}</td>
                    <td className="px-6 py-4 text-xs leading-6 text-stone-500">
                      {log.payload ? JSON.stringify(log.payload).slice(0, 120) : "无"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && logs.length === 0 ? (
              <div className="p-6 text-sm text-stone-500">当前筛选条件下没有审计记录。</div>
            ) : null}
            {loading ? <div className="border-t border-stone-800 p-4 text-sm text-stone-500">正在刷新审计日志...</div> : null}
          </div>
        </div>

        <aside className="border border-stone-800 bg-stone-950 p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">Audit Detail</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">操作回放</h2>
          <p className="mt-4 text-sm leading-7 text-stone-400">
            这里展示每条关键动作的目标对象和载荷快照，便于排查是谁改了配置、谁触发了重编译，以及业务动作是否走到真实链路。
          </p>
          {selected ? (
            <div className="mt-6 space-y-4">
              <div className="border border-stone-800 bg-[#151516] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Action</div>
                <div className="mt-2 text-lg text-stone-100">{selected.action}</div>
                <div className="mt-3 text-sm leading-7 text-stone-400">
                  {selected.username || (selected.userId ? `user#${selected.userId}` : "system")} · {new Date(selected.createdAt).toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="border border-stone-800 bg-[#151516] p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Target</div>
                  <div className="mt-2 text-sm leading-7 text-stone-300">{selected.targetType}</div>
                  <div className="mt-1 font-mono text-xs text-stone-500">{selected.targetId || "-"}</div>
                </div>
                <div className="border border-stone-800 bg-[#151516] p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Operator</div>
                  <div className="mt-2 text-sm leading-7 text-stone-300">{selected.username || "system"}</div>
                  <div className="mt-1 font-mono text-xs text-stone-500">{selected.userId ?? "-"}</div>
                </div>
              </div>
              <div className="border border-stone-800 bg-[#151516] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Payload</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-stone-300">{formatPayload(selected.payload)}</pre>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-stone-500">选择左侧一条审计记录查看详情。</div>
          )}
        </aside>
      </section>
    </div>
  );
}
