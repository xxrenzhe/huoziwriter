function uniqueTrimmed(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function quoteIfNeeded(value: string) {
  return /\s/.test(value) ? `"${value}"` : value;
}

export type BuildXSearchQueryInput = {
  keywords?: Array<string | null | undefined>;
  anyOf?: Array<string | null | undefined>;
  exactPhrases?: Array<string | null | undefined>;
  fromHandles?: Array<string | null | undefined>;
  lang?: string | null;
  hasImages?: boolean;
  hasMedia?: boolean;
  excludeRetweets?: boolean;
  excludeReplies?: boolean;
};

export function buildXSearchQuery(input: BuildXSearchQueryInput) {
  const segments: string[] = [];
  const keywords = uniqueTrimmed(input.keywords || []);
  const anyOf = uniqueTrimmed(input.anyOf || []);
  const exactPhrases = uniqueTrimmed(input.exactPhrases || []);
  const fromHandles = uniqueTrimmed(input.fromHandles || []).map((item) => item.replace(/^@+/, ""));
  const lang = String(input.lang || "").trim().toLowerCase();

  if (keywords.length > 0) {
    segments.push(keywords.length === 1 ? quoteIfNeeded(keywords[0]) : `(${keywords.map(quoteIfNeeded).join(" OR ")})`);
  }
  if (anyOf.length > 0) {
    segments.push(anyOf.length === 1 ? quoteIfNeeded(anyOf[0]) : `(${anyOf.map(quoteIfNeeded).join(" OR ")})`);
  }
  if (exactPhrases.length > 0) {
    segments.push(...exactPhrases.map((item) => `"${item.replace(/^"+|"+$/g, "")}"`));
  }
  if (fromHandles.length > 0) {
    segments.push(fromHandles.length === 1 ? `from:${fromHandles[0]}` : `(${fromHandles.map((item) => `from:${item}`).join(" OR ")})`);
  }
  if (input.hasImages) segments.push("has:images");
  else if (input.hasMedia) segments.push("has:media");
  if (lang) segments.push(`lang:${lang}`);
  if (input.excludeRetweets !== false) segments.push("-is:retweet");
  if (input.excludeReplies) segments.push("-is:reply");
  return segments.join(" ").trim();
}

export function buildXSearchUrl(query: string) {
  const params = new URLSearchParams({ q: query.trim(), src: "typed_query", f: "live" });
  return `https://x.com/search?${params.toString()}`;
}

export function parseXSearchQueryFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "x.com" && hostname !== "twitter.com") return null;
    if (/\/search\/?$/i.test(parsed.pathname)) {
      const query = parsed.searchParams.get("q");
      return query ? query.trim() : null;
    }
    const userMatch = parsed.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (userMatch) {
      return `from:${userMatch[1]} -is:retweet`;
    }
    return null;
  } catch {
    return null;
  }
}
