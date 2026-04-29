function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => getRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。！？!?\.])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 20);
}

function extractNumbers(text: string) {
  const matches = text.match(/\$?\d[\d,.]*(?:\s?(?:k|m|b|bn|million|billion|万|亿|%))?/gi) || [];
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

export type XResolvedPost = {
  postId: string | null;
  textRaw: string;
  authorHandle: string | null;
  authorName: string | null;
  createdAt: string | null;
};

export type XThreadBundle = {
  rootPost: XResolvedPost;
  referencedPosts: XResolvedPost[];
  externalLinks: string[];
  extractedClaims: string[];
  extractedNumbers: string[];
};

export function resolveXThreadBundle(input: {
  title?: string | null;
  summary?: string | null;
  sourceUrl?: string | null;
  sourceMeta?: Record<string, unknown> | null;
}) {
  const sourceMeta = getRecord(input.sourceMeta);
  const textRaw = getString(sourceMeta?.textRaw) || getString(input.summary) || getString(input.title);
  const referencedPosts = getRecordArray(sourceMeta?.referencedPosts).map((item) => ({
    postId: getString(item.postId) || null,
    textRaw: getString(item.textRaw),
    authorHandle: getString(item.authorHandle) || null,
    authorName: getString(item.authorName) || null,
    createdAt: getString(item.createdAt) || null,
  })).filter((item) => item.textRaw);
  const rootPost: XResolvedPost = {
    postId: getString(sourceMeta?.postId) || null,
    textRaw,
    authorHandle: getString(sourceMeta?.authorHandle) || null,
    authorName: getString(sourceMeta?.authorName) || null,
    createdAt: getString(sourceMeta?.postedAt) || null,
  };
  const externalLinks = Array.from(new Set(
    (Array.isArray(sourceMeta?.externalLinks) ? sourceMeta?.externalLinks : [])
      .map((item) => getString(item))
      .filter(Boolean),
  )).slice(0, 8);
  const extractedClaims = Array.from(new Set([
    ...splitSentences(rootPost.textRaw),
    ...referencedPosts.flatMap((item) => splitSentences(item.textRaw)),
  ])).slice(0, 8);
  const extractedNumbers = Array.from(new Set([
    ...extractNumbers(rootPost.textRaw),
    ...referencedPosts.flatMap((item) => extractNumbers(item.textRaw)),
  ])).slice(0, 12);
  return {
    rootPost,
    referencedPosts,
    externalLinks,
    extractedClaims,
    extractedNumbers,
  } satisfies XThreadBundle;
}
