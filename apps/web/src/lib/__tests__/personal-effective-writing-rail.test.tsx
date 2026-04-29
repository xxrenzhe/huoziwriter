import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PersonalEffectiveWritingRail } from "../../components/article-workspace/personal-effective-writing-rail";

test("PersonalEffectiveWritingRail renders author-level recommendations in workspace rail", () => {
  const html = renderToStaticMarkup(
    <PersonalEffectiveWritingRail
      effectiveWritingProfile={{
        summary: "最近命中的稿件更适合直接起判断，再用短段推进展开。",
        updatedAt: "2026-04-28T00:00:00.000Z",
        opening: {
          key: "opening-conflict",
          label: "冲突起手",
          summary: "开头先把代价甩到读者眼前。",
          sampleCount: 6,
          positiveSampleCount: 4,
          confidence: "high",
          reason: "命中稿件里，这种开头更容易把读者拉进正文。",
        },
        judgement: null,
        rhythm: null,
        prototype: null,
      }}
    />,
  );

  assert.match(html, /个人有效写法/);
  assert.match(html, /最近命中的稿件更适合直接起判断/);
  assert.match(html, /冲突起手/);
  assert.match(html, /高置信/);
  assert.match(html, /样本 6/);
});

test("PersonalEffectiveWritingRail renders empty-state guidance when profile is unavailable", () => {
  const html = renderToStaticMarkup(<PersonalEffectiveWritingRail effectiveWritingProfile={null} />);

  assert.match(html, /结果样本还不够/);
  assert.match(html, /去补结果/);
  assert.match(html, /更适合他的开头、判断强度、段落节奏和文章原型/);
});
