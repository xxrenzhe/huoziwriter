import { ensureUserSession } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { publishStyleGenome } from "@/lib/marketplace";
import { assertGenomePublishAllowed } from "@/lib/plan-access";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertGenomePublishAllowed(session.userId);
    await publishStyleGenome({
      genomeId: Number(params.id),
      userId: session.userId,
    });
    await appendAuditLog({
      userId: session.userId,
      action: "genome.publish",
      targetType: "style_genome",
      targetId: params.id,
    });
    return ok({ published: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "发布失败", 400);
  }
}
