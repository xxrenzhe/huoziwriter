import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createWritingEvalDataset, getWritingEvalDatasets } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getWritingEvalDatasets());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json();
    const created = await createWritingEvalDataset({
      code: body.code,
      name: body.name,
      description: body.description,
      status: body.status,
      createdBy: operator.userId,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建评测集失败", 400);
  }
}
