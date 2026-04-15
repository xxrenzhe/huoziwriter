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
  latestChangeSummary?: string | null;
  overturnedJudgements?: string[];
  status: string;
  confidenceScore: number;
  matchedFragmentCount?: number;
};

type AuthorPersonaContext = {
  name: string;
  summary?: string | null;
  identityTags: string[];
  writingStyleTags: string[];
  domainKeywords?: string[];
  argumentPreferences?: string[];
  toneConstraints?: string[];
  audienceHints?: string[];
  sourceMode?: string;
  boundWritingStyleProfileName?: string | null;
};

type WritingStyleProfileContext = {
  name: string;
  summary: string;
  toneKeywords: string[];
  structurePatterns: string[];
  languageHabits: string[];
  openingPatterns: string[];
  endingPatterns: string[];
  doNotWrite: string[];
  imitationPrompt: string;
};

type ImageFragmentContext = {
  title?: string | null;
  screenshotPath: string;
};

type HistoryReferenceContext = {
  title: string;
  relationReason?: string | null;
  bridgeSentence?: string | null;
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

function buildTagText(tags: string[] = []) {
  return tags.map((item) => String(item || "").trim()).filter(Boolean).join("、");
}

function buildLocalDraft(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  prompt: string;
  authorPersonaGuide?: string;
  writingStyleGuide?: string;
  styleGuide?: string | null;
  outlineGuide?: string;
  knowledgeGuide?: string;
  imageGuide?: string;
  historyGuide?: string;
  deepWritingGuide?: string;
}) {
  const fragmentText = input.fragments.length > 0 ? input.fragments.join("；") : "当前没有碎片，先根据标题生成一版骨架正文。";
  return sanitizeBannedWords(
    `# ${input.title}\n\n${input.prompt}\n\n${input.authorPersonaGuide ? `${input.authorPersonaGuide}\n\n` : ""}${input.writingStyleGuide ? `${input.writingStyleGuide}\n\n` : ""}${input.styleGuide ? `${input.styleGuide}\n\n` : ""}${input.outlineGuide ? `${input.outlineGuide}\n\n` : ""}${input.knowledgeGuide ? `${input.knowledgeGuide}\n\n` : ""}${input.imageGuide ? `${input.imageGuide}\n\n` : ""}${input.historyGuide ? `${input.historyGuide}\n\n` : ""}${input.deepWritingGuide ? `${input.deepWritingGuide}\n\n` : ""}先把现实摊开。\n\n${fragmentText}\n\n你不是在补空话，而是在把事实重新排成能击中人的结构。\n`,
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

function buildAuthorPersonaGuide(authorPersona?: AuthorPersonaContext | null) {
  if (!authorPersona) {
    return "";
  }

  const identityText = buildTagText(authorPersona.identityTags);
  const writingStyleText = buildTagText(authorPersona.writingStyleTags);
  const lines = [
    `当前默认作者人设：${authorPersona.name}`,
    authorPersona.summary ? `人设摘要：${authorPersona.summary}` : null,
    identityText ? `身份维度：${identityText}` : null,
    writingStyleText ? `标签风格：${writingStyleText}` : null,
    authorPersona.domainKeywords?.length ? `领域关键词：${authorPersona.domainKeywords.join("、")}` : null,
    authorPersona.argumentPreferences?.length ? `常用论证：${authorPersona.argumentPreferences.join("；")}` : null,
    authorPersona.toneConstraints?.length ? `语气约束：${authorPersona.toneConstraints.join("；")}` : null,
    authorPersona.audienceHints?.length ? `默认受众：${authorPersona.audienceHints.join("；")}` : null,
    authorPersona.sourceMode === "analyzed" ? "这个人设由用户资料分析得到，优先贴近其真实表达习惯。" : null,
    authorPersona.boundWritingStyleProfileName ? `已绑定文风资产：${authorPersona.boundWritingStyleProfileName}` : null,
    "写作时保持人设视角稳定，不要突然切换成通用 AI 口吻或旁观者口吻。",
  ].filter(Boolean);

  return ["请额外遵守以下作者人设约束：", ...lines].join("\n");
}

function buildWritingStyleGuide(writingStyleProfile?: WritingStyleProfileContext | null) {
  if (!writingStyleProfile) {
    return "";
  }

  const lines = [
    `当前绑定写作风格资产：${writingStyleProfile.name}`,
    writingStyleProfile.summary ? `风格摘要：${writingStyleProfile.summary}` : null,
    writingStyleProfile.toneKeywords.length ? `语气关键词：${writingStyleProfile.toneKeywords.join("、")}` : null,
    writingStyleProfile.structurePatterns.length ? `结构习惯：${writingStyleProfile.structurePatterns.join("；")}` : null,
    writingStyleProfile.languageHabits.length ? `语言习惯：${writingStyleProfile.languageHabits.join("；")}` : null,
    writingStyleProfile.openingPatterns.length ? `开头习惯：${writingStyleProfile.openingPatterns.join("；")}` : null,
    writingStyleProfile.endingPatterns.length ? `结尾习惯：${writingStyleProfile.endingPatterns.join("；")}` : null,
    writingStyleProfile.doNotWrite.length ? `明确规避：${writingStyleProfile.doNotWrite.join("；")}` : null,
    writingStyleProfile.imitationPrompt ? `模仿提示：${writingStyleProfile.imitationPrompt}` : null,
    "要求：吸收节奏、结构和语气，不要照抄源文句子。",
  ].filter(Boolean);

  return ["请额外遵守以下文风资产约束：", ...lines].join("\n");
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
        card.latestChangeSummary ? `最近变化：${card.latestChangeSummary}` : null,
        card.keyFacts.length ? `关键事实：${card.keyFacts.slice(0, 3).join("；")}` : null,
        card.overturnedJudgements?.length ? `待重验旧判断：${card.overturnedJudgements.slice(0, 2).join("；")}` : null,
        card.openQuestions?.length ? `待确认：${card.openQuestions.slice(0, 2).join("；")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
}

function buildImageGuide(imageFragments: ImageFragmentContext[] = []) {
  if (imageFragments.length === 0) {
    return "";
  }
  return [
    "截图素材必须自然插入正文，且原样使用，不要改写成伪引用：",
    ...imageFragments.map((item, index) => `${index + 1}. ${item.title || `截图素材 ${index + 1}`}：请在合适段落使用 Markdown 图片语法 ![${item.title || `截图素材 ${index + 1}`}](${item.screenshotPath})`),
  ].join("\n");
}

function buildHistoryReferenceGuide(historyReferences: HistoryReferenceContext[] = []) {
  if (historyReferences.length === 0) {
    return "";
  }
  return [
    "历史文章只能自然引用，不允许生成文末相关阅读区块，也不要生成链接列表：",
    ...historyReferences.map((item, index) => `${index + 1}. 《${item.title}》${item.relationReason ? `：${item.relationReason}` : ""}${item.bridgeSentence ? `；可用桥接句：${item.bridgeSentence}` : ""}`),
  ].join("\n");
}

export async function buildGeneratedDocument(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  authorPersona?: AuthorPersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  styleGenome?: StyleGenomeConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
  imageFragments?: ImageFragmentContext[];
  historyReferences?: HistoryReferenceContext[];
  deepWritingGuide?: string;
}) {
  const [writePrompt, auditPrompt] = await Promise.all([
    loadPrompt("document_write"),
    loadPrompt("banned_word_audit"),
  ]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "当前没有碎片，请根据标题先搭一版简洁骨架。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const authorPersonaGuide = buildAuthorPersonaGuide(input.authorPersona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const styleGuide = buildStyleGuide(input.styleGenome);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const imageGuide = buildImageGuide(input.imageFragments);
  const historyGuide = buildHistoryReferenceGuide(input.historyReferences);
  const deepWritingGuide = input.deepWritingGuide?.trim() ? input.deepWritingGuide.trim() : "";

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    authorPersonaGuide,
    writingStyleGuide,
    styleGuide,
    outlineGuide,
    knowledgeGuide,
    imageGuide,
    historyGuide,
    deepWritingGuide,
    "请基于以下事实碎片输出一篇中文 Markdown 正文。",
    "如果需要引用历史已发布文章，只能自然写进相关段落，不要生成“相关文章”或“延伸阅读”区块。",
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
      authorPersonaGuide,
      writingStyleGuide,
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
      authorPersonaGuide,
      writingStyleGuide,
      styleGuide,
      outlineGuide,
      knowledgeGuide,
      imageGuide,
      historyGuide,
      deepWritingGuide,
    });
  }
}

function buildLocalRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  command: string;
  authorPersonaGuide?: string;
  writingStyleGuide?: string;
  styleGuide?: string | null;
  outlineGuide?: string;
  knowledgeGuide?: string;
}) {
  const base = input.markdownContent.trim() || buildLocalDraft({
    title: input.title,
    fragments: input.fragments,
    bannedWords: input.bannedWords,
    prompt: "先根据当前命令生成一版可继续编辑的骨架。",
    authorPersonaGuide: input.authorPersonaGuide,
    writingStyleGuide: input.writingStyleGuide,
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
  authorPersona?: AuthorPersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
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
  const authorPersonaGuide = buildAuthorPersonaGuide(input.authorPersona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const styleGuide = buildStyleGuide(input.styleGenome);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);

  const writerUserPrompt = [
    `标题：${input.title}`,
    `编辑命令：${input.command}`,
    `禁用词：${bannedWordsText}`,
    authorPersonaGuide,
    writingStyleGuide,
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
      authorPersonaGuide,
      writingStyleGuide,
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
      authorPersonaGuide,
      writingStyleGuide,
      styleGuide,
      outlineGuide,
      knowledgeGuide,
    });
  }
}

function buildLocalFactCheckRewrite(input: {
  markdownContent: string;
  checks: Array<{ claim: string; status: string; suggestion: string }>;
  claimDecisions?: Array<{ claim: string; action: string; note?: string }>;
  evidenceCards?: Array<{
    claim: string;
    supportLevel?: string;
    evidenceItems?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
  }>;
  bannedWords: string[];
}) {
  let next = input.markdownContent.trim();
  const decisionMap = new Map(
    (input.claimDecisions ?? [])
      .map((item) => [String(item.claim || "").trim(), String(item.action || "").trim()] as const)
      .filter(([claim, action]) => Boolean(claim) && Boolean(action)),
  );
  for (const check of input.checks) {
    const claim = check.claim.trim();
    if (!claim || !next.includes(claim)) {
      continue;
    }
    const evidenceCard = input.evidenceCards?.find((item) => String(item.claim || "").trim() === claim) ?? null;
    const evidenceTitle = String(evidenceCard?.evidenceItems?.[0]?.title || "").trim();
    const decision = decisionMap.get(claim) || (check.status === "needs_source" ? "source" : check.status === "risky" ? "soften" : "keep");
    if (decision === "remove") {
      next = next.replace(claim, "这一判断已因证据不足暂时删除");
      continue;
    }
    if (decision === "source") {
      next = next.replace(claim, evidenceTitle ? `据${evidenceTitle}等现有材料，${claim}` : `据现有材料判断，${claim}`);
      continue;
    }
    if (decision === "soften" || decision === "mark_opinion") {
      next = next.replace(claim, evidenceTitle ? `结合${evidenceTitle}等现有材料，${claim}` : `${claim}，这一判断仍需补充证据`);
    }
  }
  return sanitizeBannedWords(next, input.bannedWords);
}

function applyTargetedRewrites(markdownContent: string, rewrites: Array<{ original: string; revised: string }>) {
  let next = markdownContent;
  for (const rewrite of rewrites) {
    const original = String(rewrite.original || "").trim();
    const revised = String(rewrite.revised || "").trim();
    if (!original || !revised || original === revised) {
      continue;
    }
    next = next.replace(original, revised);
  }
  return next;
}

function buildLocalProsePolishRewrite(input: {
  markdownContent: string;
  rewrittenLead?: string;
  issues: Array<{ example: string; suggestion: string }>;
  bannedWords: string[];
}) {
  let next = input.markdownContent.trim();
  const firstLine = next.split("\n").find((line) => line.trim()) || "";
  if (input.rewrittenLead?.trim()) {
    if (firstLine) {
      next = next.replace(firstLine, input.rewrittenLead.trim());
    } else {
      next = input.rewrittenLead.trim();
    }
  }

  for (const issue of input.issues) {
    const example = issue.example.trim();
    if (!example || !next.includes(example)) {
      continue;
    }
    if (/段落过长/.test(issue.suggestion) || example.length > 60) {
      next = next.replace(example, `${example}\n\n这里建议拆成更短的判断句与事实句。`);
      continue;
    }
    next = next.replace(example, `${example}（建议：${issue.suggestion.trim()}）`);
  }

  return sanitizeBannedWords(next, input.bannedWords);
}

export async function buildFactCheckTargetedRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  checks: Array<{ claim: string; status: string; suggestion: string }>;
  claimDecisions?: Array<{ claim: string; action: string; note?: string }>;
  evidenceCards?: Array<{
    claim: string;
    supportLevel?: string;
    evidenceItems?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
  }>;
  authorPersona?: AuthorPersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  styleGenome?: StyleGenomeConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
}) {
  const claimDecisionMap = new Map(
    (input.claimDecisions ?? [])
      .map((item) => {
        const claim = String(item.claim || "").trim();
        const action = String(item.action || "").trim();
        const note = String(item.note || "").trim();
        return claim ? [claim, { action, note }] as const : null;
      })
      .filter(Boolean) as Array<readonly [string, { action: string; note: string }]>,
  );
  const riskyChecks = input.checks
    .filter((check) => String(check.claim || "").trim())
    .map((check) => {
      const claim = String(check.claim || "").trim();
      const status = String(check.status || "").trim();
      const decision = claimDecisionMap.get(claim);
      const defaultAction = status === "needs_source" ? "source" : status === "risky" ? "soften" : "keep";
      return {
        ...check,
        claim,
        status,
        action: decision?.action || defaultAction,
        note: decision?.note || "",
      };
    })
    .filter((check) => check.action !== "keep")
    .slice(0, 8);

  if (riskyChecks.length === 0) {
    return sanitizeBannedWords(input.markdownContent, input.bannedWords);
  }

  const [writePrompt, auditPrompt] = await Promise.all([
    loadPrompt("document_write"),
    loadPrompt("banned_word_audit"),
  ]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "暂无补充碎片，请只基于现有正文和核查建议做保守修订。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const authorPersonaGuide = buildAuthorPersonaGuide(input.authorPersona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const styleGuide = buildStyleGuide(input.styleGenome);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const evidenceGuide = riskyChecks
    .map((check, index) => {
      const evidenceCard = input.evidenceCards?.find((item) => String(item.claim || "").trim() === String(check.claim || "").trim());
      const evidenceItems = Array.isArray(evidenceCard?.evidenceItems) ? evidenceCard.evidenceItems : [];
      const evidenceText = evidenceItems.length
        ? evidenceItems
            .slice(0, 3)
            .map((item) =>
              [
                `标题：${String(item.title || "").trim() || "未命名证据"}`,
                String(item.excerpt || "").trim() ? `摘要：${String(item.excerpt || "").trim()}` : null,
                String(item.rationale || "").trim() ? `用途：${String(item.rationale || "").trim()}` : null,
                String(item.sourceUrl || "").trim() ? `链接：${String(item.sourceUrl || "").trim()}` : null,
              ].filter(Boolean).join("；"),
            )
            .join(" | ")
        : "暂无命中证据，请保守弱化表达。";
      return `${index + 1}. 对应表述：${check.claim}\n当前状态：${check.status}\n处理策略：${check.action}\n补充备注：${check.note || "无"}\n证据强度：${String(evidenceCard?.supportLevel || "missing")}\n可用证据：${evidenceText}`;
    })
    .join("\n\n");

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    authorPersonaGuide,
    writingStyleGuide,
    styleGuide,
    outlineGuide,
    knowledgeGuide,
    "请只针对下列高风险表述做最小必要修订，返回 JSON，不要返回全文，不要解释。",
    '字段：{"rewrites":[{"original":"原句或原表述","revised":"修订后的句子"}]}',
    "要求：",
    "1. 只改高风险句子，不改其它句子。",
    "2. 优先把绝对判断改成更稳妥的表述，或补充“据现有材料/公开信息”等限定语。",
    "3. revised 必须是可以直接替换 original 的完整句子或完整表述。",
    "4. 如果已有命中证据，优先吸收证据摘要里的来源锚点；如果证据不足，只做保守弱化，不要编造来源。",
    "",
    `当前正文：\n${input.markdownContent || "(当前为空)"}`,
    "",
    `待处理表述：\n${riskyChecks.map((check, index) => `${index + 1}. 原表述：${check.claim}\n状态：${check.status}\n建议：${check.suggestion}\n处理策略：${check.action}\n补充备注：${check.note || "无"}`).join("\n\n")}`,
    "",
    evidenceGuide ? `对应证据摘要卡：\n${evidenceGuide}` : null,
    "",
    `可用事实：\n- ${fragmentText}`,
  ].filter(Boolean).join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "documentWrite",
      systemPrompt: writePrompt,
      userPrompt: writerUserPrompt,
      temperature: 0.2,
    });

    const parsed = JSON.parse(
      drafted.text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || drafted.text.trim(),
    ) as { rewrites?: Array<{ original?: string; revised?: string }> };

    const rewrites = Array.isArray(parsed.rewrites)
      ? parsed.rewrites
          .map((item) => ({
            original: String(item?.original || "").trim(),
            revised: String(item?.revised || "").trim(),
          }))
          .filter((item) => item.original && item.revised)
      : [];

    if (rewrites.length === 0) {
      return buildLocalFactCheckRewrite({
        markdownContent: input.markdownContent,
        checks: riskyChecks,
        claimDecisions: riskyChecks.map((check) => ({ claim: check.claim, action: check.action, note: check.note })),
        evidenceCards: input.evidenceCards,
        bannedWords: input.bannedWords,
      });
    }

    const patched = applyTargetedRewrites(input.markdownContent, rewrites);
    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校正文：\n${patched}`,
      "",
      `禁用词：${bannedWordsText}`,
      authorPersonaGuide,
      writingStyleGuide,
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
    return buildLocalFactCheckRewrite({
      markdownContent: input.markdownContent,
      checks: riskyChecks,
      claimDecisions: riskyChecks.map((check) => ({ claim: check.claim, action: check.action, note: check.note })),
      evidenceCards: input.evidenceCards,
      bannedWords: input.bannedWords,
    });
  }
}

export async function buildProsePolishTargetedRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  rewrittenLead?: string | null;
  issues: Array<{ type?: string; example: string; suggestion: string }>;
  punchlines?: string[];
  rhythmAdvice?: string[];
  authorPersona?: AuthorPersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  styleGenome?: StyleGenomeConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
}) {
  const targetedIssues = input.issues
    .filter((issue) => String(issue.example || "").trim() || String(issue.suggestion || "").trim())
    .slice(0, 6);

  if (targetedIssues.length === 0 && !String(input.rewrittenLead || "").trim()) {
    return sanitizeBannedWords(input.markdownContent, input.bannedWords);
  }

  const [writePrompt, auditPrompt] = await Promise.all([
    loadPrompt("document_write"),
    loadPrompt("banned_word_audit"),
  ]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "暂无补充碎片，请只基于现有正文和润色建议做局部调整。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const authorPersonaGuide = buildAuthorPersonaGuide(input.authorPersona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const styleGuide = buildStyleGuide(input.styleGenome);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const punchlineText = (input.punchlines || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  const rhythmAdviceText = (input.rhythmAdvice || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    authorPersonaGuide,
    writingStyleGuide,
    styleGuide,
    outlineGuide,
    knowledgeGuide,
    "请只针对下列文笔问题做局部修订，返回 JSON，不要返回全文，不要解释。",
    '字段：{"rewrites":[{"original":"原句或原段","revised":"修订后的句子或段落"}]}',
    "要求：",
    "1. 只改命中的句子或段落，不改其它部分。",
    "2. 优先优化开头抓力、长句拆分、节奏和表达力度。",
    "3. 保留原文事实，不要新增不存在的数据、案例或判断。",
    "4. revised 必须能直接替换 original。",
    "",
    `当前正文：\n${input.markdownContent || "(当前为空)"}`,
    "",
    String(input.rewrittenLead || "").trim() ? `首段改写建议：${String(input.rewrittenLead).trim()}` : null,
    punchlineText.length ? `金句候选：${punchlineText.join("；")}` : null,
    rhythmAdviceText.length ? `节奏建议：${rhythmAdviceText.join("；")}` : null,
    targetedIssues.length
      ? `重点问题：\n${targetedIssues.map((issue, index) => `${index + 1}. 类型：${String(issue.type || "").trim() || "未命名问题"}\n原文示例：${issue.example}\n建议：${issue.suggestion}`).join("\n\n")}`
      : null,
    "",
    `可用事实：\n- ${fragmentText}`,
  ].filter(Boolean).join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "documentWrite",
      systemPrompt: writePrompt,
      userPrompt: writerUserPrompt,
      temperature: 0.25,
    });

    const parsed = JSON.parse(
      drafted.text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || drafted.text.trim(),
    ) as { rewrites?: Array<{ original?: string; revised?: string }> };

    const rewrites = Array.isArray(parsed.rewrites)
      ? parsed.rewrites
          .map((item) => ({
            original: String(item?.original || "").trim(),
            revised: String(item?.revised || "").trim(),
          }))
          .filter((item) => item.original && item.revised)
      : [];

    if (rewrites.length === 0) {
      return buildLocalProsePolishRewrite({
        markdownContent: input.markdownContent,
        rewrittenLead: input.rewrittenLead || undefined,
        issues: targetedIssues.map((issue) => ({ example: issue.example, suggestion: issue.suggestion })),
        bannedWords: input.bannedWords,
      });
    }

    const patched = applyTargetedRewrites(input.markdownContent, rewrites);
    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校正文：\n${patched}`,
      "",
      `禁用词：${bannedWordsText}`,
      authorPersonaGuide,
      writingStyleGuide,
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
    return buildLocalProsePolishRewrite({
      markdownContent: input.markdownContent,
      rewrittenLead: input.rewrittenLead || undefined,
      issues: targetedIssues.map((issue) => ({ example: issue.example, suggestion: issue.suggestion })),
      bannedWords: input.bannedWords,
    });
  }
}
