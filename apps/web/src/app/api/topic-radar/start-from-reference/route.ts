import { ensureUserSession } from "@/lib/auth";
import { generateDocumentStageArtifact } from "@/lib/document-stage-artifacts";
import { setDocumentWorkflowCurrentStage } from "@/lib/document-workflows";
import { updateDocumentNode, attachFragmentToNode, getDocumentNodes } from "@/lib/document-outline";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { assertFragmentQuota, assertTopicRadarStartAllowed } from "@/lib/plan-access";
import { createDocument, createFragment } from "@/lib/repositories";

function buildNodeBlueprints(title: string, thesis: string, angleReason: string) {
  return [
    { title: "切口结论", description: thesis },
    { title: "原文说到了什么", description: `先用最短路径交代原文核心判断和场景。${angleReason}` },
    { title: "真正值得重写的部分", description: "不要重复参考文的论证顺序，而是改写成你的新判断。"},
    { title: "落回读者处境", description: "最后回到读者、团队或行业参与者此刻真正该怎么判断。"},
  ].map((item) => ({
    ...item,
    description: `${item.description} 主题：${title}`,
  }));
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertTopicRadarStartAllowed(session.userId);
    await assertFragmentQuota(session.userId);
    const body = await request.json();
    const candidate = body.candidate && typeof body.candidate === "object" ? body.candidate as Record<string, unknown> : null;
    if (!candidate) {
      return fail("参考候选不能为空", 400);
    }

    const title = String(candidate.proposedTitle || body.sourceTitle || "参考链接切角").trim();
    const thesis = String(candidate.thesis || "").trim();
    const angleReason = String(candidate.angleReason || "").trim();
    const sourceUrl = String(body.sourceUrl || "").trim();
    const normalizedSourceUrl = sourceUrl || null;
    const sourceTitle = String(body.sourceTitle || "").trim() || title;
    const document = await createDocument(session.userId, title);
    await setDocumentWorkflowCurrentStage({
      documentId: Number(document!.id),
      userId: session.userId,
      stageCode: "audienceAnalysis",
    });

    let fragmentSourceType: "manual" | "url" = "manual";
    let degradedReason: string | null = null;
    let distilled: Awaited<ReturnType<typeof distillCaptureInput>> | null = null;

    if (sourceUrl) {
      const urlDistilled = await distillCaptureInput({
        sourceType: "url",
        title: sourceTitle,
        url: sourceUrl,
      });
      if (urlDistilled.model !== "fallback-url-fetch-failed") {
        distilled = urlDistilled;
        fragmentSourceType = "url";
        degradedReason = urlDistilled.degradedReason ?? null;
      } else {
        degradedReason = urlDistilled.degradedReason ?? null;
      }
    }

    if (!distilled) {
      distilled = await distillCaptureInput({
        sourceType: "manual",
        title,
        content: `${title}\n${thesis}\n${angleReason}\n${sourceUrl}`,
      });
      degradedReason = degradedReason ?? distilled.degradedReason ?? null;
    }

    const fragment = await createFragment({
      userId: session.userId,
      sourceType: fragmentSourceType,
      title: distilled.title,
      rawContent: distilled.rawContent,
      distilledContent: distilled.distilledContent,
      sourceUrl: distilled.sourceUrl ?? normalizedSourceUrl,
    });
    const nodes = await getDocumentNodes(document!.id);
    const blueprints = buildNodeBlueprints(title, thesis, angleReason);
    for (const [index, blueprint] of blueprints.entries()) {
      const node = nodes[index];
      if (!node) continue;
      await updateDocumentNode({
        documentId: document!.id,
        nodeId: node.id,
        title: blueprint.title,
        description: blueprint.description,
      });
      if (fragment) {
        await attachFragmentToNode({
          documentId: document!.id,
          nodeId: node.id,
          fragmentId: Number(fragment.id),
          usageMode: "rewrite",
        });
      }
    }

    await generateDocumentStageArtifact({
      documentId: Number(document!.id),
      userId: session.userId,
      stageCode: "audienceAnalysis",
    });
    return ok({
      documentId: document?.id,
      title: document?.title,
      fragmentSourceType,
      degradedReason,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "参考链接一键落笔失败", 400);
  }
}
