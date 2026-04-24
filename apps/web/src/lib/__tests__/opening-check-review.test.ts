import test from "node:test";
import assert from "node:assert/strict";

import {
  getOpeningCheckToneMeta,
  getOpeningDiagnoseRows,
  getOpeningRewriteDirections,
  resolveOpeningCheckStatus,
} from "../opening-check-review";

test("resolveOpeningCheckStatus prioritizes blocked over warning", () => {
  assert.deepEqual(
    resolveOpeningCheckStatus([
      { status: "warning" },
      { status: "blocked" },
      { status: "passed" },
    ]),
    {
      code: "blocked",
      label: "阻断",
      className: "text-warning",
    },
  );
});

test("getOpeningDiagnoseRows exposes four diagnose dimensions with labels", () => {
  const rows = getOpeningDiagnoseRows({
    abstractLevel: "danger",
    paddingLevel: "warn",
    hookDensity: "pass",
    informationFrontLoading: "warn",
  });

  assert.deepEqual(
    rows.map((item) => [item.key, item.dimensionLabel, item.level, item.className]),
    [
      ["abstractLevel", "抽象度", "danger", "text-warning"],
      ["paddingLevel", "铺垫冗余", "warn", "text-cinnabar"],
      ["hookDensity", "钩子密度", "pass", "text-emerald-700"],
      ["informationFrontLoading", "信息前置", "warn", "text-cinnabar"],
    ],
  );
});

test("getOpeningRewriteDirections prefers rewriteDirections and limits to two", () => {
  assert.deepEqual(
    getOpeningRewriteDirections({
      recommendedDirection: "推荐方向",
      rewriteDirections: ["方向一", "方向二", "方向三"],
    }),
    ["方向一", "方向二"],
  );
  assert.deepEqual(
    getOpeningRewriteDirections({
      recommendedDirection: "推荐方向",
      rewriteDirections: [],
    }),
    ["推荐方向"],
  );
});

test("getOpeningCheckToneMeta falls back to passed", () => {
  assert.deepEqual(getOpeningCheckToneMeta("warning"), {
    label: "警告",
    className: "text-cinnabar",
  });
  assert.deepEqual(getOpeningCheckToneMeta(undefined), {
    label: "通过",
    className: "text-emerald-700",
  });
});
