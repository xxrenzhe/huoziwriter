import {
  inferEvidenceHookStrength,
  inferEvidenceHookTags,
  type EvidenceHookTag,
} from "./article-evidence";

type KnowledgeFragmentLike = {
  title?: string | null;
  distilled_content: string;
  source_type?: string | null;
};

const KNOWLEDGE_TRACK_KEYWORDS = [
  { label: "AI", keywords: ["ai", "agent", "模型", "大模型", "智能体", "推理", "芯片", "算力", "openai", "claude", "gemini"] },
  { label: "内容创作", keywords: ["公众号", "爆文", "选题", "内容", "写作", "创作者", "流量", "传播", "自媒体"] },
  { label: "商业增长", keywords: ["增长", "商业", "竞争", "市场", "战略", "公司", "产品", "变现", "客户", "营收"] },
  { label: "创业投资", keywords: ["创业", "融资", "估值", "并购", "资本", "投资", "基金", "ipo", "赛道"] },
  { label: "职场组织", keywords: ["职场", "老板", "员工", "管理", "组织", "绩效", "团队", "裁员", "升职"] },
  { label: "教育学习", keywords: ["教育", "学习", "课程", "老师", "学生", "培训", "认知"] },
  { label: "电商消费", keywords: ["电商", "品牌", "直播", "gmv", "投流", "平台", "供应链", "消费"] },
].map((item) => ({
  ...item,
  keywords: item.keywords.map((keyword) => keyword.toLowerCase()),
}));

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function inferKnowledgeTrackLabel(input: {
  title?: string | null;
  summary?: string | null;
  fragments: KnowledgeFragmentLike[];
}) {
  const haystack = [
    input.title,
    input.summary,
    ...input.fragments.flatMap((fragment) => [fragment.title, fragment.distilled_content]),
  ]
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!haystack) return "综合观察";
  const ranked = KNOWLEDGE_TRACK_KEYWORDS
    .map((track) => ({
      label: track.label,
      score: track.keywords.reduce((total, keyword) => total + (haystack.includes(keyword) ? keyword.length >= 3 ? 2 : 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, "zh-CN"));

  return ranked[0]?.label ?? "综合观察";
}

export function deriveKnowledgeHookTags(fragments: KnowledgeFragmentLike[]) {
  const tags = new Set<EvidenceHookTag>();
  for (const fragment of fragments) {
    const inferred = inferEvidenceHookTags({
      title: fragment.title,
      excerpt: fragment.distilled_content,
      claim: fragment.distilled_content,
      rationale: fragment.distilled_content,
    });
    for (const tag of inferred) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

export function pickKnowledgeSampleParagraph(fragments: KnowledgeFragmentLike[]) {
  const ranked = fragments
    .map((fragment) => {
      const text = normalizeText(fragment.distilled_content);
      const hookTags = inferEvidenceHookTags({
        title: fragment.title,
        excerpt: text,
        claim: text,
        rationale: text,
      });
      const hookStrength = inferEvidenceHookStrength({
        title: fragment.title,
        excerpt: text,
        claim: text,
        rationale: text,
        hookTags,
      });
      return {
        text,
        hookStrength,
        hookTagCount: hookTags.length,
      };
    })
    .filter((item) => item.text)
    .sort((left, right) => right.hookStrength - left.hookStrength || right.hookTagCount - left.hookTagCount || right.text.length - left.text.length);

  return ranked[0]?.text.slice(0, 280) ?? null;
}

export function buildKnowledgeIndexSignals(input: {
  title?: string | null;
  summary?: string | null;
  fragments: KnowledgeFragmentLike[];
}) {
  return {
    trackLabel: inferKnowledgeTrackLabel(input),
    hookTags: deriveKnowledgeHookTags(input.fragments),
    sampleParagraph: pickKnowledgeSampleParagraph(input.fragments),
  };
}
