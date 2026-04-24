import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { PersonaManager } from "@/components/persona-client";
import { SeriesManager } from "@/components/series-client";
import { TopicBacklogManager } from "@/components/topic-backlog-manager";
import { WritingStyleProfilesPanel } from "@/components/writing-style-profiles-client";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { getAuthorSettingsData } from "../data";
import { SettingsSubpageShell } from "../shell";

const actionLinkClassName = buttonStyles({ variant: "secondary" });
const introCardClassName = surfaceCardStyles({ tone: "warm", padding: "md" });
const sectionCardClassName = surfaceCardStyles({ padding: "md" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const managerSectionClassName = cn(surfaceCardStyles({ padding: "md" }), "space-y-4");
const queueCardClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "md" }),
  "flex h-full flex-col shadow-none",
);
const unavailableStyleCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "md" }),
  "text-sm leading-7 text-inkSoft",
);
const formulaCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "md" }),
  "grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]",
);
const metaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const mutedChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs text-inkMuted shadow-none",
);

export default async function SettingsAuthorPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}) {
  const data = await getAuthorSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, personas, personaCatalog, series, writingStyleProfiles, topicBacklogs } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const defaultPersona = personas.find((item) => item.isDefault) ?? personas[0] ?? null;
  const writingStyleSampleLimit = effectivePlanCode === "ultra" ? 10 : effectivePlanCode === "pro" ? 5 : 3;
  const resolvedSearchParams = (await searchParams) ?? {};
  const activePanel = typeof resolvedSearchParams.panel === "string" ? resolvedSearchParams.panel : Array.isArray(resolvedSearchParams.panel) ? resolvedSearchParams.panel[0] : "";
  const activeSeriesCount = series.filter((item) => item.activeStatus === "active").length;
  const seriesWithoutPersonaCount = series.filter((item) => item.personaId == null).length;
  const emptyBacklogCount = topicBacklogs.filter((item) => item.itemCount <= 0).length;
  const untouchedBacklogCount = topicBacklogs.filter((item) => !item.lastGeneratedAt).length;
  const authorIssueCount =
    (defaultPersona ? 0 : 1) +
    (series.length === 0 ? 1 : 0) +
    (activeSeriesCount === 0 && series.length > 0 ? 1 : 0) +
    seriesWithoutPersonaCount +
    (topicBacklogs.length === 0 ? 1 : 0) +
    emptyBacklogCount +
    (planSnapshot.writingStyleProfileLimit > 0 && writingStyleProfiles.length === 0 ? 1 : 0);
  const backlogSectionClassName = cn(
    managerSectionClassName,
    activePanel === "backlogs" ? "border-cinnabar/50 bg-surfaceWarm shadow-[0_0_0_1px_rgba(167,48,50,0.14)]" : "",
  );

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

        <div className={sectionCardClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理作者经营任务</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
                先把默认人设、长期系列和选题库存补齐，再让稿件稳定继承作者资产。
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                这里优先列出真正会影响起稿、系列继承和批量生产的缺口。先补这些，再去作战台或稿件区推进具体文章。
              </div>
            </div>
            <div className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前待处理</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{String(authorIssueCount)}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">
                {authorIssueCount > 0 ? "先把作者资产补成可继承状态。" : "当前作者经营链路已经具备稳定起稿条件。"}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {!defaultPersona ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">默认人设缺失</div>
                <div className="mt-2 font-medium text-ink">当前还没有默认作者人设</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  没有默认人设时，新稿件和系列继承都缺少稳定的写作身份。先补 1 个默认人设，再继续批量开稿。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={metaChipClassName}>影响：起稿继承</span>
                  <span className={mutedChipClassName}>建议优先处理</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#personas-series" className={actionLinkClassName}>
                    去补人设
                  </Link>
                </div>
              </article>
            ) : null}

            {series.length === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">长期系列缺失</div>
                <div className="mt-2 font-medium text-ink">当前还没有任何内容系列</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  系列为空时，作战台裂变和稿件推进都缺少长期判断线。至少先补 1 个长期经营系列，再把选题挂到正确口径里。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={metaChipClassName}>影响：系列继承</span>
                  <span className={mutedChipClassName}>建议优先处理</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#personas-series" className={actionLinkClassName}>
                    去建系列
                  </Link>
                </div>
              </article>
            ) : null}

            {activeSeriesCount === 0 && series.length > 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">无活跃系列</div>
                <div className="mt-2 font-medium text-ink">已有系列，但当前没有一条处于活跃状态</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  所有系列都停用时，选题和新稿很容易失去长期经营主轴。先恢复至少 1 条活跃系列，作为接下来起稿的默认落点。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={metaChipClassName}>当前系列 {series.length} 条</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#personas-series" className={actionLinkClassName}>
                    去调整系列状态
                  </Link>
                </div>
              </article>
            ) : null}

            {seriesWithoutPersonaCount > 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">系列未绑定人设</div>
                <div className="mt-2 font-medium text-ink">有 {seriesWithoutPersonaCount} 条系列还没有绑定作者人设</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  系列没有绑定人设时，稿件继承只剩下空壳标题，无法稳定承接表达方式与判断位置。建议逐条补齐绑定。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#personas-series" className={actionLinkClassName}>
                    去补系列绑定
                  </Link>
                </div>
              </article>
            ) : null}

            {topicBacklogs.length === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">选题库存为空</div>
                <div className="mt-2 font-medium text-ink">当前还没有任何选题库</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  没有选题库存时，周末备题和工作日批量转稿都无法成立。先建 1 个 backlog，把散落题目收成库存。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#topic-backlogs" className={actionLinkClassName}>
                    去建选题库
                  </Link>
                  <Link href="/warroom" className={actionLinkClassName}>
                    回作战台看裂变
                  </Link>
                </div>
              </article>
            ) : null}

            {emptyBacklogCount > 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">空选题库待补货</div>
                <div className="mt-2 font-medium text-ink">有 {emptyBacklogCount} 个选题库还没有题目</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  选题库已创建但没有库存时，批量生成入口无法发挥作用。先把题目、目标读者和核心判断补进去，再统一生成稿件。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {untouchedBacklogCount > 0 ? (
                    <span className={metaChipClassName}>其中 {untouchedBacklogCount} 个还未生成过</span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#topic-backlogs" className={actionLinkClassName}>
                    去补选题库存
                  </Link>
                </div>
              </article>
            ) : null}

            {planSnapshot.writingStyleProfileLimit > 0 && writingStyleProfiles.length === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">风格资产待沉淀</div>
                <div className="mt-2 font-medium text-ink">当前套餐已开放，但还没有任何写作风格资产</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  先沉淀 1 份可复用的语感与节奏模板，后续系列、人设和稿件才能更稳定地继承你的表达方式。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#style-assets" className={actionLinkClassName}>
                    去建风格资产
                  </Link>
                </div>
              </article>
            ) : null}

            {authorIssueCount === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">经营链路健康</div>
                <div className="mt-2 font-medium text-ink">默认人设、系列、选题库存和风格资产都已具备基础条件</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  当前作者经营链路没有明显阻塞。可以直接回到作战台推进裂变，或在稿件区继续从系列继承资产开稿。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="/warroom" className={actionLinkClassName}>
                    去作战台
                  </Link>
                  <Link href="/articles" className={actionLinkClassName}>
                    去稿件区
                  </Link>
                </div>
              </article>
            ) : null}
          </div>
        </div>

        <div className={formulaCardClassName}>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">质量公式</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
              系统提示词与模型由系统固定，作者真正能调的是风格资产与三要素质量。
            </div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              先把人设、系列、文风资产沉淀稳，再在稿件里把原型、读者快照、核心判断和证据打透。不要把问题归因到模型切换。
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                label: "系统固定",
                note: "系统提示词、基础模型、主流程闸门由产品统一维护，不需要你每篇重复配置。",
              },
              {
                label: "作者可控",
                note: "风格资产 + 三要素输入质量，决定这篇稿件能不能写得像你、写得够准。",
              },
            ].map((item) => (
              <article key={item.label} className={summaryCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">{item.note}</div>
              </article>
            ))}
          </div>
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
              preHook: item.preHook ?? null,
              postHook: item.postHook ?? null,
              defaultLayoutTemplateId: item.defaultLayoutTemplateId ?? null,
              platformPreference: item.platformPreference ?? null,
              targetPackHint: item.targetPackHint ?? null,
              defaultArchetype: item.defaultArchetype ?? null,
              defaultDnaId: item.defaultDnaId ?? null,
              rhythmOverride: item.rhythmOverride ?? null,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            }))}
            personas={personas.map((item) => ({ id: item.id, name: item.name }))}
            availableWritingStyles={writingStyleProfiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
            }))}
          />
        </div>

        <div id="topic-backlogs" className={backlogSectionClassName}>
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">选题库</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">把散落的选题先收成库存，再成批转成稿件。</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              选题库承接“周末集中备题，工作日批量生产”的节奏。先把题目、目标读者和核心判断存下来，再统一生成到稿件区继续推进。
            </div>
            {activePanel === "backlogs" ? (
              <div className="mt-3 text-sm leading-7 text-cinnabar">
                当前从作战台副入口进入，已聚焦到选题库存量与批量生成面板。
              </div>
            ) : null}
          </div>
          <TopicBacklogManager
            initialBacklogs={topicBacklogs.map((backlog) => ({
              id: backlog.id,
              seriesId: backlog.seriesId,
              seriesName: backlog.seriesName,
              name: backlog.name,
              description: backlog.description,
              itemCount: backlog.itemCount,
              lastGeneratedAt: backlog.lastGeneratedAt,
              items: backlog.items.map((item) => ({
                id: item.id,
                theme: item.theme,
                archetype: item.archetype,
                targetAudience: item.targetAudience,
                readerSnapshotHint: item.readerSnapshotHint,
                strategyDraft: item.strategyDraft,
                status: item.status,
                generatedArticleId: item.generatedArticleId,
                generatedBatchId: item.generatedBatchId,
                generatedAt: item.generatedAt,
              })),
            }))}
            seriesOptions={series.map((item) => ({
              id: item.id,
              name: item.name,
              personaName: item.personaName,
              activeStatus: item.activeStatus,
            }))}
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
              sampleLimit={writingStyleSampleLimit}
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
