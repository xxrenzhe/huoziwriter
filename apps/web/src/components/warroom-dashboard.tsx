import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { CreateArticleForm, WriterPaperEmptyState } from "@/components/dashboard-client";
import { WarroomTopicFissionPanel } from "@/components/warroom-topic-fission-panel";
import type { WarroomData } from "@/lib/warroom";

const heroSectionBackgroundClassName = "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,241,236,0.96))]";
const battleEyebrowClassName = "hidden text-xs uppercase tracking-[0.32em] text-cinnabar sm:block";
const sectionEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-cinnabar";
const statEyebrowClassName = "text-[11px] uppercase tracking-[0.2em] text-inkMuted";
const detailEyebrowClassName = "text-[11px] uppercase tracking-[0.18em] text-inkMuted";
const heroTitleClassName = "mt-3 font-serifCn text-4xl font-semibold text-ink text-balance md:text-5xl";
const sectionTitleClassName = "mt-3 font-serifCn text-3xl text-ink text-balance";
const heroBodyCopyClassName = "mt-4 max-w-3xl text-base leading-8 text-inkSoft";
const bodyCopyClassName = "text-sm leading-7 text-inkSoft";
const sectionHeaderClassName = "flex flex-wrap items-end justify-between gap-3";
const chipRowClassName = "mt-3 flex flex-wrap gap-2 text-xs text-inkMuted";
const chipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const chipMetaClassName = cn(chipClassName, "text-[11px] uppercase tracking-[0.16em] text-inkMuted");
const mutedChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs text-inkMuted shadow-none",
);
const timeChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-2 text-xs text-inkSoft shadow-none",
);
const sectionDividerClassName = "mt-5 border-t border-lineStrong pt-4";
const emptyWorkspaceSectionClassName = cn(surfaceCardStyles({ tone: "warm" }), "border-lineStrong", heroSectionBackgroundClassName, "p-6 md:p-10 shadow-none");
const heroSectionClassName = cn(surfaceCardStyles({ tone: "warm" }), "border-lineStrong", heroSectionBackgroundClassName, "p-4 sm:p-6 lg:p-8 shadow-none");
const dashboardSectionClassName = cn(surfaceCardStyles(), "border-lineStrong p-4 shadow-none sm:p-6");
const statCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-lineStrong bg-surface shadow-none");
const focusPanelClassName = cn(surfaceCardStyles(), "border-lineStrong bg-surface px-4 py-5 shadow-none sm:px-5");
const focusSummaryCardClassName = cn(surfaceCardStyles({ tone: "subtle" }), "border-lineStrong px-3 py-3 shadow-none");
const sectionSummaryCardClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "min-w-[168px] px-3 py-3 text-right shadow-none",
);
const topicCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-lineStrong bg-surfaceHighlight shadow-none");
const interactiveTileCardClassName = cn(
  surfaceCardStyles({ interactive: true }),
  "block border-lineStrong bg-surfaceHighlight shadow-none hover:border-cinnabar/50 hover:bg-surface",
);
const composePanelClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "md" }), "border-lineStrong shadow-none");
const pendingOutcomeCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-lineStrong bg-surfaceHighlight shadow-none");
const primaryActionLinkClassName = buttonStyles({ variant: "primary" });
const secondaryActionLinkClassName = buttonStyles({ variant: "secondary" });
const warmSecondaryActionLinkClassName = cn(secondaryActionLinkClassName, "bg-surfaceWarm");
const heroPrimaryActionLinkClassName = cn(primaryActionLinkClassName, "min-h-0 px-5");
const heroSecondaryActionLinkClassName = cn(secondaryActionLinkClassName, "min-h-0 px-5");
const focusActionLinkClassName = cn("mt-5", primaryActionLinkClassName);
const progressDotClassName = "block h-2.5 w-2.5 border";

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "最近";
  }
  const diff = Date.now() - timestamp;
  if (diff < 60_000) {
    return "刚刚";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} 小时前`;
  }
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function buildPendingOutcomeCopy(item: WarroomData["pendingOutcomeArticles"][number]) {
  if (item.missingWindowCodes.length > 0) {
    return `还缺 ${item.missingWindowCodes.join(" / ")} 结果快照。`;
  }
  if (item.hitStatus === "pending") {
    return item.nextAction || item.reviewSummary || "快照已补齐，但还没完成命中判定和复盘结论。";
  }
  return item.reviewSummary || "结果回流仍有待补项。";
}

function getDraftStepPosition(steps: WarroomData["drafts"][number]["workflow"]["steps"]) {
  const currentIndex = steps.findIndex((step) => step.status === "current");
  if (currentIndex >= 0) {
    return currentIndex + 1;
  }
  const completedCount = steps.filter((step) => step.status === "completed").length;
  return Math.min(completedCount + 1, steps.length || 1);
}

function ProgressDots({
  steps,
}: {
  steps: WarroomData["drafts"][number]["workflow"]["steps"];
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step) => {
        const tone =
          step.status === "completed"
            ? "border-ink bg-ink"
            : step.status === "current"
              ? "border-cinnabar bg-surface"
              : step.status === "failed"
                ? "border-cinnabar bg-cinnabar/15"
                : "border-lineStrong bg-transparent";
        return <span key={step.code} aria-hidden="true" className={cn(progressDotClassName, tone)} />;
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className={statCardClassName}>
      <div className={statEyebrowClassName}>{label}</div>
      <div className="mt-3 font-serifCn text-3xl text-ink sm:text-4xl">{value}</div>
      <p className="mt-2 text-sm leading-6 text-inkSoft">{note}</p>
    </article>
  );
}

function SectionSummary({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={sectionSummaryCardClassName}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">{label}</div>
      <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{value}</div>
      <div className="mt-1 text-xs leading-6 text-inkMuted">{detail}</div>
    </div>
  );
}

function getPendingStatusChipClassName(isOverdue: boolean) {
  return cn(
    surfaceCardStyles({ tone: isOverdue ? "warning" : "subtle", padding: "sm" }),
    "px-3 py-2 text-xs shadow-none",
    isOverdue ? "text-warning" : "text-inkSoft",
  );
}

export function WarroomDashboard({
  warroom,
}: {
  warroom: WarroomData;
}) {
  const firstTopic = warroom.topics[0] ?? null;
  const firstDraft = warroom.drafts[0] ?? null;
  const firstPlaybook = warroom.playbooks[0] ?? null;

  if (warroom.summary.workspaceEmpty) {
    return (
      <section className={emptyWorkspaceSectionClassName}>
        <div className={battleEyebrowClassName}>TODAY&apos;S BATTLE</div>
        <h1 className={heroTitleClassName}>
          你的作战台还是空的，先让第一条写作链路开始转起来。
        </h1>
        <p className={heroBodyCopyClassName}>
          先在设置里接入信源，或先立一个系列与第一篇稿件。warroom 不负责堆功能，只负责把今天该做的判断排在你面前。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/settings/sources" className={heroPrimaryActionLinkClassName}>
            去接入信源
          </Link>
          <Link href="/settings/author" className={heroSecondaryActionLinkClassName}>
            先建系列
          </Link>
          <Link href="/articles" className={heroSecondaryActionLinkClassName}>
            手动建第一篇稿
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className={heroSectionClassName}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="min-w-0">
            <div className={battleEyebrowClassName}>TODAY&apos;S BATTLE</div>
            <h1 className={heroTitleClassName}>
              今天最值得写什么，先在这里定优先级。
            </h1>
            <p className={heroBodyCopyClassName}>
              作战台只保留四个判断面板: 今天写什么、在推什么、等什么结果、最近学到什么。先做判断，再决定要不要打开更深的页面。
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-inkMuted">
              <span>已发 {warroom.summary.publishedCount} 篇</span>
              <span>命中 {warroom.summary.hitCount} 篇</span>
              <span>差一点 {warroom.summary.nearMissCount} 篇</span>
              <span>待回流 {warroom.summary.pendingOutcomeCount} 篇</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="今日选题"
                value={String(warroom.summary.topicCount)}
                note={warroom.summary.canStartRadar ? "优先从热点与系列匹配项起稿。" : "当前计划先盯系统给出的优先位。"}
              />
              <StatCard
                label="待推进稿件"
                value={String(warroom.summary.draftCount)}
                note={warroom.summary.draftCount > 0 ? "先清空正在写的稿件，再开新坑。" : "当前没有积压草稿。"}
              />
              <StatCard
                label="待回流稿件"
                value={String(warroom.summary.pendingOutcomeCount)}
                note={warroom.summary.overdueOutcomeCount > 0 ? `${warroom.summary.overdueOutcomeCount} 篇已超期待补。` : "按缺失窗口与命中判定直接计算。"}
              />
              <StatCard
                label="素材库存"
                value={String(warroom.summary.fragmentCount)}
                note="素材与证据会在稿件推进阶段被持续调用。"
              />
            </div>
          </div>

          <aside className={focusPanelClassName}>
            <div className={sectionEyebrowClassName}>{warroom.summary.focus.eyebrow}</div>
            <h2 className={sectionTitleClassName}>{warroom.summary.focus.title}</h2>
            <p className={cn("mt-3", bodyCopyClassName)}>{warroom.summary.focus.detail}</p>
            <Link href={warroom.summary.focus.href} className={focusActionLinkClassName}>
              {warroom.summary.focus.actionLabel}
            </Link>
            <div className="mt-6 space-y-3 border-t border-lineStrong pt-4">
              <div className={focusSummaryCardClassName}>
                <div className={detailEyebrowClassName}>今天写什么</div>
                <div className="mt-2 text-sm leading-7 text-ink">{firstTopic ? firstTopic.title : "先把在推稿件清掉"}</div>
              </div>
              <div className={focusSummaryCardClassName}>
                <div className={detailEyebrowClassName}>在推什么</div>
                <div className="mt-2 text-sm leading-7 text-ink">{firstDraft ? firstDraft.title : "当前没有在推稿件"}</div>
              </div>
              <div className={focusSummaryCardClassName}>
                <div className={detailEyebrowClassName}>最近学到什么</div>
                <div className="mt-2 text-sm leading-7 text-ink">{firstPlaybook ? firstPlaybook.label : "等待更多真实回流样本"}</div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className={dashboardSectionClassName}>
        <div className={sectionHeaderClassName}>
          <div className="min-w-0">
            <div className={sectionEyebrowClassName}>今日优先选题</div>
            <h2 className={sectionTitleClassName}>先选最值得写的，不先堆能力入口。</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SectionSummary
              label="当前候选"
              value={String(warroom.topics.length)}
              detail={warroom.topics.length > 0 ? "优先位按当前推荐顺序展开。" : "当前没有新的高优先题。"}
            />
            <Link href="/articles" className={warmSecondaryActionLinkClassName}>
              进入稿件区
            </Link>
            <Link href="/settings/author?panel=backlogs#topic-backlogs" className={secondaryActionLinkClassName}>
              去选题库
            </Link>
            <Link href="/settings/sources" className={secondaryActionLinkClassName}>
              补信源
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {warroom.topics.map((topic, index) => (
            <article key={topic.id} className={topicCardClassName}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">优先位 {index + 1}</div>
                <div className={chipMetaClassName}>
                  {topic.recommendationType}
                </div>
              </div>
              <h3 className="mt-3 font-serifCn text-2xl text-ink text-balance">{topic.title}</h3>
              <p className={cn("mt-3", bodyCopyClassName)}>{topic.summary || topic.recommendationReason}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-inkMuted">
                <span className={chipClassName}>{topic.sourceName}</span>
                {topic.matchedPersonaName ? <span className={chipClassName}>{topic.matchedPersonaName}</span> : null}
                {topic.suggestedSeriesId ? <span className={chipClassName}>已有建议系列</span> : null}
              </div>
              <div className={sectionDividerClassName}>
                <div className={detailEyebrowClassName}>为什么现在写</div>
                <p className={cn("mt-2", bodyCopyClassName)}>{topic.recommendationReason}</p>
              </div>
              <WarroomTopicFissionPanel topic={topic} seriesOptions={warroom.series} backlogOptions={warroom.topicBacklogs} />
            </article>
          ))}
          {warroom.topics.length === 0 ? (
            <div className="lg:col-span-2 2xl:col-span-3">
              <WriterPaperEmptyState
                eyebrow="今日优先选题"
                title="今天暂时没有新的高优先题。"
                detail="继续推进现有稿件，或去补更贴近问题域的信源。没有新题时，结果回流通常比继续扩入口更值钱。"
                prompts={[
                  "优先清掉已经开头的稿件，再回来等新题。",
                  "自定义信源越贴近系列，优先位越准。",
                  "没有新题时，结果回流往往比继续扩入口更值钱。",
                ]}
                actionHref="/articles"
                actionLabel="进入稿件区"
                secondaryHref="/settings/sources"
                secondaryLabel="去补信源"
                compact
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className={dashboardSectionClassName}>
        <div className={sectionHeaderClassName}>
          <div className="min-w-0">
            <div className={sectionEyebrowClassName}>待推进稿件</div>
            <h2 className={sectionTitleClassName}>把已经开头的稿件继续推完。</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SectionSummary
              label="当前积压"
              value={String(warroom.drafts.length)}
              detail={warroom.drafts.length > 0 ? "先清空正在写的稿件，再开新坑。" : "当前没有需要续写的稿件。"}
            />
            <Link href="/articles" className={warmSecondaryActionLinkClassName}>
              查看全部稿件
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <div className="space-y-3">
            {warroom.drafts.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className={cn(interactiveTileCardClassName, "p-4 sm:p-5")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">
                      {article.workflow.currentStepTitle} · {getDraftStepPosition(article.workflow.steps)}/{article.workflow.steps.length || 6}
                    </div>
                    <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{article.title}</div>
                  </div>
                  <div className={timeChipClassName}>
                    更新 {formatRelativeTime(article.updatedAt)}
                  </div>
                </div>
                <div className={chipRowClassName}>
                  {article.seriesName ? <span className={chipClassName}>{article.seriesName}</span> : null}
                  <span className={chipClassName}>{article.targetPackage || "目标包待定"}</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <ProgressDots steps={article.workflow.steps} />
                  <span className="text-xs uppercase tracking-[0.16em] text-inkMuted">六步主链路</span>
                </div>
                <p className={cn("mt-3", bodyCopyClassName)}>{article.workflow.nextFocus}</p>
              </Link>
            ))}
            {warroom.drafts.length === 0 ? (
              <WriterPaperEmptyState
                eyebrow="待推进稿件"
                title="案头暂时没有半截稿。"
                detail="当前没有需要续写的稿件。你可以直接立一篇新稿，或者先去结果区补齐已经发布稿件的回流。"
                prompts={[
                  "先新建一篇最值得写的稿件，不必同时开多坑。",
                  "如果已有发布稿还没补结果，优先把回流补完整。",
                  "草稿区越干净，作战台判断越不容易失真。",
                ]}
                actionHref="/articles#create-article"
                actionLabel="去新建稿件"
                secondaryHref="/articles"
                secondaryLabel="进入稿件区"
                compact
              />
            ) : null}
          </div>

          <aside className={composePanelClassName}>
            <div className={sectionEyebrowClassName}>手动立稿</div>
            <h3 className="mt-3 font-serifCn text-2xl text-ink text-balance">今天不从优先位开，也可以直接在这里起稿。</h3>
            <p className={cn("mt-3", bodyCopyClassName)}>
              当你已经知道要写什么时，不必跳离作战台。直接定标题和系列，让稿件进入六步主链路。
            </p>
            <div className="mt-5">
              <CreateArticleForm seriesOptions={warroom.series} />
            </div>
          </aside>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-2">
        <section className={dashboardSectionClassName}>
          <div className={sectionHeaderClassName}>
            <div className="min-w-0">
              <div className={sectionEyebrowClassName}>待回流稿件</div>
              <h2 className={sectionTitleClassName}>已经发布的稿件，下一步是补结果。</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SectionSummary
                label="待补回流"
                value={String(warroom.pendingOutcomeArticles.length)}
                detail={
                  warroom.summary.overdueOutcomeCount > 0
                    ? `${warroom.summary.overdueOutcomeCount} 篇已超期待补。`
                    : "按缺失窗口和命中判定直接排序。"
                }
              />
              <Link href="/reviews" className={warmSecondaryActionLinkClassName}>
                去看复盘
              </Link>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {warroom.pendingOutcomeArticles.map((item) => (
              <article
                key={item.article.id}
                className={cn(pendingOutcomeCardClassName, item.isOverdue && "border-warning/40 bg-surfaceWarning")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn("text-xs uppercase tracking-[0.18em]", item.isOverdue ? "text-cinnabar" : "text-inkMuted")}>
                      {item.isOverdue ? "超期待补" : "待回流"}
                    </div>
                    <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{item.article.title}</div>
                  </div>
                  <div className={getPendingStatusChipClassName(item.isOverdue)}>
                    {item.missingWindowCodes.length > 0 ? `缺 ${item.missingWindowCodes.join(" / ")}` : "待完成判定"}
                  </div>
                </div>
                <div className={chipRowClassName}>
                  {item.article.seriesName ? <span className={chipClassName}>{item.article.seriesName}</span> : null}
                  {item.targetPackage ? <span className={chipClassName}>{item.targetPackage}</span> : null}
                  <span className={mutedChipClassName}>更新 {item.daysSinceUpdate} 天前</span>
                </div>
                <p className={cn("mt-3", bodyCopyClassName)}>{buildPendingOutcomeCopy(item)}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={`/articles/${item.article.id}`} className={secondaryActionLinkClassName}>
                    打开稿件
                  </Link>
                  <Link href="/reviews" className={secondaryActionLinkClassName}>
                    去看复盘
                  </Link>
                </div>
              </article>
            ))}
            {warroom.pendingOutcomeArticles.length === 0 ? (
              <WriterPaperEmptyState
                eyebrow="待回流稿件"
                title="结果区暂时没有待补回流。"
                detail="要么当前还没有发布稿件，要么已发布稿件的 24h / 72h / 7d 快照与命中判定已经补齐。"
                prompts={[
                  "新稿发布后，记得按时间窗回来补快照。",
                  "结果回流补得越完整，打法沉淀越可靠。",
                  "没有待补项时，可以回去继续推进新稿。",
                ]}
                actionHref="/articles"
                actionLabel="查看全部稿件"
                compact
              />
            ) : null}
          </div>
        </section>

        <section className={dashboardSectionClassName}>
          <div className={sectionHeaderClassName}>
            <div className="min-w-0">
              <div className={sectionEyebrowClassName}>本周有效打法</div>
              <h2 className={sectionTitleClassName}>先沉淀能复用的打法，再谈更多功能。</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SectionSummary
                label="打法沉淀"
                value={String(warroom.playbooks.length)}
                detail={warroom.playbooks.length > 0 ? "只展示本周已有结果样本的打法。" : "当前还没有可复用的打法沉淀。"}
              />
              <Link href="/reviews" className={warmSecondaryActionLinkClassName}>
                查看复盘页
              </Link>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {warroom.playbooks.map((item) => {
              const hitRate = item.articleCount > 0 ? Math.round((item.hitCount / item.articleCount) * 100) : 0;
              return (
                <Link key={item.label} href="/reviews" className={cn(interactiveTileCardClassName, "p-4")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="font-medium text-ink">{item.label}</div>
                    <div className={chipMetaClassName}>
                      命中率 {hitRate}%
                    </div>
                  </div>
                  <div className={cn("mt-3", bodyCopyClassName)}>
                    命中 {item.hitCount} 篇 · 差一点 {item.nearMissCount} 篇 · 共 {item.articleCount} 个结果样本
                  </div>
                  <div className="mt-3 border-t border-lineStrong pt-3 text-xs leading-6 text-inkMuted">
                    {item.latestArticleTitle ? `最近出现在《${item.latestArticleTitle}》` : "等待更多结果样本"}
                  </div>
                </Link>
              );
            })}
            {warroom.playbooks.length === 0 ? (
              <div className="md:col-span-2">
                <WriterPaperEmptyState
                  eyebrow="本周有效打法"
                  title="经验库还没攒到能复用的程度。"
                  detail="打法区需要真实回流样本，而不是空想模板。先补结果快照、命中判定和打法标签，这里才会慢慢长出可复用经验。"
                  prompts={[
                    "每篇稿至少补一次明确的复盘结论。",
                    "打法标签写得越具体，后续沉淀越有用。",
                    "先求真实样本，再谈泛化模板。",
                  ]}
                  actionHref="/reviews"
                  actionLabel="去补结果回流"
                  compact
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
