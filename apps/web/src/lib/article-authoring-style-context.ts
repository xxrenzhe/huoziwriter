import { assertPersonaReady } from "./personas";
import { getArticleById } from "./repositories";
import { getSeriesById } from "./series";
import { getWritingStyleProfileById } from "./writing-style-profiles";

export async function getArticleAuthoringStyleContext(userId: number, articleId?: number) {
  const fallbackPersona = await assertPersonaReady(userId);
  let persona = fallbackPersona;
  if (articleId) {
    const article = await getArticleById(articleId, userId);
    if (article?.series_id) {
      const series = await getSeriesById(userId, article.series_id);
      if (series) {
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
      }
    }
  }
  const writingStyleProfile = persona?.boundWritingStyleProfileId
    ? await getWritingStyleProfileById(userId, persona.boundWritingStyleProfileId)
    : null;

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
          boundWritingStyleProfileName: persona.boundWritingStyleProfileName,
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
