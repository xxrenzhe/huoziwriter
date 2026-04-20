import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTitleGuardChecks } from "../title-patterns";

test("evaluateTitleGuardChecks blocks forbidden titles", () => {
  const result = evaluateTitleGuardChecks({
    selectedTitle: "震惊：AI 写作的 3 个方法",
  });

  assert.equal(result.titleConfirmed, true);
  assert.deepEqual(result.titleForbiddenHits, ["震惊", "结论提前剧透"]);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0] ?? "", /标题命中禁止清单/);
  assert.equal(result.checks.find((item) => item.key === "title_forbidden")?.status, "blocked");
});

test("evaluateTitleGuardChecks warns on weak elements and outdated audit", () => {
  const result = evaluateTitleGuardChecks({
    selectedTitle: "写作，为什么更难了",
    titleAuditedAt: "2026-04-19T08:00:00.000Z",
    outlineUpdatedAt: "2026-04-20T08:00:00.000Z",
  });

  assert.equal(result.titleElementsHitCount, 1);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.checks.find((item) => item.key === "title_elements")?.status, "warning");
  assert.equal(result.checks.find((item) => item.key === "title_audit")?.status, "warning");
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /标题三要素命中不足 2 项/);
  assert.match(result.warnings[1] ?? "", /标题还没有按最新大纲做体检/);
});
