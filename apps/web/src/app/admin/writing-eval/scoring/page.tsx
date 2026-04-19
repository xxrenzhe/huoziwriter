import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import { AdminWritingEvalInsightsClient } from "@/components/admin-writing-eval-insights-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getWritingEvalInsights, getWritingEvalScoringProfiles } from "@/lib/writing-eval";
import { cn, surfaceCardStyles } from "@huoziwriter/ui";

const pagePanelClassName = cn(surfaceCardStyles(), "border-lineStrong bg-surface shadow-none");
const heroPanelClassName = cn(pagePanelClassName, "bg-paperStrong p-6 md:p-8");
const metricCardClassName = cn(pagePanelClassName, "p-5");

export default async function AdminWritingEvalScoringPage() {
  await requireAdminSession();
  const [insights, scoringProfiles] = await Promise.all([
    getWritingEvalInsights(60),
    getWritingEvalScoringProfiles(),
  ]);

  const onlineCalibration = insights.onlineCalibration;
  const activeProfile = scoringProfiles.find((item) => item.isActive) ?? scoringProfiles[0] ?? null;

  return (
    <div className="space-y-6">
      <section className={heroPanelClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Scoring</div>
            <h1 className="mt-4 font-serifCn text-4xl text-ink text-balance">评分校准与线上回流</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-inkSoft">
              独立查看 scoring profile、线上回流偏差和动态权重建议，不再把评分校准淹没在长期趋势与风险面板里。
            </p>
          </div>
          <AdminWritingEvalNav sections={["overview", "datasets", "runs", "versions", "insights", "schedules", "governance"]} className="flex flex-wrap gap-3" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "评分画像",
            value: String(scoringProfiles.length),
            detail: activeProfile ? `active ${activeProfile.name} · ${activeProfile.code}` : "当前还没有评分画像",
          },
          {
            label: "已绑定回流",
            value: String(onlineCalibration.linkedResultCount),
            detail: `${onlineCalibration.feedbackCount} 条线上反馈已进入校准样本池`,
          },
          {
            label: "平均校准偏差",
            value:
              typeof onlineCalibration.averageCalibrationGap === "number"
                ? onlineCalibration.averageCalibrationGap.toFixed(2)
                : "--",
            detail: "正值说明线上表现高于离线预测，负值说明离线过于乐观",
          },
          {
            label: "权重建议",
            value: String(onlineCalibration.weightRecommendations.length),
            detail: "基于真实回流生成的权重调整建议",
          },
        ].map((item) => (
          <article key={item.label} className={metricCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
            <div className="mt-3 text-3xl text-ink text-balance">{item.value}</div>
            <div className="mt-3 text-sm text-inkSoft">{item.detail}</div>
          </article>
        ))}
      </section>

      <AdminWritingEvalInsightsClient
        onlineCalibration={onlineCalibration as any}
        strategyRecommendations={insights.strategyRecommendations as any}
        scoringProfiles={scoringProfiles as any}
      />
    </div>
  );
}
