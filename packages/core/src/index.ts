export type UserPlanCode = "free" | "pro" | "ultra";
export type UserRole = "admin" | "user";
export type ArticleStatus =
  | "draft"
  | "ready"
  | "published"
  | "publish_failed";
export type WechatConnectionStatus = "valid" | "invalid" | "expired" | "disabled";
export type CaptureSourceType = "manual" | "url" | "screenshot";

export type ModelRouteDefinition = {
  sceneCode: string;
  primaryModel: string;
  fallbackModel: string | null;
  shadowModel?: string | null;
  shadowTrafficPercent?: number;
  description: string;
};

export const PLAN_LABELS: Record<UserPlanCode, string> = {
  free: "游墨",
  pro: "执毫",
  ultra: "藏锋",
};

export const DEFAULT_MODEL_ROUTES: readonly ModelRouteDefinition[] = [
  {
    sceneCode: "topicAnalysis",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "全自动生产线选题价值、读者收益、why now 与风险判断",
  },
  {
    sceneCode: "researchBrief",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "研究简报、时间脉络、横向比较与交汇洞察生成",
  },
  {
    sceneCode: "sourceLocalization",
    primaryModel: "gpt-5.4",
    fallbackModel: "gpt-5.4-mini",
    description: "英文或混合语种高质量信源的中文化表达转化",
  },
  {
    sceneCode: "fragmentDistill",
    primaryModel: "gemini-3.0-flash-lite",
    fallbackModel: "gemini-3.0-flash",
    description: "碎片提纯与原子事实抽取",
  },
  {
    sceneCode: "visionNote",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "截图视觉理解与结构化笔记生成",
  },
  {
    sceneCode: "articleWrite",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "正文生成与改写",
  },
  {
    sceneCode: "styleExtract",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "文章写作风格提取与结构化分析",
  },
  {
    sceneCode: "topicSupplement",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "选题补证信源补充与查询建议生成",
  },
  {
    sceneCode: "topicBacklogIdeation",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "从种子主题批量生成选题库条目",
  },
  {
    sceneCode: "imaHookPatternDistill",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "IMA 知识库爆款规律提炼与裂变候选生成",
  },
  {
    sceneCode: "topicFission.regularity",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "claude-sonnet-4-6",
    description: "笔尖方案规律裂变场景",
  },
  {
    sceneCode: "topicFission.contrast",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4",
    description: "笔尖方案差异化裂变场景",
  },
  {
    sceneCode: "topicFission.crossDomain",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "gemini-3.0-flash",
    description: "笔尖方案跨赛道迁移裂变场景",
  },
  {
    sceneCode: "strategyCard.autoDraft",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "gpt-5.4",
    description: "根据选题生成策略卡底层字段初稿",
  },
  {
    sceneCode: "strategyCard.fourPointAggregate",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: null,
    description: "策略卡四元聚合场景",
  },
  {
    sceneCode: "strategyCard.strengthAudit",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "claude-haiku-4-5",
    description: "策略卡四元强度自检场景",
  },
  {
    sceneCode: "strategyCard.reverseWriteback",
    primaryModel: "claude-haiku-4-5",
    fallbackModel: null,
    description: "策略卡反写回底层字段场景",
  },
  {
    sceneCode: "evidenceHookTagging",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "证据爆点自动标注场景",
  },
  {
    sceneCode: "styleDna.crossCheck",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: null,
    description: "多篇风格交叉比对场景",
  },
  {
    sceneCode: "publishGate.rhythmConsistency",
    primaryModel: "gpt-5.4",
    fallbackModel: "gpt-5.4-mini",
    description: "原型节奏一致性评估场景",
  },
  {
    sceneCode: "audienceProfile",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "受众画像分析与表达策略生成",
  },
  {
    sceneCode: "outlinePlan",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "结构化大纲规划与标题策略生成",
  },
  {
    sceneCode: "titleOptimizer",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "公众号标题 6 候选生成与体检",
  },
  {
    sceneCode: "openingOptimizer",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "公众号开头 3 候选生成与前三秒留存体检",
  },
  {
    sceneCode: "deepWrite",
    primaryModel: "claude-sonnet-4-6",
    fallbackModel: "claude-haiku-4-5",
    description: "深度写作执行卡与正文生成策略",
  },
  {
    sceneCode: "factCheck",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "gpt-5.4-nano",
    description: "事实核查、风险分级与证据缺口分析",
  },
  {
    sceneCode: "prosePolish",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "gpt-5.4-nano",
    description: "文笔润色、语言节奏与表达修订建议",
  },
  {
    sceneCode: "languageGuardAudit",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "gpt-5.4-nano",
    description: "语言守卫规则与长句审校",
  },
  {
    sceneCode: "coverImageBrief",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "gpt-5.4-nano",
    description: "封面图视觉 brief、负面提示词、alt text 与风格约束生成",
  },
  {
    sceneCode: "layoutExtract",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "文章排版结构提取与模板 DSL 生成",
  },
  {
    sceneCode: "publishGuard",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "gpt-5.4-nano",
    description: "发布前守门检查与风险总结",
  },
  {
    sceneCode: "wechatRender",
    primaryModel: "wechat-renderer",
    fallbackModel: "backup-renderer",
    description: "微信排版渲染",
  },
] as const;
