import { ensureUserSession } from "@/lib/auth";
import { refreshKnowledgeBases } from "@/lib/ima-connections";
import { fail, ok } from "@/lib/http";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      throw new Error("IMA 连接不存在");
    }
    return ok({
      knowledgeBases: await refreshKnowledgeBases(id, session.userId),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "IMA 知识库刷新失败", 400);
  }
}
