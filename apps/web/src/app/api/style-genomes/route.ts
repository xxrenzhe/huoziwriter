import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createStyleGenome, getStyleGenomes } from "@/lib/marketplace";
import { assertStyleGenomeApplyAllowed } from "@/lib/plan-access";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const genomes = await getStyleGenomes({ includePrivateForUserId: session.userId });
  return ok(
    genomes.map((genome) => ({
      id: genome.id,
      name: genome.name,
      description: genome.description,
      meta: genome.meta,
      isPublic: Boolean(genome.is_public),
      isOfficial: Boolean(genome.is_official),
      sourceGenomeId: genome.source_genome_id,
      ownerUserId: genome.owner_user_id,
      ownerUsername: genome.owner_username,
      publishedAt: genome.published_at,
      createdAt: genome.created_at,
    })),
  );
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json();
    await assertStyleGenomeApplyAllowed(session.userId);
    const genome = await createStyleGenome({
      userId: session.userId,
      name: String(body.name || ""),
      description: body.description ? String(body.description) : null,
      meta: body.meta ? String(body.meta) : null,
      config: typeof body.config === "object" && body.config ? body.config : {},
    });
    return ok({
      id: genome?.id,
      name: genome?.name,
      description: genome?.description,
      meta: genome?.meta,
      isPublic: Boolean(genome?.is_public),
      isOfficial: Boolean(genome?.is_official),
      createdAt: genome?.created_at,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建排版基因失败", 400);
  }
}
