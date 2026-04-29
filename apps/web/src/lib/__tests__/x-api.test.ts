import assert from "node:assert/strict";
import test from "node:test";

import { searchRecentXPosts } from "../x-api";

test("searchRecentXPosts requests X recent search with expected fields", async () => {
  const previousToken = process.env.X_API_BEARER_TOKEN;
  const previousBaseUrl = process.env.X_API_BASE_URL;
  process.env.X_API_BEARER_TOKEN = "test-token";
  process.env.X_API_BASE_URL = "https://api.x.com/2";
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedAuthorization = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedAuthorization = String(new Headers(init?.headers).get("Authorization") || "");
    return new Response(JSON.stringify({
      data: [{ id: "1", text: "Anthropic just crossed another revenue milestone" }],
      includes: { users: [], media: [] },
      meta: { result_count: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const response = await searchRecentXPosts({
      query: "Anthropic ARR lang:en -is:retweet",
      maxResults: 12,
    });

    assert.equal(response.data?.[0]?.id, "1");
    assert.match(requestedUrl, /\/tweets\/search\/recent\?/);
    assert.match(requestedUrl, /max_results=12/);
    assert.match(requestedUrl, /tweet\.fields=/);
    assert.equal(requestedAuthorization, "Bearer test-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken == null) delete process.env.X_API_BEARER_TOKEN;
    else process.env.X_API_BEARER_TOKEN = previousToken;
    if (previousBaseUrl == null) delete process.env.X_API_BASE_URL;
    else process.env.X_API_BASE_URL = previousBaseUrl;
  }
});
