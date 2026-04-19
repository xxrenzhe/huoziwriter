import Link from "next/link";
import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import { getWritingEvalRolloutAuditLogs } from "@/lib/audit";
import { buildAdminPromptVersionHref, buildAdminWritingEvalVersionsHref } from "@/lib/admin-writing-eval-links";
import { normalizeWritingEvalRolloutAuditLogs } from "@/lib/admin-writing-eval-rollout-audits";
import { requireAdminSession } from "@/lib/page-auth";
import { formatWritingEvalDateTime } from "@/lib/writing-eval-format";
import { getWritingEvalVersions } from "@/lib/writing-eval";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const pagePanelClassName = cn(surfaceCardStyles(), "border-lineStrong bg-surface shadow-none");
const heroPanelClassName = cn(pagePanelClassName, "bg-paperStrong p-6 md:p-8");
const metricCardClassName = cn(pagePanelClassName, "p-5");
const sectionCardClassName = cn(pagePanelClassName, "p-5");
const insetCardClassName = cn(surfaceCardStyles(), "border-lineStrong bg-surfaceWarm px-4 py-4 shadow-none");
const actionLinkClassName = buttonStyles({ variant: "secondary", size: "sm" });

const ROLLOUT_MANAGED_VERSION_TYPES = new Set(["prompt_version", "layout_strategy", "apply_command_template", "scoring_profile"]);

export default async function AdminWritingEvalGovernancePage() {
  await requireAdminSession();
  const [versions, rolloutAudits] = await Promise.all([
    getWritingEvalVersions(),
    getWritingEvalRolloutAuditLogs(180),
  ]);

  const latestVersions = versions.slice(0, 10);
  const keepCount = versions.filter((item) => item.decision === "keep").length;
  const discardCount = versions.filter((item) => item.decision === "discard").length;
  const rolloutManagedCount = versions.filter((item) => ROLLOUT_MANAGED_VERSION_TYPES.has(item.versionType)).length;
  const rolloutActions = normalizeWritingEvalRolloutAuditLogs(rolloutAudits.combinedRolloutAuditLogs).slice(0, 12);

  return (
    <div className="space-y-6">
      <section className={heroPanelClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Governance</div>
            <h1 className="mt-4 font-serifCn text-4xl text-ink text-balance">治理决策与灰度账本</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-inkSoft">
              在独立页面查看 keep / discard 决策、自动扩量 / 收缩动作和最近账本变化，减少在 Versions 与 Insights 两页之间来回切换。
            </p>
          </div>
          <AdminWritingEvalNav sections={["overview", "datasets", "runs", "versions", "insights", "scoring", "schedules"]} className="flex flex-wrap gap-3" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "账本总数",
            value: String(versions.length),
            detail: `rollout 托管 ${rolloutManagedCount} 条`,
          },
          {
            label: "keep",
            value: String(keepCount),
            detail: "已进入保留或灰度观察的版本",
          },
          {
            label: "discard",
            value: String(discardCount),
            detail: "已明确放弃的候选版本",
          },
          {
            label: "自动治理动作",
            value: String(rolloutActions.length),
            detail: "最近 180 天的自动扩量 / 收缩审计",
          },
        ].map((item) => (
          <article key={item.label} className={metricCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
            <div className="mt-3 text-3xl text-ink text-balance">{item.value}</div>
            <div className="mt-3 text-sm text-inkSoft">{item.detail}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={sectionCardClassName}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">最近账本决策</div>
              <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">最新版本 keep / discard 记录</h2>
            </div>
            <Link href="/admin/writing-eval/versions" className={actionLinkClassName}>
              打开完整账本
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {latestVersions.map((item) => {
              const versionHref = buildAdminWritingEvalVersionsHref({
                assetType: item.versionType,
                assetRef: item.candidateContent,
                versionId: item.id,
              });
              const promptHref = item.versionType === "prompt_version" ? buildAdminPromptVersionHref(item.candidateContent) : null;
              return (
                <article key={item.id} className={insetCardClassName}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                        {formatWritingEvalDateTime(item.createdAt)} · {item.versionType}
                      </div>
                      <div className="mt-2 font-serifCn text-xl text-ink text-balance">{item.targetKey}</div>
                      <div className="mt-2 break-all text-sm text-inkSoft">{item.candidateContent}</div>
                    </div>
                    <div className={`border px-2 py-1 text-xs ${
                      item.decision === "keep"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : item.decision === "discard"
                          ? "border-warning/40 bg-surfaceWarning text-warning"
                          : "border-lineStrong bg-surface text-inkMuted"
                    }`}>
                      {item.decision}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-inkSoft">{item.decisionReason || "暂无决策理由"}</div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href={versionHref} className={actionLinkClassName}>打开账本详情</Link>
                    {promptHref ? <Link href={promptHref} className={actionLinkClassName}>打开 Prompt</Link> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className={sectionCardClassName}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">最近自动动作</div>
              <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">扩量、收缩与风险等级</h2>
            </div>
            <Link href="/admin/writing-eval/insights" className={actionLinkClassName}>
              打开风险视图
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {rolloutActions.map((item) => {
              const href =
                item.assetType && item.assetRef
                  ? buildAdminWritingEvalVersionsHref({ assetType: item.assetType, assetRef: item.assetRef })
                  : "/admin/writing-eval/versions";
              return (
                <article key={item.id} className={insetCardClassName}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{formatWritingEvalDateTime(item.createdAt)}</div>
                      <div className="mt-2 text-sm text-ink">
                        {item.directionLabel} · 风险 {item.riskLevel}
                      </div>
                    </div>
                    <div className={`text-xs ${
                      item.riskLevel === "cinnabar"
                        ? "text-cinnabar"
                        : item.direction === "expand"
                          ? "text-emerald-700"
                          : "text-warning"
                    }`}>
                      {item.directionLabel}
                    </div>
                  </div>
                  <div className="mt-2 text-xs leading-6 text-inkSoft">
                    {(item.reason || "无原因")
                      + (typeof item.feedbackCount === "number" ? ` · feedback ${item.feedbackCount}` : "")
                      + (typeof item.totalHitCount === "number" ? ` · hit ${item.totalHitCount}` : "")
                      + (typeof item.deltaTotalScore === "number" ? ` · delta ${item.deltaTotalScore.toFixed(2)}` : "")}
                  </div>
                  <div className="mt-3">
                    <Link href={href} className={actionLinkClassName}>
                      打开对应资产
                    </Link>
                  </div>
                </article>
              );
            })}
            {rolloutActions.length === 0 ? <div className="text-sm text-inkMuted">当前没有最近的自动治理动作。</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
