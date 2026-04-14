import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { loadPrompt } from "./prompt-loader";
import { ensureBootstrapData } from "./repositories";

type SourceSuggestion = {
  platform: string;
  sourceType: string;
  queryHint: string;
  reason: string;
  freshnessHint: string;
  expectedValue: string;
};

export type TopicSourceScoutPlan = {
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
  if (["youtube", "reddit", "x", "podcast", "spotify", "news"].includes(normalized)) {
    return normalized;
  }
  return "news";
}

function normalizePlatform(type: string) {
  if (type === "youtube") return "YouTube";
  if (type === "reddit") return "Reddit";
  if (type === "x") return "X";
  if (type === "podcast") return "Podcast";
  if (type === "spotify") return "Spotify";
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
  const personaLead = input.matchedPersonaName ? `${input.matchedPersonaName} 视角` : "作者视角";
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
      queryHint: `${baseTitle} 访谈 解读`,
      reason: "优先找事件参与方、访谈和长视频解释，补充现场表达与时间线。",
      freshnessHint: "优先近 7 天上传的视频",
      expectedValue: "拿到当事人口径、完整论述和评论区争议点",
    },
    {
      platform: "Reddit",
      sourceType: "reddit",
      queryHint: `${baseTitle} discussion`,
      reason: "适合补充行业从业者与高密度用户的即时讨论，识别真实分歧。",
      freshnessHint: "优先近 72 小时帖子",
      expectedValue: "补到用户反馈、反例和一线使用感受",
    },
    {
      platform: "X",
      sourceType: "x",
      queryHint: `${baseTitle} ${personaLead}`,
      reason: "快速确认事件扩散路径、关键人物发言和二次转述是否失真。",
      freshnessHint: "优先近 48 小时时间线",
      expectedValue: "补到关键账号原话、转发脉络与观点对撞",
    },
    {
      platform: "Podcast",
      sourceType: "podcast",
      queryHint: `${baseTitle} podcast interview`,
      reason: "适合寻找更完整的背景解释，避免只抓到社媒短句。",
      freshnessHint: "优先最近两周节目",
      expectedValue: "补到更长链路的背景、因果和行业上下文",
    },
    {
      platform: "Spotify",
      sourceType: "spotify",
      queryHint: `${baseTitle} podcast`,
      reason: "可补充播客侧的专题讨论，尤其适合需要结构化解释的主题。",
      freshnessHint: "优先最近两周节目",
      expectedValue: "补到较完整的讨论框架和引用线索",
    },
    {
      platform: "主流新闻",
      sourceType: "news",
      queryHint: sourceDomain ? `${baseTitle} ${sourceDomain}` : `${baseTitle} 最新报道`,
      reason: "用于交叉确认时间、数字、公司名和政策表述，防止引用失真。",
      freshnessHint: "优先 24 小时内更新稿",
      expectedValue: "补到可核对的数据、时间点和正式表述",
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
  return {
    summary: `围绕“${input.title}”，先补一手表达，再补时间线和数字，最后再决定最终下笔角度。`,
    searchBrief: `Gemini 补充信源当前走降级策略。优先搜 YouTube / Reddit / X，再用 Podcast、Spotify 和主流新闻做交叉核对。${input.matchedPersonaName ? ` 当前优先贴合「${input.matchedPersonaName}」的人设切口。` : ""}`,
    sourceSuggestions: buildFallbackSuggestions(input),
    verificationChecklist: [
      "至少确认 2 个独立来源都提到同一核心事实，再写进正文。",
      "数字、时间、公司名和人物名优先以原始发布或正式报道为准。",
      "如果社媒观点和新闻稿口径冲突，保留冲突本身，不要擅自替模型下结论。",
      "最终引用前，回看这个选题是否仍符合当前人设和预期读者处境。",
    ],
    model: "fallback-topic-source-scout",
    provider: "local",
    degradedReason: "topicSourceScout failed",
  } satisfies TopicSourceScoutPlan;
}

export async function generateTopicSourceScout(input: {
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
    const systemPrompt = await loadPrompt("topic_source_scout");
    const userPrompt = [
      "请围绕下面这个待写选题，给出补充信源建议。",
      "Gemini 只做补证建议，不直接充当事实来源。",
      "优先级：YouTube、Reddit、X、Podcast、Spotify、主流新闻。",
      "必须返回 JSON，不要解释，不要 markdown。",
      '字段要求：{"summary":"字符串","searchBrief":"字符串","sourceSuggestions":[{"platform":"字符串","sourceType":"youtube|reddit|x|podcast|spotify|news","queryHint":"字符串","reason":"字符串","freshnessHint":"字符串","expectedValue":"字符串"}],"verificationChecklist":[""]}',
      "sourceSuggestions 返回 4-6 条，verificationChecklist 返回 3-5 条。",
      "queryHint 必须是用户可直接复制去搜索的短查询；reason 必须解释为什么这个平台值得补证。",
      "不要编造已经找到的事实，不要输出具体数据结论。",
      `topicTitle: ${input.title}`,
      `matchedPersonaName: ${input.matchedPersonaName || "未指定"}`,
      `currentSourceName: ${input.sourceName || "未指定"}`,
      `currentSourceType: ${input.sourceType || "未指定"}`,
      `currentSourceUrl: ${input.sourceUrl || "未指定"}`,
      `recommendationReason: ${input.recommendationReason}`,
    ].join("\n");

    const result = await generateSceneText({
      sceneCode: "topicSourceScout",
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
    } satisfies TopicSourceScoutPlan;
  } catch {
    return fallback;
  }
}
