import type { ReviewSeriesPlaybook } from "@/lib/article-outcomes";
import type { ImageAuthoringStyleContext } from "@/lib/image-authoring-context";
import type { LanguageGuardRule } from "@/lib/language-guard-core";
import type {
  ArticleFragmentItem,
  EvidenceItem,
  KnowledgeCardPanelItem,
  OutlineMaterialNodeItem,
  PendingPublishIntent,
  StageArtifactItem,
  StrategyCardItem,
} from "./article-workspace-client-data";
import type {
  RecentSyncLogItem,
  WechatConnectionItem,
} from "./article-workspace-publish-actions";

export type SnapshotMeta = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

export type DiffState = {
  snapshotId: number;
  snapshotNote: string | null;
  createdAt: string;
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  lines: Array<{ type: "added" | "removed" | "unchanged"; content: string }>;
} | null;

export type ArticleOutcomeItem = {
  id: number;
  articleId: number;
  userId: number;
  targetPackage: string | null;
  scorecard: Record<string, unknown>;
  attribution: Record<string, unknown> | null;
  hitStatus: "pending" | "hit" | "near_miss" | "miss";
  reviewSummary: string | null;
  nextAction: string | null;
  playbookTags: string[];
  createdAt: string;
  updatedAt: string;
} | null;

export type ArticleOutcomeSnapshotItem = {
  id: number;
  outcomeId: number;
  articleId: number;
  userId: number;
  windowCode: "24h" | "72h" | "7d";
  readCount: number;
  shareCount: number;
  likeCount: number;
  notes: string | null;
  writingStateFeedback: {
    recommendedPrototypeCode: string | null;
    recommendedPrototypeLabel: string | null;
    adoptedPrototypeCode: string | null;
    adoptedPrototypeLabel: string | null;
    followedPrototypeRecommendation: boolean | null;
    recommendedVariantCode: string | null;
    recommendedVariantLabel: string | null;
    adoptedVariantCode: string | null;
    adoptedVariantLabel: string | null;
    followedRecommendation: boolean | null;
    recommendedOpeningPatternLabel: string | null;
    recommendedSyntaxPatternLabel: string | null;
    recommendedEndingPatternLabel: string | null;
    adoptedOpeningPatternLabel: string | null;
    adoptedSyntaxPatternLabel: string | null;
    adoptedEndingPatternLabel: string | null;
    followedPatternRecommendation: boolean | null;
    availableVariantCount: number;
    comparisonSampleCount: number;
    recommendationReason: string | null;
    adoptedReason: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ArticleOutcomeBundleItem = {
  outcome: ArticleOutcomeItem;
  snapshots: ArticleOutcomeSnapshotItem[];
  completedWindowCodes: Array<"24h" | "72h" | "7d">;
  missingWindowCodes: Array<"24h" | "72h" | "7d">;
  nextWindowCode: "24h" | "72h" | "7d" | null;
};

export type SeriesOptionItem = {
  id: number;
  name: string;
  personaName: string;
  thesis: string | null;
  targetAudience: string | null;
  activeStatus: string;
  preHook?: string | null;
  postHook?: string | null;
  defaultLayoutTemplateId?: string | null;
  platformPreference?: string | null;
  targetPackHint?: string | null;
  defaultArchetype?: string | null;
  defaultDnaId?: number | null;
};

export type SeriesInsightItem = {
  label: string | null;
  reason: string | null;
  commonTerms: string[];
  coreStances: string[];
  driftRisks: string[];
  backgroundChecklist: string[];
  whyNow: string[];
  relatedArticleCount: number;
} | null;

export type OutlineMaterialsState = {
  supplementalViewpoints: string[];
  nodes: OutlineMaterialNodeItem[];
};

export type HistoryReferenceSelectionItem = {
  referencedArticleId: number;
  title: string;
  relationReason: string | null;
  bridgeSentence: string | null;
  sortOrder?: number;
};

export type HistoryReferenceSuggestionItem = HistoryReferenceSelectionItem & {
  score?: number;
  seriesLabel?: string | null;
  consistencyHint?: string | null;
};

export type CoverImageCandidateItem = {
  id: number;
  variantLabel: string;
  imageUrl: string;
  prompt: string;
  isSelected: boolean;
  createdAt: string;
};

export type ArticleImagePromptItem = {
  id: number;
  articleNodeId: number | null;
  assetType: string;
  title: string;
  prompt: string;
  status?: string | null;
  insertAnchor?: string | null;
  altText?: string | null;
  caption?: string | null;
  visualBriefId?: number | null;
  createdAt: string;
  updatedAt: string;
};

export const OUTCOME_WINDOWS: Array<{ code: "24h" | "72h" | "7d"; label: string }> = [
  { code: "24h", label: "24 小时" },
  { code: "72h", label: "72 小时" },
  { code: "7d", label: "7 天" },
];

export type ArticleEditorClientProps = {
  article: {
    id: number;
    title: string;
    markdownContent: string;
    status: string;
    htmlContent: string;
    seriesId: number | null;
    wechatTemplateId: string | null;
  };
  seriesOptions: SeriesOptionItem[];
  nodes: OutlineMaterialNodeItem[];
  fragments: ArticleFragmentItem[];
  languageGuardRules: LanguageGuardRule[];
  connections: WechatConnectionItem[];
  snapshots: SnapshotMeta[];
  templates: Array<{
    id: string;
    version: string;
    name: string;
    description: string | null;
    meta: string | null;
    ownerUserId: number | null;
    sourceUrl: string | null;
    config?: Record<string, unknown>;
  }>;
  recentSyncLogs: RecentSyncLogItem[];
  recentArticles: Array<{ id: number; title: string; markdownContent: string; updatedAt: string }>;
  recentDeepWritingStates: Array<{ id: number; title: string; updatedAt: string; payload: Record<string, unknown> | null }>;
  initialStrategyCard: StrategyCardItem;
  initialEvidenceItems: EvidenceItem[];
  workflow: {
    currentStageCode: string;
    stages: Array<{ code: string; title: string; status: "pending" | "current" | "completed" | "failed" }>;
    pendingPublishIntent?: PendingPublishIntent | null;
    updatedAt: string;
  };
  stageArtifacts: StageArtifactItem[];
  knowledgeCards: KnowledgeCardPanelItem[];
  canExportPdf: boolean;
  canGenerateCoverImage: boolean;
  canUseCoverImageReference: boolean;
  canUseHistoryReferences: boolean;
  canPublishToWechat: boolean;
  planName: string;
  authoringContext: ImageAuthoringStyleContext | null;
  seriesInsight: SeriesInsightItem;
  currentSeriesPlaybook: ReviewSeriesPlaybook | null;
  coverImageQuota: { used: number; limit: number | null; remaining: number | null };
  imageAssetQuota: {
    usedBytes: number;
    limitBytes: number;
    remainingBytes: number;
    assetRecordCount: number;
    readyAssetRecordCount: number;
    uniqueObjectCount: number;
    reservedGenerationBytes: number;
  };
  initialCoverImageCandidates: CoverImageCandidateItem[];
  initialImagePrompts: ArticleImagePromptItem[];
  initialCoverImage: { imageUrl: string; prompt: string; createdAt: string } | null;
  initialOutcomeBundle: ArticleOutcomeBundleItem;
};
