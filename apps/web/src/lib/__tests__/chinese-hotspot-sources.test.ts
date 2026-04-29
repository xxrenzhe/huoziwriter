import assert from "node:assert/strict";
import test from "node:test";

import {
  inferChineseHotspotProvider,
  mapChineseHotspotItemsToCandidates,
  parseChineseHotspotPayload,
} from "../chinese-hotspot-sources";

test("inferChineseHotspotProvider detects configured chinese hotspot sources", () => {
  assert.equal(inferChineseHotspotProvider({
    name: "百度热点",
    homepageUrl: "https://top.baidu.com/board?tab=realtime",
    sourceType: "chinese-hotspot",
  }), "baidu");
  assert.equal(inferChineseHotspotProvider({
    name: "普通 RSS",
    homepageUrl: "https://example.com/feed.xml",
    sourceType: "rss",
  }), null);
});

test("parseChineseHotspotPayload extracts structured hotspot records", () => {
  const items = parseChineseHotspotPayload({
    provider: "baidu",
    sourceUrl: "https://top.baidu.com/board?tab=realtime",
    capturedAt: "2026-04-29T08:00:00.000Z",
    limit: 2,
    text: JSON.stringify({
      data: {
        cards: [
          {
            content: [
              {
                query: "AI 搜索产品更新",
                url: "/search?word=AI",
                index: 2,
                hotScore: "198000",
                hotTag: "热",
                desc: "多个平台讨论同一产品动作",
              },
            ],
          },
        ],
      },
    }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.provider, "baidu");
  assert.equal(items[0]?.title, "AI 搜索产品更新");
  assert.equal(items[0]?.rank, 2);
  assert.equal(items[0]?.heatValue, 198000);
  assert.equal(items[0]?.heatLabel, "热");
});

test("mapChineseHotspotItemsToCandidates preserves provider metadata", () => {
  const candidates = mapChineseHotspotItemsToCandidates([
    {
      provider: "zhihu",
      providerLabel: "知乎热榜",
      title: "独立开发者收入变化",
      url: "https://www.zhihu.com/question/1",
      rank: 5,
      heatValue: null,
      heatLabel: "新",
      summary: "讨论开始升温",
      capturedAt: "2026-04-29T08:00:00.000Z",
    },
  ]);

  assert.equal(candidates[0]?.sourceMeta?.provider, "zhihu");
  assert.equal(candidates[0]?.sourceMeta?.rank, 5);
  assert.equal(candidates[0]?.sourceMeta?.capturedAt, "2026-04-29T08:00:00.000Z");
  assert.match(candidates[0]?.summary || "", /知乎热榜/);
});
