import assert from "node:assert/strict";
import test from "node:test";

import { fetchTopicsFromSourceAdapter } from "../topic-source-adapters";

test("fetchTopicsFromSourceAdapter parses Hacker News API responses into topic candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/v0/topstories.json")) {
      return new Response(JSON.stringify([101, 102]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/v0/item/101.json")) {
      return new Response(JSON.stringify({
        id: 101,
        title: "OpenAI launches a new API capability",
        url: "https://openai.com/news/test",
        time: 1_710_000_000,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/v0/item/102.json")) {
      return new Response(JSON.stringify({
        id: 102,
        title: "Why remote jobs still matter",
        text: "<p>Detailed discussion from HN.</p>",
        time: 1_710_000_100,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "Hacker News Top Stories",
      homepageUrl: "https://hacker-news.firebaseio.com/v0/topstories.json",
      sourceType: "news",
      limit: 2,
    });

    assert.equal(topics?.length, 2);
    assert.equal(topics?.[0]?.title, "OpenAI launches a new API capability");
    assert.equal(topics?.[0]?.sourceUrl, "https://openai.com/news/test");
    assert.match(topics?.[1]?.summary || "", /HN/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchTopicsFromSourceAdapter parses Remotive API responses into topic candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://remotive.com/api/remote-jobs") {
      return new Response(JSON.stringify({
        jobs: [
          {
            title: "Senior AI Product Manager",
            url: "https://remotive.com/remote-jobs/product/senior-ai-product-manager-1",
            company_name: "Acme",
            category: "Product",
            publication_date: "2026-04-26T08:00:00Z",
            candidate_required_location: "Worldwide",
            job_type: "Full-Time",
            salary: "$120k-$150k",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "Remotive Remote Jobs",
      homepageUrl: "https://remotive.com/api/remote-jobs",
      sourceType: "news",
      limit: 2,
    });

    assert.equal(topics?.length, 1);
    assert.equal(topics?.[0]?.title, "Senior AI Product Manager · Acme");
    assert.match(topics?.[0]?.summary || "", /Worldwide/);
    assert.equal(topics?.[0]?.publishedAt, "2026-04-26T08:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchTopicsFromSourceAdapter parses V2EX hot topics into community candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://www.v2ex.com/api/topics/hot.json") {
      return new Response(JSON.stringify([
        {
          id: 1208518,
          title: "AI 内容工作流应该先自动化哪一段",
          url: "https://www.v2ex.com/t/1208518",
          content: "最近在试 n8n 和几个 AI 写作工具，发现真正麻烦的是校验和发布。",
          replies: 42,
          created: 1_777_122_369,
          node: { name: "create", title: "分享创造" },
          member: { username: "alice" },
        },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "V2EX Hot Topics",
      homepageUrl: "https://www.v2ex.com/api/topics/hot.json",
      sourceType: "community",
      limit: 2,
    });

    assert.equal(topics?.length, 1);
    assert.equal(topics?.[0]?.title, "AI 内容工作流应该先自动化哪一段");
    assert.equal(topics?.[0]?.sourceUrl, "https://www.v2ex.com/t/1208518");
    assert.match(topics?.[0]?.summary || "", /分享创造/);
    assert.match(topics?.[0]?.summary || "", /回复：42/);
    assert.equal(topics?.[0]?.publishedAt, "2026-04-25T13:06:09.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchTopicsFromSourceAdapter parses RSS feeds into topic candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <rss><channel>
        <item>
          <title>GitHub Ships New Actions Policy</title>
          <link>https://github.blog/changelog/2026-04-26-actions-policy/</link>
          <description><![CDATA[<p>Policy update for Actions users.</p>]]></description>
          <pubDate>Sat, 26 Apr 2026 08:00:00 GMT</pubDate>
        </item>
      </channel></rss>`,
      { status: 200, headers: { "content-type": "application/rss+xml" } },
    )) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "GitHub Changelog Feed",
      homepageUrl: "https://github.blog/changelog/feed/",
      sourceType: "rss",
      limit: 2,
    });

    assert.equal(topics?.length, 1);
    assert.equal(topics?.[0]?.title, "GitHub Ships New Actions Policy");
    assert.match(topics?.[0]?.summary || "", /Policy update/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchTopicsFromSourceAdapter parses Atom feeds into topic candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>n8n 2.0 released</title>
          <link rel="alternate" type="text/html" href="https://github.com/n8n-io/n8n/releases/tag/v2.0.0"/>
          <updated>2026-04-26T08:00:00Z</updated>
          <summary type="html">&lt;p&gt;Major automation update.&lt;/p&gt;</summary>
        </entry>
      </feed>`,
      { status: 200, headers: { "content-type": "application/atom+xml" } },
    )) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "n8n Releases",
      homepageUrl: "https://github.com/n8n-io/n8n/releases.atom",
      sourceType: "rss",
      limit: 2,
    });

    assert.equal(topics?.length, 1);
    assert.equal(topics?.[0]?.title, "n8n 2.0 released");
    assert.equal(topics?.[0]?.sourceUrl, "https://github.com/n8n-io/n8n/releases/tag/v2.0.0");
    assert.match(topics?.[0]?.summary || "", /Major automation update/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchTopicsFromSourceAdapter maps chinese hotspot metadata into topic candidates", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            title: "AI 搜索投放突然升温",
            url: "https://top.baidu.com/item/1",
            rank: 3,
            heatValue: 260000,
            heatLabel: "热",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "百度热点",
      homepageUrl: "https://top.baidu.com/board?tab=realtime",
      sourceType: "chinese-hotspot",
      limit: 2,
    });

    assert.equal(topics?.length, 1);
    assert.equal(topics?.[0]?.title, "AI 搜索投放突然升温");
    assert.equal(topics?.[0]?.sourceMeta?.provider, "baidu");
    assert.equal(topics?.[0]?.sourceMeta?.rank, 3);
    assert.equal(topics?.[0]?.sourceMeta?.heatValue, 260000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchTopicsFromSourceAdapter parses X hotspot posts into topic candidates", async () => {
  const previousToken = process.env.X_API_BEARER_TOKEN;
  const previousBaseUrl = process.env.X_API_BASE_URL;
  process.env.X_API_BEARER_TOKEN = "test-token";
  process.env.X_API_BASE_URL = "https://api.x.com/2";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://api.x.com/2/tweets/search/recent?")) {
      return new Response(JSON.stringify({
        data: [
          {
            id: "19001",
            text: "Anthropic just crossed a new ARR milestone and enterprise AI buyers are paying attention.",
            author_id: "42",
            conversation_id: "19001",
            created_at: "2026-04-29T09:00:00Z",
            public_metrics: {
              like_count: 320,
              retweet_count: 88,
              reply_count: 17,
              quote_count: 11,
              impression_count: 12000,
            },
            attachments: {
              media_keys: ["3_1"],
            },
            entities: {
              urls: [{ expanded_url: "https://www.wsj.com/test" }],
            },
          },
        ],
        includes: {
          users: [{ id: "42", name: "Aakash Gupta", username: "aakashg0" }],
          media: [{ media_key: "3_1", type: "photo", url: "https://pbs.twimg.com/media/test.jpg", width: 1600, height: 900 }],
        },
        meta: { result_count: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const topics = await fetchTopicsFromSourceAdapter({
      name: "X.com AI Founders Watch",
      homepageUrl: "https://x.com/search?q=Anthropic&src=typed_query&f=live",
      sourceType: "x-hotspot",
      limit: 2,
    });

    assert.equal(topics?.length, 1);
    assert.match(topics?.[0]?.title || "", /Anthropic just crossed/);
    assert.equal(topics?.[0]?.sourceUrl, "https://x.com/aakashg0/status/19001");
    assert.equal(topics?.[0]?.sourceMeta?.sourceKind, "x_hotspot");
    assert.equal(topics?.[0]?.sourceMeta?.authorHandle, "aakashg0");
    assert.equal(Array.isArray(topics?.[0]?.sourceMeta?.media), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken == null) delete process.env.X_API_BEARER_TOKEN;
    else process.env.X_API_BEARER_TOKEN = previousToken;
    if (previousBaseUrl == null) delete process.env.X_API_BASE_URL;
    else process.env.X_API_BASE_URL = previousBaseUrl;
  }
});
