import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthorOutcomeFeedbackGuide } from "../generation";

test("buildAuthorOutcomeFeedbackGuide summarizes author-level recommendations concisely", () => {
  const guide = buildAuthorOutcomeFeedbackGuide({
    sampleCount: 4,
    positiveSampleCount: 3,
    prototypeSignals: [],
    stateVariantSignals: [],
    creativeLensSignals: [],
    openingPatternSignals: [],
    sectionRhythmSignals: [],
    recommendations: {
      prototype: {
        key: "opinion",
        label: "观点判断",
        sampleCount: 3,
        positiveSampleCount: 3,
        rankingAdjustment: -6,
        reason: "历史表现更稳。",
      },
      stateVariant: {
        key: "sharp_judgement",
        label: "尖锐判断",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "判断力度更稳。",
      },
      creativeLens: {
        key: "sharp_opinion",
        label: "锐评判断镜头",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "镜头更稳。",
      },
      openingPattern: {
        key: "冲突起手",
        label: "冲突起手",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "开头更稳。",
      },
      sectionRhythm: {
        key: "短段推进",
        label: "短段推进",
        sampleCount: 2,
        positiveSampleCount: 2,
        rankingAdjustment: -5,
        reason: "节奏更稳。",
      },
    },
    effectiveWritingProfile: null,
    updatedAt: new Date().toISOString(),
  });

  assert.match(guide, /作者级结果反馈/);
  assert.match(guide, /原型优先：观点判断/);
  assert.match(guide, /状态优先：尖锐判断/);
  assert.match(guide, /镜头优先：锐评判断镜头/);
  assert.match(guide, /开头优先：冲突起手/);
  assert.match(guide, /节奏优先：短段推进/);
  assert.match(guide, /不要硬套/);
});
