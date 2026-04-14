import { ensureUserSession } from "@/lib/auth";
import { getDocumentStageArtifact } from "@/lib/document-stage-artifacts";
import { syncDocumentNodesFromOutline } from "@/lib/document-outline";
import { fail, ok } from "@/lib/http";
import { getDocumentById } from "@/lib/repositories";

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    if (params.stageCode !== "outlinePlanning") {
      return fail("只有大纲规划阶段支持同步到大纲树", 400);
    }

    const document = await getDocumentById(Number(params.id), session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }

    const artifact = await getDocumentStageArtifact(document.id, session.userId, "outlinePlanning");
    const outlineSections = Array.isArray(artifact?.payload?.outlineSections) ? artifact.payload.outlineSections : [];
    if (!artifact || outlineSections.length === 0) {
      return fail("当前还没有可同步的大纲规划产物", 400);
    }

    const nodes = await syncDocumentNodesFromOutline({
      documentId: document.id,
      sections: outlineSections.map((section) => ({
        heading: String((section as Record<string, unknown>).heading || "").trim(),
        goal: String((section as Record<string, unknown>).goal || "").trim() || null,
        keyPoints: Array.isArray((section as Record<string, unknown>).keyPoints)
          ? (section as Record<string, unknown>).keyPoints as string[]
          : [],
        evidenceHints: Array.isArray((section as Record<string, unknown>).evidenceHints)
          ? (section as Record<string, unknown>).evidenceHints as string[]
          : [],
        transition: String((section as Record<string, unknown>).transition || "").trim() || null,
      })),
    });

    return ok(
      nodes.map((node) => ({
        id: node.id,
        title: node.title,
        description: node.description,
        sortOrder: node.sortOrder,
        fragments: node.fragments.map((fragment) => ({
          id: fragment.id,
          distilledContent: fragment.distilledContent,
          shared: fragment.userId !== session.userId,
        })),
      })),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "同步大纲树失败", 400);
  }
}
