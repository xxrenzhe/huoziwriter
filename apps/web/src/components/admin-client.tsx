"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { uiPrimitives } from "@huoziwriter/ui";

export function AdminUsersClient({
  users,
  initialPasswordHint,
}: {
  users: Array<{
    id: number;
    username: string;
    referralCode: string;
    referredByUsername: string | null;
    role: string;
    planCode: string;
    isActive: boolean;
    lastLoginAt: string | null;
  }>;
  initialPasswordHint: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [planCode, setPlanCode] = useState("free");
  const [referralCode, setReferralCode] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, displayName, planCode, referralCode }),
    });
    setUsername("");
    setEmail("");
    setDisplayName("");
    setReferralCode("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className={`grid gap-3 p-5 md:grid-cols-5 ${uiPrimitives.adminPanel}`}>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" className={uiPrimitives.adminInput} />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" className={uiPrimitives.adminInput} />
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名" className={uiPrimitives.adminInput} />
        <input value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="推荐码，可选" className={uiPrimitives.adminInput} />
        <select value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={uiPrimitives.adminSelect}>
          <option value="free">游墨</option>
          <option value="pro">执毫</option>
          <option value="ultra">藏锋</option>
        </select>
        <div className="md:col-span-5 text-xs leading-6 text-stone-500">
          {initialPasswordHint}
        </div>
        <button className={`md:col-span-5 ${uiPrimitives.primaryButton}`}>创建用户</button>
      </form>
      <div className={`overflow-x-auto ${uiPrimitives.adminPanel}`}>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-stone-950 text-stone-500">
            <tr>
              {["用户名", "推荐码", "归因来源", "角色", "套餐", "状态", "最近登录", "操作"].map((head) => (
                <th key={head} className="px-6 py-4 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <AdminUserRow key={user.id} user={user} onUpdated={() => router.refresh()} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminUserRow({
  user,
  onUpdated,
}: {
  user: {
    id: number;
    username: string;
    referralCode: string;
    referredByUsername: string | null;
    role: string;
    planCode: string;
    isActive: boolean;
    lastLoginAt: string | null;
  };
  onUpdated: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [planCode, setPlanCode] = useState(user.planCode);
  const [isActive, setIsActive] = useState(user.isActive);

  async function handleSave() {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, planCode, isActive, mustChangePassword: false }),
    });
    onUpdated();
  }

  return (
    <tr className="border-t border-stone-800">
      <td className="px-6 py-4 text-stone-100">{user.username}</td>
      <td className="px-6 py-4 font-mono text-xs text-stone-400">{user.referralCode}</td>
      <td className="px-6 py-4 text-stone-400">{user.referredByUsername ?? "未归因"}</td>
      <td className="px-6 py-4 text-stone-400">
        <select value={role} onChange={(event) => setRole(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-6 py-4 text-stone-400">
        <select value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          <option value="free">游墨</option>
          <option value="pro">执毫</option>
          <option value="ultra">藏锋</option>
        </select>
      </td>
      <td className="px-6 py-4">
        <button onClick={() => setIsActive((value) => !value)} className={isActive ? "text-emerald-400" : "text-cinnabar"}>
          {isActive ? "启用" : "停用"}
        </button>
      </td>
      <td className="px-6 py-4 text-stone-400">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("zh-CN") : "未登录"}</td>
      <td className="px-6 py-4">
        <button onClick={handleSave} className={uiPrimitives.adminSecondaryButton}>
          保存
        </button>
      </td>
    </tr>
  );
}

export function PromptManagerClient({
  prompts,
}: {
  prompts: Array<{ id: number; promptId: string; version: string; category: string; name: string; isActive: boolean; promptContent: string }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    promptId: "",
    version: "",
    category: "writing",
    name: "",
    filePath: "system:custom",
    functionName: "customPrompt",
    promptContent: "",
  });

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, isActive: true }),
    });
    router.refresh();
  }

  async function activate(promptId: string, version: string) {
    await fetch(`/api/admin/prompts/${promptId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className={`grid gap-3 p-5 ${uiPrimitives.adminPanel}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <input value={form.promptId} onChange={(e) => setForm((prev) => ({ ...prev, promptId: e.target.value }))} placeholder="promptId" className={uiPrimitives.adminInput} />
          <input value={form.version} onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))} placeholder="版本号" className={uiPrimitives.adminInput} />
          <input value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="分类" className={uiPrimitives.adminInput} />
          <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="名称" className={uiPrimitives.adminInput} />
        </div>
        <textarea value={form.promptContent} onChange={(e) => setForm((prev) => ({ ...prev, promptContent: e.target.value }))} placeholder="Prompt 内容" className={`min-h-[160px] ${uiPrimitives.adminInput}`} />
        <button className={uiPrimitives.primaryButton}>创建并激活版本</button>
      </form>
      <div className="space-y-3">
        {prompts.map((prompt) => (
          <div key={prompt.id} className={`${uiPrimitives.adminPanel} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-serifCn text-2xl text-stone-100">{prompt.name}</div>
                <div className="mt-2 text-sm text-stone-400">{prompt.promptId} · {prompt.version} · {prompt.category}</div>
              </div>
              <button onClick={() => activate(prompt.promptId, prompt.version)} className={uiPrimitives.adminSecondaryButton}>
                {prompt.isActive ? "当前生效" : "激活"}
              </button>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border border-stone-800 bg-stone-950 p-4 text-xs leading-6 text-stone-300">{prompt.promptContent}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RouteManagerClient({
  routes,
}: {
  routes: Array<{ sceneCode: string; primaryModel: string; fallbackModel: string | null; description: string | null }>;
}) {
  const router = useRouter();

  async function handleUpdate(sceneCode: string, primaryModel: string, fallbackModel: string | null, description: string | null) {
    await fetch("/api/admin/ai-routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneCode, primaryModel, fallbackModel, description }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {routes.map((route) => (
        <RouteRow key={route.sceneCode} route={route} onSave={handleUpdate} />
      ))}
    </div>
  );
}

export function AdminTopicSourcesClient({
  sources,
  recentRuns,
}: {
  sources: Array<{
    id: number;
    name: string;
    homepageUrl: string | null;
    sourceType: string;
    priority: number;
    isActive: boolean;
    lastFetchedAt: string | null;
    recentFailureCount: number;
    latestFailure: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  recentRuns: Array<{
    id: number;
    syncWindowStart: string;
    syncWindowLabel: string;
    status: string;
    scheduledSourceCount: number;
    enqueuedJobCount: number;
    completedSourceCount: number;
    failedSourceCount: number;
    insertedItemCount: number;
    lastError: string | null;
    triggeredAt: string;
    finishedAt: string | null;
  }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [sourceType, setSourceType] = useState("news");
  const [priority, setPriority] = useState("100");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<number | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/topic-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, homepageUrl, sourceType, priority: Number(priority || 100) }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "创建系统信息源失败");
        return;
      }
      setName("");
      setHomepageUrl("");
      setSourceType("news");
      setPriority("100");
      setMessage("系统默认信息源已创建，并已尝试同步热点。");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function updateSource(sourceId: number, payload: { isActive?: boolean; sourceType?: string; priority?: number }) {
    setTogglingId(sourceId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/topic-sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "更新系统信息源失败");
        return;
      }
      setMessage("系统信息源已更新。");
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  }

  async function runTopicSync() {
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/topic-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitPerSource: 4 }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "手动触发热点同步失败");
        return;
      }
      const failedSourceCount = Number(json.data?.failedSourceCount ?? 0);
      setMessage(
        failedSourceCount > 0
          ? `已触发一轮全局热点同步，扫描 ${json.data?.scheduledSourceCount ?? 0} 个系统源，成功 ${json.data?.completedSourceCount ?? 0} 个，失败 ${failedSourceCount} 个，新增 ${json.data?.inserted ?? 0} 条热点。`
          : `已触发一轮全局热点同步，本轮扫描 ${json.data?.scheduledSourceCount ?? 0} 个系统源，新增 ${json.data?.inserted ?? 0} 条热点。`,
      );
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function runSourceSync(sourceId: number) {
    setSyncingSourceId(sourceId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/topic-sources/${sourceId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitPerSource: 4 }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "单个系统源重抓失败");
        return;
      }
      setMessage(
        Number(json.data?.failedSourceCount ?? 0) > 0
          ? `系统源「${json.data?.sourceName || sourceId}」重抓失败，已写入失败窗口与队列记录。`
          : `已重抓系统源「${json.data?.sourceName || sourceId}」，新增 ${json.data?.inserted ?? 0} 条热点。`,
      );
      router.refresh();
    } finally {
      setSyncingSourceId(null);
    }
  }

  async function retrySyncRun(runId: number) {
    setRetryingRunId(runId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/topic-sync/${runId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitPerSource: 4 }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMessage(json.error || "失败窗口重试失败");
        return;
      }
      const failedSourceCount = Number(json.data?.failedSourceCount ?? 0);
      setMessage(
        failedSourceCount > 0
          ? `已重试同步窗口 #${runId}，重跑 ${json.data?.retriedSourceCount ?? 0} 个失败源，成功 ${json.data?.completedSourceCount ?? 0} 个，仍失败 ${failedSourceCount} 个，新增 ${json.data?.inserted ?? 0} 条热点。`
          : `已重试同步窗口 #${runId}，重跑 ${json.data?.retriedSourceCount ?? 0} 个失败源，新增 ${json.data?.inserted ?? 0} 条热点。`,
      );
      router.refresh();
    } finally {
      setRetryingRunId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm leading-7 text-stone-400">
          需要临时补抓一轮时，可直接手动触发全局同步，不必等待 06:00 / 18:00 主窗口或 06:15 / 06:45 / 18:15 / 18:45 补偿窗口。
        </div>
        <button onClick={runTopicSync} disabled={syncing} className={uiPrimitives.primaryButton}>
          {syncing ? "同步中..." : "立即同步热点"}
        </button>
      </div>
      <form onSubmit={handleSubmit} className={`grid gap-3 p-5 md:grid-cols-[200px_minmax(0,1fr)_140px_120px_160px] ${uiPrimitives.adminPanel}`}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="系统源名称" className={uiPrimitives.adminInput} />
        <input value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} placeholder="https://example.com 或 RSS 地址" className={uiPrimitives.adminInput} />
        <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className={uiPrimitives.adminSelect}>
          <option value="youtube">YouTube</option>
          <option value="reddit">Reddit</option>
          <option value="podcast">Podcast</option>
          <option value="spotify">Spotify</option>
          <option value="news">News</option>
          <option value="blog">Blog</option>
          <option value="rss">RSS</option>
        </select>
        <input value={priority} onChange={(event) => setPriority(event.target.value)} placeholder="优先级" className={uiPrimitives.adminInput} />
        <button disabled={submitting} className={uiPrimitives.primaryButton}>
          {submitting ? "创建中..." : "新增系统源"}
        </button>
      </form>
      <div className="space-y-3">
        {sources.map((source) => (
          <div key={source.id} className={`${uiPrimitives.adminPanel} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">System Source</div>
                <div className="mt-2 font-serifCn text-2xl text-stone-100">{source.name}</div>
                <div className="mt-2 text-sm text-stone-400">{source.homepageUrl || "未配置主页地址"}</div>
                <div className="mt-3 text-xs text-stone-500">
                  创建于 {new Date(source.createdAt).toLocaleString("zh-CN")} · 最近更新 {new Date(source.updatedAt).toLocaleString("zh-CN")}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="border border-stone-700 bg-stone-950 px-2 py-1 text-stone-300">
                    类型 {source.sourceType}
                  </span>
                  <span className="border border-stone-700 bg-stone-950 px-2 py-1 text-stone-300">
                    优先级 {source.priority}
                  </span>
                  <span className="border border-stone-700 bg-stone-950 px-2 py-1 text-stone-300">
                    {source.lastFetchedAt ? `最近采集 ${new Date(source.lastFetchedAt).toLocaleString("zh-CN")}` : "尚未采集"}
                  </span>
                  <span className={`border px-2 py-1 ${source.recentFailureCount > 0 ? "border-[#8f3136] bg-[#2a1718] text-[#efb5b9]" : "border-stone-700 bg-stone-950 text-stone-300"}`}>
                    最近失败 {source.recentFailureCount} 次
                  </span>
                </div>
                {source.latestFailure ? (
                  <div className="mt-3 border border-[#8f3136] bg-[#2a1718] px-3 py-3 text-xs leading-6 text-[#efb5b9]">
                    最近错误：{source.latestFailure}
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-stone-500">
                  {source.isActive ? "当前已启用，会参与下一轮热点采集。" : "当前已停用，不再参与后续热点采集。"}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <select
                  defaultValue={source.sourceType}
                  onChange={(event) => updateSource(source.id, { sourceType: event.target.value })}
                  disabled={togglingId === source.id}
                  className={uiPrimitives.adminCompactSelect}
                >
                  <option value="youtube">YouTube</option>
                  <option value="reddit">Reddit</option>
                  <option value="podcast">Podcast</option>
                  <option value="spotify">Spotify</option>
                  <option value="news">News</option>
                  <option value="blog">Blog</option>
                  <option value="rss">RSS</option>
                </select>
                <button
                  onClick={() => {
                    const next = window.prompt("设置优先级（0-999）", String(source.priority));
                    if (next == null) return;
                    updateSource(source.id, { priority: Number(next) });
                  }}
                  disabled={togglingId === source.id}
                  className={uiPrimitives.adminSecondaryButton}
                >
                  调整优先级
                </button>
                <button
                  onClick={() => runSourceSync(source.id)}
                  disabled={syncingSourceId === source.id || togglingId === source.id}
                  className={uiPrimitives.adminSecondaryButton}
                >
                  {syncingSourceId === source.id ? "重抓中..." : "重抓该信源"}
                </button>
                <button
                  onClick={() => updateSource(source.id, { isActive: !source.isActive })}
                  disabled={togglingId === source.id}
                  className={uiPrimitives.adminSecondaryButton}
                >
                  {togglingId === source.id ? "处理中..." : source.isActive ? "停用" : "启用"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-stone-800 pt-6">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Topic Sync Runs</div>
        <div className="mt-3 text-sm leading-7 text-stone-400">
          这里记录北京时间 06:00 / 18:00 主窗口，以及 06:15 / 06:45 / 18:15 / 18:45 补偿窗口内的热点抓取执行结果；若窗口内存在失败源，可直接发起补偿重试。
        </div>
        <div className="mt-4 grid gap-3">
          {recentRuns.length === 0 ? (
            <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">当前还没有热点调度窗口执行记录。</div>
          ) : (
            recentRuns.map((run) => {
              const canRetry = ["failed", "partial_failed"].includes(run.status) && run.failedSourceCount > 0;
              return (
                <div key={run.id} className={`${uiPrimitives.adminPanel} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-stone-100">{run.syncWindowLabel}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        窗口开始：{new Date(run.syncWindowStart).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className={run.status === "completed" ? "text-emerald-400" : run.status === "partial_failed" ? "text-amber-300" : "text-cinnabar"}>
                        {run.status}
                      </div>
                      {canRetry ? (
                        <button
                          onClick={() => retrySyncRun(run.id)}
                          disabled={retryingRunId !== null}
                          className={uiPrimitives.adminSecondaryButton}
                        >
                          {retryingRunId === run.id ? "重试中..." : "重试失败源"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-400">
                    <span className="border border-stone-800 bg-[#171718] px-3 py-1">应抓取 {run.scheduledSourceCount}</span>
                    <span className="border border-stone-800 bg-[#171718] px-3 py-1">已入队 {run.enqueuedJobCount}</span>
                    <span className="border border-stone-800 bg-[#171718] px-3 py-1">成功 {run.completedSourceCount}</span>
                    <span className="border border-stone-800 bg-[#171718] px-3 py-1">失败 {run.failedSourceCount}</span>
                    <span className="border border-stone-800 bg-[#171718] px-3 py-1">新增热点 {run.insertedItemCount}</span>
                  </div>
                  <div className="mt-3 text-xs leading-6 text-stone-500">
                    触发：{new Date(run.triggeredAt).toLocaleString("zh-CN")}
                    {run.finishedAt ? ` · 完成：${new Date(run.finishedAt).toLocaleString("zh-CN")}` : " · 尚未完成"}
                  </div>
                  {run.lastError ? (
                    <div className="mt-3 border border-[#5c2b2f] bg-[#2b1618] px-3 py-3 text-xs leading-6 text-[#f3b5bc]">
                      最近错误：{run.lastError}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}

export function AdminFinanceClient({
  plans,
  subscriptions,
}: {
  plans: Array<{
    code: string;
    name: string;
    priceCny: number;
    dailyGenerationLimit: number | null;
    fragmentLimit: number | null;
    customBannedWordLimit: number | null;
    maxWechatConnections: number | null;
    canForkGenomes: boolean;
    canPublishGenomes: boolean;
    canGenerateCoverImage: boolean;
    canExportPdf: boolean;
    isPublic: boolean;
  }>;
  subscriptions: Array<{ id: number | null; userId: number; username: string; displayName: string | null; planCode: string; planName: string | null; status: string; startAt: string | null; endAt: string | null }>;
}) {
  const router = useRouter();
  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    priceCny: "0",
    dailyGenerationLimit: "",
    fragmentLimit: "",
    customBannedWordLimit: "",
    maxWechatConnections: "",
    canForkGenomes: false,
    canPublishGenomes: false,
    canGenerateCoverImage: false,
    canExportPdf: false,
    isPublic: false,
  });

  async function handleCreatePlan(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: planForm.code,
        name: planForm.name,
        priceCny: Number(planForm.priceCny || 0),
        dailyGenerationLimit: planForm.dailyGenerationLimit ? Number(planForm.dailyGenerationLimit) : null,
        fragmentLimit: planForm.fragmentLimit ? Number(planForm.fragmentLimit) : null,
        customBannedWordLimit: planForm.customBannedWordLimit ? Number(planForm.customBannedWordLimit) : null,
        maxWechatConnections: planForm.maxWechatConnections ? Number(planForm.maxWechatConnections) : 0,
        canForkGenomes: planForm.canForkGenomes,
        canPublishGenomes: planForm.canPublishGenomes,
        canGenerateCoverImage: planForm.canGenerateCoverImage,
        canExportPdf: planForm.canExportPdf,
        isPublic: planForm.isPublic,
      }),
    });
    setPlanForm({
      code: "",
      name: "",
      priceCny: "0",
      dailyGenerationLimit: "",
      fragmentLimit: "",
      customBannedWordLimit: "",
      maxWechatConnections: "",
      canForkGenomes: false,
      canPublishGenomes: false,
      canGenerateCoverImage: false,
      canExportPdf: false,
      isPublic: false,
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreatePlan} className={`grid gap-3 p-5 md:grid-cols-3 ${uiPrimitives.adminPanel}`}>
        <input value={planForm.code} onChange={(event) => setPlanForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="套餐 code" className={uiPrimitives.adminInput} />
        <input value={planForm.name} onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="套餐名称" className={uiPrimitives.adminInput} />
        <input value={planForm.priceCny} onChange={(event) => setPlanForm((prev) => ({ ...prev, priceCny: event.target.value }))} placeholder="价格" className={uiPrimitives.adminInput} />
        <input value={planForm.dailyGenerationLimit} onChange={(event) => setPlanForm((prev) => ({ ...prev, dailyGenerationLimit: event.target.value }))} placeholder="每日生成次数" className={uiPrimitives.adminInput} />
        <input value={planForm.fragmentLimit} onChange={(event) => setPlanForm((prev) => ({ ...prev, fragmentLimit: event.target.value }))} placeholder="碎片上限" className={uiPrimitives.adminInput} />
        <input value={planForm.customBannedWordLimit} onChange={(event) => setPlanForm((prev) => ({ ...prev, customBannedWordLimit: event.target.value }))} placeholder="自定义死刑词上限" className={uiPrimitives.adminInput} />
        <input value={planForm.maxWechatConnections} onChange={(event) => setPlanForm((prev) => ({ ...prev, maxWechatConnections: event.target.value }))} placeholder="公众号连接上限" className={uiPrimitives.adminInput} />
        <label className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">
          <input type="checkbox" checked={planForm.canForkGenomes} onChange={(event) => setPlanForm((prev) => ({ ...prev, canForkGenomes: event.target.checked }))} />
          允许 Fork 基因
        </label>
        <label className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">
          <input type="checkbox" checked={planForm.canPublishGenomes} onChange={(event) => setPlanForm((prev) => ({ ...prev, canPublishGenomes: event.target.checked }))} />
          允许发布基因
        </label>
        <label className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">
          <input type="checkbox" checked={planForm.canGenerateCoverImage} onChange={(event) => setPlanForm((prev) => ({ ...prev, canGenerateCoverImage: event.target.checked }))} />
          允许封面图生成
        </label>
        <label className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">
          <input type="checkbox" checked={planForm.canExportPdf} onChange={(event) => setPlanForm((prev) => ({ ...prev, canExportPdf: event.target.checked }))} />
          允许 PDF 导出
        </label>
        <label className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">
          <input type="checkbox" checked={planForm.isPublic} onChange={(event) => setPlanForm((prev) => ({ ...prev, isPublic: event.target.checked }))} />
          公开展示到定价页
        </label>
        <button className={`md:col-span-3 ${uiPrimitives.primaryButton}`}>创建套餐</button>
      </form>
      <section className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            key={plan.code}
            className={`border p-6 ${plan.code === "pro" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-800 bg-[#171718] text-stone-100"}`}
          >
            <div className="text-xs uppercase tracking-[0.24em] opacity-70">Plan</div>
            <h1 className="mt-4 font-serifCn text-3xl">{plan.name}</h1>
            <div className="mt-4 text-3xl">￥{plan.priceCny}</div>
            <p className="mt-4 text-sm leading-7 opacity-80">
              每日生成：{plan.dailyGenerationLimit ?? "不限"}<br />
              碎片上限：{plan.fragmentLimit ?? "不限"}<br />
              自定义死刑词：{plan.customBannedWordLimit ?? "不限"}<br />
              公众号连接：{plan.maxWechatConnections ?? "不限"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs opacity-85">
              {plan.canForkGenomes ? <span className="border px-2 py-1">Fork</span> : null}
              {plan.canPublishGenomes ? <span className="border px-2 py-1">Publish</span> : null}
              {plan.canGenerateCoverImage ? <span className="border px-2 py-1">Cover</span> : null}
              {plan.canExportPdf ? <span className="border px-2 py-1">PDF</span> : null}
              {plan.isPublic ? <span className="border px-2 py-1">Public</span> : <span className="border px-2 py-1 opacity-60">Private</span>}
            </div>
          </article>
        ))}
      </section>
      <div className={`overflow-x-auto ${uiPrimitives.adminPanel}`}>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-stone-950 text-stone-500">
            <tr>
              {["用户", "当前套餐", "订阅状态", "开始时间", "结束时间", "操作"].map((head) => (
                <th key={head} className="px-6 py-4 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <SubscriptionRow key={subscription.id} subscription={subscription} plans={plans} onUpdated={() => router.refresh()} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubscriptionRow({
  subscription,
  plans,
  onUpdated,
}: {
  subscription: { id: number | null; userId: number; username: string; displayName: string | null; planCode: string; planName: string | null; status: string; startAt: string | null; endAt: string | null };
  plans: Array<{ code: string; name: string }>;
  onUpdated: () => void;
}) {
  const [planCode, setPlanCode] = useState(subscription.planCode);
  const [status, setStatus] = useState(subscription.status);
  const [endAt, setEndAt] = useState(subscription.endAt ? subscription.endAt.slice(0, 10) : "");

  async function handleSave() {
    const payload = {
      planCode,
      status,
      endAt: endAt || null,
      isActive: status === "active",
      mustChangePassword: false,
      role: "user",
    };
    if (subscription.id) {
      await fetch(`/api/admin/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/admin/users/${subscription.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode,
          isActive: status === "active",
          mustChangePassword: false,
        }),
      });
    }
    onUpdated();
  }

  return (
    <tr className="border-t border-stone-800">
      <td className="px-6 py-4 text-stone-100">
        <div>{subscription.displayName || subscription.username}</div>
        <div className="mt-1 text-xs text-stone-500">{subscription.username}</div>
      </td>
      <td className="px-6 py-4 text-stone-400">
        <select value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          {plans.map((plan) => (
            <option key={plan.code} value={plan.code}>{plan.name}</option>
          ))}
        </select>
      </td>
      <td className="px-6 py-4 text-stone-400">
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="ended">ended</option>
        </select>
      </td>
      <td className="px-6 py-4 text-stone-400">{subscription.startAt ? new Date(subscription.startAt).toLocaleDateString("zh-CN") : "未记录"}</td>
      <td className="px-6 py-4 text-stone-400">
        <input type="date" value={endAt} onChange={(event) => setEndAt(event.target.value)} className={uiPrimitives.adminCompactSelect} />
      </td>
      <td className="px-6 py-4">
        <button onClick={handleSave} className={uiPrimitives.adminSecondaryButton}>保存</button>
      </td>
    </tr>
  );
}

function RouteRow({
  route,
  onSave,
}: {
  route: { sceneCode: string; primaryModel: string; fallbackModel: string | null; description: string | null };
  onSave: (sceneCode: string, primaryModel: string, fallbackModel: string | null, description: string | null) => Promise<void>;
}) {
  const [primaryModel, setPrimaryModel] = useState(route.primaryModel);
  const [fallbackModel, setFallbackModel] = useState(route.fallbackModel ?? "");
  const [description, setDescription] = useState(route.description ?? "");

  return (
    <div className={`grid gap-3 p-5 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px] ${uiPrimitives.adminPanel}`}>
      <div className="flex items-center text-sm text-stone-100">{route.sceneCode}</div>
      <input value={primaryModel} onChange={(event) => setPrimaryModel(event.target.value)} className={uiPrimitives.adminInput} />
      <input value={fallbackModel} onChange={(event) => setFallbackModel(event.target.value)} className={uiPrimitives.adminInput} />
      <input value={description} onChange={(event) => setDescription(event.target.value)} className={uiPrimitives.adminInput} />
      <button onClick={() => onSave(route.sceneCode, primaryModel, fallbackModel || null, description || null)} className={uiPrimitives.primaryButton}>保存</button>
    </div>
  );
}
