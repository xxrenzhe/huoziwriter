import { getDefaultAuthorPersona } from "./author-personas";
import { getWritingStyleProfileById } from "./writing-style-profiles";

export async function getDocumentAuthoringStyleContext(userId: number) {
  const authorPersona = await getDefaultAuthorPersona(userId);
  const writingStyleProfile = authorPersona?.boundWritingStyleProfileId
    ? await getWritingStyleProfileById(userId, authorPersona.boundWritingStyleProfileId)
    : null;

  return {
    authorPersona: authorPersona
      ? {
          name: authorPersona.name,
          summary: authorPersona.summary,
          identityTags: authorPersona.identityTags,
          writingStyleTags: authorPersona.writingStyleTags,
          domainKeywords: authorPersona.domainKeywords,
          argumentPreferences: authorPersona.argumentPreferences,
          toneConstraints: authorPersona.toneConstraints,
          audienceHints: authorPersona.audienceHints,
          sourceMode: authorPersona.sourceMode,
          boundWritingStyleProfileName: authorPersona.boundWritingStyleProfileName,
        }
      : null,
    writingStyleProfile: writingStyleProfile
      ? {
          name: writingStyleProfile.name,
          summary: writingStyleProfile.summary,
          toneKeywords: writingStyleProfile.toneKeywords,
          structurePatterns: writingStyleProfile.structurePatterns,
          languageHabits: writingStyleProfile.languageHabits,
          openingPatterns: writingStyleProfile.openingPatterns,
          endingPatterns: writingStyleProfile.endingPatterns,
          doNotWrite: writingStyleProfile.doNotWrite,
          imitationPrompt: writingStyleProfile.imitationPrompt,
        }
      : null,
  };
}
