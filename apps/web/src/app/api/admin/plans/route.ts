import { parsePlanDraft } from "@/lib/admin-validation";
import { requireAdminAccess } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getResolvedPlans } from "@/lib/repositories";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getResolvedPlans());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json();
    const draft = parsePlanDraft(body);
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO plans (
        code, name, price_cny, daily_generation_limit, fragment_limit, language_guard_rule_limit,
        max_wechat_connections, can_generate_cover_image, can_export_pdf, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        draft.code,
        draft.name,
        draft.priceCny,
        draft.dailyGenerationLimit,
        draft.fragmentLimit,
        draft.languageGuardRuleLimit,
        draft.maxWechatConnections,
        draft.canGenerateCoverImage,
        draft.canExportPdf,
        now,
        now,
      ],
    );
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建套餐失败", 400);
  }
}
