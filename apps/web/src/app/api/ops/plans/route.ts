import { parsePlanDraft } from "@/lib/ops-validation";
import { requireOpsAccess } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getPlans } from "@/lib/repositories";

export async function GET() {
  try {
    await requireOpsAccess();
    const plans = await getPlans();
    return ok(
      plans.map((plan) => ({
        code: plan.code,
        name: plan.name,
        priceCny: plan.price_cny,
        dailyGenerationLimit: plan.daily_generation_limit,
        fragmentLimit: plan.fragment_limit,
        languageGuardRuleLimit: plan.languageGuardRuleLimit,
        maxWechatConnections: plan.max_wechat_connections,
        canGenerateCoverImage: Boolean(plan.can_generate_cover_image),
        canExportPdf: Boolean(plan.can_export_pdf),
        isPublic: Boolean(plan.is_public),
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    await requireOpsAccess();
    const body = await request.json();
    const draft = parsePlanDraft(body);
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO plans (
        code, name, price_cny, daily_generation_limit, fragment_limit, language_guard_rule_limit,
        max_wechat_connections, can_generate_cover_image, can_export_pdf, is_public, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        draft.isPublic,
        now,
        now,
      ],
    );
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建套餐失败", 400);
  }
}
