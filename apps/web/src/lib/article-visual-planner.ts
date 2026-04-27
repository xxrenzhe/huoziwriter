import { getArticleNodes } from "./article-outline";
import { isInternalArticleStructureLabel, sanitizeUserVisibleVisualCaption } from "./article-structure-labels";
import { chooseBaoyuCoverPreset, chooseBaoyuInlinePreset } from "./article-visual-presets";
import { buildArticleVisualPromptManifest } from "./article-visual-prompts";
import type { ArticleVisualBrief } from "./article-visual-types";

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
  const candidates = stripMarkdown(text)
    .split(/[，。！？；、,.!?;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 12)
    .filter((item) => !/^(这个|一个|如果|因为|所以|但是|然后|以及|可以|需要)$/.test(item));
  return [...new Set(candidates)].slice(0, limit);
}

function pickSourceFacts(text: string, limit: number) {
  const sentences = stripMarkdown(text)
    .split(/[。！？.!?]\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .filter((item) => item.length <= 90 || /\d/.test(item));
  return [...new Set(sentences)].slice(0, limit);
}

function estimateInlineImageCount(markdown: string) {
  const plainLength = stripMarkdown(markdown).length;
  if (plainLength < 1200) return 1;
  if (plainLength < 2800) return 2;
  return 3;
}

function buildUserFacingNodeTitle(input: {
  nodeTitle: string;
  nodeText: string;
  articleTitle: string;
  index: number;
}) {
  const cleanNodeTitle = sanitizeUserVisibleVisualCaption(input.nodeTitle);
  if (cleanNodeTitle) {
    return cleanNodeTitle;
  }
  const sourceFact = pickSourceFacts(input.nodeText, 1)[0];
  if (sourceFact) {
    return sourceFact.length > 28 ? `${sourceFact.slice(0, 28)}...` : sourceFact;
  }
  const label = pickLabels(input.nodeText, 1)[0];
  if (label) {
    return label;
  }
  return `${input.articleTitle}关键图解 ${input.index + 1}`;
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
      textLevel: "title-only",
      moodCode: preset.mood,
      fontCode: preset.font,
      aspectRatio: "16:9",
      outputResolution,
      title: input.title,
      purpose: "建立文章点击心智，提炼一个与核心观点强相关的封面隐喻",
      altText: `${input.title}的文章封面图`,
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
    const candidates = nodes
      .filter((node) => node.title.trim())
      .map((node, index) => {
        const nodeText = [node.title, node.description || "", ...node.fragments.map((fragment) => fragment.distilledContent)].join("\n");
        const substantiveText = [node.description || "", ...node.fragments.map((fragment) => fragment.distilledContent)].join("\n");
        return {
          node,
          index,
          text: nodeText,
          hasUserFacingTitle: !isInternalArticleStructureLabel(node.title),
          hasSubstantiveText: stripMarkdown(substantiveText).length >= 24,
          score:
            (/步骤|流程|路径|框架|模型|对比|清单|工具|资源|趋势|阶段|机制|方法论/i.test(nodeText) ? 4 : 1)
            + Math.min(3, Math.floor(stripMarkdown(nodeText).length / 80)),
        };
      })
      .filter((candidate) => candidate.hasUserFacingTitle || candidate.hasSubstantiveText)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, Math.max(1, Math.min(4, estimateInlineImageCount(input.markdown))));

    for (const [index, candidate] of candidates.entries()) {
      const userFacingTitle = buildUserFacingNodeTitle({
        nodeTitle: candidate.node.title,
        nodeText: candidate.text,
        articleTitle: input.title,
        index,
      });
      const caption = sanitizeUserVisibleVisualCaption(candidate.node.title);
      const preset = chooseBaoyuInlinePreset({
        title: userFacingTitle,
        text: candidate.text,
        index,
      });
      const sourceFacts = pickSourceFacts(candidate.text || plain, 4);
      const labels = pickLabels([userFacingTitle, candidate.text].join(" "), 7);
      const brief: ArticleVisualBrief = {
        userId: input.userId,
        articleId: input.articleId,
        articleNodeId: candidate.node.id,
        visualScope: preset.scope,
        targetAnchor: toAnchor(candidate.node.title, `node-${candidate.node.id}`),
        baoyuSkill: preset.baoyuSkill,
        visualType: preset.type,
        layoutCode: preset.layoutCode,
        styleCode: preset.style,
        paletteCode: preset.palette,
        renderingCode: null,
        textLevel: preset.scope === "infographic" ? "text-rich" : "title-subtitle",
        moodCode: "balanced",
        fontCode: "clean",
        aspectRatio: preset.aspectRatio,
        outputResolution,
        title: userFacingTitle,
        purpose: preset.scope === "diagram" ? "用结构图降低读者理解成本" : "把该小节的关键信息转化为可保存、可转发的文中视觉资产",
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
