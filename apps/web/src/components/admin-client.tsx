"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, uiPrimitives } from "@huoziwriter/ui";
import type { ResolvedPlanFeatureSnapshot } from "@/lib/plan-entitlements";
import { MANAGED_PLAN_OPTIONS } from "@/lib/plan-labels";
import { PLAN17_PROMPT_SCENE_DEFINITIONS, getPlan17PromptSceneMeta } from "@/lib/writing-eval-plan17";

const adminMobileListClassName = "grid gap-3 md:hidden";
const adminMobileCardClassName = `${uiPrimitives.adminPanel} p-4`;
const adminMobileMetaLabelClassName = "text-xs uppercase tracking-[0.16em] text-adminInkSoft";
const adminMobileMetaValueClassName = "mt-1 text-sm text-adminInk";
const adminDarkSecondaryButtonClassName = "border-adminLineStrong bg-adminBg text-adminInk hover:border-adminLineStrong hover:bg-adminSurfaceAlt hover:text-adminInk focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg";
const adminDarkPrimaryButtonClassName = "focus-visible:ring-offset-adminBg";

type AdminUserSubscriptionHistoryItem = {
  id: number | null;
  planCode: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  source: string | null;
  updatedAt: string | null;
};

type AdminUserRecord = {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  role: string;
  planCode: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  articleCount: number;
  publishedArticleCount: number;
  totalUsage: number;
  lastUsageAt: string | null;
  subscriptionHistory: AdminUserSubscriptionHistoryItem[];
};

type AdminFinanceOverview = {
  activeSubscriptionCount: number;
  endingSoonCount: number;
  monthlyRevenueEstimate: number;
  planDistribution: Array<{
    planCode: string;
    planName: string;
    subscriberCount: number;
    sharePercent: number;
    revenueEstimate: number;
  }>;
  subscriptionTrend: Array<{
    monthKey: string;
    label: string;
    startedCount: number;
    endedCount: number;
  }>;
  usageTopUsers: Array<{
    userId: number;
    username: string;
    displayName: string | null;
    planCode: string;
    totalUsage: number;
    activeDays: number;
    lastUsageAt: string | null;
  }>;
};

function formatAdminDateTime(value: string | null, fallback = "未记录") {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toLocaleString("zh-CN");
}

function formatAdminDate(value: string | null, fallback = "未记录") {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toLocaleDateString("zh-CN");
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getManagedPlanLabel(planCode: string) {
  return MANAGED_PLAN_OPTIONS.find((option) => option.code === planCode)?.label ?? planCode;
}

function getSubscriptionStatusLabel(status: string) {
  if (status === "active") return "生效中";
  if (status === "ended") return "已结束";
  if (status === "inactive") return "未生效";
  return status;
}

function getSubscriptionStatusClassName(status: string) {
  if (status === "active") {
    return "border-emerald-900/60 bg-emerald-950/30 text-emerald-300";
  }
  if (status === "ended") {
    return "border-adminLineStrong bg-adminBg text-adminInkSoft";
  }
  return "border-warning/40 bg-surfaceWarm text-warning";
}

function formatPromptRolloutWindowLabel(observeOnly: boolean) {
  return observeOnly ? "观察优先" : "公开灰度";
}

function formatPromptResolutionReasonLabel(reason: string) {
  if (reason.startsWith("observe")) return "观察流量";
  if (reason.startsWith("plan:")) return `套餐白名单 ${reason.slice("plan:".length)}`;
  if (reason.startsWith("percentage:")) return `比例流量 ${reason.slice("percentage:".length)}%`;
  return "稳定流量";
}

export function AdminUsersClient({
  users,
  initialPasswordHint,
}: {
  users: AdminUserRecord[];
  initialPasswordHint: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [planCode, setPlanCode] = useState("free");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(users[0]?.id ?? null);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const activeUserCount = users.filter((user) => user.isActive).length;
  const totalArticleCount = users.reduce((sum, user) => sum + user.articleCount, 0);
  const totalPublishedArticleCount = users.reduce((sum, user) => sum + user.publishedArticleCount, 0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, displayName, planCode }),
    });
    setUsername("");
    setEmail("");
    setDisplayName("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className={`grid gap-3 p-5 md:grid-cols-5 ${uiPrimitives.adminPanel}`}>
        <input aria-label="用户名" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" className={uiPrimitives.adminInput} />
        <input aria-label="邮箱" type="email" inputMode="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" className={uiPrimitives.adminInput} />
        <input aria-label="显示名" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名" className={uiPrimitives.adminInput} />
        <select aria-label="select control" value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={uiPrimitives.adminSelect}>
          {MANAGED_PLAN_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
        <div className="md:col-span-5 text-xs leading-6 text-adminInkSoft">
          {initialPasswordHint}
        </div>
        <Button type="submit" variant="primary" className={`md:col-span-5 ${adminDarkPrimaryButtonClassName}`}>
          创建用户
        </Button>
      </form>
      <section className="grid gap-4 xl:grid-cols-4">
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">总用户</div>
          <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatCompactNumber(users.length)}</div>
        </article>
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">活跃账号</div>
          <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatCompactNumber(activeUserCount)}</div>
          <div className="mt-2 text-xs text-adminInkSoft">当前启用 {users.length > 0 ? `${Math.round((activeUserCount / users.length) * 100)}%` : "0%"}</div>
        </article>
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">文章总量</div>
          <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatCompactNumber(totalArticleCount)}</div>
          <div className="mt-2 text-xs text-adminInkSoft">已发布 {formatCompactNumber(totalPublishedArticleCount)}</div>
        </article>
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">最近选中</div>
          <div className="mt-3 truncate font-serifCn text-2xl text-adminInk">{selectedUser?.displayName || selectedUser?.username || "未选择"}</div>
          <div className="mt-2 text-xs text-adminInkSoft">
            最近登录 {selectedUser ? formatAdminDateTime(selectedUser.lastLoginAt, "未登录") : "未记录"}
          </div>
        </article>
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="lg:hidden">
            <AdminUserDetailPanel user={selectedUser} />
          </div>
          <div className={adminMobileListClassName}>
            {users.map((user) => (
              <AdminUserMobileCard
                key={user.id}
                user={user}
                isSelected={selectedUserId === user.id}
                onSelect={() => setSelectedUserId(user.id)}
                onUpdated={() => router.refresh()}
              />
            ))}
          </div>
          <div className={`hidden overflow-x-auto md:block ${uiPrimitives.adminPanel}`}>
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-adminBg text-adminInkSoft">
                <tr>
                  {["用户名", "角色", "套餐", "状态", "注册", "最近登录", "操作"].map((head) => (
                    <th key={head} className="px-6 py-4 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <AdminUserRow
                    key={user.id}
                    user={user}
                    isSelected={selectedUserId === user.id}
                    onSelect={() => setSelectedUserId(user.id)}
                    onUpdated={() => router.refresh()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <AdminUserDetailPanel user={selectedUser} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function AdminUserRow({
  user,
  isSelected,
  onSelect,
  onUpdated,
}: {
  user: AdminUserRecord;
  isSelected: boolean;
  onSelect: () => void;
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
    <tr className={`border-t border-adminLineStrong ${isSelected ? "bg-adminSurfaceAlt/70" : ""}`}>
      <td className="px-6 py-4 text-adminInk">
        <button
          type="button"
          onClick={onSelect}
          className="text-left transition hover:text-cinnabar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adminAccent focus-visible:ring-offset-2 focus-visible:ring-offset-adminBg"
        >
          <div className="font-medium">{user.displayName || user.username}</div>
          <div className="mt-1 text-xs text-adminInkSoft">{user.username}</div>
        </button>
      </td>
      <td className="px-6 py-4 text-adminInkSoft">
        <select aria-label="select control" value={role} onChange={(event) => setRole(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-6 py-4 text-adminInkSoft">
        <select aria-label="select control" value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          {MANAGED_PLAN_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      </td>
      <td className="px-6 py-4">
        <Button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          variant="secondary"
          size="sm"
          className={adminDarkSecondaryButtonClassName}
        >
          {isActive ? "停用" : "启用"}
        </Button>
      </td>
      <td className="px-6 py-4 text-adminInkSoft">{formatAdminDate(user.createdAt)}</td>
      <td className="px-6 py-4 text-adminInkSoft">{formatAdminDateTime(user.lastLoginAt, "未登录")}</td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onSelect}
            variant="secondary"
            size="sm"
            className={adminDarkSecondaryButtonClassName}
          >
            详情
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            variant="secondary"
            size="sm"
            className={adminDarkSecondaryButtonClassName}
          >
            保存
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AdminUserMobileCard({
  user,
  isSelected,
  onSelect,
  onUpdated,
}: {
  user: AdminUserRecord;
  isSelected: boolean;
  onSelect: () => void;
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
    <article className={`${adminMobileCardClassName} ${isSelected ? "border-cinnabar/50" : ""}`}>
      <div>
        <div className="text-base text-adminInk">{user.displayName || user.username}</div>
        <div className="mt-1 text-xs text-adminInkSoft">{user.username}</div>
        <div className="mt-1 text-xs text-adminInkSoft">
          最近登录：{formatAdminDateTime(user.lastLoginAt, "未登录")}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className={adminMobileMetaLabelClassName}>角色</div>
          <select aria-label="select control" value={role} onChange={(event) => setRole(event.target.value)} className={`mt-2 w-full ${uiPrimitives.adminCompactSelect}`}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="block">
          <div className={adminMobileMetaLabelClassName}>套餐</div>
          <select aria-label="select control" value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={`mt-2 w-full ${uiPrimitives.adminCompactSelect}`}>
            {MANAGED_PLAN_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className={adminMobileMetaLabelClassName}>状态</div>
          <div className={adminMobileMetaValueClassName}>{isActive ? "启用" : "停用"}</div>
        </div>
        <Button
          type="button"
          onClick={() => setIsActive((value) => !value)}
          variant="secondary"
          size="sm"
          className={adminDarkSecondaryButtonClassName}
        >
          切换状态
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className={adminMobileMetaLabelClassName}>注册时间</div>
          <div className={adminMobileMetaValueClassName}>{formatAdminDate(user.createdAt)}</div>
        </div>
        <div>
          <div className={adminMobileMetaLabelClassName}>文章 / 发布</div>
          <div className={adminMobileMetaValueClassName}>
            {formatCompactNumber(user.articleCount)} / {formatCompactNumber(user.publishedArticleCount)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onSelect} variant="secondary" size="sm" className={adminDarkSecondaryButtonClassName}>
          查看详情
        </Button>
        <Button type="button" onClick={handleSave} variant="secondary" size="sm" className={adminDarkSecondaryButtonClassName}>
          保存用户设置
        </Button>
      </div>
    </article>
  );
}

function AdminUserDetailPanel({ user }: { user: AdminUserRecord | null }) {
  if (!user) {
    return (
      <section className={`${uiPrimitives.adminPanel} p-5 text-sm text-adminInkSoft`}>
        选择用户后，可在这里查看订阅历史、文章数、最近登录和用量概况。
      </section>
    );
  }

  return (
    <section className={`${uiPrimitives.adminPanel} space-y-5 p-5`}>
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">User Detail</div>
        <div className="mt-3 text-2xl text-adminInk">{user.displayName || user.username}</div>
        <div className="mt-1 text-sm text-adminInkSoft">{user.email || user.username}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="border border-adminLineStrong bg-adminBg px-2 py-1 text-xs text-adminInkSoft">{user.role}</span>
          <span className="border border-adminLineStrong bg-adminBg px-2 py-1 text-xs text-adminInkSoft">{getManagedPlanLabel(user.planCode)}</span>
          <span className={`border px-2 py-1 text-xs ${user.isActive ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300" : "border-warning/40 bg-surfaceWarm text-warning"}`}>
            {user.isActive ? "启用中" : "停用"}
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="border border-adminLineStrong bg-adminBg p-4">
          <div className={adminMobileMetaLabelClassName}>文章数</div>
          <div className="mt-2 text-2xl text-adminInk">{formatCompactNumber(user.articleCount)}</div>
          <div className="mt-1 text-xs text-adminInkSoft">已发布 {formatCompactNumber(user.publishedArticleCount)}</div>
        </article>
        <article className="border border-adminLineStrong bg-adminBg p-4">
          <div className={adminMobileMetaLabelClassName}>累计用量</div>
          <div className="mt-2 text-2xl text-adminInk">{formatCompactNumber(user.totalUsage)}</div>
          <div className="mt-1 text-xs text-adminInkSoft">最近使用 {formatAdminDate(user.lastUsageAt, "未记录")}</div>
        </article>
        <article className="border border-adminLineStrong bg-adminBg p-4">
          <div className={adminMobileMetaLabelClassName}>注册时间</div>
          <div className="mt-2 text-base text-adminInk">{formatAdminDate(user.createdAt)}</div>
        </article>
        <article className="border border-adminLineStrong bg-adminBg p-4">
          <div className={adminMobileMetaLabelClassName}>最近登录</div>
          <div className="mt-2 text-base text-adminInk">{formatAdminDateTime(user.lastLoginAt, "未登录")}</div>
        </article>
      </div>
      <div className="border border-adminLineStrong bg-adminBg p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">订阅历史</div>
          <div className="text-xs text-adminInkSoft">{formatCompactNumber(user.subscriptionHistory.length)} 条</div>
        </div>
        <div className="mt-4 space-y-3">
          {user.subscriptionHistory.length ? (
            user.subscriptionHistory.map((item) => (
              <article key={`${user.id}-${item.id ?? item.planCode}-${item.updatedAt ?? item.startAt ?? "fallback"}`} className="border border-adminLineStrong bg-adminSurfaceAlt p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-adminInk">{getManagedPlanLabel(item.planCode)}</div>
                  <span className={`border px-2 py-1 text-xs ${getSubscriptionStatusClassName(item.status)}`}>
                    {getSubscriptionStatusLabel(item.status)}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-6 text-adminInkSoft">
                  生效：{formatAdminDate(item.startAt)} · 结束：{formatAdminDate(item.endAt, "未截止")}<br />
                  来源：{item.source || "manual"} · 最近变更：{formatAdminDateTime(item.updatedAt)}
                </div>
              </article>
            ))
          ) : (
            <div className="text-sm text-adminInkSoft">当前还没有显式订阅记录，沿用用户套餐配置。</div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PromptManagerClient({
  prompts,
  focusPrompt,
}: {
  prompts: Array<{
    id: number;
    promptId: string;
    version: string;
    category: string;
    name: string;
    isActive: boolean;
    promptContent: string;
    autoMode: "manual" | "recommendation";
    updatedAt: string;
    rolloutObserveOnly: boolean;
    rolloutPercentage: number;
    rolloutPlanCodes: string[];
    rolloutAssessment: {
      hasLedger: boolean;
      ledgerDecision: string | null;
      sourceVersion: string | null;
      runId: number | null;
      deltaTotalScore: number | null;
      failedCaseCount: number;
      feedbackCount: number;
      observedViralScore: number | null;
      openRate: number | null;
      readCompletionRate: number | null;
      uniqueUsers: number;
      totalHitCount: number;
      lastHitAt: string | null;
    };
    rolloutAuditTrail: Array<{
      id: number;
      managementAction: string;
      createdAt: string;
      username: string | null;
      reason: string | null;
      riskLevel: string;
      cooldownSkipped: boolean;
      changes: string[];
      previousConfig: Record<string, unknown>;
      nextConfig: Record<string, unknown>;
      signals: {
        feedbackCount: number | null;
        uniqueUsers: number | null;
        totalHitCount: number | null;
        deltaTotalScore: number | null;
        observedViralScore: number | null;
        openRate: number | null;
        readCompletionRate: number | null;
      };
    }>;
    rolloutStats: {
      uniqueUserCount: number;
      totalHitCount: number;
      lastHitAt: string | null;
      observeUserCount: number;
      planUserCount: number;
      percentageUserCount: number;
      stableUserCount: number;
    };
    rolloutTrend: Array<{
      date: string;
      totalHitCount: number;
      observeHitCount: number;
      planHitCount: number;
      percentageHitCount: number;
      stableHitCount: number;
    }>;
    rolloutSamples: Array<{
      userId: number;
      username: string | null;
      role: string | null;
      planCode: string | null;
      resolutionMode: string;
      resolutionReason: string;
      userBucket: number | null;
      hitCount: number;
      firstHitAt: string;
      lastHitAt: string;
    }>;
  }>;
  focusPrompt?: {
    promptId: string;
    version: string | null;
    matchedCount: number;
    clearHref: string;
  } | null;
}) {
  const router = useRouter();
  const plan17PromptSnapshots = PLAN17_PROMPT_SCENE_DEFINITIONS.map((scene) => {
    const versions = prompts.filter((prompt) => prompt.promptId === scene.promptId);
    const activeCount = versions.filter((prompt) => prompt.isActive).length;
    const latestUpdatedAt = versions
      .map((prompt) => prompt.updatedAt)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
    return {
      ...scene,
      versionCount: versions.length,
      activeCount,
      latestUpdatedAt,
      focusHref: `/admin/prompts?promptId=${encodeURIComponent(scene.promptId)}`,
    };
  });
  const surfacedPlan17PromptCount = plan17PromptSnapshots.filter((item) => item.versionCount > 0).length;
  const [form, setForm] = useState({
    promptId: "",
    version: "",
    category: "writing",
    name: "",
    filePath: "system:custom",
    functionName: "customPrompt",
    promptContent: "",
    publishMode: "active",
    autoMode: "recommendation",
    rolloutObserveOnly: false,
    rolloutPercentage: "0",
    rolloutPlanCodes: "",
  });

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/admin/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        isActive: form.publishMode === "active",
        autoMode: form.publishMode === "rollout" ? form.autoMode : "manual",
        rolloutObserveOnly: form.publishMode === "rollout" ? form.rolloutObserveOnly : false,
        rolloutPercentage: form.publishMode === "rollout" ? Number(form.rolloutPercentage || 0) : 0,
        rolloutPlanCodes:
          form.publishMode === "rollout"
            ? form.rolloutPlanCodes
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
      }),
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

  function isStaffOnly(config: Record<string, unknown>) {
    return Boolean(config.rolloutObserveOnly);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className={`grid gap-3 p-5 ${uiPrimitives.adminPanel}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <input aria-label="promptId" value={form.promptId} onChange={(e) => setForm((prev) => ({ ...prev, promptId: e.target.value }))} placeholder="promptId" className={uiPrimitives.adminInput} />
          <input aria-label="版本号" value={form.version} onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))} placeholder="版本号" className={uiPrimitives.adminInput} />
          <input aria-label="分类" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="分类" className={uiPrimitives.adminInput} />
          <input aria-label="名称" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="名称" className={uiPrimitives.adminInput} />
          <select aria-label="select control" value={form.publishMode} onChange={(e) => setForm((prev) => ({ ...prev, publishMode: e.target.value }))} className={uiPrimitives.adminSelect}>
            <option value="active">全量激活</option>
            <option value="rollout">灰度发布</option>
          </select>
          <select value={form.autoMode} onChange={(e) => setForm((prev) => ({ ...prev, autoMode: e.target.value }))} className={uiPrimitives.adminSelect}>
            <option value="recommendation">自动治理</option>
            <option value="manual">手动治理</option>
          </select>
          <input aria-label="灰度百分比 0-100"
            value={form.rolloutPercentage}
            onChange={(e) => setForm((prev) => ({ ...prev, rolloutPercentage: e.target.value }))}
            placeholder="灰度百分比 0-100"
            className={uiPrimitives.adminInput}
          />
          <input aria-label="灰度计划，用逗号分隔，如 pro,ultra"
            value={form.rolloutPlanCodes}
            onChange={(e) => setForm((prev) => ({ ...prev, rolloutPlanCodes: e.target.value }))}
            placeholder="灰度计划，用逗号分隔，如 pro,ultra"
            className={uiPrimitives.adminInput}
          />
          <label className="flex items-center gap-2 text-sm text-adminInkSoft">
            <input aria-label="Prompt 内容"
              type="checkbox"
              checked={form.rolloutObserveOnly}
              onChange={(e) => setForm((prev) => ({ ...prev, rolloutObserveOnly: e.target.checked }))}
            />
            观察流量优先
          </label>
        </div>
        <textarea aria-label="Prompt 内容" value={form.promptContent} onChange={(e) => setForm((prev) => ({ ...prev, promptContent: e.target.value }))} placeholder="Prompt 内容" className={`min-h-[160px] ${uiPrimitives.adminInput}`} />
        <button className={uiPrimitives.primaryButton}>{form.publishMode === "active" ? "创建并激活版本" : "创建灰度版本"}</button>
      </form>
      {focusPrompt ? (
        <div className={`border px-4 py-4 ${uiPrimitives.adminPanel}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Prompt 聚焦模式</div>
              <div className="mt-2 text-sm leading-7 text-adminInkSoft">
                当前只展示 <span className="font-mono">{focusPrompt.promptId}</span>
                {focusPrompt.version ? <> · <span className="font-mono">{focusPrompt.version}</span></> : null}
                {" "}对应的 Prompt 版本，共 {focusPrompt.matchedCount} 条。
              </div>
            </div>
            <Link href={focusPrompt.clearHref} className={uiPrimitives.adminSecondaryButton}>
              返回全量 Prompts
            </Link>
          </div>
        </div>
      ) : null}
      <div className={`space-y-4 p-5 ${uiPrimitives.adminPanel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">Plan 17 Prompt Scenes</div>
            <div className="mt-2 text-sm leading-7 text-adminInkSoft">
              集中查看三层分离与爆点结构化相关场景。当前已入库 {surfacedPlan17PromptCount}/{PLAN17_PROMPT_SCENE_DEFINITIONS.length} 个场景。
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plan17PromptSnapshots.map((scene) => (
            <Link key={scene.promptId} href={scene.focusHref} className={`border p-4 transition hover:border-adminAccent hover:bg-adminSurfaceAlt ${uiPrimitives.adminPanel}`}>
              <div className="text-xs uppercase tracking-[0.16em] text-adminInkSoft">{scene.groupLabel}</div>
              <div className="mt-2 text-base text-adminInk">{scene.label}</div>
              <div className="mt-1 font-mono text-xs text-adminInkSoft">{scene.promptId}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-adminInkSoft">
                <span className="rounded-full border border-adminLineStrong px-2 py-1">版本 {scene.versionCount}</span>
                <span className="rounded-full border border-adminLineStrong px-2 py-1">active {scene.activeCount}</span>
              </div>
              <div className="mt-3 text-xs leading-6 text-adminInkSoft">
                {scene.latestUpdatedAt ? `最近更新 ${new Date(scene.latestUpdatedAt).toLocaleString("zh-CN")}` : "尚未创建版本"}
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {prompts.map((prompt) => (
          <div key={prompt.id} className={`${uiPrimitives.adminPanel} p-5`}>
            {(() => {
              const promptRef = `${prompt.promptId}@${prompt.version}`;
              const versionsHref = `/admin/writing-eval/versions?assetType=prompt_version&assetRef=${encodeURIComponent(promptRef)}`;
              const plan17Scene = getPlan17PromptSceneMeta(prompt.promptId);
              return (
                <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-serifCn text-2xl text-adminInk text-balance">{prompt.name}</div>
                <div className="mt-2 text-sm text-adminInkSoft">{prompt.promptId} · {prompt.version} · {prompt.category}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-adminInkSoft">
                  {plan17Scene ? (
                    <span className="rounded-full border border-cinnabar/40 px-2 py-1 text-cinnabar">
                      Plan 17 · {plan17Scene.groupLabel}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-adminLineStrong px-2 py-1">
                    自动治理 {prompt.autoMode === "recommendation" ? "recommendation" : "manual"}
                  </span>
                  <span className="rounded-full border border-adminLineStrong px-2 py-1">
                    {prompt.rolloutAssessment.hasLedger ? `账本 ${prompt.rolloutAssessment.ledgerDecision || "pending"}` : "无实验账本"}
                  </span>
                  <span className="rounded-full border border-adminLineStrong px-2 py-1">
                    最近配置 {new Date(prompt.updatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                {!prompt.isActive && (prompt.rolloutObserveOnly || prompt.rolloutPercentage > 0 || prompt.rolloutPlanCodes.length > 0) ? (
                  <div className="mt-2 text-xs text-cinnabar">
                    灰度：
                    {prompt.rolloutObserveOnly ? " 观察优先" : ""}
                    {prompt.rolloutPercentage > 0 ? ` ${prompt.rolloutPercentage}%` : ""}
                    {prompt.rolloutPlanCodes.length ? ` plan=${prompt.rolloutPlanCodes.join("/")}` : ""}
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-adminInkSoft">
                  命中用户 {prompt.rolloutStats.uniqueUserCount} · 命中次数 {prompt.rolloutStats.totalHitCount}
                  {prompt.rolloutStats.lastHitAt ? ` · 最近命中 ${new Date(prompt.rolloutStats.lastHitAt).toLocaleString("zh-CN")}` : ""}
                </div>
                <div className="mt-1 text-xs text-adminInkSoft">
                  观察流量 {prompt.rolloutStats.observeUserCount} · 套餐白名单 {prompt.rolloutStats.planUserCount} · 比例流量 {prompt.rolloutStats.percentageUserCount} · 稳定流量 {prompt.rolloutStats.stableUserCount}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={versionsHref} className={uiPrimitives.adminSecondaryButton}>
                  查看版本账本
                </Link>
                <button onClick={() => activate(prompt.promptId, prompt.version)} className={uiPrimitives.adminSecondaryButton}>
                  {prompt.isActive ? "当前生效" : "激活"}
                </button>
              </div>
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border border-adminLineStrong bg-adminBg p-4 text-xs leading-6 text-adminInkSoft">{prompt.promptContent}</pre>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="border border-adminLineStrong bg-adminBg p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkSoft">自动治理</div>
                <div className="mt-3 text-lg text-adminInk">{prompt.autoMode === "recommendation" ? "自动观察中" : "手动维护"}</div>
                <div className="mt-2 text-xs leading-6 text-adminInkSoft">
                  当前窗口 {formatPromptRolloutWindowLabel(prompt.rolloutObserveOnly)} · {prompt.rolloutPercentage}%
                  {prompt.rolloutPlanCodes.length ? ` · plan=${prompt.rolloutPlanCodes.join("/")}` : ""}
                </div>
              </div>
              <div className="border border-adminLineStrong bg-adminBg p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkSoft">实验账本</div>
                <div className="mt-3 text-lg text-adminInk">
                  {prompt.rolloutAssessment.hasLedger ? prompt.rolloutAssessment.ledgerDecision || "pending" : "未接入"}
                </div>
                <div className="mt-2 text-xs leading-6 text-adminInkSoft">
                  Delta {prompt.rolloutAssessment.deltaTotalScore !== null ? prompt.rolloutAssessment.deltaTotalScore.toFixed(2) : "--"} · 失败样本 {prompt.rolloutAssessment.failedCaseCount}
                </div>
                <div className="mt-1 text-xs text-adminInkSoft">
                  来源 {prompt.rolloutAssessment.sourceVersion || "--"}
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href={versionsHref} className={uiPrimitives.adminSecondaryButton}>
                    打开聚焦账本
                  </Link>
                  {prompt.rolloutAssessment.runId ? (
                    <Link href={`/admin/writing-eval/runs?runId=${prompt.rolloutAssessment.runId}`} className={uiPrimitives.adminSecondaryButton}>
                      打开对应 Run
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="border border-adminLineStrong bg-adminBg p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkSoft">真实结果</div>
                <div className="mt-3 text-lg text-adminInk">{prompt.rolloutAssessment.feedbackCount} 条回流</div>
                <div className="mt-2 text-xs leading-6 text-adminInkSoft">
                  爆款潜力 {prompt.rolloutAssessment.observedViralScore !== null ? prompt.rolloutAssessment.observedViralScore.toFixed(1) : "--"} · 打开率 {prompt.rolloutAssessment.openRate !== null ? `${prompt.rolloutAssessment.openRate.toFixed(1)}%` : "--"}
                </div>
                <div className="mt-1 text-xs text-adminInkSoft">
                  读完率 {prompt.rolloutAssessment.readCompletionRate !== null ? `${prompt.rolloutAssessment.readCompletionRate.toFixed(1)}%` : "--"} · 覆盖 {prompt.rolloutAssessment.uniqueUsers}/{prompt.rolloutAssessment.totalHitCount}
                </div>
              </div>
            </div>
            <PromptCandidateGenerator
              promptId={prompt.promptId}
              version={prompt.version}
              name={prompt.name}
              onCreated={() => router.refresh()}
            />
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <div className="border border-adminLineStrong bg-adminBg p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-adminInkSoft">最近 14 天趋势</div>
                  {prompt.rolloutTrend.length > 0 ? (
                    <div className="mt-4 flex items-end gap-2">
                      {prompt.rolloutTrend.map((item) => {
                        const maxCount = Math.max(...prompt.rolloutTrend.map((trend) => trend.totalHitCount), 1);
                        const barHeight = Math.max(10, Math.round((item.totalHitCount / maxCount) * 96));
                        return (
                          <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                            <div className="text-[10px] text-adminInkSoft">{item.totalHitCount}</div>
                            <div className="flex w-full items-end justify-center">
                              <div
                                className="w-full rounded-t bg-cinnabar/80"
                                style={{ height: `${barHeight}px` }}
                                title={`${item.date} · total ${item.totalHitCount} · observe ${item.observeHitCount} · plan ${item.planHitCount} · percentage ${item.percentageHitCount} · stable ${item.stableHitCount}`}
                              />
                            </div>
                            <div className="text-[10px] text-adminInkSoft">{item.date.slice(5)}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-adminInkSoft">还没有趋势数据。</div>
                  )}
                </div>
                <div className="border border-adminLineStrong bg-adminBg p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-adminInkSoft">自动治理时间线</div>
                    <div className="text-[11px] text-adminInkSoft">只展示自动治理写入的 Prompt 灰度审计</div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {prompt.rolloutAuditTrail.length > 0 ? (
                      prompt.rolloutAuditTrail.slice(0, 6).map((item) => (
                        <div key={item.id} className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-3 text-xs text-adminInkSoft">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-adminLineStrong px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-adminInkSoft">
                              {item.managementAction}
                            </span>
                            <span className="text-adminInkSoft">{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                          </div>
                          {item.reason ? <div className="mt-2 leading-6 text-adminInkSoft">{item.reason}</div> : null}
                          {item.changes.length > 0 ? <div className="mt-2 text-adminInkSoft">变更：{item.changes.join("；")}</div> : null}
                          <div className="mt-2 text-adminInkSoft">
                            {`${formatPromptRolloutWindowLabel(isStaffOnly(item.previousConfig))} ${Number(item.previousConfig.rolloutPercentage || 0)}%`}
                            {" -> "}
                            {`${formatPromptRolloutWindowLabel(isStaffOnly(item.nextConfig))} ${Number(item.nextConfig.rolloutPercentage || 0)}%`}
                          </div>
                          <div className="mt-1 text-adminInkSoft">
                            信号：回流 {item.signals.feedbackCount ?? "--"} · 用户 {item.signals.uniqueUsers ?? "--"} · 命中 {item.signals.totalHitCount ?? "--"} · Delta {item.signals.deltaTotalScore !== null ? item.signals.deltaTotalScore.toFixed(2) : "--"}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-adminInkSoft">还没有自动治理审计。</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border border-adminLineStrong bg-adminBg p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkSoft">最近命中用户</div>
                <div className="mt-4 space-y-3">
                  {prompt.rolloutSamples.length > 0 ? (
                    prompt.rolloutSamples.map((sample) => (
                      <div key={`${sample.userId}-${sample.lastHitAt}`} className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-3 text-xs text-adminInkSoft">
                        <div className="font-mono text-adminInk">
                          {sample.username || `user-${sample.userId}`} · {sample.planCode || "free"} · {sample.role || "user"}
                        </div>
                        <div className="mt-2 text-adminInkSoft">
                          命中原因 {formatPromptResolutionReasonLabel(sample.resolutionReason)} · 次数 {sample.hitCount} · bucket {sample.userBucket ?? "--"}
                        </div>
                        <div className="mt-1 text-adminInkSoft">最近命中 {new Date(sample.lastHitAt).toLocaleString("zh-CN")}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-adminInkSoft">还没有命中样本。</div>
                  )}
                </div>
              </div>
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptCandidateGenerator({
  promptId,
  version,
  name,
  onCreated,
}: {
  promptId: string;
  version: string;
  name: string;
  onCreated: () => void;
}) {
  const [candidateVersion, setCandidateVersion] = useState("");
  const [optimizationGoal, setOptimizationGoal] = useState(
    "提升写作风格稳定性、语言自然度、信息密度、情绪推进和标题兑现度；避免机器腔、空话和事实边界退化。",
  );
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    setIsCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/prompts/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId,
          baseVersion: version,
          candidateVersion,
          optimizationGoal,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { version?: string } };
      if (!response.ok || !json.success) {
        throw new Error(json.error || "生成候选 Prompt 版本失败");
      }
      setCandidateVersion("");
      setMessage(`已生成候选版本 ${json.data?.version || "新版本"}`);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成候选 Prompt 版本失败");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form onSubmit={handleGenerate} className="mt-4 border border-adminLineStrong bg-adminBg p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">AI Candidate</div>
          <div className="mt-2 text-sm text-adminInkSoft">
            基于 {name} · {promptId}@{version} 自动生成未激活候选版本。
          </div>
        </div>
        <button type="submit" className={uiPrimitives.adminSecondaryButton} disabled={isCreating}>
          {isCreating ? "生成中…" : "AI 生成候选版"}
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <input aria-label="候选版本号，可留空自动生成"
          value={candidateVersion}
          onChange={(event) => setCandidateVersion(event.target.value)}
          placeholder="候选版本号，可留空自动生成"
          className={uiPrimitives.adminInput}
        />
        <textarea aria-label="这次候选版想优化什么"
          value={optimizationGoal}
          onChange={(event) => setOptimizationGoal(event.target.value)}
          className={`min-h-[88px] ${uiPrimitives.adminInput}`}
          placeholder="这次候选版想优化什么"
        />
      </div>
      {message ? <div className="mt-3 text-sm text-adminInkSoft">{message}</div> : null}
    </form>
  );
}

export function RouteManagerClient({
  routes,
}: {
  routes: Array<{
    sceneCode: string;
    primaryModel: string;
    fallbackModel: string | null;
    shadowModel: string | null;
    shadowTrafficPercent: number | null;
    description: string | null;
  }>;
}) {
  const router = useRouter();

  async function handleUpdate(
    sceneCode: string,
    primaryModel: string,
    fallbackModel: string | null,
    shadowModel: string | null,
    shadowTrafficPercent: number | null,
    description: string | null,
  ) {
    await fetch("/api/admin/ai-routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneCode, primaryModel, fallbackModel, shadowModel, shadowTrafficPercent, description }),
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
        <div className="text-sm leading-7 text-adminInkSoft">
          需要临时补抓一轮时，可直接手动触发全局同步，不必等待 06:00 / 18:00 主窗口或 06:15 / 06:45 / 18:15 / 18:45 补偿窗口。
        </div>
        <button onClick={runTopicSync} disabled={syncing} className={uiPrimitives.primaryButton}>
          {syncing ? "同步中…" : "立即同步热点"}
        </button>
      </div>
      <form onSubmit={handleSubmit} className={`grid gap-3 p-5 md:grid-cols-[200px_minmax(0,1fr)_140px_120px_160px] ${uiPrimitives.adminPanel}`}>
        <input aria-label="系统源名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="系统源名称" className={uiPrimitives.adminInput} />
        <input aria-label="https://example.com 或 RSS 地址" value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} placeholder="https://example.com 或 RSS 地址" className={uiPrimitives.adminInput} />
        <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className={uiPrimitives.adminSelect}>
          <option value="youtube">YouTube</option>
          <option value="reddit">Reddit</option>
          <option value="podcast">Podcast</option>
          <option value="spotify">Spotify</option>
          <option value="news">News</option>
          <option value="blog">Blog</option>
          <option value="rss">RSS</option>
        </select>
        <input aria-label="优先级" value={priority} onChange={(event) => setPriority(event.target.value)} placeholder="优先级" className={uiPrimitives.adminInput} />
        <button disabled={submitting} className={uiPrimitives.primaryButton}>
          {submitting ? "创建中…" : "新增系统源"}
        </button>
      </form>
      <div className="space-y-3">
        {sources.map((source) => (
          <div key={source.id} className={`${uiPrimitives.adminPanel} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-adminInkSoft">System Source</div>
                <div className="mt-2 font-serifCn text-2xl text-adminInk text-balance">{source.name}</div>
                <div className="mt-2 text-sm text-adminInkSoft">{source.homepageUrl || "未配置主页地址"}</div>
                <div className="mt-3 text-xs text-adminInkSoft">
                  创建于 {new Date(source.createdAt).toLocaleString("zh-CN")} · 最近更新 {new Date(source.updatedAt).toLocaleString("zh-CN")}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="border border-adminLineStrong bg-adminBg px-2 py-1 text-adminInkSoft">
                    类型 {source.sourceType}
                  </span>
                  <span className="border border-adminLineStrong bg-adminBg px-2 py-1 text-adminInkSoft">
                    优先级 {source.priority}
                  </span>
                  <span className="border border-adminLineStrong bg-adminBg px-2 py-1 text-adminInkSoft">
                    {source.lastFetchedAt ? `最近采集 ${new Date(source.lastFetchedAt).toLocaleString("zh-CN")}` : "尚未采集"}
                  </span>
                  <span className={`border px-2 py-1 ${source.recentFailureCount > 0 ? "border-danger/30 bg-surface text-danger" : "border-adminLineStrong bg-adminBg text-adminInkSoft"}`}>
                    最近失败 {source.recentFailureCount} 次
                  </span>
                </div>
                {source.latestFailure ? (
                  <div className="mt-3 border border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
                    最近错误：{source.latestFailure}
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-adminInkSoft">
                  {source.isActive ? "当前已启用，会参与下一轮热点采集。" : "当前已停用，不再参与后续热点采集。"}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <select aria-label="select control"
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
                  {syncingSourceId === source.id ? "重抓中…" : "重抓该信源"}
                </button>
                <button
                  onClick={() => updateSource(source.id, { isActive: !source.isActive })}
                  disabled={togglingId === source.id}
                  className={uiPrimitives.adminSecondaryButton}
                >
                  {togglingId === source.id ? "处理中…" : source.isActive ? "停用" : "启用"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-adminLineStrong pt-6">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Topic Sync Runs</div>
        <div className="mt-3 text-sm leading-7 text-adminInkSoft">
          这里记录北京时间 06:00 / 18:00 主窗口，以及 06:15 / 06:45 / 18:15 / 18:45 补偿窗口内的热点抓取执行结果；若窗口内存在失败源，可直接发起补偿重试。
        </div>
        <div className="mt-4 grid gap-3">
          {recentRuns.length === 0 ? (
            <div className="border border-adminLineStrong bg-adminBg px-4 py-4 text-sm text-adminInkSoft">当前还没有热点调度窗口执行记录。</div>
          ) : (
            recentRuns.map((run) => {
              const canRetry = ["failed", "partial_failed"].includes(run.status) && run.failedSourceCount > 0;
              return (
                <div key={run.id} className={`${uiPrimitives.adminPanel} p-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-adminInk">{run.syncWindowLabel}</div>
                      <div className="mt-1 text-xs text-adminInkSoft">
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
                          {retryingRunId === run.id ? "重试中…" : "重试失败源"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-adminInkSoft">
                    <span className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-1">应抓取 {run.scheduledSourceCount}</span>
                    <span className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-1">已入队 {run.enqueuedJobCount}</span>
                    <span className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-1">成功 {run.completedSourceCount}</span>
                    <span className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-1">失败 {run.failedSourceCount}</span>
                    <span className="border border-adminLineStrong bg-adminSurfaceAlt px-3 py-1">新增热点 {run.insertedItemCount}</span>
                  </div>
                  <div className="mt-3 text-xs leading-6 text-adminInkSoft">
                    触发：{new Date(run.triggeredAt).toLocaleString("zh-CN")}
                    {run.finishedAt ? ` · 完成：${new Date(run.finishedAt).toLocaleString("zh-CN")}` : " · 尚未完成"}
                  </div>
                  {run.lastError ? (
                    <div className="mt-3 border border-danger/30 bg-surface px-3 py-3 text-xs leading-6 text-danger">
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
  overview,
}: {
  plans: ResolvedPlanFeatureSnapshot[];
  subscriptions: Array<{ id: number | null; userId: number; username: string; displayName: string | null; planCode: string; planName: string | null; status: string; startAt: string | null; endAt: string | null }>;
  overview: AdminFinanceOverview;
}) {
  const router = useRouter();
  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    priceCny: "0",
    dailyGenerationLimit: "",
    fragmentLimit: "",
    languageGuardRuleLimit: "",
    maxWechatConnections: "",
    canGenerateCoverImage: false,
    canExportPdf: false,
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
        languageGuardRuleLimit: planForm.languageGuardRuleLimit ? Number(planForm.languageGuardRuleLimit) : null,
        maxWechatConnections: planForm.maxWechatConnections ? Number(planForm.maxWechatConnections) : 0,
        canGenerateCoverImage: planForm.canGenerateCoverImage,
        canExportPdf: planForm.canExportPdf,
      }),
    });
    setPlanForm({
      code: "",
      name: "",
      priceCny: "0",
      dailyGenerationLimit: "",
      fragmentLimit: "",
      languageGuardRuleLimit: "",
      maxWechatConnections: "",
      canGenerateCoverImage: false,
      canExportPdf: false,
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">生效订阅</div>
          <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatCompactNumber(overview.activeSubscriptionCount)}</div>
          <div className="mt-2 text-xs text-adminInkSoft">30 天内到期 {formatCompactNumber(overview.endingSoonCount)}</div>
        </article>
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">月度收入估算</div>
          <div className="mt-3 font-serifCn text-3xl text-adminInk">￥{formatCompactNumber(overview.monthlyRevenueEstimate)}</div>
          <div className="mt-2 text-xs text-adminInkSoft">按当前套餐分布轻量估算</div>
        </article>
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-adminInkSoft">使用榜覆盖</div>
          <div className="mt-3 font-serifCn text-3xl text-adminInk">{formatCompactNumber(overview.usageTopUsers.length)}</div>
          <div className="mt-2 text-xs text-adminInkSoft">Top 10 高频用户</div>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">套餐分布</div>
              <div className="mt-2 text-lg text-adminInk">当前订阅按套餐分层</div>
            </div>
            <div className="text-xs text-adminInkSoft">{formatCompactNumber(subscriptions.length)} 个账号</div>
          </div>
          <div className="mt-5 space-y-4">
            {overview.planDistribution.map((item) => (
              <div key={item.planCode} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="text-adminInk">{item.planName}</div>
                  <div className="text-adminInkSoft">
                    {formatCompactNumber(item.subscriberCount)} 人 · {item.sharePercent.toFixed(1)}% · ￥{formatCompactNumber(item.revenueEstimate)}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-adminBg">
                  <div className="h-full bg-cinnabar" style={{ width: `${Math.max(item.sharePercent, item.subscriberCount > 0 ? 6 : 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className={`${uiPrimitives.adminPanel} p-5`}>
          <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">订阅趋势</div>
          <div className="mt-2 text-lg text-adminInk">最近 6 个月新开 / 到期</div>
          <div className="mt-5 grid grid-cols-6 gap-3">
            {overview.subscriptionTrend.map((item) => {
              const maxValue = Math.max(
                1,
                ...overview.subscriptionTrend.flatMap((entry) => [entry.startedCount, entry.endedCount]),
              );
              const startedHeight = `${Math.max((item.startedCount / maxValue) * 100, item.startedCount > 0 ? 10 : 0)}%`;
              const endedHeight = `${Math.max((item.endedCount / maxValue) * 100, item.endedCount > 0 ? 10 : 0)}%`;
              return (
                <div key={item.monthKey} className="flex flex-col items-center gap-3">
                  <div className="flex h-32 w-full items-end justify-center gap-2 rounded border border-adminLineStrong bg-adminBg px-2 py-3">
                    <div className="w-1/3 rounded-t-sm bg-cinnabar/85" style={{ height: startedHeight }} title={`新开 ${item.startedCount}`} />
                    <div className="w-1/3 rounded-t-sm bg-adminInk/55" style={{ height: endedHeight }} title={`到期 ${item.endedCount}`} />
                  </div>
                  <div className="text-center text-xs text-adminInkSoft">
                    <div>{item.label}</div>
                    <div className="mt-1">新开 {item.startedCount} / 到期 {item.endedCount}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>
      <form onSubmit={handleCreatePlan} className={`grid gap-3 p-5 md:grid-cols-3 ${uiPrimitives.adminPanel}`}>
        <input aria-label="套餐 code" value={planForm.code} onChange={(event) => setPlanForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="套餐 code" className={uiPrimitives.adminInput} />
        <input aria-label="套餐名称" value={planForm.name} onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="套餐名称" className={uiPrimitives.adminInput} />
        <input aria-label="价格" value={planForm.priceCny} onChange={(event) => setPlanForm((prev) => ({ ...prev, priceCny: event.target.value }))} placeholder="价格" className={uiPrimitives.adminInput} />
        <input aria-label="每日生成次数" value={planForm.dailyGenerationLimit} onChange={(event) => setPlanForm((prev) => ({ ...prev, dailyGenerationLimit: event.target.value }))} placeholder="每日生成次数" className={uiPrimitives.adminInput} />
        <input aria-label="碎片上限" value={planForm.fragmentLimit} onChange={(event) => setPlanForm((prev) => ({ ...prev, fragmentLimit: event.target.value }))} placeholder="碎片上限" className={uiPrimitives.adminInput} />
        <input aria-label="语言守卫规则上限" value={planForm.languageGuardRuleLimit} onChange={(event) => setPlanForm((prev) => ({ ...prev, languageGuardRuleLimit: event.target.value }))} placeholder="语言守卫规则上限" className={uiPrimitives.adminInput} />
        <input aria-label="公众号连接上限" value={planForm.maxWechatConnections} onChange={(event) => setPlanForm((prev) => ({ ...prev, maxWechatConnections: event.target.value }))} placeholder="公众号连接上限" className={uiPrimitives.adminInput} />
        <label className="flex items-center gap-3 border border-adminLineStrong bg-adminBg px-4 py-3 text-sm text-adminInkSoft">
          <input aria-label="input control" type="checkbox" checked={planForm.canGenerateCoverImage} onChange={(event) => setPlanForm((prev) => ({ ...prev, canGenerateCoverImage: event.target.checked }))} />
          允许封面图生成
        </label>
        <label className="flex items-center gap-3 border border-adminLineStrong bg-adminBg px-4 py-3 text-sm text-adminInkSoft">
          <input aria-label="input control" type="checkbox" checked={planForm.canExportPdf} onChange={(event) => setPlanForm((prev) => ({ ...prev, canExportPdf: event.target.checked }))} />
          允许 PDF 导出
        </label>
        <Button type="submit" variant="primary" className={`md:col-span-3 ${adminDarkPrimaryButtonClassName}`}>
          创建套餐
        </Button>
      </form>
      <section className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            key={plan.code}
            className={`border p-6 ${plan.code === "pro" ? "border-cinnabar bg-cinnabar text-white" : "border-adminLineStrong bg-adminBg text-adminInk"}`}
          >
            <div className="text-xs uppercase tracking-[0.24em] opacity-70">Plan</div>
            <h1 className="mt-4 font-serifCn text-3xl text-balance">{plan.name}</h1>
            <div className="mt-4 text-3xl text-balance">￥{plan.priceCny}</div>
            <p className="mt-4 text-sm leading-7 opacity-80">
              每日生成：{plan.dailyGenerationLimit ?? "不限"}<br />
              碎片上限：{plan.fragmentLimit ?? "不限"}<br />
              语言守卫规则：{plan.languageGuardRuleLimit ?? "不限"}<br />
              公众号连接：{plan.maxWechatConnections ?? "不限"}
            </p>
            {plan.entitlements ? (
              <div className="mt-4 text-xs leading-6 opacity-75">
                人设：{plan.personaLimit} · 选题位：Top{plan.topicSignalVisibleLimit} · 私有模板：{plan.customTemplateLimit || "未开放"} · 自定义信源：{plan.customTopicSourceLimit || "未开放"}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-xs opacity-85">
              {plan.canGenerateCoverImage ? <span className="border px-2 py-1">Cover</span> : null}
              {plan.canExportPdf ? <span className="border px-2 py-1">PDF</span> : null}
              {plan.canPublishToWechat ? <span className="border px-2 py-1">Wechat</span> : null}
            </div>
          </article>
        ))}
      </section>
      <section className={`${uiPrimitives.adminPanel} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">Usage Top 10</div>
            <div className="mt-2 text-lg text-adminInk">高用量账号</div>
          </div>
          <div className="text-xs text-adminInkSoft">累计 usage_counters 聚合</div>
        </div>
        <div className="mt-5 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-adminInkSoft">
              <tr>
                {["排名", "用户", "套餐", "总用量", "活跃天数", "最近使用"].map((head) => (
                  <th key={head} className="px-4 py-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.usageTopUsers.map((item, index) => (
                <tr key={item.userId} className="border-t border-adminLineStrong">
                  <td className="px-4 py-3 text-adminInk">#{index + 1}</td>
                  <td className="px-4 py-3 text-adminInk">
                    <div>{item.displayName || item.username}</div>
                    <div className="mt-1 text-xs text-adminInkSoft">{item.username}</div>
                  </td>
                  <td className="px-4 py-3 text-adminInkSoft">{getManagedPlanLabel(item.planCode)}</td>
                  <td className="px-4 py-3 text-adminInk">{formatCompactNumber(item.totalUsage)}</td>
                  <td className="px-4 py-3 text-adminInkSoft">{formatCompactNumber(item.activeDays)}</td>
                  <td className="px-4 py-3 text-adminInkSoft">{formatAdminDate(item.lastUsageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`${adminMobileListClassName} mt-5`}>
          {overview.usageTopUsers.map((item, index) => (
            <article key={item.userId} className={adminMobileCardClassName}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base text-adminInk">#{index + 1} {item.displayName || item.username}</div>
                  <div className="mt-1 text-xs text-adminInkSoft">{item.username}</div>
                </div>
                <div className="text-xs text-adminInkSoft">{getManagedPlanLabel(item.planCode)}</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className={adminMobileMetaLabelClassName}>总用量</div>
                  <div className={adminMobileMetaValueClassName}>{formatCompactNumber(item.totalUsage)}</div>
                </div>
                <div>
                  <div className={adminMobileMetaLabelClassName}>活跃天数</div>
                  <div className={adminMobileMetaValueClassName}>{formatCompactNumber(item.activeDays)}</div>
                </div>
                <div>
                  <div className={adminMobileMetaLabelClassName}>最近使用</div>
                  <div className={adminMobileMetaValueClassName}>{formatAdminDate(item.lastUsageAt)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className={`${adminMobileListClassName}`}>
        {subscriptions.map((subscription) => (
          <SubscriptionMobileCard key={`${subscription.userId}-${subscription.id ?? "bootstrap"}`} subscription={subscription} plans={plans} onUpdated={() => router.refresh()} />
        ))}
      </div>
      <div className={`hidden overflow-x-auto md:block ${uiPrimitives.adminPanel}`}>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-adminBg text-adminInkSoft">
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
    <tr className="border-t border-adminLineStrong">
      <td className="px-6 py-4 text-adminInk">
        <div>{subscription.displayName || subscription.username}</div>
        <div className="mt-1 text-xs text-adminInkSoft">{subscription.username}</div>
      </td>
      <td className="px-6 py-4 text-adminInkSoft">
        <select aria-label="select control" value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          {plans.map((plan) => (
            <option key={plan.code} value={plan.code}>{plan.name}</option>
          ))}
        </select>
      </td>
      <td className="px-6 py-4 text-adminInkSoft">
        <select aria-label="select control" value={status} onChange={(event) => setStatus(event.target.value)} className={uiPrimitives.adminCompactSelect}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="ended">ended</option>
        </select>
      </td>
      <td className="px-6 py-4 text-adminInkSoft">{subscription.startAt ? new Date(subscription.startAt).toLocaleDateString("zh-CN") : "未记录"}</td>
      <td className="px-6 py-4 text-adminInkSoft">
        <input aria-label="input control" type="date" value={endAt} onChange={(event) => setEndAt(event.target.value)} className={uiPrimitives.adminCompactSelect} />
      </td>
      <td className="px-6 py-4">
        <Button type="button" onClick={handleSave} variant="secondary" size="sm" className={adminDarkSecondaryButtonClassName}>
          保存
        </Button>
      </td>
    </tr>
  );
}

function SubscriptionMobileCard({
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
    <article className={adminMobileCardClassName}>
      <div>
        <div className="text-base text-adminInk">{subscription.displayName || subscription.username}</div>
        <div className="mt-1 text-xs text-adminInkSoft">{subscription.username}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className={adminMobileMetaLabelClassName}>当前套餐</div>
          <select aria-label="select control" value={planCode} onChange={(event) => setPlanCode(event.target.value)} className={`mt-2 w-full ${uiPrimitives.adminCompactSelect}`}>
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>{plan.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className={adminMobileMetaLabelClassName}>订阅状态</div>
          <select aria-label="select control" value={status} onChange={(event) => setStatus(event.target.value)} className={`mt-2 w-full ${uiPrimitives.adminCompactSelect}`}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="ended">ended</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className={adminMobileMetaLabelClassName}>开始时间</div>
          <div className={adminMobileMetaValueClassName}>{subscription.startAt ? new Date(subscription.startAt).toLocaleDateString("zh-CN") : "未记录"}</div>
        </div>
        <label className="block">
          <div className={adminMobileMetaLabelClassName}>结束时间</div>
          <input aria-label="input control" type="date" value={endAt} onChange={(event) => setEndAt(event.target.value)} className={`mt-2 w-full ${uiPrimitives.adminCompactSelect}`} />
        </label>
      </div>
      <Button type="button" onClick={handleSave} variant="secondary" size="sm" className={adminDarkSecondaryButtonClassName}>
        保存订阅设置
      </Button>
    </article>
  );
}

function RouteRow({
  route,
  onSave,
}: {
  route: {
    sceneCode: string;
    primaryModel: string;
    fallbackModel: string | null;
    shadowModel: string | null;
    shadowTrafficPercent: number | null;
    description: string | null;
  };
  onSave: (
    sceneCode: string,
    primaryModel: string,
    fallbackModel: string | null,
    shadowModel: string | null,
    shadowTrafficPercent: number | null,
    description: string | null,
  ) => Promise<void>;
}) {
  const [primaryModel, setPrimaryModel] = useState(route.primaryModel);
  const [fallbackModel, setFallbackModel] = useState(route.fallbackModel ?? "");
  const [shadowModel, setShadowModel] = useState(route.shadowModel ?? "");
  const [shadowTrafficPercent, setShadowTrafficPercent] = useState(String(route.shadowTrafficPercent ?? 0));
  const [description, setDescription] = useState(route.description ?? "");

  return (
    <div className={`grid gap-3 p-5 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px_minmax(0,1fr)_120px] ${uiPrimitives.adminPanel}`}>
      <div className="flex items-center text-sm text-adminInk">{route.sceneCode}</div>
      <input aria-label="input control" value={primaryModel} onChange={(event) => setPrimaryModel(event.target.value)} className={uiPrimitives.adminInput} />
      <input aria-label="input control" value={fallbackModel} onChange={(event) => setFallbackModel(event.target.value)} className={uiPrimitives.adminInput} />
      <input aria-label="shadow model" value={shadowModel} onChange={(event) => setShadowModel(event.target.value)} className={uiPrimitives.adminInput} placeholder="shadow model（可空）" />
      <input aria-label="shadow traffic percent" value={shadowTrafficPercent} onChange={(event) => setShadowTrafficPercent(event.target.value)} className={uiPrimitives.adminInput} placeholder="0-100" />
      <input aria-label="input control" value={description} onChange={(event) => setDescription(event.target.value)} className={uiPrimitives.adminInput} />
      <button
        onClick={() => onSave(
          route.sceneCode,
          primaryModel,
          fallbackModel || null,
          shadowModel || null,
          shadowTrafficPercent.trim() ? Number(shadowTrafficPercent) : 0,
          description || null,
        )}
        className={uiPrimitives.primaryButton}
      >
        保存
      </button>
    </div>
  );
}
