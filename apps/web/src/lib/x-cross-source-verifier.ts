import { fetchExternalText } from "./external-fetch";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string) {
  return getString(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function extractDescription(html: string) {
  return getString(
    html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i)?.[1] || "",
  );
}

export type XSourceTier = "primary" | "reported" | "secondary" | "social";

export type VerificationHit = {
  claim: string;
  sourceTier: XSourceTier;
  sourceLabel: string;
  sourceUrl: string;
  matchedEvidence: string;
  confidence: "high" | "medium" | "low";
};

const REPORTED_HOST_PATTERNS = [
  /wsj\.com$/i,
  /bloomberg\.com$/i,
  /ft\.com$/i,
  /theinformation\.com$/i,
  /reuters\.com$/i,
];
const SECONDARY_HOST_PATTERNS = [
  /saastr\.com$/i,
  /techcrunch\.com$/i,
  /theverge\.com$/i,
  /wired\.com$/i,
  /substack\.com$/i,
];

export function inferXSourceTierFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (hostname === "x.com" || hostname === "twitter.com") return "social" as const;
    if (REPORTED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return "reported" as const;
    if (SECONDARY_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) return "secondary" as const;
    if (/(blog|newsroom|investor|press|docs)\./i.test(hostname) || /(^|\.)(openai\.com|anthropic\.com|googleblog\.com|stripe\.com|amazon\.com)$/i.test(hostname)) {
      return "primary" as const;
    }
    return "secondary" as const;
  } catch {
    return "secondary" as const;
  }
}

type Fetcher = (input: { url: string }) => Promise<{ text: string }>;

export async function verifyXExternalLinks(input: {
  title?: string | null;
  claims?: string[];
  externalLinks?: string[];
  fetcher?: Fetcher;
}) {
  const fetcher = input.fetcher || (async ({ url }: { url: string }) => {
    const response = await fetchExternalText({
      url,
      timeoutMs: 20_000,
      maxAttempts: 2,
      cache: "no-store",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
    });
    return { text: response.text };
  });
  const links = Array.from(new Set((input.externalLinks || []).map((item) => getString(item)).filter(Boolean))).slice(0, 3);
  const hits: VerificationHit[] = [];
  for (const link of links) {
    try {
      const response = await fetcher({ url: link });
      const title = extractTitle(response.text);
      const description = extractDescription(response.text);
      const excerpt = stripHtml(description || response.text).slice(0, 240);
      const claim = input.claims?.find((item) => item.length >= 16) || getString(input.title) || title || "外链验证线索";
      const sourceTier = inferXSourceTierFromUrl(link);
      hits.push({
        claim,
        sourceTier,
        sourceLabel: title || new URL(link).hostname.replace(/^www\./i, ""),
        sourceUrl: link,
        matchedEvidence: excerpt || title || link,
        confidence: sourceTier === "primary" || sourceTier === "reported" ? "high" : "medium",
      });
    } catch {
      continue;
    }
  }
  return hits;
}
