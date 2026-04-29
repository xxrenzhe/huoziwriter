import assert from "node:assert/strict";
import test from "node:test";

import { buildXSearchQuery, buildXSearchUrl, parseXSearchQueryFromUrl } from "../x-query-builder";

test("buildXSearchQuery composes operators and keywords into a valid X query", () => {
  const query = buildXSearchQuery({
    keywords: ["Anthropic", "Claude"],
    anyOf: ["ARR", "revenue"],
    hasImages: true,
    lang: "en",
    excludeRetweets: true,
  });

  assert.equal(query, '(Anthropic OR Claude) (ARR OR revenue) has:images lang:en -is:retweet');
});

test("buildXSearchUrl encodes query into canonical X search URL", () => {
  const url = buildXSearchUrl('Anthropic ARR lang:en -is:retweet');
  assert.match(url, /^https:\/\/x\.com\/search\?/);
  assert.match(url, /q=Anthropic\+ARR\+lang%3Aen\+\-is%3Aretweet/);
});

test("parseXSearchQueryFromUrl extracts query from search URL and profile URL", () => {
  assert.equal(
    parseXSearchQueryFromUrl("https://x.com/search?q=Anthropic%20ARR%20lang%3Aen&src=typed_query&f=live"),
    "Anthropic ARR lang:en",
  );
  assert.equal(parseXSearchQueryFromUrl("https://x.com/sama"), "from:sama -is:retweet");
});
