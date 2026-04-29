import assert from "node:assert/strict";
import test from "node:test";

import { buildWritingStateFeedback } from "../article-outcome-runtime";
import type { ArticleStageArtifact } from "../article-stage-artifacts";

test("buildWritingStateFeedback records creative lens adoption against recommendation", () => {
  const now = new Date().toISOString();
  const feedback = buildWritingStateFeedback([
    {
      stageCode: "deepWriting",
      title: "深写作",
      status: "ready",
      summary: null,
      payload: {
        articlePrototype: "opinion",
        articlePrototypeLabel: "观点判断",
        stateVariantCode: "sharp_judgement",
        stateVariantLabel: "尖锐判断",
        creativeLensCode: "field_observation",
        creativeLensLabel: "现场观察镜头",
        creativeLensOptions: [
          {
            code: "sharp_opinion",
            label: "锐评判断镜头",
            isRecommended: true,
          },
          {
            code: "field_observation",
            label: "现场观察镜头",
          },
        ],
      },
      model: null,
      provider: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    } satisfies ArticleStageArtifact,
  ]);

  assert.equal(feedback?.recommendedCreativeLensCode, "sharp_opinion");
  assert.equal(feedback?.adoptedCreativeLensCode, "field_observation");
  assert.equal(feedback?.followedCreativeLensRecommendation, false);
});
