import { generateSceneText } from "./ai-gateway";
import { loadPrompt } from "./prompt-loader";

type StyleGenomeConfig = {
  name?: string;
  tone?: string;
  paragraphLength?: string;
  titleStyle?: string;
  bannedWords?: string[];
  bannedPunctuation?: string[];
};

type OutlineNodeContext = {
  title: string;
  description?: string | null;
};

type KnowledgeCardContext = {
  title: string;
  summary: string | null;
  keyFacts: string[];
  openQuestions?: string[];
  status: string;
  confidenceScore: number;
  matchedFragmentCount?: number;
};

export function splitIntoChunks(text: string, size = 28) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function sanitizeBannedWords(content: string, bannedWords: string[]) {
  let sanitized = content;
  for (const bannedWord of bannedWords) {
    const word = bannedWord.trim();
    if (!word) continue;
    sanitized = sanitized.replaceAll(word, "〔已净化〕");
  }
  return sanitized;
}

function buildLocalDraft(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  prompt: string;
  styleGuide?: string | null;
  outlineGuide?: string;
  knowledgeGuide?: string;
}) {
  const fragmentText = input.fragments.length > 0 ? input.fragments.join("；") : "当前没有碎片，先根据标题生成一版骨架正文。";
  return sanitizeBannedWords(
    `# ${input.title}\n\n${input.prompt}\n\n${input.styleGuide ? `${input.styleGuide}\n\n` : ""}${input.outlineGuide ? `${input.outlineGuide}\n\n` : ""}${input.knowledgeGuide ? `${input.knowledgeGuide}\n\n` : ""}先把现实摊开。\n\n${fragmentText}\n\n你不是在补空话，而是在把事实重新排成能击中人的结构。\n`,
    input.bannedWords,
  );
}

function buildStyleGuide(styleGenome?: StyleGenomeConfig | null) {
  if (!styleGenome) {
    return "";
  }

  const lines = [
    styleGenome.name ? `当前启用排版基因：${styleGenome.name}` : null,
    styleGenome.tone ? `语气要求：${styleGenome.tone}` : null,
    styleGenome.paragraphLength ? `段落长度：${styleGenome.paragraphLength}` : null,
    styleGenome.titleStyle ? `标题风格：${styleGenome.titleStyle}` : null,
    styleGenome.bannedWords?.length ? `附加禁词：${styleGenome.bannedWords.join("、")}` : null,
    styleGenome.bannedPunctuation?.length ? `禁用标点：${styleGenome.bannedPunctuation.join(" ")}` : null,
  ].filter(Boolean);

  if (!lines.length) {
    return "";
  }

  return ["请额外遵守以下排版基因：", ...lines].join("\n");
}

function buildOutlineGuide(outlineNodes: OutlineNodeContext[] = []) {
  if (outlineNodes.length === 0) {
    return "";
  }

  return [
    "当前文稿大纲锚点：",
    ...outlineNodes.map((node, index) => `${index + 1}. ${node.title}${node.description ? `：${node.description}` : ""}`),
  ].join("\n");
}

function buildKnowledgeGuide(knowledgeCards: KnowledgeCardContext[] = []) {
  if (knowledgeCards.length === 0) {
    return "";
  }

  return [
    "相关主题档案：",
    ...knowledgeCards.map((card, index) =>
      [
        `${index + 1}. ${card.title}（状态：${card.status}，置信度：${Math.round(card.confidenceScore * 100)}%${card.matchedFragmentCount ? `，命中挂载碎片 ${card.matchedFragmentCount} 条` : ""}）`,
        card.summary ? `摘要：${card.summary}` : null,
        card.keyFacts.length ? `关键事实：${card.keyFacts.slice(0, 3).join("；")}` : null,
        card.openQuestions?.length ? `待确认：${card.openQuestions.slice(0, 2).join("；")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
}

export async function buildGeneratedDocument(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  styleGenome?: StyleGenomeConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
}) {
  const [writePrompt, auditPrompt] = await Promise.all([
    loadPrompt("document_write"),
    loadPrompt("banned_word_audit"),
  ]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "当前没有碎片，请根据标题先搭一版简洁骨架。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const styleGuide = buildStyleGuide(input.styleGenome);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    styleGuide,
    outlineGuide,
    knowledgeGuide,
    "请基于以下事实碎片输出一篇中文 Markdown 正文。",
    "要求：短句、克制、反机器腔；不要解释你的过程；只返回正文 Markdown。",
    "",
    `碎片：\n- ${fragmentText}`,
  ].join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "documentWrite",
      systemPrompt: writePrompt,
      userPrompt: writerUserPrompt,
      temperature: 0.5,
    });

    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校正文：\n${drafted.text}`,
      "",
      `禁用词：${bannedWordsText}`,
      styleGuide,
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "bannedWordAudit",
      systemPrompt: auditPrompt,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
    });

    return sanitizeBannedWords(audited.text.trim(), input.bannedWords);
  } catch {
    return buildLocalDraft({
      title: input.title,
      fragments: input.fragments,
      bannedWords: input.bannedWords,
      prompt: writePrompt,
      styleGuide,
      outlineGuide,
      knowledgeGuide,
    });
  }
}

function buildLocalRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  command: string;
  styleGuide?: string | null;
  outlineGuide?: string;
  knowledgeGuide?: string;
}) {
  const base = input.markdownContent.trim() || buildLocalDraft({
    title: input.title,
    fragments: input.fragments,
    bannedWords: input.bannedWords,
    prompt: "先根据当前命令生成一版可继续编辑的骨架。",
    styleGuide: input.styleGuide,
    outlineGuide: input.outlineGuide,
    knowledgeGuide: input.knowledgeGuide,
  });

  if (/小标题/.test(input.command)) {
    return sanitizeBannedWords(
      `${base}\n\n## 小标题一\n围绕当前主题先把结论写硬。\n\n## 小标题二\n把事实和利益变化拆开。\n\n## 小标题三\n最后落回读者当下处境。`,
      input.bannedWords,
    );
  }

  if (/扩写|补/.test(input.command)) {
    const extra = input.fragments.slice(0, 2).join("；") || "补一段更具体的事实锚点和判断转折。";
    return sanitizeBannedWords(`${base}\n\n${extra}`, input.bannedWords);
  }

  if (/死刑词|替换|净化/.test(input.command)) {
    return sanitizeBannedWords(base, input.bannedWords);
  }

  return sanitizeBannedWords(base, input.bannedWords);
}

export async function buildCommandRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  command: string;
  styleGenome?: StyleGenomeConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
}) {
  const [writePrompt, auditPrompt] = await Promise.all([
    loadPrompt("document_write"),
    loadPrompt("banned_word_audit"),
  ]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "当前没有额外碎片，请尽量保留已有事实，不要空泛扩写。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const styleGuide = buildStyleGuide(input.styleGenome);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);

  const writerUserPrompt = [
    `标题：${input.title}`,
    `编辑命令：${input.command}`,
    `禁用词：${bannedWordsText}`,
    styleGuide,
    outlineGuide,
    knowledgeGuide,
    "",
    "请基于当前正文执行改写命令，输出完整 Markdown 正文。",
    "要求：不要解释，不要列步骤，直接返回改写后的整篇正文。",
    "",
    `当前正文：\n${input.markdownContent || "(当前为空，请先生成骨架正文)"}`,
    "",
    `可用碎片：\n- ${fragmentText}`,
  ].join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "documentWrite",
      systemPrompt: writePrompt,
      userPrompt: writerUserPrompt,
      temperature: 0.4,
    });

    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `编辑命令：${input.command}`,
      "",
      `待审校正文：\n${drafted.text}`,
      "",
      `禁用词：${bannedWordsText}`,
      styleGuide,
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "bannedWordAudit",
      systemPrompt: auditPrompt,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
    });

    return sanitizeBannedWords(audited.text.trim(), input.bannedWords);
  } catch {
    return buildLocalRewrite({
      title: input.title,
      markdownContent: input.markdownContent,
      fragments: input.fragments,
      bannedWords: input.bannedWords,
      command: input.command,
      styleGuide,
      outlineGuide,
      knowledgeGuide,
    });
  }
}
