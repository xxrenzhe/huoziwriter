import { getAuthorPersonas } from "./author-personas";
import { getDatabase } from "./db";
import { getUserPlanContext } from "./plan-access";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getVisibleTopicEvents } from "./topic-radar";

type RawTopicItem = {
  id: number;
  owner_user_id: number | null;
  source_name: string | null;
  source_type: string | null;
  source_priority: number | null;
  title: string;
  summary: string | null;
  emotion_labels_json: string | string[] | null;
  angle_options_json: string | string[] | null;
  source_url: string | null;
  source_names_json?: string | string[] | null;
  source_urls_json?: string | string[] | null;
  published_at: string | null;
  item_count?: number | null;
};

type PersonaLite = {
  id: number;
  name: string;
  identityTags: string[];
  writingStyleTags: string[];
  isDefault: boolean;
};

type TopicRecommendationRow = {
  id: number;
  user_id: number;
  recommendation_date: string;
  rank_index: number;
  topic_dedup_key: string;
  source_topic_id: number | null;
  source_owner_user_id: number | null;
  source_name: string;
  source_type: string;
  source_priority: number;
  title: string;
  summary: string | null;
  emotion_labels_json: string | string[] | null;
  angle_options_json: string | string[] | null;
  source_url: string | null;
  related_source_names_json: string | string[] | null;
  related_source_urls_json: string | string[] | null;
  published_at: string | null;
  recommendation_type: TopicRecommendationType;
  recommendation_reason: string;
  matched_persona_id: number | null;
  matched_persona_name: string | null;
  freshness_score: number | null;
  relevance_score: number | null;
  priority_score: number | null;
};

export type TopicRecommendationType = "hot" | "persona" | "hybrid";

export type RankedTopicRecommendation = {
  id: number;
  ownerUserId: number | null;
  sourceName: string;
  sourceType: string;
  sourcePriority: number;
  title: string;
  summary: string | null;
  emotionLabels: string[];
  angleOptions: string[];
  sourceUrl: string | null;
  relatedSourceNames: string[];
  relatedSourceUrls: string[];
  publishedAt: string | null;
  recommendationType: TopicRecommendationType;
  recommendationReason: string;
  matchedPersonaId: number | null;
  matchedPersonaName: string | null;
  freshnessScore: number;
  relevanceScore: number;
  priorityScore: number;
};

const DAILY_RECOMMENDATION_LIMIT = 10;

const SOURCE_TYPE_PRIORITY_BOOST: Record<string, number> = {
  youtube: 24,
  reddit: 22,
  x: 20,
  podcast: 18,
  spotify: 16,
  news: 12,
  rss: 10,
  blog: 8,
};

const PERSONA_IDENTITY_KEYWORDS: Record<string, string[]> = {
  程序员: ["程序员", "开发", "工程师", "代码", "开源", "GitHub", "软件", "模型", "Agent"],
  独立开发者: ["独立开发", "出海", "SaaS", "Agent", "模型", "工具", "开源", "订阅", "增长"],
  "AI 产品经理": ["AI", "模型", "Agent", "工作流", "产品", "大模型", "应用", "SaaS"],
  产品运营: ["增长", "留存", "转化", "运营", "流量", "平台", "分发", "用户"],
  自媒体编辑: ["内容", "流量", "平台", "账号", "公众号", "短视频", "小红书", "选题"],
  科技记者: ["科技", "大厂", "模型", "芯片", "平台", "发布会", "行业", "产品"],
  创业者: ["创业", "融资", "估值", "增长", "市场", "战略", "组织", "商业"],
  商业顾问: ["战略", "管理", "组织", "商业", "行业", "咨询", "案例", "转型"],
  投资人: ["融资", "估值", "IPO", "并购", "资本", "赛道", "增长", "利润"],
  职场教练: ["职场", "裁员", "升职", "管理", "绩效", "团队", "组织", "职业"],
  教育从业者: ["教育", "课程", "学习", "培训", "认知", "学校", "老师"],
  电商操盘手: ["电商", "平台", "GMV", "投流", "转化", "直播", "供应链", "品牌"],
};

const PERSONA_STYLE_KEYWORDS: Record<string, string[]> = {
  科普文: ["原理", "解释", "为什么", "趋势", "如何", "方法"],
  故事文: ["故事", "人物", "经历", "起伏", "回忆"],
  专业论文: ["研究", "数据", "报告", "实验", "论文"],
  经验分享: ["复盘", "踩坑", "经验", "实操", "总结"],
  幽默段子: ["吐槽", "离谱", "荒诞", "热梗"],
  社论评论: ["评论", "判断", "争议", "监管", "舆论"],
  采访纪实: ["采访", "对话", "纪实", "现场"],
  案例拆解: ["案例", "拆解", "打法", "路径"],
  清单攻略: ["清单", "步骤", "攻略", "指南"],
  复盘笔记: ["复盘", "教训", "得失", "记录"],
};

const PERSONA_LONG_TERM_THEMES: Record<string, string[]> = {
  程序员: ["AI 编程工作流", "代码质量与交付效率", "工具链升级", "开源生态变化"],
  独立开发者: ["一人公司增长", "订阅产品续费", "Agent 产品落地", "出海获客路径"],
  "AI 产品经理": ["模型能力边界", "Agent 工作流设计", "AI 产品 PMF", "模型成本与体验平衡"],
  产品运营: ["内容分发效率", "用户留存与复购", "增长实验设计", "平台规则变化"],
  自媒体编辑: ["选题方法论", "平台流量波动", "内容工业化风险", "爆款与品牌平衡"],
  科技记者: ["技术叙事失真", "大厂产品发布", "行业转折信号", "芯片与模型竞争"],
  创业者: ["组织提效", "现金流安全", "赛道判断", "新技术带来的结构机会"],
  商业顾问: ["行业案例拆解", "组织转型", "战略失效与重建", "商业模式更新"],
  投资人: ["赛道景气度", "估值逻辑变化", "并购整合", "产业链重新分配"],
  职场教练: ["职业安全感", "绩效与管理", "岗位迁移", "AI 对岗位结构的影响"],
  教育从业者: ["学习方式变化", "课程产品化", "教育技术工具", "认知训练方法"],
  电商操盘手: ["投流效率", "平台竞争格局", "供应链压力", "品牌转化系统"],
};

const PERSONA_STYLE_FRAMES: Record<string, string[]> = {
  科普文: ["为什么它正在成为长期变量", "它真正改变的不是表面动作，而是底层逻辑"],
  故事文: ["从一个真实场景切进去，看到结构性变化", "这不是个例，而是一类人的共同处境"],
  专业论文: ["用案例、数据和边界条件重新定义这个问题", "先拆变量，再给判断，不先喊结论"],
  经验分享: ["把这件事写成可执行的方法和复盘", "与其复述趋势，不如拆成可操作步骤"],
  幽默段子: ["如果用冷幽默写这件事，最荒诞的点在哪", "表面像梗，实质是行业症状"],
  社论评论: ["别只看结论，要看谁在从中获益", "把热闹剥掉后，真正值得评论的是什么"],
  采访纪实: ["去写现场，而不是只写观点", "让角色冲突把问题自己说出来"],
  案例拆解: ["选一个具体样本，把打法与代价都拆开", "从案例里还原决策路径而不是抄结论"],
  清单攻略: ["把复杂问题整理成一份读者能执行的清单", "把判断变成步骤和检查项"],
  复盘笔记: ["这件事最值得复盘的不是结果，而是判断过程", "把得失和误判都写清楚，比站队更重要"],
};

function parseJsonArray(value: string | string[] | null | undefined) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  try {
    return (JSON.parse(value) as string[]).map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function tokenize(value: string) {
  const matches = value.toLowerCase().match(/[\u4e00-\u9fa5]{1,}|[a-z0-9]{2,}/g) ?? [];
  return Array.from(new Set(matches));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function getShanghaiRecommendationDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function getDaysAgoRecommendationDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return getShanghaiRecommendationDate(date);
}

export function getTopicRadarVisibleLimit(planCode: "free" | "pro" | "ultra") {
  if (planCode === "pro") return 5;
  if (planCode === "ultra") return DAILY_RECOMMENDATION_LIMIT;
  return 1;
}

function scoreTopicForPersona(topic: RawTopicItem, persona: PersonaLite) {
  const haystack = `${topic.title} ${topic.summary ?? ""}`;
  const tokens = tokenize(haystack);
  let score = 0;
  const reasons: string[] = [];

  for (const tag of persona.identityTags) {
    if (haystack.includes(tag)) {
      score += 6;
      reasons.push(`标题直接命中「${tag}」`);
      continue;
    }
    for (const keyword of PERSONA_IDENTITY_KEYWORDS[tag] ?? []) {
      if (tokens.some((token) => token.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(token))) {
        score += 3;
        reasons.push(`包含 ${keyword} 相关议题`);
        break;
      }
    }
  }

  for (const tag of persona.writingStyleTags) {
    for (const keyword of PERSONA_STYLE_KEYWORDS[tag] ?? []) {
      if (tokens.some((token) => token.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(token))) {
        score += 1;
        reasons.push(`适合用${tag}展开`);
        break;
      }
    }
  }

  return {
    score,
    reason: reasons.length > 0 ? Array.from(new Set(reasons)).slice(0, 2).join("，") : null,
  };
}

function normalizeSourceType(value: string | null | undefined) {
  const normalized = String(value || "news").trim().toLowerCase();
  if (normalized in SOURCE_TYPE_PRIORITY_BOOST) {
    return normalized;
  }
  return "news";
}

function normalizeSourcePriority(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) {
    return 100;
  }
  return Math.max(0, Math.min(999, Number(value)));
}

function computeFreshnessScore(publishedAt: string | null | undefined) {
  if (!publishedAt) {
    return 36;
  }
  const diffHours = Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
  if (!Number.isFinite(diffHours)) {
    return 36;
  }
  return clampScore(100 - diffHours * 4);
}

function buildPersonaTopicId(personaId: number, index: number) {
  return -1 * (personaId * 100 + index + 1);
}

function buildPersonaLongTermRecommendations(personas: PersonaLite[]) {
  const orderedPersonas = [...personas].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id);
  const recommendations: RankedTopicRecommendation[] = [];

  for (const persona of orderedPersonas) {
    const identityThemePool = Array.from(new Set(persona.identityTags.flatMap((tag) => PERSONA_LONG_TERM_THEMES[tag] ?? [])));
    const styleFramePool = Array.from(new Set(persona.writingStyleTags.flatMap((tag) => PERSONA_STYLE_FRAMES[tag] ?? [])));
    const fallbackThemes = identityThemePool.length > 0 ? identityThemePool : ["长期行业观察", "方法论更新", "判断坐标变化"];
    const fallbackFrames = styleFramePool.length > 0 ? styleFramePool : ["把这个主题写成一篇长期有效的判断", "不要追新闻，要追结构变化"];

    fallbackThemes.slice(0, 3).forEach((theme, index) => {
      const frame = fallbackFrames[index % fallbackFrames.length] || fallbackFrames[0];
      const identityLead = persona.identityTags[0] || "内容创作者";
      const styleLead = persona.writingStyleTags[0] || "经验分享";
      const relevanceScore = clampScore(92 - index * 4 + (persona.isDefault ? 4 : 0));
      const freshnessScore = 35;
      const priorityScore = clampScore(relevanceScore * 0.7 + freshnessScore * 0.3);
      const title =
        index % 2 === 0
          ? `${theme}，${identityLead} 现在最值得长期跟踪的一个判断`
          : `${identityLead} 视角下，${theme} 为什么值得写成一篇${styleLead}`;
      const summary = `这不是即时新闻，而是更适合「${persona.name}」长期追踪的主题：围绕 ${theme}，从${frame.replace(/^把|^如果用|^去写|^让|^选一个|^从|^这件事/, "").trim() || "结构变化"}切入。`;
      const angleOptions = [
        `别从热点出发，直接回答：对「${identityLead}」来说，${theme} 现在最大的判断变化是什么？`,
        `把「${theme}」写成一篇${styleLead}，重点不是概念解释，而是读者下一步该怎么判断。`,
        `围绕 ${theme} 找一个具体样本或场景，把抽象趋势改写成可复述的现实处境。`,
      ];

      recommendations.push({
        id: buildPersonaTopicId(persona.id, index),
        ownerUserId: null,
        sourceName: "人设长期主题",
        sourceType: "blog",
        sourcePriority: 88 - index,
        title,
        summary,
        emotionLabels: ["长期价值", "人设方向", "结构判断"],
        angleOptions,
        sourceUrl: null,
        relatedSourceNames: ["人设长期主题"],
        relatedSourceUrls: [],
        publishedAt: null,
        recommendationType: "persona",
        recommendationReason: `这条不是新闻型热点，而是基于「${persona.name}」主动生成的长期选题。身份标签更偏向 ${persona.identityTags.join(" / ") || "内容创作"}，表达方式更适合 ${persona.writingStyleTags.join(" / ") || "经验分享"}。`,
        matchedPersonaId: persona.id,
        matchedPersonaName: persona.name,
        freshnessScore,
        relevanceScore,
        priorityScore,
      });
    });
  }

  return recommendations;
}

function normalizeTopicTitleForDedup(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/^[\[【(（].*?[\]】)）]\s*/g, "")
    .replace(/^(快讯|独家|深度|观察|解读|播客|podcast|breaking|update)[:：\s-]*/i, "")
    .replace(/\s+/g, "")
    .replace(/[|｜:：,，。.、!！?？"'“”‘’\-—]/g, "");
}

function isLikelyDuplicateTopicTitle(title: string, seenTitles: string[]) {
  const normalized = normalizeTopicTitleForDedup(title);
  if (!normalized) {
    return false;
  }
  return seenTitles.some((seenTitle) => {
    if (normalized === seenTitle) {
      return true;
    }
    const shorterLength = Math.min(normalized.length, seenTitle.length);
    if (shorterLength < 12) {
      return false;
    }
    return normalized.includes(seenTitle) || seenTitle.includes(normalized);
  });
}

function dedupeRecommendations(input: {
  candidates: RankedTopicRecommendation[];
  resultLimit: number;
  excludedTitleKeys?: string[];
}) {
  const deduped: RankedTopicRecommendation[] = [];
  const seenTitles = [...(input.excludedTitleKeys ?? [])];

  for (const topic of input.candidates) {
    if (isLikelyDuplicateTopicTitle(topic.title, seenTitles)) {
      continue;
    }
    deduped.push(topic);
    seenTitles.push(normalizeTopicTitleForDedup(topic.title));
    if (deduped.length >= input.resultLimit) {
      break;
    }
  }

  return deduped;
}

export function rankTopicsByPersona(input: {
  topics: RawTopicItem[];
  personas: PersonaLite[];
  resultLimit: number;
  excludedTitleKeys?: string[];
}) {
  const defaultPersona = input.personas.find((item) => item.isDefault) ?? input.personas[0] ?? null;

  const rankedFromTopics = input.topics
    .map((topic) => {
      const bestPersonaMatch = input.personas.reduce<{
        persona: PersonaLite | null;
        score: number;
        reason: string | null;
      }>(
        (best, persona) => {
          const next = scoreTopicForPersona(topic, persona);
          if (next.score > best.score) {
            return { persona, score: next.score, reason: next.reason };
          }
          return best;
        },
        { persona: null, score: 0, reason: null },
      );

      const matchedPersona = bestPersonaMatch.persona ?? defaultPersona;
      const matchedPersonaName = matchedPersona?.name ?? null;
      const hasPersonaMatch = bestPersonaMatch.score > 0;
      const sourceType = normalizeSourceType(topic.source_type);
      const sourcePriority = normalizeSourcePriority(topic.source_priority);
      const recommendationType: TopicRecommendationType =
        hasPersonaMatch && topic.owner_user_id == null ? "hybrid" : hasPersonaMatch ? "persona" : "hot";
      const sourceTypeBoost = SOURCE_TYPE_PRIORITY_BOOST[sourceType] ?? SOURCE_TYPE_PRIORITY_BOOST.news;
      const sourcePriorityBoost = sourcePriority * 0.12;
      const recencyBoost = Math.max(1000 - topic.id, 0) * 0.001;
      const freshnessScore = computeFreshnessScore(topic.published_at);
      const relevanceScore = clampScore(bestPersonaMatch.score * 10 + (matchedPersona ? 18 : 0));
      const priorityScore = clampScore(freshnessScore * 0.38 + relevanceScore * 0.32 + sourceTypeBoost + sourcePriorityBoost * 0.2 + recencyBoost);
      const sourceReason =
        sourcePriority >= 140
          ? `信源优先级高（${sourcePriority}）`
          : sourceTypeBoost >= 18
            ? `属于高权重信源类型 ${sourceType}`
            : null;
      const eventDensityReason = topic.item_count && topic.item_count > 1 ? `该事件已被 ${topic.item_count} 个信源同时捕捉；` : "";
      const baseRecommendationReason =
        recommendationType === "hybrid"
          ? `热点新鲜度高，且和「${matchedPersonaName}」高度相关：${bestPersonaMatch.reason || "适合作为你当前默认写作身份的切入点"}${sourceReason ? `；${sourceReason}` : ""}。`
          : recommendationType === "persona"
            ? `更适合「${matchedPersonaName}」长期跟进：${bestPersonaMatch.reason || "选题与当前人设标签相符"}${sourceReason ? `；${sourceReason}` : ""}。`
            : matchedPersonaName
              ? `热点价值优先，建议先用「${matchedPersonaName}」的表达方式切入，避免只复述新闻${sourceReason ? `；${sourceReason}` : ""}。`
              : `热点价值优先，建议从利益变化、判断失效和读者处境三个层面切入${sourceReason ? `；${sourceReason}` : ""}。`;
      const recommendationReason = `${eventDensityReason}${baseRecommendationReason}`;

      return {
        id: topic.id,
        ownerUserId: topic.owner_user_id,
        sourceName: topic.source_name || "聚合信源",
        sourceType,
        sourcePriority,
        title: topic.title,
        summary: topic.summary,
        emotionLabels: parseJsonArray(topic.emotion_labels_json),
        angleOptions: parseJsonArray(topic.angle_options_json),
        sourceUrl: topic.source_url,
        relatedSourceNames: parseJsonArray(topic.source_names_json).length > 0 ? parseJsonArray(topic.source_names_json) : [topic.source_name || "聚合信源"],
        relatedSourceUrls: parseJsonArray(topic.source_urls_json),
        publishedAt: topic.published_at,
        recommendationType,
        recommendationReason,
        matchedPersonaId: matchedPersona?.id ?? null,
        matchedPersonaName,
        freshnessScore,
        relevanceScore,
        priorityScore,
      } satisfies RankedTopicRecommendation;
    })
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }
      return right.id - left.id;
    });

  const ranked = [...rankedFromTopics, ...buildPersonaLongTermRecommendations(input.personas)].sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }
    return right.id - left.id;
  });

  return dedupeRecommendations({
    candidates: ranked,
    resultLimit: input.resultLimit,
    excludedTitleKeys: input.excludedTitleKeys,
  });
}

function mapStoredTopicRecommendation(row: TopicRecommendationRow) {
  return {
    id: row.source_topic_id ?? row.id,
    ownerUserId: row.source_owner_user_id,
    sourceName: row.source_name,
    sourceType: normalizeSourceType(row.source_type),
    sourcePriority: normalizeSourcePriority(row.source_priority),
    title: row.title,
    summary: row.summary,
    emotionLabels: parseJsonArray(row.emotion_labels_json),
    angleOptions: parseJsonArray(row.angle_options_json),
    sourceUrl: row.source_url,
    relatedSourceNames: parseJsonArray(row.related_source_names_json),
    relatedSourceUrls: parseJsonArray(row.related_source_urls_json),
    publishedAt: row.published_at,
    recommendationType: row.recommendation_type,
    recommendationReason: row.recommendation_reason,
    matchedPersonaId: row.matched_persona_id,
    matchedPersonaName: row.matched_persona_name,
    freshnessScore: clampScore(Number(row.freshness_score ?? 0)),
    relevanceScore: clampScore(Number(row.relevance_score ?? 0)),
    priorityScore: clampScore(Number(row.priority_score ?? 0)),
  } satisfies RankedTopicRecommendation;
}

async function listStoredTopicRecommendations(userId: number, recommendationDate: string) {
  const db = getDatabase();
  const rows = await db.query<TopicRecommendationRow>(
    `SELECT
       id, user_id, recommendation_date, rank_index, topic_dedup_key, source_topic_id, source_owner_user_id,
       source_name, source_type, source_priority, title, summary, emotion_labels_json, angle_options_json,
       source_url, related_source_names_json, related_source_urls_json, published_at, recommendation_type,
       recommendation_reason, matched_persona_id, matched_persona_name, freshness_score, relevance_score, priority_score
     FROM topic_recommendations
     WHERE user_id = ? AND recommendation_date = ?
     ORDER BY rank_index ASC, id ASC`,
    [userId, recommendationDate],
  );
  return rows.map(mapStoredTopicRecommendation);
}

async function listRecentRecommendationDedupKeys(userId: number, recommendationDate: string) {
  const db = getDatabase();
  const rows = await db.query<{ topic_dedup_key: string }>(
    `SELECT DISTINCT topic_dedup_key
     FROM topic_recommendations
     WHERE user_id = ? AND recommendation_date >= ? AND recommendation_date < ?`,
    [userId, getDaysAgoRecommendationDate(7), recommendationDate],
  );
  return rows.map((row) => row.topic_dedup_key).filter(Boolean);
}

async function persistTopicRecommendations(input: {
  userId: number;
  recommendationDate: string;
  recommendations: RankedTopicRecommendation[];
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("DELETE FROM topic_recommendations WHERE user_id = ? AND recommendation_date = ?", [input.userId, input.recommendationDate]);

  for (const [index, recommendation] of input.recommendations.entries()) {
    await db.exec(
      `INSERT INTO topic_recommendations (
        user_id, recommendation_date, rank_index, topic_dedup_key, source_topic_id, source_owner_user_id,
        source_name, source_type, source_priority, title, summary, emotion_labels_json, angle_options_json,
        source_url, related_source_names_json, related_source_urls_json, published_at, recommendation_type,
        recommendation_reason, matched_persona_id, matched_persona_name, freshness_score, relevance_score,
        priority_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.recommendationDate,
        index + 1,
        normalizeTopicTitleForDedup(recommendation.title),
        recommendation.id,
        recommendation.ownerUserId,
        recommendation.sourceName,
        recommendation.sourceType,
        recommendation.sourcePriority,
        recommendation.title,
        recommendation.summary,
        JSON.stringify(recommendation.emotionLabels),
        JSON.stringify(recommendation.angleOptions),
        recommendation.sourceUrl,
        JSON.stringify(recommendation.relatedSourceNames),
        JSON.stringify(recommendation.relatedSourceUrls),
        recommendation.publishedAt,
        recommendation.recommendationType,
        recommendation.recommendationReason,
        recommendation.matchedPersonaId,
        recommendation.matchedPersonaName,
        recommendation.freshnessScore,
        recommendation.relevanceScore,
        recommendation.priorityScore,
        now,
        now,
      ],
    );
  }
}

async function materializeDailyTopicRecommendationsForUser(userId: number) {
  await ensureExtendedProductSchema();
  const recommendationDate = getShanghaiRecommendationDate();
  const stored = await listStoredTopicRecommendations(userId, recommendationDate);
  if (stored.length > 0) {
    return stored;
  }

  const [topics, personas, excludedTitleKeys] = await Promise.all([
    getVisibleTopicEvents(userId),
    getAuthorPersonas(userId),
    listRecentRecommendationDedupKeys(userId, recommendationDate),
  ]);

  const generated = rankTopicsByPersona({
    topics,
    personas,
    resultLimit: DAILY_RECOMMENDATION_LIMIT,
    excludedTitleKeys,
  });

  const filled =
    generated.length >= DAILY_RECOMMENDATION_LIMIT
      ? generated
      : dedupeRecommendations({
          candidates: [
            ...generated,
            ...rankTopicsByPersona({
              topics,
              personas,
              resultLimit: DAILY_RECOMMENDATION_LIMIT * 3,
            }),
          ],
          resultLimit: DAILY_RECOMMENDATION_LIMIT,
        });

  await persistTopicRecommendations({
    userId,
    recommendationDate,
    recommendations: filled,
  });

  return filled;
}

export async function getVisibleTopicRecommendationsForUser(userId: number) {
  const [topics, planContext] = await Promise.all([
    materializeDailyTopicRecommendationsForUser(userId),
    getUserPlanContext(userId),
  ]);

  return topics.slice(0, getTopicRadarVisibleLimit(planContext.effectivePlanCode));
}
