import { getDatabase } from "./db";
import { DEFAULT_MODEL_ROUTES } from "./domain";
import { renderMarkdownToHtml } from "./rendering";
import { getActiveTemplateById } from "./marketplace";
import { resolveTemplateRenderConfig } from "./template-rendering";
import { ensureDefaultTopics } from "./topic-radar";
import { clearPromptCache } from "./prompt-loader";
import { ensureUsageCounterSchema } from "./usage";
import { ensureDefaultDocumentNodes } from "./document-outline";
import { ensureDocumentWorkflow } from "./document-workflows";
import { ensureMarketplaceSeeds, ensureExtendedProductSchema } from "./schema-bootstrap";
import { getReferralCodeForUser, matchesReferralCode, normalizeReferralCode, parseReferralCodeUserId } from "./referrals";
import { appendAuditLog } from "./audit";
import { getUserAccessScope } from "./access-scope";
import { buildSemanticEmbedding, parseSemanticEmbedding, scoreSemanticMatch } from "./semantic-search";

const DEFAULT_PROMPT_SEEDS = [
  {
    promptId: "fragment_distill",
    version: "v1.0.0",
    category: "capture",
    name: "碎片提纯",
    description: "将原始内容转为原子事实碎片",
    filePath: "system:capture",
    functionName: "fragmentDistill",
    promptContent: "你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "vision_note",
    version: "v1.0.0",
    category: "capture",
    name: "截图视觉理解",
    description: "从截图中提取可复用的事实与上下文",
    filePath: "system:capture",
    functionName: "visionNote",
    promptContent: "你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，输出可复用的写作碎片。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "document_write",
    version: "v1.0.0",
    category: "writing",
    name: "正文生成",
    description: "根据碎片和大纲生成正文",
    filePath: "system:writing",
    functionName: "documentWrite",
    promptContent: "你是中文专栏作者。根据节点和碎片生成短句、克制、反机器腔调的正文。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "style_extract",
    version: "v1.0.0",
    category: "analysis",
    name: "写作风格提取",
    description: "从网页文章中提炼写作风格画像",
    filePath: "system:analysis",
    functionName: "styleExtract",
    promptContent: "你是中文文风分析师。必须基于正文内容抽取语气、句式、结构、开头结尾习惯和模仿提示，不要空泛赞美。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "topic_source_scout",
    version: "v1.1.0",
    category: "analysis",
    name: "选题补充信源",
    description: "围绕选题生成第一手补充信源与补证建议",
    filePath: "system:analysis",
    functionName: "topicSourceScout",
    promptContent: "你是选题研究编辑。围绕一个待写选题，优先推荐 YouTube、Reddit、Podcast、Spotify、官方 Blog / Newsroom、RSS / Feed、主流新闻等第一手或近一手信源的补证方向，只输出可执行的搜集建议，不要把模型猜测写成事实。",
    language: "zh-CN",
    changeNotes: "移除 X 作为 P0 常规补证来源，补充官方 Blog / Newsroom 与 RSS / Feed 优先级",
  },
  {
    promptId: "topic_supplement",
    version: "v1.1.0",
    category: "analysis",
    name: "选题补证",
    description: "围绕选题生成补充信源、检索词与补证清单",
    filePath: "system:analysis",
    functionName: "topicSupplement",
    promptContent: "你是选题补证编辑。围绕一个待写选题，优先推荐 YouTube、Reddit、Podcast、Spotify、官方 Blog / Newsroom、RSS / Feed、主流新闻等第一手或近一手信源的补证方向，输出可直接执行的查询词、平台建议与验证清单，不要把模型猜测写成事实。",
    language: "zh-CN",
    changeNotes: "移除 X 作为 P0 常规补证来源，补充官方 Blog / Newsroom 与 RSS / Feed 优先级",
  },
  {
    promptId: "banned_word_audit",
    version: "v1.0.0",
    category: "review",
    name: "死刑词审校",
    description: "检查并替换死刑词与长句",
    filePath: "system:review",
    functionName: "bannedWordAudit",
    promptContent: "你是终审编辑。删除禁用词，保留事实，拆解长句。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "audience_analysis",
    version: "v1.1.0",
    category: "analysis",
    name: "受众分析",
    description: "根据选题、人设和素材生成读者画像与表达建议",
    filePath: "system:analysis",
    functionName: "audienceAnalysis",
    promptContent: "你是内容策略编辑。你要为一篇中文内容判断真正应该写给谁看、怎么说他们才会继续读。必须优先给出可执行的读者分层、痛点、动机、表达方式、背景认知分层和通俗度建议，避免空泛人口学描述，避免营销套话。",
    language: "zh-CN",
    changeNotes: "补强受众分析对读者分层、表达方式与通俗度建议的约束",
  },
  {
    promptId: "audience_profile",
    version: "v1.0.0",
    category: "analysis",
    name: "受众画像",
    description: "根据选题、人设和素材生成读者画像与表达建议",
    filePath: "system:analysis",
    functionName: "audienceProfile",
    promptContent: "你是内容策略编辑。你要为一篇中文内容判断真正应该写给谁看、怎么说他们才会继续读。必须优先给出可执行的读者分层、痛点、动机、表达方式、背景认知分层和通俗度建议，避免空泛人口学描述，避免营销套话。",
    language: "zh-CN",
    changeNotes: "新增二期标准场景码 audienceProfile",
  },
  {
    promptId: "outline_planning",
    version: "v1.1.0",
    category: "writing",
    name: "大纲规划",
    description: "根据选题、人设、受众和素材生成结构化大纲",
    filePath: "system:writing",
    functionName: "outlinePlanning",
    promptContent: "你是专栏主编。请基于主题、人设、受众和素材，设计一份真正可写的结构化文章大纲。大纲必须体现核心观点、论证递进、证据挂载、情绪转折、开头策略和结尾动作，不能把信息并列堆砌成目录。",
    language: "zh-CN",
    changeNotes: "补强大纲规划对递进结构、证据提示和开头结尾策略的约束",
  },
  {
    promptId: "outline_plan",
    version: "v1.0.0",
    category: "writing",
    name: "大纲规划场景",
    description: "根据选题、人设、受众和素材生成结构化大纲",
    filePath: "system:writing",
    functionName: "outlinePlan",
    promptContent: "你是专栏主编。请基于主题、人设、受众和素材，设计一份真正可写的结构化文章大纲。大纲必须体现核心观点、论证递进、证据挂载、情绪转折、开头策略和结尾动作，不能把信息并列堆砌成目录。",
    language: "zh-CN",
    changeNotes: "新增二期标准场景码 outlinePlan",
  },
  {
    promptId: "deep_write",
    version: "v1.0.0",
    category: "writing",
    name: "深度写作",
    description: "围绕大纲、素材和风格生成写作执行卡",
    filePath: "system:writing",
    functionName: "deepWrite",
    promptContent: "你是资深专栏写作教练。请基于标题、大纲、素材、人设、受众和禁词约束，输出真正可执行的写作执行卡，明确章节任务、事实锚点、表达约束、情绪节奏和结尾动作，不要空泛复述大纲。",
    language: "zh-CN",
    changeNotes: "新增二期标准场景码 deepWrite",
  },
  {
    promptId: "fact_check",
    version: "v1.1.0",
    category: "review",
    name: "事实核查",
    description: "对正文中的事实、数据和案例进行核查提示",
    filePath: "system:review",
    functionName: "factCheck",
    promptContent: "你是事实核查编辑。请只针对正文中的具体事实、数据、案例、时间与因果判断做核查。不能把没有证据支持的表述说成已验证，必须明确区分已验证、待补证据、高风险表述和主观判断，并指出人设与选题是否偏离。",
    language: "zh-CN",
    changeNotes: "补强事实核查对证据充分性、风险分级和匹配度校验的约束",
  },
  {
    promptId: "prose_polish",
    version: "v1.1.0",
    category: "review",
    name: "文笔润色",
    description: "对正文的表达方式、节奏和情绪转折给出润色建议",
    filePath: "system:review",
    functionName: "prosePolish",
    promptContent: "你是终稿润色编辑。润色只负责表达，不负责新增事实。请评估正文的表达方式、金句节奏、专业性、通俗度和情绪转折，给出可直接执行的语言优化建议、重写开头和可落句的金句方向，避免空泛夸奖。",
    language: "zh-CN",
    changeNotes: "补强文笔润色对表达约束、重写开头和节奏建议的要求",
  },
  {
    promptId: "layout_extract",
    version: "v1.0.0",
    category: "publish",
    name: "排版提取",
    description: "分析参考文章排版结构并生成模板线索",
    filePath: "system:publish",
    functionName: "layoutExtract",
    promptContent: "你是微信排版分析师。请从参考文章里提取标题层级、分隔节奏、引用样式、重点标记、推荐区块和整体视觉结构，输出可转成模板 DSL 的结构化线索，不要只做审美评价。",
    language: "zh-CN",
    changeNotes: "新增二期标准场景码 layoutExtract",
  },
  {
    promptId: "publish_guard",
    version: "v1.0.0",
    category: "publish",
    name: "发布守门",
    description: "对发布前内容完整度、证据风险和配置缺口做检查",
    filePath: "system:publish",
    functionName: "publishGuard",
    promptContent: "你是发布守门编辑。请在发布前检查内容是否存在证据缺口、事实高风险、标题与正文不一致、缺少封面或模板、公众号配置缺失等问题，输出结构化阻断项、警告项和放行条件。",
    language: "zh-CN",
    changeNotes: "新增二期标准场景码 publishGuard",
  },
  {
    promptId: "wechat_render",
    version: "v1.0.0",
    category: "publish",
    name: "微信排版器",
    description: "将 Markdown 转为适合微信公众号的 HTML",
    filePath: "system:publish",
    functionName: "wechatRender",
    promptContent: "你是微信排版器。输出适配公众号草稿箱的简洁 HTML。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
] as const;

export async function ensureBootstrapData() {
  await ensureUsageCounterSchema();
  await ensureExtendedProductSchema();
  await ensureMarketplaceSeeds();
  await ensureDefaultTopics();

  const db = getDatabase();
  await db.exec("UPDATE users SET plan_code = ? WHERE plan_code = ?", ["ultra", "team"]);
  await db.exec("UPDATE subscriptions SET plan_code = ? WHERE plan_code = ?", ["ultra", "team"]);
  await db.exec("DELETE FROM plans WHERE code = ?", ["team"]);
  await db.exec("DELETE FROM ai_model_routes WHERE scene_code = ?", ["coverImage"]);
  for (const route of DEFAULT_MODEL_ROUTES) {
    const exists = await db.queryOne<{ id: number; primary_model: string; fallback_model: string | null; description: string | null }>(
      "SELECT id, primary_model, fallback_model, description FROM ai_model_routes WHERE scene_code = ?",
      [
      route.sceneCode,
      ],
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO ai_model_routes (scene_code, primary_model, fallback_model, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          route.sceneCode,
          route.primaryModel,
          route.fallbackModel,
          route.description,
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
      continue;
    }

    if (
      route.sceneCode === "fragmentDistill" &&
      (
        exists.primary_model === "gemini-2.5-flash-lite" ||
        exists.fallback_model === "gemini-2.5-flash" ||
        exists.description !== route.description
      )
    ) {
      await db.exec(
        `UPDATE ai_model_routes
         SET primary_model = ?, fallback_model = ?, description = ?, updated_at = ?
         WHERE scene_code = ?`,
        [route.primaryModel, route.fallbackModel, route.description, new Date().toISOString(), route.sceneCode],
      );
    }
  }

  await db.exec(
    `UPDATE ai_model_routes
     SET primary_model = ?, fallback_model = ?, updated_at = ?
     WHERE scene_code = ? AND (primary_model = ? OR fallback_model = ?)`,
    ["gemini-3.0-flash-lite", "gemini-3.0-flash", new Date().toISOString(), "fragmentDistill", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
  );

  for (const prompt of DEFAULT_PROMPT_SEEDS) {
    const exists = await db.queryOne<{ id: number }>(
      "SELECT id FROM prompt_versions WHERE prompt_id = ? AND version = ?",
      [prompt.promptId, prompt.version],
    );
    if (exists) {
      continue;
    }
    await db.exec(
      `INSERT INTO prompt_versions (
        prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prompt.promptId,
        prompt.version,
        prompt.category,
        prompt.name,
        prompt.description,
        prompt.filePath,
        prompt.functionName,
        prompt.promptContent,
        prompt.language,
        true,
        prompt.changeNotes,
        new Date().toISOString(),
      ],
    );
  }
}

export async function getPlans() {
  const db = getDatabase();
  return db.query<{
    code: string;
    name: string;
    price_cny: number;
    daily_generation_limit: number | null;
    fragment_limit: number | null;
    custom_banned_word_limit: number | null;
    max_wechat_connections: number | null;
    can_fork_genomes: number | boolean;
    can_publish_genomes: number | boolean;
    can_generate_cover_image: number | boolean;
    can_export_pdf: number | boolean;
    is_public: number | boolean;
  }>("SELECT * FROM plans ORDER BY price_cny ASC, id ASC");
}

export async function getLatestCoverImage(userId: number, documentId: number) {
  const db = getDatabase();
  return db.queryOne<{
    id: number;
    prompt: string;
    image_url: string;
    created_at: string;
  }>(
    `SELECT id, prompt, image_url, created_at
     FROM cover_images
     WHERE user_id = ? AND document_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, documentId],
  );
}

export async function getLatestCoverImageCandidates(userId: number, documentId: number) {
  const db = getDatabase();
  const latestBatch = await db.queryOne<{ batch_token: string }>(
    `SELECT batch_token
     FROM cover_image_candidates
     WHERE user_id = ? AND document_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, documentId],
  );
  if (!latestBatch?.batch_token) {
    return [] as Array<{
      id: number;
      batch_token: string;
      variant_label: string;
      prompt: string;
      image_url: string;
      is_selected: number | boolean;
      created_at: string;
      selected_at: string | null;
    }>;
  }
  return db.query<{
    id: number;
    batch_token: string;
    variant_label: string;
    prompt: string;
    image_url: string;
    is_selected: number | boolean;
    created_at: string;
    selected_at: string | null;
  }>(
    `SELECT id, batch_token, variant_label, prompt, image_url, is_selected, created_at, selected_at
     FROM cover_image_candidates
     WHERE user_id = ? AND document_id = ? AND batch_token = ?
     ORDER BY id ASC`,
    [userId, documentId, latestBatch.batch_token],
  );
}

export async function getDocumentImagePrompts(userId: number, documentId: number) {
  const db = getDatabase();
  return db.query<{
    id: number;
    document_node_id: number | null;
    asset_type: string;
    title: string;
    prompt: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, document_node_id, asset_type, title, prompt, created_at, updated_at
     FROM document_image_prompts
     WHERE user_id = ? AND document_id = ?
     ORDER BY COALESCE(document_node_id, 0) ASC, id ASC`,
    [userId, documentId],
  );
}

export async function getUsers() {
  const db = getDatabase();
  return db.query<{
    id: number;
    username: string;
    email: string | null;
    display_name: string | null;
    referral_code: string | null;
    referred_by_user_id: number | null;
    referred_by_username: string | null;
    role: string;
    plan_code: string;
    is_active: number | boolean;
    must_change_password: number | boolean;
    last_login_at: string | null;
    created_at: string;
  }>(
    `SELECT
       u.id,
       u.username,
       u.email,
       u.display_name,
       u.referral_code,
       u.referred_by_user_id,
       ref.username as referred_by_username,
       u.role,
       u.plan_code,
       u.is_active,
       u.must_change_password,
       u.last_login_at,
       u.created_at
     FROM users u
     LEFT JOIN users ref ON ref.id = u.referred_by_user_id
     ORDER BY u.id DESC`,
  );
}

export async function getAffiliateOverview(userId: number) {
  const db = getDatabase();
  const owner = await db.queryOne<{
    id: number;
    username: string;
    referral_code: string | null;
  }>("SELECT id, username, referral_code FROM users WHERE id = ?", [userId]);

  if (!owner) {
    throw new Error("用户不存在");
  }

  const referrals = await db.query<{
    id: number;
    username: string;
    display_name: string | null;
    plan_code: string;
    plan_name: string | null;
    price_cny: number | null;
    subscription_status: string;
    created_at: string;
  }>(
    `SELECT
       u.id,
       u.username,
       u.display_name,
       COALESCE(s.plan_code, u.plan_code) as plan_code,
       p.name as plan_name,
       p.price_cny,
       COALESCE(s.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) as subscription_status,
       u.created_at
     FROM users u
     LEFT JOIN subscriptions s ON s.id = (
       SELECT MAX(id) FROM subscriptions latest WHERE latest.user_id = u.id
     )
     LEFT JOIN plans p ON p.code = COALESCE(s.plan_code, u.plan_code)
     WHERE u.referred_by_user_id = ?
     ORDER BY u.created_at DESC, u.id DESC`,
    [userId],
  );

  const paidReferrals = referrals.filter((item) => item.plan_code !== "free");
  const activePaidReferrals = paidReferrals.filter((item) => item.subscription_status === "active");

  return {
    referralCode: getReferralCodeForUser(owner),
    referredUserCount: referrals.length,
    paidReferralCount: paidReferrals.length,
    activePaidReferralCount: activePaidReferrals.length,
    estimatedMonthlyCommissionCny: activePaidReferrals.reduce(
      (total, item) => total + Math.round((item.price_cny ?? 0) * 0.3),
      0,
    ),
    referrals,
  };
}

export async function getReferrerByReferralCode(referralCode: string) {
  const db = getDatabase();
  const normalizedCode = normalizeReferralCode(referralCode);
  const exact = await db.queryOne<{
    id: number;
    username: string;
    display_name: string | null;
    referral_code: string | null;
    role: string;
    plan_code: string;
  }>(
    `SELECT id, username, display_name, referral_code, role, plan_code
     FROM users
     WHERE referral_code = ?`,
    [normalizedCode],
  );
  if (exact) {
    return exact;
  }

  const referrerId = parseReferralCodeUserId(normalizedCode);
  if (!referrerId) {
    return null;
  }

  const byId = await db.queryOne<{
    id: number;
    username: string;
    display_name: string | null;
    referral_code: string | null;
    role: string;
    plan_code: string;
  }>(
    `SELECT id, username, display_name, referral_code, role, plan_code
     FROM users
     WHERE id = ?`,
    [referrerId],
  );
  if (!byId || !matchesReferralCode(byId, normalizedCode)) {
    return null;
  }
  return byId;
}

export async function getAdminBusinessOverview() {
  const db = getDatabase();
  const [users, documents, fragments, logs, referralRows] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM documents"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE status = ?", ["success"]),
    db.query<{
      referrer_id: number;
      referrer_username: string;
      referrer_display_name: string | null;
      referrer_referral_code: string | null;
      referred_user_id: number;
      plan_code: string;
      price_cny: number | null;
      subscription_status: string;
    }>(
      `SELECT
         ref.id as referrer_id,
         ref.username as referrer_username,
         ref.display_name as referrer_display_name,
         ref.referral_code as referrer_referral_code,
         u.id as referred_user_id,
         COALESCE(s.plan_code, u.plan_code) as plan_code,
         p.price_cny,
         COALESCE(s.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) as subscription_status
       FROM users ref
       INNER JOIN users u ON u.referred_by_user_id = ref.id
       LEFT JOIN subscriptions s ON s.id = (
         SELECT MAX(id) FROM subscriptions latest WHERE latest.user_id = u.id
       )
       LEFT JOIN plans p ON p.code = COALESCE(s.plan_code, u.plan_code)
       ORDER BY ref.id ASC, u.id DESC`,
    ),
  ]);

  const leaderboardMap = new Map<
    number,
    {
      userId: number;
      username: string;
      displayName: string | null;
      referralCode: string;
      referredUserCount: number;
      activePaidReferralCount: number;
      estimatedMonthlyCommissionCny: number;
    }
  >();

  for (const row of referralRows) {
    const current =
      leaderboardMap.get(row.referrer_id) ??
      {
        userId: row.referrer_id,
        username: row.referrer_username,
        displayName: row.referrer_display_name,
        referralCode: getReferralCodeForUser({
          id: row.referrer_id,
          username: row.referrer_username,
          referral_code: row.referrer_referral_code,
        }),
        referredUserCount: 0,
        activePaidReferralCount: 0,
        estimatedMonthlyCommissionCny: 0,
      };

    current.referredUserCount += 1;
    if (row.plan_code !== "free" && row.subscription_status === "active") {
      current.activePaidReferralCount += 1;
      current.estimatedMonthlyCommissionCny += Math.round((row.price_cny ?? 0) * 0.3);
    }

    leaderboardMap.set(row.referrer_id, current);
  }

  const affiliateLeaderboard = Array.from(leaderboardMap.values()).sort((left, right) => {
    if (right.activePaidReferralCount !== left.activePaidReferralCount) {
      return right.activePaidReferralCount - left.activePaidReferralCount;
    }
    if (right.referredUserCount !== left.referredUserCount) {
      return right.referredUserCount - left.referredUserCount;
    }
    return right.estimatedMonthlyCommissionCny - left.estimatedMonthlyCommissionCny;
  });

  return {
    userCount: users?.count ?? 0,
    documentCount: documents?.count ?? 0,
    fragmentCount: fragments?.count ?? 0,
    successSyncCount: logs?.count ?? 0,
    referredUserCount: referralRows.length,
    activePaidReferralCount: referralRows.filter((row) => row.plan_code !== "free" && row.subscription_status === "active").length,
    estimatedMonthlyCommissionCny: affiliateLeaderboard.reduce(
      (total, item) => total + item.estimatedMonthlyCommissionCny,
      0,
    ),
    affiliateLeaderboard: affiliateLeaderboard.slice(0, 8),
  };
}

export async function getCreatorProfileBySlug(slug: string) {
  const db = getDatabase();
  const creator = await db.queryOne<{
    id: number;
    username: string;
    display_name: string | null;
    referral_code: string | null;
    created_at: string;
  }>("SELECT id, username, display_name, referral_code, created_at FROM users WHERE username = ?", [slug]);

  if (!creator) {
    return null;
  }

  const [publishedDocuments, successSyncLogs, publicGenomes, genomeForks, referrals] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND status = ?", [creator.id, "published"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE user_id = ? AND status = ?", [creator.id, "success"]),
    db.query<{
      id: number;
      name: string;
      description: string | null;
      meta: string | null;
      published_at: string | null;
      created_at: string;
    }>(
      `SELECT id, name, description, meta, published_at, created_at
       FROM style_genomes
       WHERE owner_user_id = ? AND is_public = ?
       ORDER BY published_at DESC, id DESC`,
      [creator.id, true],
    ),
    db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM style_genome_forks
       WHERE source_genome_id IN (
         SELECT id FROM style_genomes WHERE owner_user_id = ? AND is_public = ?
       )`,
      [creator.id, true],
    ),
    db.query<{
      plan_code: string;
      price_cny: number | null;
      subscription_status: string;
    }>(
      `SELECT
         COALESCE(s.plan_code, u.plan_code) as plan_code,
         p.price_cny,
         COALESCE(s.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) as subscription_status
       FROM users u
       LEFT JOIN subscriptions s ON s.id = (
         SELECT MAX(id) FROM subscriptions latest WHERE latest.user_id = u.id
       )
       LEFT JOIN plans p ON p.code = COALESCE(s.plan_code, u.plan_code)
       WHERE u.referred_by_user_id = ?`,
      [creator.id],
    ),
  ]);

  const paidReferrals = referrals.filter((item) => item.plan_code !== "free" && item.subscription_status === "active");
  const estimatedMonthlyCommissionCny = paidReferrals.reduce(
    (total, item) => total + Math.round((item.price_cny ?? 0) * 0.3),
    0,
  );

  return {
    id: creator.id,
    username: creator.username,
    displayName: creator.display_name,
    referralCode: getReferralCodeForUser(creator),
    joinedAt: creator.created_at,
    publishedDocumentCount: publishedDocuments?.count ?? 0,
    successSyncCount: successSyncLogs?.count ?? 0,
    publicGenomeCount: publicGenomes.length,
    publicGenomeForkCount: genomeForks?.count ?? 0,
    referredUserCount: referrals.length,
    activePaidReferralCount: paidReferrals.length,
    estimatedMonthlyCommissionCny,
    publicGenomes,
  };
}

export async function getAdminSubscriptions() {
  const db = getDatabase();
  return db.query<{
    id: number | null;
    user_id: number;
    username: string;
    display_name: string | null;
    plan_code: string;
    plan_name: string | null;
    status: string;
    start_at: string | null;
    end_at: string | null;
    source: string;
    updated_at: string;
  }>(
    `SELECT
       s.id,
       u.id as user_id,
       u.username,
       u.display_name,
       COALESCE(s.plan_code, u.plan_code) as plan_code,
       p.name as plan_name,
       COALESCE(s.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) as status,
       s.start_at,
       s.end_at,
       COALESCE(s.source, 'manual') as source,
       COALESCE(s.updated_at, u.updated_at) as updated_at
     FROM users u
     LEFT JOIN subscriptions s ON s.id = (
       SELECT MAX(id) FROM subscriptions latest WHERE latest.user_id = u.id
     )
     LEFT JOIN plans p ON p.code = COALESCE(s.plan_code, u.plan_code)
     ORDER BY COALESCE(s.id, 0) DESC, u.id DESC`,
  );
}

export async function getDocumentsByUser(userId: number) {
  const db = getDatabase();
  return db.query<{
    id: number;
    title: string;
    markdown_content: string;
    html_content: string | null;
    status: string;
    style_genome_id: number | null;
    wechat_template_id: string | null;
    updated_at: string;
    created_at: string;
  }>("SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC, id DESC", [userId]);
}

export async function getDocumentById(documentId: number, userId?: number) {
  const db = getDatabase();
  if (userId) {
    return db.queryOne<{
      id: number;
      user_id: number;
      title: string;
      markdown_content: string;
      html_content: string | null;
      status: string;
      style_genome_id: number | null;
      wechat_template_id: string | null;
      created_at: string;
      updated_at: string;
    }>("SELECT * FROM documents WHERE id = ? AND user_id = ?", [documentId, userId]);
  }
  return db.queryOne<{
    id: number;
    user_id: number;
    title: string;
    markdown_content: string;
    html_content: string | null;
    status: string;
    style_genome_id: number | null;
    wechat_template_id: string | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM documents WHERE id = ?", [documentId]);
}

export async function createDocument(userId: number, title: string) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const html = await renderMarkdownToHtml("", { title });
  const result = await db.exec(
    `INSERT INTO documents (user_id, title, markdown_content, html_content, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, title, "", html, "draft", now, now],
  );
  await ensureDefaultDocumentNodes(result.lastInsertRowid!);
  await ensureDocumentWorkflow(result.lastInsertRowid!, "topicRadar");
  await appendAuditLog({
    userId,
    action: "document.create",
    targetType: "document",
    targetId: result.lastInsertRowid!,
    payload: { title },
  });
  return getDocumentById(result.lastInsertRowid!, userId);
}

export async function saveDocument(input: {
  documentId: number;
  userId: number;
  title?: string;
  markdownContent?: string;
  status?: string;
  styleGenomeId?: number | null;
  wechatTemplateId?: string | null;
}) {
  const current = await getDocumentById(input.documentId, input.userId);
  if (!current) {
    throw new Error("文稿不存在");
  }
  const title = input.title ?? current.title;
  const markdownContent = input.markdownContent ?? current.markdown_content;
  const status = input.status ?? current.status;
  const styleGenomeId = input.styleGenomeId === undefined ? current.style_genome_id : input.styleGenomeId;
  const wechatTemplateId = input.wechatTemplateId === undefined ? current.wechat_template_id : input.wechatTemplateId;
  const template = wechatTemplateId ? await getActiveTemplateById(wechatTemplateId, input.userId) : null;
  const htmlContent = await renderMarkdownToHtml(markdownContent, {
    title,
    template: resolveTemplateRenderConfig(template),
  });
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE documents
     SET title = ?, markdown_content = ?, html_content = ?, status = ?, style_genome_id = ?, wechat_template_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [title, markdownContent, htmlContent, status, styleGenomeId, wechatTemplateId, now, input.documentId, input.userId],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "document.save",
    targetType: "document",
    targetId: input.documentId,
    payload: { title, status, styleGenomeId, wechatTemplateId },
  });
  return getDocumentById(input.documentId, input.userId);
}

export async function createDocumentSnapshot(documentId: number, note?: string) {
  const db = getDatabase();
  const document = await getDocumentById(documentId);
  if (!document) {
    throw new Error("文稿不存在");
  }
  const result = await db.exec(
    `INSERT INTO document_snapshots (document_id, markdown_content, html_content, snapshot_note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [documentId, document.markdown_content, document.html_content, note ?? null, new Date().toISOString()],
  );
  return db.queryOne<{
    id: number;
    markdown_content: string;
    html_content: string | null;
    snapshot_note: string | null;
    created_at: string;
  }>("SELECT * FROM document_snapshots WHERE id = ?", [result.lastInsertRowid!]);
}

export async function getDocumentSnapshots(documentId: number, options?: { retentionDays?: number | null }) {
  const db = getDatabase();
  const retentionDays = options?.retentionDays ?? null;
  const cutoff =
    retentionDays != null
      ? new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  return db.query<{
    id: number;
    markdown_content: string;
    html_content: string | null;
    snapshot_note: string | null;
    created_at: string;
  }>(
    cutoff
      ? "SELECT * FROM document_snapshots WHERE document_id = ? AND created_at >= ? ORDER BY id DESC"
      : "SELECT * FROM document_snapshots WHERE document_id = ? ORDER BY id DESC",
    cutoff ? [documentId, cutoff] : [documentId],
  );
}

export async function restoreDocumentSnapshot(documentId: number, snapshotId: number, userId: number) {
  const db = getDatabase();
  const snapshot = await db.queryOne<{
    markdown_content: string;
    html_content: string | null;
  }>("SELECT markdown_content, html_content FROM document_snapshots WHERE id = ? AND document_id = ?", [
    snapshotId,
    documentId,
  ]);
  if (!snapshot) {
    throw new Error("快照不存在");
  }
  await saveDocument({
    documentId,
    userId,
    markdownContent: snapshot.markdown_content,
    status: "draft",
  });
}

export async function getFragmentsByUser(userId: number) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  return db.query<{
    id: number;
    user_id: number;
    source_type: string;
    title: string | null;
    raw_content: string | null;
    distilled_content: string;
    source_url: string | null;
    screenshot_path: string | null;
    created_at: string;
  }>(
    `SELECT * FROM fragments WHERE user_id IN (${placeholders}) ORDER BY id DESC`,
    scope.userIds,
  );
}

export async function getAssetFilesByUser(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<{
    id: number;
    document_id: number | null;
    document_title: string | null;
    asset_scope: string;
    asset_type: string;
    legacy_asset_id: number;
    batch_token: string | null;
    variant_label: string | null;
    storage_provider: string | null;
    public_url: string | null;
    original_object_key: string | null;
    compressed_object_key: string | null;
    thumbnail_object_key: string | null;
    mime_type: string | null;
    byte_length: number | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       af.id,
       af.document_id,
       d.title AS document_title,
       af.asset_scope,
       af.asset_type,
       af.legacy_asset_id,
       af.batch_token,
       af.variant_label,
       af.storage_provider,
       af.public_url,
       af.original_object_key,
       af.compressed_object_key,
       af.thumbnail_object_key,
       af.mime_type,
       af.byte_length,
       af.status,
       af.created_at,
       af.updated_at
     FROM asset_files af
     LEFT JOIN documents d ON d.id = af.document_id
     WHERE af.user_id = ?
     ORDER BY af.updated_at DESC, af.id DESC`,
    [userId],
  );
}

function parseAssetManifest(
  value: unknown,
): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readAssetVariantMeta(
  value: unknown,
): { objectKey: string | null; byteLength: number | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { objectKey: null, byteLength: null };
  }
  const record = value as Record<string, unknown>;
  const objectKey = String(record.objectKey || "").trim() || null;
  const byteLength = Number(record.byteLength || 0);
  return {
    objectKey,
    byteLength: Number.isFinite(byteLength) && byteLength > 0 ? byteLength : null,
  };
}

export async function getImageAssetStorageSummary(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    asset_type: string;
    byte_length: number | null;
    manifest_json: string | Record<string, unknown> | null;
    public_url: string | null;
    original_object_key: string | null;
    compressed_object_key: string | null;
    thumbnail_object_key: string | null;
    status: string;
  }>(
    `SELECT
       id,
       asset_type,
       byte_length,
       manifest_json,
       public_url,
       original_object_key,
       compressed_object_key,
       thumbnail_object_key,
       status
     FROM asset_files
     WHERE user_id = ? AND asset_type = ?
     ORDER BY id ASC`,
    [userId, "cover_image"],
  );

  const objects = new Map<string, number>();

  for (const row of rows) {
    const manifest = parseAssetManifest(row.manifest_json);
    const variants = [
      readAssetVariantMeta(manifest?.original),
      readAssetVariantMeta(manifest?.compressed),
      readAssetVariantMeta(manifest?.thumbnail),
    ];

    const fallbackKeys = [
      { key: String(row.original_object_key || "").trim(), bytes: null as number | null },
      { key: String(row.compressed_object_key || "").trim(), bytes: row.byte_length },
      { key: String(row.thumbnail_object_key || "").trim(), bytes: null as number | null },
    ];

    let rowTracked = false;

    for (const variant of variants) {
      if (!variant.objectKey) continue;
      rowTracked = true;
      const current = objects.get(variant.objectKey) ?? 0;
      objects.set(variant.objectKey, Math.max(current, variant.byteLength ?? 0));
    }

    for (const fallback of fallbackKeys) {
      if (!fallback.key || objects.has(fallback.key)) continue;
      rowTracked = true;
      const bytes = Number(fallback.bytes || 0);
      objects.set(fallback.key, Number.isFinite(bytes) && bytes > 0 ? bytes : 0);
    }

    if (rowTracked) {
      continue;
    }

    const bytes = Number(row.byte_length || 0);
    const fallbackIdentity = String(row.public_url || "").trim() || `asset-file:${row.id}`;
    objects.set(fallbackIdentity, Number.isFinite(bytes) && bytes > 0 ? bytes : 0);
  }

  return {
    assetRecordCount: rows.length,
    readyAssetRecordCount: rows.filter((row) => row.status === "ready").length,
    uniqueObjectCount: objects.size,
    usedBytes: Array.from(objects.values()).reduce((total, value) => total + value, 0),
  };
}

export async function createFragment(input: {
  userId: number;
  sourceType: string;
  title?: string | null;
  rawContent?: string | null;
  distilledContent: string;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const embedding = buildSemanticEmbedding([input.title, input.distilledContent, input.rawContent].filter(Boolean).join("\n"));
  const result = await db.exec(
    `INSERT INTO fragments (
      user_id, source_type, title, raw_content, distilled_content, source_url, screenshot_path, embedding_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.sourceType,
      input.title ?? null,
      input.rawContent ?? null,
      input.distilledContent,
      input.sourceUrl ?? null,
      input.screenshotPath ?? null,
      embedding,
      now,
      now,
    ],
  );
  await db.exec(
    `INSERT INTO fragment_sources (fragment_id, source_type, source_url, screenshot_path, raw_payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [result.lastInsertRowid!, input.sourceType, input.sourceUrl ?? null, input.screenshotPath ?? null, { title: input.title, rawContent: input.rawContent }, now],
  );
  await db.exec(
    `INSERT INTO fragment_embeddings (fragment_id, embedding_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [result.lastInsertRowid!, embedding, now, now],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "fragment.create",
    targetType: "fragment",
    targetId: result.lastInsertRowid!,
    payload: { sourceType: input.sourceType, title: input.title },
  });
  return db.queryOne("SELECT * FROM fragments WHERE id = ?", [result.lastInsertRowid!]);
}

export async function searchFragments(userId: number, query: string) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const trimmedQuery = query.trim();
  const fragments = await db.query<{
    id: number;
    title: string | null;
    distilled_content: string;
    source_type: string;
    created_at: string;
    embedding_json: string | null;
    fragment_embedding_json: string | null;
  }>(
    `SELECT f.id, f.title, f.distilled_content, f.source_type, f.created_at, f.embedding_json,
            fe.embedding_json AS fragment_embedding_json
     FROM fragments f
     LEFT JOIN fragment_embeddings fe ON fe.fragment_id = f.id
     WHERE f.user_id IN (${placeholders})
     ORDER BY f.id DESC`,
    scope.userIds,
  );

  const ranked = [];
  for (const fragment of fragments) {
    const text = [fragment.title, fragment.distilled_content].filter(Boolean).join("\n");
    const storedEmbedding = parseSemanticEmbedding(fragment.fragment_embedding_json || fragment.embedding_json);
    const embedding = Object.keys(storedEmbedding).length ? storedEmbedding : buildSemanticEmbedding(text);

    if (!Object.keys(storedEmbedding).length) {
      const now = new Date().toISOString();
      await db.exec("UPDATE fragments SET embedding_json = ?, updated_at = ? WHERE id = ?", [embedding, now, fragment.id]);
      await db.exec(
        `INSERT INTO fragment_embeddings (fragment_id, embedding_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(fragment_id) DO UPDATE SET embedding_json = excluded.embedding_json, updated_at = excluded.updated_at`,
        [fragment.id, embedding, now, now],
      );
    }

    const score = trimmedQuery ? scoreSemanticMatch(trimmedQuery, text, embedding) : 0;
    if (!trimmedQuery || score > 0.08) {
      ranked.push({
        ...fragment,
        score,
      });
    }
  }

  return ranked
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.id - left.id;
    })
    .slice(0, trimmedQuery ? 24 : 50);
}

export async function getBannedWords(userId: number) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const words = await db.query<{ id: number; user_id: number; word: string; created_at: string }>(
    `SELECT id, user_id, word, created_at FROM banned_words WHERE user_id IN (${placeholders}) ORDER BY id DESC`,
    scope.userIds,
  );
  const deduped = new Map<string, { id: number; word: string; created_at: string }>();
  for (const word of words) {
    if (!deduped.has(word.word.trim())) {
      deduped.set(word.word.trim(), {
        id: word.id,
        word: word.word,
        created_at: word.created_at,
      });
    }
  }
  return Array.from(deduped.values());
}

export async function addBannedWord(userId: number, word: string) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const normalized = word.trim();
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id FROM banned_words WHERE user_id IN (${placeholders}) AND word = ? LIMIT 1`,
    [...scope.userIds, normalized],
  );
  if (existing) {
    return;
  }
  await db.exec("INSERT INTO banned_words (user_id, word, created_at) VALUES (?, ?, ?)", [userId, normalized, new Date().toISOString()]);
}

export async function deleteBannedWord(userId: number, wordId: number) {
  const db = getDatabase();
  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  await db.exec(`DELETE FROM banned_words WHERE id = ? AND user_id IN (${placeholders})`, [wordId, ...scope.userIds]);
}

export async function getPromptVersions() {
  const db = getDatabase();
  return db.query<{
    id: number;
    prompt_id: string;
    version: string;
    category: string;
    name: string;
    description: string | null;
    file_path: string;
    function_name: string;
    prompt_content: string;
    language: string | null;
    created_at: string;
    is_active: number | boolean;
    change_notes: string | null;
  }>("SELECT * FROM prompt_versions ORDER BY category ASC, prompt_id ASC, created_at DESC");
}

export async function getPromptDetail(promptId: string) {
  const db = getDatabase();
  return db.query<{
    id: number;
    prompt_id: string;
    version: string;
    category: string;
    name: string;
    description: string | null;
    file_path: string;
    function_name: string;
    prompt_content: string;
    language: string | null;
    created_at: string;
    is_active: number | boolean;
    change_notes: string | null;
  }>("SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC, id DESC", [promptId]);
}

export async function createPromptVersion(input: {
  promptId: string;
  version: string;
  category: string;
  name: string;
  description?: string | null;
  filePath: string;
  functionName: string;
  promptContent: string;
  language?: string;
  isActive?: boolean;
  changeNotes?: string | null;
  createdBy?: number | null;
}) {
  const db = getDatabase();
  if (input.isActive) {
    await db.exec("UPDATE prompt_versions SET is_active = ? WHERE prompt_id = ?", [false, input.promptId]);
  }
  await db.exec(
    `INSERT INTO prompt_versions (
      prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, created_by, created_at, is_active, change_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.promptId,
      input.version,
      input.category,
      input.name,
      input.description ?? null,
      input.filePath,
      input.functionName,
      input.promptContent,
      input.language ?? "zh-CN",
      input.createdBy ?? null,
      new Date().toISOString(),
      input.isActive ?? false,
      input.changeNotes ?? null,
    ],
  );
  clearPromptCache(input.promptId);
}

export async function activatePromptVersion(promptId: string, version: string) {
  const db = getDatabase();
  await db.exec("UPDATE prompt_versions SET is_active = ? WHERE prompt_id = ?", [false, promptId]);
  await db.exec("UPDATE prompt_versions SET is_active = ? WHERE prompt_id = ? AND version = ?", [true, promptId, version]);
  clearPromptCache(promptId);
}

export async function getModelRoutes() {
  const db = getDatabase();
  return db.query<{
    id: number;
    scene_code: string;
    primary_model: string;
    fallback_model: string | null;
    description: string | null;
    updated_at: string;
  }>("SELECT * FROM ai_model_routes WHERE scene_code != ? ORDER BY id ASC", ["coverImage"]);
}

export async function updateModelRoute(input: {
  sceneCode: string;
  primaryModel: string;
  fallbackModel?: string | null;
  description?: string | null;
}) {
  if (!DEFAULT_MODEL_ROUTES.some((route) => route.sceneCode === input.sceneCode)) {
    throw new Error("该场景不属于可编辑的文本模型路由");
  }
  const db = getDatabase();
  await db.exec(
    `UPDATE ai_model_routes
     SET primary_model = ?, fallback_model = ?, description = ?, updated_at = ?
     WHERE scene_code = ?`,
    [
      input.primaryModel,
      input.fallbackModel ?? null,
      input.description ?? null,
      new Date().toISOString(),
      input.sceneCode,
    ],
  );
}

export async function getWechatConnections(userId: number) {
  const db = getDatabase();
  return db.query<{
    id: number;
    account_name: string | null;
    original_id: string | null;
    status: string;
    access_token_expires_at: string | null;
    is_default: number | boolean;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, account_name, original_id, status, access_token_expires_at, is_default, created_at, updated_at
     FROM wechat_connections
     WHERE user_id = ? AND status != ?
     ORDER BY is_default DESC, id DESC`,
    [userId, "disabled"],
  );
}

export async function getWechatConnectionRaw(connectionId: number, userId?: number) {
  const db = getDatabase();
  if (userId) {
    return db.queryOne<{
      id: number;
      user_id: number;
      account_name: string | null;
      original_id: string | null;
      app_id_encrypted: string;
      app_secret_encrypted: string;
      access_token_encrypted: string | null;
      access_token_expires_at: string | null;
      status: "valid" | "invalid" | "expired" | "disabled";
      is_default: number | boolean;
    }>("SELECT * FROM wechat_connections WHERE id = ? AND user_id = ?", [connectionId, userId]);
  }
  return db.queryOne<{
    id: number;
    user_id: number;
    account_name: string | null;
    original_id: string | null;
    app_id_encrypted: string;
    app_secret_encrypted: string;
    access_token_encrypted: string | null;
    access_token_expires_at: string | null;
    status: "valid" | "invalid" | "expired" | "disabled";
    is_default: number | boolean;
  }>("SELECT * FROM wechat_connections WHERE id = ?", [connectionId]);
}

export async function upsertWechatConnection(input: {
  userId: number;
  connectionId?: number;
  accountName?: string | null;
  originalId?: string | null;
  appIdEncrypted: string;
  appSecretEncrypted: string;
  accessTokenEncrypted?: string | null;
  accessTokenExpiresAt?: string | null;
  status: string;
  isDefault?: boolean;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  if (input.isDefault) {
    await db.exec("UPDATE wechat_connections SET is_default = ? WHERE user_id = ?", [false, input.userId]);
  }
  if (input.connectionId) {
    await db.exec(
      `UPDATE wechat_connections
       SET account_name = ?, original_id = ?, app_id_encrypted = ?, app_secret_encrypted = ?, access_token_encrypted = ?,
           access_token_expires_at = ?, status = ?, is_default = ?, updated_at = ?, last_verified_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        input.accountName ?? null,
        input.originalId ?? null,
        input.appIdEncrypted,
        input.appSecretEncrypted,
        input.accessTokenEncrypted ?? null,
        input.accessTokenExpiresAt ?? null,
        input.status,
        input.isDefault ?? false,
        now,
        now,
        input.connectionId,
        input.userId,
      ],
    );
    return;
  }

  await db.exec(
    `INSERT INTO wechat_connections (
      user_id, account_name, original_id, app_id_encrypted, app_secret_encrypted, access_token_encrypted,
      access_token_expires_at, status, last_verified_at, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.accountName ?? null,
      input.originalId ?? null,
      input.appIdEncrypted,
      input.appSecretEncrypted,
      input.accessTokenEncrypted ?? null,
      input.accessTokenExpiresAt ?? null,
      input.status,
      now,
      input.isDefault ?? false,
      now,
      now,
    ],
  );
}

export async function disableWechatConnection(connectionId: number, userId: number) {
  const db = getDatabase();
  await db.exec(
    `UPDATE wechat_connections
     SET status = ?, is_default = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    ["disabled", false, new Date().toISOString(), connectionId, userId],
  );
}

export async function updateWechatConnectionToken(input: {
  connectionId: number;
  userId: number;
  accessTokenEncrypted: string;
  accessTokenExpiresAt: string;
  status?: "valid" | "expired" | "invalid";
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE wechat_connections
     SET access_token_encrypted = ?, access_token_expires_at = ?, status = ?, last_verified_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      input.accessTokenEncrypted,
      input.accessTokenExpiresAt,
      input.status ?? "valid",
      now,
      now,
      input.connectionId,
      input.userId,
    ],
  );
}

export async function createWechatSyncLog(input: {
  userId: number;
  documentId: number;
  wechatConnectionId: number;
  mediaId?: string | null;
  status: string;
  requestSummary?: unknown;
  responseSummary?: unknown;
  failureReason?: string | null;
  failureCode?: string | null;
  retryCount?: number;
  documentVersionHash?: string | null;
  templateId?: string | null;
  idempotencyKey?: string | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.exec(
    `INSERT INTO wechat_sync_logs (
      user_id, document_id, wechat_connection_id, media_id, status, request_summary, response_summary, failure_reason, failure_code, retry_count, document_version_hash, template_id, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.documentId,
      input.wechatConnectionId,
      input.mediaId ?? null,
      input.status,
      input.requestSummary ?? null,
      input.responseSummary ?? null,
      input.failureReason ?? null,
      input.failureCode ?? null,
      input.retryCount ?? 0,
      input.documentVersionHash ?? null,
      input.templateId ?? null,
      input.idempotencyKey ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
}

export async function getWechatSyncLogs(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<{
    id: number;
    document_id: number;
    title: string;
    connection_name: string | null;
    media_id: string | null;
    status: string;
    request_summary: string | Record<string, unknown> | null;
    response_summary: string | Record<string, unknown> | null;
    failure_reason: string | null;
    failure_code: string | null;
    retry_count: number;
    document_version_hash: string | null;
    template_id: string | null;
    idempotency_key: string | null;
    created_at: string;
  }>(
    `SELECT
       l.id,
       l.document_id,
       d.title,
       c.account_name as connection_name,
       l.media_id,
       l.status,
       l.request_summary,
       l.response_summary,
       l.failure_reason,
       l.failure_code,
       l.retry_count,
       l.document_version_hash,
       l.template_id,
       l.idempotency_key,
       l.created_at
     FROM wechat_sync_logs l
     INNER JOIN documents d ON d.id = l.document_id
     LEFT JOIN wechat_connections c ON c.id = l.wechat_connection_id
     WHERE l.user_id = ?
     ORDER BY l.id DESC`,
    [userId],
  );
}

export async function getLatestWechatSyncLogForDocument(input: {
  userId: number;
  documentId: number;
  wechatConnectionId?: number | null;
  documentVersionHash?: string | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const clauses = ["user_id = ?", "document_id = ?"];
  const params: unknown[] = [input.userId, input.documentId];
  if (input.wechatConnectionId != null) {
    clauses.push("wechat_connection_id = ?");
    params.push(input.wechatConnectionId);
  }
  if (input.documentVersionHash) {
    clauses.push("document_version_hash = ?");
    params.push(input.documentVersionHash);
  }
  return db.queryOne<{
    id: number;
    media_id: string | null;
    status: string;
    failure_reason: string | null;
    failure_code: string | null;
    retry_count: number;
    document_version_hash: string | null;
    template_id: string | null;
    idempotency_key: string | null;
    created_at: string;
  }>(
    `SELECT id, media_id, status, failure_reason, failure_code, retry_count, document_version_hash, template_id, idempotency_key, created_at
     FROM wechat_sync_logs
     WHERE ${clauses.join(" AND ")}
     ORDER BY id DESC
     LIMIT 1`,
    params,
  );
}

export async function createSupportMessage(input: {
  name: string;
  email: string;
  issueType: string;
  description: string;
  sourcePage?: string | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO support_messages (name, email, issue_type, description, status, source_page, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name.trim(),
      input.email.trim(),
      input.issueType.trim(),
      input.description.trim(),
      "open",
      input.sourcePage ?? null,
      now,
      now,
    ],
  );
  return result.lastInsertRowid ?? null;
}

export async function getRecentSupportMessages(limit = 6) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Number(limit), 1), 20);
  return db.query<{
    id: number;
    name: string;
    email: string;
    issue_type: string;
    description: string;
    status: string;
    source_page: string | null;
    created_at: string;
  }>(
    `SELECT id, name, email, issue_type, description, status, source_page, created_at
     FROM support_messages
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
  );
}

export async function getSupportMessageCount() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM support_messages");
}

export async function getUserWorkspaceAssetSummary(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [
    documents,
    fragments,
    authorPersonas,
    writingStyleProfiles,
    knowledgeCards,
    activeKnowledgeCards,
    conflictedKnowledgeCards,
    ownedStyleGenomes,
    publishedStyleGenomes,
    customTemplates,
    coverImages,
    imagePrompts,
    customTopicSources,
    wechatConnections,
  ] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM documents WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM author_personas WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM writing_style_profiles WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ? AND status = ?", [userId, "active"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ? AND status = ?", [userId, "conflicted"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM style_genomes WHERE owner_user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM style_genomes WHERE owner_user_id = ? AND is_public = ?", [userId, true]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM layout_templates WHERE owner_user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM cover_images WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM document_image_prompts WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM topic_sources WHERE owner_user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_connections WHERE user_id = ?", [userId]),
  ]);

  return {
    documentsCount: documents?.count ?? 0,
    fragmentsCount: fragments?.count ?? 0,
    authorPersonasCount: authorPersonas?.count ?? 0,
    writingStyleProfilesCount: writingStyleProfiles?.count ?? 0,
    knowledgeCardsCount: knowledgeCards?.count ?? 0,
    activeKnowledgeCardsCount: activeKnowledgeCards?.count ?? 0,
    conflictedKnowledgeCardsCount: conflictedKnowledgeCards?.count ?? 0,
    ownedStyleGenomesCount: ownedStyleGenomes?.count ?? 0,
    publishedStyleGenomesCount: publishedStyleGenomes?.count ?? 0,
    customTemplatesCount: customTemplates?.count ?? 0,
    coverImagesCount: coverImages?.count ?? 0,
    imagePromptsCount: imagePrompts?.count ?? 0,
    customTopicSourcesCount: customTopicSources?.count ?? 0,
    wechatConnectionsCount: wechatConnections?.count ?? 0,
  };
}

export async function getCurrentSubscriptionForUser(userId: number) {
  const db = getDatabase();
  return db.queryOne<{
    id: number | null;
    plan_code: string;
    plan_name: string | null;
    price_cny: number | null;
    status: string;
    start_at: string | null;
    end_at: string | null;
    source: string | null;
    updated_at: string | null;
  }>(
    `SELECT
       s.id,
       COALESCE(s.plan_code, u.plan_code) as plan_code,
       p.name as plan_name,
       p.price_cny,
       COALESCE(s.status, CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END) as status,
       s.start_at,
       s.end_at,
       s.source,
       s.updated_at
     FROM users u
     LEFT JOIN subscriptions s ON s.id = (
       SELECT MAX(id) FROM subscriptions latest WHERE latest.user_id = u.id
     )
     LEFT JOIN plans p ON p.code = COALESCE(s.plan_code, u.plan_code)
     WHERE u.id = ?`,
    [userId],
  );
}

export async function getTopicItems(userId?: number) {
  await ensureDefaultTopics();
  const db = getDatabase();
  if (userId) {
    const scope = await getUserAccessScope(userId);
    const placeholders = scope.userIds.map(() => "?").join(", ");
    return db.query<{
      id: number;
      owner_user_id: number | null;
      source_name: string;
      source_type: string | null;
      source_priority: number | null;
      title: string;
      summary: string | null;
      emotion_labels_json: string | string[] | null;
      angle_options_json: string | string[] | null;
      source_url: string | null;
      published_at: string | null;
    }>(
      `SELECT
         ti.*,
         ts.source_type,
         ts.priority AS source_priority
       FROM topic_items ti
       LEFT JOIN topic_sources ts
         ON ts.name = ti.source_name
        AND (
          (ti.owner_user_id IS NULL AND ts.owner_user_id IS NULL)
          OR ti.owner_user_id = ts.owner_user_id
        )
       WHERE owner_user_id IS NULL OR owner_user_id IN (${placeholders})
       ORDER BY ti.id DESC`,
      scope.userIds,
    );
  }
  return db.query<{
    id: number;
    owner_user_id: number | null;
    source_name: string;
    source_type: string | null;
    source_priority: number | null;
    title: string;
    summary: string | null;
    emotion_labels_json: string | string[] | null;
    angle_options_json: string | string[] | null;
    source_url: string | null;
    published_at: string | null;
  }>(
    `SELECT
       ti.*,
       ts.source_type,
       ts.priority AS source_priority
     FROM topic_items ti
     LEFT JOIN topic_sources ts
       ON ts.name = ti.source_name
      AND (
        (ti.owner_user_id IS NULL AND ts.owner_user_id IS NULL)
        OR ti.owner_user_id = ts.owner_user_id
      )
     ORDER BY ti.id DESC`,
  );
}

export async function queueJob(jobType: string, payload: unknown) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO job_queue (job_type, status, payload_json, run_at, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [jobType, "queued", payload, new Date().toISOString(), 0, new Date().toISOString(), new Date().toISOString()],
  );
}
