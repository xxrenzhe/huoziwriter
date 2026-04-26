import { getDatabase } from "./db";
import { DEFAULT_MODEL_ROUTES } from "./domain";
import { applyDbModelRouteEnvOverride, getConfiguredDefaultModelRoutes, hasModelRouteEnvOverride } from "./ai-model-route-env";
import { renderMarkdownToHtml } from "./rendering";
import { getActiveTemplateById } from "./layout-templates";
import { resolveTemplateRenderConfig } from "./template-rendering";
import { ensureDefaultTopics } from "./topic-signals";
import { clearPromptCache } from "./prompt-loader";
import { ensureUsageCounterSchema } from "./usage";
import { ensureDefaultArticleNodes } from "./article-outline";
import { ensureArticleWorkflow } from "./article-workflows";
import { ensureTemplateLibrarySeeds, ensureExtendedProductSchema } from "./schema-bootstrap";
import { appendAuditLog } from "./audit";
import { getUserAccessScope } from "./access-scope";
import { inferEvidenceHookStrength, normalizeEvidenceHookTag, tagEvidenceItemHooks } from "./article-evidence";
import { buildSemanticEmbedding, parseSemanticEmbedding, scoreSemanticMatch } from "./semantic-search";
import { normalizeArticleStatus, toStoredArticleStatus } from "./article-status-label";
import { getSeriesById, resolveArticleSeriesId } from "./series";
import { resolvePlanFeatureSnapshot, type PlanFeatureSourceRecord } from "./plan-entitlements";
import { ensureWechatEnvConnectionForUser } from "./wechat-env-connection";

let articleSnapshotsArticleColumnPromise: Promise<"article_id" | "document_id"> | null = null;

async function getArticleSnapshotsArticleColumn() {
  articleSnapshotsArticleColumnPromise ??= (async () => {
    const db = getDatabase();
    if (db.type === "sqlite") {
      const columns = await db.query<{ name: string }>("PRAGMA table_info(article_snapshots)");
      return columns.some((item) => item.name === "article_id") ? "article_id" : "document_id";
    }
    const articleColumn = await db.queryOne<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'article_snapshots' AND column_name = 'article_id'`,
    );
    return articleColumn ? "article_id" : "document_id";
  })();
  return articleSnapshotsArticleColumnPromise;
}

const DEFAULT_PROMPT_SEEDS = [
  {
    promptId: "topic_analysis",
    version: "v1.0.0",
    category: "analysis",
    name: "选题分析",
    description: "判断主题是否值得写、写给谁、为什么现在写以及主要风险",
    filePath: "system:analysis",
    functionName: "topicAnalysis",
    promptContent: [
      "你是公众号增长写作的选题主编，只负责判断选题价值，不负责写正文。",
      "请基于用户输入、链接摘要、推荐选题或已有素材，判断这个主题是否值得进入自动生产线。",
      "必须输出 JSON，字段包含 theme、coreAssertion、whyNow、readerBenefit、risk、decision、repairActions。",
      "theme 要具体，不要写成宽泛行业名；coreAssertion 必须是可论证判断，不要复述事实。",
      "whyNow 必须说明时间窗口、趋势变化或读者当下关心的理由；没有依据就写 evidenceGap。",
      "readerBenefit 必须说明读者看完能获得的判断、提醒或行动，而不是作者想表达什么。",
      "risk 要区分事实风险、选题过宽、立场争议、素材不足和发布时间不敏感。",
      "禁止把模型猜测写成事实；禁止直接生成标题、大纲或正文。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增 plan22 全自动生产线选题分析专有 Prompt",
  },
  {
    promptId: "research_brief",
    version: "v1.1.0",
    category: "analysis",
    name: "研究简报",
    description: "围绕选题生成研究问题、信源充分度、时间脉络、横向比较与交汇洞察",
    filePath: "system:analysis",
    functionName: "researchBrief",
    promptContent: [
      "你是全自动文章生产线的研究主编，只负责研究和证据分级，不负责写正文。",
      "必须输出 JSON，字段包含 queries、sources、timeline、contradictions、evidenceGaps、sourceQuality、researchSummary。",
      "queries 要能直接交给 SearXNG、IMA 或用户知识库检索；每个 query 都要说明检索目的。",
      "sources 必须区分 official、firstHand、media、community、knowledgeBase、imaSample、modelInference。",
      "不得把搜索摘要直接写成已验证事实；搜索结果只能先作为线索，除非来源本身是官方或原始资料。",
      "核心事实至少要求两个不同类型信源交叉验证；无法验证但有写作价值的内容标为 evidenceGaps。",
      "时间敏感事实必须记录检索日期和发布时间；无法确认发布时间时写 null，不要编造。",
      "contradictions 要记录不同信源之间的冲突、口径差异或统计口径差异。",
      "禁止输出公众号正文、标题党标题或未经证据支持的判断。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "补强 plan22 搜索结果、可引用事实、待验证线索和模型推断边界",
  },
  {
    promptId: "source_localization",
    version: "v1.0.0",
    category: "analysis",
    name: "英文信源中文化表达转化",
    description: "在保留事实准确性的前提下，把英文或中英混合信源转成中文写作可消费素材",
    filePath: "system:analysis",
    functionName: "sourceLocalization",
    promptContent: [
      "你是中文写作研究编辑，负责把英文或中英混合信源转成适合中文公众号写作的结构化素材。",
      "你的目标是：事实不变、中文自然、术语准确、风险可追溯。",
      "必须严格区分原文事实、中文转述和翻译风险，不得补编背景，不得新增判断。",
      "输出 JSON，不要 markdown，不要解释。",
      '字段：{"localizedTitle":"字符串","localizedSummary":"字符串","factPointsZh":["字符串"],"quoteCandidatesZh":["字符串"],"termMappings":[{"sourceTerm":"字符串","zhTerm":"字符串","note":"字符串或空"}],"translationRisk":"字符串或空"}',
      "localizedSummary 是可直接供研究简报和正文消费的自然中文摘要。",
      "factPointsZh 只保留可核查事实，最多 4 条，优先时间、主体、动作、数字、规则变化。",
      "quoteCandidatesZh 是可以被正文引用的中文表述，最多 2 条，不能写成夸张标题。",
      "termMappings 只保留关键术语、岗位名、产品名、平台规则名、专业缩写等必要对照。",
      "translationRisk 只在存在潜在误译、营销腔、主观判断、口径不清时填写。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增高质量英文信源中文化表达转化场景",
  },
  {
    promptId: "fragment_distill",
    version: "v1.0.0",
    category: "evidence",
    name: "碎片提纯",
    description: "将原始内容转为原子事实碎片",
    filePath: "system:evidence",
    functionName: "fragmentDistill",
    promptContent: "你是碎片提纯器。保留时间、地点、数据、冲突，不要写空泛总结。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "vision_note",
    version: "v1.0.0",
    category: "evidence",
    name: "截图视觉理解",
    description: "从截图中提取可复用的事实与上下文",
    filePath: "system:evidence",
    functionName: "visionNote",
    promptContent: "你是截图理解编辑。必须先看图，再提取正文、数字、图表结论、界面状态和异常信号，输出可复用的写作碎片。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "article_write",
    version: "v1.0.0",
    category: "writing",
    name: "正文生成",
    description: "根据碎片和大纲生成正文",
    filePath: "system:writing",
    functionName: "articleWrite",
    promptContent: "你是中文专栏作者。根据节点和碎片生成短句、克制、反机器腔调的正文。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "writing_style_analysis",
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
    promptId: "topic_backlog_ideation",
    version: "v1.0.0",
    category: "analysis",
    name: "选题库 AI 生题",
    description: "围绕种子主题批量生成可入库的选题条目",
    filePath: "system:analysis",
    functionName: "topicBacklogIdeation",
    promptContent: [
      "你是中文公众号选题策划编辑。",
      "你的任务是围绕一个种子主题，为选题库生成一批可继续深化的候选条目，而不是直接写正文标题。",
      "每条都必须包含：theme、archetype、targetAudience、readerSnapshotHint、coreAssertion、whyNow、mainstreamBelief。",
      "readerSnapshotHint 必须写成具体处境，不要只写年龄、人群或行业名。",
      "coreAssertion 必须是一个能成立的判断，不要复述事实。",
      "同一批次尽量覆盖不同 archetype，但不要为了凑数牺牲相关性。",
      "只返回 JSON，不要 markdown，不要解释。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增选题库种子主题批量生题场景",
  },
  {
    promptId: "ima_hook_pattern_distill",
    version: "v1.1.0",
    category: "analysis",
    name: "IMA 爆点规律提炼",
    description: "基于 IMA 知识库命中的真实爆款，提炼赛道规律并生成裂变候选",
    filePath: "apps/web/src/lib/prompts/topic/imaHookPatternDistill.md",
    functionName: "imaHookPatternDistill",
    promptContent: [
      "你是笔尖 5.0 风格的赛道爆点分析师。",
      "",
      "你的任务是基于一个赛道关键词，以及同赛道的真实爆款标题与片段，提炼共同规律，并生成可直接起稿的差异化选题。",
      "",
      "输出严格 JSON，结构如下：",
      '{"hookPatterns":[{"name":"字符串","description":"字符串","triggerPsychology":"字符串","sampleTitles":["字符串"]}],"viralDirections":[{"direction":"字符串","coreTension":"字符串","identityHook":"字符串","emotionalTrigger":"字符串","transferHint":"字符串","sampleTitles":["字符串"]}],"differentiatedAngles":[{"title":"字符串","fissionMode":"regularity|contrast|cross-domain","targetReader":"字符串","description":"字符串","sampleTitles":["字符串"]}]}',
      "",
      "硬约束：",
      "1. 只能引用输入里真实存在的标题，禁止改写 sampleTitles。",
      "2. 禁止编造未出现的事实、数据、案例或标题。",
      "3. hookPatterns 输出 2-4 条；viralDirections 输出 3-5 条；differentiatedAngles 输出 3-6 条。",
      "4. 名称简洁，description / triggerPsychology / coreTension / transferHint 使用自然中文，不要空话。",
      "5. viralDirections 必须尽量覆盖：高频题材、身份切口、处境冲突、可迁移角度。",
      "6. 禁止使用：赋能、底层逻辑、抓手、闭环、破圈、跃迁、心智模型、降维打击、颗粒度、顶层设计。",
      "7. 不要输出 markdown，不要解释，只返回 JSON。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增爆文素材方向提炼字段，支持从 IMA 样本抽取可迁移题材方向",
  },
  {
    promptId: "topicFission.regularity",
    version: "v1.0.0",
    category: "analysis",
    name: "选题裂变·规律裂变",
    description: "基于赛道规律生成结构化裂变选题",
    filePath: "system:analysis",
    functionName: "topicFissionRegularity",
    promptContent: "你是公众号赛道爆点分析师。先提炼赛道规律，再产出结构化裂变选题。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 topicFission.regularity 场景",
  },
  {
    promptId: "topicFission.contrast",
    version: "v1.0.0",
    category: "analysis",
    name: "选题裂变·差异化",
    description: "基于赛道常见写法生成差异化选题",
    filePath: "system:analysis",
    functionName: "topicFissionContrast",
    promptContent: "你是公众号差异化选题编辑。先指出赛道被写烂的角度，再产出结构化差异化选题。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 topicFission.contrast 场景",
  },
  {
    promptId: "topicFission.crossDomain",
    version: "v1.0.0",
    category: "analysis",
    name: "选题裂变·跨赛道迁移",
    description: "提取原赛道传播基因并迁移到目标赛道",
    filePath: "system:analysis",
    functionName: "topicFissionCrossDomain",
    promptContent: "你是跨赛道选题编辑。先抽取原赛道的传播基因，再迁移到目标赛道形成结构化选题。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 topicFission.crossDomain 场景",
  },
  {
    promptId: "strategyCard.autoDraft",
    version: "v1.0.0",
    category: "analysis",
    name: "策略卡自动初稿",
    description: "根据选题生成 StrategyCard 底层字段初稿",
    filePath: "system:analysis",
    functionName: "strategyCardAutoDraft",
    promptContent: "你是内容策略编辑。根据选题、读者和素材，生成策略卡底层字段初稿。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 strategyCard.autoDraft 场景",
  },
  {
    promptId: "strategyCard.fourPointAggregate",
    version: "v1.0.0",
    category: "analysis",
    name: "策略卡四元聚合",
    description: "从底层策略字段聚合笔尖四元视图",
    filePath: "system:analysis",
    functionName: "strategyCardFourPointAggregate",
    promptContent: "你是笔尖方法论编辑。请把底层策略字段聚合成认知翻转、读者快照、核心张力、发力方向四元视图。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 strategyCard.fourPointAggregate 场景",
  },
  {
    promptId: "strategyCard.strengthAudit",
    version: "v1.0.0",
    category: "review",
    name: "策略卡强度自检",
    description: "对笔尖四元做结构化强度评分",
    filePath: "system:review",
    functionName: "strategyCardStrengthAudit",
    promptContent: "你是内容策略审校。请对认知翻转、读者快照、核心张力、发力方向做 1-5 分评分并给出补强建议。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 strategyCard.strengthAudit 场景",
  },
  {
    promptId: "strategyCard.reverseWriteback",
    version: "v1.0.0",
    category: "analysis",
    name: "策略卡反写回底层字段",
    description: "把笔尖视角编辑结果反写到底层策略字段",
    filePath: "system:analysis",
    functionName: "strategyCardReverseWriteback",
    promptContent: "你是策略卡反写助手。请把笔尖四元视角的修改拆回到底层字段。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 strategyCard.reverseWriteback 场景",
  },
  {
    promptId: "evidenceHookTagging",
    version: "v1.0.0",
    category: "evidence",
    name: "证据爆点标注",
    description: "为证据自动标注爆点标签与强度",
    filePath: "system:evidence",
    functionName: "evidenceHookTagging",
    promptContent: "你是传播爆点标注器。请为证据识别反常识、具身细节、身份标签、情绪造句四类标签，并评估强度。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 evidenceHookTagging 场景",
  },
  {
    promptId: "styleDna.crossCheck",
    version: "v1.0.0",
    category: "analysis",
    name: "风格 DNA 交叉校验",
    description: "多篇样本交叉提炼稳定风格共性",
    filePath: "system:analysis",
    functionName: "styleDnaCrossCheck",
    promptContent: "你是中文文风分析师。请对多篇样本做交叉聚合，输出稳定风格共性与各维度置信度。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 styleDna.crossCheck 场景",
  },
  {
    promptId: "publishGate.rhythmConsistency",
    version: "v1.0.0",
    category: "review",
    name: "发布前原型节奏一致性",
    description: "评估策略原型与成稿节奏是否一致",
    filePath: "system:review",
    functionName: "publishGateRhythmConsistency",
    promptContent: "你是发布前总控编辑。请评估策略原型与当前成稿节奏是否一致，并给出结构化偏离说明。输出 JSON，不要解释。",
    language: "zh-CN",
    changeNotes: "新增 17 号方案 publishGate.rhythmConsistency 场景",
  },
  {
    promptId: "language_guard_audit",
    version: "v1.0.0",
    category: "review",
    name: "语言守卫审校",
    description: "检查并替换禁用表达与长句",
    filePath: "system:review",
    functionName: "languageGuardAudit",
    promptContent: "你是终审编辑。删除禁用词，保留事实，拆解长句。",
    language: "zh-CN",
    changeNotes: "初始化版本",
  },
  {
    promptId: "language_guard_audit",
    version: "v1.1.0",
    category: "review",
    name: "语言守卫审校",
    description: "按真实发布阻塞项清理禁用表达、模板句和过长句",
    filePath: "system:review",
    functionName: "languageGuardAudit",
    promptContent: [
      "你是公众号终审编辑，只负责把已成稿改到可发布，不负责重写选题。",
      "必须输出修复后的完整 Markdown 正文，不要解释。",
      "优先级：先删禁用表达和模板句，再拆影响阅读的长句，最后打散过于工整的段落呼吸。",
      "禁用表达必须改成具体动作、对象、结果或代价；不能只换同义抽象词。",
      "长句拆分不得新增事实，不得扩大证据含义，不得改变核心判断。",
      "保留标题层级、证据、引用和已核查事实。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "补强发布阻塞项定向修复，避免只做泛化润色",
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
    promptId: "title_optimizer",
    version: "v1.0.0",
    category: "writing",
    name: "标题优化器",
    description: "围绕同一主轴生成 6 个公众号标题候选并做打开率体检",
    filePath: "system:writing",
    functionName: "titleOptimizer",
    promptContent: [
      "你是公众号标题优化专家，目标是在 1 秒内让读者决定要不要点开。",
      "你只负责标题，不负责改大纲。",
      "请围绕同一主轴生成 6 个候选标题，并明确哪一个最推荐。",
      "每个标题至少满足三要素中的 2 项：具体元素、好奇缺口、读者视角。",
      "具体元素：数字 / 产品名 / 人名 / 场景 / 结果 / 角色 / 具体对象。",
      "好奇缺口：有明确信息差，但不要把结论剧透成清单答案。",
      "读者视角：告诉读者能得到什么判断、提醒或动作，不要写成作者自我倾诉。",
      "禁止清单：震惊、不看后悔、99% 的人都、太可怕了、关于…的思考、…的一些感悟、…的 5 个方法、…的 3 个要点、自我复盘式标题、夸大事实、承诺正文无法兑现的结果。",
      "输出必须是 JSON，不要解释，不要 markdown。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增独立标题优化 prompt 资产，用于 6 候选、三要素命中与禁词体检",
  },
  {
    promptId: "opening_optimizer",
    version: "v1.0.0",
    category: "writing",
    name: "开头优化器",
    description: "围绕同一主轴生成 3 个公众号开头候选并做前三秒留存体检",
    filePath: "apps/web/src/lib/prompts/opening_optimizer.md",
    functionName: "openingOptimizer",
    promptContent: [
      "你是公众号开头诊断与改写专家，目标是在前 200 字留住读者。",
      "你只负责开头，不负责重写整篇大纲。",
      "请围绕同一主轴生成 3 个候选开头，并明确哪一个最推荐。",
      "优先使用场景切入、冲突反差、判断前置、问句钩子、现象信号等模式，避免 3 个候选写成同一种套路。",
      "必须同时检查四个维度：抽象度、铺垫度、钩子浓度、信息前置。",
      "禁止清单：大而空背景铺垫、自我介绍开路、引用/数据诱饵、把真正的钩子埋到后面。",
      "推荐项必须优先满足：禁区最少、信息前置、读者收益更明确、前三秒更容易留下来。",
      "输出必须是 JSON，不要解释，不要 markdown。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增独立开头优化 prompt 资产，用于 3 候选开头、四维诊断与推荐项决策",
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
    promptId: "fact_check",
    version: "v1.2.0",
    category: "review",
    name: "事实核查",
    description: "对正文中的事实、数据、案例、时间和因果判断进行核查并区分修复优先级",
    filePath: "system:review",
    functionName: "factCheck",
    promptContent: [
      "你是事实核查编辑。只核查正文里的具体事实、数据、案例、时间、产品能力、政策限制和强因果判断。",
      "请区分四类：已验证、待补证据、高风险表述、主观判断。不要把观点、写作判断、有限观察误判成事实错误。",
      "高风险只用于：具体数字无来源、真实主体能力/限制无来源、案例细节无来源、强因果或行业定论没有证据支撑。",
      "如果只是趋势判断或作者观点，应标为主观判断，并给出建议措辞，而不是直接标高风险。",
      "必须指出哪些高风险项需要删除、降级为条件表达，或回到研究阶段补证据。",
      "同时判断人设与选题是否偏离。输出 JSON，不要解释。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "降低观点误杀，明确高风险事实边界和自动修复方向",
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
    promptId: "cover_image_brief",
    version: "v1.0.0",
    category: "publish",
    name: "封面 brief",
    description: "把终稿和标题转成可直接调用图片引擎的视觉 brief",
    filePath: "system:publish",
    functionName: "coverImageBrief",
    promptContent: [
      "你是公众号封面视觉总监，只负责生成图片 brief，不负责生成正文。",
      "必须输出 JSON，字段包含 prompt、negativePrompt、altText、style、composition、riskWarnings。",
      "prompt 要可直接交给图片生成模型，必须包含主体、场景、构图、材质、光线、色彩和情绪。",
      "negativePrompt 必须排除低质、错字、水印、恐怖谷、夸张营销感、违规符号和与正文无关元素。",
      "altText 要能给读者说明图片含义，不要堆关键词。",
      "style 要贴合文章调性和公众号定位；不允许默认紫色科技 SaaS 风。",
      "禁止加入正文没有支撑的事实画面，禁止生成真实人物肖像冒充新闻照片。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增 plan22 封面图 brief 专有 Prompt",
  },
  {
    promptId: "layout_apply",
    version: "v1.0.0",
    category: "publish",
    name: "排版应用",
    description: "匹配模板并生成微信公众号 HTML 结构",
    filePath: "system:publish",
    functionName: "layoutExtract",
    promptContent: [
      "你是微信公众号排版工程师，只负责把已定稿 Markdown 转成微信预览 HTML 结构。",
      "必须输出 JSON，字段包含 templateId、html、previewWarnings、compatibilityNotes。",
      "必须保留原文事实、标题层级和引用含义；不得新增观点、案例、数据或营销话术。",
      "html 要适配微信公众号草稿箱，避免 script、iframe、外链样式和复杂交互。",
      "previewWarnings 要指出图片缺失、标题层级异常、过长段落、引用样式冲突和模板不兼容。",
      "禁止为了好看改写事实；禁止输出解释性 markdown。",
    ].join("\n"),
    language: "zh-CN",
    changeNotes: "新增 plan22 一键排版专有 Prompt",
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
  await ensureTemplateLibrarySeeds();
  await ensureDefaultTopics();
  await ensurePromptCatalogSeeds();
}

async function ensurePromptCatalogSeeds() {
  const db = getDatabase();
  for (const route of getConfiguredDefaultModelRoutes()) {
    const exists = await db.queryOne<{
      id: number;
      primary_model: string;
      fallback_model: string | null;
      shadow_model: string | null;
      shadow_traffic_percent: number | null;
      description: string | null;
    }>(
      "SELECT id, primary_model, fallback_model, shadow_model, shadow_traffic_percent, description FROM ai_model_routes WHERE scene_code = ?",
      [
        route.sceneCode,
      ],
    );
    if (!exists) {
      await db.exec(
        `INSERT INTO ai_model_routes (scene_code, primary_model, fallback_model, shadow_model, shadow_traffic_percent, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          route.sceneCode,
          route.primaryModel,
          route.fallbackModel,
          route.shadowModel ?? null,
          route.shadowTrafficPercent ?? 0,
          route.description,
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
      continue;
    }

    if (
      hasModelRouteEnvOverride(route.sceneCode) &&
      (
        exists.primary_model !== route.primaryModel ||
        exists.fallback_model !== route.fallbackModel ||
        exists.shadow_model !== (route.shadowModel ?? null) ||
        Number(exists.shadow_traffic_percent ?? 0) !== Number(route.shadowTrafficPercent ?? 0) ||
        exists.description !== route.description
      )
    ) {
      await db.exec(
        `UPDATE ai_model_routes
         SET primary_model = ?, fallback_model = ?, shadow_model = ?, shadow_traffic_percent = ?, description = ?, updated_at = ?
         WHERE scene_code = ?`,
        [
          route.primaryModel,
          route.fallbackModel,
          route.shadowModel ?? null,
          route.shadowTrafficPercent ?? 0,
          route.description,
          new Date().toISOString(),
          route.sceneCode,
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
         SET primary_model = ?, fallback_model = ?, shadow_model = ?, shadow_traffic_percent = ?, description = ?, updated_at = ?
         WHERE scene_code = ?`,
        [
          route.primaryModel,
          route.fallbackModel,
          route.shadowModel ?? null,
          route.shadowTrafficPercent ?? 0,
          route.description,
          new Date().toISOString(),
          route.sceneCode,
        ],
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
        prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, is_active, change_notes, rollout_observe_only, rollout_percentage, rollout_plan_codes_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        false,
        0,
        JSON.stringify([]),
        new Date().toISOString(),
      ],
    );
  }
}

export async function getPlans() {
  const db = getDatabase();
  return db.query<PlanFeatureSourceRecord>(
    `SELECT code, name, price_cny, daily_generation_limit, fragment_limit,
            language_guard_rule_limit AS "languageGuardRuleLimit",
            max_wechat_connections, can_generate_cover_image, can_export_pdf
     FROM plans
     ORDER BY price_cny ASC, id ASC`,
  );
}

export async function getPlanByCode(code: string) {
  const db = getDatabase();
  return db.queryOne<PlanFeatureSourceRecord>(
    `SELECT code, name, price_cny, daily_generation_limit, fragment_limit,
            language_guard_rule_limit AS "languageGuardRuleLimit",
            max_wechat_connections, can_generate_cover_image, can_export_pdf
     FROM plans
     WHERE code = ?`,
    [code],
  );
}

export async function getResolvedPlans() {
  const plans = await getPlans();
  return plans.map((plan) => resolvePlanFeatureSnapshot(plan));
}

export async function getResolvedPlanByCode(code: string) {
  const plan = await getPlanByCode(code);
  return plan ? resolvePlanFeatureSnapshot(plan) : null;
}

export async function getLatestArticleCoverImage(userId: number, articleId: number) {
  const db = getDatabase();
  return db.queryOne<{
    id: number;
    prompt: string;
    image_url: string;
    created_at: string;
  }>(
    `SELECT id, prompt, image_url, created_at
     FROM cover_images
     WHERE user_id = ? AND article_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, articleId],
  );
}

export async function getLatestArticleCoverImageCandidates(userId: number, articleId: number) {
  const db = getDatabase();
  const latestBatch = await db.queryOne<{ batch_token: string }>(
    `SELECT batch_token
     FROM cover_image_candidates
     WHERE user_id = ? AND article_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, articleId],
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
     WHERE user_id = ? AND article_id = ? AND batch_token = ?
     ORDER BY id ASC`,
    [userId, articleId, latestBatch.batch_token],
  );
}

export async function getArticleImagePrompts(userId: number, articleId: number) {
  const db = getDatabase();
  return db.query<{
    id: number;
    article_node_id: number | null;
    asset_type: string;
    title: string;
    prompt: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, article_node_id AS article_node_id, asset_type, title, prompt, created_at, updated_at
     FROM article_image_prompts
     WHERE user_id = ? AND article_id = ?
     ORDER BY COALESCE(article_node_id, 0) ASC, id ASC`,
    [userId, articleId],
  );
}

export async function getUsers() {
  const db = getDatabase();
  const [users, articleStats, usageStats, subscriptionRows] = await Promise.all([
    db.query<{
      id: number;
      username: string;
      email: string | null;
      display_name: string | null;
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
         u.role,
         u.plan_code,
         u.is_active,
         u.must_change_password,
         u.last_login_at,
         u.created_at
       FROM users u
       ORDER BY u.id DESC`,
    ),
    db.query<{
      user_id: number;
      article_count: number;
      published_article_count: number;
    }>(
      `SELECT
         user_id,
         COUNT(*) as article_count,
         SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as published_article_count
       FROM articles
       GROUP BY user_id`,
      ["published"],
    ),
    db.query<{
      user_id: number;
      total_usage: number;
      last_usage_at: string | null;
    }>(
      `SELECT
         user_id,
         COALESCE(SUM(value), 0) as total_usage,
         MAX(counter_date) as last_usage_at
       FROM usage_counters
       GROUP BY user_id`,
    ),
    db.query<{
      id: number | null;
      user_id: number;
      plan_code: string;
      status: string;
      start_at: string | null;
      end_at: string | null;
      source: string | null;
      updated_at: string | null;
    }>(
      `SELECT
         id,
         user_id,
         plan_code,
         status,
         start_at,
         end_at,
         source,
         updated_at
       FROM subscriptions
       ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
    ),
  ]);

  const articleStatsByUserId = new Map(articleStats.map((row) => [row.user_id, row]));
  const usageStatsByUserId = new Map(usageStats.map((row) => [row.user_id, row]));
  const subscriptionHistoryByUserId = new Map<number, Array<{
    id: number | null;
    plan_code: string;
    status: string;
    start_at: string | null;
    end_at: string | null;
    source: string | null;
    updated_at: string | null;
  }>>();

  subscriptionRows.forEach((row) => {
    const history = subscriptionHistoryByUserId.get(row.user_id) ?? [];
    history.push({
      id: row.id,
      plan_code: row.plan_code,
      status: row.status,
      start_at: row.start_at,
      end_at: row.end_at,
      source: row.source,
      updated_at: row.updated_at,
    });
    subscriptionHistoryByUserId.set(row.user_id, history);
  });

  return users.map((user) => {
    const articleOverview = articleStatsByUserId.get(user.id);
    const usageOverview = usageStatsByUserId.get(user.id);
    return {
      ...user,
      article_count: articleOverview?.article_count ?? 0,
      published_article_count: articleOverview?.published_article_count ?? 0,
      total_usage: usageOverview?.total_usage ?? 0,
      last_usage_at: usageOverview?.last_usage_at ?? null,
      subscription_history: subscriptionHistoryByUserId.get(user.id) ?? [],
    };
  });
}

function toMonthKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function isCurrentActiveSubscription(input: { status: string; end_at: string | null }) {
  if (input.status !== "active") {
    return false;
  }
  if (!input.end_at) {
    return true;
  }
  const endTime = new Date(input.end_at).getTime();
  return !Number.isNaN(endTime) && endTime >= Date.now();
}

function buildRecentMonthBuckets(monthCount: number) {
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  const buckets: Array<{ monthKey: string; label: string }> = [];
  for (let index = monthCount - 1; index >= 0; index -= 1) {
    const bucketDate = new Date(cursor);
    bucketDate.setMonth(cursor.getMonth() - index);
    const monthKey = `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      monthKey,
      label: `${bucketDate.getMonth() + 1}月`,
    });
  }
  return buckets;
}

export async function getAdminFinanceOverview() {
  const db = getDatabase();
  const [plans, subscriptions, usageTopUsers, subscriptionEvents] = await Promise.all([
    getResolvedPlans(),
    getAdminSubscriptions(),
    db.query<{
      user_id: number;
      username: string;
      display_name: string | null;
      plan_code: string;
      total_usage: number;
      active_days: number;
      last_usage_at: string | null;
    }>(
      `SELECT
         u.id as user_id,
         u.username,
         u.display_name,
         u.plan_code,
         COALESCE(SUM(uc.value), 0) as total_usage,
         COUNT(DISTINCT uc.counter_date) as active_days,
         MAX(uc.counter_date) as last_usage_at
       FROM usage_counters uc
       INNER JOIN users u ON u.id = uc.user_id
       GROUP BY u.id, u.username, u.display_name, u.plan_code
       ORDER BY total_usage DESC, active_days DESC, u.id DESC
       LIMIT 10`,
    ),
    db.query<{
      start_at: string | null;
      end_at: string | null;
      created_at: string;
    }>(
      `SELECT start_at, end_at, created_at
       FROM subscriptions
       ORDER BY id DESC`,
    ),
  ]);

  const planMetaByCode = new Map(plans.map((plan) => [plan.code, plan]));
  const activeSubscriptions = subscriptions.filter((subscription) => isCurrentActiveSubscription(subscription));
  const now = Date.now();
  const endingSoonBoundary = now + 30 * 24 * 60 * 60 * 1000;
  const endingSoonCount = activeSubscriptions.filter((subscription) => {
    if (!subscription.end_at) {
      return false;
    }
    const endTime = new Date(subscription.end_at).getTime();
    return !Number.isNaN(endTime) && endTime >= now && endTime <= endingSoonBoundary;
  }).length;

  const planDistributionCounts = new Map<string, number>();
  activeSubscriptions.forEach((subscription) => {
    planDistributionCounts.set(subscription.plan_code, (planDistributionCounts.get(subscription.plan_code) ?? 0) + 1);
  });

  const totalSubscriptionCount = activeSubscriptions.length;
  const planDistribution = Array.from(planDistributionCounts.entries())
    .map(([planCode, subscriberCount]) => {
      const planMeta = planMetaByCode.get(planCode);
      const priceCny = Number(planMeta?.priceCny ?? 0);
      return {
        planCode,
        planName: planMeta?.name ?? subscriptionPlanName(planCode),
        subscriberCount,
        sharePercent: totalSubscriptionCount > 0 ? (subscriberCount / totalSubscriptionCount) * 100 : 0,
        revenueEstimate: subscriberCount * priceCny,
      };
    })
    .sort((left, right) => right.subscriberCount - left.subscriberCount || right.revenueEstimate - left.revenueEstimate || left.planCode.localeCompare(right.planCode));

  const trendBuckets = buildRecentMonthBuckets(6);
  const trendByMonth = new Map(
    trendBuckets.map((bucket) => [
      bucket.monthKey,
      { monthKey: bucket.monthKey, label: bucket.label, startedCount: 0, endedCount: 0 },
    ]),
  );

  subscriptionEvents.forEach((event) => {
    const startedMonthKey = toMonthKey(event.start_at ?? event.created_at);
    if (startedMonthKey && trendByMonth.has(startedMonthKey)) {
      trendByMonth.get(startedMonthKey)!.startedCount += 1;
    }

    const endedMonthKey = event.end_at ? toMonthKey(event.end_at) : null;
    if (endedMonthKey && trendByMonth.has(endedMonthKey)) {
      trendByMonth.get(endedMonthKey)!.endedCount += 1;
    }
  });

  return {
    activeSubscriptionCount: activeSubscriptions.length,
    endingSoonCount,
    monthlyRevenueEstimate: activeSubscriptions.reduce((sum, subscription) => sum + Number(planMetaByCode.get(subscription.plan_code)?.priceCny ?? 0), 0),
    planDistribution,
    subscriptionTrend: trendBuckets.map((bucket) => trendByMonth.get(bucket.monthKey)!),
    usageTopUsers: usageTopUsers.map((user) => ({
      userId: user.user_id,
      username: user.username,
      displayName: user.display_name,
      planCode: user.plan_code,
      totalUsage: user.total_usage,
      activeDays: user.active_days,
      lastUsageAt: user.last_usage_at,
    })),
  };
}

function subscriptionPlanName(planCode: string) {
  if (planCode === "pro") {
    return "Pro";
  }
  if (planCode === "team") {
    return "Team";
  }
  if (planCode === "enterprise") {
    return "Enterprise";
  }
  return planCode === "free" ? "Free" : planCode;
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

export async function getAdminBusinessOverview() {
  const db = getDatabase();
  const [users, activeUsers, articles, publishedArticles, fragments, logs, series] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE is_active = ?", [true]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM articles"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM articles WHERE status = ?", ["published"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE status = ?", ["success"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM series"),
  ]);

  return {
    userCount: users?.count ?? 0,
    activeUserCount: activeUsers?.count ?? 0,
    articleCount: articles?.count ?? 0,
    publishedArticleCount: publishedArticles?.count ?? 0,
    fragmentCount: fragments?.count ?? 0,
    successSyncCount: logs?.count ?? 0,
    seriesCount: series?.count ?? 0,
  };
}

export async function getArticlesByUser(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const articles = await db.query<{
    id: number;
    title: string;
    markdown_content: string;
    html_content: string | null;
    status: string;
    series_id: number | null;
    layout_strategy_id: number | null;
    wechat_template_id: string | null;
    updated_at: string;
    created_at: string;
    topic_backlog_id: number | null;
    topic_backlog_name: string | null;
    topic_backlog_item_id: number | null;
    topic_backlog_batch_id: string | null;
  }>(
    `SELECT
       a.id,
       a.title,
       a.markdown_content,
       a.html_content,
       a.status,
       a.series_id,
       a.layout_strategy_id,
       a.wechat_template_id,
       a.updated_at,
       a.created_at,
       tbi.backlog_id as topic_backlog_id,
       tb.name as topic_backlog_name,
       tbi.id as topic_backlog_item_id,
       tbi.generated_batch_id as topic_backlog_batch_id
     FROM articles a
     LEFT JOIN topic_backlog_items tbi
       ON tbi.generated_article_id = a.id
      AND tbi.user_id = a.user_id
     LEFT JOIN topic_backlogs tb
       ON tb.id = tbi.backlog_id
      AND tb.user_id = a.user_id
     WHERE a.user_id = ?
     ORDER BY a.updated_at DESC, a.id DESC`,
    [userId],
  );
  return articles.map((article) => ({
    ...article,
    status: normalizeArticleStatus(article.status),
  }));
}

export async function getArticleById(articleId: number, userId?: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  if (userId) {
    const article = await db.queryOne<{
      id: number;
      user_id: number;
      title: string;
      markdown_content: string;
      html_content: string | null;
      status: string;
      series_id: number | null;
      layout_strategy_id: number | null;
      wechat_template_id: string | null;
      created_at: string;
      updated_at: string;
    }>("SELECT * FROM articles WHERE id = ? AND user_id = ?", [articleId, userId]);
    return article
      ? {
          ...article,
          status: normalizeArticleStatus(article.status),
        }
      : null;
  }
  const article = await db.queryOne<{
    id: number;
    user_id: number;
    title: string;
    markdown_content: string;
    html_content: string | null;
    status: string;
    series_id: number | null;
      layout_strategy_id: number | null;
      wechat_template_id: string | null;
      created_at: string;
      updated_at: string;
  }>("SELECT * FROM articles WHERE id = ?", [articleId]);
  return article
    ? {
        ...article,
        status: normalizeArticleStatus(article.status),
      }
    : null;
}

export async function createArticle(userId: number, title: string, seriesId?: number | null) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const resolvedSeriesId = await resolveArticleSeriesId(userId, seriesId);
  const boundSeries = await getSeriesById(userId, resolvedSeriesId);
  const initialWechatTemplateId = boundSeries?.defaultLayoutTemplateId ?? null;
  const template = initialWechatTemplateId ? await getActiveTemplateById(initialWechatTemplateId, userId) : null;
  const html = await renderMarkdownToHtml("", {
    title,
    template: resolveTemplateRenderConfig(template),
  });
  const result = await db.exec(
    `INSERT INTO articles (user_id, title, markdown_content, html_content, status, series_id, wechat_template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, title, "", html, "draft", resolvedSeriesId, initialWechatTemplateId, now, now],
  );
  await ensureDefaultArticleNodes(result.lastInsertRowid!);
  await ensureArticleWorkflow(result.lastInsertRowid!, "opportunity");
  if (boundSeries && (boundSeries.targetAudience || boundSeries.targetPackHint || boundSeries.defaultArchetype)) {
    const seriesArchetype =
      boundSeries.defaultArchetype === "opinion" || boundSeries.defaultArchetype === "case" || boundSeries.defaultArchetype === "howto" || boundSeries.defaultArchetype === "hotTake" || boundSeries.defaultArchetype === "phenomenon"
        ? boundSeries.defaultArchetype
        : null;
    await upsertArticleStrategyCard({
      articleId: Number(result.lastInsertRowid!),
      userId,
      targetReader: boundSeries.targetAudience ?? null,
      targetPackage: boundSeries.targetPackHint ?? null,
      archetype: seriesArchetype,
    });
  }
  await appendAuditLog({
    userId,
    action: "article.create",
    targetType: "article",
    targetId: result.lastInsertRowid!,
    payload: { title, seriesId: resolvedSeriesId },
  });
  return getArticleById(result.lastInsertRowid!, userId);
}

export async function saveArticle(input: {
  articleId: number;
  userId: number;
  title?: string;
  markdownContent?: string;
  status?: string;
  seriesId?: number | null;
  wechatTemplateId?: string | null;
}) {
  await ensureExtendedProductSchema();
  const current = await getArticleById(input.articleId, input.userId);
  if (!current) {
    throw new Error("稿件不存在");
  }
  const title = input.title ?? current.title;
  const markdownContent = input.markdownContent ?? current.markdown_content;
  const status = toStoredArticleStatus(input.status ?? current.status);
  const seriesId = input.seriesId === undefined ? current.series_id : await resolveArticleSeriesId(input.userId, input.seriesId);
  const wechatTemplateId = input.wechatTemplateId === undefined ? current.wechat_template_id : input.wechatTemplateId;
  const template = wechatTemplateId ? await getActiveTemplateById(wechatTemplateId, input.userId) : null;
  const htmlContent = await renderMarkdownToHtml(markdownContent, {
    title,
    template: resolveTemplateRenderConfig(template),
  });
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE articles
     SET title = ?, markdown_content = ?, html_content = ?, status = ?, series_id = ?, layout_strategy_id = ?, wechat_template_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [title, markdownContent, htmlContent, status, seriesId, null, wechatTemplateId, now, input.articleId, input.userId],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "article.save",
    targetType: "article",
    targetId: input.articleId,
    payload: { title, status, seriesId, wechatTemplateId },
  });
  return getArticleById(input.articleId, input.userId);
}

export async function deleteArticle(userId: number, articleId: number) {
  await ensureExtendedProductSchema();
  const current = await getArticleById(articleId, userId);
  if (!current) {
    throw new Error("稿件不存在");
  }
  const db = getDatabase();
  await db.transaction(async () => {
    await db.exec("DELETE FROM article_reference_articles WHERE article_id = ? OR referenced_article_id = ?", [articleId, articleId]);
    await db.exec("UPDATE topic_backlog_items SET generated_article_id = NULL WHERE generated_article_id = ?", [articleId]);
    await db.exec("UPDATE topic_leads SET adopted_article_id = NULL WHERE adopted_article_id = ?", [articleId]);
    await db.exec("UPDATE ai_call_observations SET article_id = NULL WHERE article_id = ?", [articleId]);
    const deleted = await db.exec("DELETE FROM articles WHERE id = ? AND user_id = ?", [articleId, userId]);
    if ((deleted.changes ?? 0) <= 0) {
      throw new Error("稿件删除失败");
    }
    await appendAuditLog({
      userId,
      action: "article.delete",
      targetType: "article",
      targetId: articleId,
      payload: {
        title: current.title,
        status: current.status,
        seriesId: current.series_id,
      },
    });
  });
}

export async function createArticleSnapshot(articleId: number, note?: string) {
  const db = getDatabase();
  const article = await getArticleById(articleId);
  if (!article) {
    throw new Error("稿件不存在");
  }
  const articleColumn = await getArticleSnapshotsArticleColumn();
  const result = await db.exec(
    `INSERT INTO article_snapshots (${articleColumn}, markdown_content, html_content, snapshot_note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [articleId, article.markdown_content, article.html_content, note ?? null, new Date().toISOString()],
  );
  return db.queryOne<{
    id: number;
    markdown_content: string;
    html_content: string | null;
    snapshot_note: string | null;
    created_at: string;
  }>("SELECT * FROM article_snapshots WHERE id = ?", [result.lastInsertRowid!]);
}

export async function getArticleSnapshots(articleId: number, options?: { retentionDays?: number | null }) {
  const db = getDatabase();
  const retentionDays = options?.retentionDays ?? null;
  const cutoff =
    retentionDays != null
      ? new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const articleColumn = await getArticleSnapshotsArticleColumn();
  return db.query<{
    id: number;
    markdown_content: string;
    html_content: string | null;
    snapshot_note: string | null;
    created_at: string;
  }>(
    cutoff
      ? `SELECT * FROM article_snapshots WHERE ${articleColumn} = ? AND created_at >= ? ORDER BY id DESC`
      : `SELECT * FROM article_snapshots WHERE ${articleColumn} = ? ORDER BY id DESC`,
    cutoff ? [articleId, cutoff] : [articleId],
  );
}

export async function restoreArticleSnapshot(articleId: number, snapshotId: number, userId: number) {
  const db = getDatabase();
  const articleColumn = await getArticleSnapshotsArticleColumn();
  const snapshot = await db.queryOne<{
    markdown_content: string;
    html_content: string | null;
  }>(`SELECT markdown_content, html_content FROM article_snapshots WHERE id = ? AND ${articleColumn} = ?`, [
    snapshotId,
    articleId,
  ]);
  if (!snapshot) {
    throw new Error("快照不存在");
  }
  await saveArticle({
    articleId,
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
    raw_payload_json: string | null;
    created_at: string;
  }>(
    `SELECT f.*, fs.raw_payload_json
     FROM fragments f
     LEFT JOIN fragment_sources fs
       ON fs.id = (
         SELECT MAX(id)
         FROM fragment_sources
         WHERE fragment_id = f.id
       )
     WHERE f.user_id IN (${placeholders})
     ORDER BY f.id DESC`,
    scope.userIds,
  );
}

export async function getAssetFilesByUser(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    article_id: number | null;
    article_title: string | null;
    asset_scope: string;
    asset_type: string;
    source_record_id: number;
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
       af.article_id AS article_id,
       d.title AS article_title,
       af.asset_scope,
       af.asset_type,
       af.source_record_id,
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
     LEFT JOIN articles d ON d.id = af.article_id
     WHERE af.user_id = ?
     ORDER BY af.updated_at DESC, af.id DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    articleId: row.article_id,
    articleTitle: row.article_title,
    assetScope: row.asset_scope,
    assetType: row.asset_type,
    sourceRecordId: row.source_record_id,
    batchToken: row.batch_token,
    variantLabel: row.variant_label,
    storageProvider: row.storage_provider,
    publicUrl: row.public_url,
    originalObjectKey: row.original_object_key,
    compressedObjectKey: row.compressed_object_key,
    thumbnailObjectKey: row.thumbnail_object_key,
    mimeType: row.mime_type,
    byteLength: row.byte_length,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
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

function parseJsonRecord(
  value: unknown,
): Record<string, unknown> {
  const parsed = parseAssetManifest(value);
  return parsed ?? {};
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function normalizeOutcomeHitStatus(value: unknown): "pending" | "hit" | "near_miss" | "miss" {
  if (value === "hit" || value === "near_miss" || value === "miss") {
    return value;
  }
  return "pending";
}

function normalizeWindowCode(value: unknown): "24h" | "72h" | "7d" {
  if (value === "72h" || value === "7d") {
    return value;
  }
  return "24h";
}

function normalizeNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed);
}

export type ArticleOutcome = {
  id: number;
  articleId: number;
  userId: number;
  targetPackage: string | null;
  scorecard: Record<string, unknown>;
  attribution: Record<string, unknown> | null;
  hitStatus: "pending" | "hit" | "near_miss" | "miss";
  reviewSummary: string | null;
  nextAction: string | null;
  playbookTags: string[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleStrategyCard = {
  id: number;
  articleId: number;
  userId: number;
  archetype: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
  mainstreamBelief: string | null;
  targetReader: string | null;
  coreAssertion: string | null;
  whyNow: string | null;
  researchHypothesis: string | null;
  marketPositionInsight: string | null;
  historicalTurningPoint: string | null;
  targetPackage: string | null;
  publishWindow: string | null;
  endingAction: string | null;
  firstHandObservation: string | null;
  feltMoment: string | null;
  whyThisHitMe: string | null;
  realSceneOrDialogue: string | null;
  wantToComplain: string | null;
  nonDelegableTruth: string | null;
  fourPointAudit: Record<string, unknown> | null;
  strategyLockedAt: string | null;
  strategyOverride: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ArticleEvidenceItem = {
  id: number;
  articleId: number;
  userId: number;
  fragmentId: number | null;
  nodeId: number | null;
  claim: string | null;
  title: string;
  excerpt: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  usageMode: string | null;
  rationale: string | null;
  researchTag: string | null;
  hookTags: string[];
  hookStrength: number | null;
  hookTaggedBy: string | null;
  hookTaggedAt: string | null;
  evidenceRole: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ArticleResearchCardKind = "timeline" | "comparison" | "intersection";

export type ArticleResearchCardSource = {
  id: number;
  researchCardId: number;
  label: string;
  sourceType: string;
  detail: string | null;
  sourceUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ArticleResearchCard = {
  id: number;
  articleId: number;
  userId: number;
  cardKind: ArticleResearchCardKind;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  sortOrder: number;
  sources: ArticleResearchCardSource[];
  createdAt: string;
  updatedAt: string;
};

export type ArticleOutcomeSnapshot = {
  id: number;
  outcomeId: number;
  articleId: number;
  userId: number;
  windowCode: "24h" | "72h" | "7d";
  readCount: number;
  shareCount: number;
  likeCount: number;
  notes: string | null;
  writingStateFeedback: {
    recommendedPrototypeCode: string | null;
    recommendedPrototypeLabel: string | null;
    adoptedPrototypeCode: string | null;
    adoptedPrototypeLabel: string | null;
    followedPrototypeRecommendation: boolean | null;
    recommendedVariantCode: string | null;
    recommendedVariantLabel: string | null;
    adoptedVariantCode: string | null;
    adoptedVariantLabel: string | null;
    followedRecommendation: boolean | null;
    recommendedOpeningPatternLabel: string | null;
    recommendedSyntaxPatternLabel: string | null;
    recommendedEndingPatternLabel: string | null;
    adoptedOpeningPatternLabel: string | null;
    adoptedSyntaxPatternLabel: string | null;
    adoptedEndingPatternLabel: string | null;
    followedPatternRecommendation: boolean | null;
    availableVariantCount: number;
    comparisonSampleCount: number;
    recommendationReason: string | null;
    adoptedReason: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ArticleOutcomeBundle = {
  outcome: ArticleOutcome | null;
  snapshots: ArticleOutcomeSnapshot[];
  completedWindowCodes: Array<"24h" | "72h" | "7d">;
  missingWindowCodes: Array<"24h" | "72h" | "7d">;
  nextWindowCode: "24h" | "72h" | "7d" | null;
};

export type ArticleTopicAttribution = {
  topicLeadId: number | null;
  source: string | null;
  fissionMode: string | null;
  sourceTrackLabel: string | null;
  predictedFlipStrength: number | null;
  backlogId: number | null;
  backlogName: string | null;
  backlogItemId: number | null;
  batchId: string | null;
};

export type AuthorPlaybookItem = {
  label: string;
  hitCount: number;
  nearMissCount: number;
  articleCount: number;
  latestArticleTitle: string | null;
  updatedAt: string;
};

function mapArticleOutcome(row: {
  id: number;
  article_id: number;
  user_id: number;
  target_package: string | null;
  scorecard_json: string | Record<string, unknown> | null;
  attribution_json: string | Record<string, unknown> | null;
  hit_status: string;
  review_summary: string | null;
  next_action: string | null;
  playbook_tags_json: string | string[] | null;
  created_at: string;
  updated_at: string;
}): ArticleOutcome {
  return {
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    targetPackage: row.target_package,
    scorecard: parseJsonRecord(row.scorecard_json),
    attribution: Object.keys(parseJsonRecord(row.attribution_json)).length > 0 ? parseJsonRecord(row.attribution_json) : null,
    hitStatus: normalizeOutcomeHitStatus(row.hit_status),
    reviewSummary: row.review_summary,
    nextAction: row.next_action,
    playbookTags: parseJsonStringArray(row.playbook_tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticleStrategyCard(row: {
  id: number;
  article_id: number;
  user_id: number;
  archetype: string | null;
  mainstream_belief: string | null;
  target_reader: string | null;
  core_assertion: string | null;
  why_now: string | null;
  research_hypothesis: string | null;
  market_position_insight: string | null;
  historical_turning_point: string | null;
  target_package: string | null;
  publish_window: string | null;
  ending_action: string | null;
  first_hand_observation: string | null;
  felt_moment: string | null;
  why_this_hit_me: string | null;
  real_scene_or_dialogue: string | null;
  want_to_complain: string | null;
  non_delegable_truth: string | null;
  four_point_audit_json: string | Record<string, unknown> | null;
  strategy_locked_at: string | null;
  strategy_override: boolean | number | string | null;
  created_at: string;
  updated_at: string;
}): ArticleStrategyCard {
  return {
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    archetype:
      row.archetype === "opinion" || row.archetype === "case" || row.archetype === "howto" || row.archetype === "hotTake" || row.archetype === "phenomenon"
        ? row.archetype
        : null,
    mainstreamBelief: row.mainstream_belief,
    targetReader: row.target_reader,
    coreAssertion: row.core_assertion,
    whyNow: row.why_now,
    researchHypothesis: row.research_hypothesis,
    marketPositionInsight: row.market_position_insight,
    historicalTurningPoint: row.historical_turning_point,
    targetPackage: row.target_package,
    publishWindow: row.publish_window,
    endingAction: row.ending_action,
    firstHandObservation: row.first_hand_observation,
    feltMoment: row.felt_moment,
    whyThisHitMe: row.why_this_hit_me,
    realSceneOrDialogue: row.real_scene_or_dialogue,
    wantToComplain: row.want_to_complain,
    nonDelegableTruth: row.non_delegable_truth,
    fourPointAudit: Object.keys(parseJsonRecord(row.four_point_audit_json)).length ? parseJsonRecord(row.four_point_audit_json) : null,
    strategyLockedAt: row.strategy_locked_at,
    strategyOverride: parseJsonBoolean(row.strategy_override),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticleEvidenceItem(row: {
  id: number;
  article_id: number;
  user_id: number;
  fragment_id: number | null;
  node_id: number | null;
  claim: string | null;
  title: string;
  excerpt: string;
  source_type: string;
  source_url: string | null;
  screenshot_path: string | null;
  usage_mode: string | null;
  rationale: string | null;
  research_tag: string | null;
  hook_tags_json: string | string[] | null;
  hook_strength: number | null;
  hook_tagged_by: string | null;
  hook_tagged_at: string | null;
  evidence_role: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}): ArticleEvidenceItem {
  return {
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    fragmentId: row.fragment_id,
    nodeId: row.node_id,
    claim: row.claim,
    title: row.title,
    excerpt: row.excerpt,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    screenshotPath: row.screenshot_path,
    usageMode: row.usage_mode,
    rationale: row.rationale,
    researchTag: row.research_tag,
    hookTags: parseJsonStringArray(row.hook_tags_json),
    hookStrength: typeof row.hook_strength === "number" && Number.isFinite(row.hook_strength) ? row.hook_strength : null,
    hookTaggedBy: row.hook_tagged_by,
    hookTaggedAt: row.hook_tagged_at,
    evidenceRole: row.evidence_role || "supportingEvidence",
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeArticleResearchCardKind(value: unknown): ArticleResearchCardKind {
  if (value === "comparison" || value === "intersection") {
    return value;
  }
  return "timeline";
}

function mapArticleResearchCardSource(row: {
  id: number;
  research_card_id: number;
  label: string;
  source_type: string;
  detail: string | null;
  source_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}): ArticleResearchCardSource {
  return {
    id: row.id,
    researchCardId: row.research_card_id,
    label: row.label,
    sourceType: row.source_type,
    detail: row.detail,
    sourceUrl: row.source_url,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticleResearchCard(row: {
  id: number;
  article_id: number;
  user_id: number;
  card_kind: string;
  title: string;
  summary: string | null;
  payload_json: string | Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}, sources: ArticleResearchCardSource[]): ArticleResearchCard {
  return {
    id: row.id,
    articleId: row.article_id,
    userId: row.user_id,
    cardKind: normalizeArticleResearchCardKind(row.card_kind),
    title: row.title,
    summary: row.summary,
    payload: parseJsonRecord(row.payload_json),
    sortOrder: row.sort_order,
    sources,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArticleOutcomeSnapshot(row: {
  id: number;
  outcome_id: number;
  article_id: number;
  user_id: number;
  window_code: string;
  read_count: number;
  share_count: number;
  like_count: number;
  notes: string | null;
  writing_state_feedback_json: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}): ArticleOutcomeSnapshot {
  const writingStateFeedback = parseJsonRecord(row.writing_state_feedback_json);
  return {
    id: row.id,
    outcomeId: row.outcome_id,
    articleId: row.article_id,
    userId: row.user_id,
    windowCode: normalizeWindowCode(row.window_code),
    readCount: normalizeNonNegativeInteger(row.read_count),
    shareCount: normalizeNonNegativeInteger(row.share_count),
    likeCount: normalizeNonNegativeInteger(row.like_count),
    notes: row.notes,
    writingStateFeedback: writingStateFeedback
      ? {
          recommendedPrototypeCode: String(writingStateFeedback.recommendedPrototypeCode || "").trim() || null,
          recommendedPrototypeLabel: String(writingStateFeedback.recommendedPrototypeLabel || "").trim() || null,
          adoptedPrototypeCode: String(writingStateFeedback.adoptedPrototypeCode || "").trim() || null,
          adoptedPrototypeLabel: String(writingStateFeedback.adoptedPrototypeLabel || "").trim() || null,
          followedPrototypeRecommendation:
            typeof writingStateFeedback.followedPrototypeRecommendation === "boolean"
              ? writingStateFeedback.followedPrototypeRecommendation
              : null,
          recommendedVariantCode: String(writingStateFeedback.recommendedVariantCode || "").trim() || null,
          recommendedVariantLabel: String(writingStateFeedback.recommendedVariantLabel || "").trim() || null,
          adoptedVariantCode: String(writingStateFeedback.adoptedVariantCode || "").trim() || null,
          adoptedVariantLabel: String(writingStateFeedback.adoptedVariantLabel || "").trim() || null,
          followedRecommendation:
            typeof writingStateFeedback.followedRecommendation === "boolean"
              ? writingStateFeedback.followedRecommendation
              : null,
          recommendedOpeningPatternLabel: String(writingStateFeedback.recommendedOpeningPatternLabel || "").trim() || null,
          recommendedSyntaxPatternLabel: String(writingStateFeedback.recommendedSyntaxPatternLabel || "").trim() || null,
          recommendedEndingPatternLabel: String(writingStateFeedback.recommendedEndingPatternLabel || "").trim() || null,
          adoptedOpeningPatternLabel: String(writingStateFeedback.adoptedOpeningPatternLabel || "").trim() || null,
          adoptedSyntaxPatternLabel: String(writingStateFeedback.adoptedSyntaxPatternLabel || "").trim() || null,
          adoptedEndingPatternLabel: String(writingStateFeedback.adoptedEndingPatternLabel || "").trim() || null,
          followedPatternRecommendation:
            typeof writingStateFeedback.followedPatternRecommendation === "boolean"
              ? writingStateFeedback.followedPatternRecommendation
              : null,
          availableVariantCount: normalizeNonNegativeInteger(writingStateFeedback.availableVariantCount),
          comparisonSampleCount: normalizeNonNegativeInteger(writingStateFeedback.comparisonSampleCount),
          recommendationReason: String(writingStateFeedback.recommendationReason || "").trim() || null,
          adoptedReason: String(writingStateFeedback.adoptedReason || "").trim() || null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  sourceMeta?: Record<string, unknown> | null;
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
    [
      result.lastInsertRowid!,
      input.sourceType,
      input.sourceUrl ?? null,
      input.screenshotPath ?? null,
      {
        title: input.title,
        rawContent: input.rawContent,
        sourceMeta: input.sourceMeta ?? null,
      },
      now,
    ],
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

export async function getPromptVersions() {
  await ensureExtendedProductSchema();
  await ensurePromptCatalogSeeds();
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
    updated_at: string;
    is_active: number | boolean;
    auto_mode: string | null;
    change_notes: string | null;
    rollout_observe_only: number | boolean;
    rollout_percentage: number;
    rollout_plan_codes_json: string;
  }>("SELECT * FROM prompt_versions ORDER BY category ASC, prompt_id ASC, created_at DESC");
}

export async function getPromptRolloutStats() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<{
    prompt_id: string;
    version: string;
    unique_user_count: number;
    total_hit_count: number;
    last_hit_at: string | null;
    observe_user_count: number;
    plan_user_count: number;
    percentage_user_count: number;
    stable_user_count: number;
  }>(
    `SELECT
       prompt_id,
       version,
       COUNT(DISTINCT user_id) as unique_user_count,
       COALESCE(SUM(hit_count), 0) as total_hit_count,
       MAX(last_hit_at) as last_hit_at,
       SUM(CASE WHEN resolution_reason LIKE 'observe%' THEN 1 ELSE 0 END) as observe_user_count,
       SUM(CASE WHEN resolution_reason LIKE 'plan:%' THEN 1 ELSE 0 END) as plan_user_count,
       SUM(CASE WHEN resolution_reason LIKE 'percentage:%' THEN 1 ELSE 0 END) as percentage_user_count,
       SUM(CASE WHEN resolution_reason = 'stable' THEN 1 ELSE 0 END) as stable_user_count
     FROM prompt_rollout_observations
     GROUP BY prompt_id, version
     ORDER BY MAX(last_hit_at) DESC, prompt_id ASC, version ASC`,
  );
}

export async function getPromptRolloutDailyMetrics(limit = 14) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Number(limit), 3), 60);
  return db.query<{
    prompt_id: string;
    version: string;
    metric_date: string;
    total_hit_count: number;
    observe_hit_count: number;
    plan_hit_count: number;
    percentage_hit_count: number;
    stable_hit_count: number;
  }>(
    `SELECT prompt_id, version, metric_date, total_hit_count, observe_hit_count, plan_hit_count, percentage_hit_count, stable_hit_count
     FROM prompt_rollout_daily_metrics
     WHERE metric_date >= ${
       db.type === "postgres"
         ? "TO_CHAR(CURRENT_DATE - (?::int - 1), 'YYYY-MM-DD')"
         : "date('now', '-' || (? - 1) || ' day')"
     }
     ORDER BY metric_date ASC, prompt_id ASC, version ASC`,
    [safeLimit],
  );
}

export async function getPromptRolloutSamples(limit = 8) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Number(limit), 3), 20);
  const perVersionLimitSql =
    db.type === "postgres"
      ? `ROW_NUMBER() OVER (PARTITION BY o.prompt_id, o.version ORDER BY o.last_hit_at DESC, o.hit_count DESC) AS sample_rank`
      : `ROW_NUMBER() OVER (PARTITION BY o.prompt_id, o.version ORDER BY o.last_hit_at DESC, o.hit_count DESC) AS sample_rank`;
  return db.query<{
    prompt_id: string;
    version: string;
    user_id: number;
    username: string | null;
    role: string | null;
    plan_code: string | null;
    resolution_mode: string;
    resolution_reason: string;
    user_bucket: number | null;
    hit_count: number;
    first_hit_at: string;
    last_hit_at: string;
    sample_rank: number;
  }>(
    `SELECT *
     FROM (
       SELECT
         o.prompt_id,
         o.version,
         o.user_id,
         u.username,
         o.role,
         o.plan_code,
         o.resolution_mode,
         o.resolution_reason,
         o.user_bucket,
         o.hit_count,
         o.first_hit_at,
         o.last_hit_at,
         ${perVersionLimitSql}
       FROM prompt_rollout_observations o
       LEFT JOIN users u ON u.id = o.user_id
     ) ranked
     WHERE sample_rank <= ?
     ORDER BY prompt_id ASC, version ASC, last_hit_at DESC, hit_count DESC`,
    [safeLimit],
  );
}

export async function getPromptDetail(promptId: string) {
  await ensureExtendedProductSchema();
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
    updated_at: string;
    is_active: number | boolean;
    auto_mode: string | null;
    change_notes: string | null;
    rollout_observe_only: number | boolean;
    rollout_percentage: number;
    rollout_plan_codes_json: string;
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
  autoMode?: string | null;
  changeNotes?: string | null;
  rolloutObserveOnly?: boolean;
  rolloutPercentage?: number;
  rolloutPlanCodes?: string[];
  createdBy?: number | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const autoMode = String(input.autoMode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual";
  if (input.isActive) {
    await db.exec("UPDATE prompt_versions SET is_active = ?, updated_at = ? WHERE prompt_id = ? AND is_active = ?", [false, now, input.promptId, true]);
  }
  await db.exec(
    `INSERT INTO prompt_versions (
      prompt_id, version, category, name, description, file_path, function_name, prompt_content, language, created_by, created_at, updated_at, is_active, auto_mode, change_notes, rollout_observe_only, rollout_percentage, rollout_plan_codes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now,
      now,
      input.isActive ?? false,
      input.isActive ? "manual" : autoMode,
      input.changeNotes ?? null,
      input.rolloutObserveOnly ?? false,
      Math.max(0, Math.min(100, Math.round(Number(input.rolloutPercentage ?? 0)))),
      JSON.stringify(
        Array.from(
          new Set(
            (input.rolloutPlanCodes ?? [])
              .map((item) => String(item || "").trim())
              .filter(Boolean),
          ),
        ),
      ),
    ],
  );
  clearPromptCache(input.promptId);
}

export async function activatePromptVersion(promptId: string, version: string) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("UPDATE prompt_versions SET is_active = ?, updated_at = ? WHERE prompt_id = ? AND is_active = ?", [false, now, promptId, true]);
  await db.exec("UPDATE prompt_versions SET is_active = ?, updated_at = ? WHERE prompt_id = ? AND version = ?", [true, now, promptId, version]);
  clearPromptCache(promptId);
}

export async function updatePromptVersionRolloutConfig(input: {
  promptId: string;
  version: string;
  autoMode?: string | null;
  rolloutObserveOnly?: boolean;
  rolloutPercentage?: number;
  rolloutPlanCodes?: string[];
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const promptId = String(input.promptId || "").trim();
  const version = String(input.version || "").trim();
  if (!promptId || !version) {
    throw new Error("Prompt 版本引用不能为空");
  }
  const autoMode = String(input.autoMode || "").trim().toLowerCase() === "recommendation" ? "recommendation" : "manual";
  const rolloutPercentage = Math.max(0, Math.min(100, Math.round(Number(input.rolloutPercentage ?? 0))));
  const rolloutPlanCodes = JSON.stringify(
    Array.from(
      new Set(
        (input.rolloutPlanCodes ?? [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    ),
  );
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE prompt_versions
     SET auto_mode = ?, rollout_observe_only = ?, rollout_percentage = ?, rollout_plan_codes_json = ?, updated_at = ?
     WHERE prompt_id = ? AND version = ?`,
    [
      autoMode,
      input.rolloutObserveOnly ?? false,
      rolloutPercentage,
      rolloutPlanCodes,
      now,
      promptId,
      version,
    ],
  );
  clearPromptCache(promptId);
}

export async function getModelRoutes() {
  const db = getDatabase();
  const routes = await db.query<{
    id: number;
    scene_code: string;
    primary_model: string;
    fallback_model: string | null;
    shadow_model: string | null;
    shadow_traffic_percent: number;
    description: string | null;
    updated_at: string;
  }>("SELECT * FROM ai_model_routes WHERE scene_code != ? ORDER BY id ASC", ["coverImage"]);
  return routes.map((route) => applyDbModelRouteEnvOverride(route.scene_code, route));
}

export async function updateModelRoute(input: {
  sceneCode: string;
  primaryModel: string;
  fallbackModel?: string | null;
  shadowModel?: string | null;
  shadowTrafficPercent?: number | null;
  description?: string | null;
}) {
  if (!DEFAULT_MODEL_ROUTES.some((route) => route.sceneCode === input.sceneCode)) {
    throw new Error("该场景不属于可编辑的文本模型路由");
  }
  const db = getDatabase();
  await db.exec(
    `UPDATE ai_model_routes
     SET primary_model = ?, fallback_model = ?, shadow_model = ?, shadow_traffic_percent = ?, description = ?, updated_at = ?
     WHERE scene_code = ?`,
    [
      input.primaryModel,
      input.fallbackModel ?? null,
      input.shadowModel ?? null,
      Math.max(0, Math.min(100, Math.round(Number(input.shadowTrafficPercent ?? 0)))),
      input.description ?? null,
      new Date().toISOString(),
      input.sceneCode,
    ],
  );
}

export async function getWechatConnections(userId: number) {
  await ensureWechatEnvConnectionForUser(userId);
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
  async function withWechatDbRetry<T>(operation: () => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/database is locked/i.test(message) || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw new Error("微信连接读取失败");
  }

  const db = getDatabase();
  if (userId) {
    return withWechatDbRetry(async () => {
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
    });
  }
  return withWechatDbRetry(async () => {
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
  });
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
  async function withWechatDbRetry<T>(operation: () => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/database is locked/i.test(message) || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw new Error("微信公众号连接保存失败");
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  if (input.isDefault) {
    await withWechatDbRetry(() => db.exec("UPDATE wechat_connections SET is_default = ? WHERE user_id = ?", [false, input.userId]));
  }
  if (input.connectionId) {
    await withWechatDbRetry(() => db.exec(
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
    ));
    return;
  }

  await withWechatDbRetry(() => db.exec(
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
  ));
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
  async function withWechatDbRetry<T>(operation: () => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/database is locked/i.test(message) || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw new Error("微信公众号连接令牌更新失败");
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  await withWechatDbRetry(() => db.exec(
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
  ));
}

export async function createWechatSyncLog(input: {
  userId: number;
  articleId: number;
  wechatConnectionId: number;
  mediaId?: string | null;
  status: string;
  requestSummary?: unknown;
  responseSummary?: unknown;
  failureReason?: string | null;
  failureCode?: string | null;
  retryCount?: number;
  articleVersionHash?: string | null;
  templateId?: string | null;
  idempotencyKey?: string | null;
}) {
  async function withWechatDbRetry<T>(operation: () => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/database is locked/i.test(message) || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw new Error("微信发布日志写入失败");
  }

  await ensureExtendedProductSchema();
  const db = getDatabase();
  await withWechatDbRetry(() => db.exec(
    `INSERT INTO wechat_sync_logs (
      user_id, article_id, wechat_connection_id, media_id, status, request_summary, response_summary, failure_reason, failure_code, retry_count, article_version_hash, template_id, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.articleId,
      input.wechatConnectionId,
      input.mediaId ?? null,
      input.status,
      input.requestSummary ?? null,
      input.responseSummary ?? null,
      input.failureReason ?? null,
      input.failureCode ?? null,
      input.retryCount ?? 0,
      input.articleVersionHash ?? null,
      input.templateId ?? null,
      input.idempotencyKey ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  ));
}

export async function getWechatSyncLogs(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    article_id: number;
    title: string;
    connection_name: string | null;
    media_id: string | null;
    status: string;
    request_summary: string | Record<string, unknown> | null;
    response_summary: string | Record<string, unknown> | null;
    failure_reason: string | null;
    failure_code: string | null;
    retry_count: number;
    article_version_hash: string | null;
    template_id: string | null;
    idempotency_key: string | null;
    created_at: string;
  }>(
    `SELECT
       l.id,
       l.article_id AS article_id,
       d.title,
       c.account_name as connection_name,
       l.media_id,
       l.status,
       l.request_summary,
       l.response_summary,
       l.failure_reason,
       l.failure_code,
       l.retry_count,
       l.article_version_hash AS article_version_hash,
       l.template_id,
       l.idempotency_key,
       l.created_at
     FROM wechat_sync_logs l
     INNER JOIN articles d ON d.id = l.article_id
     LEFT JOIN wechat_connections c ON c.id = l.wechat_connection_id
     WHERE l.user_id = ?
     ORDER BY l.id DESC`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    articleId: row.article_id,
    title: row.title,
    connectionName: row.connection_name,
    mediaId: row.media_id,
    status: row.status,
    requestSummary: row.request_summary,
    responseSummary: row.response_summary,
    failureReason: row.failure_reason,
    failureCode: row.failure_code,
    retryCount: row.retry_count,
    articleVersionHash: row.article_version_hash,
    templateId: row.template_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  }));
}

export async function getLatestWechatSyncLogForArticle(input: {
  userId: number;
  articleId: number;
  wechatConnectionId?: number | null;
  articleVersionHash?: string | null;
}) {
  async function withWechatDbRetry<T>(operation: () => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/database is locked/i.test(message) || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw new Error("微信发布记录读取失败");
  }

  await ensureExtendedProductSchema();
  const db = getDatabase();
  const clauses = ["user_id = ?", "article_id = ?"];
  const params: unknown[] = [input.userId, input.articleId];
  if (input.wechatConnectionId != null) {
    clauses.push("wechat_connection_id = ?");
    params.push(input.wechatConnectionId);
  }
  if (input.articleVersionHash) {
    clauses.push("article_version_hash = ?");
    params.push(input.articleVersionHash);
  }
  return withWechatDbRetry(async () => {
    return db.queryOne<{
      id: number;
      media_id: string | null;
      status: string;
      failure_reason: string | null;
      failure_code: string | null;
      retry_count: number;
      article_version_hash: string | null;
      template_id: string | null;
      idempotency_key: string | null;
      created_at: string;
    }>(
      `SELECT id, media_id, status, failure_reason, failure_code, retry_count, article_version_hash, template_id, idempotency_key, created_at
       FROM wechat_sync_logs
       WHERE ${clauses.join(" AND ")}
       ORDER BY id DESC
       LIMIT 1`,
      params,
    );
  });
}

export async function getArticleOutcome(articleId: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<{
    id: number;
    article_id: number;
    user_id: number;
    target_package: string | null;
    scorecard_json: string | Record<string, unknown> | null;
    attribution_json: string | Record<string, unknown> | null;
    hit_status: string;
    review_summary: string | null;
    next_action: string | null;
    playbook_tags_json: string | string[] | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, article_id AS article_id, user_id, target_package, scorecard_json, attribution_json, hit_status, review_summary, next_action, playbook_tags_json, created_at, updated_at
     FROM article_outcomes
     WHERE article_id = ? AND user_id = ?
     LIMIT 1`,
    [articleId, userId],
  );
  return row ? mapArticleOutcome(row) : null;
}

export async function getArticleTopicAttribution(articleId: number, userId: number): Promise<ArticleTopicAttribution | null> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const backlogLinked = await db.queryOne<{
    topic_lead_id: number | null;
    source: string | null;
    fission_mode: string | null;
    source_track_label: string | null;
    predicted_flip_strength: number | null;
    backlog_id: number | null;
    backlog_name: string | null;
    backlog_item_id: number | null;
    batch_id: string | null;
  }>(
    `SELECT
       tbi.topic_lead_id,
       tl.source,
       tl.fission_mode,
       tl.source_track_label,
       tl.predicted_flip_strength,
       tbi.backlog_id,
       tb.name AS backlog_name,
       tbi.id AS backlog_item_id,
       tbi.generated_batch_id AS batch_id
     FROM topic_backlog_items tbi
     LEFT JOIN topic_backlogs tb
       ON tb.id = tbi.backlog_id
      AND tb.user_id = tbi.user_id
     LEFT JOIN topic_leads tl
       ON tl.id = tbi.topic_lead_id
      AND tl.user_id = tbi.user_id
     WHERE tbi.generated_article_id = ? AND tbi.user_id = ?
     ORDER BY tbi.updated_at DESC, tbi.id DESC
     LIMIT 1`,
    [articleId, userId],
  );
  if (backlogLinked) {
    return {
      topicLeadId: backlogLinked.topic_lead_id,
      source: backlogLinked.source,
      fissionMode: backlogLinked.fission_mode,
      sourceTrackLabel: backlogLinked.source_track_label,
      predictedFlipStrength:
        typeof backlogLinked.predicted_flip_strength === "number" && Number.isFinite(backlogLinked.predicted_flip_strength)
          ? Number(backlogLinked.predicted_flip_strength)
          : null,
      backlogId: backlogLinked.backlog_id,
      backlogName: backlogLinked.backlog_name,
      backlogItemId: backlogLinked.backlog_item_id,
      batchId: backlogLinked.batch_id,
    };
  }
  const directLead = await db.queryOne<{
    id: number;
    source: string | null;
    fission_mode: string | null;
    source_track_label: string | null;
    predicted_flip_strength: number | null;
  }>(
    `SELECT id, source, fission_mode, source_track_label, predicted_flip_strength
     FROM topic_leads
     WHERE adopted_article_id = ? AND user_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [articleId, userId],
  );
  if (!directLead) {
    return null;
  }
  return {
    topicLeadId: directLead.id,
    source: directLead.source,
    fissionMode: directLead.fission_mode,
    sourceTrackLabel: directLead.source_track_label,
    predictedFlipStrength:
      typeof directLead.predicted_flip_strength === "number" && Number.isFinite(directLead.predicted_flip_strength)
        ? Number(directLead.predicted_flip_strength)
        : null,
    backlogId: null,
    backlogName: null,
    backlogItemId: null,
    batchId: null,
  };
}

type ArticleStrategyCardRow = {
  id: number;
  article_id: number;
  user_id: number;
  archetype: string | null;
  mainstream_belief: string | null;
  target_reader: string | null;
  core_assertion: string | null;
  why_now: string | null;
  research_hypothesis: string | null;
  market_position_insight: string | null;
  historical_turning_point: string | null;
  target_package: string | null;
  publish_window: string | null;
  ending_action: string | null;
  first_hand_observation: string | null;
  felt_moment: string | null;
  why_this_hit_me: string | null;
  real_scene_or_dialogue: string | null;
  want_to_complain: string | null;
  non_delegable_truth: string | null;
  four_point_audit_json: string | Record<string, unknown> | null;
  strategy_locked_at: string | null;
  strategy_override: boolean | number | string | null;
  created_at: string;
  updated_at: string;
};

async function getArticleStrategyCardRow(articleId: number, userId: number) {
  const db = getDatabase();
  return db.queryOne<ArticleStrategyCardRow>(
    `SELECT id, article_id AS article_id, user_id, archetype, mainstream_belief, target_reader, core_assertion, why_now, research_hypothesis, market_position_insight, historical_turning_point, target_package, publish_window, ending_action,
            first_hand_observation, felt_moment, why_this_hit_me, real_scene_or_dialogue, want_to_complain, non_delegable_truth,
            four_point_audit_json, strategy_locked_at, strategy_override,
            created_at, updated_at
     FROM article_strategy_cards
     WHERE article_id = ? AND user_id = ?`,
    [articleId, userId],
  );
}

export async function getArticleStrategyCard(articleId: number, userId: number) {
  await ensureExtendedProductSchema();
  const row = await getArticleStrategyCardRow(articleId, userId);
  return row ? mapArticleStrategyCard(row) : null;
}

export async function getArticleEvidenceItems(articleId: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    article_id: number;
    user_id: number;
    fragment_id: number | null;
    node_id: number | null;
    claim: string | null;
    title: string;
    excerpt: string;
    source_type: string;
    source_url: string | null;
    screenshot_path: string | null;
    usage_mode: string | null;
    rationale: string | null;
    research_tag: string | null;
    hook_tags_json: string | string[] | null;
    hook_strength: number | null;
    hook_tagged_by: string | null;
    hook_tagged_at: string | null;
    evidence_role: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, article_id AS article_id, user_id, fragment_id, node_id, claim, title, excerpt, source_type, source_url, screenshot_path, usage_mode, rationale, research_tag, hook_tags_json, hook_strength, hook_tagged_by, hook_tagged_at, evidence_role, sort_order, created_at, updated_at
     FROM article_evidence_items
     WHERE article_id = ? AND user_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [articleId, userId],
  );
  return rows.map(mapArticleEvidenceItem);
}

export async function getArticleResearchCards(articleId: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [cardRows, sourceRows] = await Promise.all([
    db.query<{
      id: number;
      article_id: number;
      user_id: number;
      card_kind: string;
      title: string;
      summary: string | null;
      payload_json: string | Record<string, unknown> | null;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, article_id AS article_id, user_id, card_kind, title, summary, payload_json, sort_order, created_at, updated_at
       FROM article_research_cards
       WHERE article_id = ? AND user_id = ?
       ORDER BY CASE card_kind
         WHEN 'timeline' THEN 1
         WHEN 'comparison' THEN 2
         WHEN 'intersection' THEN 3
         ELSE 4
       END ASC, sort_order ASC, id ASC`,
      [articleId, userId],
    ),
    db.query<{
      id: number;
      research_card_id: number;
      label: string;
      source_type: string;
      detail: string | null;
      source_url: string | null;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT src.id, src.research_card_id, src.label, src.source_type, src.detail, src.source_url, src.sort_order, src.created_at, src.updated_at
       FROM article_research_card_sources src
       INNER JOIN article_research_cards card ON card.id = src.research_card_id
       WHERE card.article_id = ? AND card.user_id = ?
       ORDER BY src.sort_order ASC, src.id ASC`,
      [articleId, userId],
    ),
  ]);
  const sourceMap = new Map<number, ArticleResearchCardSource[]>();
  for (const sourceRow of sourceRows) {
    const source = mapArticleResearchCardSource(sourceRow);
    const current = sourceMap.get(source.researchCardId) ?? [];
    current.push(source);
    sourceMap.set(source.researchCardId, current);
  }
  return cardRows.map((row) => mapArticleResearchCard(row, sourceMap.get(row.id) ?? []));
}

export async function upsertArticleStrategyCard(input: {
  articleId: number;
  userId: number;
  archetype?: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
  mainstreamBelief?: string | null;
  targetReader?: string | null;
  coreAssertion?: string | null;
  whyNow?: string | null;
  researchHypothesis?: string | null;
  marketPositionInsight?: string | null;
  historicalTurningPoint?: string | null;
  targetPackage?: string | null;
  publishWindow?: string | null;
  endingAction?: string | null;
  firstHandObservation?: string | null;
  feltMoment?: string | null;
  whyThisHitMe?: string | null;
  realSceneOrDialogue?: string | null;
  wantToComplain?: string | null;
  nonDelegableTruth?: string | null;
  fourPointAudit?: Record<string, unknown> | null;
  strategyLockedAt?: string | null;
  strategyOverride?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const current = await getArticleStrategyCardRow(input.articleId, input.userId);
  const now = new Date().toISOString();
  const nextRow: ArticleStrategyCardRow = {
    id: current?.id ?? 0,
    article_id: input.articleId,
    user_id: input.userId,
    archetype: input.archetype !== undefined ? input.archetype : current?.archetype ?? null,
    mainstream_belief: input.mainstreamBelief !== undefined ? input.mainstreamBelief : current?.mainstream_belief ?? null,
    target_reader: input.targetReader !== undefined ? input.targetReader : current?.target_reader ?? null,
    core_assertion: input.coreAssertion !== undefined ? input.coreAssertion : current?.core_assertion ?? null,
    why_now: input.whyNow !== undefined ? input.whyNow : current?.why_now ?? null,
    research_hypothesis:
      input.researchHypothesis !== undefined ? input.researchHypothesis : current?.research_hypothesis ?? null,
    market_position_insight:
      input.marketPositionInsight !== undefined ? input.marketPositionInsight : current?.market_position_insight ?? null,
    historical_turning_point:
      input.historicalTurningPoint !== undefined ? input.historicalTurningPoint : current?.historical_turning_point ?? null,
    target_package: input.targetPackage !== undefined ? input.targetPackage : current?.target_package ?? null,
    publish_window: input.publishWindow !== undefined ? input.publishWindow : current?.publish_window ?? null,
    ending_action: input.endingAction !== undefined ? input.endingAction : current?.ending_action ?? null,
    first_hand_observation:
      input.firstHandObservation !== undefined ? input.firstHandObservation : current?.first_hand_observation ?? null,
    felt_moment: input.feltMoment !== undefined ? input.feltMoment : current?.felt_moment ?? null,
    why_this_hit_me: input.whyThisHitMe !== undefined ? input.whyThisHitMe : current?.why_this_hit_me ?? null,
    real_scene_or_dialogue:
      input.realSceneOrDialogue !== undefined ? input.realSceneOrDialogue : current?.real_scene_or_dialogue ?? null,
    want_to_complain: input.wantToComplain !== undefined ? input.wantToComplain : current?.want_to_complain ?? null,
    non_delegable_truth:
      input.nonDelegableTruth !== undefined ? input.nonDelegableTruth : current?.non_delegable_truth ?? null,
    four_point_audit_json:
      input.fourPointAudit !== undefined ? JSON.stringify(input.fourPointAudit ?? null) : current?.four_point_audit_json ?? null,
    strategy_locked_at:
      input.strategyLockedAt !== undefined ? input.strategyLockedAt : current?.strategy_locked_at ?? null,
    strategy_override: input.strategyOverride !== undefined ? (input.strategyOverride ? 1 : 0) : current?.strategy_override ?? 0,
    created_at: current?.created_at ?? now,
    updated_at: now,
  };

  if (current) {
    await db.exec(
      `UPDATE article_strategy_cards
       SET archetype = ?, mainstream_belief = ?, target_reader = ?, core_assertion = ?, why_now = ?, research_hypothesis = ?, market_position_insight = ?, historical_turning_point = ?,
           target_package = ?, publish_window = ?, ending_action = ?,
           first_hand_observation = ?, felt_moment = ?, why_this_hit_me = ?, real_scene_or_dialogue = ?, want_to_complain = ?, non_delegable_truth = ?,
           four_point_audit_json = ?, strategy_locked_at = ?, strategy_override = ?,
           updated_at = ?
       WHERE id = ? AND article_id = ? AND user_id = ?`,
      [
        nextRow.archetype,
        nextRow.mainstream_belief,
        nextRow.target_reader,
        nextRow.core_assertion,
        nextRow.why_now,
        nextRow.research_hypothesis,
        nextRow.market_position_insight,
        nextRow.historical_turning_point,
        nextRow.target_package,
        nextRow.publish_window,
        nextRow.ending_action,
        nextRow.first_hand_observation,
        nextRow.felt_moment,
        nextRow.why_this_hit_me,
        nextRow.real_scene_or_dialogue,
        nextRow.want_to_complain,
        nextRow.non_delegable_truth,
        nextRow.four_point_audit_json,
        nextRow.strategy_locked_at,
        nextRow.strategy_override,
        nextRow.updated_at,
        current.id,
        input.articleId,
        input.userId,
      ],
    );
    nextRow.id = current.id;
  } else {
    const result = await db.exec(
      `INSERT INTO article_strategy_cards (
        article_id, user_id, archetype, mainstream_belief, target_reader, core_assertion, why_now, research_hypothesis, market_position_insight, historical_turning_point,
        target_package, publish_window, ending_action, first_hand_observation, felt_moment, why_this_hit_me, real_scene_or_dialogue, want_to_complain, non_delegable_truth,
        four_point_audit_json, strategy_locked_at, strategy_override, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.articleId,
        input.userId,
        nextRow.archetype,
        nextRow.mainstream_belief,
        nextRow.target_reader,
        nextRow.core_assertion,
        nextRow.why_now,
        nextRow.research_hypothesis,
        nextRow.market_position_insight,
        nextRow.historical_turning_point,
        nextRow.target_package,
        nextRow.publish_window,
        nextRow.ending_action,
        nextRow.first_hand_observation,
        nextRow.felt_moment,
        nextRow.why_this_hit_me,
        nextRow.real_scene_or_dialogue,
        nextRow.want_to_complain,
        nextRow.non_delegable_truth,
        nextRow.four_point_audit_json,
        nextRow.strategy_locked_at,
        nextRow.strategy_override,
        nextRow.created_at,
        nextRow.updated_at,
      ],
    );
    nextRow.id = Number(result.lastInsertRowid!);
  }

  return mapArticleStrategyCard(nextRow);
}

export async function replaceArticleEvidenceItems(input: {
  articleId: number;
  userId: number;
  items: Array<{
    fragmentId?: number | null;
    nodeId?: number | null;
    claim?: string | null;
    title: string;
    excerpt: string;
    sourceType?: string | null;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string | null;
    rationale?: string | null;
    researchTag?: string | null;
    hookTags?: string[];
    hookStrength?: number | null;
    hookTaggedBy?: string | null;
    hookTaggedAt?: string | null;
    evidenceRole?: string | null;
  }>;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("DELETE FROM article_evidence_items WHERE article_id = ? AND user_id = ?", [input.articleId, input.userId]);
  for (const [index, item] of input.items.entries()) {
    const normalizedHookTags = Array.isArray(item.hookTags)
      ? item.hookTags
          .map((tag) => normalizeEvidenceHookTag(tag))
          .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
          .slice(0, 4)
      : [];
    const hasExplicitHookMetadata = normalizedHookTags.length > 0 || (typeof item.hookStrength === "number" && Number.isFinite(item.hookStrength));
    const taggedItem = hasExplicitHookMetadata
      ? {
          hookTags: normalizedHookTags,
          hookStrength:
            typeof item.hookStrength === "number" && Number.isFinite(item.hookStrength)
              ? item.hookStrength
              : inferEvidenceHookStrength({
                  title: item.title,
                  excerpt: item.excerpt,
                  claim: item.claim,
                  rationale: item.rationale,
                  sourceUrl: item.sourceUrl,
                  hookTags: normalizedHookTags,
                }),
          hookTaggedBy: item.hookTaggedBy ?? (normalizedHookTags.length > 0 ? "author" : "ai"),
          hookTaggedAt: item.hookTaggedAt ?? now,
        }
      : tagEvidenceItemHooks({
          title: item.title,
          excerpt: item.excerpt,
          claim: item.claim ?? null,
          rationale: item.rationale ?? null,
          sourceUrl: item.sourceUrl ?? null,
        }, "ai");
    await db.exec(
      `INSERT INTO article_evidence_items (
        article_id, user_id, fragment_id, node_id, claim, title, excerpt, source_type, source_url, screenshot_path, usage_mode, rationale, research_tag, hook_tags_json, hook_strength, hook_tagged_by, hook_tagged_at, evidence_role, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.articleId,
        input.userId,
        item.fragmentId ?? null,
        item.nodeId ?? null,
        item.claim ?? null,
        item.title,
        item.excerpt,
        item.sourceType ?? "manual",
        item.sourceUrl ?? null,
        item.screenshotPath ?? null,
        item.usageMode ?? null,
        item.rationale ?? null,
        item.researchTag ?? null,
        JSON.stringify(taggedItem.hookTags),
        taggedItem.hookStrength,
        taggedItem.hookTaggedBy,
        taggedItem.hookTaggedAt,
        item.evidenceRole ?? "supportingEvidence",
        index + 1,
        now,
        now,
      ],
    );
  }
  return getArticleEvidenceItems(input.articleId, input.userId);
}

export async function replaceArticleResearchCards(input: {
  articleId: number;
  userId: number;
  cards: Array<{
    cardKind: ArticleResearchCardKind;
    title: string;
    summary?: string | null;
    payload?: Record<string, unknown> | null;
    sortOrder?: number | null;
    sources?: Array<{
      label: string;
      sourceType?: string | null;
      detail?: string | null;
      sourceUrl?: string | null;
      sortOrder?: number | null;
    }>;
  }>;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `DELETE FROM article_research_card_sources
     WHERE research_card_id IN (
       SELECT id FROM article_research_cards WHERE article_id = ? AND user_id = ?
     )`,
    [input.articleId, input.userId],
  );
  await db.exec("DELETE FROM article_research_cards WHERE article_id = ? AND user_id = ?", [input.articleId, input.userId]);
  for (const [cardIndex, card] of input.cards.entries()) {
    const cardKind = normalizeArticleResearchCardKind(card.cardKind);
    const title = String(card.title || "").trim();
    const summary = String(card.summary || "").trim() || null;
    if (!title) {
      continue;
    }
    const sortOrder = Number(card.sortOrder || 0) > 0 ? Number(card.sortOrder) : cardIndex + 1;
    await db.exec(
      `INSERT INTO article_research_cards (
        article_id, user_id, card_kind, title, summary, payload_json, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.articleId,
        input.userId,
        cardKind,
        title,
        summary,
        JSON.stringify(card.payload ?? {}),
        sortOrder,
        now,
        now,
      ],
    );
    const savedCard = await db.queryOne<{ id: number }>(
      `SELECT id
       FROM article_research_cards
       WHERE article_id = ? AND user_id = ? AND card_kind = ? AND sort_order = ?`,
      [input.articleId, input.userId, cardKind, sortOrder],
    );
    if (!savedCard) {
      continue;
    }
    const normalizedSources = Array.isArray(card.sources) ? card.sources : [];
    for (const [sourceIndex, source] of normalizedSources.entries()) {
      const label = String(source.label || "").trim();
      if (!label) {
        continue;
      }
      const sourceSortOrder = Number(source.sortOrder || 0) > 0 ? Number(source.sortOrder) : sourceIndex + 1;
      await db.exec(
        `INSERT INTO article_research_card_sources (
          research_card_id, label, source_type, detail, source_url, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          savedCard.id,
          label,
          String(source.sourceType || "").trim() || "manual",
          String(source.detail || "").trim() || null,
          String(source.sourceUrl || "").trim() || null,
          sourceSortOrder,
          now,
          now,
        ],
      );
    }
  }
  return getArticleResearchCards(input.articleId, input.userId);
}

export async function getArticleOutcomeSnapshots(articleId: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    outcome_id: number;
    article_id: number;
    user_id: number;
    window_code: string;
    read_count: number;
    share_count: number;
    like_count: number;
    notes: string | null;
    writing_state_feedback_json: string | Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, outcome_id, article_id AS article_id, user_id, window_code, read_count, share_count, like_count, notes, writing_state_feedback_json, created_at, updated_at
     FROM article_outcome_snapshots
     WHERE article_id = ? AND user_id = ?
     ORDER BY CASE window_code WHEN '24h' THEN 1 WHEN '72h' THEN 2 WHEN '7d' THEN 3 ELSE 4 END, id ASC`,
    [articleId, userId],
  );
  return rows.map(mapArticleOutcomeSnapshot);
}

export async function getArticleOutcomeBundle(articleId: number, userId: number): Promise<ArticleOutcomeBundle> {
  const [outcome, snapshots] = await Promise.all([
    getArticleOutcome(articleId, userId),
    getArticleOutcomeSnapshots(articleId, userId),
  ]);
  const completedWindowCodes = Array.from(new Set(snapshots.map((snapshot) => snapshot.windowCode)));
  const missingWindowCodes = (["24h", "72h", "7d"] as const).filter((windowCode) => !completedWindowCodes.includes(windowCode));
  return {
    outcome,
    snapshots,
    completedWindowCodes,
    missingWindowCodes,
    nextWindowCode: missingWindowCodes[0] ?? null,
  };
}

async function ensureArticleOutcomeId(input: {
  articleId: number;
  userId: number;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO article_outcomes (article_id, user_id, scorecard_json, attribution_json, hit_status, playbook_tags_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(article_id) DO NOTHING`,
    [input.articleId, input.userId, JSON.stringify({}), null, "pending", JSON.stringify([]), now, now],
  );
  const outcome = await db.queryOne<{ id: number }>(
    "SELECT id FROM article_outcomes WHERE article_id = ? AND user_id = ?",
    [input.articleId, input.userId],
  );
  if (!outcome) {
    throw new Error("结果记录创建失败");
  }
  return outcome.id;
}

export async function upsertArticleOutcome(input: {
  articleId: number;
  userId: number;
  targetPackage?: string | null;
  scorecard?: Record<string, unknown>;
  attribution?: Record<string, unknown> | null;
  hitStatus?: "pending" | "hit" | "near_miss" | "miss";
  reviewSummary?: string | null;
  nextAction?: string | null;
  playbookTags?: string[];
}) {
  const outcomeId = await ensureArticleOutcomeId({ articleId: input.articleId, userId: input.userId });
  const db = getDatabase();
  const current = await getArticleOutcome(input.articleId, input.userId);
  const now = new Date().toISOString();
  const nextScorecard = input.scorecard !== undefined ? input.scorecard : current?.scorecard ?? {};
  const nextAttribution = input.attribution !== undefined ? input.attribution : current?.attribution ?? null;
  const nextPlaybookTags = input.playbookTags !== undefined ? input.playbookTags : current?.playbookTags ?? [];
  await db.exec(
    `UPDATE article_outcomes
     SET target_package = ?, scorecard_json = ?, attribution_json = ?, hit_status = ?, review_summary = ?, next_action = ?, playbook_tags_json = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      input.targetPackage !== undefined ? input.targetPackage : current?.targetPackage ?? null,
      JSON.stringify(nextScorecard),
      nextAttribution ? JSON.stringify(nextAttribution) : null,
      input.hitStatus ?? current?.hitStatus ?? "pending",
      input.reviewSummary !== undefined ? input.reviewSummary : current?.reviewSummary ?? null,
      input.nextAction !== undefined ? input.nextAction : current?.nextAction ?? null,
      JSON.stringify(nextPlaybookTags),
      now,
      outcomeId,
      input.userId,
    ],
  );
  const updated = await getArticleOutcome(input.articleId, input.userId);
  if (!updated) {
    throw new Error("结果记录更新失败");
  }
  return updated;
}

export async function upsertArticleOutcomeSnapshot(input: {
  articleId: number;
  userId: number;
  windowCode: "24h" | "72h" | "7d";
  readCount?: number;
  shareCount?: number;
  likeCount?: number;
  notes?: string | null;
  writingStateFeedback?: Record<string, unknown> | null;
}) {
  const outcomeId = await ensureArticleOutcomeId({ articleId: input.articleId, userId: input.userId });
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO article_outcome_snapshots (
      outcome_id, article_id, user_id, window_code, read_count, share_count, like_count, notes, writing_state_feedback_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(article_id, window_code) DO UPDATE SET
      outcome_id = excluded.outcome_id,
      user_id = excluded.user_id,
      read_count = excluded.read_count,
      share_count = excluded.share_count,
      like_count = excluded.like_count,
      notes = excluded.notes,
      writing_state_feedback_json = excluded.writing_state_feedback_json,
      updated_at = excluded.updated_at`,
    [
      outcomeId,
      input.articleId,
      input.userId,
      input.windowCode,
      normalizeNonNegativeInteger(input.readCount),
      normalizeNonNegativeInteger(input.shareCount),
      normalizeNonNegativeInteger(input.likeCount),
      input.notes ?? null,
      input.writingStateFeedback ? JSON.stringify(input.writingStateFeedback) : null,
      now,
      now,
    ],
  );
  const snapshot = await db.queryOne<{
    id: number;
    outcome_id: number;
    article_id: number;
    user_id: number;
    window_code: string;
    read_count: number;
    share_count: number;
    like_count: number;
    notes: string | null;
    writing_state_feedback_json: string | Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, outcome_id, article_id AS article_id, user_id, window_code, read_count, share_count, like_count, notes, writing_state_feedback_json, created_at, updated_at
     FROM article_outcome_snapshots
     WHERE article_id = ? AND user_id = ? AND window_code = ?
     LIMIT 1`,
    [input.articleId, input.userId, input.windowCode],
  );
  if (!snapshot) {
    throw new Error("结果快照保存失败");
  }
  return mapArticleOutcomeSnapshot(snapshot);
}

export async function getArticleOutcomeBundlesByUser(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const outcomes = await db.query<{
    id: number;
    article_id: number;
    user_id: number;
    target_package: string | null;
    scorecard_json: string | Record<string, unknown> | null;
    attribution_json: string | Record<string, unknown> | null;
    hit_status: string;
    review_summary: string | null;
    next_action: string | null;
    playbook_tags_json: string | string[] | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, article_id AS article_id, user_id, target_package, scorecard_json, attribution_json, hit_status, review_summary, next_action, playbook_tags_json, created_at, updated_at
     FROM article_outcomes
     WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [userId],
  );
  const snapshots = await db.query<{
    id: number;
    outcome_id: number;
    article_id: number;
    user_id: number;
    window_code: string;
    read_count: number;
    share_count: number;
    like_count: number;
    notes: string | null;
    writing_state_feedback_json: string | Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, outcome_id, article_id AS article_id, user_id, window_code, read_count, share_count, like_count, notes, writing_state_feedback_json, created_at, updated_at
     FROM article_outcome_snapshots
     WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [userId],
  );
  const snapshotsByDocument = new Map<number, ArticleOutcomeSnapshot[]>();
  for (const snapshot of snapshots.map(mapArticleOutcomeSnapshot)) {
    const existing = snapshotsByDocument.get(snapshot.articleId) ?? [];
    existing.push(snapshot);
    snapshotsByDocument.set(snapshot.articleId, existing);
  }
  return outcomes.map((row) => {
    const outcome = mapArticleOutcome(row);
    const articleSnapshots = (snapshotsByDocument.get(outcome.articleId) ?? []).sort((left, right) => {
      const rank = { "24h": 1, "72h": 2, "7d": 3 } as const;
      return rank[left.windowCode] - rank[right.windowCode];
    });
    const completedWindowCodes = Array.from(new Set(articleSnapshots.map((snapshot) => snapshot.windowCode)));
    const missingWindowCodes = (["24h", "72h", "7d"] as const).filter((windowCode) => !completedWindowCodes.includes(windowCode));
    return {
      outcome,
      snapshots: articleSnapshots,
      completedWindowCodes,
      missingWindowCodes,
      nextWindowCode: missingWindowCodes[0] ?? null,
    } satisfies ArticleOutcomeBundle;
  });
}

export async function getAuthorPlaybooks(userId: number, limit = 6): Promise<AuthorPlaybookItem[]> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    article_id: number;
    title: string;
    target_package: string | null;
    hit_status: string;
    playbook_tags_json: string | string[] | null;
    updated_at: string;
  }>(
    `SELECT ao.article_id AS article_id, d.title, ao.target_package, ao.hit_status, ao.playbook_tags_json, ao.updated_at
     FROM article_outcomes ao
     INNER JOIN articles d ON d.id = ao.article_id
     WHERE ao.user_id = ?
     ORDER BY ao.updated_at DESC, ao.id DESC`,
    [userId],
  );
  const aggregated = new Map<string, AuthorPlaybookItem & { articleIds: Set<number> }>();
  for (const row of rows) {
    const labels = parseJsonStringArray(row.playbook_tags_json);
    const normalizedLabels = labels.length > 0
      ? labels
      : row.target_package
        ? [`目标包：${row.target_package}`]
        : [];
    for (const label of normalizedLabels) {
      const existing = aggregated.get(label) ?? {
        label,
        hitCount: 0,
        nearMissCount: 0,
        articleCount: 0,
        latestArticleTitle: null,
        updatedAt: row.updated_at,
        articleIds: new Set<number>(),
      };
      if (!existing.articleIds.has(row.article_id)) {
        existing.articleIds.add(row.article_id);
        existing.articleCount += 1;
      }
      if (row.hit_status === "hit") {
        existing.hitCount += 1;
      } else if (row.hit_status === "near_miss") {
        existing.nearMissCount += 1;
      }
      if (!existing.latestArticleTitle) {
        existing.latestArticleTitle = row.title;
      }
      if (row.updated_at > existing.updatedAt) {
        existing.updatedAt = row.updated_at;
      }
      aggregated.set(label, existing);
    }
  }
  return Array.from(aggregated.values())
    .sort((left, right) => {
      if (right.hitCount !== left.hitCount) return right.hitCount - left.hitCount;
      if (right.articleCount !== left.articleCount) return right.articleCount - left.articleCount;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit)
    .map(({ articleIds: _, ...item }) => item);
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
    articles,
    fragments,
    personas,
    series,
    writingStyleProfiles,
    knowledgeCards,
    activeKnowledgeCards,
    conflictedKnowledgeCards,
    ownedLayoutStrategies,
    customTemplates,
    coverImages,
    imagePrompts,
    customTopicSources,
    wechatConnections,
  ] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM articles WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM personas WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM series WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM writing_style_profiles WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ? AND status = ?", [userId, "active"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ? AND status = ?", [userId, "conflicted"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM layout_strategies WHERE owner_user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM layout_templates WHERE owner_user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM cover_images WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM article_image_prompts WHERE user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM topic_sources WHERE owner_user_id = ?", [userId]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_connections WHERE user_id = ?", [userId]),
  ]);

  return {
    articlesCount: articles?.count ?? 0,
    fragmentsCount: fragments?.count ?? 0,
    personasCount: personas?.count ?? 0,
    seriesCount: series?.count ?? 0,
    writingStyleProfilesCount: writingStyleProfiles?.count ?? 0,
    knowledgeCardsCount: knowledgeCards?.count ?? 0,
    activeKnowledgeCardsCount: activeKnowledgeCards?.count ?? 0,
    conflictedKnowledgeCardsCount: conflictedKnowledgeCards?.count ?? 0,
    ownedLayoutStrategiesCount: ownedLayoutStrategies?.count ?? 0,
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
