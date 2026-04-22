import { useMemo } from "react";
import { collectLanguageGuardHits, type LanguageGuardRule } from "@/lib/language-guard-core";
import { buildEditorialReview } from "@/lib/article-workspace-helpers";
import type {
  ArticleEditorClientProps,
  ArticleOutcomeBundleItem,
  SeriesOptionItem,
} from "./article-workspace-client-types";
import type {
  RecentSyncLogItem,
} from "./article-workspace-publish-actions";

type UseArticleWorkspaceClientComputedInput = {
  templates: ArticleEditorClientProps["templates"];
  wechatTemplateId: string | null;
  seriesOptions: SeriesOptionItem[];
  seriesId: number | null;
  syncLogs: RecentSyncLogItem[];
  articleOutcomeBundle: ArticleOutcomeBundleItem;
  languageGuardRules: LanguageGuardRule[];
  markdown: string;
};

export function useArticleWorkspaceClientComputed(input: UseArticleWorkspaceClientComputedInput) {
  const bannedWords = useMemo(
    () =>
      Array.from(
        new Set(
          input.languageGuardRules
            .filter((rule) => rule.isEnabled && rule.ruleKind === "token")
            .map((rule) => rule.patternText.trim())
            .filter(Boolean),
        ),
      ),
    [input.languageGuardRules],
  );

  const detectedBannedWords = useMemo(() => {
    const hits = new Map<string, number>();
    for (const word of bannedWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = input.markdown.match(new RegExp(escaped, "g"));
      if (matches?.length) {
        hits.set(word, matches.length);
      }
    }
    return Array.from(hits.entries()).map(([word, count]) => ({ word, count }));
  }, [bannedWords, input.markdown]);

  const liveLanguageGuardHits = useMemo(
    () => collectLanguageGuardHits(input.markdown, input.languageGuardRules).slice(0, 8),
    [input.languageGuardRules, input.markdown],
  );

  const liveLanguageGuardSummary = useMemo(
    () => ({
      tokenCount: liveLanguageGuardHits.filter((hit) => hit.ruleKind === "token").length,
      patternCount: liveLanguageGuardHits.filter((hit) => hit.ruleKind === "pattern").length,
      highSeverityCount: liveLanguageGuardHits.filter((hit) => hit.severity === "high").length,
    }),
    [liveLanguageGuardHits],
  );

  const editorialReview = useMemo(
    () => buildEditorialReview(input.markdown, liveLanguageGuardHits),
    [input.markdown, liveLanguageGuardHits],
  );

  const selectedTemplate = useMemo(
    () => input.templates.find((template) => template.id === input.wechatTemplateId) ?? null,
    [input.templates, input.wechatTemplateId],
  );

  const selectedSeries = useMemo(
    () => input.seriesOptions.find((item) => item.id === input.seriesId) ?? null,
    [input.seriesId, input.seriesOptions],
  );

  const latestSyncLog = input.syncLogs[0] ?? null;
  const currentArticleOutcome = input.articleOutcomeBundle.outcome;

  return {
    bannedWords,
    detectedBannedWords,
    liveLanguageGuardHits,
    liveLanguageGuardSummary,
    editorialReview,
    selectedTemplate,
    selectedSeries,
    latestSyncLog,
    currentArticleOutcome,
  };
}
