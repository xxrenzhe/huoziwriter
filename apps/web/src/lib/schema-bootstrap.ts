import { STYLE_TEMPLATE_LIBRARY } from "./catalog";
import { backfillAssetFilesFromCoverAssets } from "./asset-files";
import { getDatabase } from "./db";
import { backfillLayoutTemplatesFromTemplateVersions, syncTemplateVersionToLayoutTemplates } from "./layout-templates";
import { syncPersonaCatalogToPersonaTags } from "./persona-tags";
import { syncLegacyTopicSourcesToSourceConnectors, syncTopicSourceToSourceConnector } from "./source-connectors";

async function execAll(statements: string[]) {
  const db = getDatabase();
  for (const statement of statements) {
    await db.exec(statement);
  }
}

async function hasColumn(table: string, column: string) {
  const db = getDatabase();
  if (db.type === "sqlite") {
    const columns = await db.query<{ name: string }>(`PRAGMA table_info(${table})`);
    return columns.some((item) => item.name === column);
  }

  const result = await db.queryOne<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Boolean(result);
}

async function hasTable(table: string) {
  const db = getDatabase();
  if (db.type === "sqlite") {
    const row = await db.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table],
    );
    return Boolean(row);
  }

  const result = await db.queryOne<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ?`,
    [table],
  );
  return Boolean(result);
}

async function ensureColumn(table: string, column: string, definition: string) {
  if (await hasColumn(table, column)) {
    return;
  }
  const db = getDatabase();
  const hasDynamicTimestampDefault =
    /(?:^|\s)DEFAULT\s+(\(datetime\('now'\)\)|datetime\('now'\)|NOW\(\)|CURRENT_TIMESTAMP)(?:\s|$)/i.test(definition);
  if (db.type === "sqlite" && hasDynamicTimestampDefault) {
    const baseType = (definition.match(/^[A-Z]+/i)?.[0] || "TEXT").toUpperCase();
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${baseType}`);
    await db.exec(`UPDATE ${table} SET ${column} = CURRENT_TIMESTAMP WHERE ${column} IS NULL`);
    return;
  }
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function renameColumnIfNeeded(table: string, from: string, to: string) {
  if (await hasColumn(table, to) || !(await hasColumn(table, from))) {
    return;
  }
  const db = getDatabase();
  await db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
}

async function renameTableIfNeeded(from: string, to: string) {
  if (await hasTable(to) || !(await hasTable(from))) {
    return;
  }
  const db = getDatabase();
  await db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
}

async function dropTableIfNeeded(table: string) {
  if (!(await hasTable(table))) {
    return;
  }
  const db = getDatabase();
  try {
    await db.exec(`DROP TABLE ${table}`);
  } catch {
    // Ignore on engines or environments that cannot drop the legacy table in-place.
  }
}

async function dropColumnIfNeeded(table: string, column: string) {
  if (!(await hasColumn(table, column))) {
    return;
  }
  const db = getDatabase();
  try {
    await db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch {
    // Ignore on engines that cannot drop columns in-place; the field stays inert.
  }
}

async function replaceTextInColumn(table: string, column: string, replacements: Array<[string, string]>) {
  if (!(await hasTable(table)) || !(await hasColumn(table, column)) || replacements.length === 0) {
    return;
  }
  const db = getDatabase();
  const expression = replacements.reduce(
    (current, [from, to]) => `REPLACE(${current}, '${from.replaceAll("'", "''")}', '${to.replaceAll("'", "''")}')`,
    column,
  );
  await db.exec(
    `UPDATE ${table}
     SET ${column} = ${expression}
     WHERE ${column} IS NOT NULL`,
  );
}

const LEGACY_STYLE_GENOME_ASSET_TYPE = "style_genome";
const LEGACY_STYLE_GENOMES_TABLE = "style_genomes";
const LEGACY_STYLE_GENOME_ID_COLUMN = "style_genome_id";
const LEGACY_AUTHOR_PERSONAS_TABLE = "author_personas";
const LEGACY_AUTHOR_PERSONA_SOURCES_TABLE = "author_persona_sources";
const LEGACY_AUTHOR_SERIES_TABLE = "author_series";
const LEGACY_BANNED_WORDS_TABLE = "banned_words";
const LEGACY_CUSTOM_BANNED_WORD_LIMIT_COLUMN = "custom_banned_word_limit";
const LEGACY_ARTICLE_TOKEN = `doc${"ument"}`;
const LEGACY_WORKSPACE_SCOPE_COLUMN = ["workspace", "scope"].join("_");
const LEGACY_OPPORTUNITY_STAGE_CODE = ["topic", "Radar"].join("");
const LEGACY_OPPORTUNITY_STAGE_LABEL = ["选题", "雷达"].join("");

function legacyArticleTable(suffix?: string) {
  return suffix ? `${LEGACY_ARTICLE_TOKEN}_${suffix}` : `${LEGACY_ARTICLE_TOKEN}s`;
}

function legacyArticleColumn(suffix: string) {
  return `${LEGACY_ARTICLE_TOKEN}_${suffix}`;
}
const LEGACY_ROLLOUT_STAFF_ONLY_COLUMN = "rollout_staff_only";
const LEGACY_STAFF_HIT_COUNT_COLUMN = "staff_hit_count";
const LEGACY_ASSET_FILES_LEGACY_ASSET_ID_COLUMN = "legacy_asset_id";
const LEGACY_AUDIT_LOG_ROLLOUT_STAFF_ONLY_CAMEL_KEY = "rolloutStaffOnly";
const LEGACY_AUDIT_LOG_ROLLOUT_STAFF_ONLY_KEY = "rollout_staff_only";
const LEGACY_AUDIT_LOG_STAFF_USER_COUNT_KEY = "staffUserCount";
const LEGACY_AUDIT_LOG_STAFF_HIT_COUNT_KEY = "staffHitCount";
const LEGACY_AUDIT_LOG_STAFF_SCOPE_KEY = "staff";
const CANONICAL_OBSERVE_SCOPE_KEY = "observe";

async function normalizeLayoutStrategyTerminology() {
  const db = getDatabase();
  // Legacy aliases are intentionally centralized here for one-way historical migration.
  if (await hasTable("writing_active_assets")) {
    await db.exec("UPDATE writing_active_assets SET asset_type = ? WHERE asset_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
  }
  if (await hasTable("writing_asset_rollouts")) {
    await db.exec("UPDATE writing_asset_rollouts SET asset_type = ? WHERE asset_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
  }
  if (await hasTable("writing_asset_rollout_observations")) {
    await db.exec("UPDATE writing_asset_rollout_observations SET asset_type = ? WHERE asset_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
  }
  if (await hasTable("writing_asset_rollout_daily_metrics")) {
    await db.exec("UPDATE writing_asset_rollout_daily_metrics SET asset_type = ? WHERE asset_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
  }
  if (await hasTable("writing_optimization_runs")) {
    await db.exec("UPDATE writing_optimization_runs SET base_version_type = ? WHERE base_version_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
    await db.exec("UPDATE writing_optimization_runs SET candidate_version_type = ? WHERE candidate_version_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
  }
  if (await hasTable("writing_optimization_versions")) {
    await db.exec("UPDATE writing_optimization_versions SET version_type = ? WHERE version_type = ?", ["layout_strategy", LEGACY_STYLE_GENOME_ASSET_TYPE]);
  }
  await replaceTextInColumn("audit_logs", "payload_json", [
    [LEGACY_STYLE_GENOME_ASSET_TYPE, "layout_strategy"],
    ["styleGenome", "layoutStrategy"],
    ["writingStyleAsset", "layoutStrategy"],
  ]);
  await replaceTextInColumn("article_stage_artifacts", "payload_json", [
    ["styleGenome", "layoutStrategy"],
    ["writingStyleAsset", "layoutStrategy"],
  ]);
  await replaceTextInColumn("article_outcomes", "scorecard_json", [
    [LEGACY_STYLE_GENOME_ASSET_TYPE, "layout_strategy"],
    ["styleGenomeId", "layoutStrategyId"],
    ["styleGenomeCode", "layoutStrategyCode"],
    ["styleGenomeName", "layoutStrategyName"],
    ["styleResolutionMode", "layoutStrategyResolutionMode"],
    ["styleResolutionReason", "layoutStrategyResolutionReason"],
    ["writingStyleAssetId", "layoutStrategyId"],
    ["writingStyleAssetCode", "layoutStrategyCode"],
    ["writingStyleAssetName", "layoutStrategyName"],
    ["writingStyleAssetResolutionMode", "layoutStrategyResolutionMode"],
    ["writingStyleAssetResolutionReason", "layoutStrategyResolutionReason"],
  ]);
}

async function normalizeCanonicalAdminData() {
  const db = getDatabase();
  await db.exec(
    `UPDATE users
     SET role = 'admin'
     WHERE role IS NOT NULL AND LOWER(TRIM(role)) <> 'user' AND LOWER(TRIM(role)) <> 'admin'`,
  );
  await db.exec(
    `UPDATE prompt_rollout_observations
     SET role = 'admin'
     WHERE role IS NOT NULL AND LOWER(TRIM(role)) <> 'user' AND LOWER(TRIM(role)) <> 'admin'`,
  );
  await db.exec(
    `UPDATE writing_asset_rollout_observations
     SET role = 'admin'
     WHERE role IS NOT NULL AND LOWER(TRIM(role)) <> 'user' AND LOWER(TRIM(role)) <> 'admin'`,
  );
  await db.exec(
    `UPDATE writing_eval_online_feedback
     SET source_type = 'admin_review'
     WHERE source_type IS NOT NULL
       AND LOWER(TRIM(source_type)) NOT IN ('manual', 'wechat_dashboard', 'admin_review', 'article_outcome')`,
  );
  await db.exec(
    `UPDATE prompt_rollout_observations
     SET resolution_reason = REPLACE(resolution_reason, '${LEGACY_AUDIT_LOG_STAFF_SCOPE_KEY}', '${CANONICAL_OBSERVE_SCOPE_KEY}')
     WHERE resolution_reason IS NOT NULL AND resolution_reason LIKE '${LEGACY_AUDIT_LOG_STAFF_SCOPE_KEY}%'`,
  );
  await db.exec(
    `UPDATE writing_asset_rollout_observations
     SET resolution_reason = REPLACE(resolution_reason, '${LEGACY_AUDIT_LOG_STAFF_SCOPE_KEY}', '${CANONICAL_OBSERVE_SCOPE_KEY}')
     WHERE resolution_reason IS NOT NULL AND resolution_reason LIKE '${LEGACY_AUDIT_LOG_STAFF_SCOPE_KEY}%'`,
  );
}

async function ensureTopicSourceScopedUniqueness() {
  const db = getDatabase();

  if (db.type === "sqlite") {
    const tableSql = await db.queryOne<{ sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'topic_sources'",
    );
    if (/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(tableSql?.sql || "")) {
      await db.exec("ALTER TABLE topic_sources RENAME TO topic_sources_legacy");
      await db.exec(
        `CREATE TABLE topic_sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_user_id INTEGER,
          name TEXT NOT NULL,
          homepage_url TEXT,
          source_type TEXT NOT NULL DEFAULT 'news',
          priority INTEGER NOT NULL DEFAULT 100,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_fetched_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await db.exec(
        `INSERT INTO topic_sources (id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at, created_at, updated_at)
         SELECT id, owner_user_id, name, homepage_url, 'news', 100, is_active, NULL, created_at, updated_at
         FROM topic_sources_legacy`,
      );
      await db.exec("DROP TABLE topic_sources_legacy");
    }

    await db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique ON topic_sources(name) WHERE owner_user_id IS NULL",
    );
    await db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique ON topic_sources(owner_user_id, name) WHERE owner_user_id IS NOT NULL",
    );
    return;
  }

  await db.exec("ALTER TABLE topic_sources DROP CONSTRAINT IF EXISTS topic_sources_name_key");
  await db.exec("DROP INDEX IF EXISTS topic_sources_name_key");
  await db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_system_name_unique ON topic_sources(name) WHERE owner_user_id IS NULL",
  );
  await db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_sources_owner_name_unique ON topic_sources(owner_user_id, name) WHERE owner_user_id IS NOT NULL",
  );
}

const WRITING_EVAL_SCORING_PROFILE_SEEDS = [
  {
    code: "default_balanced_v1",
    name: "默认平衡画像 v1",
    description: "兼顾写作质量与爆款潜力的默认评分画像。",
    isActive: true,
    config: {
      qualityWeights: {
        style: 1,
        language: 1,
        density: 1,
        emotion: 1,
        structure: 1,
      },
      viralWeights: {
        topicMomentum: 1,
        headline: 1,
        hook: 1,
        shareability: 1,
        readerValue: 1,
        novelty: 1,
        platformFit: 1,
      },
      totalWeights: {
        quality: 0.45,
        viral: 0.55,
      },
      penalties: {
        aiNoiseMultiplier: 0.6,
      },
    },
  },
  {
    code: "viral_aggressive_v1",
    name: "爆款进攻画像 v1",
    description: "更强调标题点击、开头留存和传播动力，适合做内容出圈实验。",
    isActive: false,
    config: {
      qualityWeights: {
        style: 0.95,
        language: 0.95,
        density: 1,
        emotion: 1,
        structure: 0.9,
      },
      viralWeights: {
        topicMomentum: 1.05,
        headline: 1.25,
        hook: 1.2,
        shareability: 1.2,
        readerValue: 1.05,
        novelty: 1.1,
        platformFit: 1,
      },
      totalWeights: {
        quality: 0.4,
        viral: 0.6,
      },
      penalties: {
        aiNoiseMultiplier: 0.65,
      },
    },
  },
  {
    code: "quality_guard_v1",
    name: "质量保守画像 v1",
    description: "更强调信息密度、结构与语言自然度，适合质量守卫实验。",
    isActive: false,
    config: {
      qualityWeights: {
        style: 1,
        language: 1.15,
        density: 1.15,
        emotion: 0.95,
        structure: 1.1,
      },
      viralWeights: {
        topicMomentum: 0.95,
        headline: 1,
        hook: 1,
        shareability: 0.9,
        readerValue: 1.05,
        novelty: 0.95,
        platformFit: 1,
      },
      totalWeights: {
        quality: 0.52,
        viral: 0.48,
      },
      penalties: {
        aiNoiseMultiplier: 0.7,
      },
    },
  },
];

const WRITING_EVAL_DATASET_SEED = {
  code: "starter_cn_autoresearch_v1",
  name: "中文写作评测 Starter Pack v1",
  description: "官方 starter pack，覆盖科技评论、商业拆解、经验复盘、系列观察四类固定样本。",
  status: "active",
};

const WRITING_EVAL_CASE_SEED_SPECS = [
  {
    taskCode: "tech_ai_agent_cost_light",
    taskType: "tech_commentary",
    topicTitle: "AI Agent 价格战真正卷的不是模型费，而是人工替代边界",
    difficultyLevel: "light",
    readerProfile: "关注 AI 产品与商业化的公众号读者",
    backgroundAwareness: "知道 Agent 很热，但不清楚成本结构",
    targetEmotion: "先被点醒，再形成可转发的判断",
    sourceFacts: ["多数团队把 Agent 成本看成模型调用费", "真实交付里还包含流程设计、人工兜底和失败重试成本", "只降模型价，不会自动带来可复制利润"],
    titleGoal: "标题要把错误认知和真正矛盾对撞出来",
    hookGoal: "前 3 句说明为什么降价新闻不等于商业模式成立",
    shareTriggerGoal: "给读者一句能复述给同事的成本判断",
    coreAngle: "讨论 Agent 商业化，必须把人工兜底和流程失败成本算进去",
    historyReferences: ["SaaS 定价为什么总被低估交付成本"],
  },
  {
    taskCode: "tech_open_model_release_light",
    taskType: "tech_commentary",
    topicTitle: "开源模型发布刷屏后，真正决定采用率的是文档和可迁移性",
    difficultyLevel: "light",
    readerProfile: "会关注模型榜单但更在意落地效率的技术读者",
    backgroundAwareness: "知道开源新模型频繁发布",
    targetEmotion: "从围观参数转向关注工程现实",
    sourceFacts: ["模型发布热度通常集中在参数、榜单和上下文窗口", "团队实际采用还要看部署成本、文档、许可和迁移工作量", "缺乏迁移路径会让高热模型迅速退烧"],
    titleGoal: "标题要把热闹与真正采用门槛形成反差",
    hookGoal: "开头先拆掉只看榜单就下结论的冲动",
    shareTriggerGoal: "让读者得到一个判断模型发布新闻的筛子",
    coreAngle: "开源模型能否真的被用，不取决于发布瞬间，而取决于迁移摩擦是否足够低",
    historyReferences: ["为什么很多技术发布会赢舆论却输采用率"],
  },
  {
    taskCode: "tech_chip_startup_medium",
    taskType: "tech_commentary",
    topicTitle: "AI 芯片创业公司最危险的不是性能打不过，而是客户不敢迁移",
    difficultyLevel: "medium",
    readerProfile: "对算力基础设施和产业链有持续兴趣的读者",
    backgroundAwareness: "知道 AI 芯片创业很多，但不了解客户切换障碍",
    targetEmotion: "感受到技术差距之外的商业卡点",
    sourceFacts: ["企业客户在推理和训练链路上已经形成稳定工具链", "切换芯片不仅是换一块卡，还涉及适配、监控、维护和团队学习成本", "性能优势不足以覆盖迁移风险时，客户会继续保守采购"],
    titleGoal: "标题要把常见理解和真实阻力拉开",
    hookGoal: "首段要先指出客户为什么即使认可性能也不下单",
    shareTriggerGoal: "输出一句适合行业转发的迁移判断",
    coreAngle: "芯片创业公司的真正护城河，是把客户迁移焦虑降到可接受，而不是单点性能夺冠",
    historyReferences: ["企业软件替换为什么总比想象中慢"],
  },
  {
    taskCode: "tech_ai_search_distribution_medium",
    taskType: "tech_commentary",
    topicTitle: "AI 搜索看起来在重写入口，但分发权仍握在平台和默认设置里",
    difficultyLevel: "medium",
    readerProfile: "关心流量入口变化和平台分发的内容从业者",
    backgroundAwareness: "知道 AI 搜索正在替代部分传统搜索动作",
    targetEmotion: "对入口迁移保持兴奋但不盲目乐观",
    sourceFacts: ["AI 搜索会改变用户第一次获取答案的方式", "默认浏览器、默认助手和系统集成仍强烈影响流量分发", "入口迁移速度往往取决于默认设置而不只是体验分"],
    titleGoal: "标题要有入口迁移与平台控制之间的冲突",
    hookGoal: "开头先讲体验升级不等于分发权转移",
    shareTriggerGoal: "给运营和产品团队一个判断入口趋势的句子",
    coreAngle: "AI 搜索会改体验，但不会自动改权力结构，默认设置仍是分发的硬杠杆",
    historyReferences: ["浏览器首页入口为什么一直是巨头战场"],
  },
  {
    taskCode: "tech_ai_regulation_hard",
    taskType: "tech_commentary",
    topicTitle: "AI 监管真正会抬高的不是模型门槛，而是组织合规成本",
    difficultyLevel: "hard",
    readerProfile: "关注政策变化与 AI 产业走向的深度读者",
    backgroundAwareness: "知道监管趋严，但容易只盯模型能力限制",
    targetEmotion: "从抽象监管讨论转到企业执行层压力",
    sourceFacts: ["监管要求常落在数据来源、审计、留痕和责任划分", "模型能力再强，也需要组织流程承接合规要求", "合规成本更容易压缩中小团队试错空间"],
    titleGoal: "标题要把监管讨论从模型拉回组织现实",
    hookGoal: "首段先指出大多数人盯错了监管成本的位置",
    shareTriggerGoal: "让读者能复述一句关于合规成本的硬判断",
    coreAngle: "AI 监管首先改变的不是模型上限，而是企业内部谁来为合规流程买单",
    historyReferences: ["数据合规为什么总是先卡住中型团队"],
  },
  {
    taskCode: "biz_supermarket_membership_light",
    taskType: "business_breakdown",
    topicTitle: "超市会员制最难的不是收会费，而是把高频复购做成习惯",
    difficultyLevel: "light",
    readerProfile: "关注零售、消费和门店经营的读者",
    backgroundAwareness: "知道会员制，但不了解续费关键",
    targetEmotion: "看到经营问题背后的复购逻辑",
    sourceFacts: ["会费本身只能带来一次性收入", "续费率取决于用户是否形成稳定到店或下单习惯", "如果核心商品和权益没有持续感知，会员体系会迅速失去吸引力"],
    titleGoal: "标题要把表面会费收入和真正续费逻辑区别开",
    hookGoal: "开头先说明为什么收了费也可能做不出长期价值",
    shareTriggerGoal: "给零售从业者一个关于复购的简洁判断",
    coreAngle: "会员制真正要卖的是复购习惯，而不是一次性的入场费",
    historyReferences: ["为什么零售优惠券经常救不了复购"],
  },
  {
    taskCode: "biz_saas_renewal_light",
    taskType: "business_breakdown",
    topicTitle: "SaaS 续费率掉头时，问题通常不在功能清单，而在组织嵌入深度",
    difficultyLevel: "light",
    readerProfile: "关注 B2B 增长与产品经营的读者",
    backgroundAwareness: "知道 SaaS 看续费，但不清楚流失根因",
    targetEmotion: "把产品讨论转成组织工作流讨论",
    sourceFacts: ["客户购买后并不会自动把工具嵌入日常流程", "如果系统只停留在少数人试用层面，续费时最先被砍", "真正稳定的续费来自跨角色、跨流程的使用黏性"],
    titleGoal: "标题要指出常被误判的续费根因",
    hookGoal: "首段先否定只靠功能堆叠救续费的想法",
    shareTriggerGoal: "让销售和产品都能转发一句续费判断",
    coreAngle: "续费率的本质不是功能多少，而是产品有没有嵌进客户的组织动作里",
    historyReferences: ["B2B 工具为什么经常赢试用输续费"],
  },
  {
    taskCode: "biz_short_video_commerce_medium",
    taskType: "business_breakdown",
    topicTitle: "短视频电商的利润不是被流量吃掉，而是被履约波动吃掉",
    difficultyLevel: "medium",
    readerProfile: "关注电商经营和平台策略的读者",
    backgroundAwareness: "知道短视频电商流量贵",
    targetEmotion: "看到利润被吞噬的隐藏环节",
    sourceFacts: ["流量成本只是短视频电商成本的一部分", "退货、售后、仓配波动和爆单失控会快速侵蚀毛利", "履约稳定性差时，流量越大反而越容易放大利润问题"],
    titleGoal: "标题要把大家盯着的流量和真正吞利润的环节对撞",
    hookGoal: "开头先指出为什么流量优化后利润仍未改善",
    shareTriggerGoal: "让商家能复述一句关于履约的判断",
    coreAngle: "短视频电商要先稳履约，再谈放大流量，否则规模只会放大亏损波动",
    historyReferences: ["爆单为什么常常不是增长，而是系统压力测试"],
  },
  {
    taskCode: "biz_battery_maker_medium",
    taskType: "business_breakdown",
    topicTitle: "电池厂价格战最伤的不是毛利表，而是客户对技术路线的预期",
    difficultyLevel: "medium",
    readerProfile: "关注制造业与新能源产业链的读者",
    backgroundAwareness: "知道价格战激烈，但忽略信号效应",
    targetEmotion: "意识到价格战也会改变客户心智",
    sourceFacts: ["持续降价会让客户推迟采购决策，等待更低报价", "客户会重新评估供应商的稳定性和技术路线可信度", "价格战越久，越容易把市场带入预期失真"],
    titleGoal: "标题要强调价格战的二阶影响",
    hookGoal: "首段先说明价格战不只影响当期利润",
    shareTriggerGoal: "提供一句关于客户预期的判断",
    coreAngle: "价格战最危险的是把客户训练成继续观望，从而削弱整个行业的稳定预期",
    historyReferences: ["制造业为什么最怕客户形成继续等价的心态"],
  },
  {
    taskCode: "biz_consumer_brand_hard",
    taskType: "business_breakdown",
    topicTitle: "消费品牌增长放缓后，真正要修的不是投放模型，而是产品记忆点",
    difficultyLevel: "hard",
    readerProfile: "关注消费品牌经营和增长模型的读者",
    backgroundAwareness: "知道增长放缓常被归因于投放失效",
    targetEmotion: "把增长焦点重新拉回产品本身",
    sourceFacts: ["投放模型可以放大已有吸引力，但不能凭空制造记忆点", "当用户记不住品牌差异时，买量效率会持续下滑", "增长问题常是产品感知问题延后体现在投放 ROI 上"],
    titleGoal: "标题要打破把问题只归给投放的惯性",
    hookGoal: "开头先指出为什么补投放救不了长期增长",
    shareTriggerGoal: "输出一句适合品牌团队转发的判断",
    coreAngle: "增长放缓后的第一修复位，往往是产品记忆点而不是广告后台参数",
    historyReferences: ["为什么品牌广告越买越贵却越难留下印象"],
  },
  {
    taskCode: "exp_weekly_review_light",
    taskType: "experience_recap",
    topicTitle: "一周复盘最有价值的不是列完成项，而是看哪些判断反复被现实打脸",
    difficultyLevel: "light",
    readerProfile: "习惯做个人复盘与知识整理的读者",
    backgroundAwareness: "知道做复盘，但常停留在任务清单层面",
    targetEmotion: "从完成感转向判断校正感",
    sourceFacts: ["多数周复盘只记录做了什么", "真正能提升下一周质量的是识别判断误差", "重复出现的偏差才是最该修正的个人模式"],
    titleGoal: "标题要把完成项和判断误差形成对比",
    hookGoal: "开头先指出为什么很多复盘写完也没进步",
    shareTriggerGoal: "给读者一句可直接拿走的复盘原则",
    coreAngle: "复盘不是留档案，而是找出哪些判断正在反复消耗你",
    historyReferences: ["任务管理为什么经常掩盖真正的判断问题"],
  },
  {
    taskCode: "exp_product_launch_light",
    taskType: "experience_recap",
    topicTitle: "产品上线复盘最容易写错的，是把结果归因成执行快慢而不是判断顺序",
    difficultyLevel: "light",
    readerProfile: "做产品、运营或项目管理的从业者",
    backgroundAwareness: "熟悉上线复盘，但容易只谈动作多寡",
    targetEmotion: "对归因顺序更敏感",
    sourceFacts: ["上线复盘常把成败归结为执行是否到位", "很多结果差异实际来自前置判断顺序", "如果先做错优先级，后续执行越快只会更快跑偏"],
    titleGoal: "标题要点出复盘常见归因错位",
    hookGoal: "开头直接举出执行快却仍跑偏的逻辑",
    shareTriggerGoal: "给项目团队一句关于判断顺序的提醒",
    coreAngle: "上线复盘真正该抓的是判断顺序，因为执行只能放大判断结果",
    historyReferences: ["为什么很多项目不是做得慢，而是先后顺序错了"],
  },
  {
    taskCode: "exp_remote_work_medium",
    taskType: "experience_recap",
    topicTitle: "远程协作效率低时，问题往往不是工具太少，而是默认同步过多",
    difficultyLevel: "medium",
    readerProfile: "远程团队管理者和知识工作者",
    backgroundAwareness: "知道远程需要协作工具",
    targetEmotion: "从加工具转向减同步",
    sourceFacts: ["远程团队常在不确定时增加会议和即时同步", "同步过多会打碎深度工作时间", "真正高效的远程协作更依赖异步决策和清晰文档"],
    titleGoal: "标题要打破缺工具导致低效的直觉",
    hookGoal: "首段先指出默认加会为什么会让效率继续下降",
    shareTriggerGoal: "给团队一句关于同步节制的判断",
    coreAngle: "远程低效经常不是因为缺工具，而是因为团队把所有不确定都推给即时同步",
    historyReferences: ["文档化为什么是远程团队的成本，不是装饰"],
  },
  {
    taskCode: "exp_hiring_mistake_medium",
    taskType: "experience_recap",
    topicTitle: "招聘失误复盘里最该承认的，不是看走眼，而是岗位定义一直在漂移",
    difficultyLevel: "medium",
    readerProfile: "负责招聘和团队搭建的管理者",
    backgroundAwareness: "知道招聘会失误，但常归因于人选判断",
    targetEmotion: "对组织定义问题更警觉",
    sourceFacts: ["岗位要求在招聘过程中不断变化会制造错配", "面试越后期越容易用临时需求覆盖原始标准", "岗位定义漂移会让所有候选人判断都失真"],
    titleGoal: "标题要把看人问题和岗位定义问题区分开",
    hookGoal: "开头先点破为什么不是单纯看错人",
    shareTriggerGoal: "让管理者能复述一句关于岗位定义的判断",
    coreAngle: "很多招聘失误不是识人失败，而是团队从一开始就没定义清楚要解决什么问题",
    historyReferences: ["组织扩张时岗位 JD 为什么最容易失真"],
  },
  {
    taskCode: "exp_reading_system_hard",
    taskType: "experience_recap",
    topicTitle: "阅读系统搭建失败的根因，通常不是输入太少，而是输出回路太弱",
    difficultyLevel: "hard",
    readerProfile: "重视知识管理与写作积累的深度用户",
    backgroundAwareness: "知道读书笔记和知识库，但容易停在收藏层",
    targetEmotion: "把焦点从搜集转向输出压强",
    sourceFacts: ["很多阅读系统把重点放在收集和标记", "如果没有固定输出场景，收藏会快速失去复用价值", "真正能留下来的知识片段通常都经历过重写和表达"],
    titleGoal: "标题要指出收藏冲动和输出回路之间的矛盾",
    hookGoal: "开头先说明为什么资料越多未必越能写",
    shareTriggerGoal: "给知识工作者一句关于输出回路的判断",
    coreAngle: "阅读系统的价值不在于你存了多少，而在于它有没有逼你反复输出",
    historyReferences: ["为什么很多知识库最后都变成资料坟场"],
  },
  {
    taskCode: "series_robotics_weekly_light",
    taskType: "series_observation",
    topicTitle: "机器人周报真正值得追的，不是单条融资，而是场景落地节奏是否变快",
    difficultyLevel: "light",
    readerProfile: "持续关注机器人与自动化进展的读者",
    backgroundAwareness: "会刷新闻，但缺少跟踪框架",
    targetEmotion: "从碎片新闻转到连续趋势观察",
    sourceFacts: ["机器人赛道新闻常被融资和演示视频占据", "连续观察更该看场景落地、部署周期和客户复购", "如果落地节奏没有变快，热度未必能转成产业进展"],
    titleGoal: "标题要把单条新闻和连续趋势对立起来",
    hookGoal: "开头先解释为什么周报不能只记融资",
    shareTriggerGoal: "给系列读者一个稳定跟踪框架",
    coreAngle: "机器人周报的价值，在于追踪落地节奏，而不是重复记录热闹新闻",
    historyReferences: ["为什么产业周报最怕写成新闻汇编"],
  },
  {
    taskCode: "series_ev_price_war_light",
    taskType: "series_observation",
    topicTitle: "电车价格战连续观察里，最关键的不是谁先降价，而是谁先扛不住渠道压力",
    difficultyLevel: "light",
    readerProfile: "长期关注汽车产业与价格战的读者",
    backgroundAwareness: "知道品牌频繁调价",
    targetEmotion: "从品牌动作看到渠道承压",
    sourceFacts: ["价格战会快速传导到经销商库存与利润", "终端渠道压力经常先于报表体现风险", "持续调价会改变用户预期和渠道稳定性"],
    titleGoal: "标题要把品牌动作和渠道压力关联起来",
    hookGoal: "开头先指出连续观察要盯哪条更早的信号",
    shareTriggerGoal: "让行业读者得到一句关于渠道的判断",
    coreAngle: "连续追价格战，最早暴露风险的往往不是品牌声明，而是渠道承压程度",
    historyReferences: ["为什么渠道库存常是行业拐点前的预警线"],
  },
  {
    taskCode: "series_ai_infra_medium",
    taskType: "series_observation",
    topicTitle: "AI 基础设施季度观察里，最该看的是调用结构变化，不只是模型榜单变化",
    difficultyLevel: "medium",
    readerProfile: "跟踪 AI infra 和开发者生态的深度用户",
    backgroundAwareness: "会看模型榜单和新品发布",
    targetEmotion: "从表层竞争转到真实调用变化",
    sourceFacts: ["模型榜单反映的是能力切片，不完全等于真实使用结构", "调用结构会暴露开发者正在为哪些场景付费", "基础设施竞争最终会落到稳定调用和迁移成本"],
    titleGoal: "标题要把榜单变化和调用结构变化对冲",
    hookGoal: "开头先告诉读者为什么季度观察不能只抄发布会",
    shareTriggerGoal: "给投资和产品读者一句长期判断",
    coreAngle: "基础设施季度观察最重要的是看调用结构，因为它比榜单更接近真实需求",
    historyReferences: ["为什么长期趋势分析不能只看发布会热度"],
  },
  {
    taskCode: "series_creator_economy_medium",
    taskType: "series_observation",
    topicTitle: "创作者经济系列里，真正变慢的不是流量，而是内容变现的确定性",
    difficultyLevel: "medium",
    readerProfile: "关注平台、创作者商业化与内容行业的人",
    backgroundAwareness: "知道流量焦虑，但不总能解释变现波动",
    targetEmotion: "对变现确定性下降更敏感",
    sourceFacts: ["流量高低并不直接决定创作者收入稳定性", "广告、带货和订阅的波动会同时影响变现确定性", "当平台规则频繁调整时，创作者的预期收入更难稳定"],
    titleGoal: "标题要把流量与变现确定性分开",
    hookGoal: "首段先指出为什么有流量不等于更好赚钱",
    shareTriggerGoal: "让创作者能转发一句关于确定性的判断",
    coreAngle: "创作者真正焦虑的不是有没有流量，而是流量是否还能稳定换成收入",
    historyReferences: ["平台规则变化为什么比流量下滑更伤创作者"],
  },
  {
    taskCode: "series_cloud_billing_hard",
    taskType: "series_observation",
    topicTitle: "云成本系列观察里，真正决定团队焦虑的不是账单绝对值，而是账单波动失控",
    difficultyLevel: "hard",
    readerProfile: "关注云资源、工程效率和财务协同的技术管理者",
    backgroundAwareness: "知道云成本高，但往往只盯总额",
    targetEmotion: "看到账单波动和组织信任之间的关系",
    sourceFacts: ["绝对成本高并不一定最危险，可预测成本更容易被管理", "账单波动会压缩预算判断和团队试错空间", "当成本无法解释时，组织会更快对项目失去耐心"],
    titleGoal: "标题要把账单高和账单失控区分开",
    hookGoal: "开头先说明为什么波动比总额更容易触发组织焦虑",
    shareTriggerGoal: "给工程负责人一句可对齐财务的判断",
    coreAngle: "云成本问题最伤的往往不是贵，而是每个月都说不清为什么更贵",
    historyReferences: ["成本可解释性为什么影响组织对项目的耐心"],
  },
].map((item) => ({
  ...item,
  languageGuidance: "短句、具体、克制、少空话、要有判断",
  referenceBadPatterns: ["空泛判断", "标题党", "只列现象不下判断", "后文掉速"],
}));

function buildWritingEvalSeedCaseInput(spec: (typeof WRITING_EVAL_CASE_SEED_SPECS)[number]) {
  const mustUseFacts = spec.sourceFacts.slice(0, 3);
  const historyReferences = spec.historyReferences.map((title, index) => ({
    title,
    relationReason: index === 0 ? "作为旧判断对照，帮助读者理解这次变化" : "作为背景参照，避免结论悬空",
    bridgeSentence: `如果把这条判断放回《${title}》里看，会更容易看见这次变化的真正位置。`,
  }));
  return {
    inputPayload: {
      readerProfile: spec.readerProfile,
      languageGuidance: spec.languageGuidance,
      backgroundAwareness: spec.backgroundAwareness,
      targetEmotion: spec.targetEmotion,
      sourceFacts: spec.sourceFacts,
      knowledgeCards: mustUseFacts.map((fact, index) => ({
        title: `${spec.topicTitle} · 事实卡 ${index + 1}`,
        summary: fact,
        keyFacts: [fact],
        status: "confirmed",
        confidenceScore: 0.8,
      })),
      historyReferences,
      personaSnapshot: {
        name: "火字研究编辑",
        summary: "擅长把复杂商业和技术问题写成短句判断。",
        identityTags: ["长期主义", "产业观察", "问题拆解"],
        writingStyleTags: ["短句", "有判断", "反机器腔"],
        domainKeywords: ["技术", "商业", "组织", "增长"],
        sourceMode: "seeded",
      },
      writingStyleTarget: {
        tone: "冷静但有锋芒",
        structure: "问题压强 -> 关键拆解 -> 结论与提醒",
        titleStyle: "判断式或反差式标题",
      },
      titleGoal: spec.titleGoal,
      hookGoal: spec.hookGoal,
      shareTriggerGoal: spec.shareTriggerGoal,
    },
    expectedConstraints: {
      mustUseFacts,
      bannedPatterns: ["捏造数字", "杜撰案例", "只有情绪没有判断", "把风险写成口号"],
      expectedRisks: ["标题过火", "论证掉速", "为了传播牺牲事实边界"],
      factBoundary: "只能使用输入里给出的事实和可直接推导的信息",
    },
    viralTargets: {
      titleGoal: spec.titleGoal,
      hookGoal: spec.hookGoal,
      shareTriggerGoal: spec.shareTriggerGoal,
      readerValueGoal: "让读者获得一个可复述、可转发、可用于工作判断的结论",
    },
    stageArtifactPayloads: {
      deepWriting: {
        selectedTitle: spec.topicTitle,
        centralThesis: spec.coreAngle,
        writingAngle: spec.coreAngle,
        openingStrategy: spec.hookGoal,
        targetEmotion: spec.targetEmotion,
        endingStrategy: "结尾给出一句更稳的判断和一条行动提醒",
        voiceChecklist: ["短句优先", "先说矛盾再说结论", "别写公关腔", "每段只推进一个核心意思"],
        mustUseFacts: mustUseFacts,
        bannedWordWatchlist: ["赋能", "底层逻辑", "高质量发展", "价值闭环"],
        sectionBlueprint: [
          {
            heading: "先把大多数人看错的地方指出来",
            goal: "建立反差和阅读压强",
            paragraphMission: "先否定常见理解，再抛出真正矛盾",
            evidenceHints: [mustUseFacts[0]],
            transition: "说明为什么这个误判会带来更大的判断偏差",
          },
          {
            heading: "把真正的成本、风险或变量拆开",
            goal: "把核心矛盾讲透",
            paragraphMission: "用 2-3 个事实解释为什么现实比表面复杂",
            evidenceHints: mustUseFacts.slice(1),
            transition: "收束到一个更适合转发的结论句",
          },
          {
            heading: "给出读者能带走的判断",
            goal: "提高读者收益感和分享意愿",
            paragraphMission: "把前文拆解压缩成一句判断和一个提醒",
            evidenceHints: [spec.coreAngle],
            transition: "结尾收紧，不拖长",
          },
        ],
        historyReferencePlan: historyReferences.map((item) => ({
          title: item.title,
          useWhen: "需要把本次判断放进长期趋势里时引用",
          bridgeSentence: item.bridgeSentence,
        })),
        finalChecklist: ["标题与正文必须能兑现", "至少留下一个可转发判断", "不能突破事实边界"],
      },
    },
    referenceGoodOutput: `# ${spec.topicTitle}\n\n别急着被热闹带跑。真正值得写的，不是表面动作，而是动作背后哪条成本、节奏或权力关系正在变化。\n\n如果只盯表层信号，你会得到一篇看起来很懂、其实无法指导判断的文章。更好的写法，是先指出大多数人看错的位置，再把真正决定结果的变量拆开。\n\n最后要收束到一句能复述的判断：${spec.coreAngle}。`,
  };
}

async function ensureWritingEvalSeeds() {
  const db = getDatabase();
  const now = new Date().toISOString();

  for (const profile of WRITING_EVAL_SCORING_PROFILE_SEEDS) {
    const exists = await db.queryOne<{ id: number }>("SELECT id FROM writing_eval_scoring_profiles WHERE code = ?", [profile.code]);
    if (!exists) {
      await db.exec(
        `INSERT INTO writing_eval_scoring_profiles (code, name, description, config_json, is_active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [profile.code, profile.name, profile.description, profile.config, profile.isActive, null, now, now],
      );
    }
  }

  const activeProfile = await db.queryOne<{ id: number }>("SELECT id FROM writing_eval_scoring_profiles WHERE is_active = ?", [true]);
  if (!activeProfile) {
    await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ?", [false, now]);
    await db.exec("UPDATE writing_eval_scoring_profiles SET is_active = ?, updated_at = ? WHERE code = ?", [true, now, "default_balanced_v1"]);
  }

  let dataset = await db.queryOne<{ id: number }>("SELECT id FROM writing_eval_datasets WHERE code = ?", [WRITING_EVAL_DATASET_SEED.code]);
  if (!dataset) {
    await db.exec(
      `INSERT INTO writing_eval_datasets (code, name, description, status, sample_count, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [WRITING_EVAL_DATASET_SEED.code, WRITING_EVAL_DATASET_SEED.name, WRITING_EVAL_DATASET_SEED.description, WRITING_EVAL_DATASET_SEED.status, 0, null, now, now],
    );
    dataset = await db.queryOne<{ id: number }>("SELECT id FROM writing_eval_datasets WHERE code = ?", [WRITING_EVAL_DATASET_SEED.code]);
  }
  if (!dataset) return;

  for (const spec of WRITING_EVAL_CASE_SEED_SPECS) {
    const exists = await db.queryOne<{ id: number }>(
      "SELECT id FROM writing_eval_cases WHERE dataset_id = ? AND task_code = ?",
      [dataset.id, spec.taskCode],
    );
    if (exists) continue;
    const built = buildWritingEvalSeedCaseInput(spec);
    await db.exec(
      `INSERT INTO writing_eval_cases (
        dataset_id, task_code, task_type, topic_title, input_payload_json, expected_constraints_json,
        viral_targets_json, stage_artifact_payloads_json, reference_good_output, reference_bad_patterns_json,
        difficulty_level, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dataset.id,
        spec.taskCode,
        spec.taskType,
        spec.topicTitle,
        built.inputPayload,
        built.expectedConstraints,
        built.viralTargets,
        built.stageArtifactPayloads,
        built.referenceGoodOutput,
        spec.referenceBadPatterns,
        spec.difficultyLevel,
        true,
        now,
        now,
      ],
    );
  }

  const sampleCount = await db.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM writing_eval_cases WHERE dataset_id = ?", [dataset.id]);
  await db.exec("UPDATE writing_eval_datasets SET sample_count = ?, updated_at = ?, status = ? WHERE id = ?", [sampleCount?.count ?? 0, now, "active", dataset.id]);
}

async function ensureWritingActiveAssetSeeds() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const defaultApplyTemplate = await db.queryOne<{ id: number }>(
    "SELECT id FROM writing_active_assets WHERE asset_type = ?",
    ["apply_command_template"],
  );
  if (!defaultApplyTemplate) {
    await db.exec(
      `INSERT INTO writing_active_assets (asset_type, asset_ref, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ["apply_command_template", "deep_default_v1", null, now, now],
    );
  }
}

export async function ensureExtendedProductSchema() {
  await renameTableIfNeeded(LEGACY_AUTHOR_PERSONAS_TABLE, "personas");
  await renameTableIfNeeded(LEGACY_AUTHOR_PERSONA_SOURCES_TABLE, "persona_sources");
  await renameTableIfNeeded(LEGACY_AUTHOR_SERIES_TABLE, "series");
  await renameTableIfNeeded(LEGACY_BANNED_WORDS_TABLE, "language_guard_tokens");
  await renameTableIfNeeded(LEGACY_STYLE_GENOMES_TABLE, "layout_strategies");
  await renameTableIfNeeded(legacyArticleTable(), "articles");
  await renameTableIfNeeded(legacyArticleTable("snapshots"), "article_snapshots");
  await renameTableIfNeeded(legacyArticleTable("nodes"), "article_nodes");
  await renameTableIfNeeded(legacyArticleTable("fragment_refs"), "article_fragment_refs");
  await renameTableIfNeeded(legacyArticleTable("workflows"), "article_workflows");
  await renameTableIfNeeded(legacyArticleTable("stage_artifacts"), "article_stage_artifacts");
  await renameTableIfNeeded(legacyArticleTable("reference_articles"), "article_reference_articles");
  await renameTableIfNeeded(legacyArticleTable("image_prompts"), "article_image_prompts");
  if (await hasTable("plans")) {
    await renameColumnIfNeeded("plans", LEGACY_CUSTOM_BANNED_WORD_LIMIT_COLUMN, "language_guard_rule_limit");
  }
  if (await hasTable("articles")) {
    await renameColumnIfNeeded("articles", LEGACY_STYLE_GENOME_ID_COLUMN, "layout_strategy_id");
  }
  await renameColumnIfNeeded("article_nodes", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_fragment_refs", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_fragment_refs", legacyArticleColumn("node_id"), "article_node_id");
  await renameColumnIfNeeded("article_workflows", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_stage_artifacts", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_outcomes", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_strategy_cards", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_evidence_items", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_research_cards", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_outcome_snapshots", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_reference_articles", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_reference_articles", `referenced_${legacyArticleColumn("id")}`, "referenced_article_id");
  await renameColumnIfNeeded("article_image_prompts", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("article_image_prompts", legacyArticleColumn("node_id"), "article_node_id");
  await renameColumnIfNeeded("wechat_sync_logs", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("wechat_sync_logs", legacyArticleColumn("version_hash"), "article_version_hash");
  await renameColumnIfNeeded("writing_eval_online_feedback", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("cover_images", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("asset_files", legacyArticleColumn("id"), "article_id");
  await renameColumnIfNeeded("cover_image_candidates", legacyArticleColumn("id"), "article_id");
  await execAll([
    `CREATE TABLE IF NOT EXISTS article_nodes (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      parent_node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_fragment_refs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      usage_mode TEXT NOT NULL DEFAULT 'rewrite',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(article_node_id, fragment_id)
    )`,
    `CREATE TABLE IF NOT EXISTS article_workflows (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      current_stage_code TEXT NOT NULL DEFAULT 'opportunity',
      stages_json TEXT NOT NULL,
      pending_publish_intent_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_stage_artifacts (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      stage_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      summary TEXT,
      payload_json TEXT,
      model TEXT,
      provider TEXT,
      error_message TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(article_id, stage_code)
    )`,
    `CREATE TABLE IF NOT EXISTS article_outcomes (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      target_package TEXT,
      scorecard_json TEXT NOT NULL DEFAULT '{}',
      hit_status TEXT NOT NULL DEFAULT 'pending',
      review_summary TEXT,
      next_action TEXT,
      playbook_tags_json TEXT NOT NULL DEFAULT '[]',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_strategy_cards (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      target_reader TEXT,
      core_assertion TEXT,
      why_now TEXT,
      research_hypothesis TEXT,
      market_position_insight TEXT,
      historical_turning_point TEXT,
      target_package TEXT,
      publish_window TEXT,
      ending_action TEXT,
      first_hand_observation TEXT,
      felt_moment TEXT,
      why_this_hit_me TEXT,
      real_scene_or_dialogue TEXT,
      want_to_complain TEXT,
      non_delegable_truth TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_evidence_items (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      claim TEXT,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      screenshot_path TEXT,
      usage_mode TEXT,
      rationale TEXT,
      research_tag TEXT,
      evidence_role TEXT NOT NULL DEFAULT 'supportingEvidence',
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_research_cards (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      card_kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      payload_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "'{}'::jsonb" : "'{}'"},
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(article_id, card_kind, sort_order)
    )`,
    `CREATE TABLE IF NOT EXISTS article_research_card_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      research_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      label TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'manual',
      detail TEXT,
      source_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(research_card_id, sort_order)
    )`,
    `CREATE TABLE IF NOT EXISTS article_outcome_snapshots (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      outcome_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      window_code TEXT NOT NULL,
      read_count INTEGER NOT NULL DEFAULT 0,
      share_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(article_id, window_code)
    )`,
    `CREATE TABLE IF NOT EXISTS fragment_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      screenshot_path TEXT,
      raw_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS fragment_embeddings (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      embedding_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS layout_strategies (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      meta TEXT,
      config_json TEXT NOT NULL,
      is_official ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS personas (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      name TEXT NOT NULL,
      identity_tags_json TEXT NOT NULL,
      writing_style_tags_json TEXT NOT NULL,
      bound_writing_style_profile_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      summary TEXT,
      domain_keywords_json TEXT,
      argument_preferences_json TEXT,
      tone_constraints_json TEXT,
      audience_hints_json TEXT,
      source_mode TEXT NOT NULL DEFAULT 'manual',
      is_default ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS persona_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      persona_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      source_type TEXT NOT NULL,
      title TEXT,
      source_url TEXT,
      file_path TEXT,
      extracted_text TEXT,
      analysis_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS series (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      name TEXT NOT NULL,
      persona_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      thesis TEXT,
      target_audience TEXT,
      active_status TEXT NOT NULL DEFAULT 'active',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS persona_tags (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      tag_key TEXT NOT NULL UNIQUE,
      tag_name TEXT NOT NULL,
      tag_type TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      is_system ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS language_guard_rules (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      rule_kind TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'contains',
      pattern_text TEXT NOT NULL,
      rewrite_hint TEXT,
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_reference_articles (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      referenced_article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      relation_reason TEXT,
      bridge_sentence TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(article_id, referenced_article_id)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_style_profiles (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      name TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      summary TEXT NOT NULL,
      tone_keywords_json TEXT NOT NULL,
      structure_patterns_json TEXT NOT NULL,
      language_habits_json TEXT NOT NULL,
      opening_patterns_json TEXT NOT NULL,
      ending_patterns_json TEXT NOT NULL,
      do_not_write_json TEXT NOT NULL,
      imitation_prompt TEXT NOT NULL,
      source_excerpt TEXT,
      analysis_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS prompt_versions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      prompt_id TEXT NOT NULL,
      version TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      file_path TEXT NOT NULL,
      function_name TEXT NOT NULL,
      prompt_content TEXT NOT NULL,
      language TEXT DEFAULT 'zh-CN',
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      auto_mode TEXT NOT NULL DEFAULT 'manual',
      change_notes TEXT,
      UNIQUE(prompt_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS prompt_rollout_observations (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      prompt_id TEXT NOT NULL,
      version TEXT NOT NULL,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      role TEXT,
      plan_code TEXT,
      resolution_mode TEXT NOT NULL DEFAULT 'active',
      resolution_reason TEXT NOT NULL DEFAULT 'stable',
      user_bucket INTEGER,
      hit_count INTEGER NOT NULL DEFAULT 1,
      first_hit_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      last_hit_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(prompt_id, version, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS prompt_rollout_daily_metrics (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      prompt_id TEXT NOT NULL,
      version TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      total_hit_count INTEGER NOT NULL DEFAULT 0,
      observe_hit_count INTEGER NOT NULL DEFAULT 0,
      plan_hit_count INTEGER NOT NULL DEFAULT 0,
      percentage_hit_count INTEGER NOT NULL DEFAULT 0,
      stable_hit_count INTEGER NOT NULL DEFAULT 0,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(prompt_id, version, metric_date)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_asset_rollouts (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      asset_type TEXT NOT NULL,
      asset_ref TEXT NOT NULL,
      auto_mode TEXT NOT NULL DEFAULT 'manual',
      rollout_observe_only ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      rollout_percentage INTEGER NOT NULL DEFAULT 0,
      rollout_plan_codes_json TEXT NOT NULL DEFAULT '[]',
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      notes TEXT,
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(asset_type, asset_ref)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_active_assets (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      asset_type TEXT NOT NULL UNIQUE,
      asset_ref TEXT NOT NULL,
      updated_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS writing_asset_rollout_observations (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      asset_type TEXT NOT NULL,
      asset_ref TEXT NOT NULL,
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      role TEXT,
      plan_code TEXT,
      resolution_mode TEXT NOT NULL DEFAULT 'rollout',
      resolution_reason TEXT NOT NULL DEFAULT 'stable',
      user_bucket INTEGER,
      hit_count INTEGER NOT NULL DEFAULT 1,
      first_hit_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      last_hit_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(asset_type, asset_ref, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_asset_rollout_daily_metrics (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      asset_type TEXT NOT NULL,
      asset_ref TEXT NOT NULL,
      metric_date TEXT NOT NULL,
      total_hit_count INTEGER NOT NULL DEFAULT 0,
      observe_hit_count INTEGER NOT NULL DEFAULT 0,
      plan_hit_count INTEGER NOT NULL DEFAULT 0,
      percentage_hit_count INTEGER NOT NULL DEFAULT 0,
      stable_hit_count INTEGER NOT NULL DEFAULT 0,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(asset_type, asset_ref, metric_date)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_eval_datasets (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sample_count INTEGER NOT NULL DEFAULT 0,
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS writing_eval_cases (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      dataset_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      task_code TEXT NOT NULL,
      task_type TEXT NOT NULL,
      topic_title TEXT NOT NULL,
      input_payload_json TEXT NOT NULL,
      expected_constraints_json TEXT NOT NULL DEFAULT '{}',
      viral_targets_json TEXT NOT NULL DEFAULT '{}',
      stage_artifact_payloads_json TEXT NOT NULL DEFAULT '{}',
      reference_good_output TEXT,
      reference_bad_patterns_json TEXT NOT NULL DEFAULT '[]',
      difficulty_level TEXT NOT NULL DEFAULT 'medium',
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(dataset_id, task_code)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_optimization_runs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      run_code TEXT NOT NULL UNIQUE,
      dataset_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      base_version_type TEXT NOT NULL,
      base_version_ref TEXT NOT NULL,
      candidate_version_type TEXT NOT NULL,
      candidate_version_ref TEXT NOT NULL,
      experiment_mode TEXT NOT NULL DEFAULT 'full_article',
      trigger_mode TEXT NOT NULL DEFAULT 'manual',
      decision_mode TEXT NOT NULL DEFAULT 'manual_review',
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'queued',
      summary TEXT,
      score_summary_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      started_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      finished_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      resolved_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS writing_eval_run_schedules (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      name TEXT NOT NULL,
      dataset_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      base_version_type TEXT NOT NULL,
      base_version_ref TEXT NOT NULL,
      candidate_version_type TEXT NOT NULL,
      candidate_version_ref TEXT NOT NULL,
      experiment_mode TEXT NOT NULL DEFAULT 'full_article',
      trigger_mode TEXT NOT NULL DEFAULT 'scheduled',
      agent_strategy TEXT NOT NULL DEFAULT 'default',
      decision_mode TEXT NOT NULL DEFAULT 'manual_review',
      priority INTEGER NOT NULL DEFAULT 100,
      cadence_hours INTEGER NOT NULL DEFAULT 24,
      next_run_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_dispatched_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_run_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      last_error TEXT,
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      summary TEXT,
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS writing_optimization_results (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      run_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      case_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      generated_title TEXT,
      generated_lead TEXT,
      generated_markdown TEXT NOT NULL,
      style_score REAL NOT NULL DEFAULT 0,
      language_score REAL NOT NULL DEFAULT 0,
      density_score REAL NOT NULL DEFAULT 0,
      emotion_score REAL NOT NULL DEFAULT 0,
      structure_score REAL NOT NULL DEFAULT 0,
      topic_momentum_score REAL NOT NULL DEFAULT 0,
      headline_score REAL NOT NULL DEFAULT 0,
      hook_score REAL NOT NULL DEFAULT 0,
      shareability_score REAL NOT NULL DEFAULT 0,
      reader_value_score REAL NOT NULL DEFAULT 0,
      novelty_score REAL NOT NULL DEFAULT 0,
      platform_fit_score REAL NOT NULL DEFAULT 0,
      quality_score REAL NOT NULL DEFAULT 0,
      viral_score REAL NOT NULL DEFAULT 0,
      factual_risk_penalty REAL NOT NULL DEFAULT 0,
      ai_noise_penalty REAL NOT NULL DEFAULT 0,
      total_score REAL NOT NULL DEFAULT 0,
      judge_payload_json TEXT NOT NULL DEFAULT '{}',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(run_id, case_id)
    )`,
    `CREATE TABLE IF NOT EXISTS writing_optimization_versions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      version_type TEXT NOT NULL,
      target_key TEXT NOT NULL,
      source_version TEXT NOT NULL,
      candidate_content TEXT NOT NULL,
      score_summary_json TEXT NOT NULL DEFAULT '{}',
      decision TEXT NOT NULL,
      decision_reason TEXT,
      approved_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS writing_eval_scoring_profiles (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS writing_eval_online_feedback (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      run_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      result_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      case_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      wechat_sync_log_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_label TEXT,
      open_rate REAL,
      read_completion_rate REAL,
      share_rate REAL,
      favorite_rate REAL,
      read_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      notes TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      captured_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_cards (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      card_type TEXT NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT,
      key_facts_json TEXT,
      open_questions_json TEXT,
      conflict_flags_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      latest_change_summary TEXT,
      overturned_judgements_json TEXT,
      confidence_score REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'draft',
      last_compiled_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_verified_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, slug)
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_card_fragments (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      knowledge_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      fragment_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'evidence',
      evidence_weight REAL NOT NULL DEFAULT 1,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_card_links (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      source_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      target_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'mentions',
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_card_revisions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      knowledge_card_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      revision_no INTEGER NOT NULL,
      compiled_payload_json TEXT NOT NULL,
      change_summary TEXT,
      compiled_by_job_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS template_versions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      template_id TEXT NOT NULL,
      version TEXT NOT NULL,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      name TEXT NOT NULL,
      description TEXT,
      source_url TEXT,
      config_json TEXT NOT NULL,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(template_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS layout_templates (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      template_id TEXT NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      name TEXT NOT NULL,
      description TEXT,
      source_url TEXT,
      meta TEXT,
      visibility_scope TEXT NOT NULL DEFAULT 'official',
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS layout_template_versions (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      template_id TEXT NOT NULL,
      version TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT 'v2',
      config_json TEXT NOT NULL,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(template_id, version)
    )`,
    `CREATE TABLE IF NOT EXISTS cover_images (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      prompt TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS asset_files (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      asset_scope TEXT NOT NULL,
      asset_type TEXT NOT NULL DEFAULT 'cover_image',
      source_record_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      batch_token TEXT,
      variant_label TEXT,
      storage_provider TEXT,
      public_url TEXT,
      original_object_key TEXT,
      compressed_object_key TEXT,
      thumbnail_object_key TEXT,
      mime_type TEXT,
      byte_length INTEGER,
      status TEXT NOT NULL DEFAULT 'ready',
      manifest_json ${getDatabase().type === "postgres" ? "JSONB" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(asset_scope, source_record_id)
    )`,
    `CREATE TABLE IF NOT EXISTS cover_image_candidates (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      batch_token TEXT NOT NULL,
      variant_label TEXT NOT NULL,
      prompt TEXT NOT NULL,
      image_url TEXT NOT NULL,
      is_selected ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      selected_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"}
    )`,
    `CREATE TABLE IF NOT EXISTS article_image_prompts (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      article_node_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      asset_type TEXT NOT NULL DEFAULT 'inline',
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(article_id, article_node_id, asset_type)
    )`,
    `CREATE TABLE IF NOT EXISTS global_ai_engines (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      engine_code TEXT NOT NULL UNIQUE,
      provider_name TEXT NOT NULL DEFAULT 'custom',
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'Gemini 3.1 Pro',
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      last_checked_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_error TEXT,
      updated_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS global_object_storage_configs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      storage_code TEXT NOT NULL UNIQUE,
      provider_name TEXT NOT NULL DEFAULT 'local',
      provider_preset TEXT NOT NULL DEFAULT 'local',
      endpoint TEXT,
      bucket_name TEXT,
      region TEXT NOT NULL DEFAULT 'auto',
      access_key_id TEXT,
      secret_access_key_encrypted TEXT,
      public_base_url TEXT,
      path_prefix TEXT,
      is_enabled ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      last_checked_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_error TEXT,
      updated_by ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS topic_sources (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      name TEXT NOT NULL,
      homepage_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'news',
      priority ${getDatabase().type === "postgres" ? "INTEGER" : "INTEGER"} NOT NULL DEFAULT 100,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS source_connectors (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      topic_source_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      connector_scope TEXT NOT NULL DEFAULT 'system',
      name TEXT NOT NULL,
      homepage_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'news',
      priority INTEGER NOT NULL DEFAULT 100,
      is_active ${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"},
      status TEXT NOT NULL DEFAULT 'healthy',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_http_status INTEGER,
      next_retry_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      health_score REAL NOT NULL DEFAULT 100,
      degraded_reason TEXT,
      last_fetched_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS topic_events (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      event_key TEXT NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      canonical_title TEXT NOT NULL,
      summary TEXT,
      emotion_labels_json TEXT NOT NULL,
      angle_options_json TEXT NOT NULL,
      primary_source_name TEXT,
      primary_source_type TEXT NOT NULL DEFAULT 'news',
      primary_source_priority INTEGER NOT NULL DEFAULT 100,
      primary_source_url TEXT,
      source_names_json TEXT NOT NULL,
      source_urls_json TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      latest_published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS hot_event_clusters (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      cluster_key TEXT NOT NULL UNIQUE,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      canonical_title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      summary TEXT,
      emotion_labels_json TEXT NOT NULL,
      angle_options_json TEXT NOT NULL,
      primary_source_name TEXT,
      primary_source_type TEXT NOT NULL DEFAULT 'news',
      primary_source_priority INTEGER NOT NULL DEFAULT 100,
      primary_source_url TEXT,
      source_names_json TEXT NOT NULL,
      source_urls_json TEXT NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 1,
      freshness_score REAL NOT NULL DEFAULT 0,
      authority_score REAL NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      first_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      last_seen_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      latest_published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS hot_event_evidence_items (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      cluster_key TEXT NOT NULL,
      owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      topic_item_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'news',
      source_priority INTEGER NOT NULL DEFAULT 100,
      title TEXT NOT NULL,
      summary TEXT,
      source_url TEXT,
      published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      captured_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      evidence_payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(cluster_key, topic_item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS topic_sync_runs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      sync_window_start ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL UNIQUE,
      sync_window_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      scheduled_source_count INTEGER NOT NULL DEFAULT 0,
      enqueued_job_count INTEGER NOT NULL DEFAULT 0,
      completed_source_count INTEGER NOT NULL DEFAULT 0,
      failed_source_count INTEGER NOT NULL DEFAULT 0,
      inserted_item_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      triggered_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL,
      finished_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS topic_recommendations (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"} NOT NULL,
      recommendation_date TEXT NOT NULL,
      rank_index INTEGER NOT NULL,
      topic_dedup_key TEXT NOT NULL,
      source_topic_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_owner_user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'news',
      source_priority INTEGER NOT NULL DEFAULT 100,
      title TEXT NOT NULL,
      summary TEXT,
      emotion_labels_json TEXT NOT NULL,
      angle_options_json TEXT NOT NULL,
      source_url TEXT,
      related_source_names_json TEXT NOT NULL,
      related_source_urls_json TEXT NOT NULL,
      published_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"},
      recommendation_type TEXT NOT NULL,
      recommendation_reason TEXT NOT NULL,
      matched_persona_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      matched_persona_name TEXT,
      freshness_score REAL NOT NULL DEFAULT 0,
      relevance_score REAL NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      UNIQUE(user_id, recommendation_date, rank_index),
      UNIQUE(user_id, recommendation_date, topic_dedup_key)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      user_id ${getDatabase().type === "postgres" ? "BIGINT" : "INTEGER"},
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      payload_json TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
    `CREATE TABLE IF NOT EXISTS support_messages (
      id ${getDatabase().type === "postgres" ? "BIGSERIAL" : "INTEGER"} PRIMARY KEY ${getDatabase().type === "postgres" ? "" : "AUTOINCREMENT"},
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      source_page TEXT,
      created_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"},
      updated_at ${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}
    )`,
  ]);

  await ensureColumn("articles", "layout_strategy_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("articles", "wechat_template_id", "TEXT");
  await ensureColumn("articles", "series_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("personas", "bound_writing_style_profile_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("personas", "summary", "TEXT");
  await ensureColumn("personas", "domain_keywords_json", "TEXT");
  await ensureColumn("personas", "argument_preferences_json", "TEXT");
  await ensureColumn("personas", "tone_constraints_json", "TEXT");
  await ensureColumn("personas", "audience_hints_json", "TEXT");
  await ensureColumn("personas", "source_mode", "TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("series", "thesis", "TEXT");
  await ensureColumn("series", "target_audience", "TEXT");
  await ensureColumn("series", "active_status", "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn("article_strategy_cards", "first_hand_observation", "TEXT");
  await ensureColumn("article_strategy_cards", "felt_moment", "TEXT");
  await ensureColumn("article_strategy_cards", "why_this_hit_me", "TEXT");
  await ensureColumn("article_strategy_cards", "real_scene_or_dialogue", "TEXT");
  await ensureColumn("article_strategy_cards", "want_to_complain", "TEXT");
  await ensureColumn("article_strategy_cards", "non_delegable_truth", "TEXT");
  await ensureColumn("article_strategy_cards", "research_hypothesis", "TEXT");
  await ensureColumn("article_strategy_cards", "market_position_insight", "TEXT");
  await ensureColumn("article_strategy_cards", "historical_turning_point", "TEXT");
  await ensureColumn("article_evidence_items", "research_tag", "TEXT");
  await ensureColumn("article_evidence_items", "evidence_role", "TEXT NOT NULL DEFAULT 'supportingEvidence'");
  await ensureColumn("article_outcome_snapshots", "writing_state_feedback_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("persona_tags", "description", "TEXT");
  await ensureColumn("persona_tags", "sort_order", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("persona_tags", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("persona_tags", "is_system", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await renameColumnIfNeeded("prompt_versions", LEGACY_ROLLOUT_STAFF_ONLY_COLUMN, "rollout_observe_only");
  await renameColumnIfNeeded("writing_asset_rollouts", LEGACY_ROLLOUT_STAFF_ONLY_COLUMN, "rollout_observe_only");
  await renameColumnIfNeeded("prompt_rollout_daily_metrics", LEGACY_STAFF_HIT_COUNT_COLUMN, "observe_hit_count");
  await renameColumnIfNeeded("writing_asset_rollout_daily_metrics", LEGACY_STAFF_HIT_COUNT_COLUMN, "observe_hit_count");
  await ensureColumn("prompt_versions", "rollout_observe_only", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"}`);
  await ensureColumn("prompt_versions", "rollout_percentage", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("prompt_versions", "rollout_plan_codes_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("prompt_versions", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("prompt_versions", "auto_mode", "TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("knowledge_cards", "conflict_flags_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("knowledge_cards", "latest_change_summary", "TEXT");
  await ensureColumn("knowledge_cards", "overturned_judgements_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("article_fragment_refs", "usage_mode", "TEXT NOT NULL DEFAULT 'rewrite'");
  await ensureColumn("article_workflows", "pending_publish_intent_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("wechat_sync_logs", "article_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await execAll([
    `UPDATE article_workflows
     SET current_stage_code = 'opportunity'
     WHERE current_stage_code = '${LEGACY_OPPORTUNITY_STAGE_CODE}'`,
    `UPDATE article_workflows
     SET stages_json = REPLACE(stages_json, '"${LEGACY_OPPORTUNITY_STAGE_CODE}"', '"opportunity"')
     WHERE stages_json LIKE '%"${LEGACY_OPPORTUNITY_STAGE_CODE}"%'`,
    `UPDATE article_workflows
     SET stages_json = REPLACE(stages_json, '${LEGACY_OPPORTUNITY_STAGE_LABEL}', '机会')
     WHERE stages_json LIKE '%${LEGACY_OPPORTUNITY_STAGE_LABEL}%'`,
  ]);
  await ensureColumn("wechat_sync_logs", "failure_code", "TEXT");
  await ensureColumn("wechat_sync_logs", "article_version_hash", "TEXT");
  await ensureColumn("wechat_sync_logs", "template_id", "TEXT");
  await ensureColumn("wechat_sync_logs", "idempotency_key", "TEXT");
  await ensureColumn("writing_eval_online_feedback", "article_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("global_object_storage_configs", "provider_preset", "TEXT NOT NULL DEFAULT 'local'");
  await ensureColumn("topic_sources", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_sources", "last_fetched_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("topic_sources", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("topic_sources", "priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("source_connectors", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("source_connectors", "connector_scope", "TEXT NOT NULL DEFAULT 'system'");
  await ensureColumn("source_connectors", "homepage_url", "TEXT");
  await ensureColumn("source_connectors", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("source_connectors", "priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("source_connectors", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("source_connectors", "status", "TEXT NOT NULL DEFAULT 'healthy'");
  await ensureColumn("source_connectors", "attempt_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("source_connectors", "consecutive_failures", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("source_connectors", "last_error", "TEXT");
  await ensureColumn("source_connectors", "last_http_status", "INTEGER");
  await ensureColumn("source_connectors", "next_retry_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("source_connectors", "health_score", "REAL NOT NULL DEFAULT 100");
  await ensureColumn("source_connectors", "degraded_reason", "TEXT");
  await ensureColumn("source_connectors", "last_fetched_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("topic_items", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_recommendations", "source_owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("topic_recommendations", "emotion_labels_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "angle_options_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "related_source_names_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "related_source_urls_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("topic_recommendations", "freshness_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("topic_recommendations", "relevance_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("topic_recommendations", "priority_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_clusters", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("hot_event_clusters", "normalized_title", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn("hot_event_clusters", "emotion_labels_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "angle_options_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "source_names_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "source_urls_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn("hot_event_clusters", "freshness_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_clusters", "authority_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_clusters", "priority_score", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("hot_event_evidence_items", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("hot_event_evidence_items", "topic_item_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("hot_event_evidence_items", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("hot_event_evidence_items", "source_priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("hot_event_evidence_items", "published_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("hot_event_evidence_items", "captured_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await ensureColumn("hot_event_evidence_items", "evidence_payload_json", "TEXT");
  await ensureColumn("hot_event_evidence_items", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("template_versions", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("template_versions", "source_url", "TEXT");
  await ensureColumn("layout_templates", "owner_user_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("layout_templates", "description", "TEXT");
  await ensureColumn("layout_templates", "source_url", "TEXT");
  await ensureColumn("layout_templates", "meta", "TEXT");
  await ensureColumn("layout_templates", "visibility_scope", "TEXT NOT NULL DEFAULT 'official'");
  await ensureColumn("layout_templates", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("layout_templates", "created_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("layout_templates", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("layout_template_versions", "schema_version", "TEXT NOT NULL DEFAULT 'v2'");
  await ensureColumn("layout_template_versions", "config_json", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn("layout_template_versions", "is_active", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "TRUE" : "1"}`);
  await ensureColumn("layout_template_versions", "created_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("layout_template_versions", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("writing_eval_cases", "stage_artifact_payloads_json", "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn("cover_images", "storage_provider", "TEXT");
  await ensureColumn("cover_images", "article_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("cover_images", "original_object_key", "TEXT");
  await ensureColumn("cover_images", "compressed_object_key", "TEXT");
  await ensureColumn("cover_images", "thumbnail_object_key", "TEXT");
  await ensureColumn("cover_images", "asset_manifest_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("cover_image_candidates", "storage_provider", "TEXT");
  await ensureColumn("cover_image_candidates", "article_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("cover_image_candidates", "original_object_key", "TEXT");
  await ensureColumn("cover_image_candidates", "compressed_object_key", "TEXT");
  await ensureColumn("cover_image_candidates", "thumbnail_object_key", "TEXT");
  await ensureColumn("cover_image_candidates", "asset_manifest_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await dropColumnIfNeeded("plans", "can_fork_genomes");
  await dropColumnIfNeeded("plans", "can_publish_genomes");
  await dropColumnIfNeeded("plans", "is_public");
  await dropColumnIfNeeded("layout_strategies", "source_genome_id");
  await dropColumnIfNeeded("layout_strategies", "source_layout_strategy_id");
  await dropColumnIfNeeded("layout_strategies", "is_public");
  await dropColumnIfNeeded("layout_strategies", "published_at");
  await dropTableIfNeeded("style_genome_forks");
  await dropTableIfNeeded("layout_strategy_forks");
  await dropColumnIfNeeded("knowledge_cards", LEGACY_WORKSPACE_SCOPE_COLUMN);
  await renameColumnIfNeeded("asset_files", LEGACY_ASSET_FILES_LEGACY_ASSET_ID_COLUMN, "source_record_id");
  await ensureColumn("asset_files", "article_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("asset_files", "source_record_id", getDatabase().type === "postgres" ? "BIGINT" : "INTEGER");
  await ensureColumn("asset_files", "asset_type", "TEXT NOT NULL DEFAULT 'cover_image'");
  await ensureColumn("asset_files", "batch_token", "TEXT");
  await ensureColumn("asset_files", "variant_label", "TEXT");
  await ensureColumn("asset_files", "storage_provider", "TEXT");
  await ensureColumn("asset_files", "public_url", "TEXT");
  await ensureColumn("asset_files", "original_object_key", "TEXT");
  await ensureColumn("asset_files", "compressed_object_key", "TEXT");
  await ensureColumn("asset_files", "thumbnail_object_key", "TEXT");
  await ensureColumn("asset_files", "mime_type", "TEXT");
  await ensureColumn("asset_files", "byte_length", "INTEGER");
  await ensureColumn("asset_files", "status", "TEXT NOT NULL DEFAULT 'ready'");
  await ensureColumn("asset_files", "manifest_json", getDatabase().type === "postgres" ? "JSONB" : "TEXT");
  await ensureColumn("asset_files", "updated_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "NOW()" : "(datetime('now'))"}`);
  await ensureColumn("writing_asset_rollouts", "auto_mode", "TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("writing_asset_rollouts", "rollout_observe_only", `${getDatabase().type === "postgres" ? "BOOLEAN" : "INTEGER"} NOT NULL DEFAULT ${getDatabase().type === "postgres" ? "FALSE" : "0"}`);
  await ensureColumn("prompt_rollout_daily_metrics", "observe_hit_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("writing_asset_rollout_daily_metrics", "observe_hit_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("writing_optimization_runs", "experiment_mode", "TEXT NOT NULL DEFAULT 'full_article'");
  await ensureColumn("writing_optimization_runs", "decision_mode", "TEXT NOT NULL DEFAULT 'manual_review'");
  await ensureColumn("writing_optimization_runs", "resolution_status", "TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn("writing_optimization_runs", "resolved_at", `${getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT"}`);
  await ensureColumn("writing_eval_run_schedules", "experiment_mode", "TEXT NOT NULL DEFAULT 'full_article'");
  await ensureColumn("writing_eval_run_schedules", "agent_strategy", "TEXT NOT NULL DEFAULT 'default'");
  await ensureColumn("writing_eval_run_schedules", "decision_mode", "TEXT NOT NULL DEFAULT 'manual_review'");
  await ensureColumn("writing_eval_run_schedules", "priority", "INTEGER NOT NULL DEFAULT 100");
  await replaceTextInColumn("audit_logs", "payload_json", [
    [LEGACY_AUDIT_LOG_ROLLOUT_STAFF_ONLY_CAMEL_KEY, "rolloutObserveOnly"],
    [LEGACY_AUDIT_LOG_ROLLOUT_STAFF_ONLY_KEY, "rollout_observe_only"],
    [LEGACY_AUDIT_LOG_STAFF_USER_COUNT_KEY, "observeUserCount"],
    [LEGACY_AUDIT_LOG_STAFF_HIT_COUNT_KEY, "observeHitCount"],
    [LEGACY_AUDIT_LOG_STAFF_SCOPE_KEY, CANONICAL_OBSERVE_SCOPE_KEY],
  ]);
  await normalizeCanonicalAdminData();
  await execAll([
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_datasets_status_updated_at ON writing_eval_datasets(status, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_cases_dataset_enabled_difficulty ON writing_eval_cases(dataset_id, is_enabled, difficulty_level)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_rollout_observations_prompt_version_last_hit ON prompt_rollout_observations(prompt_id, version, last_hit_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_rollout_observations_reason_last_hit ON prompt_rollout_observations(resolution_reason, last_hit_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_rollout_daily_metrics_prompt_version_date ON prompt_rollout_daily_metrics(prompt_id, version, metric_date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_active_assets_type_updated_at ON writing_active_assets(asset_type, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_asset_rollouts_type_enabled_updated_at ON writing_asset_rollouts(asset_type, is_enabled, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_asset_rollout_obs_type_ref_last_hit ON writing_asset_rollout_observations(asset_type, asset_ref, last_hit_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_asset_rollout_metrics_type_ref_date ON writing_asset_rollout_daily_metrics(asset_type, asset_ref, metric_date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_optimization_runs_status_created_at ON writing_optimization_runs(status, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_optimization_runs_dataset_created_at ON writing_optimization_runs(dataset_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_run_schedules_enabled_priority_next_run ON writing_eval_run_schedules(is_enabled, priority DESC, next_run_at ASC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_run_schedules_dataset_updated_at ON writing_eval_run_schedules(dataset_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_run_schedules_trigger_strategy_priority_next_run ON writing_eval_run_schedules(trigger_mode, agent_strategy, priority DESC, next_run_at ASC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_optimization_results_run_total_score ON writing_optimization_results(run_id, total_score DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_optimization_results_case_created_at ON writing_optimization_results(case_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_scoring_profiles_active_updated_at ON writing_eval_scoring_profiles(is_active, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_optimization_versions_type_target_created_at ON writing_optimization_versions(version_type, target_key, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_optimization_versions_decision_created_at ON writing_optimization_versions(decision, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_online_feedback_run_captured_at ON writing_eval_online_feedback(run_id, captured_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_online_feedback_result_captured_at ON writing_eval_online_feedback(result_id, captured_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_online_feedback_article_captured_at ON writing_eval_online_feedback(article_id, captured_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_online_feedback_sync_log ON writing_eval_online_feedback(wechat_sync_log_id)",
  ]);
  await ensureTopicSourceScopedUniqueness();
  await ensureColumn("topic_sources", "source_type", "TEXT NOT NULL DEFAULT 'news'");
  await ensureColumn("topic_sources", "priority", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn("topic_sources", "last_fetched_at", getDatabase().type === "postgres" ? "TIMESTAMPTZ" : "TEXT");
  await normalizeLayoutStrategyTerminology();
  await syncLegacyTopicSourcesToSourceConnectors();
  await backfillAssetFilesFromCoverAssets();
  await syncPersonaCatalogToPersonaTags();
  await backfillLayoutTemplatesFromTemplateVersions();
  await ensureWritingEvalSeeds();
  await ensureWritingActiveAssetSeeds();
}

export async function ensureTemplateLibrarySeeds() {
  const db = getDatabase();
  for (const template of STYLE_TEMPLATE_LIBRARY) {
    const layoutStrategy = await db.queryOne<{ id: number }>("SELECT id FROM layout_strategies WHERE code = ?", [template.id]);
    if (!layoutStrategy) {
      await db.exec(
        `INSERT INTO layout_strategies (
          owner_user_id, code, name, description, meta, config_json, is_official, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          null,
          template.id,
          template.name,
          template.description,
          template.meta,
          template.config,
          true,
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    }

    const templateVersion = await db.queryOne<{ id: number }>(
      "SELECT id FROM template_versions WHERE template_id = ? AND version = ?",
      [template.id, "v1.0.0"],
    );
    if (!templateVersion) {
      await db.exec(
        `INSERT INTO template_versions (template_id, version, name, description, config_json, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [template.id, "v1.0.0", template.name, template.description, template.config, true, new Date().toISOString()],
      );
    }
    await syncTemplateVersionToLayoutTemplates({
      templateId: template.id,
      version: "v1.0.0",
      ownerUserId: null,
      name: template.name,
      description: template.description,
      sourceUrl: null,
      meta: template.meta,
      config: template.config,
      isActive: true,
    });
  }

  for (const source of [
    { name: "YouTube Official Blog", homepageUrl: "https://blog.youtube/", sourceType: "youtube", priority: 98 },
    { name: "Reddit r/technology", homepageUrl: "https://www.reddit.com/r/technology/", sourceType: "reddit", priority: 96 },
    { name: "The Vergecast RSS", homepageUrl: "https://feeds.megaphone.fm/vergecast", sourceType: "podcast", priority: 94 },
    { name: "Spotify Newsroom Podcasts", homepageUrl: "https://newsroom.spotify.com/category/podcasts/", sourceType: "spotify", priority: 92 },
    { name: "晚点 LatePost", homepageUrl: "https://www.latepost.com", sourceType: "news", priority: 90 },
    { name: "OpenAI News", homepageUrl: "https://openai.com/news/", sourceType: "blog", priority: 88 },
    { name: "GitHub Changelog Feed", homepageUrl: "https://github.blog/changelog/feed/", sourceType: "rss", priority: 86 },
    { name: "36Kr", homepageUrl: "https://36kr.com", sourceType: "news", priority: 80 },
    { name: "华尔街日报 Wall Street Journal", homepageUrl: "https://www.wsj.com", sourceType: "news", priority: 70 },
  ]) {
    const exists = await db.queryOne<{ id: number }>(
      "SELECT id FROM topic_sources WHERE owner_user_id IS NULL AND name = ?",
      [source.name],
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO topic_sources (name, homepage_url, source_type, priority, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [source.name, source.homepageUrl, source.sourceType, source.priority, true, new Date().toISOString(), new Date().toISOString()],
      );
    }
    const currentSource = await db.queryOne<{
      id: number;
      owner_user_id: number | null;
      name: string;
      homepage_url: string | null;
      source_type: string | null;
      priority: number | null;
      is_active: number | boolean;
      last_fetched_at: string | null;
    }>(
      `SELECT id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at
       FROM topic_sources
       WHERE owner_user_id IS NULL AND name = ?`,
      [source.name],
    );
    if (currentSource) {
      await syncTopicSourceToSourceConnector({
        topicSourceId: currentSource.id,
        ownerUserId: currentSource.owner_user_id,
        name: currentSource.name,
        homepageUrl: currentSource.homepage_url,
        sourceType: currentSource.source_type,
        priority: currentSource.priority,
        isActive: Boolean(currentSource.is_active),
        lastFetchedAt: currentSource.last_fetched_at,
      });
    }
  }
}
