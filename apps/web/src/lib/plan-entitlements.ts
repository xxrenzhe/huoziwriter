import type { UserPlanCode } from "./domain";

const GB = 1024 * 1024 * 1024;

export type PlanEntitlementDefinition = {
  personaLimit: number;
  topicSignalVisibleLimit: number;
  canStartTopicSignal: boolean;
  canManageTopicSources: boolean;
  customTopicSourceLimit: number;
  writingStyleAnalysisDailyLimit: number;
  writingStyleProfileLimit: number;
  canAnalyzePersonaFromSources: boolean;
  templateAccessLimit: number;
  customTemplateLimit: number;
  canExtractPrivateTemplate: boolean;
  canUseHistoryReferences: boolean;
  coverImageDailyLimit: number;
  canUseCoverImageReference: boolean;
  imageAssetStorageLimitBytes: number;
  snapshotRetentionDays: number | null;
};

export type PlanFeatureSourceRecord = {
  code: string;
  name: string;
  price_cny: number | null;
  daily_generation_limit: number | null;
  fragment_limit: number | null;
  languageGuardRuleLimit: number | null;
  max_wechat_connections: number | null;
  can_generate_cover_image: number | boolean | null;
  can_export_pdf: number | boolean | null;
};

export type ResolvedPlanFeatureSnapshot = {
  code: string;
  name: string;
  priceCny: number | null;
  dailyGenerationLimit: number | null;
  fragmentLimit: number | null;
  languageGuardRuleLimit: number | null;
  maxWechatConnections: number | null;
  canGenerateCoverImage: boolean;
  canExportPdf: boolean;
  canPublishToWechat: boolean;
  entitlements: PlanEntitlementDefinition | null;
  personaLimit: number;
  topicSignalVisibleLimit: number;
  canStartTopicSignal: boolean;
  canManageTopicSources: boolean;
  customTopicSourceLimit: number;
  writingStyleAnalysisDailyLimit: number;
  writingStyleProfileLimit: number;
  canAnalyzePersonaFromSources: boolean;
  templateAccessLimit: number;
  customTemplateLimit: number;
  canExtractPrivateTemplate: boolean;
  canUseHistoryReferences: boolean;
  coverImageDailyLimit: number;
  canUseCoverImageReference: boolean;
  imageAssetStorageLimitBytes: number | null;
  snapshotRetentionDays: number | null;
};

export const PLAN_ENTITLEMENT_REGISTRY = {
  free: {
    personaLimit: 1,
    topicSignalVisibleLimit: 1,
    canStartTopicSignal: false,
    canManageTopicSources: false,
    customTopicSourceLimit: 0,
    writingStyleAnalysisDailyLimit: 3,
    writingStyleProfileLimit: 0,
    canAnalyzePersonaFromSources: false,
    templateAccessLimit: 3,
    customTemplateLimit: 0,
    canExtractPrivateTemplate: false,
    canUseHistoryReferences: false,
    coverImageDailyLimit: 0,
    canUseCoverImageReference: false,
    imageAssetStorageLimitBytes: 1 * GB,
    snapshotRetentionDays: 3,
  },
  pro: {
    personaLimit: 3,
    topicSignalVisibleLimit: 5,
    canStartTopicSignal: true,
    canManageTopicSources: true,
    customTopicSourceLimit: 5,
    writingStyleAnalysisDailyLimit: 20,
    writingStyleProfileLimit: 20,
    canAnalyzePersonaFromSources: true,
    templateAccessLimit: 99,
    customTemplateLimit: 20,
    canExtractPrivateTemplate: true,
    canUseHistoryReferences: true,
    coverImageDailyLimit: 10,
    canUseCoverImageReference: false,
    imageAssetStorageLimitBytes: 10 * GB,
    snapshotRetentionDays: null,
  },
  ultra: {
    personaLimit: 10,
    topicSignalVisibleLimit: 10,
    canStartTopicSignal: true,
    canManageTopicSources: true,
    customTopicSourceLimit: 20,
    writingStyleAnalysisDailyLimit: 100,
    writingStyleProfileLimit: 100,
    canAnalyzePersonaFromSources: true,
    templateAccessLimit: 99,
    customTemplateLimit: 100,
    canExtractPrivateTemplate: true,
    canUseHistoryReferences: true,
    coverImageDailyLimit: 100,
    canUseCoverImageReference: true,
    imageAssetStorageLimitBytes: 50 * GB,
    snapshotRetentionDays: null,
  },
} as const satisfies Record<UserPlanCode, PlanEntitlementDefinition>;

export function isStandardPlanCode(value: unknown): value is UserPlanCode {
  return value === "free" || value === "pro" || value === "ultra";
}

export function getPlanEntitlementDefinition(planCode: UserPlanCode | null | undefined) {
  if (!planCode || !isStandardPlanCode(planCode)) {
    return null;
  }
  return PLAN_ENTITLEMENT_REGISTRY[planCode];
}

function normalizeFlag(value: number | boolean | null | undefined) {
  return Boolean(value);
}

export function resolvePlanFeatureSnapshot(plan: PlanFeatureSourceRecord): ResolvedPlanFeatureSnapshot {
  const entitlements = isStandardPlanCode(plan.code) ? getPlanEntitlementDefinition(plan.code) : null;
  return {
    code: plan.code,
    name: plan.name,
    priceCny: plan.price_cny,
    dailyGenerationLimit: plan.daily_generation_limit,
    fragmentLimit: plan.fragment_limit,
    languageGuardRuleLimit: plan.languageGuardRuleLimit,
    maxWechatConnections: plan.max_wechat_connections,
    canGenerateCoverImage: normalizeFlag(plan.can_generate_cover_image),
    canExportPdf: normalizeFlag(plan.can_export_pdf),
    canPublishToWechat: Number(plan.max_wechat_connections ?? 0) > 0,
    entitlements,
    personaLimit: entitlements?.personaLimit ?? 0,
    topicSignalVisibleLimit: entitlements?.topicSignalVisibleLimit ?? 0,
    canStartTopicSignal: entitlements?.canStartTopicSignal ?? false,
    canManageTopicSources: entitlements?.canManageTopicSources ?? false,
    customTopicSourceLimit: entitlements?.customTopicSourceLimit ?? 0,
    writingStyleAnalysisDailyLimit: entitlements?.writingStyleAnalysisDailyLimit ?? 0,
    writingStyleProfileLimit: entitlements?.writingStyleProfileLimit ?? 0,
    canAnalyzePersonaFromSources: entitlements?.canAnalyzePersonaFromSources ?? false,
    templateAccessLimit: entitlements?.templateAccessLimit ?? 0,
    customTemplateLimit: entitlements?.customTemplateLimit ?? 0,
    canExtractPrivateTemplate: entitlements?.canExtractPrivateTemplate ?? false,
    canUseHistoryReferences: entitlements?.canUseHistoryReferences ?? false,
    coverImageDailyLimit: entitlements?.coverImageDailyLimit ?? 0,
    canUseCoverImageReference: entitlements?.canUseCoverImageReference ?? false,
    imageAssetStorageLimitBytes: entitlements?.imageAssetStorageLimitBytes ?? null,
    snapshotRetentionDays: entitlements?.snapshotRetentionDays ?? null,
  };
}
