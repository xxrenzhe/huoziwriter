import { findUserById } from "./auth";
import { getDatabase } from "./db";
import { PLAN_LABELS, UserPlanCode } from "./domain";
import { getActiveTemplates } from "./layout-templates";
import { getPlanEntitlementDefinition, resolvePlanFeatureSnapshot } from "./plan-entitlements";
import { getCurrentSubscriptionForUser, getImageAssetStorageSummary, getPlanByCode } from "./repositories";
import {
  getDailyCoverImageUsage,
  getDailyGenerationUsage,
  getDailyImaEvidenceSearchUsage,
  getDailyImaFissionUsage,
  getDailyWritingStyleAnalysisUsage,
  incrementDailyCoverImageUsage,
  incrementDailyGenerationUsage,
  incrementDailyImaEvidenceSearchUsage,
  incrementDailyImaFissionUsage,
} from "./usage";

export function getCoverImageDailyLimit(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.coverImageDailyLimit ?? 0;
}

export function canUseCoverImageReference(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.canUseCoverImageReference ?? false;
}

const COVER_IMAGE_GENERATION_STORAGE_RESERVE_BYTES = 32 * 1024 * 1024;

export function getImageAssetStorageLimit(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.imageAssetStorageLimitBytes ?? 0;
}

export function getCoverImageGenerationStorageReserveBytes() {
  return COVER_IMAGE_GENERATION_STORAGE_RESERVE_BYTES;
}

export function getWritingStyleAnalysisDailyLimit(planCode: UserPlanCode | null) {
  return getPlanEntitlementDefinition(planCode)?.writingStyleAnalysisDailyLimit ?? 1;
}

export function getWritingStyleProfileLimit(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.writingStyleProfileLimit ?? 0;
}

export function getCustomTopicSourceLimit(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.customTopicSourceLimit ?? 0;
}

export function canUseHistoryReferences(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.canUseHistoryReferences ?? false;
}

export function getTemplateAccessLimit(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.templateAccessLimit ?? 0;
}

export function getCustomTemplateLimit(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.customTemplateLimit ?? 0;
}

export function canExtractPrivateTemplate(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.canExtractPrivateTemplate ?? false;
}

export function canStartTopicSignal(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.canStartTopicSignal ?? false;
}

export function canManageTopicSources(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.canManageTopicSources ?? false;
}

export function getImaFissionDailyLimit(planCode: UserPlanCode) {
  if (planCode === "free") return 5;
  if (planCode === "pro") return 30;
  return null;
}

export function getImaEvidenceSearchDailyLimit(planCode: UserPlanCode) {
  if (planCode === "free") return 10;
  if (planCode === "pro") return 50;
  return null;
}

export function canAnalyzePersonaFromSources(planCode: UserPlanCode) {
  return getPlanEntitlementDefinition(planCode)?.canAnalyzePersonaFromSources ?? false;
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

  const plan = await getPlanByCode(effectivePlanCode);

  if (!plan) {
    throw new Error("套餐不存在");
  }

  const typedPlan = { ...plan, code: effectivePlanCode };
  const planSnapshot = resolvePlanFeatureSnapshot(typedPlan);

  return {
    user,
    plan: typedPlan,
    planSnapshot,
    effectivePlanCode,
    entitlements: planSnapshot.entitlements,
    subscriptionStatus: subscription?.status ?? null,
  };
}

export async function assertLanguageGuardRuleQuota(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (planSnapshot.languageGuardRuleLimit == null) {
    return;
  }

  const db = getDatabase();
  const [tokenRuleCount, guardRuleCount] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM language_guard_tokens WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM language_guard_rules WHERE user_id = ?", [userId]),
  ]);
  const total = (tokenRuleCount?.count ?? 0) + (guardRuleCount?.count ?? 0);
  if (total >= planSnapshot.languageGuardRuleLimit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能配置 ${planSnapshot.languageGuardRuleLimit} 个自定义语言守卫规则`);
  }
}

export async function assertFragmentQuota(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (planSnapshot.fragmentLimit == null) {
    return;
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments WHERE user_id = ?", [userId]);
  if ((count?.count ?? 0) >= planSnapshot.fragmentLimit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能保存 ${planSnapshot.fragmentLimit} 条素材`);
  }
}

export async function getSnapshotRetentionDays(userId: number) {
  const { planSnapshot } = await getUserPlanContext(userId);
  return planSnapshot.snapshotRetentionDays;
}

export async function assertWechatConnectionQuota(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canPublishToWechat) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持绑定微信公众号`);
  }
  if (planSnapshot.maxWechatConnections == null) {
    return;
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM wechat_connections WHERE user_id = ? AND status != ?",
    [userId, "disabled"],
  );
  if ((count?.count ?? 0) >= planSnapshot.maxWechatConnections) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多可绑定 ${planSnapshot.maxWechatConnections} 个公众号`);
  }
}

export async function assertWechatPublishAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canPublishToWechat) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持微信草稿箱推送`);
  }
}

export async function assertPdfExportAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canExportPdf) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持 PDF 导出`);
  }
}

export async function assertTopicSignalStartAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canStartTopicSignal) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐仅可浏览机会，不能一键落笔`);
  }
}

export async function assertTopicSourceManageAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canManageTopicSources) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持自定义信息源`);
  }
}

export async function assertTopicSourceQuota(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.customTopicSourceLimit;
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

export async function assertTemplateExtractAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canExtractPrivateTemplate) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐当前仅可浏览官方模板，不支持从 URL 提取模板并沉淀到个人空间。请先升级到 Pro 或更高套餐。`);
  }
}

export async function assertCustomTemplateQuota(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.customTemplateLimit;
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

  const { plan, planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.templateAccessLimit;
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
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (planSnapshot.writingStyleProfileLimit <= 0) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持保存写作风格资产`);
  }
}

export async function assertPersonaSourceAnalysisAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canAnalyzePersonaFromSources) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持基于资料分析生成作者人设`);
  }
}

export async function assertHistoryReferenceAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canUseHistoryReferences) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持历史文章自然引用`);
  }
}

export async function assertCoverImageAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canGenerateCoverImage) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐仅提供文本配图建议，不支持真实封面图生成`);
  }
}

export async function assertCoverImageReferenceAllowed(userId: number) {
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (!planSnapshot.canUseCoverImageReference) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持参考图垫图。升级到藏锋后，才可上传参考图做 Image-to-Image 封面生成。`);
  }
}

export async function getCoverImageQuotaStatus(userId: number) {
  const { planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.coverImageDailyLimit;
  const used = await getDailyCoverImageUsage(userId);
  return {
    used,
    limit,
    remaining: limit > 0 ? Math.max(limit - used, 0) : 0,
  };
}

export async function getImageAssetStorageQuotaStatus(userId: number) {
  const { planSnapshot } = await getUserPlanContext(userId);
  const storage = await getImageAssetStorageSummary(userId);
  const limitBytes = planSnapshot.imageAssetStorageLimitBytes ?? 0;
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
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.coverImageDailyLimit;
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
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.coverImageDailyLimit;
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
  const { plan, planSnapshot } = await getUserPlanContext(userId);
  if (planSnapshot.dailyGenerationLimit == null) {
    await incrementDailyGenerationUsage(userId);
    return;
  }

  const current = await getDailyGenerationUsage(userId);
  if (current >= planSnapshot.dailyGenerationLimit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐今日生成次数已达上限 ${planSnapshot.dailyGenerationLimit} 次`);
  }

  await incrementDailyGenerationUsage(userId);
}

export async function consumeImaFissionQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getImaFissionDailyLimit(plan.code);
  if (limit == null) {
    await incrementDailyImaFissionUsage(userId);
    return {
      used: await getDailyImaFissionUsage(userId),
      limit: null,
      remaining: null,
    };
  }

  const current = await getDailyImaFissionUsage(userId);
  if (current >= limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐已达 IMA 裂变调用上限（${limit} 次/天）`);
  }

  const used = await incrementDailyImaFissionUsage(userId);
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}

export async function consumeImaEvidenceSearchQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  const limit = getImaEvidenceSearchDailyLimit(plan.code);
  if (limit == null) {
    await incrementDailyImaEvidenceSearchUsage(userId);
    return {
      used: await getDailyImaEvidenceSearchUsage(userId),
      limit: null,
      remaining: null,
    };
  }

  const current = await getDailyImaEvidenceSearchUsage(userId);
  if (current >= limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐已达 IMA 证据检索上限（${limit} 次/天）`);
  }

  const used = await incrementDailyImaEvidenceSearchUsage(userId);
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}

export async function getWritingStyleAnalysisQuotaStatus(userId: number) {
  const { planSnapshot } = await getUserPlanContext(userId);
  const limit = planSnapshot.writingStyleAnalysisDailyLimit;
  const used = await getDailyWritingStyleAnalysisUsage(userId);
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
  };
}
