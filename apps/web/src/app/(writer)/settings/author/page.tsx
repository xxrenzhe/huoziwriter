import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { PersonaManager } from "@/components/persona-client";
import { SeriesManager } from "@/components/series-client";
import { WritingStyleProfilesPanel } from "@/components/writing-style-profiles-client";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { getAuthorSettingsData } from "../data";
import { SettingsSubpageShell } from "../shell";

const actionLinkClassName = buttonStyles({ variant: "secondary" });
const introCardClassName = surfaceCardStyles({ tone: "warm", padding: "md" });
const sectionCardClassName = surfaceCardStyles({ padding: "md" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const managerSectionClassName = cn(surfaceCardStyles({ padding: "md" }), "space-y-4");
const unavailableStyleCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "md" }),
  "text-sm leading-7 text-inkSoft",
);

export default async function SettingsAuthorPage() {
  const data = await getAuthorSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, personas, personaCatalog, series, writingStyleProfiles } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const defaultPersona = personas.find((item) => item.isDefault) ?? personas[0] ?? null;

  return (
    <SettingsSubpageShell
      current="author"
      description="先固定写作身份，再沉淀可复用的文风资产。稿件应该从系列继承人设和写作约束，而不是在写作中途临时切换口气。"
      stats={[
        {
          label: "作者人设",
          value: `${personas.length}${planSnapshot.personaLimit > 0 ? ` / ${planSnapshot.personaLimit}` : ""}`,
          note: defaultPersona ? `默认人设：${defaultPersona.name}` : "先补 1 个默认人设",
        },
        {
          label: "内容系列",
          value: String(series.length),
          note: series.length > 0 ? "系列负责固定长期判断线" : "先补 1 个长期经营系列",
        },
        {
          label: "风格资产",
          value: planSnapshot.writingStyleProfileLimit > 0 ? `${writingStyleProfiles.length} / ${planSnapshot.writingStyleProfileLimit}` : "未开放",
          note: planSnapshot.writingStyleProfileLimit > 0 ? "沉淀可复用的语感与节奏" : `当前套餐 ${formatPlanDisplayName(plan?.name || effectivePlanCode)} 暂未开放`,
        },
      ]}
      actions={
        <>
          <Link href="/articles" className={actionLinkClassName}>
            去稿件区
          </Link>
          <Link href="/warroom" className={actionLinkClassName}>
            去作战台
          </Link>
        </>
      }
    >
      <section id="personas-series" className="space-y-4 scroll-mt-8">
        <div className={introCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">作者与系列</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
            先固定写作身份，再沉淀可复用的文风资产。
          </div>
          <div className="mt-3 text-sm leading-7 text-inkSoft">
            每篇稿件都应该先归属一个长期经营的系列，再从系列绑定的人设和风格资产继承约束，而不是在后期随手切换口气。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              label: "默认人设",
              value: defaultPersona?.name || "未设置",
              note: defaultPersona ? "新稿件会优先继承这个写作身份。" : "建议至少先设一个默认人设。",
            },
            {
              label: "系列沉淀",
              value: String(series.length),
              note: series.length > 0 ? "每个系列都应该代表一条长期判断线。" : "先补 1 个长期经营系列。",
            },
            {
              label: "风格资产",
              value:
                planSnapshot.writingStyleProfileLimit > 0
                  ? `${writingStyleProfiles.length} / ${planSnapshot.writingStyleProfileLimit}`
                  : "未开放",
              note:
                planSnapshot.writingStyleProfileLimit > 0
                  ? "沉淀语感、段落节奏和排版偏好。"
                  : `当前套餐 ${formatPlanDisplayName(plan?.name || effectivePlanCode)} 暂未开放`,
            },
          ].map((item) => (
            <article key={item.label} className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
            </article>
          ))}
        </div>

        <div className={managerSectionClassName}>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">系列骨架</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">先固定长期判断线，再把稿件挂到正确系列里。</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              系列负责约束选题方向、论证重心和目标读者，是稿件继承作者资产的第一层入口。
            </div>
          </div>
          <SeriesManager
            initialSeries={series.map((item) => ({
              id: item.id,
              name: item.name,
              personaId: item.personaId,
              personaName: item.personaName,
              thesis: item.thesis,
              targetAudience: item.targetAudience,
              activeStatus: item.activeStatus,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            }))}
            personas={personas.map((item) => ({ id: item.id, name: item.name }))}
          />
        </div>

        <div className={managerSectionClassName}>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">人设资产</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">让作者身份稳定下来，而不是在写作中途临时换口气。</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              人设会决定表达习惯、判断位置和写作边界，系列在调用时只负责继承，不负责现场重新生成身份。
            </div>
          </div>
          <PersonaManager
            initialPersonas={personas}
            maxCount={planSnapshot.personaLimit}
            currentPlanName={plan?.name || effectivePlanCode}
            canAnalyzeFromSources={planSnapshot.canAnalyzePersonaFromSources}
            availableWritingStyles={writingStyleProfiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
            }))}
            tagCatalog={personaCatalog}
          />
        </div>

        {planSnapshot.writingStyleProfileLimit > 0 ? (
          <div id="style-assets" className={managerSectionClassName}>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">风格资产</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">把真实语感和节奏沉淀成可复用的风格模板。</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                这里管理的是长期可复用的风格资产，而不是为单篇稿件临时打补丁的局部措辞。
              </div>
            </div>
            <WritingStyleProfilesPanel
              profiles={writingStyleProfiles}
              maxCount={planSnapshot.writingStyleProfileLimit}
            />
          </div>
        ) : (
          <div id="style-assets" className={unavailableStyleCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">写作风格资产</div>
            <div className="mt-3 font-serifCn text-2xl text-ink text-balance">当前套餐还不能把分析结果沉淀到个人空间。</div>
            <div className="mt-4 text-sm leading-7 text-inkSoft">
              当前套餐支持在作者与系列里分析文章，但暂不支持保存到个人空间。升级到 Pro 或 Ultra 后可长期沉淀为风格资产。
            </div>
          </div>
        )}
      </section>
    </SettingsSubpageShell>
  );
}
