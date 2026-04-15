import { findUserById } from "./auth";
import { getDatabase } from "./db";
import { PLAN_LABELS, UserPlanCode } from "./domain";
import { getActiveTemplates } from "./marketplace";
import { getCurrentSubscriptionForUser, getImageAssetStorageSummary } from "./repositories";
import {
  getDailyCoverImageUsage,
  getDailyGenerationUsage,
  getDailyStyleExtractUsage,
  incrementDailyCoverImageUsage,
  incrementDailyGenerationUsage,
} from "./usage";

type PlanRecord = {
  code: UserPlanCode;
  name: string;
  price_cny: number | null;
  daily_generation_limit: number | null;
  fragment_limit: number | null;
  custom_banned_word_limit: number | null;
  max_wechat_connections: number | null;
  can_fork_genomes: number | boolean;
  can_publish_genomes: number | boolean;
  can_generate_cover_image: number | boolean;
  can_export_pdf: number | boolean;
};

export function getCoverImageDailyLimit(planCode: UserPlanCode) {
  if (planCode === "pro") return 10;
  if (planCode === "ultra") return 100;
  return 0;
}

export function canUseCoverImageReference(planCode: UserPlanCode) {
  return planCode === "ultra";
}

const GB = 1024 * 1024 * 1024;
const COVER_IMAGE_GENERATION_STORAGE_RESERVE_BYTES = 32 * 1024 * 1024;

export function getImageAssetStorageLimit(planCode: UserPlanCode) {
  if (planCode === "pro") return 10 * GB;
  if (planCode === "ultra") return 50 * GB;
  return 1 * GB;
}

export function getCoverImageGenerationStorageReserveBytes() {
  return COVER_IMAGE_GENERATION_STORAGE_RESERVE_BYTES;
}

export function getStyleExtractDailyLimit(planCode: UserPlanCode | null) {
  if (planCode === "free") return 3;
  if (planCode === "pro") return 20;
  if (planCode === "ultra") return 100;
  return 1;
}

export function getWritingStyleProfileLimit(planCode: UserPlanCode) {
  if (planCode === "pro") return 20;
  if (planCode === "ultra") return 100;
  return 0;
}

export function getCustomTopicSourceLimit(planCode: UserPlanCode) {
  if (planCode === "pro") return 5;
  if (planCode === "ultra") return 20;
  return 0;
}

export function canUseHistoryReferences(planCode: UserPlanCode) {
  return planCode === "pro" || planCode === "ultra";
}

export function getTemplateAccessLimit(planCode: UserPlanCode) {
  if (planCode === "free") return 3;
  return 99;
}

export function getCustomTemplateLimit(planCode: UserPlanCode) {
  if (planCode === "pro") return 20;
  if (planCode === "ultra") return 100;
  return 0;
}

export function canExtractPrivateTemplate(planCode: UserPlanCode) {
  return planCode === "pro" || planCode === "ultra";
}

export async function getUserPlanContext(userId: number) {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  const subscription = await getCurrentSubscriptionForUser(userId);
  const effectivePlanCode =
    !subscription
      ? (user.plan_code as UserPlanCode)
      : subscription.status === "active"
        ? (subscription.plan_code as UserPlanCode)
        : "free";

  const db = getDatabase();
  const plan = await db.queryOne<PlanRecord>(
    `SELECT code, name, price_cny, daily_generation_limit, fragment_limit, custom_banned_word_limit, max_wechat_connections,
            can_fork_genomes, can_publish_genomes, can_generate_cover_image, can_export_pdf
     FROM plans WHERE code = ?`,
    [effectivePlanCode],
  );

  if (!plan) {
    throw new Error("套餐不存在");
  }

  return { user, plan, effectivePlanCode, subscriptionStatus: subscription?.status ?? null };
}

export async function assertBannedWordQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (plan.custom_banned_word_limit == null) {
    return;
  }

  const db = getDatabase();
  const [legacyCount, guardRuleCount] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM banned_words WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM language_guard_rules WHERE user_id = ?", [userId]),
  ]);
  const total = (legacyCount?.count ?? 0) + (guardRuleCount?.count ?? 0);
  if (total >= plan.custom_banned_word_limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能配置 ${plan.custom_banned_word_limit} 个自定义语言守卫规则`);
  }
}

export async function assertFragmentQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (plan.fragment_limit == null) {
    return;
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments WHERE user_id = ?", [userId]);
  if ((count?.count ?? 0) >= plan.fragment_limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能保存 ${plan.fragment_limit} 条碎片`);
  }
}

export async function getSnapshotRetentionDays(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  return plan.code === "free" ? 3 : null;
}

export async function assertWechatConnectionQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if ((plan.max_wechat_connections ?? 0) <= 0) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持绑定微信公众号`);
  }
  if (plan.max_wechat_connections == null) {
    return;
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM wechat_connections WHERE user_id = ? AND status != ?",
    [userId, "disabled"],
  );
  if ((count?.count ?? 0) >= plan.max_wechat_connections) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多可绑定 ${plan.max_wechat_connections} 个公众号`);
  }
}

export async function assertWechatPublishAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if ((plan.max_wechat_connections ?? 0) <= 0) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持微信草稿箱推送`);
  }
}

export async function assertPdfExportAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!plan.can_export_pdf) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持 PDF 导出`);
  }
}

export async function assertTopicRadarStartAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (plan.code === "free") {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐仅可浏览情绪罗盘，不能一键落笔`);
  }
}

export async function assertTopicSourceManageAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!["pro", "ultra"].includes(plan.code)) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持自定义信息源`);
  }
}

export async function assertTopicSourceQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getCustomTopicSourceLimit(plan.code);
  if (limit <= 0) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持自定义信息源`);
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM topic_sources WHERE owner_user_id = ? AND is_active = ?",
    [userId, true],
  );
  if ((count?.count ?? 0) >= limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能启用 ${limit} 个自定义信息源`);
  }
}

export async function assertGenomeForkAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!plan.can_fork_genomes) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持 Fork 排版基因`);
  }
}

export async function assertStyleGenomeApplyAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!plan.can_fork_genomes) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐当前只能浏览排版基因，不能把它套用到文稿。请先升级到 Pro 或更高套餐。`);
  }
}

export async function assertTemplateExtractAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!canExtractPrivateTemplate(plan.code)) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐当前仅可浏览官方模板，不支持从 URL 提取模板并沉淀到个人空间。请先升级到 Pro 或更高套餐。`);
  }
}

export async function assertCustomTemplateQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getCustomTemplateLimit(plan.code);
  if (limit <= 0) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持私有模板资产`);
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM layout_templates WHERE owner_user_id = ?",
    [userId],
  );
  if ((count?.count ?? 0) >= limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能保存 ${limit} 个私有模板资产`);
  }
}

export async function assertWechatTemplateAllowed(userId: number, templateId: string | null | undefined) {
  if (!templateId) {
    return;
  }

  const { plan } = await getUserPlanContext(userId);
  const limit = getTemplateAccessLimit(plan.code);
  const templates = await getActiveTemplates(userId);
  const selectedTemplate = templates.find((template) => template.id === templateId);
  if (selectedTemplate?.ownerUserId === userId) {
    return;
  }
  const allowedTemplate = templates.filter((template) => template.ownerUserId == null).slice(0, limit).find((template) => template.id === templateId);

  if (!allowedTemplate) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐当前最多只能使用前 ${limit} 个排版模板`);
  }
}

export async function assertWritingStyleProfileSaveAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (getWritingStyleProfileLimit(plan.code) <= 0) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持保存写作风格资产`);
  }
}

export async function assertAuthorPersonaSourceAnalysisAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!["pro", "ultra"].includes(plan.code)) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持基于资料分析生成作者人设`);
  }
}

export async function assertHistoryReferenceAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!canUseHistoryReferences(plan.code)) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持历史文章自然引用`);
  }
}

export async function assertGenomePublishAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!plan.can_publish_genomes) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持发布排版基因`);
  }
}

export async function assertCoverImageAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!plan.can_generate_cover_image) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐仅提供文本配图建议，不支持真实封面图生成`);
  }
}

export async function assertCoverImageReferenceAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!canUseCoverImageReference(plan.code)) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持参考图垫图。升级到藏锋后，才可上传参考图做 Image-to-Image 封面生成。`);
  }
}

export async function getCoverImageQuotaStatus(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getCoverImageDailyLimit(plan.code);
  const used = await getDailyCoverImageUsage(userId);
  return {
    used,
    limit,
    remaining: limit > 0 ? Math.max(limit - used, 0) : 0,
  };
}

export async function getImageAssetStorageQuotaStatus(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const storage = await getImageAssetStorageSummary(userId);
  const limitBytes = getImageAssetStorageLimit(plan.code);
  return {
    usedBytes: storage.usedBytes,
    limitBytes,
    remainingBytes: Math.max(limitBytes - storage.usedBytes, 0),
    assetRecordCount: storage.assetRecordCount,
    readyAssetRecordCount: storage.readyAssetRecordCount,
    uniqueObjectCount: storage.uniqueObjectCount,
    reservedGenerationBytes: getCoverImageGenerationStorageReserveBytes(),
  };
}

export async function assertCoverImageQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getCoverImageDailyLimit(plan.code);
  if (limit <= 0) {
    return;
  }

  const current = await getDailyCoverImageUsage(userId);
  if (current >= limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐今日封面图额度已达上限 ${limit} 次`);
  }
}

export async function assertImageAssetStorageAvailable(
  userId: number,
  options?: { reserveBytes?: number },
) {
  const { plan } = await getUserPlanContext(userId);
  const quota = await getImageAssetStorageQuotaStatus(userId);
  const reserveBytes = Math.max(Number(options?.reserveBytes || 0), 0);
  if (quota.usedBytes >= quota.limitBytes || quota.remainingBytes < reserveBytes) {
    const requiredText =
      reserveBytes > 0 && quota.remainingBytes < reserveBytes
        ? `本次生成至少预留 ${Math.ceil(reserveBytes / 1024 / 1024)} MB 空间。`
        : "当前空间已满。";
    throw new Error(
      `${PLAN_LABELS[plan.code]}套餐图片资产空间不足，当前已用 ${Math.round(quota.usedBytes / 1024 / 1024)} MB / ${Math.round(quota.limitBytes / 1024 / 1024)} MB。${requiredText} 请先清理历史图片资产或升级套餐。`,
    );
  }
}

export async function consumeCoverImageQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getCoverImageDailyLimit(plan.code);
  if (limit <= 0) {
    return {
      used: await getDailyCoverImageUsage(userId),
      limit: null,
      remaining: null,
    };
  }

  const current = await getDailyCoverImageUsage(userId);
  if (current >= limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐今日封面图额度已达上限 ${limit} 次`);
  }

  const used = await incrementDailyCoverImageUsage(userId);
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}

export async function consumeDailyGenerationQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (plan.daily_generation_limit == null) {
    await incrementDailyGenerationUsage(userId);
    return;
  }

  const current = await getDailyGenerationUsage(userId);
  if (current >= plan.daily_generation_limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐今日生成次数已达上限 ${plan.daily_generation_limit} 次`);
  }

  await incrementDailyGenerationUsage(userId);
}

export async function getStyleExtractQuotaStatus(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getStyleExtractDailyLimit(plan.code);
  const used = await getDailyStyleExtractUsage(userId);
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}
