import assert from "node:assert/strict";
import test from "node:test";

import { inferXSourceTierFromUrl, verifyXExternalLinks } from "../x-cross-source-verifier";

test("inferXSourceTierFromUrl classifies known hosts", () => {
  assert.equal(inferXSourceTierFromUrl("https://www.wsj.com/tech/ai/test"), "reported");
  assert.equal(inferXSourceTierFromUrl("https://www.anthropic.com/news/test"), "primary");
  assert.equal(inferXSourceTierFromUrl("https://www.saastr.com/test"), "secondary");
  assert.equal(inferXSourceTierFromUrl("https://x.com/aakashg0/status/123"), "social");
});

test("verifyXExternalLinks fetches linked pages into verification hits", async () => {
  const hits = await verifyXExternalLinks({
    title: "Anthropic revenue debate",
    claims: ["Anthropic just crossed a major ARR milestone."],
    externalLinks: ["https://www.wsj.com/tech/ai/test"],
    fetcher: async () => ({
      text: "<html><head><title>WSJ: Anthropic Revenue Climbs</title><meta name=\"description\" content=\"Anthropic annual recurring revenue climbed as enterprise demand grew.\" /></head><body></body></html>",
    }),
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.sourceTier, "reported");
  assert.match(hits[0]?.matchedEvidence || "", /enterprise demand/i);
});
