import { getDatabase } from "./db";

const ADMIN_ROLES = new Set(["admin", "user"]);
const SUBSCRIPTION_STATUSES = new Set(["active", "inactive", "ended"]);

export function parseAdminRole(value: unknown, fallback: string) {
  const role = typeof value === "string" ? value.trim() : "";
  if (!role) {
    return fallback;
  }
  if (!ADMIN_ROLES.has(role)) {
    throw new Error("角色只允许为 admin 或 user");
  }
  return role;
}

export function parseSubscriptionStatus(value: unknown, fallback: string) {
  const status = typeof value === "string" ? value.trim() : "";
  if (!status) {
    return fallback;
  }
  if (!SUBSCRIPTION_STATUSES.has(status)) {
    throw new Error("订阅状态只允许为 active、inactive 或 ended");
  }
  return status;
}

export async function assertPlanCodeExists(planCode: string) {
  const code = planCode.trim();
  if (!code) {
    throw new Error("套餐 code 不能为空");
  }
  const db = getDatabase();
  const plan = await db.queryOne<{ code: string }>("SELECT code FROM plans WHERE code = ?", [code]);
  if (!plan) {
    throw new Error("套餐不存在");
  }
  return code;
}

export function parsePlanDraft(body: Record<string, unknown>) {
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();
  if (!code) {
    throw new Error("套餐 code 不能为空");
  }
  if (!name) {
    throw new Error("套餐名称不能为空");
  }

  const maxWechatConnections = body.maxWechatConnections == null || body.maxWechatConnections === ""
    ? 0
    : Number(body.maxWechatConnections);
  if (!Number.isFinite(maxWechatConnections) || maxWechatConnections < 0) {
    throw new Error("公众号连接上限必须是大于等于 0 的数字");
  }

  return {
    code,
    name,
    priceCny: body.priceCny ?? 0,
    dailyGenerationLimit: body.dailyGenerationLimit ?? null,
    fragmentLimit: body.fragmentLimit ?? null,
    customBannedWordLimit: body.customBannedWordLimit ?? null,
    maxWechatConnections,
    canForkGenomes: Boolean(body.canForkGenomes),
    canPublishGenomes: Boolean(body.canPublishGenomes),
    canGenerateCoverImage: Boolean(body.canGenerateCoverImage),
    canExportPdf: Boolean(body.canExportPdf),
    isPublic: Boolean(body.isPublic),
  };
}
