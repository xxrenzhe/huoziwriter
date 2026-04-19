"use client";

import { useEffect, useState } from "react";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";

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

const auditSummaryCardMeta = [
  {
    label: "当前日志",
    note: "默认回看最近 120 条操作，用于追踪后台治理和关键业务动作。",
  },
  {
    label: "24 小时内",
    note: "用于快速判断今天是否有高频配置变更、重编译或分发动作。",
  },
  {
    label: "操作人",
    note: "区分运营后台账号与实际发起用户，避免把业务数据和系统审计混在一起。",
  },
] as const;

const auditTableHeaders = ["时间", "操作人", "动作", "目标类型", "目标 ID", "载荷摘要"] as const;
const adminAuditSummaryCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceAlt p-5 text-adminInk shadow-none");
const adminAuditPanelClassName = cn(uiPrimitives.adminPanel, "overflow-hidden");
const adminAuditFilterGridClassName = "grid gap-3 border-b border-adminLineStrong p-5 md:grid-cols-[minmax(0,1fr)_200px_200px]";
const adminAuditFilterControlClassName = "w-full";
const adminAuditTableShellClassName = "hidden overflow-x-auto md:block";
const adminAuditMobileListClassName = "grid gap-3 p-4 md:hidden";
const adminAuditMobileItemBaseClassName = cn(
  surfaceCardStyles(),
  "w-full border-adminLineStrong bg-adminBg p-4 text-left text-adminInk shadow-none transition-colors",
);
const adminAuditDetailPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminBg p-5 text-adminInk shadow-none");
const adminAuditDetailCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceAlt p-4 text-adminInk shadow-none");

function formatPayload(payload: Record<string, unknown> | null) {
  if (!payload) {
    return "无附加载荷";
  }
  return JSON.stringify(payload, null, 2);
}

function formatPayloadSummary(payload: Record<string, unknown> | null) {
  if (!payload) {
    return "无";
  }
  return JSON.stringify(payload).slice(0, 120);
}

function formatAuditOperator(log: AuditLogItem) {
  return log.username || (log.userId ? `user#${log.userId}` : "system");
}

function formatAuditDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function getAuditTableRowClassName(active: boolean) {
  return cn(
    "cursor-pointer border-t border-adminLineStrong transition-colors",
    active ? "bg-adminSurfaceAlt" : "hover:bg-adminSurfaceAlt/60",
  );
}

function getAuditMobileItemClassName(active: boolean) {
  return cn(
    adminAuditMobileItemBaseClassName,
    active ? "border-adminLineStrong bg-adminSurfaceAlt" : "hover:border-adminLineStrong hover:bg-adminSurfaceAlt",
  );
}

export function AdminAuditClient({
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
        const response = await fetch(`/api/admin/audit-logs?${search.toString()}`);
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
  const summaryCards = [
    { ...auditSummaryCardMeta[0], value: String(logs.length) },
    { ...auditSummaryCardMeta[1], value: String(recentCount) },
    { ...auditSummaryCardMeta[2], value: String(uniqueOperators) },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <article key={card.label} className={adminAuditSummaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">{card.label}</div>
            <div className="mt-3 font-serifCn text-4xl text-adminInk text-balance">{card.value}</div>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_380px]">
        <div className={adminAuditPanelClassName}>
          <div className={adminAuditFilterGridClassName}>
            <input
              aria-label="搜索 action / target / payload / 用户名"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 action / target / payload / 用户名"
              className={cn(uiPrimitives.adminInput, adminAuditFilterControlClassName)}
            />
            <select
              aria-label="select control"
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className={cn(uiPrimitives.adminSelect, adminAuditFilterControlClassName)}
            >
              <option value="">全部动作</option>
              {actions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="select control"
              value={targetType}
              onChange={(event) => setTargetType(event.target.value)}
              className={cn(uiPrimitives.adminSelect, adminAuditFilterControlClassName)}
            >
              <option value="">全部目标</option>
              {targetTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          {!loading && logs.length === 0 ? (
            <div className="p-6 text-sm text-adminInkMuted">当前筛选条件下没有审计记录。</div>
          ) : (
            <>
              <div className={adminAuditMobileListClassName}>
                {logs.map((log) => {
                  const active = selectedId === log.id;
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedId(log.id)}
                      aria-pressed={active}
                      className={getAuditMobileItemClassName(active)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs uppercase tracking-[0.22em] text-adminInkMuted">{log.action}</div>
                          <div className="mt-2 text-sm leading-7 text-adminInk">{formatAuditOperator(log)}</div>
                        </div>
                        <div className="shrink-0 font-mono text-[11px] text-adminInkMuted">{log.targetId || "-"}</div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs leading-6 text-adminInkMuted">
                        <div>{formatAuditDateTime(log.createdAt)}</div>
                        <div>{log.targetType}</div>
                        <div>{formatPayloadSummary(log.payload)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className={adminAuditTableShellClassName}>
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-adminBg text-adminInkMuted">
                    <tr>
                      {auditTableHeaders.map((head) => (
                        <th key={head} className="px-6 py-4 font-medium">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedId(log.id)}
                        className={getAuditTableRowClassName(selectedId === log.id)}
                      >
                        <td className="px-6 py-4 text-adminInkSoft">{formatAuditDateTime(log.createdAt)}</td>
                        <td className="px-6 py-4 text-adminInkSoft">{formatAuditOperator(log)}</td>
                        <td className="px-6 py-4 text-adminInk">{log.action}</td>
                        <td className="px-6 py-4 text-adminInkSoft">{log.targetType}</td>
                        <td className="px-6 py-4 font-mono text-xs text-adminInkMuted">{log.targetId || "-"}</td>
                        <td className="px-6 py-4 text-xs leading-6 text-adminInkMuted">{formatPayloadSummary(log.payload)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {loading ? <div className="border-t border-adminLineStrong p-4 text-sm text-adminInkMuted">正在刷新审计日志…</div> : null}
        </div>

        <aside className={adminAuditDetailPanelClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Audit Detail</div>
          <h2 className="mt-4 font-serifCn text-3xl text-adminInk text-balance">操作回放</h2>
          <p className="mt-4 text-sm leading-7 text-adminInkSoft">
            这里展示每条关键动作的目标对象和载荷快照，便于排查是谁改了配置、谁触发了重编译，以及业务动作是否走到真实链路。
          </p>
          {selected ? (
            <div className="mt-6 space-y-4">
              <div className={adminAuditDetailCardClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-adminInkMuted">Action</div>
                <div className="mt-2 text-lg text-adminInk">{selected.action}</div>
                <div className="mt-3 text-sm leading-7 text-adminInkSoft">
                  {formatAuditOperator(selected)} · {formatAuditDateTime(selected.createdAt)}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className={adminAuditDetailCardClassName}>
                  <div className="text-xs uppercase tracking-[0.2em] text-adminInkMuted">Target</div>
                  <div className="mt-2 text-sm leading-7 text-adminInk">{selected.targetType}</div>
                  <div className="mt-1 font-mono text-xs text-adminInkMuted">{selected.targetId || "-"}</div>
                </div>
                <div className={adminAuditDetailCardClassName}>
                  <div className="text-xs uppercase tracking-[0.2em] text-adminInkMuted">Operator</div>
                  <div className="mt-2 text-sm leading-7 text-adminInk">{selected.username || "system"}</div>
                  <div className="mt-1 font-mono text-xs text-adminInkMuted">{selected.userId ?? "-"}</div>
                </div>
              </div>
              <div className={adminAuditDetailCardClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-adminInkMuted">Payload</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-adminInkSoft">{formatPayload(selected.payload)}</pre>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-adminInkMuted">选择左侧一条审计记录查看详情。</div>
          )}
        </aside>
      </section>
    </div>
  );
}
