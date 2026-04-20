type MockKnowledgeBase = {
  id: string;
  name: string;
  description: string;
};

const MOCK_KNOWLEDGE_BASES: MockKnowledgeBase[] = [
  {
    id: "kb-hot-topics",
    name: "爆款选题库",
    description: "覆盖内容流量与职场焦虑类高热文章，约 128 篇",
  },
  {
    id: "kb-ai-growth",
    name: "AI 增长案例库",
    description: "覆盖 AI 提效、工作流与 SaaS 增长案例，约 86 篇",
  },
];

function sanitizeText(value: unknown) {
  return String(value || "").trim();
}

export function getMockKnowledgeBases() {
  return MOCK_KNOWLEDGE_BASES;
}

export function getMockKnowledgeBaseMap(ids: string[]) {
  const wanted = new Set(ids.map((item) => sanitizeText(item)).filter(Boolean));
  const rows = MOCK_KNOWLEDGE_BASES.filter((item) => wanted.size === 0 || wanted.has(item.id));
  return Object.fromEntries(
    rows.map((item) => [
      item.id,
      {
        id: item.id,
        name: item.name,
        description: item.description,
      },
    ]),
  );
}

export function buildMockKnowledgeSearchResults(query: string, kbId: string) {
  const normalizedQuery = sanitizeText(query) || "职场焦虑";
  const knowledgeBase = MOCK_KNOWLEDGE_BASES.find((item) => item.id === kbId) ?? MOCK_KNOWLEDGE_BASES[0];
  return [
    {
      media_id: `${knowledgeBase.id}-1`,
      title: `${normalizedQuery} 不是情绪问题，而是旧协作机制开始失灵`,
      parent_folder_id: "folder-1",
      highlight_content: `在 ${knowledgeBase.name} 里，这类标题最能打动读者的点，不是情绪本身，而是它暴露出原有分工和节奏已经不成立。`,
      web_info: { content_id: `https://example.com/mock-ima/${knowledgeBase.id}/1` },
    },
    {
      media_id: `${knowledgeBase.id}-2`,
      title: `当大家都在写${normalizedQuery}，真正该写的是谁先被重排`,
      parent_folder_id: "folder-1",
      highlight_content: "高点击样本普遍会把“谁先受影响、谁先掉队”写成具体现场，让读者立刻代入自己的处境。",
      web_info: { content_id: `https://example.com/mock-ima/${knowledgeBase.id}/2` },
    },
    {
      media_id: `${knowledgeBase.id}-3`,
      title: `${normalizedQuery} 之后，最该警惕的不是慢，而是还按旧判断行动`,
      parent_folder_id: "folder-2",
      highlight_content: "样本里反复出现的传播钩子，是“旧判断失效”与“身份重新排序”这两件事同时发生。",
      web_info: { content_id: `https://example.com/mock-ima/${knowledgeBase.id}/3` },
    },
    {
      media_id: `${knowledgeBase.id}-4`,
      title: `${normalizedQuery} 这件事，真正让人转发的是哪一层刺痛`,
      parent_folder_id: "folder-2",
      highlight_content: "不是写趋势，而是把那一下被刺到的现场写出来，再接回结构变化，这类文章更容易形成高保存率。",
      web_info: { content_id: `https://example.com/mock-ima/${knowledgeBase.id}/4` },
    },
  ];
}

export function ok<T>(data: T) {
  return Response.json({
    retcode: 0,
    errmsg: "ok",
    data,
  });
}
