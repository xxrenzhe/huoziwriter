import { assertPersonaReady } from "./personas";
import { getArticleById } from "./repositories";
import { getSeriesById } from "./series";
import { getWritingStyleProfileById } from "./writing-style-profiles";

export async function getArticleAuthoringStyleContext(userId: number, articleId?: number) {
  const defaultPersona = await assertPersonaReady(userId);
  let persona = defaultPersona;
  let preferredWritingStyleProfileId = defaultPersona?.boundWritingStyleProfileId ?? null;
  let preferredWritingStyleProfileName = defaultPersona?.boundWritingStyleProfileName ?? null;
  if (articleId) {
    const article = await getArticleById(articleId, userId);
    if (!article) {
      throw new Error("稿件不存在");
    }
    if (!article.series_id) {
      return buildArticleAuthoringStyleContext(defaultPersona, userId, {
        preferredWritingStyleProfileId,
        preferredWritingStyleProfileName,
      });
    }
    const series = await getSeriesById(userId, article.series_id);
    if (!series) {
      return buildArticleAuthoringStyleContext(defaultPersona, userId, {
        preferredWritingStyleProfileId,
        preferredWritingStyleProfileName,
      });
    }
    persona = {
      id: series.personaId,
      userId,
      name: series.personaName,
      summary: series.personaSummary,
      identityTags: series.identityTags,
      writingStyleTags: series.writingStyleTags,
      domainKeywords: series.domainKeywords,
      argumentPreferences: series.argumentPreferences,
      toneConstraints: series.toneConstraints,
      audienceHints: series.audienceHints,
      sourceMode: series.sourceMode,
      boundWritingStyleProfileId: series.boundWritingStyleProfileId,
      boundWritingStyleProfileName: series.boundWritingStyleProfileName,
      isDefault: false,
      createdAt: series.createdAt,
      updatedAt: series.updatedAt,
    };
    preferredWritingStyleProfileId = series.defaultDnaId ?? series.boundWritingStyleProfileId ?? null;
    preferredWritingStyleProfileName =
      series.defaultDnaId != null
        ? `系列默认文风 #${series.defaultDnaId}`
        : series.boundWritingStyleProfileName ?? null;
  }
  return buildArticleAuthoringStyleContext(persona, userId, {
    preferredWritingStyleProfileId,
    preferredWritingStyleProfileName,
  });
}

async function buildArticleAuthoringStyleContext(
  persona: Awaited<ReturnType<typeof assertPersonaReady>>,
  userId: number,
  options?: {
    preferredWritingStyleProfileId?: number | null;
    preferredWritingStyleProfileName?: string | null;
  },
) {
  const preferredWritingStyleProfileId = options?.preferredWritingStyleProfileId ?? persona?.boundWritingStyleProfileId ?? null;
  const writingStyleProfile = preferredWritingStyleProfileId
    ? await getWritingStyleProfileById(userId, preferredWritingStyleProfileId)
    : null;
  const preferredWritingStyleProfileName =
    writingStyleProfile?.name
    ?? options?.preferredWritingStyleProfileName
    ?? persona?.boundWritingStyleProfileName
    ?? null;

  return {
    persona: persona
      ? {
          name: persona.name,
          summary: persona.summary,
          identityTags: persona.identityTags,
          writingStyleTags: persona.writingStyleTags,
          domainKeywords: persona.domainKeywords,
          argumentPreferences: persona.argumentPreferences,
          toneConstraints: persona.toneConstraints,
          audienceHints: persona.audienceHints,
          sourceMode: persona.sourceMode,
          boundWritingStyleProfileName: preferredWritingStyleProfileName,
        }
      : null,
    writingStyleProfile: writingStyleProfile
      ? {
          name: writingStyleProfile.name,
          summary: writingStyleProfile.summary,
          toneKeywords: writingStyleProfile.toneKeywords,
          sentenceLengthProfile: writingStyleProfile.sentenceLengthProfile,
          paragraphBreathingPattern: writingStyleProfile.paragraphBreathingPattern,
          structurePatterns: writingStyleProfile.structurePatterns,
          transitionPatterns: writingStyleProfile.transitionPatterns,
          languageHabits: writingStyleProfile.languageHabits,
          openingPatterns: writingStyleProfile.openingPatterns,
          endingPatterns: writingStyleProfile.endingPatterns,
          punctuationHabits: writingStyleProfile.punctuationHabits,
          tangentPatterns: writingStyleProfile.tangentPatterns,
          callbackPatterns: writingStyleProfile.callbackPatterns,
          factDensity: writingStyleProfile.factDensity,
          emotionalIntensity: writingStyleProfile.emotionalIntensity,
          suitableTopics: writingStyleProfile.suitableTopics,
          reusablePromptFragments: writingStyleProfile.reusablePromptFragments,
          verbatimPhraseBanks: writingStyleProfile.verbatimPhraseBanks,
          tabooPatterns: writingStyleProfile.tabooPatterns,
          statePresets: writingStyleProfile.statePresets,
          antiOutlineRules: writingStyleProfile.antiOutlineRules,
          doNotWrite: writingStyleProfile.doNotWrite,
          imitationPrompt: writingStyleProfile.imitationPrompt,
        }
      : null,
  };
}
