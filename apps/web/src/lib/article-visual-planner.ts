import { getArticleNodes } from "./article-outline";
import { detectArticleViralMode, type ArticleViralMode } from "./article-viral-modes";
import { getArticleStageArtifact } from "./article-stage-artifacts";
import { DEFAULT_ARTICLE_NODE_TITLES, isInternalArticleStructureLabel, sanitizeUserVisibleVisualCaption } from "./article-structure-labels";
import { chooseBaoyuCoverPreset, chooseBaoyuInlinePreset } from "./article-visual-presets";
import { buildArticleVisualPromptManifest } from "./article-visual-prompts";
import type { ArticleVisualBrief } from "./article-visual-types";
import { buildViralVisualRhythmSlots, scoreVisualRhythmPosition } from "./article-viral-genome";

function stripMarkdown(text: string) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripInternalStructureLabels(text: string) {
  const withoutStandaloneLines = String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const normalized = line.replace(/\s+/g, "").trim();
      if (isInternalArticleStructureLabel(normalized)) {
        return "";
      }
      if (/来源类型|来源链接|页面说明|页面导航|抓取失败|登录\/注册|注册即代表同意|signin|login/i.test(line)) {
        return "";
      }
      return line;
    })
    .join("\n");
  return DEFAULT_ARTICLE_NODE_TITLES.reduce(
    (current, label) => current.replaceAll(label, " "),
    withoutStandaloneLines,
  )
    .replace(/\s+/g, " ")
    .trim();
}

function removeAsciiParentheticals(value: string) {
  return String(value || "")
    .replace(/[（(]\s*[A-Za-z0-9][A-Za-z0-9\s._/-]{0,48}\s*[）)]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasBrokenParentheses(value: string) {
  const open = (value.match(/[（(]/g) || []).length;
  const close = (value.match(/[）)]/g) || []).length;
  return open !== close;
}

function normalizeVisualLabel(value: string) {
  return removeAsciiParentheticals(value)
    .replace(/[“”"']/g, "")
    .replace(/\s*[,，。；;：:！!？?]\s*$/g, "")
    .replace(/^(而?不只是|不是|它不是|该分数由|该指标由|该工具由|由|于|是|把|将|让|用|当|如果|因为|所以|但是|同时|以及|其中|一个|一些|这个|那个)/, "")
    .replace(/^(Google|Ads|Quality|Score)\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableVisualLabel(value: string) {
  const normalized = normalizeVisualLabel(value);
  if (!normalized || hasBrokenParentheses(value)) return false;
  if (normalized.length < 2 || normalized.length > 16) return false;
  if (/^[A-Za-z0-9\s._/-]+$/.test(normalized)) return false;
  if (/^(Google|Ads|Quality|Score|组成部分|高于平均水平|平均水平|低于平均水平|它不是|而不只是|该分数)$/i.test(normalized)) return false;
  if (/分值范围|搜索广告系列|^级|^\d+$|^它不$|不作为|也不作为/.test(normalized)) return false;
  if (/来源|链接|页面|登录|注册|signin|login|zhihu|知乎/i.test(normalized)) return false;
  return /[\p{Script=Han}]/u.test(normalized);
}

function visualLabelScore(value: string) {
  let score = 0;
  if (/搜索意图|质量得分|质量分|预期点击率|广告相关性|落地页体验/.test(value)) score += 8;
  if (/关键词|出价|文案|竞争强度|匹配|诊断工具|绩效指标|竞价/.test(value)) score += 4;
  if (/核心|变量|阶段|路径|流程|模型|策略|风险|转化|出单/.test(value)) score += 3;
  if (/不只是|不是|不作为|而不|它不/.test(value)) score -= 5;
  if (value.length <= 8) score += 1;
  return score;
}

function extractVisualLabelCandidates(text: string) {
  const normalized = removeAsciiParentheticals(stripMarkdown(stripInternalStructureLabels(text)));
  const conceptSuffixes = [
    "意图",
    "关键词",
    "搜索词",
    "质量分",
    "质量得分",
    "点击率",
    "相关性",
    "落地页体验",
    "体验",
    "指标",
    "工具",
    "匹配",
    "查询",
    "竞价",
    "预算",
    "成本",
    "收益",
    "流量",
    "价值",
    "变量",
    "文案",
    "强度",
    "阶段",
    "路径",
    "模型",
    "流程",
    "风险",
    "策略",
    "案例",
    "冲突",
    "转化",
    "出单",
  ];
  const suffixPattern = new RegExp(`[\\p{Script=Han}A-Za-z0-9]{2,12}(?:${conceptSuffixes.join("|")})`, "gu");
  return [
    ...(normalized.match(suffixPattern) || []),
    ...normalized.split(/[，。！？；、,.!?;：:]|和|或|与|及|以及|并|也|则|是/g),
  ]
    .map(normalizeVisualLabel)
    .filter(isUsableVisualLabel);
}

function toAnchor(value: string, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function pickLabels(text: string, limit: number) {
  const candidates = extractVisualLabelCandidates(text)
    .filter((item) => !/^(这个|一个|如果|因为|所以|但是|然后|以及|可以|需要)$/.test(item));
  return [...new Set(candidates)]
    .map((item, index) => ({ item, index, score: visualLabelScore(item) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item)
    .slice(0, limit);
}

function pickSourceFacts(text: string, limit: number) {
  const sentences = stripMarkdown(stripInternalStructureLabels(text))
    .split(/[。！？.!?]\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .filter((item) => !/来源类型|来源链接|页面说明|页面导航|抓取失败|登录\/注册|注册即代表同意|signin|login|zhihu|知乎/i.test(item))
    .filter((item) => item.length <= 90 || /\d/.test(item));
  return [...new Set(sentences)].slice(0, limit);
}

function estimateInlineImageCount(markdown: string) {
  const plainLength = stripMarkdown(markdown).length;
  if (plainLength < 1200) return 1;
  if (plainLength < 2800) return 2;
  return 3;
}

async function resolveVisualPlanningSignals(input: {
  userId: number;
  articleId: number;
  title: string;
  markdown: string;
}) {
  const [outlineArtifact, deepWritingArtifact] = await Promise.all([
    getArticleStageArtifact(input.articleId, input.userId, "outlinePlanning").catch(() => null),
    getArticleStageArtifact(input.articleId, input.userId, "deepWriting").catch(() => null),
  ]);
  const outlinePayload = getRecord(outlineArtifact?.payload);
  const outlineSelection = getRecord(outlinePayload?.selection);
  const deepWritingPayload = getRecord(deepWritingArtifact?.payload);
  const viralGenomePack = getRecord(deepWritingPayload?.viralGenomePack);
  const viralMode = (() => {
    const explicitMode = getString(viralGenomePack?.mode);
    if (explicitMode === "power_shift_breaking" || explicitMode === "default") {
      return explicitMode as ArticleViralMode;
    }
    return detectArticleViralMode({
      title: input.title,
      markdownContent: [
        input.title,
        stripMarkdown(input.markdown).slice(0, 2000),
        getString(outlinePayload?.centralThesis),
        getString(deepWritingPayload?.centralThesis),
        getString(deepWritingPayload?.writingAngle),
        getString(outlineSelection?.selectedTitle),
      ].filter(Boolean).join("\n"),
      businessQuestions: Array.isArray(viralGenomePack?.businessQuestions)
        ? (viralGenomePack?.businessQuestions as Array<string | null | undefined>)
        : [],
    });
  })();

  return {
    viralMode,
    coverHook:
      getString(outlinePayload?.coverPromise)
      || getString(outlineSelection?.selectedOpeningHook)
      || getString(outlinePayload?.openingHook)
      || getString(deepWritingPayload?.openingStrategy)
      || getString(viralGenomePack?.firstScreenPromise)
      || getString(getRecord(deepWritingPayload?.viralNarrativePlan)?.sceneEntry)
      || getString(outlinePayload?.coverSceneSeed)
      || null,
    visualAngle:
      getString(outlinePayload?.coverVisualAngle)
      || getString(deepWritingPayload?.writingAngle)
      || getString(outlinePayload?.centralThesis)
      || getString(getRecord(deepWritingPayload?.viralNarrativePlan)?.coreMotif)
      || input.title,
    targetEmotionHint:
      getString(outlinePayload?.coverTargetEmotion)
      || getString(outlineSelection?.selectedTargetEmotion)
      || getString(outlinePayload?.targetEmotion)
      || getString(deepWritingPayload?.targetEmotion)
      || null,
    coverSceneSeed:
      getString(outlinePayload?.coverSceneSeed)
      || getString(outlineSelection?.selectedOpeningHook)
      || null,
  };
}

function chooseCoverTextLevel(input: {
  title: string;
  presetType: ArticleVisualBrief["visualType"];
}) {
  const compactTitle = String(input.title || "").replace(/\s+/g, "");
  const isShortConcept = compactTitle.length <= 8 && !/[，。！？:：]/.test(compactTitle);
  if (input.presetType === "typography") {
    return "title-only" as const;
  }
  if (input.presetType === "conceptual" && isShortConcept) {
    return "title-only" as const;
  }
  return "none" as const;
}

function buildUserFacingNodeTitle(input: {
  nodeTitle: string;
  nodeText: string;
  articleTitle: string;
  index: number;
}) {
  const cleanNodeTitle = sanitizeUserVisibleVisualCaption(input.nodeTitle);
  const label = pickLabels(input.nodeText, 1)[0];
  if (cleanNodeTitle && cleanNodeTitle.length <= 18 && !cleanNodeTitle.includes("...")) {
    return cleanNodeTitle;
  }
  if (label) {
    return label;
  }
  if (cleanNodeTitle) {
    return cleanNodeTitle.replace(/[。！？；，,].*$/g, "").slice(0, 18);
  }
  const sourceFact = pickSourceFacts(input.nodeText, 1)[0];
  if (sourceFact) {
    return sourceFact.replace(/[。！？；，,].*$/g, "").slice(0, 18);
  }
  return `${input.articleTitle.slice(0, 14)}配图 ${input.index + 1}`;
}

function forceRequiredInlinePreset(input: {
  base: ReturnType<typeof chooseBaoyuInlinePreset>;
  hasInfographic: boolean;
  hasComic: boolean;
}) {
  if (!input.hasInfographic) {
    return {
      ...input.base,
      scope: "infographic" as const,
      baoyuSkill: "baoyu-infographic" as const,
      type: input.base.type === "comic" ? "infographic" as const : input.base.type,
      layoutCode: input.base.layoutCode || "dense-modules",
      style: input.base.style === "editorial" ? "notion" as const : input.base.style,
      palette: input.base.palette === "warm" ? "macaron" as const : input.base.palette,
      aspectRatio: "3:4",
    };
  }
  if (!input.hasComic) {
    return {
      ...input.base,
      scope: "comic" as const,
      baoyuSkill: "baoyu-comic" as const,
      type: "comic" as const,
      layoutCode: "knowledge-comic",
      style: "editorial" as const,
      palette: input.base.palette === "mono" ? "warm" as const : input.base.palette,
      aspectRatio: "3:4",
    };
  }
  return input.base;
}

export async function planArticleVisualBriefs(input: {
  userId: number;
  articleId: number;
  title: string;
  markdown: string;
  includeCover?: boolean;
  includeInline?: boolean;
  outputResolution?: string | null;
}) {
  const outputResolution = String(input.outputResolution || process.env.ARTICLE_INLINE_IMAGES_OUTPUT_RESOLUTION || process.env.COVER_IMAGE_OUTPUT_RESOLUTION || "1K").trim() || "1K";
  const briefs: ArticleVisualBrief[] = [];
  const plain = stripMarkdown(input.markdown);
  const planningSignals = await resolveVisualPlanningSignals({
    userId: input.userId,
    articleId: input.articleId,
    title: input.title,
    markdown: input.markdown,
  });
  const viralMode = planningSignals.viralMode;

  if (input.includeCover !== false) {
    const preset = chooseBaoyuCoverPreset({
      title: input.title,
      markdown: input.markdown,
    });
    const coverBrief: ArticleVisualBrief = {
      userId: input.userId,
      articleId: input.articleId,
      articleNodeId: null,
      visualScope: "cover",
      targetAnchor: "cover",
      baoyuSkill: "baoyu-cover-image",
      visualType: preset.type,
      paletteCode: preset.palette,
      renderingCode: preset.rendering,
      textLevel: chooseCoverTextLevel({
        title: input.title,
        presetType: preset.type,
      }),
      moodCode: preset.mood,
      fontCode: preset.font,
      aspectRatio: "16:9",
      outputResolution,
      title: input.title,
      purpose: viralMode === "power_shift_breaking"
        ? "建立王座更替/资本战点击心智，把胜负变化、账本压力或路线对撞压成一个封面画面"
        : "建立文章点击心智，提炼一个与核心观点强相关的封面隐喻",
      viralMode,
      altText: `${input.title}的文章封面图`,
      coverHook: planningSignals.coverHook || null,
      visualAngle: planningSignals.visualAngle || null,
      targetEmotionHint: planningSignals.targetEmotionHint || null,
      caption: null,
      labels: pickLabels([input.title, plain.slice(0, 160)].join(" "), 5),
      sourceFacts: pickSourceFacts(plain, 3),
      status: "prompt_ready",
    };
    const prompt = buildArticleVisualPromptManifest(coverBrief);
    briefs.push({
      ...coverBrief,
      promptText: prompt.prompt,
      negativePrompt: prompt.negativePrompt,
      promptHash: prompt.promptHash,
      promptManifest: prompt.manifest,
    });
  }

  if (input.includeInline !== false) {
    const nodes = await getArticleNodes(input.articleId);
    const inlineImageCount = Math.max(2, Math.min(4, estimateInlineImageCount(input.markdown)));
    const visualRhythmSlots = buildViralVisualRhythmSlots(inlineImageCount);
    const candidates = nodes
      .filter((node) => node.title.trim())
      .map((node, index, allNodes) => {
        const nodeText = [node.title, node.description || "", ...node.fragments.map((fragment) => fragment.distilledContent)].join("\n");
        const substantiveText = [node.description || "", ...node.fragments.map((fragment) => fragment.distilledContent)].join("\n");
        const rhythmScore = scoreVisualRhythmPosition({
          nodeIndex: index,
          totalNodes: allNodes.length,
          slots: visualRhythmSlots,
        });
        return {
          node,
          index,
        text: nodeText,
        substantiveText,
        hasUserFacingTitle: !isInternalArticleStructureLabel(node.title),
        hasSubstantiveText: stripMarkdown(substantiveText).length >= 24,
        score:
            (viralMode === "power_shift_breaking" && /营收|ARR|估值|融资|IPO|现金流|利润|周活|算力|合同|股价|投资者|反超|超越|碾压|时间差|CFO|CEO|董事会|路线分歧|内讧|裂痕/i.test(nodeText) ? 6 : 0)
            + (/步骤|流程|路径|框架|模型|对比|清单|工具|资源|趋势|阶段|机制|方法论/i.test(nodeText) ? 4 : 1)
            + Math.min(3, Math.floor(stripMarkdown(nodeText).length / 80))
            + rhythmScore,
        };
      })
      .filter((candidate) => candidate.hasUserFacingTitle || candidate.hasSubstantiveText)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, inlineImageCount)
      .sort((left, right) => left.index - right.index);

    for (const [index, candidate] of candidates.entries()) {
      const rhythmSlot = visualRhythmSlots[Math.min(index, visualRhythmSlots.length - 1)] || null;
      const userFacingTitle = buildUserFacingNodeTitle({
        nodeTitle: candidate.node.title,
        nodeText: candidate.hasUserFacingTitle ? candidate.text : candidate.substantiveText,
        articleTitle: input.title,
        index,
      });
      const caption = sanitizeUserVisibleVisualCaption(candidate.node.title);
      const basePreset = chooseBaoyuInlinePreset({
        title: userFacingTitle,
        text: candidate.text,
        index,
      });
      const preset = forceRequiredInlinePreset({
        base: basePreset,
        hasInfographic: briefs.some((brief) => brief.visualScope === "infographic"),
        hasComic: briefs.some((brief) => brief.visualScope === "comic"),
      });
      const visualText = candidate.hasUserFacingTitle ? candidate.text : candidate.substantiveText;
      const sourceFacts = pickSourceFacts(visualText || plain, 4);
      const labels = pickLabels([userFacingTitle, visualText].join(" "), 7);
      const brief: ArticleVisualBrief = {
        userId: input.userId,
        articleId: input.articleId,
        articleNodeId: candidate.node.id,
        visualScope: preset.scope,
        targetAnchor: candidate.hasUserFacingTitle
          ? toAnchor(candidate.node.title, `node-${candidate.node.id}`)
          : toAnchor(userFacingTitle, `node-${candidate.node.id}`),
        baoyuSkill: preset.baoyuSkill,
        visualType: preset.type,
        layoutCode: preset.layoutCode,
        styleCode: preset.style,
        paletteCode: preset.palette,
        renderingCode: null,
        textLevel: preset.scope === "infographic" || preset.scope === "comic" ? "text-rich" : "title-subtitle",
        moodCode: "balanced",
        fontCode: "clean",
        aspectRatio: preset.aspectRatio,
        outputResolution,
        title: userFacingTitle,
        purpose: viralMode === "power_shift_breaking"
          ? (
            preset.scope === "comic"
              ? "用知识漫画解释一处路线分歧、组织裂痕或资本压力，让冲突更容易被看懂和转发"
              : preset.scope === "infographic"
                ? "把该小节的胜负数字、成本差、时间差或路线对撞转成可保存、可转发的看板式信息图"
                : (rhythmSlot?.purpose || "把该小节的关键信号转成可保存、可转发的文中视觉资产")
          )
          : rhythmSlot?.purpose || (preset.scope === "comic" ? "用知识漫画解释一个读者容易误判的关键概念" : "把该小节的关键信息转化为可保存、可转发的文中视觉资产"),
        viralMode,
        altText: `${userFacingTitle}的文中配图`,
        caption,
        labels,
        sourceFacts,
        status: "prompt_ready",
      };
      const prompt = buildArticleVisualPromptManifest(brief);
      briefs.push({
        ...brief,
        promptText: prompt.prompt,
        negativePrompt: prompt.negativePrompt,
        promptHash: prompt.promptHash,
        promptManifest: prompt.manifest,
      });
    }
  }

  return briefs;
}
