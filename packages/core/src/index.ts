export type UserPlanCode = "free" | "pro" | "ultra";
export type UserRole = "admin" | "user";
export type DocumentStatus =
  | "draft"
  | "generating"
  | "reviewed"
  | "readyToPublish"
  | "published"
  | "publishFailed";
export type WechatConnectionStatus = "valid" | "invalid" | "expired" | "disabled";
export type CaptureSourceType = "manual" | "url" | "screenshot";

export type ModelRouteDefinition = {
  sceneCode: string;
  primaryModel: string;
  fallbackModel: string | null;
  description: string;
};

export const PLAN_LABELS: Record<UserPlanCode, string> = {
  free: "游墨",
  pro: "执毫",
  ultra: "藏锋",
};

export const DEFAULT_MODEL_ROUTES: readonly ModelRouteDefinition[] = [
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
    sceneCode: "documentWrite",
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
    sceneCode: "topicSourceScout",
    primaryModel: "gemini-3.0-flash",
    fallbackModel: "gpt-5.4-mini",
    description: "选题雷达补充信源建议与补证线索生成",
  },
  {
    sceneCode: "bannedWordAudit",
    primaryModel: "gpt-5.4-mini",
    fallbackModel: "gpt-5.4-nano",
    description: "死刑词与长句审校",
  },
  {
    sceneCode: "wechatRender",
    primaryModel: "internal-renderer",
    fallbackModel: "fallback-renderer",
    description: "微信排版渲染",
  },
] as const;
