import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { WriterAssetCenterClient } from "@/components/asset-center-client";
import { TemplateHtmlImportPanel } from "@/components/template-html-import-panel";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { summarizeTemplateRenderConfig } from "@/lib/template-rendering";
import {
  formatTemplateLastUsed,
  getAssetsSettingsData,
  parseStringList,
  summarizeTemplateParagraphLength,
  summarizeTemplateSource,
  summarizeTemplateTone,
} from "../data";
import { SettingsSubpageShell } from "../shell";

const assetSummaryCardClassName = surfaceCardStyles({ padding: "md" });
const assetQueueCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm", interactive: true }), "block shadow-none hover:border-cinnabar/40 hover:bg-surface");
const templateSectionClassName = surfaceCardStyles({ padding: "md" });
const templateCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "shadow-none");
const templateSummaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const templateMetaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-2 text-xs text-inkSoft shadow-none",
);
const templateEmptyStateClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "border-dashed text-sm leading-7 text-inkSoft",
);

export default async function SettingsAssetsPage() {
  const data = await getAssetsSettingsData();
  if (!data) {
    return null;
  }

  const { session, planContext, workspaceAssets, fragments, knowledgeCards, assetFiles, templates } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const ownedTemplates = templates.filter((template) => template.ownerUserId === session.userId);
  const officialTemplateCount = Math.max(templates.length - ownedTemplates.length, 0);
  const activatedTemplateCount = ownedTemplates.filter((template) => (template.usageCount ?? 0) > 0).length;
  const recentlyUsedTemplateCount = ownedTemplates.filter((template) => Boolean(template.lastUsedAt)).length;
  const imageAssets = assetFiles
    .filter((item) => item.assetType === "cover_image" || String(item.mimeType || "").startsWith("image/"));
  const conflictedKnowledgeCards = knowledgeCards.filter((card) => card.status === "conflicted");
  const staleKnowledgeCards = knowledgeCards.filter((card) => card.status === "stale");
  const problematicImageAssets = imageAssets.filter((asset) => asset.status !== "ready");

  return (
    <SettingsSubpageShell
      current="assets"
      description="把长期沉淀的素材、背景卡、模板和图像统一收回到资产中心。这里负责库存管理，不承担写作主链路的决策负担。"
      stats={[
        {
          label: "写作库存",
          value: `${workspaceAssets.articlesCount + workspaceAssets.fragmentsCount}`,
          note: `稿件 ${workspaceAssets.articlesCount} 篇，素材 ${workspaceAssets.fragmentsCount} 条`,
        },
        {
          label: "背景卡",
          value: String(workspaceAssets.knowledgeCardsCount),
          note: `已激活 ${workspaceAssets.activeKnowledgeCardsCount} 张，冲突 ${workspaceAssets.conflictedKnowledgeCardsCount} 张`,
        },
        {
          label: "私有模板",
          value: planSnapshot.customTemplateLimit > 0 ? `${ownedTemplates.length} / ${planSnapshot.customTemplateLimit}` : "未开放",
          note: planSnapshot.customTemplateLimit > 0 ? "发布阶段可以直接复用" : `当前套餐 ${formatPlanDisplayName(plan?.name || effectivePlanCode)} 暂未开放`,
        },
      ]}
      actions={
        <>
          <Link href="/articles" className={buttonStyles({ variant: "secondary" })}>
            去稿件区
          </Link>
          <Link href="/warroom" className={buttonStyles({ variant: "secondary" })}>
            去作战台
          </Link>
        </>
      }
    >
      <section id="asset-center" className="space-y-4 scroll-mt-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["图像资产", String(workspaceAssets.coverImagesCount + workspaceAssets.imagePromptsCount), `封面 ${workspaceAssets.coverImagesCount} 张，提示词 ${workspaceAssets.imagePromptsCount} 条`] as const,
            ["作者资产", String(workspaceAssets.seriesCount + workspaceAssets.personasCount + workspaceAssets.writingStyleProfilesCount), `系列 ${workspaceAssets.seriesCount} 个，人设 ${workspaceAssets.personasCount} 个，文风 ${workspaceAssets.writingStyleProfilesCount} 个`] as const,
            ["信源资产", String(workspaceAssets.customTopicSourcesCount), `自定义源 ${workspaceAssets.customTopicSourcesCount} 个`] as const,
            ["发布资产", String(workspaceAssets.wechatConnectionsCount), `公众号连接 ${workspaceAssets.wechatConnectionsCount} 个`] as const,
          ].map(([label, value, note]) => (
            <article key={label} className={assetSummaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{label}</div>
              <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{note}</div>
            </article>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "冲突背景卡",
              value: String(conflictedKnowledgeCards.length),
              note: conflictedKnowledgeCards.length > 0 ? "优先处理相互冲突或结论过旧的背景卡。" : "当前没有冲突背景卡。",
              href: "#asset-queue-conflicted-knowledge",
              actionLabel: "去处理冲突",
            },
            {
              label: "待刷新背景卡",
              value: String(staleKnowledgeCards.length),
              note: staleKnowledgeCards.length > 0 ? "这些背景卡的结论或素材依赖已经变旧。" : "当前没有待刷新的背景卡。",
              href: "#asset-queue-stale-knowledge",
              actionLabel: "去看待刷新",
            },
            {
              label: "待处理图片",
              value: String(problematicImageAssets.length),
              note: problematicImageAssets.length > 0 ? "封面候选处理中或失败时，先回到对应稿件发布步。" : "当前图片资产状态稳定。",
              href: "#asset-queue-problematic-images",
              actionLabel: "去看图片队列",
            },
            {
              label: "模板库存",
              value: String(ownedTemplates.length),
              note: ownedTemplates.length > 0 ? "最近可复用的私有模板直接在下方继续管理。" : "还没有形成私有模板库存。",
              href: "#template-assets",
              actionLabel: "去看模板资产",
            },
          ].map((item) => (
            <Link key={item.label} href={item.href} className={assetQueueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
              <div className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-cinnabar">{item.actionLabel}</div>
            </Link>
          ))}
        </div>

        <WriterAssetCenterClient
          fragments={fragments.map((fragment) => ({
            id: fragment.id,
            title: fragment.title,
            distilledContent: fragment.distilled_content,
            sourceType: fragment.source_type,
            sourceUrl: fragment.source_url,
            screenshotPath: fragment.screenshot_path,
            createdAt: fragment.created_at,
            shared: fragment.user_id !== session.userId,
          }))}
          knowledgeCards={knowledgeCards.map((card) => ({
            id: card.id,
            title: card.title,
            cardType: card.card_type,
            summary: card.summary,
            conflictFlags: parseStringList(card.conflict_flags_json),
            latestChangeSummary: card.latest_change_summary,
            sourceFragmentCount: card.source_fragment_count,
            confidenceScore: card.confidence_score,
            status: card.status,
            lastCompiledAt: card.last_compiled_at,
            shared: Boolean(card.shared),
          }))}
          imageAssets={imageAssets.map((asset) => ({
            id: asset.id,
            articleId: asset.articleId,
            articleTitle: asset.articleTitle,
            assetScope: asset.assetScope,
            assetType: asset.assetType,
            variantLabel: asset.variantLabel,
            publicUrl: asset.publicUrl,
            mimeType: asset.mimeType,
            byteLength: asset.byteLength,
            status: asset.status,
            reusablePrompt: asset.reusablePrompt,
            updatedAt: asset.updatedAt,
          }))}
        />
      </section>

      <section id="template-assets" className={cn(templateSectionClassName, "scroll-mt-8")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">模板资产</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">把模板提取结果沉淀为你自己的排版资产。</div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              当前个人空间中共有 {ownedTemplates.length}
              {planSnapshot.customTemplateLimit > 0 ? ` / ${planSnapshot.customTemplateLimit}` : ""} 个私有模板。
            </div>
          </div>
          <div className={templateSummaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">可复用库存</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
              {ownedTemplates.length}
            </div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">
              官方模板 {officialTemplateCount} 个，发布阶段可直接调用。
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["已启用模板", String(activatedTemplateCount), activatedTemplateCount > 0 ? "这些模板已经在发布阶段被实际调用。" : "先让模板在真实发布里跑一轮。"] as const,
            ["最近使用", String(recentlyUsedTemplateCount), recentlyUsedTemplateCount > 0 ? "最近有被复用的模板会优先形成稳定资产。" : "还没有模板留下最近使用记录。"] as const,
            ["官方模板", String(officialTemplateCount), officialTemplateCount > 0 ? "系统模板可作为提取前的默认兜底。" : "当前没有可展示的官方模板。"] as const,
          ].map(([label, value, note]) => (
            <article key={label} className={templateSummaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{label}</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{note}</div>
            </article>
          ))}
        </div>

        <TemplateHtmlImportPanel
          canImport={planSnapshot.canExtractPrivateTemplate}
          currentCount={ownedTemplates.length}
          limit={planSnapshot.customTemplateLimit}
        />

        {ownedTemplates.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ownedTemplates.slice(0, 6).map((template) => (
              <article key={`${template.id}-${template.version}`} className={templateCardClassName}>
                <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">
                  私有模板 · {template.version}
                </div>
                <div className="mt-3 font-serifCn text-2xl text-ink text-balance">{template.name}</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  {template.description || "暂无说明"}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-inkSoft">
                  <span className={templateMetaChipClassName}>语气 {summarizeTemplateTone(template.config)}</span>
                  <span className={templateMetaChipClassName}>{summarizeTemplateParagraphLength(template.config)}</span>
                  <span className={templateMetaChipClassName}>来源 {summarizeTemplateSource(template.sourceUrl)}</span>
                  <span className={templateMetaChipClassName}>使用 {template.usageCount ?? 0} 次</span>
                  <span className={templateMetaChipClassName}>最近使用 {formatTemplateLastUsed(template.lastUsedAt)}</span>
                </div>
                <div className="mt-4 text-sm leading-7 text-inkSoft">
                  {summarizeTemplateRenderConfig(template, 3).join("；")}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={`mt-6 ${templateEmptyStateClassName}`}>
            {planSnapshot.canExtractPrivateTemplate
              ? "你还没有私有模板资产。去发布流程或提取入口粘贴一篇真实文章版式后，这里会沉淀最新模板。"
              : "当前套餐不会保存模板提取结果，先浏览官方模板；如需建立个人模板库，请升级到 Pro 或 Ultra。"}
          </div>
        )}
      </section>
    </SettingsSubpageShell>
  );
}
