import assert from "node:assert/strict";
import test from "node:test";

import { hydrateOutlineSelectionDraft } from "../../components/article-workspace/stage-selection-drafts";

test("hydrateOutlineSelectionDraft defaults to the recommended opening option", () => {
  const draft = hydrateOutlineSelectionDraft(
    {
      workingTitle: "当前标题",
      openingOptions: [
        { opening: "候选开头 A", isRecommended: false },
        { opening: "候选开头 B", isRecommended: true },
        { opening: "候选开头 C", isRecommended: false },
      ],
    },
    {
      selectedTitle: "",
      selectedTitleStyle: "",
      selectedOpeningHook: "",
      selectedTargetEmotion: "",
      selectedEndingStrategy: "",
    },
  );

  assert.equal(draft.selectedOpeningHook, "候选开头 B");
});

test("hydrateOutlineSelectionDraft preserves an author-selected opening hook", () => {
  const draft = hydrateOutlineSelectionDraft(
    {
      workingTitle: "当前标题",
      openingOptions: [
        { opening: "推荐开头", isRecommended: true },
        { opening: "作者改选开头", isRecommended: false },
      ],
    },
    {
      selectedTitle: "",
      selectedTitleStyle: "",
      selectedOpeningHook: "作者改选开头",
      selectedTargetEmotion: "",
      selectedEndingStrategy: "",
    },
  );

  assert.equal(draft.selectedOpeningHook, "作者改选开头");
});
