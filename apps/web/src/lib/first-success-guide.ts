import { getDatabase } from "./db";
import { getUserPlanContext } from "./plan-access";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

type FirstSuccessGuideStartType = "topic_radar" | "reference_link" | "blank_document";

export type FirstSuccessGuideConfig = {
  recommendedPersonaTemplate: {
    name: string;
    identityTags: string[];
    writingStyleTags: string[];
    summary: string;
    reason: string;
  };
  recommendedStyleTemplate: {
    name: string;
    summary: string;
    toneKeywords: string[];
    structureChecklist: string[];
    reason: string;
  };
  defaultStartType: {
    type: FirstSuccessGuideStartType;
    label: string;
    actionHref: string;
    reason: string;
  };
  minimalMaterialKit: Array<{
    label: string;
    description: string;
    required: boolean;
  }>;
};

type GuideRow = {
  id: number;
  user_id: number;
  completed_steps_json: string | number[] | null;
  guide_config_json?: string | FirstSuccessGuideConfig | null;
  dismissed_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
};

function parseStepIds(value: string | number[] | null | undefined) {
  if (!value) return [] as number[];
  if (Array.isArray(value)) {
    return value.map((item) => Number(item || 0)).filter((item) => Number.isInteger(item) && item > 0);
  }
  try {
    return (JSON.parse(value) as unknown[])
      .map((item) => Number(item || 0))
      .filter((item) => Number.isInteger(item) && item > 0);
  } catch {
    return [];
  }
}

function buildDefaultGuideConfig(planCode: "free" | "pro" | "ultra"): FirstSuccessGuideConfig {
  const defaultStartType =
    planCode === "free"
      ? {
          type: "blank_document" as const,
          label: "空白文稿起步",
          actionHref: "/dashboard",
          reason: "当前套餐不开放热点一键起稿时，先用空白文稿把标题、素材和首篇发布链路走通。",
        }
      : {
          type: "topic_radar" as const,
          label: "从选题雷达起步",
          actionHref: "/radar",
          reason: "对新用户来说，热点切角最省决策成本，系统已经先帮你拆好了进入角度。",
        };

  const minimalMaterialKit =
    defaultStartType.type === "topic_radar"
      ? [
          {
            label: "1 条热点原始链接",
            description: "至少保留一条原始报道或帖子链接，后面做事实核查时要能回链。",
            required: true,
          },
          {
            label: "1 条你自己的判断笔记",
            description: "用 2-3 句话写下你准备修正什么旧判断，不要只复述新闻。",
            required: true,
          },
          {
            label: "1 条补充证据",
            description: "最好再补一条截图、二手报道或官方说明，避免只有单一信源。",
            required: false,
          },
        ]
      : [
          {
            label: "1 个明确标题",
            description: "先写出你想回答的问题，哪怕只是工作标题，也不要空着开始。",
            required: true,
          },
          {
            label: "2 条文字素材",
            description: "至少准备两条可以挂到节点上的文字材料，避免大纲阶段没东西可写。",
            required: true,
          },
          {
            label: "1 条可核对证据",
            description: "最好再补一个链接或截图，后续发布前检查更容易放行。",
            required: false,
          },
        ];

  return {
    recommendedPersonaTemplate: {
      name: "AI 产品经理 · 案例拆解",
      identityTags: ["AI 产品经理"],
      writingStyleTags: ["案例拆解"],
      summary: "先拆变量、再拆代价、最后落到执行判断，适合多数知识型写作者完成首篇闭环。",
      reason: "这个模板默认追求清楚、可核对、可复用，比一上来追求文采更适合首篇成功。",
    },
    recommendedStyleTemplate: {
      name: "结构化拆解模板",
      summary: "先交代事实，再说明旧判断为何不够用，最后回到读者现在该怎么判断。",
      toneKeywords: ["克制", "具体", "少空话"],
      structureChecklist: ["先写新增变量", "再写受影响旧判断", "结尾给出可执行判断"],
      reason: "首篇最重要的是把判断链路走顺，而不是堆情绪和修辞。",
    },
    defaultStartType,
    minimalMaterialKit,
  };
}

function parseGuideConfig(
  value: string | FirstSuccessGuideConfig | null | undefined,
  fallback: FirstSuccessGuideConfig,
) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as FirstSuccessGuideConfig;
    if (
      parsed
      && parsed.recommendedPersonaTemplate
      && parsed.recommendedStyleTemplate
      && parsed.defaultStartType
      && Array.isArray(parsed.minimalMaterialKit)
    ) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function mapGuide(row: GuideRow | null | undefined, guideConfig: FirstSuccessGuideConfig) {
  if (!row) {
    return {
      completedSteps: [] as number[],
      guideConfig,
      dismissedAt: null as string | null,
      lastViewedAt: null as string | null,
      createdAt: null as string | null,
      updatedAt: null as string | null,
    };
  }
  return {
    completedSteps: parseStepIds(row.completed_steps_json),
    guideConfig: parseGuideConfig(row.guide_config_json, guideConfig),
    dismissedAt: row.dismissed_at,
    lastViewedAt: row.last_viewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getFirstSuccessGuideState(userId: number) {
  await ensureExtendedProductSchema();
  const [{ effectivePlanCode }, row] = await Promise.all([
    getUserPlanContext(userId),
    getDatabase().queryOne<GuideRow>(
      `SELECT * FROM first_success_guides WHERE user_id = ? LIMIT 1`,
      [userId],
    ),
  ]);
  const guideConfig = buildDefaultGuideConfig(effectivePlanCode);
  const now = new Date().toISOString();

  if (!row) {
    await getDatabase().exec(
      `INSERT INTO first_success_guides (
        user_id, completed_steps_json, guide_config_json, dismissed_at, last_viewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, JSON.stringify([]), JSON.stringify(guideConfig), null, null, now, now],
    );
    return mapGuide(null, guideConfig);
  }

  if (!row.guide_config_json) {
    await getDatabase().exec(
      `UPDATE first_success_guides
       SET guide_config_json = ?, updated_at = ?
       WHERE user_id = ?`,
      [JSON.stringify(guideConfig), now, userId],
    );
  }

  return mapGuide(row, guideConfig);
}

export async function upsertFirstSuccessGuideState(input: {
  userId: number;
  completedSteps?: number[];
  guideConfig?: FirstSuccessGuideConfig;
  dismissedAt?: string | null;
  lastViewedAt?: string | null;
}) {
  await ensureExtendedProductSchema();
  const current = await getFirstSuccessGuideState(input.userId);
  const now = new Date().toISOString();
  const nextCompletedSteps = Array.from(
    new Set((input.completedSteps ?? current.completedSteps).map((item) => Number(item || 0)).filter((item) => Number.isInteger(item) && item > 0)),
  ).sort((left, right) => left - right);
  const nextGuideConfig = input.guideConfig ?? current.guideConfig;
  const nextDismissedAt = input.dismissedAt === undefined ? current.dismissedAt : input.dismissedAt;
  const nextLastViewedAt = input.lastViewedAt === undefined ? current.lastViewedAt : input.lastViewedAt;
  const db = getDatabase();
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id FROM first_success_guides WHERE user_id = ? LIMIT 1`,
    [input.userId],
  );

  if (!existing) {
    await db.exec(
      `INSERT INTO first_success_guides (
        user_id, completed_steps_json, guide_config_json, dismissed_at, last_viewed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        JSON.stringify(nextCompletedSteps),
        JSON.stringify(nextGuideConfig),
        nextDismissedAt,
        nextLastViewedAt,
        now,
        now,
      ],
    );
  } else {
    await db.exec(
      `UPDATE first_success_guides
       SET completed_steps_json = ?, guide_config_json = ?, dismissed_at = ?, last_viewed_at = ?, updated_at = ?
       WHERE user_id = ?`,
      [
        JSON.stringify(nextCompletedSteps),
        JSON.stringify(nextGuideConfig),
        nextDismissedAt,
        nextLastViewedAt,
        now,
        input.userId,
      ],
    );
  }

  return getFirstSuccessGuideState(input.userId);
}
