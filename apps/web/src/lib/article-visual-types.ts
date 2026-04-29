import type { ArticleViralMode } from "./article-viral-modes";

export type ArticleVisualScope = "cover" | "inline" | "infographic" | "diagram" | "comic";

export type BaoyuCoverType = "hero" | "conceptual" | "typography" | "metaphor" | "scene" | "minimal";
export type BaoyuCoverPalette = "warm" | "elegant" | "cool" | "dark" | "earth" | "vivid" | "pastel" | "mono" | "retro" | "duotone" | "macaron";
export type BaoyuCoverRendering = "flat-vector" | "hand-drawn" | "painterly" | "digital" | "pixel" | "chalk" | "screen-print";
export type BaoyuTextLevel = "none" | "title-only" | "title-subtitle" | "text-rich";
export type BaoyuMood = "subtle" | "balanced" | "bold";
export type BaoyuFont = "clean" | "handwritten" | "serif" | "display";

export type BaoyuInlineType = "infographic" | "scene" | "flowchart" | "comparison" | "framework" | "timeline" | "diagram" | "comic";
export type BaoyuInlineStyle = "editorial" | "notion" | "warm" | "minimal" | "blueprint" | "technical-schematic" | "morandi-journal";
export type BaoyuInlinePalette = "warm" | "cool" | "macaron" | "mono" | "retro" | "earth" | "duotone";

export type ArticleVisualBriefStatus = "planned" | "prompt_ready" | "generating" | "generated" | "failed" | "inserted";

export type ArticleVisualBrief = {
  id?: number;
  userId: number;
  articleId: number;
  articleNodeId?: number | null;
  visualScope: ArticleVisualScope;
  targetAnchor: string;
  baoyuSkill: "baoyu-cover-image" | "baoyu-article-illustrator" | "baoyu-infographic" | "baoyu-diagram" | "baoyu-comic";
  visualType: BaoyuCoverType | BaoyuInlineType;
  layoutCode?: string | null;
  styleCode?: BaoyuInlineStyle | string | null;
  paletteCode?: BaoyuCoverPalette | BaoyuInlinePalette | string | null;
  renderingCode?: BaoyuCoverRendering | string | null;
  textLevel?: BaoyuTextLevel | null;
  moodCode?: BaoyuMood | null;
  fontCode?: BaoyuFont | null;
  aspectRatio: string;
  outputResolution: string;
  title: string;
  purpose: string;
  viralMode?: ArticleViralMode | null;
  altText: string;
  coverHook?: string | null;
  visualAngle?: string | null;
  targetEmotionHint?: string | null;
  caption?: string | null;
  labels: string[];
  sourceFacts: string[];
  promptText?: string | null;
  negativePrompt?: string | null;
  promptHash?: string | null;
  promptManifest?: Record<string, unknown> | null;
  status?: ArticleVisualBriefStatus;
  errorMessage?: string | null;
  generatedAssetFileId?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ArticleVisualAsset = {
  id: number;
  visualBriefId: number | null;
  articleNodeId: number | null;
  assetType: string;
  publicUrl: string | null;
  altText: string | null;
  caption: string | null;
  insertAnchor: string | null;
  status: string;
  manifest: Record<string, unknown> | null;
};
