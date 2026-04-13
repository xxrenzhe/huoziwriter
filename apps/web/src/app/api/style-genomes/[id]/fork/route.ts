import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createGenomeFork } from "@/lib/marketplace";
import { assertGenomeForkAllowed } from "@/lib/plan-access";
import { appendAuditLog } from "@/lib/audit";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertGenomeForkAllowed(session.userId);
    const genome = await createGenomeFork({
      sourceGenomeId: Number(params.id),
      userId: session.userId,
    });
    await appendAuditLog({
      userId: session.userId,
      action: "genome.fork",
      targetType: "style_genome",
      targetId: genome?.id as number | undefined,
      payload: { sourceGenomeId: Number(params.id) },
    });
    return ok({ genomeId: genome?.id });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Fork 失败", 400);
  }
}
