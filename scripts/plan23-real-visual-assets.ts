#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { attachFragmentToArticleNode, getArticleNodes, syncArticleNodesFromOutline } from "../apps/web/src/lib/article-outline";
import { generateArticleVisualAsset } from "../apps/web/src/lib/article-image-generator";
import { insertArticleVisualAssetsIntoMarkdown } from "../apps/web/src/lib/article-image-inserter";
import { planArticleVisualBriefs } from "../apps/web/src/lib/article-visual-planner";
import { buildArticleVisualPromptManifest } from "../apps/web/src/lib/article-visual-prompts";
import { listArticleVisualAssets, replaceArticleVisualBriefs } from "../apps/web/src/lib/article-visual-repository";
import { evaluateArticleVisualQuality } from "../apps/web/src/lib/article-visual-quality";
import type { ArticleVisualAsset, ArticleVisualBrief } from "../apps/web/src/lib/article-visual-types";
import { findUserByUsername } from "../apps/web/src/lib/auth";
import { closeDatabase } from "../apps/web/src/lib/db";
import { getGlobalCoverImageEngineSecret } from "../apps/web/src/lib/image-engine";
import { ensureBootstrapData, createArticle, createFragment, getArticleById, saveArticle } from "../apps/web/src/lib/repositories";
import { runPendingMigrations } from "./db-flow";
import { classifyProviderFailure, getTimestampTag, loadDotenv, normalizeString, readOption, sanitizeDiagnosticText } from "./plan22-real-automation-support";

type VisualAcceptanceReport = {
  generatedAt: string;
  status: "passed" | "failed";
  reportPathJson: string;
  reportPathMarkdown: string;
  user: {
    username: string;
    userId: number;
  };
  imageEngine: {
    provider: string;
    model: string;
    baseUrl: string;
    outputResolution: string;
    apiKeyPreview: string;
  };
  article: {
    id: number;
    title: string;
    markdownInserted: boolean;
    htmlLength: number;
  };
  visualBriefs: Array<{
    id: number | null;
    scope: string;
    skill: string;
    type: string;
    promptHash: string | null;
    status: string | null;
  }>;
  generatedAssets: Array<{
    assetFileId: number;
    assetType: string;
    imageUrl: string;
    promptHash: string | null;
    accessible: boolean;
  }>;
  quality: {
    status: string;
    blockerCount: number;
    warningCount: number;
    blockers: string[];
    warnings: string[];
  };
  acceptanceIssues: string[];
};

const ARTIFACT_DIR = path.resolve(process.cwd(), "artifacts/plan23");
const DEFAULT_MARKDOWN = [
  "# AI 产品文章不该只靠一张封面图",
  "",
  "真正能稳定交付的文章生产线，不是把选题、写作、事实核查、排版和发布拆成一堆按钮，而是让系统在每个阶段都留下可追踪的决策依据。图片也是同一个逻辑：封面负责点击心智，文中图负责降低理解成本，信息图负责形成保存价值。",
  "",
  "## 从素材到发布的闭环流程",
  "",
  "一条可用的链路至少要包含素材输入、选题判断、受众分析、大纲规划、深度写作、事实核查、文笔润色、视觉规划、图片生成、微信排版和草稿同步。任何一个环节只靠临时补救，都容易在终稿阶段打断节奏。流程图需要展示这些节点如何首尾相接，而不是抽象地画一个“AI 大脑”。",
  "",
  "## 三类工具清单和指标面板",
  "",
  "第一类工具是素材入口，包括 IMA 知识库、高价值 RSS、官方博客、V2EX 与社区讨论；第二类工具是质量闸门，包括事实核查、信源覆盖、AI 噪声检测和语言守卫；第三类工具是发布资产，包括封面图、文中图、SVG 图解、微信 HTML 和草稿箱记录。信息图必须保留这些真实标签，不能新增未经正文支撑的数据。",
  "",
  "## 旧流程和新流程的取舍对比",
  "",
  "旧流程的主要问题不是人做得慢，而是每一步都需要重新理解上下文：选题人想一套，写作者想一套，排版和发布又补一套。新流程的关键变化是把上下文沉淀成 prompt manifest、sourceFacts、visual brief 和 publish guard。这样视觉资产不再是临门一脚的装饰，而是文章结构的一部分。",
  "",
  "## 为什么验收必须使用真实图片引擎",
  "",
  "如果只用 mock 图片，系统只能证明接口能返回数据，不能证明 COVER_IMAGE_BASE_URL、模型、图片尺寸、对象存储衍生图和微信可访问 URL 真的可用。本次验收必须至少真实生成一张封面和一张文中信息图，同时保留一张本地 SVG 图解，用来验证低成本图解路径。",
].join("\n");

function maskSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function getLocalAssetPath(publicUrl: string) {
  const normalized = publicUrl.replace(/^\/+/, "");
  if (!normalized.startsWith("generated-assets/")) return null;
  return path.join(process.cwd(), "public", normalized);
}

async function isAssetAccessible(publicUrl: string) {
  if (!publicUrl) return false;
  if (publicUrl.startsWith("/")) {
    const localPath = getLocalAssetPath(publicUrl);
    return Boolean(localPath && fs.existsSync(localPath));
  }
  if (/^https?:\/\//i.test(publicUrl)) {
    try {
      const response = await fetch(publicUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(20_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  return /^data:image\//i.test(publicUrl);
}

function selectBriefsForAcceptance(briefs: ArticleVisualBrief[]) {
  const cover = briefs.find((brief) => brief.visualScope === "cover") ?? null;
  const diagram = briefs.find((brief) => brief.visualScope === "diagram") ?? null;
  const inlineImage = briefs.find((brief) => brief.visualScope !== "cover" && brief.visualScope !== "diagram") ?? null;
  return [cover, diagram, inlineImage].filter((brief): brief is ArticleVisualBrief => Boolean(brief));
}

function withPromptManifest(brief: ArticleVisualBrief) {
  const prompt = buildArticleVisualPromptManifest(brief);
  return {
    ...brief,
    promptText: prompt.prompt,
    negativePrompt: prompt.negativePrompt,
    promptHash: prompt.promptHash,
    promptManifest: prompt.manifest,
  };
}

function ensureAcceptanceBriefCoverage(input: {
  briefs: ArticleVisualBrief[];
  userId: number;
  articleId: number;
  outputResolution: string;
}) {
  const fallbackFacts = [
    "工具清单分为素材入口、质量闸门、发布资产三类，信息图标签必须来自正文。",
    "视觉资产必须记录 prompt manifest、sourceFacts、图片 URL 和可发布衍生图。",
  ];
  const normalizedBriefs = input.briefs.map((brief) => {
    if (brief.visualScope === "cover" || brief.sourceFacts.length > 0) {
      return brief;
    }
    return withPromptManifest({
      ...brief,
      sourceFacts: fallbackFacts,
      labels: brief.labels.length ? brief.labels : ["素材入口", "质量闸门", "发布资产"],
    });
  });
  const hasImageBackedInline = normalizedBriefs.some((brief) => brief.visualScope !== "cover" && brief.visualScope !== "diagram");
  if (hasImageBackedInline) {
    return normalizedBriefs;
  }
  return [
    ...normalizedBriefs,
    withPromptManifest({
      userId: input.userId,
      articleId: input.articleId,
      articleNodeId: null,
      visualScope: "infographic",
      targetAnchor: "三类工具清单和指标面板",
      baoyuSkill: "baoyu-infographic",
      visualType: "infographic",
      layoutCode: "dense-modules",
      styleCode: "notion",
      paletteCode: "macaron",
      renderingCode: null,
      textLevel: "text-rich",
      moodCode: "balanced",
      fontCode: "clean",
      aspectRatio: "3:4",
      outputResolution: input.outputResolution,
      title: "三类工具清单和指标面板",
      purpose: "用信息图沉淀素材入口、质量闸门和发布资产三类工具",
      altText: "文章生产线三类工具清单信息图",
      caption: "三类工具清单和指标面板",
      labels: ["素材入口", "质量闸门", "发布资产", "prompt manifest", "sourceFacts"],
      sourceFacts: fallbackFacts,
      status: "prompt_ready",
    }),
  ];
}

async function seedArticleForVisualAcceptance(input: {
  userId: number;
  title: string;
  markdown: string;
}) {
  const article = await createArticle(input.userId, input.title);
  if (!article) {
    throw new Error("创建验收文章失败");
  }
  await saveArticle({
    articleId: article.id,
    userId: input.userId,
    title: input.title,
    markdownContent: input.markdown,
  });
  const nodes = await syncArticleNodesFromOutline({
    articleId: article.id,
    sections: [
      {
        heading: "从素材到发布的闭环流程",
        goal: "用 SVG 流程图解释文章生产线如何避免终稿前补丁式返工",
        keyPoints: ["素材输入", "事实核查", "视觉规划", "微信排版"],
        evidenceHints: ["流程包含素材、写作、核查、视觉和发布五个关键节点"],
      },
      {
        heading: "三类工具清单和指标面板",
        goal: "用信息图沉淀工具清单与质量指标",
        keyPoints: ["素材入口", "质量闸门", "发布资产"],
        evidenceHints: ["正文明确列出三类工具和对应标签"],
      },
      {
        heading: "旧流程和新流程的取舍对比",
        goal: "对比旧流程上下文断裂和新流程 manifest 沉淀",
        keyPoints: ["上下文断裂", "prompt manifest", "sourceFacts", "publish guard"],
        evidenceHints: ["新流程通过 manifest、sourceFacts、visual brief 和 publish guard 保留上下文"],
      },
    ],
  });
  const factsByNode = [
    "流程包含素材输入、选题判断、写作、事实核查、视觉规划、微信排版和草稿同步。",
    "工具清单分为素材入口、质量闸门、发布资产三类，信息图标签必须来自正文。",
    "新流程通过 prompt manifest、sourceFacts、visual brief 和 publish guard 沉淀上下文。",
  ];
  for (const [index, node] of nodes.entries()) {
    const fragment = await createFragment({
      userId: input.userId,
      sourceType: "manual",
      title: node.title,
      rawContent: factsByNode[index] ?? factsByNode[0],
      distilledContent: factsByNode[index] ?? factsByNode[0],
      sourceMeta: {
        plan: "plan23-real-visual-assets",
        generatedAt: new Date().toISOString(),
      },
    }) as { id?: number } | null;
    if (fragment?.id) {
      await attachFragmentToArticleNode({
        articleId: article.id,
        nodeId: node.id,
        fragmentId: fragment.id,
      });
    }
  }
  const refreshed = await getArticleById(article.id, input.userId);
  if (!refreshed) {
    throw new Error("验收文章创建后不可读取");
  }
  return refreshed;
}

function buildMarkdownReport(report: VisualAcceptanceReport) {
  const lines = [
    "# Plan23 真实视觉资产验收报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 状态：${report.status}`,
    `- 用户：${report.user.username} (${report.user.userId})`,
    `- 图片引擎：${report.imageEngine.provider}/${report.imageEngine.model}`,
    `- Base URL：${report.imageEngine.baseUrl}`,
    `- 分辨率：${report.imageEngine.outputResolution}`,
    `- API Key：${report.imageEngine.apiKeyPreview}`,
    `- 文章：${report.article.title} (#${report.article.id})`,
    `- Markdown 已插图：${report.article.markdownInserted ? "yes" : "no"}`,
    `- HTML 长度：${report.article.htmlLength}`,
    "",
    "## Briefs",
    "",
    ...report.visualBriefs.map((brief) => `- ${brief.scope}/${brief.skill}/${brief.type}: id=${brief.id ?? "null"}, status=${brief.status ?? "null"}, promptHash=${brief.promptHash ?? "null"}`),
    "",
    "## Assets",
    "",
    ...report.generatedAssets.map((asset) => `- ${asset.assetType}: assetFileId=${asset.assetFileId}, accessible=${asset.accessible ? "yes" : "no"}, promptHash=${asset.promptHash ?? "null"}, url=${sanitizeDiagnosticText(asset.imageUrl)}`),
    "",
    "## Quality",
    "",
    `- status=${report.quality.status}, blockers=${report.quality.blockerCount}, warnings=${report.quality.warningCount}`,
  ];
  if (report.acceptanceIssues.length > 0) {
    lines.push("", "## Acceptance Issues", "");
    for (const issue of report.acceptanceIssues) {
      lines.push(`- ${sanitizeDiagnosticText(issue)}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  loadDotenv();
  await runPendingMigrations();
  await ensureBootstrapData();

  const username = readOption("--user") || "huozi";
  const title = readOption("--title") || "Plan23 视觉资产真实验收：AI 文章生产线如何避免终稿补丁";
  const markdown = readOption("--markdown") || DEFAULT_MARKDOWN;
  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error(`未找到用户 ${username}，请先运行 pnpm db:init 或指定 --user`);
  }
  const engine = await getGlobalCoverImageEngineSecret();
  if (!engine || !engine.isEnabled || !engine.baseUrl || !engine.model || !engine.apiKey) {
    throw new Error("未解析到可用 COVER_IMAGE_* 生图配置");
  }

  const article = await seedArticleForVisualAcceptance({
    userId: user.id,
    title,
    markdown,
  });
  const outputResolution = normalizeString(process.env.ARTICLE_INLINE_IMAGES_OUTPUT_RESOLUTION) || normalizeString(process.env.COVER_IMAGE_OUTPUT_RESOLUTION) || "1K";
  const planned = await planArticleVisualBriefs({
    userId: user.id,
    articleId: article.id,
    title: article.title,
    markdown: article.markdown_content,
    includeCover: true,
    includeInline: true,
    outputResolution,
  });
  const savedBriefs = await replaceArticleVisualBriefs({
    userId: user.id,
    articleId: article.id,
    briefs: ensureAcceptanceBriefCoverage({
      briefs: planned,
      userId: user.id,
      articleId: article.id,
      outputResolution,
    }),
  });
  const selectedBriefs = selectBriefsForAcceptance(savedBriefs);
  const generated = [];
  for (const brief of selectedBriefs) {
    try {
      generated.push(await generateArticleVisualAsset(brief));
    } catch (error) {
      const failure = classifyProviderFailure(error);
      throw new Error(`${brief.visualScope}/${brief.baoyuSkill} 生成失败：${failure.userMessage} ${failure.detail}`);
    }
  }
  await insertArticleVisualAssetsIntoMarkdown({
    userId: user.id,
    articleId: article.id,
    title: article.title,
    markdown: article.markdown_content,
  });

  const [assets, quality, finalArticle] = await Promise.all([
    listArticleVisualAssets(user.id, article.id),
    evaluateArticleVisualQuality({
      userId: user.id,
      articleId: article.id,
      requireCover: true,
    }),
    getArticleById(article.id, user.id),
  ]);
  const generatedAssets = await Promise.all(generated.map(async (item) => ({
    assetFileId: item.assetFileId,
    assetType: item.assetType,
    imageUrl: item.imageUrl,
    promptHash: item.promptHash,
    accessible: await isAssetAccessible(item.imageUrl),
  })));
  const markdownInserted = generatedAssets
    .filter((item) => item.assetType !== "cover_image")
    .every((item) => Boolean(finalArticle?.markdown_content.includes(item.imageUrl)));
  const acceptanceIssues = [
    generatedAssets.some((item) => item.assetType === "cover_image") ? null : "未生成封面图资产",
    generatedAssets.some((item) => item.assetType !== "cover_image" && item.assetType !== "diagram_png") ? null : "未生成真实文中图片资产",
    generatedAssets.some((item) => item.assetType === "diagram_png") ? null : "未生成 SVG 图解衍生资产",
    generatedAssets.every((item) => item.accessible) ? null : "存在不可访问的图片 URL",
    markdownInserted ? null : "文中图片未插入 Markdown",
    finalArticle?.html_content ? null : "HTML 未重新排版",
    quality.status === "blocked" ? `视觉质量门槛阻塞：${quality.blockers.join("；")}` : null,
  ].filter(Boolean) as string[];

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const reportBaseName = `real-visual-assets-${getTimestampTag()}`;
  const reportPathJson = `${ARTIFACT_DIR}/${reportBaseName}.json`;
  const reportPathMarkdown = `${ARTIFACT_DIR}/${reportBaseName}.md`;
  const report: VisualAcceptanceReport = {
    generatedAt: new Date().toISOString(),
    status: acceptanceIssues.length === 0 ? "passed" : "failed",
    reportPathJson,
    reportPathMarkdown,
    user: {
      username,
      userId: user.id,
    },
    imageEngine: {
      provider: engine.providerName,
      model: engine.model,
      baseUrl: engine.baseUrl,
      outputResolution,
      apiKeyPreview: maskSecret(engine.apiKey),
    },
    article: {
      id: article.id,
      title: article.title,
      markdownInserted,
      htmlLength: normalizeString(finalArticle?.html_content).length,
    },
    visualBriefs: savedBriefs.map((brief) => ({
      id: brief.id ?? null,
      scope: brief.visualScope,
      skill: brief.baoyuSkill,
      type: String(brief.visualType),
      promptHash: brief.promptHash ?? null,
      status: brief.status ?? null,
    })),
    generatedAssets,
    quality: {
      status: quality.status,
      blockerCount: quality.blockers.length,
      warningCount: quality.warnings.length,
      blockers: quality.blockers,
      warnings: quality.warnings,
    },
    acceptanceIssues,
  };
  fs.writeFileSync(reportPathJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPathMarkdown, buildMarkdownReport(report));

  console.log("Plan23 real visual assets");
  console.log(`status=${report.status}`);
  console.log(`reportJson=${report.reportPathJson}`);
  console.log(`reportMarkdown=${report.reportPathMarkdown}`);
  console.log(`articleId=${report.article.id}`);
  console.log(`engine=${report.imageEngine.provider}/${report.imageEngine.model}`);
  console.log(`generatedAssets=${report.generatedAssets.length}`);
  console.log(`quality=${report.quality.status}`);

  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    console.error(sanitizeDiagnosticText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
