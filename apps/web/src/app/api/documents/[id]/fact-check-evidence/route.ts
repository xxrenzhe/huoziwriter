import { ensureUserSession } from "@/lib/auth";
import { generateDocumentStageArtifact } from "@/lib/document-stage-artifacts";
import { attachFragmentToNode, getDocumentNodes } from "@/lib/document-outline";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { compileKnowledgeCardFromFragments, getRelevantKnowledgeCardsForDocument } from "@/lib/knowledge";
import { assertFragmentQuota } from "@/lib/plan-access";
import { createFragment, getDocumentById, queueJob } from "@/lib/repositories";

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
    const documentId = Number(params.id);
    const document = await getDocumentById(documentId, session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }

    const body = await request.json();
    const url = String(body?.url || "").trim();
    if (!url) {
      return fail("补证链接不能为空", 400);
    }

    const distilled = await distillCaptureInput({
      sourceType: "url",
      title: body?.title || `${document.title} 补证链接`,
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

    const nodes = await getDocumentNodes(documentId);
    const targetNode = nodes[0] ?? null;
    if (targetNode && fragment?.id) {
      await attachFragmentToNode({
        documentId,
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
        preferredTitle: document.title,
      });
    }

    const artifact = await generateDocumentStageArtifact({
      documentId,
      userId: session.userId,
      stageCode: "factCheck",
    });
    const knowledgeCards = await getRelevantKnowledgeCardsForDocument(session.userId, {
      documentTitle: document.title,
      markdownContent: document.markdown_content,
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
