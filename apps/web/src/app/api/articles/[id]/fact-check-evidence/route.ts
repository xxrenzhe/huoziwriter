import { ensureUserSession } from "@/lib/auth";
import { generateArticleStageArtifact } from "@/lib/article-stage-artifacts";
import { attachFragmentToArticleNode, getArticleNodes } from "@/lib/article-outline";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { compileKnowledgeCardFromFragments, getRelevantKnowledgeCardsForArticle } from "@/lib/knowledge";
import { assertFragmentQuota } from "@/lib/plan-access";
import { createFragment, getArticleById, queueJob } from "@/lib/repositories";

type CaptureFragmentRecord = {
  id: number;
  user_id: number;
  source_type: string;
  title: string | null;
  raw_content: string | null;
  distilled_content: string;
  source_url?: string | null;
  created_at: string;
  updated_at: string;
};

function mapFragment(fragment: CaptureFragmentRecord) {
  return {
    id: fragment.id,
    userId: fragment.user_id,
    sourceType: fragment.source_type,
    title: fragment.title,
    rawContent: fragment.raw_content,
    distilledContent: fragment.distilled_content,
    sourceUrl: fragment.source_url ?? null,
    createdAt: fragment.created_at,
    updatedAt: fragment.updated_at,
  };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertFragmentQuota(session.userId);
    const articleId = Number(params.id);
    const article = await getArticleById(articleId, session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }

    const body = await request.json();
    const url = String(body?.url || "").trim();
    if (!url) {
      return fail("补证链接不能为空", 400);
    }

    const distilled = await distillCaptureInput({
      sourceType: "url",
      title: body?.title || `${article.title} 补证链接`,
      url,
    });
    const fragment = (await createFragment({
      userId: session.userId,
      sourceType: "url",
      title: distilled.title,
      rawContent: distilled.rawContent,
      distilledContent: distilled.distilledContent,
      sourceUrl: distilled.sourceUrl,
    })) as CaptureFragmentRecord | null;
    await queueJob("capture", {
      fragmentId: fragment?.id,
      sourceType: "url",
      url,
      title: distilled.title,
      rawContent: distilled.rawContent,
      distilledContent: distilled.distilledContent,
      degradedReason: distilled.degradedReason ?? null,
      retryUrlFetch: Boolean(distilled.retryRecommended),
      retryDistill: Boolean(distilled.retryRecommended),
    });

    const nodes = await getArticleNodes(articleId);
    const targetNode = nodes[0] ?? null;
    if (targetNode && fragment?.id) {
      await attachFragmentToArticleNode({
        articleId,
        nodeId: targetNode.id,
        fragmentId: fragment.id,
      });
    }

    const attachedFragmentIds = Array.from(
      new Set(
        [
          ...nodes.flatMap((node) => node.fragments.map((item) => item.id)),
          fragment?.id ?? null,
        ].filter(Boolean),
      ),
    ) as number[];

    let compiledKnowledgeCard = null;
    if (attachedFragmentIds.length > 0) {
      compiledKnowledgeCard = await compileKnowledgeCardFromFragments(session.userId, {
        fragmentIds: attachedFragmentIds,
        preferredTitle: article.title,
      });
    }

    const artifact = await generateArticleStageArtifact({
      articleId,
      userId: session.userId,
      stageCode: "factCheck",
    });
    const knowledgeCards = await getRelevantKnowledgeCardsForArticle(session.userId, {
      articleTitle: article.title,
      markdownContent: article.markdown_content,
      nodeTitles: nodes.map((node) => node.title),
      attachedFragmentIds,
    });

    return ok({
      fragment: fragment ? mapFragment(fragment) : null,
      attachedNodeId: targetNode?.id ?? null,
      compiledKnowledgeCard,
      knowledgeCards,
      artifact,
      degradedReason: distilled.degradedReason ?? null,
      retryRecommended: Boolean(distilled.retryRecommended),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "补证链接抓取失败", 400);
  }
}
