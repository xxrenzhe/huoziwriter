import assert from "node:assert/strict";
import test from "node:test";

import { getOutlineOpeningOptionCardClassName } from "../outline-opening-option-tone";

test("getOutlineOpeningOptionCardClassName uses danger styles when forbidden hits exist", () => {
  assert.equal(
    getOutlineOpeningOptionCardClassName({
      isSelected: false,
      forbiddenHits: ["D1 抽象空转"],
    }),
    "border-danger/30 bg-red-50 hover:border-danger/40 hover:bg-red-50",
  );
});

test("getOutlineOpeningOptionCardClassName keeps selected highlight when there is no forbidden hit", () => {
  assert.equal(
    getOutlineOpeningOptionCardClassName({
      isSelected: true,
      forbiddenHits: [],
    }),
    "border-cinnabar bg-surfaceWarning hover:border-cinnabar hover:bg-surfaceWarning",
  );
});
