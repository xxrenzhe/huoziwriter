import { getActiveImaContext, markImaConnectionInvalid, normalizeImaError } from "./ima-connections";
import { ImaApiError, searchKnowledge } from "./ima-client";

export type ImaEvidenceSearchResult = {
  items: Array<{
    mediaId: string;
    title: string;
    excerpt: string;
    sourceUrl: string | null;
  }>;
  nextCursor: string;
  isEnd: boolean;
  degradedReason: string | null;
};

export async function runImaEvidenceSearch(input: {
  userId: number;
  kbId?: string | null;
  query: string;
  cursor?: string;
}): Promise<ImaEvidenceSearchResult> {
  try {
    const active = await getActiveImaContext(input.userId, { preferredKbId: input.kbId });
    const result = await searchKnowledge(active.creds, active.kbId, input.query.trim(), String(input.cursor || ""));
    return {
      items: result.items.slice(0, 20).map((item) => ({
        mediaId: item.mediaId,
        title: item.title,
        excerpt: item.highlightContent || item.title,
        sourceUrl: item.sourceUrl,
      })),
      nextCursor: result.nextCursor,
      isEnd: result.isEnd,
      degradedReason: null,
    };
  } catch (error) {
    if (error instanceof ImaApiError && (error.code === 1100 || error.code === 1101)) {
      try {
        const active = await getActiveImaContext(input.userId, { preferredKbId: input.kbId });
        await markImaConnectionInvalid({
          userId: input.userId,
          connectionId: active.connectionId,
          error: error.message,
        });
      } catch {
        // Ignore best-effort invalid marking.
      }
    }
    return {
      items: [],
      nextCursor: "",
      isEnd: true,
      degradedReason: normalizeImaError(error),
    };
  }
}
