import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { loadPrompt } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";
import { ensureBootstrapData } from "./repositories";

type SourceSuggestion = {
  platform: string;
  sourceType: string;
  queryHint: string;
  reason: string;
  freshnessHint: string;
  expectedValue: string;
};

export type TopicSupplementPlan = {
  summary: string;
  searchBrief: string;
  sourceSuggestions: SourceSuggestion[];
  verificationChecklist: string[];
  model: string;
  provider: string;
  degradedReason: string | null;
};

function uniqueTrimmed(values: unknown, limit = 5) {
  if (!Array.isArray(values)) return [] as string[];
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function normalizeSourceType(value: unknown) {
  const normalized = String(value || "news").trim().toLowerCase();
  if (["youtube", "reddit", "community", "podcast", "spotify", "news", "blog", "rss"].includes(normalized)) {
    return normalized;
  }
  return "news";
}

function normalizePlatform(type: string) {
  if (type === "youtube") return "YouTube";
  if (type === "reddit") return "Reddit";
  if (type === "community") return "Community";
  if (type === "podcast") return "Podcast";
  if (type === "spotify") return "Spotify";
  if (type === "blog") return "官方 Blog / Newsroom";
  if (type === "rss") return "RSS / Feed";
  return "主流新闻";
}

function normalizeSuggestions(value: unknown, fallback: SourceSuggestion[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const sourceType = normalizeSourceType((item as Record<string, unknown>).sourceType);
      const queryHint = String((item as Record<string, unknown>).queryHint || "").trim();
      const reason = String((item as Record<string, unknown>).reason || "").trim();
      const freshnessHint = String((item as Record<string, unknown>).freshnessHint || "").trim();
      const expectedValue = String((item as Record<string, unknown>).expectedValue || "").trim();
      if (!queryHint || !reason) {
        return null;
      }
      return {
        platform: String((item as Record<string, unknown>).platform || normalizePlatform(sourceType)).trim() || normalizePlatform(sourceType),
        sourceType,
        queryHint,
        reason,
        freshnessHint: freshnessHint || "优先近 7 天内内容",
        expectedValue: expectedValue || "补充一手观点、现场表述或事实细节",
      } satisfies SourceSuggestion;
    })
    .filter((item): item is SourceSuggestion => Boolean(item));

  return normalized.length > 0 ? normalized.slice(0, 6) : fallback;
}

function buildFallbackSuggestions(input: {
  title: string;
  matchedPersonaName?: string | null;
  sourceUrl?: string | null;
}) {
  const baseTitle = input.title.trim();
  let sourceDomain: string | null = null;
  if (input.sourceUrl) {
    try {
      sourceDomain = new URL(input.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      sourceDomain = null;
    }
  }
  return [
    {
      platform: "YouTube",
      sourceType: "youtube",
      queryHint: formatPromptTemplate("{{baseTitle}} 访谈 解读", {
        baseTitle,
      }),
      reason: "优先找事件参与方、访谈和长视频解释，补充现场表达与时间线。",
      freshnessHint: "优先近 7 天上传的视频",
      expectedValue: "拿到当事人口径、完整论述和评论区争议点",
    },
    {
      platform: "Reddit",
      sourceType: "reddit",
      queryHint: formatPromptTemplate("{{baseTitle}} discussion", {
        baseTitle,
      }),
      reason: "适合补充行业从业者与高密度用户的即时讨论，识别真实分歧。",
      freshnessHint: "优先近 72 小时帖子",
      expectedValue: "补到用户反馈、反例和一线使用感受",
    },
    {
      platform: "Podcast",
      sourceType: "podcast",
      queryHint: formatPromptTemplate("{{baseTitle}} podcast interview", {
        baseTitle,
      }),
      reason: "适合寻找更完整的背景解释，避免只抓到社媒短句。",
      freshnessHint: "优先最近两周节目",
      expectedValue: "补到更长链路的背景、因果和行业上下文",
    },
    {
      platform: "Spotify",
      sourceType: "spotify",
      queryHint: formatPromptTemplate("{{baseTitle}} podcast", {
        baseTitle,
      }),
      reason: "可补充播客侧的专题讨论，尤其适合需要结构化解释的主题。",
      freshnessHint: "优先最近两周节目",
      expectedValue: "补到较完整的讨论框架和引用线索",
    },
    {
      platform: "官方 Blog / Newsroom",
      sourceType: "blog",
      queryHint: sourceDomain
        ? formatPromptTemplate("{{sourceDomain}} newsroom {{baseTitle}}", {
          sourceDomain,
          baseTitle,
        })
        : formatPromptTemplate("{{baseTitle}} 官方 blog", {
          baseTitle,
        }),
      reason: "优先补官方公告、Newsroom 和博客原文，减少被二手转述带偏。",
      freshnessHint: "优先近 30 天原始发布",
      expectedValue: "补到官方口径、变更说明和一手上下文",
    },
    {
      platform: "RSS / Feed",
      sourceType: "rss",
      queryHint: sourceDomain
        ? formatPromptTemplate("{{sourceDomain}} rss {{baseTitle}}", {
          sourceDomain,
          baseTitle,
        })
        : formatPromptTemplate("{{baseTitle}} rss feed", {
          baseTitle,
        }),
      reason: "优先找可持续订阅的 Feed 源，方便后续重复跟踪同一主题。",
      freshnessHint: "优先近 7 天 Feed 更新",
      expectedValue: "补到连续更新线索、时间点和可复用回链",
    },
  ] satisfies SourceSuggestion[];
}

function buildFallbackPlan(input: {
  title: string;
  recommendationReason: string;
  matchedPersonaName?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
}) {
  const personaBrief = input.matchedPersonaName
    ? formatPromptTemplate(" 当前优先贴合「{{matchedPersonaName}}」的人设切口。", {
      matchedPersonaName: input.matchedPersonaName,
    })
    : "";
  return {
    summary: formatPromptTemplate("围绕“{{title}}”，先补一手表达，再补时间线和数字，最后再决定最终下笔角度。", {
      title: input.title,
    }),
    searchBrief: formatPromptTemplate("Gemini 补充信源当前走降级策略。优先搜 YouTube / Reddit / Podcast / Spotify，再用官方 Blog、RSS 和主流报道做交叉核对。{{personaBrief}}", {
      personaBrief,
    }),
    sourceSuggestions: buildFallbackSuggestions(input),
    verificationChecklist: [
      "至少确认 2 个独立来源都提到同一核心事实，再写进正文。",
      "数字、时间、公司名和人物名优先以原始发布或正式报道为准。",
      "如果社媒观点和新闻稿口径冲突，保留冲突本身，不要擅自替模型下结论。",
      "最终引用前，回看这个选题是否仍符合当前人设和预期读者处境。",
    ],
    model: "fallback-topic-supplement",
    provider: "local",
    degradedReason: "topicSupplement failed",
  } satisfies TopicSupplementPlan;
}

export async function generateTopicSupplementPlan(input: {
  title: string;
  recommendationReason: string;
  matchedPersonaName?: string | null;
  sourceName?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
}) {
  await ensureBootstrapData();
  const fallback = buildFallbackPlan(input);

  try {
    const systemPrompt = await loadPrompt("topic_supplement");
    const userPrompt = [
      "请围绕下面这个待写选题，给出补充信源建议。",
      "Gemini 只做补证建议，不直接充当事实来源。",
      "优先级：YouTube、Reddit、Podcast、Spotify、官方 Blog / Newsroom、RSS / Feed、主流新闻。",
      "必须返回 JSON，不要解释，不要 markdown。",
      '字段要求：{"summary":"字符串","searchBrief":"字符串","sourceSuggestions":[{"platform":"字符串","sourceType":"youtube|reddit|podcast|spotify|blog|rss|news","queryHint":"字符串","reason":"字符串","freshnessHint":"字符串","expectedValue":"字符串"}],"verificationChecklist":[""]}',
      "sourceSuggestions 返回 4-6 条，verificationChecklist 返回 3-5 条。",
      "queryHint 必须是用户可直接复制去搜索的短查询；reason 必须解释为什么这个平台值得补证。",
      "不要编造已经找到的事实，不要输出具体数据结论。",
      formatPromptTemplate("topicTitle: {{title}}", {
        title: input.title,
      }),
      formatPromptTemplate("matchedPersonaName: {{matchedPersonaName}}", {
        matchedPersonaName: input.matchedPersonaName || "未指定",
      }),
      formatPromptTemplate("currentSourceName: {{sourceName}}", {
        sourceName: input.sourceName || "未指定",
      }),
      formatPromptTemplate("currentSourceType: {{sourceType}}", {
        sourceType: input.sourceType || "未指定",
      }),
      formatPromptTemplate("currentSourceUrl: {{sourceUrl}}", {
        sourceUrl: input.sourceUrl || "未指定",
      }),
      formatPromptTemplate("recommendationReason: {{recommendationReason}}", {
        recommendationReason: input.recommendationReason,
      }),
    ].join("\n");

    const result = await generateSceneText({
      sceneCode: "topicSupplement",
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });
    const payload = extractJsonObject(result.text) as Record<string, unknown>;

    return {
      summary: String(payload.summary || fallback.summary).trim(),
      searchBrief: String(payload.searchBrief || fallback.searchBrief).trim(),
      sourceSuggestions: normalizeSuggestions(payload.sourceSuggestions, fallback.sourceSuggestions),
      verificationChecklist: uniqueTrimmed(payload.verificationChecklist, 5).length
        ? uniqueTrimmed(payload.verificationChecklist, 5)
        : fallback.verificationChecklist,
      model: result.model,
      provider: result.provider,
      degradedReason: null,
    } satisfies TopicSupplementPlan;
  } catch {
    return fallback;
  }
}
