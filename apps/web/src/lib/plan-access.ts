import { findUserById } from "./auth";
import { getDatabase } from "./db";
import { PLAN_LABELS, UserPlanCode } from "./domain";
import { getDailyGenerationUsage, incrementDailyGenerationUsage } from "./usage";

type PlanRecord = {
  code: UserPlanCode;
  name: string;
  daily_generation_limit: number | null;
  fragment_limit: number | null;
  custom_banned_word_limit: number | null;
  max_wechat_connections: number | null;
  can_fork_genomes: number | boolean;
  can_publish_genomes: number | boolean;
  can_generate_cover_image: number | boolean;
  can_export_pdf: number | boolean;
};

export async function getUserPlanContext(userId: number) {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  const db = getDatabase();
  const plan = await db.queryOne<PlanRecord>(
    `SELECT code, name, daily_generation_limit, fragment_limit, custom_banned_word_limit, max_wechat_connections,
            can_fork_genomes, can_publish_genomes, can_generate_cover_image, can_export_pdf
     FROM plans WHERE code = ?`,
    [user.plan_code],
  );

  if (!plan) {
    throw new Error("套餐不存在");
  }

  return { user, plan };
}

export async function assertBannedWordQuota(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (plan.custom_banned_word_limit == null) {
    return;
  }

  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM banned_words WHERE user_id = ?", [userId]);
  if ((count?.count ?? 0) >= plan.custom_banned_word_limit) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐最多只能配置 ${plan.custom_banned_word_limit} 个自定义死刑词`);
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
  if (!["ultra", "team"].includes(plan.code)) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐暂不支持自定义信息源`);
  }
}

export async function assertGenomeForkAllowed(userId: number) {
  const { plan } = await getUserPlanContext(userId);
  if (!plan.can_fork_genomes) {
    throw new Error(`${PLAN_LABELS[plan.code]}套餐不支持 Fork 排版基因`);
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
